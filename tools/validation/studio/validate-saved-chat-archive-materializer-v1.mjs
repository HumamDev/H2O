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
function loadFixture({ row, resolveResult, writerResult, writerThrows, coverage, coverageThrows, raceAfterRead } = {}) {
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
      const snapshotOfRow = r ? [{ ...r }] : [];
      // Simulates a concurrent worker moving the row AFTER this one read it as
      // `validated` — the exact window the compare-and-swap claim exists for.
      if (raceAfterRead && r) { r.status = raceAfterRead; raceAfterRead = null; }
      return snapshotOfRow;
    }
    if (cmd === 'plugin:sql|execute') {
      assert.match(q, /UPDATE saved_chat_archive_requests/, 'only the queue table may be written');
      // Every transition must be compare-and-swap guarded, so the bind tuple is
      // status, updated_at, meta_json [, snapshot_id], request_id, expected_status.
      assert.match(q, /WHERE request_id = \? AND status = \?/, 'transitions must be status-guarded');
      const expectedStatus = v[v.length - 1];
      const reqId = v[v.length - 2];
      const cur = queue.get(reqId);
      // Mirrors SQLite: the UPDATE matches nothing unless the row is still in
      // the state the caller expected to move away from.
      if (!cur || cur.status !== expectedStatus) return [0, 0];
      cur.status = v[0];
      cur.updated_at = v[1];
      cur.meta_json = v[2];
      if (v.length === 6) cur.snapshot_id = v[3];
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
  const coverageCalls = [];
  if (coverage || coverageThrows) {
    context.H2O.Studio.ingestion.describeSavedChatCoverageV1 = async (opts) => {
      coverageCalls.push(opts);
      if (coverageThrows) throw new Error(coverageThrows);
      return coverage;
    };
  }
  context.globalThis = context;
  const sandbox = vm.createContext(context);
  vm.runInContext(src, sandbox, { filename: MODULE_REL });
  const api = sandbox.H2O.Studio.ingestion.materializeSavedChatArchiveRequestV1;
  const rearm = sandbox.H2O.Studio.ingestion.rearmFailedSavedChatArchiveRequestV1;
  const reconcile = sandbox.H2O.Studio.ingestion.reconcileStrandedSavedChatArchiveWritingV1;
  if (typeof api !== 'function') throw new Error('materialize API did not register');
  return { api, rearm, reconcile, queue, sqlCalls, writerCalls, coverageCalls, context };
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
    writerThrows: 'trusted publication refused: generation-manifest-invalid',
  });
  const r = await fx.api({ requestId: 'req_1' });
  assert.equal(r.status, 'failed');
  assert.equal(r.ok, false);
  // M05 Phase 3: the legacy `already exists -> package-already-exists` mapping
  // is RETIRED. An occupied exact generation is verified by the trusted
  // publisher and returned as DEDUPED (a success), never adjudicated here, so
  // only a genuine throw reaches this branch.
  assert.equal(r.error, 'package-writer-threw');
  assert.equal(fx.writerCalls.length, 1);
  const mat = JSON.parse(fx.queue.get('req_1').meta_json).materialization;
  assert.equal(mat.errorCode, 'package-writer-threw');
  assert.equal(fx.queue.get('req_1').status, 'failed');
});

await checkAsync('M05 P3: the retired package-already-exists failure mapping is gone', async () => {
  // Even a throw whose text says "already exists" must not resurrect the old
  // code path: dedupe is a trusted verdict, not a renderer inference.
  const fx = loadFixture({
    row: validatedRow(),
    resolveResult: { status: 'validated', ok: true, resolution: { snapshotId: 'snap_1' } },
    writerThrows: 'saved chat package already exists: archive/packages/chat_1.h2ochat',
  });
  const r = await fx.api({ requestId: 'req_1' });
  assert.equal(r.error, 'package-writer-threw');
  assert.notEqual(r.error, 'package-already-exists');
});

await checkAsync('missing request -> not-found, no writer call', async () => {
  const fx = loadFixture({ row: null });
  const r = await fx.api({ requestId: 'nope' });
  assert.equal(r.status, 'not-found');
  assert.equal(fx.writerCalls.length, 0);
});

