#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const CORE_PATH = 'src-runtime-base/0A1a.⬛️🧠 H2O Core 🧠.js';
const coreSource = fs.readFileSync(path.join(ROOT, CORE_PATH), 'utf8');
const CHAT_ID = '6928b333-12f4-8328-9e41-6a01def45127';
const CHAT_B = '7928b333-12f4-8328-9e41-6a01def45128';
const Q29 = '29a40c98-0bd8-48cd-be80-0273311a4977';
const A545 = '54520999-dedf-4f01-8c60-ac8adcc2c066';
const D824 = 'd82467fb-21a4-41a4-b46d-446bf54a47ec';
const A84 = '84c7e73c-5fb7-44f6-a930-72e92d369c5a';
const A733 = '733fa31a-7d11-4ce5-b570-8ffa474670d4';
const HISTORICAL_Q = '7e60a524-96df-462c-a6c0-647ed1a9973c';
const LATEST_Q = 'c64afed8-cfde-4644-b0df-3407313c4c54';
const INTERNAL_QIDS = [
  '9111ad43-3734-4120-94fe-a34c9cd3a1cc',
  '3bdfa68f-a197-422a-a3d4-29f028fc6564',
  'e1d4b63f-0be7-4a51-b074-e3372b71d790',
  'aabc4cd2-9a33-4ba0-a721-110e8aa4e25b',
];

let assertionCount = 0;
const fixtures = [];
const runtimes = [];

function equal(actual, expected, message) {
  assertionCount += 1;
  const clean = (value) => value && typeof value === 'object'
    ? JSON.parse(JSON.stringify(value))
    : value;
  assert.deepEqual(clean(actual), clean(expected), message);
}

function ok(value, message) {
  assertionCount += 1;
  assert.ok(value, message);
}

async function fixture(name, fn) {
  try {
    await fn();
    fixtures.push({ name, ok: true });
  } catch (error) {
    fixtures.push({ name, ok: false, error: String(error?.stack || error) });
  }
}

function countOccurrences(source, needle) {
  return source.split(needle).length - 1;
}

function instrumentCore() {
  const setter = '  function setChatAtlasCanonicalSource(value) {\n';
  const marker = coreSource.split('\n').find((line) => line.includes('🟨 7) TIME / OBSERVERS')) || '';
  const close = '\n})();';
  const required = [
    'chatAtlasNormalizeCompleteIndexEnvelope',
    'chatAtlasCompareCompleteIndexRevision',
    'chatAtlasReadCompleteIndexCache',
    'chatAtlasWriteCompleteIndexCache',
    'chatAtlasCompleteIndexCanonicalDrafts',
    'chatAtlasTriggerCompleteIndexAuthority',
    'getCompleteTurnIndexProjectionStatus',
    'setCompleteTurnIndexProjectionCanary',
    'rebuildCompleteTurnIndexProjection',
  ];
  for (const name of required) {
    if (countOccurrences(coreSource, `  function ${name}(`) !== 1) {
      throw new Error(`authority-production-anchor-invalid:${name}`);
    }
  }
  if (countOccurrences(coreSource, setter) !== 1 || countOccurrences(coreSource, marker) !== 1) {
    throw new Error('authority-bootstrap-anchor-invalid');
  }
  let source = coreSource.replace(setter, `${setter}    globalThis.__AUTHORITY_SOURCE_SETTER_GUARD__();\n`);
  const markerIndex = source.indexOf(marker);
  const closeIndex = source.lastIndexOf(close);
  if (markerIndex < 0 || closeIndex <= markerIndex) throw new Error('authority-bootstrap-boundary-invalid');
  const exportBlock = `
  globalThis.__CV34_COMPLETE_INDEX_AUTHORITY__ = Object.freeze({
    fingerprint: chatAtlasCompleteIndexFingerprint,
    cacheKey: chatAtlasCompleteIndexCacheKey,
    normalize: chatAtlasNormalizeCompleteIndexEnvelope,
    compareRevision: chatAtlasCompareCompleteIndexRevision,
    readCache: chatAtlasReadCompleteIndexCache,
    writeCache: chatAtlasWriteCompleteIndexCache,
    canonicalDrafts: chatAtlasCompleteIndexCanonicalDrafts,
    trigger: chatAtlasTriggerFullConversationIndex,
    triggerAuthority: chatAtlasTriggerCompleteIndexAuthority,
    status: getCompleteTurnIndexProjectionStatus,
    setCanary: setCompleteTurnIndexProjectionCanary,
    rebuild: rebuildCompleteTurnIndexProjection,
    buildTurns,
    listTurns: listTurnRecords,
    setLegacyTurns(rows) { turnState.turns = Array.isArray(rows) ? rows.slice() : []; },
    state: completeTurnIndexAuthorityState,
    cacheSchema: COMPLETE_TURN_INDEX_CACHE_SCHEMA,
    cachePrefix: COMPLETE_TURN_INDEX_CACHE_KEY_PREFIX,
    canaryName: COMPLETE_TURN_INDEX_CANARY,
  });
  globalThis.__CV34_AUTHORITY_BOOTSTRAP_SUPPRESSED__ = true;`;
  return `${source.slice(0, markerIndex)}${exportBlock}${close}\n`;
}

