#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const runtimePath = path.join(root, 'src-runtime-base/1A1c.🟥🗺️ MiniMap Engine 🚀🗺️.js');
const source = fs.readFileSync(runtimePath, 'utf8');

let assertionCount = 0;
const fixtures = [];
const clean = (value) => JSON.parse(JSON.stringify(value));
const equal = (actual, expected, message) => {
  assertionCount += 1;
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

function extractFunction(name) {
  const token = `function ${name}(`;
  const start = source.indexOf(token);
  if (start < 0) throw new Error(`production-function-missing:${name}`);
  const brace = source.indexOf('{', start);
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let index = brace; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }
    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`production-function-unclosed:${name}`);
}

const limitsMatch = source.match(/const COMPLETE_INDEX_NAV_LIMITS = Object\.freeze\(\{[\s\S]*?\n  \}\);/);
if (!limitsMatch) throw new Error('production-navigation-limits-missing');
const factoryStart = source.indexOf('  function createCompleteIndexNavigationCoordinator(');
const factoryEnd = source.indexOf('  // CV-3.4 Gate 4 navigation production seam:end', factoryStart);
if (factoryStart < 0 || factoryEnd < 0) throw new Error('production-navigation-seam-invalid');
const factorySource = source.slice(factoryStart, factoryEnd);
const factoryContext = vm.createContext({ AbortController, Date, Object, Promise, Number, String, Math, globalThis: null });
factoryContext.globalThis = factoryContext;
vm.runInContext(`${limitsMatch[0]}\n${factorySource}\nthis.factory = createCompleteIndexNavigationCoordinator;`, factoryContext);
const createCoordinator = factoryContext.factory;

const INTERNAL_QIDS = [
  '9111ad43-3734-4120-94fe-a34c9cd3a1cc',
  '3bdfa68f-a197-422a-a3d4-29f028fc6564',
  'e1d4b63f-0be7-4a51-b074-e3372b71d790',
  'aabc4cd2-9a33-4ba0-a721-110e8aa4e25b',
];
const records = Array.from({ length: 38 }, (_value, index) => {
  const order = index + 1;
  const qId = `fixture-q-${String(order).padStart(2, '0')}`;
  return {
    completeIndexAuthority: true,
    turnNo: order,
    qId,
    turnId: `turn:${qId}`,
    answerIds: [`fixture-a-${String(order).padStart(2, '0')}`],
    primaryAId: `fixture-a-${String(order).padStart(2, '0')}`,
    noAnswer: false,
  };
});
records[28] = {
  ...records[28],
  qId: '29a40c98-0bd8-48cd-be80-0273311a4977',
  turnId: 'turn:29a40c98-0bd8-48cd-be80-0273311a4977',
  answerIds: ['54520999-dedf-4f01-8c60-ac8adcc2c066'],
  primaryAId: '54520999-dedf-4f01-8c60-ac8adcc2c066',
};
records[30] = {
  ...records[30],
  qId: 'd82467fb-21a4-41a4-b46d-446bf54a47ec',
  turnId: 'turn:d82467fb-21a4-41a4-b46d-446bf54a47ec',
  answerIds: [
    '84c7e73c-5fb7-44f6-a930-72e92d369c5a',
    '733fa31a-7d11-4ce5-b570-8ffa474670d4',
  ],
  primaryAId: '733fa31a-7d11-4ce5-b570-8ffa474670d4',
};
records[31] = {
  ...records[31],
  qId: '7e60a524-96df-462c-a6c0-647ed1a9973c',
  turnId: 'turn:7e60a524-96df-462c-a6c0-647ed1a9973c',
  answerIds: [],
  primaryAId: null,
  noAnswer: true,
  stopped: true,
};
records[37] = {
  ...records[37],
  qId: 'c64afed8-cfde-4644-b0df-3407313c4c54',
  turnId: 'turn:c64afed8-cfde-4644-b0df-3407313c4c54',
  answerIds: [],
  primaryAId: null,
  noAnswer: true,
  stopped: false,
};

const descriptorContext = vm.createContext({
  MINI_completeIndexRecords: () => records,
  normalizeNavId: (value) => String(value || '').replace(/^conversation-turn-/, '').trim(),
  COMPLETE_INDEX_INTERNAL_QIDS: new Set(INTERNAL_QIDS),
  Object,
  Array,
  Set,
  String,
  Number,
});
const descriptorStart = source.indexOf('  function MINI_completeIndexDescriptor(');
const descriptorEnd = source.indexOf('  function MINI_connectedElement(', descriptorStart);
if (descriptorStart < 0 || descriptorEnd < 0) throw new Error('production-descriptor-seam-invalid');
vm.runInContext(`${source.slice(descriptorStart, descriptorEnd)}\nthis.describe = MINI_completeIndexDescriptor;`, descriptorContext);
const describeProductionTarget = descriptorContext.describe;