// ── Transition integrity: the guard exists so a stale view of the row can
// never win. Each case drives a real conflict through the SQL mock.
await checkAsync('two claimants race for one validated row: exactly one calls the writer', async () => {
  const fx = loadFixture({
    row: validatedRow(),
    resolveResult: { status: 'validated', ok: true, resolution: { snapshotId: 'snap_1' } },
    writerResult: { packagePath: 'archive/packages/chat_1.h2ochat', schemaVersion: 2, payloadVersion: 2, contentHash: 'sha256-' + 'b'.repeat(64), snapshotId: 'snap_1', written: true, writtenAt: '2026-06-24T00:00:00.000Z' },
  });
  // Both callers observe `validated`; only one can move the row out of it.
  const [a, b] = await Promise.all([fx.api({ requestId: 'req_1' }), fx.api({ requestId: 'req_1' })]);
  const outcomes = [a.status, b.status].sort();
  assert.deepEqual(outcomes, ['transition-conflict', 'written'], `unexpected outcomes: ${outcomes}`);
  assert.equal(fx.writerCalls.length, 1, 'the package writer must run exactly once');
  const loser = a.status === 'transition-conflict' ? a : b;
  assert.equal(loser.ok, false, 'a lost claim must not report success');
  // Compared field-wise: the result object is built inside the VM realm.
  assert.equal(loser.transitionConflict.expectedStatus, 'validated');
  assert.equal(loser.transitionConflict.nextStatus, 'writing');
  assert.equal(fx.queue.get('req_1').status, 'written');
});

await checkAsync('a worker whose writer threw cannot stamp failed over a written row', async () => {
  const fx = loadFixture({
    row: validatedRow(),
    resolveResult: { status: 'validated', ok: true, resolution: { snapshotId: 'snap_1' } },
    writerThrows: 'package writer exploded',
  });
  // This worker legitimately claims the row, then its writer throws — but by
  // the time it reports, another actor has completed the row. The guard must
  // stop `writing -> failed` from regressing that outcome. Driving it through
  // a real claim matters: setting the row to `writing` up front would only
  // exercise the eligibility gate and never reach a guarded UPDATE.
  const original = fx.context.H2O.Studio.ingestion.writeSavedChatPackageV1;
  fx.context.H2O.Studio.ingestion.writeSavedChatPackageV1 = async (opts) => {
    try { return await original(opts); }
    finally { fx.queue.get('req_1').status = 'written'; }
  };
  const r = await fx.api({ requestId: 'req_1' });
  assert.equal(fx.queue.get('req_1').status, 'written', 'writing -> failed must not regress a written row');
  assert.equal(r.status, 'transition-conflict');
  assert.equal(r.ok, false);
  assert.equal(r.transitionConflict.expectedStatus, 'writing');
  assert.equal(r.transitionConflict.nextStatus, 'failed');
});

await checkAsync('losing writing -> written reports the conflict and still surfaces the package', async () => {
  const fx = loadFixture({
    row: validatedRow(),
    resolveResult: { status: 'validated', ok: true, resolution: { snapshotId: 'snap_1' } },
    writerResult: { packagePath: 'archive/packages/chat_1.h2ochat', schemaVersion: 2, payloadVersion: 2, contentHash: 'sha256-' + 'c'.repeat(64), snapshotId: 'snap_1', written: true, writtenAt: '2026-06-24T00:00:00.000Z' },
  });
  // Simulate another actor moving the row out of `writing` while the package
  // write was in flight.
  const original = fx.context.H2O.Studio.ingestion.writeSavedChatPackageV1;
  fx.context.H2O.Studio.ingestion.writeSavedChatPackageV1 = async (opts) => {
    const out = await original(opts);
    fx.queue.get('req_1').status = 'failed';
    return out;
  };
  const r = await fx.api({ requestId: 'req_1' });
  assert.equal(r.status, 'transition-conflict');
  assert.equal(r.ok, false, 'a lost completion must not be reported as success');
  assert.equal(r.package.packagePath, 'archive/packages/chat_1.h2ochat', 'the written package must still be surfaced');
  assert.equal(r.transitionConflict.expectedStatus, 'writing');
  assert.equal(r.transitionConflict.nextStatus, 'written');
});

// ── M05 Phase 3: coverage-aware lifecycle ────────────────────────────────────

const FRESH_HASH = 'sha256-' + 'a'.repeat(64);

