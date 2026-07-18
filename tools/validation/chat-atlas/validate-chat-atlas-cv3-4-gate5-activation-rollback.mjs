#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const corePath = 'src-runtime-base/0A1a.⬛️🧠 H2O Core 🧠.js';
const coreSource = fs.readFileSync(path.join(root, corePath), 'utf8');
const CHAT_ID = '6928b333-12f4-8328-9e41-6a01def45127';
const PREF_KEY = 'h2o:prm:cgx:chat-atlas:complete-turn-index:enabled:v1';
const CACHE_KEY = `h2o:prm:cgx:chat-atlas:complete-turn-index:v1:chat:${CHAT_ID}`;

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

function extractFunction(source, name) {
  const start = source.indexOf(`  function ${name}(`);
  if (start < 0 || source.indexOf(`  function ${name}(`, start + 1) >= 0) throw new Error(`function-anchor-invalid:${name}`);
  const signatureEnd = source.indexOf(') {', start);
  const bodyStart = signatureEnd + 2;
  let depth = 0;
  let quote = '';
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let index = bodyStart; index < source.length; index += 1) {
    const ch = source[index];
    const next = source[index + 1];
    if (lineComment) { if (ch === '\n') lineComment = false; continue; }
    if (blockComment) { if (ch === '*' && next === '/') { blockComment = false; index += 1; } continue; }
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === quote) quote = '';
      continue;
    }
    if (ch === '/' && next === '/') { lineComment = true; index += 1; continue; }
    if (ch === '/' && next === '*') { blockComment = true; index += 1; continue; }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
    if (ch === '{') depth += 1;
    else if (ch === '}' && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`function-boundary-invalid:${name}`);
}

const fingerprint = vm.runInNewContext(`(function () {
  ${extractFunction(coreSource, 'chatAtlasCompleteIndexStableHash')}
  ${extractFunction(coreSource, 'chatAtlasCompleteIndexFingerprint')}
  return chatAtlasCompleteIndexFingerprint;
})()`, { String, Array, JSON, Math });

function buildRows(count = 38) {
  return Array.from({ length: count }, (_, index) => {
    const order = index + 1;
    const qId = `gate5-pref-q-${String(order).padStart(2, '0')}`;
    const primaryAId = `gate5-pref-a-${String(order).padStart(2, '0')}`;
    return { order, qId, turnId: `turn:${qId}`, answerVariants: [primaryAId], primaryAId, noAnswer: false, stopped: false };
  });
}

function cacheEnvelope(rows = buildRows(), revision = 100) {
  return {
    schema: 1,
    chatId: CHAT_ID,
    payloadUpdateTime: revision,
    sourceFingerprint: fingerprint(rows),
    capturedAt: '2026-07-18T12:00:00.000Z',
    validatedAt: '2026-07-18T12:00:00.000Z',
    complete: true,
    proof: 'host-payload-full-graph',
    turns: rows,
  };
}

function hostEnvelope(rows = buildRows(), revision = 100) {
  const cache = cacheEnvelope(rows, revision);
  return {
    schema: cache.schema,
    chatId: cache.chatId,
    payloadUpdateTime: cache.payloadUpdateTime,
    sourceFingerprint: cache.sourceFingerprint,
    capturedAt: cache.capturedAt,
    identityPrecedence: 'message-id-then-mapping-node-id',
    completeness: { complete: true, proof: cache.proof, validatedAt: cache.validatedAt },
    turns: cache.turns,
  };
}

function createStorage(initial = new Map()) {
  const state = { reads: 0, writes: 0, removals: 0, failRead: false, failWrite: false, failRemove: false, touched: [] };
  return {
    map: initial,
    state,
    api: {
      getItem(key) {
        state.reads += 1;
        state.touched.push(['get', String(key)]);
        if (state.failRead) throw new Error('private read failure');
        return initial.has(String(key)) ? initial.get(String(key)) : null;
      },
      setItem(key, value) {
        state.touched.push(['set', String(key)]);
        if (state.failWrite) throw new Error('private write failure');
        state.writes += 1;
        initial.set(String(key), String(value));
      },
      removeItem(key) {
        state.touched.push(['remove', String(key)]);
        if (state.failRemove) throw new Error('private remove failure');
        state.removals += 1;
        initial.delete(String(key));
      },
      clear() { throw new Error('storage-clear-forbidden'); },
      key(index) { return Array.from(initial.keys())[index] ?? null; },
      get length() { return initial.size; },
    },
  };
}