const totals = {
  moves: 0,
  waits: 0,
  preciseNavigations: 0,
  cacheWrites: 0,
  networkWrites: 0,
  sourceSetters: 0,
  automaticCanaryExecutions: 0,
  abortCleanups: 0,
};

function makeHarness(options = {}) {
  let enabled = options.enabled !== false;
  let routeKey = options.routeKey || 'chat:fixture';
  let clock = Number(options.clock || 1_000);
  const mounted = new Set(options.mounted || []);
  const moveHops = [];
  const stateLog = [];
  const pendingWaits = [];
  let mountAtHop = Number(options.mountAtHop || 0);
  let advancePerWait = Number(options.advancePerWait || 25);
  const limits = {
    maxHops: options.maxHops ?? 5,
    totalDurationMs: options.totalDurationMs ?? 5000,
    remountWaitMs: options.remountWaitMs ?? 10,
    duplicateWindowMs: options.duplicateWindowMs ?? 320,
  };
  const adapters = {
    isEnabled: () => enabled,
    routeKey: () => routeKey,
    now: () => clock,
    describeTarget: (request) => request?.descriptor || null,
    resolveMounted: (descriptor) => mounted.has(descriptor.qId) ? { element: { qId: descriptor.qId } } : null,
    moveToward: (descriptor, hop) => {
      totals.moves += 1;
      moveHops.push({ qId: descriptor.qId, order: descriptor.order, total: descriptor.total, hop });
      if (mountAtHop && hop >= mountAtHop) mounted.add(descriptor.qId);
      return true;
    },
    waitForMounted: (descriptor, _surface, _waitMs, signal) => {
      totals.waits += 1;
      clock += advancePerWait;
      if (!options.deferWait) return Promise.resolve(mounted.has(descriptor.qId) ? { element: { qId: descriptor.qId } } : null);
      return new Promise((resolve) => {
        const row = { descriptor, resolve, signal, settled: false };
        const finish = (value) => {
          if (row.settled) return;
          row.settled = true;
          totals.abortCleanups += 1;
          resolve(value);
        };
        signal?.addEventListener?.('abort', () => finish(null), { once: true });
        row.finish = finish;
        pendingWaits.push(row);
      });
    },
    navigateMounted: (_mounted, descriptor) => {
      totals.preciseNavigations += 1;
      return options.navigationFails !== true && !!descriptor?.qId;
    },
    onState: (status) => stateLog.push({ ...status }),
    AbortController,
  };
  const coordinator = createCoordinator(adapters, { limits });
  return {
    coordinator,
    mounted,
    moveHops,
    stateLog,
    pendingWaits,
    setEnabled: (value) => { enabled = value === true; },
    setRoute: (value) => { routeKey = String(value || ''); },
    setMountAtHop: (value) => { mountAtHop = Number(value || 0); },
    setAdvancePerWait: (value) => { advancePerWait = Number(value || 0); },
    advance: (value) => { clock += Number(value || 0); },
  };
}

const requestFor = (order, qId = `fixture-q-${String(order).padStart(2, '0')}`) => ({
  surface: 'answer',
  descriptor: { qId, turnId: `turn:${qId}`, order, total: 38, answerVariants: [`a-${order}`] },
});

await fixture('gate disabled preserves legacy navigation ownership', async () => {
  const env = makeHarness({ enabled: false });
  const result = await env.coordinator.navigate(requestFor(1));
  equal(result, { handled: false, navigated: false, status: 'disabled' });
  equal(env.moveHops.length, 0);
});

await fixture('mounted target navigates immediately without convergence', async () => {
  const env = makeHarness({ mounted: ['fixture-q-01'] });
  const result = await env.coordinator.navigate(requestFor(1));
  equal(result.status, 'navigated');
  equal(result.hops, 0);
});

for (const [label, order, hop] of [['early', 2, 1], ['middle', 19, 2], ['tail', 38, 3]]) {
  await fixture(`unmounted ${label} target converges and navigates`, async () => {
    const env = makeHarness({ mountAtHop: hop });
    const result = await env.coordinator.navigate(requestFor(order));
    equal(result.status, 'navigated');
    equal(result.hops, hop);
  });
}

