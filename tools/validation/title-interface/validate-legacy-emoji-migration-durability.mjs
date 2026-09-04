#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const ROOT = process.cwd();
const TITLE_REL = 'src-runtime-base/9B0a.🟤🏷️ Chat Title State 🏷️.js';
const AUTO_REL = 'src-runtime-base/9D1a.🟤📱 Auto Emoji Title 📱.js';
const TITLE_SOURCE = fs.readFileSync(path.join(ROOT, TITLE_REL), 'utf8');
const AUTO_SOURCE = fs.readFileSync(path.join(ROOT, AUTO_REL), 'utf8');
const CHAT = '6a7f4a7c-ba2c-83eb-b0d1-acac9198b501';
const EMOJI = '🧠';
const LEGACY_EMOJI_KEY = `ho:autoemoji:emoji:${CHAT}`;
const LEGACY_DONE_KEY = `ho:autoemoji:done:${CHAT}`;
const MIGRATION_KEY = 'h2o:prm:cgx:library:chat-title:migration:v1';
const STORE_KEY = `h2o:prm:cgx:library:chat-title:state:v1:${CHAT}`;
const BOOT_CACHE_PREFIX = 'h2o:prm:cgx:library:chat-title:boot-cache:v1:';

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}`);
  assert.notEqual(start, -1, `${name} exists`);
  const brace = source.indexOf('{', source.indexOf(')', start));
  let depth = 0;
  for (let index = brace; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`unterminated function ${name}`);
}

function makeElement(tag = 'div') {
  return {
    tagName: String(tag).toUpperCase(),
    nodeType: 1,
    children: [],
    childNodes: [],
    parentElement: null,
    style: { setProperty() {}, removeProperty() {} },
    dataset: {},
    attributes: {},
    classList: { add() {}, remove() {}, contains: () => false, toggle() {} },
    textContent: '',
    innerHTML: '',
    className: '',
    id: '',
    isConnected: true,
    getAttribute(name) { return name in this.attributes ? this.attributes[name] : null; },
    setAttribute(name, value) { this.attributes[name] = String(value); },
    removeAttribute(name) { delete this.attributes[name]; },
    hasAttribute(name) { return name in this.attributes; },
    appendChild(child) {
      this.children.push(child);
      this.childNodes.push(child);
      child.parentElement = this;
      return child;
    },
    insertBefore(child) { return this.appendChild(child); },
    removeChild(child) { return child; },
    remove() {},
    querySelector: () => null,
    querySelectorAll: () => [],
    closest: () => null,
    matches: () => false,
    contains: () => false,
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => true,
    getBoundingClientRect: () => ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }),
    focus() {},
    click() {},
    scrollIntoView() {},
  };
}

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function bootHarness({ mode = 'healthy', localData = {}, durableData = new Map() } = {}) {
  const events = [];
  let disposed = false;
  let timerBudget = 4000;
  let migrationSetCount = 0;
  let releaseStaleWrite = null;

  const localStorage = {
    get length() { return Object.keys(localData).length; },
    key(index) { return Object.keys(localData)[index] || null; },
    getItem(key) { return Object.prototype.hasOwnProperty.call(localData, key) ? localData[key] : null; },
    setItem(key, value) {
      if (mode === 'cache-write-fails' && String(key).startsWith(BOOT_CACHE_PREFIX)) {
        events.push('cache:set:failed');
        throw new Error('synthetic boot-cache failure');
      }
      localData[key] = String(value);
      if (key === MIGRATION_KEY) events.push('migration:complete');
    },
    removeItem(key) {
      if (key === LEGACY_EMOJI_KEY) events.push('legacy:emoji:delete');
      if (key === LEGACY_DONE_KEY) events.push('legacy:done:delete');
      delete localData[key];
    },
  };

  const Store = {
    _readyPromise: Promise.resolve(),
    caps: () => mode === 'unavailable'
      ? ({ ready: true, durable: false, health: 'degraded' })
      : ({ ready: true, durable: true, health: 'healthy' }),
    backend: () => mode === 'unavailable' ? 'synthetic-unavailable' : 'synthetic-durable',
    async get(key) {
      events.push('store:get');
      const value = clone(durableData.get(key));
      if (mode === 'readback-mismatch' && migrationSetCount > 0 && key === STORE_KEY && value) {
        events.push('store:get:mismatch');
        return { ...value, emoji: '🎯' };
      }
      if (value && key === STORE_KEY) events.push('store:get:match');
      return value;
    },
    async set(key, value) {
      events.push('store:set:start');
      migrationSetCount += 1;
      if (mode === 'set-rejects' || mode === 'cache-write-fails') {
        events.push('store:set:rejected');
        throw new Error('synthetic Store.set rejection');
      }
      if (mode === 'set-hangs') return new Promise(() => {});
      if (mode === 'stale-operation') {
        return new Promise((resolve) => {
          releaseStaleWrite = () => {
            durableData.set(key, clone(value));
            events.push('store:set:success');
            resolve();
          };
        });
      }
      durableData.set(key, clone(value));
      events.push('store:set:success');
    },
  };

  const D = {
    title: 'Plain Title',
    readyState: 'complete',
    body: makeElement('body'),
    documentElement: makeElement('html'),
    head: makeElement('head'),
    currentScript: null,
    createElement: (tag) => makeElement(tag),
    createTextNode: (text) => ({ nodeType: 3, textContent: String(text) }),
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: () => null,
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => true,
    contains: () => false,
    hidden: false,
    visibilityState: 'visible',
  };
  const guard = (fn) => () => {
    if (!disposed) {
      try { fn(); } catch {}
    }
  };
  const schedule = (fn, delay = 0) => {
    if (timerBudget-- <= 0) return 0;
    return setTimeout(guard(fn), Math.min(Math.max(0, Number(delay) || 0), 5));
  };
  const W = {
    H2O: { Library: { Store } },
    location: {
      origin: 'https://chatgpt.com',
      pathname: `/c/${CHAT}`,
      href: `https://chatgpt.com/c/${CHAT}`,
      search: '',
      hash: '',
    },
    history: { pushState() {}, replaceState() {}, state: null, length: 1 },
    document: D,
    localStorage,
    sessionStorage: localStorage,
    navigator: { userAgent: 'synthetic-migration-harness' },
    performance: { now: () => Date.now() },
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => true,
    setTimeout: schedule,
    clearTimeout,
    setInterval: () => 0,
    clearInterval() {},
    requestAnimationFrame: (fn) => schedule(fn, 0),
    cancelAnimationFrame() {},
    queueMicrotask: (fn) => queueMicrotask(guard(fn)),
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
    Event: class { constructor(type) { this.type = type; } },
    PopStateEvent: class { constructor(type, init) { this.type = type; this.state = init?.state; } },
    MutationObserver: class { observe() {} disconnect() {} takeRecords() { return []; } },
  };
  W.window = W;
  W.self = W;
  W.top = W;

  const sandbox = {
    window: W,
    document: D,
    localStorage,
    sessionStorage: localStorage,
    location: W.location,
    history: W.history,
    navigator: W.navigator,
    performance: W.performance,
    setTimeout: W.setTimeout,
    clearTimeout,
    setInterval: W.setInterval,
    clearInterval: W.clearInterval,
    requestAnimationFrame: W.requestAnimationFrame,
    cancelAnimationFrame: W.cancelAnimationFrame,
    queueMicrotask: W.queueMicrotask,
    MutationObserver: W.MutationObserver,
    CustomEvent: W.CustomEvent,
    Event: W.Event,
    PopStateEvent: W.PopStateEvent,
    Intl,
    AbortController,
    Date,
    Math,
    JSON,
    Number,
    String,
    Boolean,
    Array,
    Object,
    Promise,
    Map,
    Set,
    WeakMap,
    WeakSet,
    RegExp,
    Error,
    TypeError,
    Symbol,
    Proxy,
    Reflect,
    isNaN,
    parseInt,
    parseFloat,
    encodeURIComponent,
    decodeURIComponent,
    structuredClone,
    console: { log() {}, warn() {}, error() {}, info() {}, debug() {} },
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(TITLE_SOURCE, { filename: `${TITLE_REL}:migration-harness` }).runInContext(sandbox);

  return {
    api: W.H2O.ChatTitle,
    events,
    localData,
    durableData,
    seedLegacy() {
      localData[LEGACY_EMOJI_KEY] = EMOJI;
      localData[LEGACY_DONE_KEY] = '1';
      delete localData[MIGRATION_KEY];
      return Object.freeze({
        legacyEmoji: localData[LEGACY_EMOJI_KEY],
        legacyDone: localData[LEGACY_DONE_KEY],
        completion: localData[MIGRATION_KEY] || null,
        durable: clone(durableData.get(STORE_KEY)) || null,
      });
    },
    releaseStaleWrite() { releaseStaleWrite?.(); },
    dispose() { disposed = true; try { W.__h2oChatTitleStateBooted_v1?.destroy?.(); } catch {} },
  };
}

