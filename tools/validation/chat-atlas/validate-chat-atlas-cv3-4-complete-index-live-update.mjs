#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const corePath = 'src-runtime-base/0A1a.⬛️🧠 H2O Core 🧠.js';
const miniMapPath = 'src-runtime-base/1A1b.🟥🗺️ MiniMap Core 🧱🗺️.js';
const coreSource = fs.readFileSync(path.join(root, corePath), 'utf8');
const miniMapSource = fs.readFileSync(path.join(root, miniMapPath), 'utf8');
const CHAT_ID = '6928b333-12f4-8328-9e41-6a01def45127';
const Q29 = '29a40c98-0bd8-48cd-be80-0273311a4977';
const A545 = '54520999-dedf-4f01-8c60-ac8adcc2c066';
const D824 = 'd82467fb-21a4-41a4-b46d-446bf54a47ec';
const A84 = '84c7e73c-5fb7-44f6-a930-72e92d369c5a';
const A733 = '733fa31a-7d11-4ce5-b570-8ffa474670d4';
const HISTORICAL_Q = '7e60a524-96df-462c-a6c0-647ed1a9973c';
const LATEST_Q = 'c64afed8-cfde-4644-b0df-3407313c4c54';
const INTERNAL_Q = 'aabc4cd2-9a33-4ba0-a721-110e8aa4e25b';
const NEW_Q = 'f64afed8-cfde-4644-b0df-3407313c4c55';
const NEW_A = 'f64afed8-cfde-4644-b0df-3407313c4c56';

let assertionCount = 0;
const fixtures = [];
const runtimes = [];
const clean = (value) => value && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : value;
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

function instrumentCore() {
  const marker = coreSource.split('\n').find((line) => line.includes('🟨 7) TIME / OBSERVERS')) || '';
  const close = '\n})();';
  const markerIndex = coreSource.indexOf(marker);
  const closeIndex = coreSource.lastIndexOf(close);
  if (markerIndex < 0 || closeIndex <= markerIndex) throw new Error('live-update-bootstrap-boundary-invalid');
  const required = [
    'createCompleteIndexRefreshCoordinator',
    'chatAtlasCompleteIndexLiveDrafts',
    'chatAtlasNormalizeCompleteIndexEnvelope',
    'chatAtlasWriteCompleteIndexCache',
    'chatAtlasPublishCompleteIndex',
    'refreshCompleteTurnIndexProjection',
    'chatAtlasBindCompleteIndexRefreshListeners',
  ];
  for (const name of required) {
    if (coreSource.split(`function ${name}(`).length - 1 !== 1) throw new Error(`live-update-production-anchor-invalid:${name}`);
  }
  const exportBlock = `
  globalThis.__CV34_COMPLETE_INDEX_LIVE_UPDATE__ = Object.freeze({
    fingerprint: chatAtlasCompleteIndexFingerprint,
    normalize: chatAtlasNormalizeCompleteIndexEnvelope,
    writeCache: chatAtlasWriteCompleteIndexCache,
    liveDrafts: chatAtlasCompleteIndexLiveDrafts,
    pendingCanonical: chatAtlasCompleteIndexPendingCanonicalDrafts,
    pendingEligible: chatAtlasCompleteIndexPendingDraftEligible,
    buildTurns,
    listTurns: listTurnRecords,
    status: getCompleteTurnIndexProjectionStatus,
    refresh: refreshCompleteTurnIndexProjection,
    scheduleRefresh: chatAtlasScheduleCompleteIndexRefresh,
    bindListeners: chatAtlasBindCompleteIndexRefreshListeners,
    resetRoute: chatAtlasResetCompleteIndexRoute,
    state: completeTurnIndexAuthorityState,
    coordinator: () => completeIndexRefreshCoordinator,
  });
  globalThis.__CV34_LIVE_UPDATE_BOOTSTRAP_SUPPRESSED__ = true;`;
  return `${coreSource.slice(0, markerIndex)}${exportBlock}${close}\n`;
}

const coreProgram = instrumentCore();

function createStorage() {
  const map = new Map();
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
          throw new Error('fixture-cache-write-failed');
        }
        state.writes += 1;
        map.set(String(key), String(value));
      },
      removeItem(key) { state.removals += 1; map.delete(String(key)); },
      clear() { state.removals += map.size; map.clear(); },
      key(index) { return Array.from(map.keys())[index] ?? null; },
      get length() { return map.size; },
    },
  };
}