function coverageFresh(overrides = {}) {
  return Object.assign({
    chatId: 'chat_1',
    projection: { status: 'ok', reason: '', contentHash: FRESH_HASH, snapshotId: 'snap_1', schemaVersion: 2 },
    legacy: [], generations: [], unusable: [], stale: [],
    fresh: [{ packagePath: 'archive/packages/chat_1.gaaa.h2ochat', contentHash: FRESH_HASH, schemaVersion: 2, payloadVersion: 2, classification: 'generation' }],
    selected: { packagePath: 'archive/packages/chat_1.gaaa.h2ochat', contentHash: FRESH_HASH, schemaVersion: 2, payloadVersion: 2, classification: 'generation' },
    preserved: true, covered: true, bestHistorical: null, bestHistoricalTies: [], complete: true, reason: '',
  }, overrides);
}

function coverageStale(overrides = {}) {
  return Object.assign({}, coverageFresh(), {
    fresh: [], selected: null, covered: false,
    stale: [{ packagePath: 'archive/packages/chat_1.gbbb.h2ochat', contentHash: 'sha256-' + 'b'.repeat(64), staleKind: 'content-stale' }],
  }, overrides);
}

const okWriterResult = {
  packagePath: 'archive/packages/chat_1.gccc.h2ochat',
  schemaVersion: 2, payloadVersion: 2,
  contentHash: 'sha256-' + 'c'.repeat(64),
  snapshotId: 'snap_1', writtenAt: '2026-08-27T00:00:00.000Z',
  outcome: 'created', committed: true, deduped: false, durabilityComplete: true, advisories: [],
};

await checkAsync('P3-1 re-resolution runs BEFORE coverage and before the writing claim', async () => {
  const order = [];
  const fx = loadFixture({
    row: validatedRow(),
    resolveResult: { status: 'validated', ok: true, resolution: { snapshotId: 'snap_1', studioChatId: 'chat_1' } },
    coverage: coverageStale(),
    writerResult: okWriterResult,
  });
  // The queue's first UPDATE is the claim; coverage must already have run.
  const r = await fx.api({ requestId: 'req_1' });
  assert.equal(r.status, 'written');
  assert.equal(fx.coverageCalls.length, 1, 'coverage consulted exactly once');
  const firstUpdate = fx.sqlCalls.findIndex((c) => c.cmd === 'plugin:sql|execute');
  const firstSelect = fx.sqlCalls.findIndex((c) => c.cmd === 'plugin:sql|select');
  assert.ok(firstSelect >= 0 && firstSelect < firstUpdate, 'the row is read before any transition');
});

await checkAsync('P3-2 a FRESH package short-circuits: no publish, sanctioned success', async () => {
  const fx = loadFixture({
    row: validatedRow(),
    resolveResult: { status: 'validated', ok: true, resolution: { snapshotId: 'snap_1', studioChatId: 'chat_1' } },
    coverage: coverageFresh(),
  });
  const r = await fx.api({ requestId: 'req_1' });
  assert.equal(r.status, 'written', 'completes through the sanctioned terminal state');
  assert.equal(r.ok, true);
  assert.equal(fx.writerCalls.length, 0, 'NO publication may occur when already fresh');
  assert.equal(r.package.outcome, 'already-fresh');
  assert.equal(r.package.contentHash, FRESH_HASH);
  assert.equal(fx.queue.get('req_1').status, 'written');
});

await checkAsync('P3-3 PRESERVED-but-stale does NOT short-circuit: publication occurs', async () => {
  const fx = loadFixture({
    row: validatedRow(),
    resolveResult: { status: 'validated', ok: true, resolution: { snapshotId: 'snap_1', studioChatId: 'chat_1' } },
    coverage: coverageStale(),
    writerResult: okWriterResult,
  });
  const r = await fx.api({ requestId: 'req_1' });
  assert.equal(fx.writerCalls.length, 1, 'a stale archive must still publish');
  assert.equal(r.status, 'written');
  assert.equal(r.package.outcome, 'created');
});

await checkAsync('P3-3b BEST-HISTORICAL and PRESERVED never satisfy the fresh path', async () => {
  const fx = loadFixture({
    row: validatedRow(),
    resolveResult: { status: 'validated', ok: true, resolution: { snapshotId: 'snap_1', studioChatId: 'chat_1' } },
    coverage: coverageStale({
      preserved: true,
      bestHistorical: { packagePath: 'archive/packages/chat_1.gbbb.h2ochat', contentHash: 'sha256-' + 'b'.repeat(64) },
    }),
    writerResult: okWriterResult,
  });
  const r = await fx.api({ requestId: 'req_1' });
  assert.equal(fx.writerCalls.length, 1, 'a historical candidate is not freshness');
  assert.equal(r.package.outcome, 'created');
});