const delay = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));

async function readyHarness(options) {
  const harness = bootHarness(options);
  await delay(30);
  harness.events.length = 0;
  return harness;
}

function assertLegacyRetained(harness, label) {
  assert.equal(harness.localData[LEGACY_EMOJI_KEY], EMOJI, `${label}: legacy emoji remains`);
  assert.equal(harness.localData[LEGACY_DONE_KEY], '1', `${label}: legacy done remains`);
  assert.equal(harness.localData[MIGRATION_KEY], undefined, `${label}: completion remains absent`);
  assert.equal(harness.events.some((event) => event.startsWith('legacy:')), false, `${label}: no legacy deletion event`);
  assert.equal(harness.events.includes('migration:complete'), false, `${label}: no completion event`);
}

function seedAndCapturePreState(harness, label) {
  const preState = harness.seedLegacy();
  assert.deepEqual(preState, {
    legacyEmoji: EMOJI,
    legacyDone: '1',
    completion: null,
    durable: null,
  }, `${label}: exact disposable pre-state captured`);
  return preState;
}

function assertDeletionAfterDurability(events, label) {
  const durability = events.indexOf('store:get:match');
  for (const event of ['legacy:emoji:delete', 'legacy:done:delete']) {
    const deletion = events.indexOf(event);
    if (deletion !== -1) {
      assert.ok(durability !== -1 && deletion > durability, `${label}: ${event} follows exact durable readback`);
    }
  }
}