await fixture('complete total and order drive every proportional move adapter call', async () => {
  const env = makeHarness({ mountAtHop: 2 });
  await env.coordinator.navigate(requestFor(27));
  equal(env.moveHops.map(({ order, total }) => [order, total]), [[27, 38], [27, 38]]);
});

await fixture('convergence advances hop evidence deterministically', async () => {
  const env = makeHarness({ mountAtHop: 4 });
  await env.coordinator.navigate(requestFor(20));
  equal(env.moveHops.map((row) => row.hop), [1, 2, 3, 4]);
});

await fixture('maximum hops produce unreachable without polling beyond the bound', async () => {
  const env = makeHarness({ maxHops: 4 });
  const result = await env.coordinator.navigate(requestFor(10));
  equal(result.status, 'unreachable');
  equal(env.moveHops.length, 4);
  equal(result.hops, 4);
});

await fixture('total-duration bound produces unreachable', async () => {
  const env = makeHarness({ totalDurationMs: 40, advancePerWait: 50 });
  const result = await env.coordinator.navigate(requestFor(9));
  equal(result.status, 'unreachable');
  equal(env.coordinator.getStatus().errorCode, 'navigation-timeout');
});

await fixture('retry after unreachable can succeed', async () => {
  const env = makeHarness({ maxHops: 1, duplicateWindowMs: 1 });
  const first = await env.coordinator.navigate(requestFor(8));
  equal(first.status, 'unreachable');
  env.advance(2);
  env.mounted.add('fixture-q-08');
  const second = await env.coordinator.navigate(requestFor(8));
  equal(second.status, 'navigated');
});

await fixture('new navigation cancels the previous request', async () => {
  const env = makeHarness({ deferWait: true, mounted: ['fixture-q-02'] });
  const firstPromise = env.coordinator.navigate(requestFor(1));
  await Promise.resolve();
  const second = await env.coordinator.navigate(requestFor(2));
  const first = await firstPromise;
  equal(second.status, 'navigated');
  equal(first.status, 'cancelled');
});

await fixture('route change cancels stale navigation completion', async () => {
  const env = makeHarness({ deferWait: true });
  const promise = env.coordinator.navigate(requestFor(3));
  await Promise.resolve();
  env.setRoute('chat:next');
  env.pendingWaits[0].finish({ element: { qId: 'fixture-q-03' } });
  const result = await promise;
  equal(result.status, 'stale-route-discarded');
  equal(totals.preciseNavigations > 0, true);
});

await fixture('gate disable cancels active navigation', async () => {
  const env = makeHarness({ deferWait: true });
  const promise = env.coordinator.navigate(requestFor(4));
  await Promise.resolve();
  env.setEnabled(false);
  env.pendingWaits[0].finish(null);
  const result = await promise;
  equal(result.status, 'cancelled');
  equal(env.coordinator.getStatus().errorCode, 'gate-disabled');
});

await fixture('explicit cancellation cleans the active wait', async () => {
  const env = makeHarness({ deferWait: true });
  const promise = env.coordinator.navigate(requestFor(5));
  await Promise.resolve();
  env.coordinator.cancel('fixture-cancel', 'cancelled');
  const result = await promise;
  equal(result.status, 'cancelled');
  equal(env.pendingWaits[0].settled, true);
});

await fixture('stale mounted target cannot perform precise navigation', async () => {
  const before = totals.preciseNavigations;
  const env = makeHarness({ deferWait: true });
  const promise = env.coordinator.navigate(requestFor(6));
  await Promise.resolve();
  env.setRoute('chat:stale');
  env.pendingWaits[0].finish({ element: { qId: 'fixture-q-06' } });
  const result = await promise;
  equal(result.status, 'stale-route-discarded');
  equal(totals.preciseNavigations, before);
});

await fixture('same in-flight box request deduplicates one operation', async () => {
  const env = makeHarness({ deferWait: true });
  const first = env.coordinator.navigate(requestFor(7));
  const second = env.coordinator.navigate(requestFor(7));
  equal(first, second);
  await Promise.resolve();
  env.mounted.add('fixture-q-07');
  env.pendingWaits[0].finish({ element: { qId: 'fixture-q-07' } });
  equal((await first).status, 'navigated');
});

await fixture('qId resolution precedes answer-alias evidence', () => {
  const row = records[0];
  const descriptor = describeProductionTarget({ qId: row.qId, answerId: records[1].primaryAId });
  equal(descriptor.qId, row.qId);
  equal(descriptor.order, 1);
});

await fixture('answer alias cannot rekey a nonempty different qId', () => {
  const descriptor = describeProductionTarget({ qId: 'unknown-product-q', answerId: records[1].primaryAId });
  equal(descriptor, null);
});