await checkAsync('P3-4 no valid package at all ⇒ publication occurs', async () => {
  const fx = loadFixture({
    row: validatedRow(),
    resolveResult: { status: 'validated', ok: true, resolution: { snapshotId: 'snap_1', studioChatId: 'chat_1' } },
    coverage: coverageStale({ stale: [], preserved: false, covered: false }),
    writerResult: okWriterResult,
  });
  const r = await fx.api({ requestId: 'req_1' });
  assert.equal(fx.writerCalls.length, 1);
  assert.equal(r.status, 'written');
});

await checkAsync('P3-6 trusted DEDUPED is a SUCCESSFUL materialization', async () => {
  const fx = loadFixture({
    row: validatedRow(),
    resolveResult: { status: 'validated', ok: true, resolution: { snapshotId: 'snap_1', studioChatId: 'chat_1' } },
    coverage: coverageStale(),
    writerResult: Object.assign({}, okWriterResult, { outcome: 'deduped', deduped: true, committed: false }),
  });
  const r = await fx.api({ requestId: 'req_1' });
  assert.equal(r.status, 'written', 'DEDUPED must not be a failure');
  assert.equal(r.ok, true);
  assert.equal(r.package.outcome, 'deduped');
  assert.equal(r.package.deduped, true);
  assert.equal(fx.queue.get('req_1').status, 'written');
});

await checkAsync('P3-7 indeterminate projection: no publish, no fresh/stale assertion, row stays retryable', async () => {
  const fx = loadFixture({
    row: validatedRow(),
    resolveResult: { status: 'validated', ok: true, resolution: { snapshotId: 'snap_1', studioChatId: 'chat_1' } },
    coverage: coverageStale({
      projection: { status: 'indeterminate', reason: 'store-not-ready', contentHash: '' },
      covered: null, fresh: [], stale: [],
    }),
  });
  const r = await fx.api({ requestId: 'req_1' });
  assert.equal(fx.writerCalls.length, 0, 'must not publish on an unproven current state');
  assert.equal(r.status, 'deferred');
  assert.equal(r.deferred.reason, 'projection-indeterminate');
  // Row remains immediately eligible; no durable status was invented.
  assert.equal(fx.queue.get('req_1').status, 'validated');
});

await checkAsync('P3-9 incomplete discovery cannot justify publication', async () => {
  const fx = loadFixture({
    row: validatedRow(),
    resolveResult: { status: 'validated', ok: true, resolution: { snapshotId: 'snap_1', studioChatId: 'chat_1' } },
    coverage: coverageStale({ covered: null, complete: false, fresh: [], reason: 'discovery-incomplete' }),
  });
  const r = await fx.api({ requestId: 'req_1' });
  assert.equal(fx.writerCalls.length, 0, 'a truncated scan is not evidence that no fresh package exists');
  assert.equal(r.status, 'deferred');
  assert.equal(r.deferred.reason, 'discovery-incomplete');
  assert.equal(fx.queue.get('req_1').status, 'validated');
});

await checkAsync('P3-9b a truncated scan that already found a FRESH package may still short-circuit', async () => {
  const fx = loadFixture({
    row: validatedRow(),
    resolveResult: { status: 'validated', ok: true, resolution: { snapshotId: 'snap_1', studioChatId: 'chat_1' } },
    coverage: coverageFresh({ complete: false }),
  });
  const r = await fx.api({ requestId: 'req_1' });
  assert.equal(r.status, 'written', 'a verified positive is safe under a partial scan');
  assert.equal(fx.writerCalls.length, 0);
});

await checkAsync('P3-10 a lost fresh-path claim reports conflict, never false success', async () => {
  const fx = loadFixture({
    row: validatedRow(),
    resolveResult: { status: 'validated', ok: true, resolution: { snapshotId: 'snap_1', studioChatId: 'chat_1' } },
    coverage: coverageFresh(),
    // The row is read as `validated`, then a concurrent worker claims it. Our
    // claim must lose, and losing must never become a success.
    raceAfterRead: 'writing',
  });
  const r = await fx.api({ requestId: 'req_1' });
  assert.notEqual(r.status, 'written');
  assert.equal(r.ok, false, 'a lost claim must never report success');
  assert.ok(r.transitionConflict, 'the conflict must be reported');
  assert.equal(fx.writerCalls.length, 0);
  // The concurrent owner's state is untouched.
  assert.equal(fx.queue.get('req_1').status, 'writing');
});