async function migrate(harness, options = {}) {
  return harness.api.migrateLegacyEmojiDurably(CHAT, {
    candidate: EMOJI,
    timeoutMs: 20,
    reason: 'synthetic-fault-injection',
    ...options,
  });
}

const results = [];
async function scenario(name, run) {
  await run();
  results.push(name);
}

// The orchestration layer may discover and submit a candidate, but it has no
// destructive key authority and no independent canonical setter anymore.
const delegationBody = extractFunction(AUTO_SOURCE, 'MIG_AE_keys');
assert.match(delegationBody, /migrateLegacyEmojiDurably/u, '9D1a delegates migration to 9B0a');
assert.doesNotMatch(delegationBody, /\.setEmoji\s*\(/u, '9D1a migration does not use in-memory acceptance as success');
assert.doesNotMatch(delegationBody, /removeItem/u, '9D1a migration owns no legacy deletion');

await scenario('F01 Store set rejects', async () => {
  const h = await readyHarness({ mode: 'set-rejects' });
  seedAndCapturePreState(h, 'F01');
  const result = await migrate(h);
  assert.equal(result.status, 'durable-write-failed');
  assertLegacyRetained(h, 'F01');
  assertDeletionAfterDurability(h.events, 'F01');
  h.dispose();
});

await scenario('F02 durable readback mismatches', async () => {
  const h = await readyHarness({ mode: 'readback-mismatch' });
  seedAndCapturePreState(h, 'F02');
  const result = await migrate(h);
  assert.equal(result.status, 'durable-readback-mismatch');
  assertLegacyRetained(h, 'F02');
  assertDeletionAfterDurability(h.events, 'F02');
  h.dispose();
});

await scenario('F03 Store write hangs and times out', async () => {
  const h = await readyHarness({ mode: 'set-hangs' });
  seedAndCapturePreState(h, 'F03');
  const result = await migrate(h);
  assert.equal(result.status, 'timeout');
  assert.equal(result.phase, 'durable-write');
  assertLegacyRetained(h, 'F03');
  assertDeletionAfterDurability(h.events, 'F03');
  h.dispose();
});

await scenario('F04 boot cache fails and Store rejects', async () => {
  const h = await readyHarness({ mode: 'cache-write-fails' });
  seedAndCapturePreState(h, 'F04');
  const result = await migrate(h);
  assert.equal(result.status, 'durable-write-failed');
  assert.ok(h.events.includes('cache:set:failed'), 'F04: decisive boot-cache failure was injected');
  assertLegacyRetained(h, 'F04');
  assertDeletionAfterDurability(h.events, 'F04');
  h.dispose();
});

await scenario('F05 durable storage unavailable', async () => {
  const h = await readyHarness({ mode: 'unavailable' });
  seedAndCapturePreState(h, 'F05');
  const result = await migrate(h);
  assert.equal(result.status, 'durable-storage-unavailable');
  assertLegacyRetained(h, 'F05');
  assertDeletionAfterDurability(h.events, 'F05');
  h.dispose();
});

await scenario('F06 stale operation cannot clean legacy keys', async () => {
  const h = await readyHarness({ mode: 'stale-operation' });
  seedAndCapturePreState(h, 'F06');
  const pending = migrate(h);
  for (let tries = 0; tries < 50 && !h.events.includes('store:set:start'); tries += 1) await delay(1);
  assert.ok(h.events.includes('store:set:start'), 'F06: migration reached its durable write');
  h.api.setEmoji({
    chatId: CHAT,
    emoji: '🎯',
    source: 'user',
    priority: 100,
    confidence: 1,
  }, { force: true, deferPersistence: true, reason: 'synthetic-supersede' });
  h.releaseStaleWrite();
  const result = await pending;
  assert.equal(result.status, 'superseded');
  assertLegacyRetained(h, 'F06');
  assertDeletionAfterDurability(h.events, 'F06');
  h.dispose();
});

await scenario('F07 restart retains candidate and deterministic retry succeeds', async () => {
  const localData = {};
  const durableData = new Map();
  const failed = await readyHarness({ mode: 'set-rejects', localData, durableData });
  seedAndCapturePreState(failed, 'F07');
  assert.equal((await migrate(failed)).status, 'durable-write-failed');
  assertLegacyRetained(failed, 'F07 failed attempt');
  failed.dispose();

  const restartedUnavailable = await readyHarness({ mode: 'unavailable', localData, durableData });
  assert.equal(restartedUnavailable.localData[LEGACY_EMOJI_KEY], EMOJI, 'F07: fresh boot can still read candidate');
  assert.equal(restartedUnavailable.api.getState(CHAT).emoji, EMOJI, 'F07: fresh boot reconstructs recoverable legacy state');
  restartedUnavailable.dispose();

  const retry = await readyHarness({ mode: 'healthy', localData, durableData });
  const result = await migrate(retry);
  assert.ok(result.ok, `F07: retry succeeds (${result.status})`);
  assert.equal(retry.localData[LEGACY_EMOJI_KEY], undefined, 'F07: retry retires legacy emoji');
  assert.equal(retry.localData[LEGACY_DONE_KEY], undefined, 'F07: retry retires legacy done');
  assert.equal(retry.api.getState(CHAT).emoji, EMOJI, 'F07: retry converges canonical state');
  retry.dispose();
});

await scenario('S01 healthy write/readback orders cleanup and survives fresh boot', async () => {
  const localData = {};
  const durableData = new Map();
  const h = await readyHarness({ mode: 'healthy', localData, durableData });
  seedAndCapturePreState(h, 'S01');
  const result = await migrate(h);
  assert.equal(result.status, 'migrated');
  assert.equal(result.readbackMatched, true);
  assert.equal(h.events.filter((event) => event === 'legacy:emoji:delete').length, 1);
  assert.equal(h.events.filter((event) => event === 'legacy:done:delete').length, 1);
  assert.equal(h.events.filter((event) => event === 'migration:complete').length, 1);
  const expectedOrder = [
    'store:set:start',
    'store:set:success',
    'store:get',
    'store:get:match',
    'legacy:emoji:delete',
    'legacy:done:delete',
    'migration:complete',
  ];
  let cursor = -1;
  for (const event of expectedOrder) {
    const next = h.events.indexOf(event, cursor + 1);
    assert.notEqual(next, -1, `S01: missing ordered event ${event}\n${h.events.join('\n')}`);
    cursor = next;
  }
  assertDeletionAfterDurability(h.events, 'S01');
  assert.equal(durableData.get(STORE_KEY)?.emoji, EMOJI, 'S01: durable record contains exact candidate');
  h.dispose();

  for (const key of Object.keys(localData)) {
    if (key.startsWith(BOOT_CACHE_PREFIX)) delete localData[key];
  }
  const fresh = await readyHarness({ mode: 'healthy', localData, durableData });
  assert.equal(fresh.localData[LEGACY_EMOJI_KEY], undefined, 'S01 restart needs no legacy emoji');
  assert.equal(fresh.localData[LEGACY_DONE_KEY], undefined, 'S01 restart needs no legacy done');
  assert.equal(fresh.api.getState(CHAT).emoji, EMOJI, 'S01 restart hydrates emoji from canonical Store');
  fresh.dispose();
});

console.log(`PASS validate-legacy-emoji-migration-durability (${results.length} scenarios)`);
for (const result of results) console.log(`  ✓ ${result}`);
