#!/usr/bin/env node
// Validator for the D.2C saved-chat archive request materializer.
//
// Static-checks the module boundaries + runs behavioral tests in a Node VM with
// an in-memory queue (mock plugin:sql) and mock resolve/writer ingestion APIs.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..', '..', '..');
const MODULE_REL = 'src-surfaces-base/studio/ingestion/saved-chat-archive-materializer.tauri.js';
const STUDIO_HTML_REL = 'src-surfaces-base/studio/studio.html';
const PACK_REL = 'tools/product/studio/pack-studio.mjs';

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
function stripComments(src) {
  return String(src).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const src = readRepo(MODULE_REL);
const code = stripComments(src);
const studioHtml = readRepo(STUDIO_HTML_REL);
const pack = readRepo(PACK_REL);

console.log('[archive-materializer] static checks');

check('module exists and registers materializeSavedChatArchiveRequestV1 under ingestion', () => {
  assert.ok(fs.existsSync(path.join(REPO_ROOT, MODULE_REL)));
  assert.match(src, /H2O\.Studio\.ingestion\.materializeSavedChatArchiveRequestV1\s*=/);
  assert.match(src, /if \(!detectTauri\(\)\) return;/);
});

check('only `validated` is eligible; `written` -> already-written; else not-eligible; not-found path', () => {
  // status constants: STATUS_VALIDATED='validated', STATUS_WRITTEN='written'
  assert.match(code, /STATUS_VALIDATED\s*=\s*['"]validated['"]/);
  assert.match(code, /STATUS_WRITTEN\s*=\s*['"]written['"]/);
  // eligibility gate: written short-circuits, anything other than validated is
  // not-eligible (so only validated falls through to materialization), and the
  // re-resolution must also be validated before writing.
  assert.match(code, /previousStatus\s*!==\s*STATUS_VALIDATED/);
  assert.match(code, /previousStatus\s*===\s*STATUS_WRITTEN/);
  assert.match(code, /reStatus\s*!==\s*STATUS_VALIDATED/);
  assert.ok(code.includes("'already-written'") || code.includes('"already-written"'));
  assert.ok(code.includes("'not-eligible'") || code.includes('"not-eligible"'));
  assert.ok(code.includes("'not-found'") || code.includes('"not-found"'));
});

check('re-resolution before write + the validated->writing->written and writing->failed transitions exist', () => {
  assert.match(code, /resolveSavedChatArchiveRequestV1\s*\(/);
  for (const s of ['validated', 'writing', 'written', 'failed', 'needs-desktop-snapshot', 'db-unavailable']) {
    assert.ok(code.includes("'" + s + "'") || code.includes('STATUS_' + s.toUpperCase().replace(/-/g, '_')), `status missing: ${s}`);
  }
  // transitions: updates to writing, written, failed
  assert.match(code, /STATUS_WRITING/);
  assert.match(code, /STATUS_WRITTEN/);
  assert.match(code, /STATUS_FAILED/);
});

check('writeSavedChatPackageV1 is called once, with snapshotId + overwrite:false, and no request/package content', () => {
  const callMatch = code.match(/writeSavedChatPackageV1\s*\(\s*\{[^}]*\}\s*\)/);
  assert.ok(callMatch, 'writer call not found');
  const callArgs = callMatch[0];
  assert.match(callArgs, /snapshotId\s*:/);
  assert.match(callArgs, /overwrite\s*:\s*false/);
  // must NOT pass any non-authoritative package source / Chrome content
  for (const banned of ['targetDir', 'targetFolder', 'packagePath', 'manifest', 'contentHash', 'snapshot:', 'html', 'assets', 'envelope', 'request:', 'payload', 'normalized']) {
    assert.ok(!callArgs.includes(banned), `writer call leaked source field: ${banned}`);
  }
  // exactly one writer call site
  assert.equal((code.match(/writeSavedChatPackageV1\s*\(/g) || []).length, 1, 'writer must be called exactly once');
});

check('overwrite defaults false in the API surface', () => {
  assert.match(src, /materializeSavedChatArchiveRequestV1\([^)]*overwrite\s*=\s*false/);
});

check('queue writes target ONLY saved_chat_archive_requests; no migration/other tables', () => {
  // The only write keyword in the module is UPDATE, built as ('UPDATE ' + QUEUE_TABLE).
  assert.match(code, /var QUEUE_TABLE\s*=\s*['"]saved_chat_archive_requests['"]/);
  assert.doesNotMatch(code, /\bINSERT\s+INTO\b|\bDELETE\s+FROM\b|\bUPSERT\b/i, 'no INSERT/DELETE in D.2C');
  // every UPDATE must reference the queue table (directly or via QUEUE_TABLE)
  const updates = code.match(/UPDATE\b[^\n]{0,50}/gi) || [];
  for (const u of updates) {
    assert.ok(/QUEUE_TABLE/.test(u) || /saved_chat_archive_requests/i.test(u), `UPDATE targets a non-queue table: ${u}`);
  }
  assert.doesNotMatch(code, /CREATE\s+TABLE|ALTER\s+TABLE|plugin:sql\|load|MigrationKind/i, 'no migration in D.2C');
  assert.match(code, /materialization/);
});

check('no Chrome/sync/import/recovery/UI/CAS-write coupling', () => {
  for (const banned of [
    'H2O.Studio.sync', 'webdav', 'service-worker', 'serviceWorker', 'chrome.runtime',
    'importSavedChat', 'recoverSavedChat', 'archiveHealthUi',
    'putAssetBytes', 'getAssetBytes', 'store.chats', 'store.snapshots', 'store.assets',
    'plugin:fs|write', 'capabilities',
  ]) {
    assert.ok(!code.includes(banned), `forbidden coupling: ${banned}`);
  }
});

check('module is loaded in studio.html and packed', () => {
  assert.ok(studioHtml.includes('./ingestion/saved-chat-archive-materializer.tauri.js'), 'studio.html missing loader');
  const count = (pack.match(/ingestion\/saved-chat-archive-materializer\.tauri\.js/g) || []).length;
  assert.ok(count >= 2, `expected source + mirror pack entries, got ${count}`);
});

console.log('[archive-materializer] behavioral checks');

// In-memory queue + mock ingestion, loaded into a VM that satisfies the Tauri gate.
function loadFixture({ row, resolveResult, writerResult, writerThrows } = {}) {
  const queue = new Map();
  if (row) queue.set(row.request_id, { ...row });
  const sqlCalls = [];
  const invoke = async (cmd, args) => {
    const q = (args && args.query) || '';
    const v = (args && args.values) || [];
    sqlCalls.push({ cmd, query: q, values: v });
    if (cmd === 'plugin:sql|select') {
      const m = q.match(/WHERE request_id = \?/);
      const r = m ? queue.get(v[0]) : null;
      return r ? [{ ...r }] : [];
    }
    if (cmd === 'plugin:sql|execute') {
      assert.match(q, /UPDATE saved_chat_archive_requests/, 'only the queue table may be written');
      // columns are status, updated_at, meta_json [, snapshot_id], request_id (last)
      const reqId = v[v.length - 1];
      const cur = queue.get(reqId);
      if (cur) {
        cur.status = v[0];
        cur.updated_at = v[1];
        cur.meta_json = v[2];
        if (v.length === 5) cur.snapshot_id = v[3];
      }
      return [1, 0];
    }
    throw new Error('unexpected invoke: ' + cmd);
  };

  const writerCalls = [];
  const context = {
    console,
    JSON, Date, String, Number, Array, Object, RegExp,
    __TAURI_INTERNALS__: { invoke },
    H2O: {
      Studio: {
        ingestion: {
          resolveSavedChatArchiveRequestV1: async (normalized) => resolveResult,
          writeSavedChatPackageV1: async (opts) => {
            writerCalls.push(opts);
            if (writerThrows) throw new Error(writerThrows);
            return writerResult;
          },
        },
      },
    },
  };
  context.globalThis = context;
  const sandbox = vm.createContext(context);
  vm.runInContext(src, sandbox, { filename: MODULE_REL });
  const api = sandbox.H2O.Studio.ingestion.materializeSavedChatArchiveRequestV1;
  if (typeof api !== 'function') throw new Error('materialize API did not register');
  return { api, queue, sqlCalls, writerCalls };
}

function validatedRow() {
  return {
    request_id: 'req_1',
    status: 'validated',
    snapshot_id: 'snap_1',
    studio_chat_id: 'chat_1',
    normalized_request_json: JSON.stringify({ schema: 'h2o.savedChatArchiveRequest.v1', desktopResolution: { studioChatId: 'chat_1', snapshotId: 'snap_1' }, source: {} }),
    meta_json: '{}',
  };
}

await checkAsync('validated row + writer success -> written, package persisted, writer called once', async () => {
  const fx = loadFixture({
    row: validatedRow(),
    resolveResult: { status: 'validated', ok: true, resolution: { snapshotId: 'snap_1' } },
    writerResult: { packagePath: 'archive/packages/chat_1.h2ochat', schemaVersion: 2, payloadVersion: 2, contentHash: 'sha256-' + 'a'.repeat(64), snapshotId: 'snap_1', written: true, writtenAt: '2026-06-24T00:00:00.000Z' },
  });
  const r = await fx.api({ requestId: 'req_1' });
  assert.equal(r.status, 'written');
  assert.equal(r.ok, true);
  assert.equal(r.previousStatus, 'validated');
  assert.equal(r.chromeRuntime, false);
  assert.equal(r.syncTransport, false);
  assert.equal(r.package.packagePath, 'archive/packages/chat_1.h2ochat');
  assert.equal(r.package.contentHash, 'sha256-' + 'a'.repeat(64));
  assert.equal(r.package.schemaVersion, 2);
  assert.equal(r.package.payloadVersion, 2);
  assert.equal(fx.writerCalls.length, 1, 'writer called exactly once');
  assert.deepEqual(Object.keys(fx.writerCalls[0]).sort(), ['overwrite', 'snapshotId']);
  assert.equal(fx.writerCalls[0].snapshotId, 'snap_1');
  assert.equal(fx.writerCalls[0].overwrite, false);
  // queue ended at written with materialization persisted
  const stored = fx.queue.get('req_1');
  assert.equal(stored.status, 'written');
  const mat = JSON.parse(stored.meta_json).materialization;
  assert.equal(mat.packagePath, 'archive/packages/chat_1.h2ochat');
  assert.equal(mat.contentHash, 'sha256-' + 'a'.repeat(64));
  assert.ok(mat.processingStartedAt && mat.processingFinishedAt);
  assert.equal(mat.overwrite, false);
  // transitioned through writing then written (two execute calls)
  const writes = fx.sqlCalls.filter((c) => c.cmd === 'plugin:sql|execute');
  assert.equal(writes.length, 2);
  assert.equal(writes[0].values[0], 'writing');
  assert.equal(writes[1].values[0], 'written');
});

await checkAsync('written row -> already-written, no writer call, no queue write', async () => {
  const row = validatedRow();
  row.status = 'written';
  row.meta_json = JSON.stringify({ materialization: { packagePath: 'archive/packages/chat_1.h2ochat', contentHash: 'sha256-' + 'b'.repeat(64), schemaVersion: 2, payloadVersion: 2, snapshotId: 'snap_1', writtenAt: 'x' } });
  const fx = loadFixture({ row });
  const r = await fx.api({ requestId: 'req_1' });
  assert.equal(r.status, 'already-written');
  assert.equal(r.ok, true);
  assert.equal(r.package.packagePath, 'archive/packages/chat_1.h2ochat');
  assert.equal(fx.writerCalls.length, 0);
  assert.equal(fx.sqlCalls.filter((c) => c.cmd === 'plugin:sql|execute').length, 0, 'no queue write on idempotent no-op');
});

await checkAsync('non-validated row -> not-eligible, no writer call, no queue write', async () => {
  const row = validatedRow();
  row.status = 'rejected';
  const fx = loadFixture({ row });
  const r = await fx.api({ requestId: 'req_1' });
  assert.equal(r.status, 'not-eligible');
  assert.equal(r.previousStatus, 'rejected');
  assert.equal(fx.writerCalls.length, 0);
  assert.equal(fx.sqlCalls.filter((c) => c.cmd === 'plugin:sql|execute').length, 0);
});

await checkAsync('re-resolution missing snapshot -> needs-desktop-snapshot, no writer call', async () => {
  const fx = loadFixture({
    row: validatedRow(),
    resolveResult: { status: 'needs-desktop-snapshot', ok: false, resolution: {} },
  });
  const r = await fx.api({ requestId: 'req_1' });
  assert.equal(r.status, 'needs-desktop-snapshot');
  assert.equal(fx.writerCalls.length, 0);
  const stored = fx.queue.get('req_1');
  assert.equal(stored.status, 'needs-desktop-snapshot');
});

await checkAsync('writer throw -> failed, error metadata persisted, no overwrite', async () => {
  const fx = loadFixture({
    row: validatedRow(),
    resolveResult: { status: 'validated', ok: true, resolution: { snapshotId: 'snap_1' } },
    writerThrows: 'saved chat package already exists: archive/packages/chat_1.h2ochat',
  });
  const r = await fx.api({ requestId: 'req_1' });
  assert.equal(r.status, 'failed');
  assert.equal(r.ok, false);
  assert.equal(r.error, 'package-already-exists');
  assert.equal(fx.writerCalls.length, 1);
  const mat = JSON.parse(fx.queue.get('req_1').meta_json).materialization;
  assert.equal(mat.errorCode, 'package-already-exists');
  assert.ok(mat.errorMessage.includes('already exists'));
  assert.equal(fx.queue.get('req_1').status, 'failed');
});

await checkAsync('missing request -> not-found, no writer call', async () => {
  const fx = loadFixture({ row: null });
  const r = await fx.api({ requestId: 'nope' });
  assert.equal(r.status, 'not-found');
  assert.equal(fx.writerCalls.length, 0);
});

console.log('');
if (FAIL.length) {
  console.error(`[archive-materializer] ${FAIL.length} failed, ${PASS.length} passed`);
  process.exitCode = 1;
} else {
  console.log(`[archive-materializer] all ${PASS.length} checks passed`);
}
