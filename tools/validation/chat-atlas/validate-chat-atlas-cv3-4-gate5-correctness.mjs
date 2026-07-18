#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const corePath = 'src-runtime-base/0A1a.⬛️🧠 H2O Core 🧠.js';
const paginationPath = 'src-runtime-base/0C1b.⚫️🪟 Pagination Windowing (Chat 🔗 Adapter) 🪟.js';
const baselineSha = 'be9fcf7369ef66c8db6d2e9acde6b9357fbd58a7';
const coreSource = fs.readFileSync(path.join(root, corePath), 'utf8');
const paginationSource = fs.readFileSync(path.join(root, paginationPath), 'utf8');
const baselineCoreSource = execFileSync('git', ['show', `${baselineSha}:${corePath}`], {
  cwd: root,
  encoding: 'utf8',
});

let assertionCount = 0;
const fixtures = [];
const equal = (actual, expected, message) => {
  assertionCount += 1;
  const clean = (value) => value && typeof value === 'object'
    ? JSON.parse(JSON.stringify(value))
    : value;
  assert.deepEqual(clean(actual), clean(expected), message);
};
const ok = (value, message) => {
  assertionCount += 1;
  assert.ok(value, message);
};
const fixture = async (name, fn) => {
  try {
    await fn();
    fixtures.push({ name, ok: true });
  } catch (error) {
    fixtures.push({ name, ok: false, error: String(error?.stack || error) });
  }
};

function extractFunction(source, name) {
  const start = source.indexOf(`  function ${name}(`);
  if (start < 0 || source.indexOf(`  function ${name}(`, start + 1) >= 0) {
    throw new Error(`production-function-anchor-invalid:${name}`);
  }
  const brace = source.indexOf('{', start);
  let depth = 0;
  for (let index = brace; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    else if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`production-function-boundary-invalid:${name}`);
}

function createPaginationReconciler(source, authorityActive) {
  const productionFunction = extractFunction(source, 'reconcileTurnRecordsFromPaginationSnapshot');
  const program = `(function () {
    const turnState = { turns: [{ qId: 'proven-q-1' }, { qId: 'proven-q-2' }], paginationDrafts: null };
    const counters = { seeds: 0, commits: 0 };
    const chatAtlasCompleteIndexAuthorityActive = () => ${authorityActive === true};
    const buildPaginationTurnDrafts = (rows) => rows.map((row) => ({ ...row }));
    const seedDurableTurnDrafts = () => { counters.seeds += 1; };
    const buildLiveTurnDrafts = () => [];
    const selectChatAtlasCanonicalDrafts = (rows) => rows;
    const commitTurnDrafts = (rows) => { counters.commits += 1; turnState.turns = rows.map((row) => ({ ...row })); };
    const listTurnRecords = () => turnState.turns.map((row) => ({ ...row }));
    ${productionFunction}
    return { run: reconcileTurnRecordsFromPaginationSnapshot, turnState, counters };
  })()`;
  return vm.runInNewContext(program, Object.create(null));
}

await fixture('B1 previous production contract replaces proven membership', () => {
  const runtime = createPaginationReconciler(baselineCoreSource, true);
  const rows = runtime.run([{ qId: 'legacy-mounted-only' }]);
  equal(rows.map((row) => row.qId), ['legacy-mounted-only']);
  equal(runtime.counters.commits, 1);
  equal(runtime.counters.seeds, 1);
});

await fixture('B1 complete authority survives pagination reconciliation', () => {
  const runtime = createPaginationReconciler(coreSource, true);
  const rows = runtime.run([{ qId: 'legacy-mounted-only' }]);
  equal(rows.map((row) => row.qId), ['proven-q-1', 'proven-q-2']);
  equal(runtime.counters.commits, 0);
  equal(runtime.counters.seeds, 0);
  equal(runtime.turnState.paginationDrafts, null);
});

await fixture('B1 complete authority blocks append remove reorder renumber and rekey', () => {
  const runtime = createPaginationReconciler(coreSource, true);
  const before = JSON.stringify(runtime.turnState.turns);
  runtime.run([
    { qId: 'rekeyed-q', turnNo: 99 },
    { qId: 'appended-q', turnNo: 1 },
  ]);
  equal(JSON.stringify(runtime.turnState.turns), before);
});

await fixture('B1 disabled mode preserves legacy pagination reconciliation', () => {
  const runtime = createPaginationReconciler(coreSource, false);
  const rows = runtime.run([{ qId: 'legacy-q-1' }, { qId: 'legacy-q-2' }]);
  equal(rows.map((row) => row.qId), ['legacy-q-1', 'legacy-q-2']);
  equal(runtime.counters.commits, 1);
});

await fixture('B1 pagination adapter checks route-owned authority before canonical sync', () => {
  ok(paginationSource.includes("authority?.enabled === true"));
  ok(paginationSource.includes("authority?.authoritative === true"));
  ok(paginationSource.includes("authorityChatId === currentChatId"));
  ok(paginationSource.indexOf('authorityChatId === currentChatId') < paginationSource.indexOf('api._reconcilePaginationSnapshot(rows)'));
});

await fixture('Gate 5 correctness validator remains production-backed and privacy bounded', () => {
  equal(coreSource.includes('conversation text'), false);
  equal(coreSource.includes('authorization header'), false);
  ok(coreSource.includes('host-payload-full-graph'));
});

const failed = fixtures.filter((row) => !row.ok);
console.log(`CV-3.4 Gate 5 correctness: ${fixtures.length - failed.length}/${fixtures.length} fixtures, ${assertionCount} assertions, ${failed.length} failures`);
for (const row of failed) console.error(`FAIL ${row.name}\n${row.error}`);
if (failed.length) process.exitCode = 1;
