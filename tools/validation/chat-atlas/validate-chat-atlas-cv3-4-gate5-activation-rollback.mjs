#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const corePath = 'src-runtime-base/0A1a.⬛️🧠 H2O Core 🧠.js';
// The Chat Atlas Ledger moved out of H2O Core into 0A3b Chat Atlas Ledger,
// with 0A3a Chat Atlas Core brokering it. This validator asserts on that
// implementation, so the H2O Core source it reads is now the aggregate of the
// three files the code actually lives in. No assertion changes: positive checks
// and by-name extraction still find the code, and negative checks get strictly
// stronger because a forbidden pattern must be absent from all three.
const H2O_CORE_AGGREGATE_SOURCES = [
  'src-runtime-base/0A1a.⬛️🧠 H2O Core 🧠.js',
  'src-runtime-base/0A3a.⬛️🧭 Chat Atlas Core 🧭.js',
  'src-runtime-base/0A3b.⬛️📒 Chat Atlas Ledger 📒.js',
];
const coreSource = H2O_CORE_AGGREGATE_SOURCES
  .map((rel) => fs.readFileSync(path.join(root, rel), 'utf8'))
  .join('\n');
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

function withPrimaryAId(rows, qId, primaryAId) {
  return rows.map((row) => row.qId === qId
    ? {
      ...row,
      primaryAId,
      answerVariants: [...row.answerVariants.filter((id) => id !== primaryAId), primaryAId],
    }
    : row);
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

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
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
    rafSchedules: 0,
    completeIndexStateEvents: 0,
    authorityPublications: 0,
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
    requestAnimationFrame() { counters.rafSchedules += 1; return 1; },
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
    __GATE5_AUTHORITY_PUBLISH__() { counters.authorityPublications += 1; },
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
      counters.completeIndexStateEvents += 1;
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
  const publishAnchor = '  function chatAtlasPublishCompleteIndex(envelope, source) {\n';
  // The canonical-return function moved to 0A3b while the authority generation it
  // checks is still owned by 0A1a. Each half of the fixture hook is therefore
  // spliced into the module that actually owns what it touches, and the three
  // real programs run in order exactly as production loads them.
  const spliceExport = (src, block) => {
    const at = src.lastIndexOf('})();');
    if (at < 0) throw new Error('iife-close-missing');
    return `${src.slice(0, at)}${block}${src.slice(at)}`;
  };
  const coreOnly = spliceExport(
    H2O_CORE_AGGREGATE_SOURCES[0] === undefined ? '' : fs.readFileSync(path.join(root, H2O_CORE_AGGREGATE_SOURCES[0]), 'utf8')
      .replace(publishAnchor, `${publishAnchor}    globalThis.__GATE5_AUTHORITY_PUBLISH__();\n`),
    `
  globalThis.__GATE5_BUMP_GENERATION__ = () => { completeTurnIndexAuthorityState.generation += 1; };
`,
  );
  const brokerOnly = fs.readFileSync(path.join(root, H2O_CORE_AGGREGATE_SOURCES[1]), 'utf8');
  const ledgerOnly = spliceExport(
    fs.readFileSync(path.join(root, H2O_CORE_AGGREGATE_SOURCES[2]), 'utf8')
      .replace(setterAnchor, `${setterAnchor}    globalThis.__GATE5_SOURCE_SETTER__();\n`),
    `
  globalThis.__GATE5_CANONICAL_RETURN__ = Object.freeze({
    apply: (members) => chatAtlasClearBranchSelectionStaleOnCanonicalReturn(members),
    bumpGeneration: () => globalThis.__GATE5_BUMP_GENERATION__(),
  });
`,
  );
  const programSource = coreOnly;
  vm.runInContext(programSource, context, { filename: corePath, timeout: 8_000 });
  vm.runInContext(brokerOnly, context, { filename: H2O_CORE_AGGREGATE_SOURCES[1], timeout: 8_000 });
  vm.runInContext(ledgerOnly, context, { filename: H2O_CORE_AGGREGATE_SOURCES[2], timeout: 8_000 });
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

// ── Round 1 separation: automatic native branch reconciliation is deferred ──
// (independent gate, default false; the complete-turn projection never enables it).
function dispatchTrustedBranchClick(runtime, qId, {
  direction = 'previous',
  role = 'user',
  trusted = true,
  extraQIds = [],
  answerIds = [],
} = {}) {
  const label = direction === 'next' ? 'Next response' : 'Previous response';
  const messageNode = (messageId, messageRole) => ({
    getAttribute: (name) => {
      if (name === 'data-message-id') return messageId;
      if (name === 'data-message-author-role') return messageRole;
      return null;
    },
  });
  const messageNodes = [
    ...[qId, ...extraQIds].map((messageId) => messageNode(messageId, role)),
    ...answerIds.map((messageId) => messageNode(messageId, 'assistant')),
  ];
  const container = {
    getAttribute: (name) => (name === 'data-testid' ? 'conversation-turn-1' : null),
    querySelectorAll: (sel) => (sel === '[data-message-id]' ? messageNodes : []),
  };
  const button = {
    tagName: 'BUTTON',
    getAttribute: (name) => (name === 'aria-label' ? label : null),
    closest: (sel) => (sel === '[data-testid^="conversation-turn-"]' ? container : null),
  };
  const svg = { tagName: 'svg', getAttribute: () => null, closest: (sel) => (sel === 'button' ? button : null) };
  const event = { isTrusted: trusted, target: svg, composedPath: () => [svg, button, container] };
  const handlers = runtime.listeners.get('click') || [];
  let recorded = false;
  for (const fn of handlers) { if (fn(event) === true) recorded = true; }
  return recorded;
}
function ledgerMembers(qId, answerIds, {
  currentQId = qId,
  source = 'native-evidence',
  duplicate = false,
} = {}) {
  const member = {
    question: { qId, currentQId },
    answer: { currentProjectionSource: source, currentAnswerIds: answerIds.slice() },
  };
  return duplicate ? [member, clean(member)] : [member];
}
function dispatchUnrelatedClick(runtime) {
  const event = { isTrusted: true, target: { closest: () => null }, composedPath: () => [] };
  let recorded = false;
  for (const fn of runtime.listeners.get('click') || []) { if (fn(event) === true) recorded = true; }
  return recorded;
}
function pendingZeroDelayTimerIds(runtime) {
  return Array.from(runtime.timers.entries()).filter(([, row]) => row.ms === 0).map(([id]) => id);
}
function runNewZeroDelayTimers(runtime, beforeIds) {
  const before = new Set(beforeIds);
  let ran = 0;
  for (const [id, row] of Array.from(runtime.timers.entries())) {
    if (row.ms === 0 && !before.has(id)) { runtime.timers.delete(id); row.fn(); ran += 1; }
  }
  return ran;
}
const TRACE = (runtime) => (runtime.status().selectedPathLifecycleTrace || []).map((entry) => entry.event);

await fixture('A: automatic reconciliation gate default is false with no persistence key', () => {
  const runtime = createRuntime({ preference: '1', cache: cacheEnvelope() });
  equal(runtime.status().compiledDefault, false);
  equal(runtime.status().autoBranchReconciliationEnabled, false);
  equal(runtime.status().autoBranchReconciliationSetterCallCount, 0);
  equal(runtime.status().branchSelectionStale, false);
  equal(runtime.status().branchSelectionStaleRevision, 0);
  equal(runtime.status().branchSelectionStaleQId, null);
  // No reconciliation-specific storage key is ever touched.
  equal(runtime.storage.state.touched.some(([, key]) => /reconcil/i.test(key)), false);
  equal([...runtime.storage.map.keys()].some((key) => /branch.*stale|stale.*branch/i.test(key)), false);
});

await fixture('B: projection enabled + gate false — capture binds and schedules exactly one bounded user task', () => {
  const runtime = createRuntime({ preference: '1', cache: cacheEnvelope() });
  equal(runtime.status().enabled, true);
  equal(runtime.status().completeCount, 38);
  const netBefore = runtime.counters.networkReads;
  const writesBefore = runtime.storage.state.writes;
  const publicationsBefore = runtime.counters.authorityPublications;
  const eventsBefore = runtime.counters.completeIndexStateEvents;
  const zeroBefore = pendingZeroDelayTimerIds(runtime);
  const primaryBefore = runtime.api.getTurnRecordByQId('gate5-pref-q-01')?.primaryAId;
  const recorded = dispatchTrustedBranchClick(runtime, 'gate5-pref-q-01');
  // Trusted native click capture + canonical qId binding remain intact.
  equal(recorded, true);
  equal(runtime.status().trustedSelectionCaptureCount, 1);
  equal(runtime.status().trustedSelectionIntentActive, true);
  equal(runtime.status().trustedSelectionIntentQId, 'gate5-pref-q-01');
  equal(runtime.status().trustedSelectionBindSuccessCount, 1);
  equal(runtime.status().branchSelectionStale, true);
  equal(runtime.status().branchSelectionStaleRevision, 1);
  equal(runtime.status().branchSelectionStaleQId, 'gate5-pref-q-01');
  // chatAtlasNotifyCompleteIndexState publishes once through each established
  // transport (window CustomEvent + H2O replay event); no third notification.
  equal(runtime.counters.completeIndexStateEvents - eventsBefore, 2);
  // The user-driven click schedules exactly ONE bounded zero-delay reconcile
  // task; nothing else happens until that task fires. The memory canary now
  // gates only the automatic (generic-inspection) lane — a real native click
  // is never deferred, because a deferred click left live branch switches
  // with an intent nothing ever consumed (zero fetches, stale authority).
  const trace = TRACE(runtime);
  equal(trace.includes('trusted-reconcile-deferred'), false);
  equal(trace.includes('trusted-native-branch-click'), false);
  equal(runtime.status().selectedPathConfirmationScheduledCount, 0);
  equal(runtime.status().selectedPathConfirmationFetchCount, 0);
  equal(runtime.status().selectedPathTrustedScheduleAttemptCount, 0);
  equal(runtime.status().selectedPathAcceptanceCount, 0);
  equal(runtime.counters.networkReads - netBefore, 0);
  equal(runtime.storage.state.writes - writesBefore, 0);
  equal(runtime.counters.authorityPublications - publicationsBefore, 0);
  equal(pendingZeroDelayTimerIds(runtime).length - zeroBefore.length, 1);
  equal(runtime.status().refreshTimerPending, false);
  // The captured turn's canonical primary was NOT mutated by the click.
  equal(runtime.status().count, 38);
  equal(runtime.api.getTurnRecordByQId('gate5-pref-q-01')?.primaryAId, primaryBefore);
});

await fixture('B: invalid native interactions never mark branch state stale', () => {
  const unresolved = createRuntime({ preference: '1', cache: cacheEnvelope() });
  equal(dispatchUnrelatedClick(unresolved), false);
  equal(dispatchTrustedBranchClick(unresolved, 'not-a-canonical-qid'), false);
  equal(unresolved.status().branchSelectionStale, false);
  equal(unresolved.status().branchSelectionStaleRevision, 0);

  const ambiguous = createRuntime({ preference: '1', cache: cacheEnvelope() });
  equal(dispatchTrustedBranchClick(ambiguous, 'gate5-pref-q-01', { extraQIds: ['gate5-pref-q-02'] }), false);
  equal(ambiguous.status().branchSelectionStale, false);

  const untrusted = createRuntime({ preference: '1', cache: cacheEnvelope() });
  equal(dispatchTrustedBranchClick(untrusted, 'gate5-pref-q-01', { trusted: false }), false);
  equal(untrusted.status().branchSelectionStale, false);

  const disabled = createRuntime({ preference: '0', cache: cacheEnvelope() });
  equal(dispatchTrustedBranchClick(disabled, 'gate5-pref-q-01'), false);
  equal(disabled.status().branchSelectionStale, false);
});

await fixture('B: repeated valid captures advance only the memory revision and latest qId', () => {
  const runtime = createRuntime({ preference: '1', cache: cacheEnvelope() });
  const networkBefore = runtime.counters.networkReads;
  const storageBefore = runtime.storage.state.writes;
  equal(dispatchTrustedBranchClick(runtime, 'gate5-pref-q-01'), true);
  equal(dispatchTrustedBranchClick(runtime, 'gate5-pref-q-02', { direction: 'next' }), true);
  equal(runtime.status().branchSelectionStale, true);
  equal(runtime.status().branchSelectionStaleRevision, 2);
  equal(runtime.status().branchSelectionStaleQId, 'gate5-pref-q-02');
  equal(runtime.counters.networkReads - networkBefore, 0);
  equal(runtime.storage.state.writes - storageBefore, 0);
  equal(runtime.status().selectedPathAcceptanceCount, 0);
  equal(runtime.status().selectedPathConfirmationScheduledCount, 0);
  equal(runtime.status().refreshTimerPending, false);
});

await fixture('B: exact native return to the canonical answer clears stale without refresh or mutation', () => {
  const rows = buildRows(39);
  const qId = 'gate5-pref-q-17';
  const canonicalAId = 'gate5-pref-a-17';
  const branchAId = 'gate5-pref-a-17-branch-2';
  const runtime = createRuntime({ preference: '1', cache: cacheEnvelope(rows) });
  const decision = runtime.context.__GATE5_CANONICAL_RETURN__;
  const recordsBefore = runtime.api.listTurnRecords();
  const networkBefore = runtime.counters.networkReads;
  const storageBefore = runtime.storage.state.writes;
  const publicationsBefore = runtime.counters.authorityPublications;
  const timersBefore = runtime.counters.timerSchedules;
  const rafBefore = runtime.counters.rafSchedules;

  equal(dispatchTrustedBranchClick(runtime, qId, { direction: 'next', answerIds: [canonicalAId] }), true);
  equal(runtime.status().branchSelectionStale, true);
  equal(runtime.status().branchSelectionStaleQId, qId);
  equal(runtime.status().branchSelectionStaleRevision, 1);
  equal(decision.apply(ledgerMembers(qId, [branchAId])), false);
  equal(runtime.status().branchSelectionStale, true);

  equal(dispatchTrustedBranchClick(runtime, qId, { direction: 'previous', answerIds: [branchAId] }), true);
  equal(runtime.status().branchSelectionStaleRevision, 1);
  equal(decision.apply(ledgerMembers(qId, [canonicalAId])), true);
  equal(runtime.status().branchSelectionStale, false);
  equal(runtime.status().branchSelectionStaleQId, null);
  equal(runtime.status().branchSelectionStaleRevision, 1);
  equal(runtime.status().trustedSelectionIntentActive, false);
  equal(runtime.status().authoritative, true);
  equal(runtime.status().completeCount, 39);
  equal(runtime.api.listTurnRecords(), recordsBefore);
  equal(runtime.counters.networkReads - networkBefore, 0);
  equal(runtime.storage.state.writes - storageBefore, 0);
  equal(runtime.counters.authorityPublications - publicationsBefore, 0);
  // Each of the two user clicks schedules its bounded zero-delay reconcile
  // task (the second cancels the first); no other timer is created.
  equal(runtime.counters.timerSchedules - timersBefore, 2);
  equal(runtime.counters.rafSchedules - rafBefore, 1);
  equal(runtime.status().selectedPathAcceptanceCount, 0);
  equal(runtime.status().selectedPathConfirmationScheduledCount, 0);
  const eventsBeforeRepeat = runtime.counters.completeIndexStateEvents;
  equal(decision.apply(ledgerMembers(qId, [canonicalAId])), false);
  equal(runtime.counters.completeIndexStateEvents, eventsBeforeRepeat);
});

await fixture('B: missing ambiguous unchanged or mismatched remount evidence preserves stale', () => {
  const qId = 'gate5-pref-q-17';
  const canonicalAId = 'gate5-pref-a-17';
  const branchAId = 'gate5-pref-a-17-branch-2';
  const cases = [
    { name: 'missing-answer', members: ledgerMembers(qId, []) },
    { name: 'multiple-answers', members: ledgerMembers(qId, [canonicalAId, branchAId]) },
    { name: 'unchanged-pre-click-answer', members: ledgerMembers(qId, [canonicalAId]) },
    { name: 'different-answer', members: ledgerMembers(qId, [branchAId]) },
    { name: 'different-qid', members: ledgerMembers('gate5-pref-q-18', [canonicalAId]) },
    { name: 'duplicate-qid-member', members: ledgerMembers(qId, [canonicalAId], { duplicate: true }) },
    { name: 'fallback-not-native', members: ledgerMembers(qId, [canonicalAId], { source: 'previous-primary-fallback' }) },
  ];
  for (const row of cases) {
    const runtime = createRuntime({ preference: '1', cache: cacheEnvelope(buildRows(39)) });
    const decision = runtime.context.__GATE5_CANONICAL_RETURN__;
    equal(dispatchTrustedBranchClick(runtime, qId, { answerIds: [canonicalAId] }), true, row.name);
    equal(decision.apply(row.members), false, row.name);
    equal(runtime.status().branchSelectionStale, true, row.name);
    equal(runtime.status().branchSelectionStaleQId, qId, row.name);
    equal(runtime.status().branchSelectionStaleRevision, 1, row.name);
    equal(runtime.status().selectedPathAcceptanceCount, 0, row.name);
  }
});

await fixture('B: stale scope and latest interaction lease reject route generation and delayed results', () => {
  const q17 = 'gate5-pref-q-17';
  const a17 = 'gate5-pref-a-17';
  const branch17 = 'gate5-pref-a-17-branch-2';
  const q18 = 'gate5-pref-q-18';
  const a18 = 'gate5-pref-a-18';

  const routeRuntime = createRuntime({ preference: '1', cache: cacheEnvelope(buildRows(39)) });
  equal(dispatchTrustedBranchClick(routeRuntime, q17, { answerIds: [a17] }), true);
  equal(routeRuntime.context.__GATE5_CANONICAL_RETURN__.apply(ledgerMembers(q17, [branch17])), false);
  equal(dispatchTrustedBranchClick(routeRuntime, q17, { answerIds: [branch17] }), true);
  routeRuntime.context.location.pathname = '/c/other-chat';
  equal(routeRuntime.context.__GATE5_CANONICAL_RETURN__.apply(ledgerMembers(q17, [a17])), false);
  equal(routeRuntime.status().branchSelectionStale, true);

  const generationRuntime = createRuntime({ preference: '1', cache: cacheEnvelope(buildRows(39)) });
  equal(dispatchTrustedBranchClick(generationRuntime, q17, { answerIds: [a17] }), true);
  equal(generationRuntime.context.__GATE5_CANONICAL_RETURN__.apply(ledgerMembers(q17, [branch17])), false);
  equal(dispatchTrustedBranchClick(generationRuntime, q17, { answerIds: [branch17] }), true);
  generationRuntime.context.__GATE5_CANONICAL_RETURN__.bumpGeneration();
  equal(generationRuntime.context.__GATE5_CANONICAL_RETURN__.apply(ledgerMembers(q17, [a17])), false);
  equal(generationRuntime.status().branchSelectionStale, true);

  const raceRuntime = createRuntime({ preference: '1', cache: cacheEnvelope(buildRows(39)) });
  equal(dispatchTrustedBranchClick(raceRuntime, q17, { answerIds: [a17] }), true);
  equal(raceRuntime.context.__GATE5_CANONICAL_RETURN__.apply(ledgerMembers(q17, [branch17])), false);
  equal(dispatchTrustedBranchClick(raceRuntime, q17, { answerIds: [branch17] }), true);
  equal(dispatchTrustedBranchClick(raceRuntime, q18, { answerIds: [a18] }), true);
  equal(raceRuntime.status().branchSelectionStaleRevision, 2);
  equal(raceRuntime.context.__GATE5_CANONICAL_RETURN__.apply(ledgerMembers(q17, [a17])), false);
  equal(raceRuntime.status().branchSelectionStale, true);
  equal(raceRuntime.status().branchSelectionStaleQId, q18);
  equal(raceRuntime.status().branchSelectionStaleRevision, 2);
  equal(raceRuntime.status().autoBranchReconciliationEnabled, false);
  equal(raceRuntime.status().selectedPathAcceptanceCount, 0);
});

await fixture('B: unchanged validated host refresh preserves branch-stale state idempotently', async () => {
  const rows = buildRows(39);
  let providerCalls = 0;
  const runtime = createRuntime({
    preference: '1',
    cache: cacheEnvelope(rows, 100),
    provider: async () => {
      providerCalls += 1;
      return { ok: true, index: hostEnvelope(rows, 100) };
    },
  });
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  equal(dispatchTrustedBranchClick(runtime, 'gate5-pref-q-17'), true);
  const revision = runtime.status().branchSelectionStaleRevision;
  const primaryBefore = runtime.api.getTurnRecordByQId('gate5-pref-q-17')?.primaryAId;
  const readsBefore = runtime.counters.networkReads;
  const writesBefore = runtime.storage.state.writes;
  const skipsBefore = runtime.status().cacheWriteSkippedUnchangedCount;
  const first = await runtime.api.refreshCompleteTurnIndexProjection();
  const second = await runtime.api.refreshCompleteTurnIndexProjection();
  equal(first.status, 'complete-refresh-validated');
  equal(second.status, 'complete-refresh-validated');
  equal(runtime.counters.networkReads - readsBefore, 2);
  equal(runtime.storage.state.writes - writesBefore, 0);
  equal(runtime.status().cacheWriteSkippedUnchangedCount - skipsBefore, 2);
  equal(runtime.status().authoritative, true);
  equal(runtime.status().completeCount, 39);
  equal(runtime.api.listTurnRecords().length, 39);
  equal(runtime.api.getTurnRecordByQId('gate5-pref-q-17')?.primaryAId, primaryBefore);
  equal(runtime.status().branchSelectionStale, true);
  equal(runtime.status().branchSelectionStaleRevision, revision);
  equal(runtime.status().branchSelectionStaleQId, 'gate5-pref-q-17');
  equal(runtime.status().autoBranchReconciliationEnabled, false);
  equal(runtime.status().selectedPathAcceptanceCount, 0);
  equal(runtime.status().selectedPathConfirmationScheduledCount, 0);
  equal(runtime.status().refreshTimerPending, false);
  equal(providerCalls, 3);
});

await fixture('B: reconciled prefix refresh remains contained until complete graph publication', async () => {
  const rows = buildRows(39);
  const reconciledRows = withPrimaryAId(rows, 'gate5-pref-q-17', 'gate5-pref-a-17-branch-2');
  let providerCalls = 0;
  const runtime = createRuntime({
    preference: '1',
    cache: cacheEnvelope(rows, 100),
    provider: async () => {
      const call = providerCalls++;
      return { ok: true, index: hostEnvelope(call === 0 ? rows : reconciledRows, 101 + call) };
    },
  });
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  equal(dispatchTrustedBranchClick(runtime, 'gate5-pref-q-17'), true);
  equal(runtime.status().branchSelectionStale, true);
  const revision = runtime.status().branchSelectionStaleRevision;
  const readsBefore = runtime.counters.networkReads;
  const writesBefore = runtime.storage.state.writes;
  const publicationsBefore = runtime.counters.authorityPublications;
  const result = await runtime.api.refreshCompleteTurnIndexProjection();
  equal(result.status, 'complete-refresh-validated');
  equal(runtime.counters.networkReads - readsBefore, 1);
  equal(runtime.storage.state.writes - writesBefore, 0);
  // The harness counter instruments entry to the publication arbiter. The
  // call occurs once, but the pending transaction rejects the prefix before
  // canonical state or cache bytes are mutated.
  equal(runtime.counters.authorityPublications - publicationsBefore, 1);
  equal(runtime.status().branchSelectionStale, true);
  equal(runtime.status().branchSelectionStaleRevision, revision);
  equal(runtime.status().branchSelectionStaleQId, 'gate5-pref-q-17');
  equal(runtime.status().branchTransactionStateCode, 'pending');
  equal(runtime.status().completeCount, 39);
  equal(runtime.api.getTurnRecordByQId('gate5-pref-q-17')?.primaryAId, 'gate5-pref-a-17');
  equal(runtime.status().autoBranchReconciliationEnabled, false);
});

await fixture('B: failed explicit refresh preserves stale state without retry work', async () => {
  const rows = buildRows();
  let providerCalls = 0;
  const runtime = createRuntime({
    preference: '1',
    cache: cacheEnvelope(rows, 100),
    provider: async () => {
      providerCalls += 1;
      return providerCalls === 1
        ? { ok: true, index: hostEnvelope(rows, 101) }
        : { ok: false, errorCode: 'fixture-refresh-failed' };
    },
  });
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  equal(dispatchTrustedBranchClick(runtime, 'gate5-pref-q-01'), true);
  const revision = runtime.status().branchSelectionStaleRevision;
  const writesBefore = runtime.storage.state.writes;
  const publicationsBefore = runtime.counters.authorityPublications;
  const result = await runtime.api.refreshCompleteTurnIndexProjection();
  equal(result.status, 'complete-refresh-failed-cache-preserved');
  equal(runtime.storage.state.writes - writesBefore, 0);
  equal(runtime.counters.authorityPublications - publicationsBefore, 0);
  equal(runtime.status().branchSelectionStale, true);
  equal(runtime.status().branchSelectionStaleRevision, revision);
  equal(runtime.status().branchSelectionStaleQId, 'gate5-pref-q-01');
  equal(runtime.status().refreshTimerPending, false);
  equal(runtime.status().refreshTrailingRequired, false);
});

await fixture('B: newer native click survives an older successful explicit refresh', async () => {
  const rows = buildRows(39);
  const reconciledRows = withPrimaryAId(rows, 'gate5-pref-q-01', 'gate5-pref-a-01-branch-2');
  const pending = deferred();
  let providerCalls = 0;
  const runtime = createRuntime({
    preference: '1',
    cache: cacheEnvelope(rows, 100),
    provider: () => {
      providerCalls += 1;
      if (providerCalls === 1) return Promise.resolve({ ok: true, index: hostEnvelope(rows, 101) });
      return pending.promise;
    },
  });
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  equal(dispatchTrustedBranchClick(runtime, 'gate5-pref-q-01'), true);
  const firstRevision = runtime.status().branchSelectionStaleRevision;
  const operation = runtime.api.refreshCompleteTurnIndexProjection();
  await Promise.resolve();
  await Promise.resolve();
  equal(dispatchTrustedBranchClick(runtime, 'gate5-pref-q-02', { direction: 'next' }), true);
  equal(runtime.status().branchSelectionStaleRevision, firstRevision + 1);
  pending.resolve({ ok: true, index: hostEnvelope(reconciledRows, 102) });
  await operation;
  equal(runtime.status().branchSelectionStale, true);
  equal(runtime.status().branchSelectionStaleRevision, firstRevision + 1);
  equal(runtime.status().branchSelectionStaleQId, 'gate5-pref-q-02');
  equal(runtime.status().selectedPathAcceptanceCount, 0);
  equal(runtime.status().selectedPathConfirmationScheduledCount, 0);
});

await fixture('B: click first observed during a clean in-flight refresh remains stale', async () => {
  const rows = buildRows();
  const pending = deferred();
  let providerCalls = 0;
  const runtime = createRuntime({
    preference: '1',
    cache: cacheEnvelope(rows, 100),
    provider: () => {
      providerCalls += 1;
      if (providerCalls === 1) return Promise.resolve({ ok: true, index: hostEnvelope(rows, 101) });
      return pending.promise;
    },
  });
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  equal(runtime.status().branchSelectionStale, false);
  const operation = runtime.api.refreshCompleteTurnIndexProjection();
  await Promise.resolve();
  await Promise.resolve();
  equal(dispatchTrustedBranchClick(runtime, 'gate5-pref-q-01'), true);
  pending.resolve({ ok: true, index: hostEnvelope(rows, 102) });
  await operation;
  equal(runtime.status().branchSelectionStale, true);
  equal(runtime.status().branchSelectionStaleRevision, 1);
  equal(runtime.status().branchSelectionStaleQId, 'gate5-pref-q-01');
});

await fixture('B: manual prefix refresh remains contained after an older request completes', async () => {
  const rows = buildRows();
  const reconciledRows = withPrimaryAId(rows, 'gate5-pref-q-01', 'gate5-pref-a-01-branch-2');
  const olderRequest = deferred();
  let providerCalls = 0;
  const runtime = createRuntime({
    preference: '1',
    cache: cacheEnvelope(rows, 100),
    provider: () => {
      providerCalls += 1;
      if (providerCalls === 1) return Promise.resolve({ ok: true, index: hostEnvelope(rows, 101) });
      if (providerCalls === 2) return olderRequest.promise;
      return Promise.resolve({ ok: true, index: hostEnvelope(reconciledRows, 103) });
    },
  });
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  const olderOperation = runtime.api.refreshCompleteTurnIndexProjection('turn-settled');
  await Promise.resolve();
  await Promise.resolve();
  equal(dispatchTrustedBranchClick(runtime, 'gate5-pref-q-01'), true);
  const manualOperation = runtime.api.refreshCompleteTurnIndexProjection();
  equal(runtime.status().branchSelectionStale, true);
  olderRequest.resolve({ ok: true, index: hostEnvelope(rows, 102) });
  await olderOperation;
  await manualOperation;
  equal(providerCalls, 3);
  equal(runtime.status().branchSelectionStale, true);
  equal(runtime.status().branchSelectionStaleQId, 'gate5-pref-q-01');
  equal(runtime.status().branchTransactionStateCode, 'pending');
  equal(runtime.status().refreshTimerPending, false);
});

await fixture('B: route change, projection disable, successful rebuild, and reload clear stale safely', async () => {
  const rows = buildRows();
  const routeRuntime = createRuntime({ preference: '1', cache: cacheEnvelope(rows) });
  equal(dispatchTrustedBranchClick(routeRuntime, 'gate5-pref-q-01'), true);
  routeRuntime.context.location.pathname = '/c/route-change-chat';
  routeRuntime.context.location.href = 'https://chatgpt.com/c/route-change-chat';
  void routeRuntime.api.rebuildCompleteTurnIndexProjection();
  equal(routeRuntime.status().branchSelectionStale, false);
  equal(routeRuntime.status().branchSelectionStaleQId, null);

  const disableRuntime = createRuntime({ preference: '1', cache: cacheEnvelope(rows) });
  equal(dispatchTrustedBranchClick(disableRuntime, 'gate5-pref-q-01'), true);
  disableRuntime.api.setCompleteTurnIndexProjectionPreference(false);
  equal(disableRuntime.status().branchSelectionStale, false);
  equal(disableRuntime.status().branchSelectionStaleQId, null);

  let rebuildCalls = 0;
  const rebuildRuntime = createRuntime({
    preference: '1',
    cache: cacheEnvelope(rows, 100),
    provider: async () => ({ ok: true, index: hostEnvelope(rows, 101 + rebuildCalls++) }),
  });
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  equal(dispatchTrustedBranchClick(rebuildRuntime, 'gate5-pref-q-01'), true);
  await rebuildRuntime.api.rebuildCompleteTurnIndexProjection();
  equal(rebuildRuntime.status().branchSelectionStale, false);

  const reload = createRuntime({ preference: '1', cache: cacheEnvelope(rows) });
  equal(reload.status().branchSelectionStale, false);
  equal(reload.status().branchSelectionStaleRevision, 0);
  equal(reload.status().branchSelectionStaleQId, null);
});

await fixture('C: explicit qualification gate lets the accepted reconciliation run without persistence', () => {
  const runtime = createRuntime({ preference: '1', cache: cacheEnvelope() });
  const writesBefore = runtime.storage.state.writes;
  const removalsBefore = runtime.storage.state.removals;
  const result = runtime.api.setCompleteTurnIndexAutoBranchReconciliationCanary(true);
  equal(result.autoBranchReconciliationEnabled, true);
  equal(runtime.status().autoBranchReconciliationEnabled, true);
  equal(runtime.status().autoBranchReconciliationSetterCallCount, 1);
  // Memory-only: the qualification setter writes/removes no localStorage.
  equal(runtime.storage.state.writes - writesBefore, 0);
  equal(runtime.storage.state.removals - removalsBefore, 0);
  equal(runtime.storage.map.has(PREF_KEY), true);
  equal(runtime.storage.map.get(PREF_KEY), '1');
  const zeroBefore = pendingZeroDelayTimerIds(runtime);
  equal(dispatchTrustedBranchClick(runtime, 'gate5-pref-q-01'), true);
  // With the gate enabled, the capture-driven post-event task is scheduled and,
  // when run, drives the accepted reconciliation (no more 'deferred').
  ok(pendingZeroDelayTimerIds(runtime).length > zeroBefore.length);
  runNewZeroDelayTimers(runtime, zeroBefore);
  const trace = TRACE(runtime);
  equal(trace.includes('trusted-native-branch-click'), true);
  equal(trace.filter((event) => event === 'trusted-reconcile-deferred').length, 0);
});

await fixture('D: projection canary does not enable reconciliation', () => {
  const runtime = createRuntime({ cache: cacheEnvelope() });
  runtime.api.setCompleteTurnIndexProjectionCanary(true);
  equal(runtime.status().enabled, true);
  equal(runtime.status().autoBranchReconciliationEnabled, false);
});

await fixture('D: persisted-preference activation does not enable reconciliation', () => {
  const runtime = createRuntime({ cache: cacheEnvelope() });
  runtime.api.setCompleteTurnIndexProjectionPreference(true);
  equal(runtime.status().enabled, true);
  equal(runtime.status().autoBranchReconciliationEnabled, false);
});

await fixture('D: booting with stored preference "1" does not enable reconciliation', () => {
  const runtime = createRuntime({ preference: '1', cache: cacheEnvelope() });
  equal(runtime.status().enabled, true);
  equal(runtime.status().autoBranchReconciliationEnabled, false);
});

await fixture('D: manual refresh/rebuild does not silently enable reconciliation', async () => {
  const rows = buildRows();
  const runtime = createRuntime({
    preference: '1',
    cache: cacheEnvelope(rows),
    provider: () => Promise.resolve({ ok: true, index: hostEnvelope(rows, 101) }),
  });
  await runtime.api.refreshCompleteTurnIndexProjection();
  equal(runtime.status().autoBranchReconciliationEnabled, false);
  await runtime.api.rebuildCompleteTurnIndexProjection();
  equal(runtime.status().autoBranchReconciliationEnabled, false);
});

await fixture('D: reconciliation setter and lifecycle resets persist nothing; no reconciliation key exists', () => {
  const storage = createStorage(new Map([['unrelated-key', 'keep']]));
  const runtime = createRuntime({ storage, preference: '1', cache: cacheEnvelope() });
  const touchedBefore = runtime.storage.state.touched.length;
  runtime.api.setCompleteTurnIndexAutoBranchReconciliationCanary(true);
  runtime.api.setCompleteTurnIndexAutoBranchReconciliationCanary(false);
  // No set/remove operations were issued by the reconciliation setter.
  equal(runtime.storage.state.touched.slice(touchedBefore).some(([op]) => ['set', 'remove'].includes(op)), false);
  // A lifecycle reset (route change) that flips the gate false persists nothing.
  runtime.api.setCompleteTurnIndexAutoBranchReconciliationCanary(true);
  const beforeReset = runtime.storage.state.touched.length;
  runtime.context.location.pathname = '/c/88888888-0000-4000-8000-000000000888';
  runtime.api.rebuildCompleteTurnIndexProjection();
  equal(runtime.status().autoBranchReconciliationEnabled, false);
  equal(runtime.storage.state.touched.slice(beforeReset).some(([op]) => ['set', 'remove'].includes(op)), false);
  equal(runtime.storage.map.get('unrelated-key'), 'keep');
  // No reconciliation-specific key was ever created; the approved key is intact.
  equal(runtime.storage.state.touched.some(([, key]) => /reconcil/i.test(key)), false);
  equal([...runtime.storage.map.keys()].some((key) => /reconcil/i.test(key)), false);
  equal(runtime.status().preference.key, PREF_KEY);
});

await fixture('E: TRUE -> disable -> re-enable never reactivates reconciliation (Correction 2)', () => {
  const runtime = createRuntime({ preference: '1', cache: cacheEnvelope() });
  runtime.api.setCompleteTurnIndexAutoBranchReconciliationCanary(true);
  equal(runtime.status().autoBranchReconciliationEnabled, true);
  // Disable the projection: the lifecycle reset returns the gate to false.
  runtime.api.setCompleteTurnIndexProjectionPreference(false);
  equal(runtime.status().enabled, false);
  equal(runtime.status().autoBranchReconciliationEnabled, false);
  // Re-enable the projection: the gate stays false (no silent reactivation).
  runtime.api.setCompleteTurnIndexProjectionPreference(true);
  equal(runtime.status().enabled, true);
  equal(runtime.status().autoBranchReconciliationEnabled, false);
  // The canary stays false after preference toggling; a native click is
  // user-driven work and still schedules exactly its one bounded task — the
  // canary governs only the automatic lane and is never silently reactivated.
  const zeroBefore = pendingZeroDelayTimerIds(runtime);
  equal(dispatchTrustedBranchClick(runtime, 'gate5-pref-q-01'), true);
  equal(runtime.status().selectedPathConfirmationScheduledCount, 0);
  equal(pendingZeroDelayTimerIds(runtime).length - zeroBefore.length, 1);
  equal(TRACE(runtime).includes('trusted-reconcile-deferred'), false);
});

await fixture('E: TRUE -> clear -> re-enable never reactivates reconciliation (Correction 2)', () => {
  const runtime = createRuntime({ preference: '1', cache: cacheEnvelope() });
  runtime.api.setCompleteTurnIndexAutoBranchReconciliationCanary(true);
  equal(runtime.status().autoBranchReconciliationEnabled, true);
  runtime.api.clearCompleteTurnIndexProjectionPreference();
  equal(runtime.status().enabled, false);
  equal(runtime.preference().resolution, 'compiled-default-disabled');
  equal(runtime.status().autoBranchReconciliationEnabled, false);
  // Re-enable via canary: reconciliation remains false.
  runtime.api.setCompleteTurnIndexProjectionCanary(true);
  equal(runtime.status().enabled, true);
  equal(runtime.status().autoBranchReconciliationEnabled, false);
});

await fixture('E: TRUE -> route/chat change resets reconciliation; old intent cannot authorize (Correction 2C)', () => {
  const runtime = createRuntime({ preference: '1', cache: cacheEnvelope() });
  runtime.api.setCompleteTurnIndexAutoBranchReconciliationCanary(true);
  equal(runtime.status().autoBranchReconciliationEnabled, true);
  const originalChat = runtime.status().chatId;
  // Perform a REAL route/chat generation boundary: change the location and
  // re-trigger the authority (rebuild routes through chatAtlasResetCompleteIndexRoute).
  runtime.context.location.pathname = '/c/99999999-0000-4000-8000-000000000999';
  runtime.context.location.href = 'https://chatgpt.com/c/99999999-0000-4000-8000-000000000999';
  runtime.api.rebuildCompleteTurnIndexProjection();
  equal(runtime.status().autoBranchReconciliationEnabled, false);
  ok(runtime.status().chatId !== originalChat || runtime.status().routeGeneration >= 1);
});

await fixture('E: manual refresh retains qualification while manual rebuild resets it', async () => {
  const rows = buildRows();
  const runtime = createRuntime({
    preference: '1',
    cache: cacheEnvelope(rows),
    provider: () => Promise.resolve({ ok: true, index: hostEnvelope(rows, 102) }),
  });
  runtime.api.setCompleteTurnIndexAutoBranchReconciliationCanary(true);
  equal(runtime.status().autoBranchReconciliationEnabled, true);
  await runtime.api.refreshCompleteTurnIndexProjection();
  equal(runtime.status().autoBranchReconciliationEnabled, true);
  await runtime.api.rebuildCompleteTurnIndexProjection();
  equal(runtime.status().autoBranchReconciliationEnabled, false);
});

await fixture('E: queued post-event task -> gate off before execution does no reconciliation (Correction 3.1)', () => {
  const runtime = createRuntime({ preference: '1', cache: cacheEnvelope() });
  runtime.api.setCompleteTurnIndexAutoBranchReconciliationCanary(true);
  const netBefore = runtime.counters.networkReads;
  // Dispatch a qualifying native click: the zero-delay reconcile task is queued.
  equal(dispatchTrustedBranchClick(runtime, 'gate5-pref-q-01'), true);
  const queued = pendingZeroDelayTimerIds(runtime);
  ok(queued.length >= 1);
  // Disable the gate BEFORE the queued task runs.
  runtime.api.setCompleteTurnIndexAutoBranchReconciliationCanary(false);
  equal(runNewZeroDelayTimers(runtime, []), 0);
  // The narrow disable transition cancels the queued task and clears its token.
  equal(runtime.status().trustedSelectionIntentActive, false);
  equal(pendingZeroDelayTimerIds(runtime).length, 0);
  equal(TRACE(runtime).includes('trusted-native-branch-click'), false);
  equal(runtime.status().selectedPathConfirmationScheduledCount, 0);
  equal(runtime.status().selectedPathConfirmationFetchCount, 0);
  equal(runtime.status().selectedPathRequestLeaseActive, false);
  equal(runtime.counters.networkReads - netBefore, 0);
});

await fixture('E: reload re-initialises the reconciliation gate to false', () => {
  // A fresh runtime models boot/reload: the memory-only gate never survives.
  const runtime = createRuntime({ preference: '1', cache: cacheEnvelope() });
  equal(runtime.status().autoBranchReconciliationEnabled, false);
  equal(runtime.status().autoBranchReconciliationSetterCallCount, 0);
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