const coreProgram = instrumentCore();

function createStorage(initial = new Map()) {
  const map = initial;
  const state = { reads: 0, writes: 0, removals: 0, failNextWrite: false };
  return {
    map,
    state,
    api: {
      getItem(key) {
        state.reads += 1;
        return map.has(String(key)) ? map.get(String(key)) : null;
      },
      setItem(key, value) {
        if (state.failNextWrite) {
          state.failNextWrite = false;
          throw new Error('fixture-write-failed');
        }
        state.writes += 1;
        map.set(String(key), String(value));
      },
      removeItem(key) {
        state.removals += 1;
        map.delete(String(key));
      },
      clear() {
        state.removals += map.size;
        map.clear();
      },
      key(index) { return Array.from(map.keys())[index] ?? null; },
      get length() { return map.size; },
    },
  };
}

function createRuntime({ chatId = CHAT_ID, storage = createStorage(), provider = null } = {}) {
  const counters = {
    sourceSetterCalls: 0,
    navigationMutations: 0,
    domMutations: 0,
    userActions: 0,
    automaticCanaryExecutions: 0,
    networkReads: 0,
    networkWrites: 0,
    minimapRebuilds: 0,
  };
  const location = {
    pathname: `/c/${chatId}`,
    href: `https://chatgpt.com/c/${chatId}`,
    origin: 'https://chatgpt.com',
    reload() { counters.navigationMutations += 1; throw new Error('navigation-forbidden'); },
  };
  const body = {
    isConnected: true,
    contains() { return false; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
  };
  const document = {
    location,
    body,
    documentElement: body,
    visibilityState: 'visible',
    querySelector() { return null; },
    querySelectorAll() { return []; },
    getElementById() { return null; },
    addEventListener() {},
    removeEventListener() {},
    createElement() { counters.domMutations += 1; throw new Error('dom-mutation-forbidden'); },
    createTextNode() { counters.domMutations += 1; throw new Error('dom-mutation-forbidden'); },
  };
  class HarnessEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } }
  class GuardedObserver { constructor() { counters.domMutations += 1; throw new Error('observer-forbidden'); } }
  let tick = 0;
  const sandbox = {
    __AUTHORITY_SOURCE_SETTER_GUARD__() { counters.sourceSetterCalls += 1; throw new Error('source-setter-forbidden'); },
    console: Object.freeze({ log() {}, warn() {}, error() {}, info() {}, debug() {} }),
    document,
    location,
    history: {
      pushState() { counters.navigationMutations += 1; throw new Error('navigation-forbidden'); },
      replaceState() { counters.navigationMutations += 1; throw new Error('navigation-forbidden'); },
    },
    navigator: Object.freeze({ userAgent: 'cv3.4-complete-index-authority-validator' }),
    performance: Object.freeze({ now() { tick += 0.25; return tick; } }),
    Date,
    URL,
    Event: HarnessEvent,
    CustomEvent: HarnessEvent,
    MutationObserver: GuardedObserver,
    ResizeObserver: GuardedObserver,
    IntersectionObserver: GuardedObserver,
    AbortController,
    requestAnimationFrame() { return 1; },
    cancelAnimationFrame() {},
    setTimeout() { return 1; },
    clearTimeout() {},
    setInterval() { return 1; },
    clearInterval() {},
    queueMicrotask,
    localStorage: storage.api,
    sessionStorage: createStorage().api,
    crypto: Object.freeze({ randomUUID() { return '00000000-0000-4000-8000-000000000001'; } }),
    fetch() { counters.networkReads += 1; throw new Error('unexpected-network-read'); },
    XMLHttpRequest: class { constructor() { counters.networkReads += 1; throw new Error('unexpected-xhr'); } },
    WebSocket: class { constructor() { counters.networkWrites += 1; throw new Error('unexpected-websocket'); } },
  };
  sandbox.addEventListener = () => {};
  sandbox.removeEventListener = () => {};
  sandbox.dispatchEvent = () => true;
  sandbox.H2O_MM_CORE_API = { scheduleRebuild() { counters.minimapRebuilds += 1; return true; }, getTurnList() { return []; } };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.top = sandbox;
  sandbox.globalThis = sandbox;
  const context = vm.createContext(sandbox, { codeGeneration: { strings: false, wasm: false } });
  vm.runInContext(coreProgram, context, { filename: CORE_PATH, timeout: 4_000 });
  equal(context.__CV34_AUTHORITY_BOOTSTRAP_SUPPRESSED__, true, 'Core observer/bootstrap is suppressed');
  if (provider) context.H2O.archiveBoot = { fetchConversationTurnIndex: provider };
  const runtime = { context, api: context.__CV34_COMPLETE_INDEX_AUTHORITY__, counters, storage, location };
  runtimes.push(runtime);
  return runtime;
}