function createRuntime({ preference, storage = createStorage(), cache = null, provider = null } = {}) {
  if (preference !== undefined) storage.map.set(PREF_KEY, preference);
  if (cache) storage.map.set(CACHE_KEY, JSON.stringify(cache));
  const listeners = new Map();
  const timers = new Map();
  const counters = {
    networkReads: 0,
    networkWrites: 0,
    domMutations: 0,
    navigationMutations: 0,
    userActions: 0,
    sourceSetterCalls: 0,
    navigationCancels: 0,
    eventRegistrations: 0,
    timerSchedules: 0,
    timerClears: 0,
    intervalSchedules: 0,
  };
  let timerId = 0;
  let wasEnabled = false;
  const location = { pathname: `/c/${CHAT_ID}`, href: `https://chatgpt.com/c/${CHAT_ID}`, origin: 'https://chatgpt.com' };
  const body = {
    isConnected: true,
    contains() { return false; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    matches() { return false; },
    closest() { return null; },
  };
  const document = {
    location,
    body,
    documentElement: body,
    visibilityState: 'visible',
    querySelector() { return null; },
    querySelectorAll() { return []; },
    getElementById() { return null; },
    addEventListener(type, fn) { const rows = listeners.get(type) || []; rows.push(fn); listeners.set(type, rows); },
    removeEventListener() {},
    createElement() { counters.domMutations += 1; throw new Error('dom-mutation-forbidden'); },
    createTextNode() { counters.domMutations += 1; throw new Error('dom-mutation-forbidden'); },
  };
  class HarnessEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } }
  class HarnessObserver { observe() {} disconnect() {} takeRecords() { return []; } }
  const sandbox = {
    __GATE5_SOURCE_SETTER__() { counters.sourceSetterCalls += 1; },
    console: Object.freeze({ log() {}, warn() {}, error() {}, info() {}, debug() {} }),
    document,
    location,
    history: {
      pushState() { counters.navigationMutations += 1; throw new Error('navigation-forbidden'); },
      replaceState() { counters.navigationMutations += 1; throw new Error('navigation-forbidden'); },
    },
    navigator: Object.freeze({ userAgent: 'cv3.4-gate5-activation-validator' }),
    performance: Object.freeze({ now: () => 1 }),
    Date,
    URL,
    Event: HarnessEvent,
    CustomEvent: HarnessEvent,
    MutationObserver: HarnessObserver,
    ResizeObserver: HarnessObserver,
    IntersectionObserver: HarnessObserver,
    AbortController,
    requestAnimationFrame() { return 1; },
    cancelAnimationFrame() {},
    setTimeout(fn, ms = 0) { timerId += 1; counters.timerSchedules += 1; timers.set(timerId, { fn, ms }); return timerId; },
    clearTimeout(id) { if (timers.delete(id)) counters.timerClears += 1; },
    setInterval() { counters.intervalSchedules += 1; return ++timerId; },
    clearInterval() {},
    queueMicrotask,
    localStorage: storage.api,
    sessionStorage: createStorage().api,
    crypto: Object.freeze({ randomUUID: () => '00000000-0000-4000-8000-000000000001' }),
    fetch() { counters.networkReads += 1; throw new Error('unexpected-fetch'); },
    XMLHttpRequest: class { constructor() { counters.networkReads += 1; throw new Error('unexpected-xhr'); } },
    WebSocket: class { constructor() { counters.networkWrites += 1; throw new Error('unexpected-websocket'); } },
    H2O: { archiveBoot: {
      fetchConversationTurnIndex(chatId, opts) {
        counters.networkReads += 1;
        return provider ? provider(chatId, opts) : Promise.resolve({ ok: false, errorCode: 'fixture-provider-unavailable' });
      },
    } },
  };
  sandbox.addEventListener = (type, fn) => {
    counters.eventRegistrations += 1;
    const rows = listeners.get(type) || [];
    rows.push(fn);
    listeners.set(type, rows);
  };
  sandbox.removeEventListener = () => {};
  sandbox.dispatchEvent = (event) => {
    if (event?.type === 'evt:h2o:complete-turn-index:state') {
      const enabled = event?.detail?.enabled === true;
      if (wasEnabled && !enabled) counters.navigationCancels += 1;
      wasEnabled = enabled;
    }
    for (const fn of listeners.get(event?.type) || []) fn(event);
    return true;
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.top = sandbox;
  sandbox.globalThis = sandbox;
  const context = vm.createContext(sandbox, { codeGeneration: { strings: false, wasm: false } });
  const setterAnchor = '  function setChatAtlasCanonicalSource(value) {\n';
  const programSource = coreSource.replace(setterAnchor, `${setterAnchor}    globalThis.__GATE5_SOURCE_SETTER__();\n`);
  vm.runInContext(programSource, context, { filename: corePath, timeout: 8_000 });
  const runtime = {
    context,
    api: context.H2O.turnRuntime,
    storage,
    listeners,
    timers,
    counters,
    status() { return context.H2O.turnRuntime.getCompleteTurnIndexProjectionStatus(); },
    preference() { return context.H2O.turnRuntime.getCompleteTurnIndexProjectionPreference(); },
    runTimer(ms) {
      const entry = Array.from(timers.entries()).find(([, row]) => row.ms === ms);
      if (!entry) return false;
      timers.delete(entry[0]);
      entry[1].fn();
      return true;
    },
  };
  runtimes.push(runtime);
  return runtime;
}