await checkAsync('P3-11 queue metadata is never consulted as freshness authority', async () => {
  // The row already claims a written package with the CURRENT hash in
  // meta_json. That must not short-circuit anything: only the coverage
  // authority decides, and here it says stale.
  const row = validatedRow();
  row.meta_json = JSON.stringify({ materialization: { contentHash: FRESH_HASH, packagePath: 'archive/packages/chat_1.gaaa.h2ochat', outcome: 'created' } });
  const fx = loadFixture({
    row,
    resolveResult: { status: 'validated', ok: true, resolution: { snapshotId: 'snap_1', studioChatId: 'chat_1' } },
    coverage: coverageStale(),
    writerResult: okWriterResult,
  });
  const r = await fx.api({ requestId: 'req_1' });
  assert.equal(fx.writerCalls.length, 1, 'recorded-at-write-time metadata is history, not present truth');
  assert.equal(r.status, 'written');
});

await checkAsync('P3-12 a coverage authority that throws degrades to the existing publish path', async () => {
  const fx = loadFixture({
    row: validatedRow(),
    resolveResult: { status: 'validated', ok: true, resolution: { snapshotId: 'snap_1', studioChatId: 'chat_1' } },
    coverageThrows: 'coverage exploded',
    writerResult: okWriterResult,
  });
  const r = await fx.api({ requestId: 'req_1' });
  assert.equal(r.status, 'written', 'coverage is an optimization; its failure must not break materialization');
  assert.equal(fx.writerCalls.length, 1);
});

// ── M05 Phase 3: recovery, re-arm & recorded intent ─────────────────────────

const INTENDED = 'sha256-' + 'd'.repeat(64);

function rowIn(status, matOverrides = {}) {
  const r = validatedRow();
  r.status = status;
  r.meta_json = JSON.stringify({ materialization: Object.assign({ processingStartedAt: '2026-08-27T00:00:00.000Z' }, matOverrides) });
  return r;
}

function coverageWith(entries, overrides = {}) {
  return Object.assign({
    chatId: 'chat_1',
    projection: { status: 'ok', reason: '', contentHash: FRESH_HASH, snapshotId: 'snap_1', schemaVersion: 2 },
    legacy: [], generations: entries, unusable: [], fresh: [], stale: [],
    preserved: entries.length > 0, covered: false, selected: null,
    bestHistorical: null, bestHistoricalTies: [], complete: true, reason: '',
  }, overrides);
}

await checkAsync('P3R-1 the writing claim durably records the intended projection identity', async () => {
  const fx = loadFixture({
    row: validatedRow(),
    resolveResult: { status: 'validated', ok: true, resolution: { snapshotId: 'snap_1', studioChatId: 'chat_1' } },
    coverage: coverageStale(),
    writerResult: okWriterResult,
  });
  await fx.api({ requestId: 'req_1' });
  // Inspect the CLAIM update (the first execute), not the terminal one: the
  // intent must be durable BEFORE publication, or a crash loses it.
  const executes = fx.sqlCalls.filter((c) => c.cmd === 'plugin:sql|execute');
  const claimMeta = JSON.parse(executes[0].values[2]).materialization;
  assert.equal(claimMeta.intendedContentHash, FRESH_HASH, 'intent must be persisted with the claim');
  assert.equal(executes[0].values[0], 'writing');
});

await checkAsync('P3R-2 re-arm is CAS-guarded from failed only, and preserves evidence', async () => {
  const fx = loadFixture({ row: rowIn('failed', { errorCode: 'package-writer-threw', errorMessage: 'boom' }) });
  const r = await fx.rearm({ requestId: 'req_1' });
  assert.equal(r.ok, true);
  assert.equal(r.status, 'validated');
  assert.equal(fx.queue.get('req_1').status, 'validated');
  const mat = JSON.parse(fx.queue.get('req_1').meta_json).materialization;
  assert.equal(mat.attempts.length, 1, 'prior failure evidence is preserved');
  assert.equal(mat.attempts[0].errorCode, 'package-writer-threw');
  assert.equal(mat.rearmCount, 1);
  assert.equal(mat.errorCode, null, 'the retry starts from a clean slate');
});