function buildAcceptedRows() {
  const rows = [];
  for (let order = 1; order <= 38; order += 1) {
    let qId = `fixture-product-q-${String(order).padStart(2, '0')}`;
    let answerVariants = [`fixture-product-a-${String(order).padStart(2, '0')}`];
    let primaryAId = answerVariants[0];
    let noAnswer = false;
    let stopped = false;
    if (order === 20) {
      qId = HISTORICAL_Q;
      answerVariants = [];
      primaryAId = null;
      noAnswer = true;
      stopped = true;
    } else if (order === 29) {
      qId = Q29;
      answerVariants = [A545];
      primaryAId = A545;
    } else if (order === 34) {
      qId = D824;
      answerVariants = [A84, A733];
      primaryAId = A733;
    } else if (order === 38) {
      qId = LATEST_Q;
      answerVariants = [];
      primaryAId = null;
      noAnswer = true;
    }
    rows.push({ order, qId, turnId: `turn:${qId}`, answerVariants, primaryAId, noAnswer, stopped });
  }
  return rows;
}

function hostIndex(api, { chatId = CHAT_ID, revision = 200, rows = buildAcceptedRows(), capturedAt = '2026-07-18T10:00:00.000Z' } = {}) {
  return {
    schema: 1,
    chatId,
    capturedAt,
    payloadUpdateTime: revision,
    sourceFingerprint: api.fingerprint(rows),
    completeness: { complete: true, proof: 'host-payload-full-graph', validatedAt: capturedAt },
    turns: rows,
  };
}