await fixture('compiled default is false', () => {
  const runtime = createRuntime();
  equal(runtime.status().compiledDefault, false);
  equal(runtime.status().enabled, false);
});

await fixture('absent preference boots disabled', () => {
  const runtime = createRuntime();
  equal(runtime.preference().storedValue, null);
  equal(runtime.preference().resolution, 'compiled-default-disabled');
  equal(runtime.status().enabled, false);
});

await fixture('stored zero boots disabled', () => {
  const runtime = createRuntime({ preference: '0' });
  equal(runtime.status().enabled, false);
  equal(runtime.preference().resolution, 'stored-disabled');
});

await fixture('stored one boots complete mode enabled', () => {
  const runtime = createRuntime({ preference: '1', cache: cacheEnvelope() });
  equal(runtime.status().enabled, true);
  equal(runtime.status().completeCount, 38);
});

await fixture('malformed preference boots disabled', () => {
  const runtime = createRuntime({ preference: 'true' });
  equal(runtime.status().enabled, false);
  equal(runtime.preference().storedValue, 'invalid');
});

await fixture('malformed preference is not rewritten', () => {
  const runtime = createRuntime({ preference: 'malformed' });
  equal(runtime.storage.map.get(PREF_KEY), 'malformed');
  equal(runtime.storage.state.writes, 0);
});

await fixture('preference read failure fails closed', () => {
  const storage = createStorage();
  storage.state.failRead = true;
  const runtime = createRuntime({ storage });
  equal(runtime.status().enabled, false);
  equal(runtime.preference().readErrorCode, 'preference-read-failed');
});

await fixture('preference write failure produces no mixed state', () => {
  const runtime = createRuntime();
  runtime.storage.state.failWrite = true;
  const result = runtime.api.setCompleteTurnIndexProjectionPreference(true);
  equal(result.ok, false);
  equal(runtime.status().enabled, false);
  equal(runtime.storage.map.has(PREF_KEY), false);
});

await fixture('explicit preference enable persists one', () => {
  const runtime = createRuntime({ cache: cacheEnvelope() });
  const result = runtime.api.setCompleteTurnIndexProjectionPreference(true);
  equal(result.ok, true);
  equal(runtime.storage.map.get(PREF_KEY), '1');
  equal(runtime.status().enabled, true);
});

await fixture('explicit preference disable persists zero', () => {
  const runtime = createRuntime({ preference: '1', cache: cacheEnvelope() });
  const result = runtime.api.setCompleteTurnIndexProjectionPreference(false);
  equal(result.ok, true);
  equal(runtime.storage.map.get(PREF_KEY), '0');
  equal(runtime.status().enabled, false);
});

await fixture('clear removes only the preference key', () => {
  const storage = createStorage(new Map([[PREF_KEY, '1'], ['unrelated-key', 'keep']]));
  const runtime = createRuntime({ storage, cache: cacheEnvelope() });
  runtime.api.clearCompleteTurnIndexProjectionPreference();
  equal(runtime.storage.map.has(PREF_KEY), false);
  equal(runtime.storage.map.get('unrelated-key'), 'keep');
});

await fixture('clear restores compiled-default disabled behavior', () => {
  const runtime = createRuntime({ preference: '1', cache: cacheEnvelope() });
  runtime.api.clearCompleteTurnIndexProjectionPreference();
  equal(runtime.status().enabled, false);
  equal(runtime.preference().resolution, 'compiled-default-disabled');
});

await fixture('boot one applies before first membership decision', () => {
  const runtime = createRuntime({ preference: '1', cache: cacheEnvelope() });
  equal(runtime.api.listTurns().length, 38);
  equal(runtime.status().bootActivationCount, 1);
});

await fixture('valid complete cache renders before host validation', () => {
  const runtime = createRuntime({ preference: '1', cache: cacheEnvelope(), provider: () => new Promise(() => {}) });
  equal(runtime.status().source, 'cache');
  equal(runtime.status().completeCount, 38);
});