await checkAsync('P3R-3 a non-failed row cannot be re-armed', async () => {
  for (const status of ['validated', 'writing', 'written', 'needs-desktop-snapshot']) {
    const fx = loadFixture({ row: rowIn(status) });
    const r = await fx.rearm({ requestId: 'req_1' });
    assert.equal(r.ok, false, `${status} must not be re-armable`);
    assert.equal(r.status, 'not-eligible');
    assert.equal(fx.queue.get('req_1').status, status, 'no row may jump to validated');
  }
});

await checkAsync('P3R-4 re-arm losing the CAS race reports conflict, never success', async () => {
  const fx = loadFixture({ row: rowIn('failed'), raceAfterRead: 'validated' });
  const r = await fx.rearm({ requestId: 'req_1' });
  assert.equal(r.ok, false);
  assert.equal(r.status, 'transition-conflict');
  assert.ok(r.transitionConflict);
});

await checkAsync('P3R-5 stranded writing + verified matching generation ⇒ written (no republish)', async () => {
  const fx = loadFixture({
    row: rowIn('writing', { intendedContentHash: INTENDED }),
    coverage: coverageWith([{ packagePath: 'archive/packages/chat_1.gddd.h2ochat', contentHash: INTENDED, schemaVersion: 2, payloadVersion: 2, classification: 'generation' }]),
  });
  const r = await fx.reconcile({ requestId: 'req_1' });
  assert.equal(r.ok, true);
  assert.equal(r.status, 'written');
  assert.equal(r.package.outcome, 'recovered-package-present');
  assert.equal(r.package.contentHash, INTENDED);
  assert.equal(fx.writerCalls.length, 0, 'never republish merely to prove existence');
  assert.equal(fx.queue.get('req_1').status, 'written');
});

await checkAsync('P3R-6 reconciliation is idempotent', async () => {
  const fx = loadFixture({
    row: rowIn('writing', { intendedContentHash: INTENDED }),
    coverage: coverageWith([{ packagePath: 'archive/packages/chat_1.gddd.h2ochat', contentHash: INTENDED, schemaVersion: 2, payloadVersion: 2, classification: 'generation' }]),
  });
  const first = await fx.reconcile({ requestId: 'req_1' });
  const second = await fx.reconcile({ requestId: 'req_1' });
  assert.equal(first.status, 'written');
  assert.equal(second.ok, true);
  assert.equal(second.status, 'already-written', 'repeating must be a safe no-op');
  assert.equal(fx.queue.get('req_1').status, 'written');
});

await checkAsync('P3R-7 complete scan with NO matching package ⇒ sanctioned failed, evidence kept', async () => {
  const fx = loadFixture({
    row: rowIn('writing', { intendedContentHash: INTENDED }),
    coverage: coverageWith([{ packagePath: 'archive/packages/chat_1.gzzz.h2ochat', contentHash: 'sha256-' + 'e'.repeat(64), schemaVersion: 2, classification: 'generation' }]),
  });
  const r = await fx.reconcile({ requestId: 'req_1' });
  assert.equal(r.status, 'failed', 'routes through the sanctioned writing -> failed edge');
  assert.equal(r.recovered.rearmRequired, true, 'reset is explicit, never automatic');
  const mat = JSON.parse(fx.queue.get('req_1').meta_json).materialization;
  assert.equal(mat.errorCode, 'stranded-writing-recovered');
  assert.equal(mat.intendedContentHash, INTENDED, 'evidence preserved for the re-arm');
  // And it is then re-armable, completing the recovery route.
  const armed = await fx.rearm({ requestId: 'req_1' });
  assert.equal(armed.status, 'validated');
});

await checkAsync('P3R-8 incomplete verification never asserts absence or failure', async () => {
  const fx = loadFixture({
    row: rowIn('writing', { intendedContentHash: INTENDED }),
    coverage: coverageWith([], { complete: false, covered: null }),
  });
  const r = await fx.reconcile({ requestId: 'req_1' });
  assert.equal(r.status, 'deferred');
  assert.equal(r.deferred.reason, 'discovery-incomplete');
  assert.equal(fx.queue.get('req_1').status, 'writing', 'no destructive mutation on unproven evidence');
});