function createRuntime() {
  const storage = createStorage();
  const timers = new Map();
  const counters = {
    networkReads: 0,
    networkWrites: 0,
    navigationMutations: 0,
    domMutations: 0,
    setterCalls: 0,
    automaticCanaryExecutions: 0,
    timerSchedules: 0,
    timerClears: 0,
    eventListenerRegistrations: 0,
  };
  let timerId = 0;
  let providerImpl = async () => ({ ok: false, errorCode: 'fixture-provider-unset' });
  const location = {
    pathname: `/c/${CHAT_ID}`,
    href: `https://chatgpt.com/c/${CHAT_ID}`,
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
  const sandbox = {
    console: Object.freeze({ log() {}, warn() {}, error() {}, info() {}, debug() {} }),
    document,
    location,
    history: {
      pushState() { counters.navigationMutations += 1; throw new Error('navigation-forbidden'); },
      replaceState() { counters.navigationMutations += 1; throw new Error('navigation-forbidden'); },
    },
    navigator: Object.freeze({ userAgent: 'cv3.4-complete-index-live-update-validator' }),
    performance: Object.freeze({ now: () => 1 }),
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
    setTimeout(fn, ms = 0) {
      timerId += 1;
      counters.timerSchedules += 1;
      timers.set(timerId, { fn, ms: Number(ms || 0) });
      return timerId;
    },
    clearTimeout(id) {
      if (timers.delete(id)) counters.timerClears += 1;
    },
    setInterval() { return 1; },
    clearInterval() {},
    queueMicrotask,
    localStorage: storage.api,
    sessionStorage: createStorage().api,
    crypto: Object.freeze({ randomUUID: () => '00000000-0000-4000-8000-000000000001' }),
    fetch() { counters.networkReads += 1; throw new Error('unexpected-fetch'); },
    XMLHttpRequest: class { constructor() { counters.networkReads += 1; throw new Error('unexpected-xhr'); } },
    WebSocket: class { constructor() { counters.networkWrites += 1; throw new Error('unexpected-websocket'); } },
  };
  sandbox.addEventListener = () => { counters.eventListenerRegistrations += 1; };
  sandbox.removeEventListener = () => {};
  sandbox.dispatchEvent = () => true;
  sandbox.H2O_MM_CORE_API = { scheduleRebuild() { return true; }, getTurnList() { return []; } };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.top = sandbox;
  sandbox.globalThis = sandbox;
  const context = vm.createContext(sandbox, { codeGeneration: { strings: false, wasm: false } });
  vm.runInContext(coreProgram, context, { filename: corePath, timeout: 5_000 });
  equal(context.__CV34_LIVE_UPDATE_BOOTSTRAP_SUPPRESSED__, true);
  context.H2O.archiveBoot = {
    fetchConversationTurnIndex(chatId, opts) {
      counters.networkReads += 1;
      return providerImpl(chatId, opts);
    },
  };
  const runtime = {
    api: context.__CV34_COMPLETE_INDEX_LIVE_UPDATE__,
    context,
    storage,
    timers,
    counters,
    setProvider(fn) { providerImpl = fn; },
    runTimerByMs(ms) {
      const entry = Array.from(timers.entries()).find(([, row]) => row.ms === ms);
      if (!entry) return false;
      const [id, row] = entry;
      timers.delete(id);
      row.fn();
      return true;
    },
  };
  runtimes.push(runtime);
  return runtime;
}

function buildRows(count = 38) {
  const rows = [];
  for (let order = 1; order <= count; order += 1) {
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

function hostIndex(api, rows, revision = 200) {
  return {
    schema: 1,
    chatId: CHAT_ID,
    capturedAt: '2026-07-18T12:00:00.000Z',
    payloadUpdateTime: revision,
    sourceFingerprint: api.fingerprint(rows),
    completeness: {
      complete: true,
      proof: 'host-payload-full-graph',
      validatedAt: '2026-07-18T12:00:00.000Z',
    },
    turns: rows,
  };
}

function seed(runtime, rows = buildRows(), revision = 200) {
  const normalized = runtime.api.normalize(hostIndex(runtime.api, rows, revision), CHAT_ID, { source: 'host' });
  equal(normalized.ok, true);
  runtime.api.state.enabled = true;
  runtime.api.state.status = 'complete-validated';
  runtime.api.state.chatId = CHAT_ID;
  runtime.api.state.routeKey = `/c/${CHAT_ID}`;
  runtime.api.state.generation = 1;
  runtime.api.state.index = normalized.envelope;
  runtime.api.state.indexSource = 'fixture-proven';
  const write = runtime.api.writeCache(normalized.envelope);
  equal(write.ok, true);
  runtime.api.buildTurns();
  return normalized.envelope;
}

function liveDraft(qId, answerIds = [], opts = {}) {
  const primaryAId = answerIds.length ? answerIds[answerIds.length - 1] : null;
  return {
    turnNo: 39,
    qId,
    primaryAId,
    answerIds: answerIds.slice(),
    aliasIds: [`turn:${qId}`, ...answerIds],
    noAnswer: opts.noAnswer === true,
    stopped: opts.stopped === true,
    structure: {
      segmentId: 1,
      flowIdentity: 'fixture-live-flow',
      structureKnown: true,
      selectedPathEligible: true,
      pairingContiguous: true,
      currentQuestionProof: true,
      unpairedAssistant: false,
      questionOrdinal: 39,
      answerOrdinals: answerIds.map((_id, index) => 40 + index),
    },
    live: {
      qEl: { isConnected: true },
      primaryAEl: answerIds.length ? { isConnected: true } : null,
      answerEls: answerIds.map(() => ({ isConnected: true })),
      connected: true,
    },
  };
}

function appendRow(rows, row) {
  return [...rows, { ...row, order: rows.length + 1, turnId: `turn:${row.qId}` }];
}

function cacheBytes(runtime) {
  const key = runtime.api.status().cache.key;
  return runtime.storage.map.get(key) || null;
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

await fixture('existing 38 complete rows remain stable before update', () => {
  const runtime = createRuntime();
  seed(runtime);
  equal(runtime.api.listTurns().length, 38);
  equal(runtime.api.status().projectedCount, 38);
});

await fixture('new qId creates exactly one live pending row', async () => {
  const runtime = createRuntime();
  seed(runtime);
  runtime.api.liveDrafts([liveDraft(NEW_Q)], runtime.api.state.index);
  await Promise.resolve();
  runtime.api.buildTurns();
  equal(runtime.api.state.pendingDrafts.size, 1);
  equal(runtime.api.listTurns().length, 39);
  equal(runtime.api.listTurns()[38].completeIndexPending, true);
});

await fixture('duplicate pending scans do not duplicate the row', () => {
  const runtime = createRuntime();
  seed(runtime);
  runtime.api.liveDrafts([liveDraft(NEW_Q)], runtime.api.state.index);
  runtime.api.liveDrafts([liveDraft(NEW_Q)], runtime.api.state.index);
  runtime.api.buildTurns();
  equal(runtime.api.state.pendingDrafts.size, 1);
  equal(runtime.api.listTurns().filter((row) => row.qId === NEW_Q).length, 1);
});

await fixture('pending row is never persisted into complete-index cache', () => {
  const runtime = createRuntime();
  seed(runtime);
  const before = cacheBytes(runtime);
  const cacheKey = runtime.api.status().cache.key;
  runtime.api.liveDrafts([liveDraft(NEW_Q)], runtime.api.state.index);
  runtime.api.buildTurns();
  equal(runtime.storage.map.get(cacheKey), before);
  equal(JSON.parse(cacheBytes(runtime)).turns.length, 38);
});

await fixture('streaming request placeholder remains temporary live state', () => {
  const runtime = createRuntime();
  seed(runtime);
  const placeholder = 'request-placeholder-fixture-live';
  runtime.api.liveDrafts([liveDraft(NEW_Q, [placeholder])], runtime.api.state.index);
  runtime.api.buildTurns();
  const pending = runtime.api.listTurns()[38];
  equal(pending.primaryAId, placeholder);
  equal(pending.livePendingStreaming, true);
  equal(cacheBytes(runtime).includes(placeholder), false);
});

await fixture('streaming fragments retain one logical pending box row', () => {
  const runtime = createRuntime();
  seed(runtime);
  runtime.api.liveDrafts([liveDraft(NEW_Q, ['request-placeholder-one'])], runtime.api.state.index);
  runtime.api.liveDrafts([liveDraft(NEW_Q, ['request-placeholder-two'])], runtime.api.state.index);
  runtime.api.buildTurns();
  equal(runtime.api.listTurns().length, 39);
  equal(runtime.api.listTurns().filter((row) => row.qId === NEW_Q).length, 1);
});

await fixture('completion events debounce to one refresh timer', async () => {
  const runtime = createRuntime();
  seed(runtime);
  runtime.api.liveDrafts([liveDraft(NEW_Q, ['request-placeholder-live'])], runtime.api.state.index);
  runtime.api.liveDrafts([liveDraft(NEW_Q, [NEW_A])], runtime.api.state.index);
  runtime.api.liveDrafts([liveDraft(NEW_Q, [NEW_A])], runtime.api.state.index);
  await Promise.resolve();
  equal(runtime.api.status().refreshDebounceCount, 1);
  equal(Array.from(runtime.timers.values()).filter((row) => row.ms === 280).length, 1);
});

await fixture('repeated completion causes do not create fetch storms', async () => {
  const runtime = createRuntime();
  seed(runtime);
  runtime.setProvider(async () => ({ ok: false, errorCode: 'fixture-unavailable' }));
  await runtime.api.scheduleRefresh('turn-settled');
  await runtime.api.scheduleRefresh('turn-settled');
  equal(runtime.api.status().refreshDebounceCount, 1);
  equal(runtime.api.status().refreshCoalescedCount >= 1, true);
});

await fixture('valid completion refresh transitions 38 plus pending to proven 39', async () => {
  const runtime = createRuntime();
  const rows = buildRows();
  seed(runtime, rows, 200);
  runtime.api.liveDrafts([liveDraft(NEW_Q, ['request-placeholder-live'])], runtime.api.state.index);
  runtime.api.buildTurns();
  const rows39 = appendRow(rows, { qId: NEW_Q, answerVariants: [NEW_A], primaryAId: NEW_A, noAnswer: false, stopped: false });
  runtime.setProvider(async () => ({ ok: true, index: hostIndex(runtime.api, rows39, 201) }));
  const status = await runtime.api.refresh('fixture-complete');
  equal(status.status, 'complete-refresh-validated');
  equal(runtime.api.listTurns().length, 39);
  equal(runtime.api.state.pendingDrafts.size, 0);
});

await fixture('new complete cache atomically contains 39 proven rows', async () => {
  const runtime = createRuntime();
  const rows = buildRows();
  seed(runtime, rows, 200);
  const rows39 = appendRow(rows, { qId: NEW_Q, answerVariants: [NEW_A], primaryAId: NEW_A, noAnswer: false, stopped: false });
  runtime.setProvider(async () => ({ ok: true, index: hostIndex(runtime.api, rows39, 201) }));
  await runtime.api.refresh('fixture-cache-39');
  const cached = JSON.parse(cacheBytes(runtime));
  equal(cached.turns.length, 39);
  equal(cached.turns[38].qId, NEW_Q);
});

await fixture('completed placeholder is evicted from canonical and cache state', async () => {
  const runtime = createRuntime();
  const rows = buildRows();
  seed(runtime, rows, 200);
  runtime.api.liveDrafts([liveDraft(NEW_Q, ['request-placeholder-live'])], runtime.api.state.index);
  runtime.api.buildTurns();
  const rows39 = appendRow(rows, { qId: NEW_Q, answerVariants: [NEW_A], primaryAId: NEW_A, noAnswer: false, stopped: false });
  runtime.setProvider(async () => ({ ok: true, index: hostIndex(runtime.api, rows39, 201) }));
  await runtime.api.refresh('fixture-placeholder-eviction');
  equal(JSON.stringify(runtime.api.listTurns()).includes('request-placeholder-'), false);
  equal(cacheBytes(runtime).includes('request-placeholder-'), false);
});

await fixture('refresh failure preserves complete cache bytes', async () => {
  const runtime = createRuntime();
  seed(runtime);
  const before = cacheBytes(runtime);
  runtime.setProvider(async () => ({ ok: false, errorCode: 'fixture-offline' }));
  const status = await runtime.api.refresh('fixture-failure');
  equal(status.status, 'complete-refresh-failed-cache-preserved');
  equal(cacheBytes(runtime), before);
});

await fixture('refresh failure preserves a newer pending overlay', async () => {
  const runtime = createRuntime();
  seed(runtime);
  runtime.api.liveDrafts([liveDraft(NEW_Q, ['request-placeholder-live'])], runtime.api.state.index);
  runtime.api.buildTurns();
  runtime.setProvider(async () => ({ ok: false, errorCode: 'fixture-offline' }));
  await runtime.api.refresh('fixture-pending-failure');
  equal(runtime.api.listTurns().length, 39);
  equal(runtime.api.listTurns()[38].qId, NEW_Q);
});

await fixture('explicit stopped refresh yields clean stopped NO ANSWER', async () => {
  const runtime = createRuntime();
  const rows = buildRows();
  seed(runtime, rows, 200);
  const rows39 = appendRow(rows, { qId: NEW_Q, answerVariants: [], primaryAId: null, noAnswer: true, stopped: true });
  runtime.setProvider(async () => ({ ok: true, index: hostIndex(runtime.api, rows39, 201) }));
  await runtime.api.refresh('fixture-stopped');
  const row = runtime.api.listTurns()[38];
  equal([row.answerIds, row.primaryAId, row.noAnswer, row.stopped], [[], null, true, true]);
});

await fixture('empty-child NO ANSWER remains stopped false', async () => {
  const runtime = createRuntime();
  const rows = buildRows();
  seed(runtime, rows, 200);
  const rows39 = appendRow(rows, { qId: NEW_Q, answerVariants: [], primaryAId: null, noAnswer: true, stopped: false });
  runtime.setProvider(async () => ({ ok: true, index: hostIndex(runtime.api, rows39, 201) }));
  await runtime.api.refresh('fixture-empty-no-answer');
  const row = runtime.api.listTurns()[38];
  equal([row.answerIds, row.primaryAId, row.noAnswer, row.stopped], [[], null, true, false]);
});

await fixture('branch switch changes selected primary without changing count', async () => {
  const runtime = createRuntime();
  const rows = buildRows();
  seed(runtime, rows, 200);
  const switched = rows.map((row) => row.qId === D824 ? { ...row, answerVariants: [A733, A84], primaryAId: A84 } : row);
  runtime.setProvider(async () => ({ ok: true, index: hostIndex(runtime.api, switched, 201) }));
  await runtime.api.refresh('fixture-branch-switch');
  const row = runtime.api.listTurns().find((value) => value.qId === D824);
  equal(runtime.api.listTurns().length, 38);
  equal([row.answerIds, row.primaryAId], [[A733, A84], A84]);
});

await fixture('regeneration adds a variant but not a box', async () => {
  const runtime = createRuntime();
  const rows = buildRows();
  seed(runtime, rows, 200);
  const regeneratedA = '64520999-dedf-4f01-8c60-ac8adcc2c067';
  const regenerated = rows.map((row) => row.qId === Q29
    ? { ...row, answerVariants: [A545, regeneratedA], primaryAId: regeneratedA }
    : row);
  runtime.setProvider(async () => ({ ok: true, index: hostIndex(runtime.api, regenerated, 201) }));
  await runtime.api.refresh('fixture-regenerate');
  const row = runtime.api.listTurns().find((value) => value.qId === Q29);
  equal(runtime.api.listTurns().length, 38);
  equal(row.answerIds, [A545, regeneratedA]);
});

await fixture('edited-question selected path replaces atomically after proof', async () => {
  const runtime = createRuntime();
  const rows = buildRows();
  seed(runtime, rows, 200);
  const before = runtime.api.listTurns().map((row) => row.qId);
  const editedQ = 'edited-product-q-10';
  const edited = rows.map((row) => row.order === 10
    ? { ...row, qId: editedQ, turnId: `turn:${editedQ}`, answerVariants: ['edited-a-10'], primaryAId: 'edited-a-10' }
    : row);
  runtime.setProvider(async () => ({ ok: true, index: hostIndex(runtime.api, edited, 201) }));
  const pending = runtime.api.refresh('fixture-edit');
  equal(runtime.api.listTurns().map((row) => row.qId), before);
  await pending;
  equal(runtime.api.listTurns()[9].qId, editedQ);
  equal(runtime.api.listTurns().length, 38);
});

await fixture('older payload cannot replace newer complete cache', async () => {
  const runtime = createRuntime();
  const rows = buildRows();
  seed(runtime, rows, 300);
  const before = cacheBytes(runtime);
  runtime.setProvider(async () => ({ ok: true, index: hostIndex(runtime.api, rows, 299) }));
  const status = await runtime.api.refresh('fixture-older');
  equal(status.errorCode, 'older-host-payload');
  equal(cacheBytes(runtime), before);
});

await fixture('stale response after route change is discarded', async () => {
  const runtime = createRuntime();
  const rows = buildRows();
  seed(runtime, rows, 200);
  const before = cacheBytes(runtime);
  const originalCacheKey = runtime.api.status().cache.key;
  const pending = deferred();
  runtime.setProvider(() => pending.promise);
  const refresh = runtime.api.refresh('fixture-stale-route');
  runtime.api.resetRoute({ chatId: 'next-chat', routeKey: 'chat:next-chat' }, true);
  pending.resolve({ ok: true, index: hostIndex(runtime.api, rows, 201) });
  await refresh;
  equal(runtime.storage.map.get(originalCacheKey), before);
  equal(runtime.api.state.chatId, 'next-chat');
});

await fixture('internal user cannot create a pending row', () => {
  const runtime = createRuntime();
  seed(runtime);
  runtime.api.liveDrafts([liveDraft(INTERNAL_Q)], runtime.api.state.index);
  equal(runtime.api.state.pendingDrafts.size, 0);
});

await fixture('unproven live context identity cannot directly mutate an indexed answer', () => {
  const runtime = createRuntime();
  seed(runtime);
  const before = clean(runtime.api.state.index.turns.find((row) => row.qId === Q29));
  runtime.api.liveDrafts([liveDraft(Q29, ['context-reasoning-fragment'])], runtime.api.state.index);
  equal(runtime.api.state.index.turns.find((row) => row.qId === Q29), before);
  equal(cacheBytes(runtime).includes('context-reasoning-fragment'), false);
});

await fixture('d824 accepted variants and primary remain exact', () => {
  const runtime = createRuntime();
  seed(runtime);
  const row = runtime.api.listTurns().find((value) => value.qId === D824);
  equal([row.answerIds, row.primaryAId], [[A84, A733], A733]);
});

await fixture('q29 accepted ownership remains exact', () => {
  const runtime = createRuntime();
  seed(runtime);
  const row = runtime.api.listTurns().find((value) => value.qId === Q29);
  equal([row.answerIds, row.primaryAId], [[A545], A545]);
});

await fixture('historical stopped NO ANSWER remains exact', () => {
  const runtime = createRuntime();
  seed(runtime);
  const row = runtime.api.listTurns().find((value) => value.qId === HISTORICAL_Q);
  equal([row.answerIds, row.primaryAId, row.noAnswer, row.stopped], [[], null, true, true]);
});

await fixture('latest clean NO ANSWER remains exact', () => {
  const runtime = createRuntime();
  seed(runtime);
  const row = runtime.api.listTurns().find((value) => value.qId === LATEST_Q);
  equal([row.answerIds, row.primaryAId, row.noAnswer, row.stopped], [[], null, true, false]);
});

await fixture('gate disabled performs zero complete-index update work', async () => {
  const runtime = createRuntime();
  const status = await runtime.api.refresh('fixture-disabled');
  equal(status.status, 'disabled');
  equal(runtime.counters.networkReads, 0);
  equal(runtime.storage.state.writes, 0);
});

await fixture('no automatic setter calls occur', () => {
  equal(runtimes.reduce((sum, runtime) => sum + runtime.api.status().automaticSetterCallCount, 0), 0);
});

await fixture('update fixtures perform no navigation mutation', () => {
  equal(runtimes.reduce((sum, runtime) => sum + runtime.counters.navigationMutations, 0), 0);
});

await fixture('authorized provider remains GET-only with no network write', () => {
  equal(runtimes.reduce((sum, runtime) => sum + runtime.counters.networkWrites, 0), 0);
});

await fixture('cache and diagnostics remain IDs-only and content-free', () => {
  const runtime = createRuntime();
  seed(runtime);
  const combined = `${cacheBytes(runtime)}${JSON.stringify(runtime.api.status())}`;
  equal(/authorization|token|rawPayload|mapping|messageText|attachment|toolOutput/i.test(combined), false);
  equal(Object.prototype.hasOwnProperty.call(runtime.api.status(), 'turns'), false);
});

await fixture('listener registration remains idempotent', () => {
  const runtime = createRuntime();
  equal(runtime.api.bindListeners(), true);
  equal(runtime.api.bindListeners(), true);
  equal(runtime.api.state.refreshListenerRegistrationCount, 1);
});

await fixture('timers and abort controllers clean up after completion', async () => {
  const runtime = createRuntime();
  const rows = buildRows();
  seed(runtime, rows, 200);
  runtime.setProvider(async () => ({ ok: true, index: hostIndex(runtime.api, rows, 201) }));
  await runtime.api.refresh('fixture-cleanup');
  equal(runtime.api.status().refreshTimerPending, false);
  equal(runtime.api.status().refreshRequestActive, false);
  equal(runtime.timers.size, 0);
});

await fixture('cache write failure preserves prior bytes and publishes unpersisted proven authority', async () => {
  const runtime = createRuntime();
  const rows = buildRows();
  seed(runtime, rows, 200);
  const beforeBytes = cacheBytes(runtime);
  const rows39 = appendRow(rows, { qId: NEW_Q, answerVariants: [NEW_A], primaryAId: NEW_A, noAnswer: false, stopped: false });
  runtime.storage.state.failNextWrite = true;
  runtime.setProvider(async () => ({ ok: true, index: hostIndex(runtime.api, rows39, 201) }));
  const status = await runtime.api.refresh('fixture-write-failure');
  equal(status.status, 'complete-refresh-validated');
  equal(cacheBytes(runtime), beforeBytes);
  equal(runtime.api.listTurns().map((row) => row.qId), rows39.map((row) => row.qId));
  equal(status.authorityUnpersisted, true);
  equal(status.cacheWriteErrorCode, 'cache-write-failed');
});

await fixture('MiniMap projection uses complete plus pending count without changing proof', () => {
  ok(miniMapSource.includes('runtimeCanonical?.list?.length === completeIndex.projectedCount'));
  ok(miniMapSource.includes('list.length !== completeIndex.projectedCount'));
  ok(miniMapSource.includes("livePendingProvenance: record?.completeIndexPending === true ? 'live-pending-overlay' : null"));
});

const failures = fixtures.filter((row) => !row.ok);
for (const row of failures) console.error(`FAIL ${row.name}\n${row.error}`);

for (const runtime of runtimes) {
  runtime.api.coordinator()?.cancel?.('validator-cleanup', 'idle');
}

const totals = runtimes.reduce((out, runtime) => {
  out.networkReads += runtime.counters.networkReads;
  out.networkWrites += runtime.counters.networkWrites;
  out.cacheReads += runtime.storage.state.reads;
  out.cacheWrites += runtime.storage.state.writes;
  out.cacheRemovals += runtime.storage.state.removals;
  out.domMutations += runtime.counters.domMutations;
  out.navigationMutations += runtime.counters.navigationMutations;
  out.timerSchedules += runtime.counters.timerSchedules;
  out.timerClears += runtime.counters.timerClears;
  out.activeTimers += runtime.timers.size;
  out.automaticCanaryExecutions += runtime.api.status().automaticSetterCallCount;
  return out;
}, {
  networkReads: 0,
  networkWrites: 0,
  cacheReads: 0,
  cacheWrites: 0,
  cacheRemovals: 0,
  domMutations: 0,
  navigationMutations: 0,
  timerSchedules: 0,
  timerClears: 0,
  activeTimers: 0,
  automaticCanaryExecutions: 0,
});

console.log(`CV-3.4 complete index live update: ${fixtures.length - failures.length}/${fixtures.length} fixtures, ${assertionCount} assertions, ${failures.length} failures`);
console.log(`Update counters: provider GET reads ${totals.networkReads}, network writes ${totals.networkWrites}; cache reads ${totals.cacheReads}, writes ${totals.cacheWrites}, removals ${totals.cacheRemovals}`);
console.log(`Safety counters: DOM ${totals.domMutations}, navigation ${totals.navigationMutations}, timers scheduled ${totals.timerSchedules}, cleared ${totals.timerClears}, active ${totals.activeTimers}, automatic canary ${totals.automaticCanaryExecutions}`);

if (failures.length) process.exitCode = 1;