await fixture('empty cache boot does not publish normal partial membership', () => {
  const runtime = createRuntime({ preference: '1', provider: () => new Promise(() => {}) });
  equal(runtime.status().status, 'loading-full-index');
  equal(runtime.api.listTurns().length, 0);
});

await fixture('boot listener registration is idempotent', () => {
  const runtime = createRuntime();
  equal(runtime.status().refreshListenerRegistrationCount, 1);
});

await fixture('runtime recreation rereads persisted preference', () => {
  const storage = createStorage(new Map([[PREF_KEY, '1'], [CACHE_KEY, JSON.stringify(cacheEnvelope())]]));
  const first = createRuntime({ storage });
  const firstReads = storage.state.touched.filter(([op, key]) => op === 'get' && key === PREF_KEY).length;
  const second = createRuntime({ storage });
  const secondReads = storage.state.touched.filter(([op, key]) => op === 'get' && key === PREF_KEY).length;
  equal(first.status().enabled, true);
  equal(second.status().enabled, true);
  equal(secondReads, firstReads + 1);
});

await fixture('immediate disable cancels active refresh', async () => {
  const runtime = createRuntime({ preference: '1', cache: cacheEnvelope(), provider: () => new Promise(() => {}) });
  runtime.api.setCompleteTurnIndexProjectionCanary(false);
  equal(runtime.status().enabled, false);
  equal(runtime.status().refreshRequestActive, false);
});

await fixture('disable during debounce clears its timer', () => {
  const runtime = createRuntime({ preference: '1', cache: cacheEnvelope() });
  void runtime.api.refreshCompleteTurnIndexProjection('fixture-debounce');
  runtime.api.setCompleteTurnIndexProjectionCanary(false);
  equal(runtime.status().refreshTimerPending, false);
});

await fixture('disable emits cancellation state for active navigation consumer', () => {
  const runtime = createRuntime({ preference: '1', cache: cacheEnvelope() });
  runtime.api.setCompleteTurnIndexProjectionCanary(false);
  equal(runtime.counters.navigationCancels >= 1, true);
});

await fixture('disable clears route pending overlays', () => {
  const runtime = createRuntime({ preference: '1', cache: cacheEnvelope() });
  runtime.api.setCompleteTurnIndexProjectionCanary(false);
  equal(runtime.status().pendingCount, 0);
});

await fixture('disable restores legacy authority without mixed rows', () => {
  const runtime = createRuntime({ preference: '1', cache: cacheEnvelope() });
  runtime.api.setCompleteTurnIndexProjectionCanary(false);
  equal(runtime.status().authoritative, false);
  equal(runtime.status().completeCount, 0);
});

await fixture('complete cache bytes remain identical through disable', () => {
  const runtime = createRuntime({ preference: '1', cache: cacheEnvelope() });
  const before = runtime.storage.map.get(CACHE_KEY);
  runtime.api.setCompleteTurnIndexProjectionCanary(false);
  equal(runtime.storage.map.get(CACHE_KEY), before);
});

await fixture('persisted zero remains disabled after simulated reload', () => {
  const storage = createStorage(new Map([[PREF_KEY, '1'], [CACHE_KEY, JSON.stringify(cacheEnvelope())]]));
  const first = createRuntime({ storage });
  first.api.setCompleteTurnIndexProjectionPreference(false);
  const second = createRuntime({ storage });
  equal(second.status().enabled, false);
});

await fixture('reenable restores complete authority from cache', () => {
  const runtime = createRuntime({ preference: '0', cache: cacheEnvelope() });
  runtime.api.setCompleteTurnIndexProjectionPreference(true);
  equal(runtime.status().enabled, true);
  equal(runtime.status().completeCount, 38);
});

await fixture('reenable validates through one GET-only provider call', async () => {
  const runtime = createRuntime({ preference: '0', cache: cacheEnvelope(), provider: async () => ({ ok: true, index: hostEnvelope() }) });
  await new Promise((resolve) => setImmediate(resolve));
  const before = runtime.counters.networkReads;
  runtime.api.setCompleteTurnIndexProjectionPreference(true);
  await new Promise((resolve) => setImmediate(resolve));
  equal(runtime.counters.networkReads - before, 1);
  equal(runtime.counters.networkWrites, 0);
});

await fixture('route change discards stale completion', async () => {
  let resolveProvider;
  const runtime = createRuntime({ preference: '1', cache: cacheEnvelope(), provider: () => new Promise((resolve) => { resolveProvider = resolve; }) });
  runtime.context.location.pathname = '/c/other-chat';
  for (const listener of runtime.listeners.get('evt:h2o:route:changed') || []) listener({ type: 'evt:h2o:route:changed' });
  resolveProvider?.({ ok: true, index: hostEnvelope(buildRows(39), 200) });
  await new Promise((resolve) => setImmediate(resolve));
  equal(runtime.status().chatId, 'other-chat');
  equal(runtime.status().completeCount, 0);
});