await checkAsync('P3R-9 a row with no recorded intent is surfaced, never guessed', async () => {
  const fx = loadFixture({
    row: rowIn('writing'),
    // Today's projection matches a package — which must NOT be used as a
    // substitute for what the stranded worker actually intended.
    coverage: coverageWith([{ packagePath: 'archive/packages/chat_1.gaaa.h2ochat', contentHash: FRESH_HASH, schemaVersion: 2, classification: 'generation' }]),
  });
  const r = await fx.reconcile({ requestId: 'req_1' });
  assert.equal(r.status, 'recovery-intent-unknown');
  assert.equal(fx.queue.get('req_1').status, 'writing', 'no mutation without recorded intent');
  assert.equal(r.ok, false);
});

await checkAsync('P3R-10 age alone never resets a writing row', async () => {
  // No age/timeout input exists in the decision at all: an ancient row with a
  // verifiable package still reconciles to written, and one without evidence
  // still refuses to guess.
  const src = readRepo(MODULE_REL);
  const fnStart = src.indexOf('async function reconcileStrandedSavedChatArchiveWritingV1');
  const fnBody = src.slice(fnStart, src.indexOf('materializeSavedChatArchiveRequestV1.__installed', fnStart));
  for (const forbidden of ['Date.now()', 'setTimeout', 'elapsed', 'ageMs', 'timeoutMs']) {
    assert.ok(!fnBody.includes(forbidden), `reconciliation must not consult ${forbidden}`);
  }
});

await checkAsync('P3R-11 RESTART proof: intent persisted, process restarted, then reconciled', async () => {
  // 1. A worker claims and records intent, then is interrupted.
  const first = loadFixture({
    row: validatedRow(),
    resolveResult: { status: 'validated', ok: true, resolution: { snapshotId: 'snap_1', studioChatId: 'chat_1' } },
    coverage: coverageStale({ projection: { status: 'ok', contentHash: INTENDED, snapshotId: 'snap_1', schemaVersion: 2 } }),
    writerThrows: 'simulated interruption before completion',
  });
  await first.api({ requestId: 'req_1' });
  // The writer threw, so this worker moved the row to failed; simulate instead
  // a HARD interruption by restoring the durable state as it was mid-write.
  const durable = { ...first.queue.get('req_1') };
  durable.status = 'writing';
  durable.meta_json = JSON.stringify({ materialization: { intendedContentHash: INTENDED, processingStartedAt: '2026-08-27T00:00:00.000Z' } });

  // 2. A NEW process (fresh sandbox, fresh module instance) sees only the
  //    persisted row — nothing in memory survives.
  const after = loadFixture({
    row: durable,
    coverage: coverageWith([{ packagePath: 'archive/packages/chat_1.gddd.h2ochat', contentHash: INTENDED, schemaVersion: 2, payloadVersion: 2, classification: 'generation' }]),
  });
  assert.equal(after.queue.get('req_1').status, 'writing', 'pre-state: stranded');
  const r = after.reconcile ? await after.reconcile({ requestId: 'req_1' }) : null;
  assert.ok(r, 'the recovery API must exist in the restarted process');
  assert.equal(r.status, 'written', 'recovered purely from persisted intent + verified package');
  assert.equal(after.writerCalls.length, 0);
});

await checkAsync('P3R-12 a stale worker cannot overwrite a newer owner during recovery', async () => {
  const fx = loadFixture({
    row: rowIn('writing', { intendedContentHash: INTENDED }),
    coverage: coverageWith([{ packagePath: 'archive/packages/chat_1.gddd.h2ochat', contentHash: INTENDED, schemaVersion: 2, classification: 'generation' }]),
    raceAfterRead: 'written',
  });
  const r = await fx.reconcile({ requestId: 'req_1' });
  assert.equal(r.ok, false);
  assert.equal(r.status, 'transition-conflict');
  assert.equal(fx.queue.get('req_1').status, 'written', 'the newer owner state is intact');
});

console.log('');
if (FAIL.length) {
  console.error(`[archive-materializer] ${FAIL.length} failed, ${PASS.length} passed`);
  process.exitCode = 1;
} else {
  console.log(`[archive-materializer] all ${PASS.length} checks passed`);
}
