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

  // Mirrors real tauri-plugin-fs v2 marshaling: exists/mkdir/read_file take
  // normal JSON args `{ path, options }`; write_file takes the bytes as the
  // request BODY (2nd invoke arg) with path/options in request HEADERS (3rd).
  const invoke = async (cmd, a, b) => {
    if (cmd === 'plugin:fs|exists') {
      const p = a && a.path; requireBaseDir15(a, cmd);
      calls.push({ cmd, path: p, baseDir: a.options.baseDir });
      return files.has(p) || dirs.has(p);
    }
    if (cmd === 'plugin:fs|mkdir') {
      const p = a && a.path; requireBaseDir15(a, cmd);
      if (!a.options || a.options.recursive !== true) throw new Error('mkdir: expected recursive:true');
      calls.push({ cmd, path: p, baseDir: a.options.baseDir });
      dirs.add(p); return true;
    }
    if (cmd === 'plugin:fs|read_file') {
      const p = a && a.path; requireBaseDir15(a, cmd);
      calls.push({ cmd, path: p, baseDir: a.options.baseDir });
      if (!files.has(p)) throw new Error('not found: ' + p);
      return files.get(p).slice(); // number[], like Tauri Vec<u8> over JSON
    }
    if (cmd === 'plugin:fs|write_file') {
      // Real plugin reads `path` from a request header; the JSON object form
      // ({ path, contents }) yields "missing file path". Enforce that here.
      const headers = (b && b.headers) || {};
      if (!headers.path) throw new Error('write_file: missing file path (request body+headers form required; JSON {path,contents} is rejected by the plugin)');
      const p = decodeURIComponent(headers.path);
      let opts = {};
      try { opts = JSON.parse(headers.options || '{}'); } catch (_) { throw new Error('write_file: options header must be JSON'); }
      if (opts.baseDir !== 15) throw new Error(`write_file: expected options.baseDir===15 in headers, got ${JSON.stringify(opts.baseDir)}`);
      let bytes = null;
      if (a instanceof Uint8Array) bytes = Array.from(a);
      else if (Array.isArray(a)) bytes = a.slice();
      else if (a && a.buffer) bytes = Array.from(new Uint8Array(a.buffer, a.byteOffset || 0, a.byteLength));
      if (!bytes) throw new Error('write_file: body must be bytes (Uint8Array)');
      files.set(p, bytes); writes.push(p);
      calls.push({ cmd, path: p, baseDir: opts.baseDir });
      return null;
    }
    // Mirrors the app-owned durable writer (archive_durable_write.rs). It is
    // CREATE-ONLY: there is no replacement parameter, and an occupied
    // destination is refused with a blocker code rather than throwing.
    if (cmd === 'h2o_archive_durable_write') {
      const opts = readOptions(b, 'durable_write');
      if ('existing' in opts) {
        throw new Error('durable_write: the create-only command must not carry a replacement policy');
      }
      const rel = String(opts.path || '');
      if (!rel || rel.startsWith('/') || rel.split('/').includes('..')) {
        throw new Error('durable_write: destination must be a contained archive-relative path: ' + rel);
      }
      // Mirrors the narrowed Rust authority: the create-only command admits
      // ONLY canonical CAS blobs. The JS module must never send anything else,
      // so a violation here is a loud harness failure, not a soft refusal.
      const shape = rel.match(/^assets\/([0-9a-f]{2})\/sha256-([0-9a-f]{64})$/);
      if (!shape || shape[2].slice(0, 2) !== shape[1]) {
        throw new Error('durable_write: create-only authority is CAS-scoped; refused: ' + rel);
      }
      // The Rust root is $APPLOCALDATA/archive, so the AppLocalData-relative
      // path the rest of the shim stores is the archive-root path plus that
      // prefix. Recording it keeps the layout assertion meaningful.
      const p = 'archive/' + rel;
      const bytes = readBody(a, 'durable_write');
      calls.push({ cmd, path: p, baseDir: null, viaArchiveRoot: true });
      if (files.has(p)) {
        return { schema: 'h2o.studio.archive.durable-write.v1', ok: false, committed: false, durabilityComplete: false, replaced: false, blockers: [{ code: 'durable-write-destination-exists' }] };
      }
      files.set(p, bytes); writes.push(p);
      return { schema: 'h2o.studio.archive.durable-write.v1', ok: true, committed: true, durabilityComplete: true, replaced: false, byteLength: bytes.length, fullFsync: true, blockers: [] };
    }
    // Mirrors h2o_archive_cas_repair_write: BYTES ONLY. The destination is
    // derived here from a hash computed over the body, exactly as the trusted
    // Rust side does — the caller supplies no path, shard or basename.
    if (cmd === 'h2o_archive_cas_repair_write') {
      const opts = readOptions(b, 'cas_repair', /* required */ false);
      for (const forbidden of ['path', 'destination', 'shard', 'basename']) {
        if (forbidden in opts) {
          throw new Error(`cas_repair: caller must not be able to name a destination (${forbidden})`);
        }
      }
      const bytes = readBody(a, 'cas_repair');
      const hex = sha256HexNode(Uint8Array.from(bytes));
      if (opts.expectedSha256 != null && String(opts.expectedSha256) !== '') {
        const asserted = String(opts.expectedSha256).toLowerCase().replace(/^sha256-/, '');
        if (!/^[0-9a-f]{64}$/.test(asserted)) {
          return { schema: 'h2o.studio.archive.cas-repair-write.v1', ok: false, blockers: [{ code: 'cas-repair-expected-sha-malformed' }] };
        }
        if (asserted !== hex) {
          return { schema: 'h2o.studio.archive.cas-repair-write.v1', ok: false, blockers: [{ code: 'cas-repair-expected-sha-mismatch' }] };
        }
      }
      const p = `archive/assets/${hex.slice(0, 2)}/sha256-${hex}`;
      calls.push({ cmd, path: p, baseDir: null, viaArchiveRoot: true });
      const existing = files.get(p);
      const alreadyValid = !!existing && existing.length === bytes.length
        && sha256HexNode(Uint8Array.from(existing)) === hex;
      if (alreadyValid) {
        return { schema: 'h2o.studio.archive.cas-repair-write.v1', ok: true, alreadyValid: true, repaired: false, committed: false, durabilityComplete: false, sha256: 'sha256-' + hex, path: p.slice('archive/'.length), byteLength: bytes.length, blockers: [] };
      }
      files.set(p, bytes); writes.push(p);
      return { schema: 'h2o.studio.archive.cas-repair-write.v1', ok: true, alreadyValid: false, repaired: !!existing, committed: true, durabilityComplete: true, sha256: 'sha256-' + hex, path: p.slice('archive/'.length), byteLength: bytes.length, fullFsync: true, blockers: [] };
    }
    throw new Error('shim: unhandled invoke command: ' + cmd);
  };

  function readOptions(b, label, required = true) {
    const headers = (b && b.headers) || {};
    if (!headers.options) {
      if (required) throw new Error(`${label}: missing options header`);
      return {};
    }
    try { return JSON.parse(decodeURIComponent(headers.options)); }
    catch (_) { throw new Error(`${label}: options header must be percent-encoded JSON`); }
  }

  function readBody(a, label) {
    if (a instanceof Uint8Array) return Array.from(a);
    if (Array.isArray(a)) return a.slice();
    if (a && a.buffer) return Array.from(new Uint8Array(a.buffer, a.byteOffset || 0, a.byteLength));
    throw new Error(`${label}: body must be bytes (Uint8Array)`);
  }

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
    for (const m of ['putAssetBytes', 'getAssetBytes', 'readVerifiedAssetBytes', 'exists', 'describe', 'diagnoseAssetCas']) {
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

  await checkAsync('blob bytes are committed through the durable writer, in the body+headers form', async () => {
    // putAssetBytes above must have committed via the body+headers form (the
    // shim only accepts that form), so a write was recorded.
    assert.ok(shim.writes.length >= 1, 'putAssetBytes must commit via the body+headers form');
    const durable = shim.calls.filter((c) => c.cmd === 'h2o_archive_durable_write');
    assert.ok(durable.length >= 1, 'the first write must go through h2o_archive_durable_write');
    assert.ok(
      shim.calls.every((c) => c.cmd !== 'plugin:fs|write_file'),
      'the CAS must not commit blobs through the non-durable plugin write',
    );
    // Regression guard for the real "missing file path" failure: the legacy
    // JSON object form must still be rejected exactly like the real plugin.
    await assert.rejects(
      () => shim.invoke('plugin:fs|write_file', { path: 'archive/assets/aa/sha256-x', contents: [1, 2, 3], options: { baseDir: 15 } }),
      /missing file path/i,
    );
    // The durable command likewise refuses a body without an options header.
    await assert.rejects(
      () => shim.invoke('h2o_archive_durable_write', new Uint8Array([1]), {}),
      /missing options header/i,
    );
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

  check('every call stays in the archive/assets layout; none touch the sync folder', () => {
    assert.ok(shim.calls.length > 0);
    for (const c of shim.calls) {
      if (c.viaArchiveRoot) {
        // The durable writer is admitted by its own archive root rather than a
        // baseDir, so it carries no baseDir by design.
        assert.equal(c.baseDir, null, `${c.cmd} must be root-admitted, not baseDir-scoped`);
      } else {
        assert.equal(c.baseDir, 15, `fs call ${c.cmd} did not use baseDir 15`);
      }
      assert.doesNotMatch(String(c.path || ''), /H2O Studio Sync/, 'must not touch the sync folder');
      assert.match(String(c.path || ''), /^archive\/assets(\/|$)/, `unexpected path: ${c.path}`);
    }
  });

  check('only exists/read_file plus the durable writer were invoked (G1: no renderer mkdir, no remove/rename/gc)', () => {
    const cmds = [...new Set(shim.calls.map((c) => c.cmd))].sort();
    // G1 cutover: the renderer no longer issues plugin:fs|mkdir. The trusted
    // durable-write command creates its own ancestors and shard
    // descriptor-relatively, and after the capability narrowing the renderer
    // holds no mkdir authority under archive/** at all.
    assert.deepEqual(cmds, ['h2o_archive_durable_write', 'plugin:fs|exists', 'plugin:fs|read_file']);
  });

  check('G1: the CAS module issues no filesystem MUTATION command at all', () => {
    const src = readRepo(MODULE_REL);
    for (const forbidden of ['plugin:fs|mkdir', 'plugin:fs|write_file', 'plugin:fs|remove', 'plugin:fs|rename', 'plugin:fs|open']) {
      assert.ok(!src.includes(forbidden), `CAS must not invoke ${forbidden} after the G1 cutover`);
    }
  });

  // ── Integrity: a hash-addressed path is trusted only after its bytes prove
  // it. Each case uses a fresh module instance so counters are unambiguous.
  await checkAsync('a truncated object at the destination is repaired, not reported as dedupe', async () => {
    const cas = loadCas();
    const bytes = new TextEncoder().encode('truncation victim');
    const hex = sha256HexNode(bytes);
    const p = `archive/assets/${hex.slice(0, 2)}/sha256-${hex}`;
    cas.shim.files.set(p, Array.from(bytes).slice(0, 3)); // torn write

    const put = await cas.api.putAssetBytes({ bytes });
    assert.equal(put.deduped, false, 'a truncated object must not dedupe');
    assert.equal(put.repaired, true, 'repair must be reported on the descriptor');
    assert.equal(put.wrote, true);
    assert.deepEqual(cas.shim.files.get(p), Array.from(bytes), 'destination must hold the correct bytes');
    const d = cas.api.diagnoseAssetCas();
    assert.equal(d.repairCount, 1);
    assert.equal(d.mismatchCount, 1);
    assert.equal(d.dedupeCount, 0);
  });

  await checkAsync('wrong bytes standing at the hash-derived path are repaired', async () => {
    const cas = loadCas();
    const bytes = new TextEncoder().encode('authentic content');
    const hex = sha256HexNode(bytes);
    const p = `archive/assets/${hex.slice(0, 2)}/sha256-${hex}`;
    cas.shim.files.set(p, Array.from(new TextEncoder().encode('planted content of equal-ish size')));

    const put = await cas.api.putAssetBytes({ bytes });
    assert.equal(put.repaired, true);
    assert.equal(put.verified, true);
    assert.deepEqual(cas.shim.files.get(p), Array.from(bytes));
    assert.equal(cas.api.diagnoseAssetCas().repairCount, 1);
  });

  await checkAsync('a valid existing object still dedupes without any write', async () => {
    const cas = loadCas();
    const bytes = new TextEncoder().encode('already correct');
    const hex = sha256HexNode(bytes);
    const p = `archive/assets/${hex.slice(0, 2)}/sha256-${hex}`;
    cas.shim.files.set(p, Array.from(bytes));

    const put = await cas.api.putAssetBytes({ bytes });
    assert.equal(put.deduped, true);
    assert.equal(put.wrote, false);
    assert.equal(put.repaired, false);
    assert.equal(cas.shim.writes.length, 0, 'a verified dedupe must not write');
    const d = cas.api.diagnoseAssetCas();
    assert.equal(d.repairCount, 0);
    assert.equal(d.dedupeCount, 1);
  });

  await checkAsync('a lost write race verifies the winner: valid winner dedupes, invalid winner is repaired', async () => {
    // Winner is valid: the durable write returns destination-exists and the
    // module must verify rather than assume.
    const good = loadCas();
    const bytes = new TextEncoder().encode('race payload');
    const hex = sha256HexNode(bytes);
    const p = `archive/assets/${hex.slice(0, 2)}/sha256-${hex}`;
    const realGoodInvoke = good.shim.invoke;
    good.sandbox.__TAURI_INTERNALS__.invoke = async (cmd, a, b) => {
      if (cmd === 'plugin:fs|exists') { const r = await realGoodInvoke(cmd, a, b); if (!r) good.shim.files.set(p, Array.from(bytes)); return r; }
      return realGoodInvoke(cmd, a, b);
    };
    const dedupedPut = await good.api.putAssetBytes({ bytes });
    assert.equal(dedupedPut.deduped, true, 'a valid race winner must dedupe');
    assert.equal(dedupedPut.repaired, false);

    // Winner is corrupt: the same lost race must repair instead of trusting it.
    const bad = loadCas();
    const realBadInvoke = bad.shim.invoke;
    bad.sandbox.__TAURI_INTERNALS__.invoke = async (cmd, a, b) => {
      if (cmd === 'plugin:fs|exists') { const r = await realBadInvoke(cmd, a, b); if (!r) bad.shim.files.set(p, [1, 2, 3]); return r; }
      return realBadInvoke(cmd, a, b);
    };
    const repairedPut = await bad.api.putAssetBytes({ bytes });
    assert.equal(repairedPut.repaired, true, 'a corrupt race winner must be repaired');
    assert.deepEqual(bad.shim.files.get(p), Array.from(bytes));
  });

  await checkAsync('a refused durable write surfaces instead of reporting success', async () => {
    const cas = loadCas();
    const bytes = new TextEncoder().encode('refused payload');
    const realInvoke = cas.shim.invoke;
    cas.sandbox.__TAURI_INTERNALS__.invoke = async (cmd, a, b) => {
      if (cmd === 'h2o_archive_durable_write') {
        return { ok: false, wrote: false, blockers: [{ code: 'durable-write-parent-symlink' }] };
      }
      return realInvoke(cmd, a, b);
    };
    await assert.rejects(() => cas.api.putAssetBytes({ bytes }), /durable write refused/i);
    assert.equal(cas.shim.writes.length, 0, 'a refused write must not mutate the store');
  });

  await checkAsync('readVerifiedAssetBytes returns verified bytes, null when absent, and throws on corruption', async () => {
    const cas = loadCas();
    const bytes = new TextEncoder().encode('verified read');
    const hex = sha256HexNode(bytes);
    const p = `archive/assets/${hex.slice(0, 2)}/sha256-${hex}`;
    await cas.api.putAssetBytes({ bytes });

    const got = await cas.api.readVerifiedAssetBytes('sha256-' + hex);
    assert.deepEqual([...got], [...bytes]);
    assert.equal(await cas.api.readVerifiedAssetBytes('sha256-' + 'a'.repeat(64)), null, 'absent must read as null');

    cas.shim.files.set(p, [9, 9, 9]); // corrupt underneath the reader
    await assert.rejects(
      () => cas.api.readVerifiedAssetBytes('sha256-' + hex),
      /failed verification/i,
      'a corrupt object must never read as a missing one',
    );
  });

  // ── Replacement authority is CAS-scoped (T06) ────────────────────────────
  await checkAsync('the create-only write carries no replacement policy and repair carries no destination', async () => {
    const cas = loadCas();
    const bytes = new TextEncoder().encode('authority probe');
    const hex = sha256HexNode(bytes);
    const p = `archive/assets/${hex.slice(0, 2)}/sha256-${hex}`;

    await cas.api.putAssetBytes({ bytes });
    const writeCalls = cas.shim.calls.filter((c) => c.cmd === 'h2o_archive_durable_write');
    assert.ok(writeCalls.length >= 1, 'the first write must use the create-only command');

    // Force a repair so the repair command is exercised.
    cas.shim.files.set(p, [0, 1, 2]);
    const repaired = await cas.api.putAssetBytes({ bytes });
    assert.equal(repaired.repaired, true);
    const repairCalls = cas.shim.calls.filter((c) => c.cmd === 'h2o_archive_cas_repair_write');
    assert.equal(repairCalls.length, 1, 'repair must go through the CAS-scoped command');
    // The shim throws if either command is sent a forbidden field, so reaching
    // here already proves no `existing` policy and no destination were sent.
    assert.equal(repairCalls[0].path, p, 'the repair destination is derived, not supplied');
  });

  check('the module never sends a destination or a replacement policy to the trusted side', () => {
    const src = readRepo(MODULE_REL);
    // The repair call site must pass bytes + an assertion only.
    assert.match(src, /casRepairWrite\(u8,\s*descriptor\.sha256\)/, 'repair must send bytes + hash assertion only');
    assert.doesNotMatch(src, /CAS_REPAIR_COMMAND[\s\S]{0,400}?path:/, 'the repair options must not carry a path');
    assert.doesNotMatch(src, /existing:\s*['"]replace['"]/, 'no caller-selected replacement policy may remain');
    assert.doesNotMatch(src, /durableWrite\([^)]*,\s*['"](fail|replace)['"]\s*\)/, 'the create-only writer takes no policy argument');
  });

  await checkAsync('a committed-but-unfenced write is not rewritten', async () => {
    const cas = loadCas();
    const bytes = new TextEncoder().encode('durability incomplete');
    const realInvoke = cas.shim.invoke;
    cas.sandbox.__TAURI_INTERNALS__.invoke = async (cmd, a, b) => {
      const out = await realInvoke(cmd, a, b);
      // The bytes really are committed; only the directory fence failed.
      if (cmd === 'h2o_archive_durable_write' && out && out.committed) {
        return Object.assign({}, out, {
          ok: false,
          durabilityComplete: false,
          blockers: [{ code: 'durable-write-parent-sync-failed' }],
        });
      }
      return out;
    };
    const put = await cas.api.putAssetBytes({ bytes });
    assert.equal(put.wrote, true, 'a committed write must be reported as written');
    assert.equal(put.durabilityComplete, false, 'incomplete durability must be surfaced');
    assert.equal(
      cas.shim.writes.length,
      1,
      'the caller must not write a second time because the fence failed',
    );
  });

  // ── The re-verification guards are load-bearing (T09) ────────────────────
  // Headline invariant: no put/repair/dedupe success may be returned unless
  // the canonical object is PROVEN to hold the expected bytes. The shim
  // normally stores exactly what it is handed, which makes the "trusted side
  // reported success but the disk is wrong" branches unreachable — so these
  // fixtures make the trusted side lie.
  await checkAsync('a committed write whose canonical object is wrong is refused, not reported as success', async () => {
    const cas = loadCas();
    const bytes = new TextEncoder().encode('post-commit guard probe');
    const hex = sha256HexNode(bytes);
    const p = `archive/assets/${hex.slice(0, 2)}/sha256-${hex}`;
    const realInvoke = cas.shim.invoke;
    cas.sandbox.__TAURI_INTERNALS__.invoke = async (cmd, a, b) => {
      const out = await realInvoke(cmd, a, b);
      if (cmd === 'h2o_archive_durable_write' && out && out.committed) {
        // The trusted side claims full success while the disk holds garbage.
        cas.shim.files.set(p, [9, 9, 9]);
      }
      return out;
    };
    await assert.rejects(
      () => cas.api.putAssetBytes({ bytes }),
      /committed CAS object failed verification/,
      'success without proven canonical content must be refused',
    );
    const d = cas.api.diagnoseAssetCas();
    assert.equal(d.writeCount, 0, 'a refused commit must not count as a write');
    assert.equal(d.mismatchCount, 1, 'the mismatch must be recorded');
  });

  await checkAsync('a repair whose canonical object is still wrong is refused, not reported as repaired', async () => {
    const cas = loadCas();
    const bytes = new TextEncoder().encode('post-repair guard probe');
    const hex = sha256HexNode(bytes);
    const p = `archive/assets/${hex.slice(0, 2)}/sha256-${hex}`;
    cas.shim.files.set(p, [1, 2, 3]); // corrupt object triggers the repair path
    const realInvoke = cas.shim.invoke;
    cas.sandbox.__TAURI_INTERNALS__.invoke = async (cmd, a, b) => {
      if (cmd === 'h2o_archive_cas_repair_write') {
        // The trusted side claims the repair landed but never fixes the disk.
        return { schema: 'h2o.studio.archive.cas-repair-write.v1', ok: true, alreadyValid: false, repaired: true, committed: true, durabilityComplete: true, sha256: 'sha256-' + hex, byteLength: bytes.length, blockers: [] };
      }
      return realInvoke(cmd, a, b);
    };
    await assert.rejects(
      () => cas.api.putAssetBytes({ bytes }),
      /repaired CAS object failed verification/,
      'a repair success without proven canonical content must be refused',
    );
    const d = cas.api.diagnoseAssetCas();
    assert.equal(d.repairCount, 0, 'a refused repair must not count as a repair');
    assert.deepEqual(cas.shim.files.get(p), [1, 2, 3], 'the caller must not paper over the lie with its own write');
  });

  await checkAsync('a lying alreadyValid over a still-corrupt object is refused, not deduped', async () => {
    const cas = loadCas();
    const bytes = new TextEncoder().encode('stale alreadyValid probe');
    const hex = sha256HexNode(bytes);
    const p = `archive/assets/${hex.slice(0, 2)}/sha256-${hex}`;
    cas.shim.files.set(p, [4, 5, 6]);
    const realInvoke = cas.shim.invoke;
    cas.sandbox.__TAURI_INTERNALS__.invoke = async (cmd, a, b) => {
      if (cmd === 'h2o_archive_cas_repair_write') {
        // The trusted side asserts the object was already correct. It is not.
        return { schema: 'h2o.studio.archive.cas-repair-write.v1', ok: true, alreadyValid: true, repaired: false, committed: false, durabilityComplete: false, sha256: 'sha256-' + hex, byteLength: bytes.length, blockers: [] };
      }
      return realInvoke(cmd, a, b);
    };
    await assert.rejects(
      () => cas.api.putAssetBytes({ bytes }),
      /repaired CAS object failed verification/,
      'the re-verify must run BEFORE alreadyValid is honoured',
    );
    const d = cas.api.diagnoseAssetCas();
    assert.equal(d.dedupeCount, 0, 'a lying alreadyValid must never become a dedupe');
  });

  // ── DP-PRE-M05-ASSET-BOUND: 32 MiB per newly ingested asset ──────────────
  const ASSET_CAP = 33554432;

  check('the governed cap is exposed as a single named authority value', () => {
    assert.equal(api.assetBlobCapBytes, ASSET_CAP, 'assetCas must publish the canonical value');
    assert.equal(api.diagnoseAssetCas().assetBlobCapBytes, ASSET_CAP);
    const src = readRepo(MODULE_REL);
    // Exactly one numeric literal, on the constant definition.
    const literals = src.match(/33554432/g) || [];
    assert.equal(literals.length, 1, 'the numeric literal must not be scattered');
    assert.match(src, /var GOVERNED_ASSET_BLOB_CAP_BYTES = 33554432;/);
    // Cross-language agreement: the trusted side is the authority, and a drift
    // between the two constants would make JS admit what Rust refuses (a
    // permanent, silent save failure) or vice versa.
    const rust = readRepo('apps/studio/desktop/src-tauri/src/archive_durable_write.rs');
    assert.match(
      rust,
      /pub const GOVERNED_ASSET_BLOB_CAP_BYTES: u64 = 33_554_432;/,
      'the Rust authority must govern the same 32 MiB value',
    );
  });

  await checkAsync('exactly at and one byte under the cap are accepted', async () => {
    const cas = loadCas();
    // A 32 MiB body converted to a number array would be ~33M elements, so the
    // durable write is stubbed to keep the Uint8Array intact; everything before
    // it (the bound check, hashing, path derivation) is the module's real code.
    const realInvoke = cas.shim.invoke;
    const bodyLengths = [];
    cas.sandbox.__TAURI_INTERNALS__.invoke = async (cmd, a, b) => {
      if (cmd === 'h2o_archive_durable_write') {
        bodyLengths.push(a.length);
        const opts = JSON.parse(decodeURIComponent(b.headers.options));
        cas.shim.files.set('archive/' + opts.path, a);
        return { ok: true, committed: true, durabilityComplete: true, replaced: false, byteLength: a.length, blockers: [] };
      }
      return realInvoke(cmd, a, b);
    };
    for (const n of [ASSET_CAP - 1, ASSET_CAP]) {
      const out = await cas.api.putAssetBytes({ bytes: new Uint8Array(n) });
      assert.equal(out.wrote, true, `${n} bytes must be accepted`);
      assert.equal(out.byteLength, n);
    }
    assert.deepEqual(bodyLengths, [ASSET_CAP - 1, ASSET_CAP], 'both sizes must reach the writer');
    assert.equal(cas.api.diagnoseAssetCas().oversizeRejectCount, 0);
  });

  await checkAsync('one byte over the cap is refused before any hashing or write', async () => {
    const cas = loadCas();
    let invoked = 0;
    const realInvoke = cas.shim.invoke;
    cas.sandbox.__TAURI_INTERNALS__.invoke = async (cmd, a, b) => { invoked += 1; return realInvoke(cmd, a, b); };

    await assert.rejects(
      () => cas.api.putAssetBytes({ bytes: new Uint8Array(ASSET_CAP + 1) }),
      /exceeds the governed ingest bound/,
    );
    assert.equal(invoked, 0, 'an oversized asset must not reach the filesystem at all');
    assert.equal(cas.shim.writes.length, 0, 'no CAS object may be created');
    assert.equal(cas.shim.files.size, 0, 'nothing may be stored');
    const d = cas.api.diagnoseAssetCas();
    assert.equal(d.oversizeRejectCount, 1, 'the refusal must be reported');
    assert.equal(d.putCount, 0, 'a refused put must not count as a put');
    assert.equal(d.writeCount, 0);
    assert.equal(d.repairCount, 0, 'an oversized asset must never trigger repair');
  });

  await checkAsync('caller-supplied byteLength is never the enforcement authority', async () => {
    const cas = loadCas();
    // Oversized CLAIM, small actual bytes → must be accepted (claim ignored).
    const small = new TextEncoder().encode('small actual bytes');
    const ok = await cas.api.putAssetBytes({ bytes: small, byteLength: ASSET_CAP + 1 });
    assert.equal(ok.wrote, true, 'an oversized claim must not falsely reject small bytes');
    assert.equal(ok.byteLength, small.length, 'byteLength is derived, never echoed from the caller');

    // Small CLAIM, oversized actual bytes → must still be refused.
    await assert.rejects(
      () => cas.api.putAssetBytes({ bytes: new Uint8Array(ASSET_CAP + 1), byteLength: 10 }),
      /exceeds the governed ingest bound/,
      'a small claim must not smuggle oversized bytes past the bound',
    );
  });

  check('the bound is an ingest ceiling, never a read ceiling', () => {
    const src = readRepo(MODULE_REL);
    // The cap must be consulted only on the put path.
    const guardUses = (src.match(/GOVERNED_ASSET_BLOB_CAP_BYTES/g) || []).length;
    assert.ok(guardUses >= 4, 'constant should be defined, enforced, diagnosed and exposed');
    for (const readFn of ['async function getAssetBytes', 'async function readVerifiedAssetBytes', 'async function describe', 'async function verifyBlobAt']) {
      const start = src.indexOf(readFn);
      assert.ok(start > 0, `${readFn} not found`);
      const body = src.slice(start, src.indexOf('\n  }', start));
      assert.doesNotMatch(
        body,
        /GOVERNED_ASSET_BLOB_CAP_BYTES/,
        `${readFn} must not apply the ingest cap — historical oversized objects stay readable`,
      );
    }
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
    assert.equal(d.durableWrites, true);
    assert.equal(d.putTrustsPathExistence, false);
    assert.ok(d.writeCount >= 1 && d.dedupeCount >= 1);
    assert.ok(d.verifyCount >= 1, 'puts must verify bytes');
    assert.equal(d.repairCount, 0, 'the healthy path must not report repairs');
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