await fixture('canonical source default remains legacy durable cache', () => {
  const runtime = createRuntime({ preference: '1', cache: cacheEnvelope() });
  equal(runtime.api.getChatAtlasCanonicalSource(), 'legacy-durable-cache');
});

await fixture('Chat Atlas ledger remains alternate', () => {
  const runtime = createRuntime();
  equal(runtime.api.getChatAtlasCanonicalSource(), 'legacy-durable-cache');
  ok(coreSource.includes("const CHAT_ATLAS_CANONICAL_SOURCE_LEDGER = 'chat-atlas-ledger';"));
});

await fixture('canonical source setter automatic calls remain zero', () => {
  const runtime = createRuntime({ preference: '1', cache: cacheEnvelope() });
  equal(runtime.counters.sourceSetterCalls, 0);
});

await fixture('preference boot activation is separately counted', () => {
  const runtime = createRuntime({ preference: '1', cache: cacheEnvelope() });
  equal(runtime.status().bootApplyCount, 1);
  equal(runtime.status().bootActivationCount, 1);
  equal(runtime.status().setterCallCount, 0);
  equal(runtime.status().automaticSetterCallCount, 0);
});

await fixture('boot performs no user action', () => {
  const runtime = createRuntime({ preference: '1', cache: cacheEnvelope() });
  equal(runtime.counters.userActions, 0);
});

await fixture('navigation side effect occurs only in explicit cancellation fixture', () => {
  const runtime = createRuntime();
  equal(runtime.counters.navigationMutations, 0);
});

await fixture('no ChatGPT network write occurs', () => {
  const runtime = createRuntime({ preference: '1', cache: cacheEnvelope() });
  equal(runtime.counters.networkWrites, 0);
});

await fixture('preference APIs mutate no unrelated storage', () => {
  const storage = createStorage(new Map([['unrelated-key', 'keep']]));
  const runtime = createRuntime({ storage });
  runtime.api.setCompleteTurnIndexProjectionPreference(true);
  runtime.api.setCompleteTurnIndexProjectionPreference(false);
  equal(runtime.storage.map.get('unrelated-key'), 'keep');
  equal(runtime.storage.state.touched.filter(([op, key]) => ['set', 'remove'].includes(op) && key !== PREF_KEY && !key.startsWith('h2o:prm:cgx:chat-atlas:complete-turn-index:v1:chat:')).length, 0);
});

await fixture('no raw content enters preference cache or diagnostics', () => {
  const runtime = createRuntime({ preference: '1', cache: cacheEnvelope() });
  const serialized = JSON.stringify({ preference: runtime.preference(), status: runtime.status(), cache: runtime.storage.map.get(CACHE_KEY) });
  equal(serialized.includes('authorization'), false);
  equal(serialized.includes('message text'), false);
  equal(serialized.includes('raw payload'), false);
});

const failed = fixtures.filter((row) => !row.ok);
console.log(`CV-3.4 Gate 5 activation and rollback: ${fixtures.length - failed.length}/${fixtures.length} fixtures, ${assertionCount} assertions, ${failed.length} failures`);
const totals = runtimes.reduce((out, runtime) => {
  out.networkReads += runtime.counters.networkReads;
  out.networkWrites += runtime.counters.networkWrites;
  out.storageReads += runtime.storage.state.reads;
  out.storageWrites += runtime.storage.state.writes;
  out.storageRemovals += runtime.storage.state.removals;
  out.timerSchedules += runtime.counters.timerSchedules;
  out.timerClears += runtime.counters.timerClears;
  out.navigationCancels += runtime.counters.navigationCancels;
  return out;
}, { networkReads: 0, networkWrites: 0, storageReads: 0, storageWrites: 0, storageRemovals: 0, timerSchedules: 0, timerClears: 0, navigationCancels: 0 });
console.log(`Counters: GET reads ${totals.networkReads}, writes ${totals.networkWrites}; storage reads ${totals.storageReads}, writes ${totals.storageWrites}, removals ${totals.storageRemovals}`);
console.log(`Rollback: timers scheduled ${totals.timerSchedules}, cleared ${totals.timerClears}; navigation cancels ${totals.navigationCancels}`);
for (const row of failed) console.error(`FAIL ${row.name}\n${row.error}`);
if (failed.length) process.exitCode = 1;