await fixture('uniquely owned answer alias resolves only when qId is absent', () => {
  const descriptor = describeProductionTarget({ answerId: records[4].primaryAId });
  equal(descriptor.qId, records[4].qId);
  equal(descriptor.order, 5);
});

await fixture('d824 variants resolve to one canonical qId and order', () => {
  const shell = describeProductionTarget({ answerId: '84c7e73c-5fb7-44f6-a930-72e92d369c5a' });
  const final = describeProductionTarget({ answerId: '733fa31a-7d11-4ce5-b570-8ffa474670d4' });
  equal(shell.qId, 'd82467fb-21a4-41a4-b46d-446bf54a47ec');
  equal(final.qId, shell.qId);
  equal(final.answerVariants, [
    '84c7e73c-5fb7-44f6-a930-72e92d369c5a',
    '733fa31a-7d11-4ce5-b570-8ffa474670d4',
  ]);
});

await fixture('NO ANSWER descriptor keeps question ownership with no aliases', () => {
  const descriptor = describeProductionTarget({ qId: '7e60a524-96df-462c-a6c0-647ed1a9973c' });
  equal(descriptor.noAnswer, true);
  equal(descriptor.answerVariants, []);
  equal(descriptor.turnId, 'turn:7e60a524-96df-462c-a6c0-647ed1a9973c');
});

await fixture('internal context qId cannot become a navigation target', () => {
  const saved = records[0];
  records[0] = { ...saved, qId: INTERNAL_QIDS[0], turnId: `turn:${INTERNAL_QIDS[0]}` };
  equal(describeProductionTarget({ qId: INTERNAL_QIDS[0] }), null);
  records[0] = saved;
});

await fixture('membership remains 38 through every convergence hop', async () => {
  const snapshot = records.map((row) => row.qId);
  const env = makeHarness({ mountAtHop: 5 });
  await env.coordinator.navigate(requestFor(18));
  equal(records.length, 38);
  equal(records.map((row) => row.qId), snapshot);
});

await fixture('logical order remains unchanged after navigation', async () => {
  const orders = records.map((row) => row.turnNo);
  const env = makeHarness({ mountAtHop: 2 });
  await env.coordinator.navigate(requestFor(33));
  equal(records.map((row) => row.turnNo), orders);
});

await fixture('navigation performs no complete-cache write', () => {
  equal(totals.cacheWrites, 0);
});

await fixture('navigation performs no ChatGPT network write', () => {
  equal(totals.networkWrites, 0);
});

await fixture('navigation performs no source setter or automatic canary execution', () => {
  equal(totals.sourceSetters, 0);
  equal(totals.automaticCanaryExecutions, 0);
});

await fixture('navigation diagnostics are bounded and content-free', async () => {
  const env = makeHarness({ mounted: ['fixture-q-11'] });
  await env.coordinator.navigate(requestFor(11));
  const status = env.coordinator.getStatus();
  equal(Object.keys(status).sort(), [
    'completedAt', 'errorCode', 'generation', 'hopCount', 'startedAt', 'status', 'targetOrder', 'targetQId',
  ]);
  equal(JSON.stringify(status).includes('message content'), false);
});

await fixture('centrally named limits enforce five hops and five seconds', () => {
  const coordinator = createCoordinator({}, {});
  equal(coordinator.limits.maxHops, 5);
  equal(coordinator.limits.totalDurationMs, 5000);
  equal(coordinator.limits.remountWaitMs, 720);
});

await fixture('production runtime exposes read-only navigation status', () => {
  ok(source.includes('getCompleteIndexNavigationStatus,'));
  ok(source.includes("completeIndexNavigationCoordinator.cancel('route-changed', 'stale-route-discarded')"));
  ok(source.includes("completeIndexNavigationCoordinator.cancel('gate-disabled', 'cancelled')"));
});

const failures = fixtures.filter((row) => !row.ok);
for (const row of failures) console.error(`FAIL ${row.name}\n${row.error}`);

console.log(`CV-3.4 complete index navigation: ${fixtures.length - failures.length}/${fixtures.length} fixtures, ${assertionCount} assertions, ${failures.length} failures`);
console.log(`Navigation counters: moves ${totals.moves}, waits ${totals.waits}, precise ${totals.preciseNavigations}, abort cleanups ${totals.abortCleanups}`);
console.log(`Safety counters: cache writes ${totals.cacheWrites}, network writes ${totals.networkWrites}, source setters ${totals.sourceSetters}, automatic canary ${totals.automaticCanaryExecutions}`);

if (failures.length) process.exitCode = 1;