function cacheEnvelope(api, options = {}) {
  const raw = hostIndex(api, options);
  const normalized = api.normalize(raw, raw.chatId, { source: 'host' });
  assert.equal(normalized.ok, true);
  return normalized.envelope;
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function rowByQId(runtime, qId) {
  return runtime.api.listTurns().find((row) => row.qId === qId) || null;
}

await fixture('gate defaults off with a memory-only status contract', () => {
  const runtime = createRuntime();
  const status = runtime.api.status();
  equal(status.enabled, false);
  equal(status.defaultEnabled, false);
  equal(status.memoryOnly, true);
  equal(status.status, 'disabled');
  equal(runtime.api.canaryName, 'complete-turn-index-projection');
});

await fixture('reload-like runtime recreation resets the gate off', () => {
  const first = createRuntime();
  first.api.setCanary(true);
  const second = createRuntime();
  equal(first.api.status().enabled, true);
  equal(second.api.status().enabled, false);
});

await fixture('disabled gate performs zero complete-index cache I/O', async () => {
  const runtime = createRuntime();
  await runtime.api.trigger();
  equal(runtime.storage.state.reads, 0);
  equal(runtime.storage.state.writes, 0);
  equal(runtime.api.status().setterCallCount, 0);
});

await fixture('cache key and schema are dedicated and chat-scoped', () => {
  const runtime = createRuntime();
  equal(runtime.api.cacheSchema, 1);
  equal(runtime.api.cacheKey(CHAT_ID), `${runtime.api.cachePrefix}${CHAT_ID}`);
  ok(!runtime.api.cacheKey(CHAT_ID).includes('turn_cache'), 'complete cache must not reuse MiniMap row-cache naming');
});

await fixture('valid complete cache publishes 38 canonical rows synchronously', () => {
  const storage = createStorage();
  const runtime = createRuntime({ storage });
  const envelope = cacheEnvelope(runtime.api);
  storage.map.set(runtime.api.cacheKey(CHAT_ID), JSON.stringify(envelope));
  runtime.api.setCanary(true);
  equal(runtime.api.status().status, 'complete-from-cache');
  equal(runtime.api.status().authoritative, true);
  equal(runtime.api.listTurns().length, 38);
  equal(runtime.api.listTurns().map((row) => row.turnNo), Array.from({ length: 38 }, (_v, index) => index + 1));
});

await fixture('cached projection is visible before asynchronous host validation', async () => {
  const storage = createStorage();
  const pending = deferred();
  const runtime = createRuntime({ storage, provider: () => pending.promise });
  const envelope = cacheEnvelope(runtime.api);
  storage.map.set(runtime.api.cacheKey(CHAT_ID), JSON.stringify(envelope));
  runtime.api.setCanary(true);
  equal(runtime.api.listTurns().length, 38);
  equal(runtime.api.status().status, 'complete-from-cache');
  pending.resolve({ ok: true, index: hostIndex(runtime.api) });
  await runtime.api.state.promise;
  equal(runtime.api.status().status, 'complete-validated');
});

await fixture('no cache enters loading without publishing partial canonical membership', () => {
  const pending = deferred();
  const runtime = createRuntime({ provider: () => pending.promise });
  runtime.api.setCanary(true);
  equal(runtime.api.status().status, 'loading-full-index');
  equal(runtime.api.status().authoritative, false);
  equal(runtime.api.listTurns().length, 0);
  pending.resolve({ ok: false, errorCode: 'fixture-cleanup' });
});

await fixture('valid host payload transitions loading to all 38 rows together', async () => {
  const pending = deferred();
  const runtime = createRuntime({ provider: () => pending.promise });
  runtime.api.setCanary(true);
  equal(runtime.api.listTurns().length, 0);
  pending.resolve({ ok: true, index: hostIndex(runtime.api) });
  await runtime.api.state.promise;
  equal(runtime.api.status().status, 'complete-from-host-payload');
  equal(runtime.api.listTurns().length, 38);
  equal(runtime.storage.state.writes, 1);
});

await fixture('matching payload fingerprint becomes complete-validated', async () => {
  const storage = createStorage();
  const runtime = createRuntime({ storage, provider: async () => ({ ok: true, index: hostIndex(runtime.api) }) });
  storage.map.set(runtime.api.cacheKey(CHAT_ID), JSON.stringify(cacheEnvelope(runtime.api)));
  runtime.api.setCanary(true);
  await runtime.api.state.promise;
  equal(runtime.api.status().status, 'complete-validated');
  equal(runtime.api.status().fingerprint, runtime.api.fingerprint(buildAcceptedRows()));
});

await fixture('valid cache plus payload failure becomes offline-complete-cache', async () => {
  const storage = createStorage();
  const runtime = createRuntime({ storage, provider: async () => ({ ok: false, errorCode: 'offline' }) });
  storage.map.set(runtime.api.cacheKey(CHAT_ID), JSON.stringify(cacheEnvelope(runtime.api)));
  runtime.api.setCanary(true);
  await runtime.api.state.promise;
  equal(runtime.api.status().status, 'offline-complete-cache');
  equal(runtime.api.listTurns().length, 38);
});

await fixture('no cache plus payload failure becomes full-index-unavailable', async () => {
  const runtime = createRuntime({ provider: async () => ({ ok: false, errorCode: 'offline' }) });
  runtime.api.setCanary(true);
  await runtime.api.state.promise;
  equal(runtime.api.status().status, 'full-index-unavailable');
  equal(runtime.api.listTurns().length, 0);
});

await fixture('partial legacy membership is labeled diagnostic-only after full-index failure', async () => {
  const runtime = createRuntime({ provider: async () => ({ ok: false, errorCode: 'offline' }) });
  runtime.api.setLegacyTurns([{ qId: 'legacy-q-1' }, { qId: 'legacy-q-2' }, { qId: 'legacy-q-3' }]);
  runtime.api.setCanary(true);
  await runtime.api.state.promise;
  equal(runtime.api.status().status, 'full-index-unavailable');
  equal(runtime.api.status().diagnosticStatus, 'partial-fallback-diagnostic-only');
});

await fixture('partial payload cannot replace complete cache bytes', async () => {
  const storage = createStorage();
  const runtime = createRuntime({ storage });
  const bytes = JSON.stringify(cacheEnvelope(runtime.api));
  storage.map.set(runtime.api.cacheKey(CHAT_ID), bytes);
  runtime.context.H2O.archiveBoot = { fetchConversationTurnIndex: async () => ({
    ok: true,
    index: { ...hostIndex(runtime.api), completeness: { complete: false, proof: 'partial' } },
  }) };
  runtime.api.setCanary(true);
  await runtime.api.state.promise;
  equal(storage.map.get(runtime.api.cacheKey(CHAT_ID)), bytes);
  equal(runtime.api.status().status, 'offline-complete-cache');
});

await fixture('malformed payload cannot replace complete cache bytes', async () => {
  const storage = createStorage();
  const runtime = createRuntime({ storage });
  const bytes = JSON.stringify(cacheEnvelope(runtime.api));
  storage.map.set(runtime.api.cacheKey(CHAT_ID), bytes);
  const malformed = hostIndex(runtime.api);
  malformed.turns = malformed.turns.slice(0, 37);
  runtime.context.H2O.archiveBoot = { fetchConversationTurnIndex: async () => ({ ok: true, index: malformed }) };
  runtime.api.setCanary(true);
  await runtime.api.state.promise;
  equal(storage.map.get(runtime.api.cacheKey(CHAT_ID)), bytes);
  equal(runtime.api.listTurns().length, 38);
});

await fixture('older payload revision cannot replace newer complete cache', async () => {
  const storage = createStorage();
  const runtime = createRuntime({ storage });
  const retainedRows = buildAcceptedRows();
  const retained = cacheEnvelope(runtime.api, { revision: 300, rows: retainedRows });
  const bytes = JSON.stringify(retained);
  storage.map.set(runtime.api.cacheKey(CHAT_ID), bytes);
  const olderRows = buildAcceptedRows();
  olderRows[0] = { ...olderRows[0], answerVariants: ['fixture-older-a'], primaryAId: 'fixture-older-a' };
  runtime.context.H2O.archiveBoot = { fetchConversationTurnIndex: async () => ({
    ok: true,
    index: hostIndex(runtime.api, { revision: 200, rows: olderRows }),
  }) };
  runtime.api.setCanary(true);
  await runtime.api.state.promise;
  equal(runtime.api.status().errorCode, 'older-host-payload');
  equal(storage.map.get(runtime.api.cacheKey(CHAT_ID)), bytes);
});

await fixture('newer valid payload atomically replaces cache and canonical rows', async () => {
  const storage = createStorage();
  const runtime = createRuntime({ storage });
  storage.map.set(runtime.api.cacheKey(CHAT_ID), JSON.stringify(cacheEnvelope(runtime.api, { revision: 100 })));
  const newerRows = buildAcceptedRows();
  newerRows[0] = { ...newerRows[0], answerVariants: ['fixture-newer-a'], primaryAId: 'fixture-newer-a' };
  runtime.context.H2O.archiveBoot = { fetchConversationTurnIndex: async () => ({
    ok: true,
    index: hostIndex(runtime.api, { revision: 200, rows: newerRows }),
  }) };
  runtime.api.setCanary(true);
  await runtime.api.state.promise;
  equal(runtime.api.status().status, 'complete-from-host-payload');
  equal(runtime.api.listTurns()[0].answerIds, ['fixture-newer-a']);
  equal(JSON.parse(storage.map.get(runtime.api.cacheKey(CHAT_ID))).payloadUpdateTime, 200);
});

await fixture('failed cache write preserves previous bytes while host stays complete in memory', async () => {
  const storage = createStorage();
  const runtime = createRuntime({ storage });
  const oldBytes = JSON.stringify(cacheEnvelope(runtime.api, { revision: 100 }));
  storage.map.set(runtime.api.cacheKey(CHAT_ID), oldBytes);
  const newerRows = buildAcceptedRows();
  newerRows[1] = { ...newerRows[1], answerVariants: ['fixture-write-fail-a'], primaryAId: 'fixture-write-fail-a' };
  runtime.context.H2O.archiveBoot = { fetchConversationTurnIndex: async () => ({
    ok: true,
    index: hostIndex(runtime.api, { revision: 200, rows: newerRows }),
  }) };
  storage.state.failNextWrite = true;
  runtime.api.setCanary(true);
  await runtime.api.state.promise;
  equal(storage.map.get(runtime.api.cacheKey(CHAT_ID)), oldBytes);
  equal(runtime.api.status().errorCode, 'cache-write-failed');
  equal(runtime.api.listTurns()[1].answerIds, ['fixture-write-fail-a']);
});

await fixture('unsupported cache schema is ignored and loading continues', () => {
  const storage = createStorage();
  const runtime = createRuntime({ storage });
  const invalid = { ...cacheEnvelope(runtime.api), schema: 99 };
  storage.map.set(runtime.api.cacheKey(CHAT_ID), JSON.stringify(invalid));
  runtime.api.setCanary(true);
  equal(runtime.api.status().status, 'loading-full-index');
  equal(runtime.api.status().errorCode, 'complete-index-schema-unsupported');
  equal(runtime.api.listTurns().length, 0);
});

await fixture('malformed cache is ignored without canonical mutation', () => {
  const storage = createStorage();
  const runtime = createRuntime({ storage });
  storage.map.set(runtime.api.cacheKey(CHAT_ID), '{bad-json');
  runtime.api.setCanary(true);
  equal(runtime.api.status().status, 'loading-full-index');
  equal(runtime.api.status().errorCode, 'cache-json-invalid');
  equal(runtime.api.listTurns().length, 0);
});

await fixture('cache privacy rejects extra text token payload and mapping fields', () => {
  const runtime = createRuntime();
  for (const field of ['text', 'title', 'token', 'authorization', 'mapping', 'payload', 'attachment', 'toolOutput']) {
    const raw = { ...cacheEnvelope(runtime.api), [field]: 'private' };
    equal(runtime.api.normalize(raw, CHAT_ID, { source: 'cache' }).ok, false, field);
  }
});

await fixture('cache privacy rejects extra per-turn private fields', () => {
  const runtime = createRuntime();
  const raw = JSON.parse(JSON.stringify(cacheEnvelope(runtime.api)));
  raw.turns[0].text = 'private';
  equal(runtime.api.normalize(raw, CHAT_ID, { source: 'cache' }).errorCode, 'complete-index-row-fields-invalid');
});

await fixture('contiguous order and exact turn identity are mandatory', () => {
  const runtime = createRuntime();
  const gap = JSON.parse(JSON.stringify(cacheEnvelope(runtime.api)));
  gap.turns[2].order = 9;
  equal(runtime.api.normalize(gap, CHAT_ID, { source: 'cache' }).ok, false);
  const badTurn = JSON.parse(JSON.stringify(cacheEnvelope(runtime.api)));
  badTurn.turns[2].turnId = 'turn:wrong';
  equal(runtime.api.normalize(badTurn, CHAT_ID, { source: 'cache' }).ok, false);
});

await fixture('duplicate qIds and cross-qId answer ownership fail closed', () => {
  const runtime = createRuntime();
  const duplicateQ = buildAcceptedRows();
  duplicateQ[1] = { ...duplicateQ[1], qId: duplicateQ[0].qId, turnId: duplicateQ[0].turnId };
  equal(runtime.api.normalize(hostIndex(runtime.api, { rows: duplicateQ }), CHAT_ID, { source: 'host' }).ok, false);
  const sharedAnswer = buildAcceptedRows();
  sharedAnswer[1] = { ...sharedAnswer[1], answerVariants: [sharedAnswer[0].primaryAId], primaryAId: sharedAnswer[0].primaryAId };
  equal(runtime.api.normalize(hostIndex(runtime.api, { rows: sharedAnswer }), CHAT_ID, { source: 'host' }).errorCode, 'complete-index-answer-ownership-conflict');
});

await fixture('completed placeholders cannot coexist with a real indexed answer', () => {
  const runtime = createRuntime();
  const rows = buildAcceptedRows();
  rows[0] = {
    ...rows[0],
    answerVariants: ['request-placeholder-fixture', rows[0].primaryAId],
  };
  equal(runtime.api.normalize(hostIndex(runtime.api, { rows }), CHAT_ID, { source: 'host' }).errorCode, 'complete-index-placeholder-invalid');
});

await fixture('NO ANSWER relationship mismatches fail closed', () => {
  const runtime = createRuntime();
  const rows = buildAcceptedRows();
  rows[0] = { ...rows[0], noAnswer: true };
  equal(runtime.api.normalize(hostIndex(runtime.api, { rows }), CHAT_ID, { source: 'host' }).errorCode, 'complete-index-no-answer-invalid');
});

await fixture('known internal context qIds are rejected from cached projection', () => {
  const runtime = createRuntime();
  for (const internalQId of INTERNAL_QIDS) {
    const rows = buildAcceptedRows();
    rows[0] = { ...rows[0], qId: internalQId, turnId: `turn:${internalQId}` };
    equal(runtime.api.normalize(hostIndex(runtime.api, { rows }), CHAT_ID, { source: 'host' }).ok, false, internalQId);
  }
});

await fixture('fingerprint is verified and deterministic', () => {
  const runtime = createRuntime();
  const rows = buildAcceptedRows();
  equal(runtime.api.fingerprint(rows), runtime.api.fingerprint(JSON.parse(JSON.stringify(rows))));
  const raw = hostIndex(runtime.api, { rows });
  raw.sourceFingerprint = 'djb2:forged';
  equal(runtime.api.normalize(raw, CHAT_ID, { source: 'host' }).errorCode, 'complete-index-fingerprint-invalid');
});

await fixture('q29 canonical ownership remains exact', () => {
  const storage = createStorage();
  const runtime = createRuntime({ storage });
  storage.map.set(runtime.api.cacheKey(CHAT_ID), JSON.stringify(cacheEnvelope(runtime.api)));
  runtime.api.setCanary(true);
  const row = rowByQId(runtime, Q29);
  equal(row.answerIds, [A545]);
  equal(row.primaryAId, A545);
  equal(row.noAnswer, false);
});

await fixture('d824 canonical variants and primary remain exact in one record', () => {
  const storage = createStorage();
  const runtime = createRuntime({ storage });
  storage.map.set(runtime.api.cacheKey(CHAT_ID), JSON.stringify(cacheEnvelope(runtime.api)));
  runtime.api.setCanary(true);
  const row = rowByQId(runtime, D824);
  equal(row.answerIds, [A84, A733]);
  equal(row.primaryAId, A733);
  equal(runtime.api.listTurns().filter((turn) => turn.qId === D824).length, 1);
});

await fixture('historical stopped NO ANSWER remains clean', () => {
  const storage = createStorage();
  const runtime = createRuntime({ storage });
  storage.map.set(runtime.api.cacheKey(CHAT_ID), JSON.stringify(cacheEnvelope(runtime.api)));
  runtime.api.setCanary(true);
  const row = rowByQId(runtime, HISTORICAL_Q);
  equal({ answerIds: row.answerIds, primaryAId: row.primaryAId, noAnswer: row.noAnswer, stopped: row.stopped }, {
    answerIds: [], primaryAId: null, noAnswer: true, stopped: true,
  });
});

await fixture('latest NO ANSWER remains clean and not stopped', () => {
  const storage = createStorage();
  const runtime = createRuntime({ storage });
  storage.map.set(runtime.api.cacheKey(CHAT_ID), JSON.stringify(cacheEnvelope(runtime.api)));
  runtime.api.setCanary(true);
  const row = rowByQId(runtime, LATEST_Q);
  equal({ answerIds: row.answerIds, primaryAId: row.primaryAId, noAnswer: row.noAnswer, stopped: row.stopped }, {
    answerIds: [], primaryAId: null, noAnswer: true, stopped: false,
  });
});

await fixture('canonical records carry bounded completeness provenance only', () => {
  const storage = createStorage();
  const runtime = createRuntime({ storage });
  storage.map.set(runtime.api.cacheKey(CHAT_ID), JSON.stringify(cacheEnvelope(runtime.api)));
  runtime.api.setCanary(true);
  const row = runtime.api.listTurns()[0];
  equal(row.completeIndexAuthority, true);
  equal(row.completenessProvenance, 'host-payload-full-graph');
  equal(row.completeIndexFingerprint, runtime.api.status().fingerprint);
  equal('text' in row, false);
  equal('payload' in row, false);
});

await fixture('complete authority rebuild cannot shrink from empty mounted evidence', () => {
  const storage = createStorage();
  const runtime = createRuntime({ storage });
  storage.map.set(runtime.api.cacheKey(CHAT_ID), JSON.stringify(cacheEnvelope(runtime.api)));
  runtime.api.setCanary(true);
  runtime.api.buildTurns([]);
  runtime.api.buildTurns([]);
  equal(runtime.api.listTurns().length, 38);
  equal(runtime.api.listTurns().map((row) => row.qId), buildAcceptedRows().map((row) => row.qId));
});

await fixture('complete authority evicts stale same-qId variants through merge machinery', () => {
  const runtime = createRuntime();
  const stale = buildAcceptedRows();
  const host = hostIndex(runtime.api, { rows: stale });
  const normalized = runtime.api.normalize(host, CHAT_ID, { source: 'host' }).envelope;
  runtime.api.state.enabled = true;
  runtime.api.state.status = 'complete-from-host-payload';
  runtime.api.state.index = normalized;
  runtime.api.state.indexSource = 'host-payload';
  runtime.api.buildTurns([]);
  equal(runtime.api.listTurns().length, 38);
  equal(runtime.api.listTurns()[0].answerIds, stale[0].answerVariants);
});

await fixture('route change discards stale host success', async () => {
  const first = deferred();
  const second = deferred();
  let call = 0;
  const runtime = createRuntime({ provider: () => (++call === 1 ? first.promise : second.promise) });
  runtime.api.setCanary(true);
  runtime.location.pathname = `/c/${CHAT_B}`;
  runtime.location.href = `https://chatgpt.com/c/${CHAT_B}`;
  runtime.api.triggerAuthority();
  first.resolve({ ok: true, index: hostIndex(runtime.api, { chatId: CHAT_ID }) });
  await Promise.resolve();
  second.resolve({ ok: true, index: hostIndex(runtime.api, { chatId: CHAT_B }) });
  await runtime.api.state.promise;
  equal(runtime.api.status().chatId, CHAT_B);
  equal(runtime.api.status().count, 38);
  ok(runtime.api.status().staleDiscardCount >= 1, 'stale route must be counted');
});

await fixture('same-route triggers deduplicate one provider acquisition', async () => {
  const pending = deferred();
  let calls = 0;
  const runtime = createRuntime({ provider: () => { calls += 1; return pending.promise; } });
  runtime.api.setCanary(true);
  const first = runtime.api.triggerAuthority();
  const second = runtime.api.triggerAuthority();
  equal(first, second);
  pending.resolve({ ok: true, index: hostIndex(runtime.api) });
  await first;
  equal(calls, 1);
  equal(runtime.api.status().fetchCount, 1);
});

await fixture('provider absence does not burn the route attempt', async () => {
  const runtime = createRuntime();
  runtime.api.setCanary(true);
  equal(runtime.api.state.attempted, false);
  runtime.context.H2O.archiveBoot = { fetchConversationTurnIndex: async () => ({ ok: true, index: hostIndex(runtime.api) }) };
  await runtime.api.triggerAuthority();
  equal(runtime.api.status().fetchCount, 1);
  equal(runtime.api.status().count, 38);
});

await fixture('disabling the gate rolls back to legacy projection on explicit rebuild', async () => {
  const storage = createStorage();
  const runtime = createRuntime({ storage });
  storage.map.set(runtime.api.cacheKey(CHAT_ID), JSON.stringify(cacheEnvelope(runtime.api)));
  runtime.api.setCanary(true);
  equal(runtime.api.listTurns().length, 38);
  runtime.api.setCanary(false);
  equal(runtime.api.status().status, 'disabled');
  equal(runtime.api.listTurns().length, 0);
  const reads = runtime.storage.state.reads;
  await runtime.api.trigger();
  equal(runtime.storage.state.reads, reads);
});

await fixture('enabling off-route affects the next recognized conversation route', async () => {
  const runtime = createRuntime({ chatId: CHAT_ID });
  runtime.location.pathname = '/';
  runtime.location.href = 'https://chatgpt.com/';
  runtime.api.setCanary(true);
  equal(runtime.api.status().chatId, null);
  runtime.location.pathname = `/c/${CHAT_ID}`;
  runtime.location.href = `https://chatgpt.com/c/${CHAT_ID}`;
  runtime.context.H2O.archiveBoot = { fetchConversationTurnIndex: async () => ({ ok: true, index: hostIndex(runtime.api) }) };
  await runtime.api.triggerAuthority();
  equal(runtime.api.status().count, 38);
});

await fixture('source default and active selection remain legacy durable cache', () => {
  const runtime = createRuntime();
  equal(runtime.context.H2O.turnRuntime.getChatAtlasCanonicalSource(), 'legacy-durable-cache');
  runtime.api.setCanary(true);
  equal(runtime.context.H2O.turnRuntime.getChatAtlasCanonicalSource(), 'legacy-durable-cache');
  equal(runtime.counters.sourceSetterCalls, 0);
});

await fixture('manual setter is the only canary setter path', () => {
  const runtime = createRuntime();
  equal(runtime.api.status().setterCallCount, 0);
  equal(runtime.api.status().automaticSetterCallCount, 0);
  runtime.api.setCanary(true);
  equal(runtime.api.status().setterCallCount, 1);
  equal(runtime.api.status().automaticSetterCallCount, 0);
});

await fixture('authority state exposes no raw private index', () => {
  const storage = createStorage();
  const runtime = createRuntime({ storage });
  storage.map.set(runtime.api.cacheKey(CHAT_ID), JSON.stringify(cacheEnvelope(runtime.api)));
  runtime.api.setCanary(true);
  const status = runtime.context.H2O.turnRuntime.getCompleteTurnIndexProjectionStatus();
  equal('turns' in status, false);
  equal('rawPayload' in status, false);
  equal('mapping' in status, false);
  equal(status.count, 38);
});

await fixture('revision comparison is deterministic across numeric and ISO forms', () => {
  const runtime = createRuntime();
  equal(runtime.api.compareRevision(200, 100), 1);
  equal(runtime.api.compareRevision('200', 200), 0);
  equal(runtime.api.compareRevision('2026-07-18T10:00:00Z', '2026-07-17T10:00:00Z'), 1);
  equal(runtime.api.compareRevision(null, 100), -1);
});

await fixture('all side-effect and automatic-canary counters remain bounded', () => {
  const aggregate = runtimes.reduce((out, runtime) => {
    for (const [key, value] of Object.entries(runtime.counters)) out[key] = (out[key] || 0) + value;
    return out;
  }, {});
  equal(aggregate.sourceSetterCalls || 0, 0);
  equal(aggregate.navigationMutations || 0, 0);
  equal(aggregate.domMutations || 0, 0);
  equal(aggregate.userActions || 0, 0);
  equal(aggregate.automaticCanaryExecutions || 0, 0);
  equal(aggregate.networkReads || 0, 0);
  equal(aggregate.networkWrites || 0, 0);
});

const failures = fixtures.filter((row) => !row.ok);
const totals = runtimes.reduce((out, runtime) => {
  out.cacheReads += runtime.storage.state.reads;
  out.cacheWrites += runtime.storage.state.writes;
  out.cacheRemovals += runtime.storage.state.removals;
  out.setterCalls += runtime.api.status().setterCallCount;
  out.automaticSetterCalls += runtime.api.status().automaticSetterCallCount;
  out.navigation += runtime.counters.navigationMutations;
  out.dom += runtime.counters.domMutations;
  out.userActions += runtime.counters.userActions;
  out.networkReads += runtime.counters.networkReads;
  out.networkWrites += runtime.counters.networkWrites;
  return out;
}, {
  cacheReads: 0,
  cacheWrites: 0,
  cacheRemovals: 0,
  setterCalls: 0,
  automaticSetterCalls: 0,
  navigation: 0,
  dom: 0,
  userActions: 0,
  networkReads: 0,
  networkWrites: 0,
});

console.log(`CV-3.4 complete index authority: ${fixtures.length - failures.length}/${fixtures.length} fixtures, ${assertionCount} assertions, ${failures.length} failures`);
console.log(`Counters: cache reads ${totals.cacheReads}, writes ${totals.cacheWrites}, removals ${totals.cacheRemovals}; setters ${totals.setterCalls} explicit, ${totals.automaticSetterCalls} automatic`);
console.log(`Safety: navigation ${totals.navigation}, DOM ${totals.dom}, user actions ${totals.userActions}, network reads ${totals.networkReads}, network writes ${totals.networkWrites}`);
for (const failure of failures) console.error(`FAIL ${failure.name}\n${failure.error}`);
if (failures.length) process.exitCode = 1;
