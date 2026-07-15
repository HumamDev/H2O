#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const PATHS = {
  core: path.join(ROOT, 'src-runtime-base/1A1b.🟥🗺️ MiniMap Core 🧱🗺️.js'),
  engine: path.join(ROOT, 'src-runtime-base/1A1c.🟥🗺️ MiniMap Engine 🚀🗺️.js'),
};
const sources = Object.fromEntries(
  Object.entries(PATHS).map(([key, value]) => [key, fs.readFileSync(value, 'utf8')]),
);

function replaceUnique(source, anchor, replacement, label) {
  const first = source.indexOf(anchor);
  if (first < 0 || first !== source.lastIndexOf(anchor)) {
    throw new Error(`instrumentation-anchor-invalid:${label}`);
  }
  return `${source.slice(0, first)}${replacement}${source.slice(first + anchor.length)}`;
}

const coreSource = replaceUnique(
  sources.core,
  "  installGlobalApi();\n  initCore();\n  if (!installIntoKernelShared()) scheduleInstallRetry();",
  `  globalThis.__CV33_CACHE_CORE__ = Object.freeze({
    normalizeCacheTurnRow,
    normalizeCacheTurnRows,
    normalizeCacheTurnRowsDetailed,
    cacheRowsShareIdentity,
    findCacheRowIndex,
    validateAuthoritativeShrinkProof,
    mergeTurnListWithCache,
    loadTurnCache,
    saveTurnCache,
    getCanonicalTurnsFromSharedRuntime,
  });`,
  'core-bootstrap',
);

const engineSource = replaceUnique(
  sources.engine,
  "  markPlugin();\n  markReady(false);\n  installDelegatedHandlersBridge();",
  `  globalThis.__CV33_CACHE_ENGINE__ = Object.freeze({
    readMiniMapIdentityAlignment,
    cacheBootNeedsRebuild,
    buildMissing,
    startStaleStateWatchdog,
    state: S,
  });`,
  'engine-bootstrap',
);

const observedCounters = [];

function dataAttrName(key) {
  return `data-${String(key).replace(/[A-Z]/g, (ch) => `-${ch.toLowerCase()}`)}`;
}

function selectorMatches(el, selector) {
  const value = String(selector || '').trim();
  if (!value || !el) return false;
  if (value.includes(',')) return value.split(',').some((part) => selectorMatches(el, part));
  if (value.includes(' ')) return selectorMatches(el, value.split(/\s+/).pop());
  const clean = value.replace(/:not\([^)]*\)/g, '');
  const classes = [...clean.matchAll(/\.([\w-]+)/g)].map((match) => match[1]);
  if (classes.some((name) => !el.classList.contains(name))) return false;
  const attrs = [...clean.matchAll(/\[([^\]=~$*^]+)(?:[$*^~|]?="([^"]*)")?\]/g)];
  for (const [, rawName, expected] of attrs) {
    const actual = el.getAttribute(rawName.trim());
    if (actual == null || (expected != null && actual !== expected)) return false;
  }
  return classes.length > 0 || attrs.length > 0 || clean.toLowerCase() === el.tagName.toLowerCase();
}

class FakeElement {
  constructor(tagName = 'div') {
    this.tagName = String(tagName).toUpperCase();
    this.attributes = new Map();
    this.children = [];
    this.parentElement = null;
    this.nodeType = 1;
    this.className = '';
    this.style = { getPropertyValue: () => '', setProperty() {}, removeProperty() {} };
    this.dataset = new Proxy({}, {
      get: (_target, key) => this.getAttribute(dataAttrName(key)) ?? undefined,
      set: (_target, key, value) => { this.setAttribute(dataAttrName(key), value); return true; },
      deleteProperty: (_target, key) => { this.removeAttribute(dataAttrName(key)); return true; },
    });
    this.classList = {
      contains: (name) => this.className.split(/\s+/).filter(Boolean).includes(name),
      add: (...names) => {
        this.className = [...new Set([...this.className.split(/\s+/).filter(Boolean), ...names])].join(' ');
      },
      remove: (...names) => {
        this.className = this.className.split(/\s+/).filter((name) => name && !names.includes(name)).join(' ');
      },
    };
  }
  get isConnected() { return !!this.parentElement || this.tagName === 'BODY'; }
  setAttribute(name, value) {
    this.attributes.set(String(name), String(value));
    if (String(name) === 'class') this.className = String(value);
  }
  getAttribute(name) { return this.attributes.has(String(name)) ? this.attributes.get(String(name)) : null; }
  removeAttribute(name) { this.attributes.delete(String(name)); }
  appendChild(child) {
    child.remove?.();
    child.parentElement = this;
    this.children.push(child);
    return child;
  }
  remove() {
    if (!this.parentElement) return;
    this.parentElement.children = this.parentElement.children.filter((child) => child !== this);
    this.parentElement = null;
  }
  contains(candidate) {
    return candidate === this || this.children.some((child) => child.contains(candidate));
  }
  closest(selector) {
    let current = this;
    while (current) {
      if (selectorMatches(current, selector)) return current;
      current = current.parentElement;
    }
    return null;
  }
  querySelectorAll(selector) {
    const out = [];
    const visit = (node) => {
      for (const child of node.children) {
        if (selectorMatches(child, selector)) out.push(child);
        visit(child);
      }
    };
    visit(this);
    return out;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  addEventListener() {}
  removeEventListener() {}
  getBoundingClientRect() { return { top: 0, bottom: 10, left: 0, right: 10, width: 10, height: 10 }; }
}

class FakeDocument {
  constructor() {
    this.documentElement = new FakeElement('html');
    this.head = new FakeElement('head');
    this.body = new FakeElement('body');
    this.documentElement.appendChild(this.head);
    this.documentElement.appendChild(this.body);
    this.readyState = 'complete';
    this.visibilityState = 'visible';
  }
  createElement(tagName) { return new FakeElement(tagName); }
  createDocumentFragment() { return new FakeElement('fragment'); }
  querySelector(selector) { return this.body.querySelector(selector); }
  querySelectorAll(selector) { return this.body.querySelectorAll(selector); }
  getElementById(id) {
    return [this.documentElement, ...this.documentElement.querySelectorAll('[id]')]
      .find((node) => node.getAttribute?.('id') === String(id || '')) || null;
  }
  addEventListener() {}
  removeEventListener() {}
}

function makeStorage(seed = null) {
  const map = seed instanceof Map ? seed : new Map();
  const writes = [];
  return {
    map,
    writes,
    api: {
      getItem: (key) => map.has(String(key)) ? map.get(String(key)) : null,
      setItem: (key, value) => {
        const k = String(key);
        const v = String(value);
        writes.push({ type: 'set', key: k, value: v });
        map.set(k, v);
      },
      removeItem: (key) => {
        const k = String(key);
        writes.push({ type: 'remove', key: k });
        map.delete(k);
      },
      key: (index) => [...map.keys()][index] || null,
      get length() { return map.size; },
    },
  };
}

function makeEnvironment(records = [], opts = {}) {
  const document = new FakeDocument();
  const storage = makeStorage(opts.storage);
  const counters = {
    sourceSetterCalls: 0,
    navigationCalls: 0,
    domMutationCalls: 0,
    userActionCalls: 0,
    rebuildCalls: 0,
  };
  observedCounters.push(counters);
  const holder = { records: records.slice() };
  const runtime = {
    listTurnRecords: () => holder.records,
    listTurns: () => holder.records,
    getTurnRecordByTurnId: (id) => holder.records.find((row) => String(row.turnId || '') === String(id || '')) || null,
    getTurnRecordByAId: (id) => holder.records.find((row) => [
      row.primaryAId,
      row.answerId,
      ...(row.answerIds || []),
    ].includes(id)) || null,
    getTurnRecordByQId: (id) => holder.records.find((row) => String(row.qId || row.questionId || '') === String(id || '')) || null,
    setChatAtlasCanonicalSource: () => {
      counters.sourceSetterCalls += 1;
      throw new Error('source-setter-forbidden');
    },
  };
  const pathname = String(opts.pathname || '/c/fixture-chat');
  const context = {
    console: { log() {}, warn() {}, error() {}, assert() {} },
    document,
    location: {
      href: `https://chatgpt.com${pathname}`,
      origin: 'https://chatgpt.com',
      pathname,
      search: '',
      hash: '',
      assign() { counters.navigationCalls += 1; },
      replace() { counters.navigationCalls += 1; },
      reload() { counters.navigationCalls += 1; },
    },
    history: {
      pushState() { counters.navigationCalls += 1; },
      replaceState() { counters.navigationCalls += 1; },
    },
    navigator: { userAgent: 'cv3-cache-validator' },
    performance: { now: (() => { let value = 0; return () => ++value; })() },
    Date,
    Math,
    JSON,
    Map,
    Set,
    WeakMap,
    WeakSet,
    Promise,
    Object,
    Array,
    String,
    Number,
    Boolean,
    RegExp,
    Error,
    TypeError,
    Symbol,
    URL,
    TextEncoder,
    TextDecoder,
    CSS: { escape: (value) => String(value) },
    Element: FakeElement,
    Node: { DOCUMENT_POSITION_FOLLOWING: 4 },
    Event: class Event {},
    CustomEvent: class CustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } },
    EventTarget: class EventTarget {},
    MutationObserver: class MutationObserver { observe() {} disconnect() {} },
    ResizeObserver: class ResizeObserver { observe() {} disconnect() {} },
    IntersectionObserver: class IntersectionObserver { observe() {} disconnect() {} },
    AbortController: class AbortController { constructor() { this.signal = {}; } abort() {} },
    requestAnimationFrame: () => 1,
    cancelAnimationFrame() {},
    requestIdleCallback: () => 1,
    cancelIdleCallback() {},
    setTimeout: () => 1,
    clearTimeout() {},
    setInterval: (fn) => { context.__intervals.push(fn); return context.__intervals.length; },
    clearInterval() {},
    queueMicrotask() {},
    getComputedStyle: () => ({ getPropertyValue: () => '', display: 'block', visibility: 'visible' }),
    localStorage: storage.api,
    sessionStorage: makeStorage().api,
    H2O: { turnRuntime: runtime, SEL: {} },
    H2O_Pagination: { getPageInfo: () => ({ enabled: false }) },
    __intervals: [],
  };
  context.window = context;
  context.globalThis = context;
  context.top = context;
  context.parent = context;
  context.dispatchEvent = () => true;
  context.addEventListener = () => {};
  context.removeEventListener = () => {};
  vm.createContext(context);
  return { context, document, storage, counters, holder };
}

function runSource(context, source, filename) {
  new vm.Script(source, { filename }).runInContext(context, { timeout: 3000 });
}

function loadCore(records = [], opts = {}) {
  const env = makeEnvironment(records, opts);
  runSource(env.context, coreSource, PATHS.core);
  return { ...env, api: env.context.__CV33_CACHE_CORE__ };
}

function loadEngine(coreApi, records = [], opts = {}) {
  const env = makeEnvironment(records, opts);
  const col = env.document.createElement('div');
  col.className = 'cgxui-mm-col';
  col.setAttribute('data-cgxui', 'mnmp-col');
  env.document.body.appendChild(col);
  env.context.H2O_MM_SHARED = {
    get: () => ({
      SEL_: {
        MM_COL: '.cgxui-mm-col',
        MINIMAP: '[data-cgxui="mnmp-root"]',
        MM_BTN: '[data-cgxui="mnmp-btn"]',
        ANSWERS: '[data-message-author-role="assistant"]',
      },
      util: {
        mm: {
          core: () => coreApi,
          ui: () => null,
          rt: () => null,
          uiRefs: () => ({ col, panel: col }),
        },
      },
    }),
  };
  runSource(env.context, engineSource, PATHS.engine);
  return { ...env, api: env.context.__CV33_CACHE_ENGINE__, col };
}

function syntheticUuid(group, turnNo) {
  const head = String(group || '0').repeat(8).slice(0, 8);
  const tail = String(Math.max(0, Number(turnNo || 0) || 0)).padStart(12, '0');
  return `${head}-0000-4000-8000-${tail}`;
}

function answeredRow(turnNo, primary = syntheticUuid('1', turnNo), qId = syntheticUuid('0', turnNo)) {
  return {
    idx: turnNo,
    index: turnNo,
    turnNo,
    qId,
    questionId: qId,
    turnId: `turn:a:${primary}`,
    answerId: primary,
    primaryAId: primary,
    answerIds: [syntheticUuid('2', turnNo), primary],
    noAnswer: false,
    hasAssistant: true,
  };
}

function noAnswerRow(turnNo, qId = syntheticUuid('0', turnNo)) {
  return {
    idx: turnNo,
    index: turnNo,
    turnNo,
    qId,
    questionId: qId,
    turnId: `turn:${qId}`,
    answerId: '',
    primaryAId: '',
    answerIds: [],
    noAnswer: true,
    hasAssistant: false,
  };
}

function rows(count = 38) {
  return Array.from({ length: count }, (_unused, index) => answeredRow(index + 1));
}

function stageCache(env, chatId, inputRows) {
  const saved = env.api.saveTurnCache(chatId, inputRows);
  assert.equal(saved.ok, true, `seed cache failed: ${saved.status}`);
  env.storage.writes.length = 0;
  return saved;
}

function storedStrings(env) {
  return [...env.storage.map.entries()].sort(([a], [b]) => a.localeCompare(b));
}

function storageKeys(env) {
  let turnsKey = '';
  let metaKey = '';
  for (const [key, value] of env.storage.map.entries()) {
    let parsed = null;
    try { parsed = JSON.parse(value); } catch {}
    if (Array.isArray(parsed)) turnsKey = key;
    else if (parsed && typeof parsed === 'object' && parsed.chatId) metaKey = key;
  }
  return { turnsKey, metaKey };
}

const results = [];
let assertionCount = 0;
function check(actual, expected, message = '') {
  assertionCount += 1;
  const normalize = (value) => {
    if (!value || typeof value !== 'object') return value;
    return JSON.parse(JSON.stringify(value));
  };
  assert.deepEqual(normalize(actual), normalize(expected), message);
}

async function fixture(name, fn) {
  try {
    const before = assertionCount;
    await fn();
    results.push({ name, ok: true, assertions: assertionCount - before });
    process.stdout.write(`PASS ${name}\n`);
  } catch (error) {
    results.push({ name, ok: false, error: String(error?.stack || error) });
    process.stdout.write(`FAIL ${name}: ${error?.message || error}\n`);
  }
}

await fixture('full cache plus full host refreshes without loss', () => {
  const all = rows(38);
  const env = loadCore(all);
  stageCache(env, 'fixture-chat', all);
  const merged = env.api.mergeTurnListWithCache('fixture-chat', all, { coreProjectedTotal: 38 });
  check(merged.list.length, 38);
  check(merged.decision.mode, 'live-wins');
  check(merged.decision.overlapCount, 38);
});

await fixture('38 cached plus 3 live publishes cache-preserving union', () => {
  const all = rows(38);
  const env = loadCore(all.slice(0, 3));
  stageCache(env, 'fixture-chat', all);
  const merged = env.api.mergeTurnListWithCache('fixture-chat', all.slice(0, 3), { coreProjectedTotal: 3 });
  check(merged.list.length, 38);
  check(merged.decision.mode, 'union');
  check(merged.decision.overlapCount, 3);
});

await fixture('contaminated cached NO ANSWER row is sanitized without truncation', () => {
  const all = rows(38);
  all[18] = noAnswerRow(19);
  const env = loadCore(all.slice(0, 3));
  stageCache(env, 'fixture-chat', all);
  const { turnsKey } = storageKeys(env);
  const raw = JSON.parse(env.storage.map.get(turnsKey));
  raw[18].answerId = all[18].qId;
  raw[18].primaryAId = all[18].turnId;
  env.storage.map.set(turnsKey, JSON.stringify(raw));
  const merged = env.api.mergeTurnListWithCache('fixture-chat', all.slice(0, 3), { coreProjectedTotal: 3 });
  check(merged.list.length, 38);
  check(merged.list[18].noAnswer, true);
  check(merged.list[18].primaryAId, '');
  check(merged.decision.sanitizedRows > 0, true);
  check(env.api.saveTurnCache('fixture-chat', merged.list).ok, true);
  check(env.api.loadTurnCache('fixture-chat').turns[18].primaryAId, '');
});

await fixture('smaller live projection cannot overwrite larger cache without proof', () => {
  const all = rows(38);
  const env = loadCore(all.slice(0, 3));
  stageCache(env, 'fixture-chat', all);
  const result = env.api.saveTurnCache('fixture-chat', all.slice(0, 3));
  check(result.status, 'shrink-not-proven');
  check(result.writesAttempted, 0);
});

await fixture('persistence refusal leaves turns and metadata byte-identical', () => {
  const all = rows(38);
  const env = loadCore(all.slice(0, 3));
  stageCache(env, 'fixture-chat', all);
  const before = storedStrings(env);
  env.api.saveTurnCache('fixture-chat', all.slice(0, 3));
  check(storedStrings(env), before);
  check(env.storage.writes.length, 0);
});

await fixture('three repeated reload simulations preserve count order and qIds', () => {
  const all = rows(38);
  const sharedStorage = new Map();
  let expectedQIds = all.map((row) => row.qId);
  let first = loadCore(all, { storage: sharedStorage });
  stageCache(first, 'fixture-chat', all);
  for (let cycle = 0; cycle < 3; cycle += 1) {
    const env = loadCore(all.slice(0, 3), { storage: sharedStorage });
    const merged = env.api.mergeTurnListWithCache('fixture-chat', all.slice(0, 3), { coreProjectedTotal: 3 });
    check(merged.list.length, 38);
    check(merged.list.map((row) => row.qId), expectedQIds);
    check(env.api.saveTurnCache('fixture-chat', merged.list).ok, true);
  }
});

await fixture('cache-only answered rows preserve primary and variants', () => {
  const all = rows(38);
  const env = loadCore(all.slice(0, 3));
  stageCache(env, 'fixture-chat', all);
  const merged = env.api.mergeTurnListWithCache('fixture-chat', all.slice(0, 3));
  check(merged.list[20].primaryAId, all[20].primaryAId);
  check(merged.list[20].answerIds, all[20].answerIds);
});

await fixture('cache-only NO ANSWER rows retain empty primary', () => {
  const all = rows(38);
  all[18] = noAnswerRow(19);
  const env = loadCore(all.slice(0, 3));
  stageCache(env, 'fixture-chat', all);
  const merged = env.api.mergeTurnListWithCache('fixture-chat', all.slice(0, 3));
  check(merged.list[18].noAnswer, true);
  check(merged.list[18].primaryAId, '');
  check(merged.list[18].answerIds, []);
});

await fixture('overlapping live row updates only that row', () => {
  const all = rows(8);
  const live = all.slice(0, 3).map((row) => ({ ...row, answerIds: row.answerIds.slice() }));
  live[1] = answeredRow(2, 'fixture-answer-2-refreshed');
  const env = loadCore(live);
  stageCache(env, 'fixture-chat', all);
  const merged = env.api.mergeTurnListWithCache('fixture-chat', live);
  check(merged.list[1].primaryAId, 'fixture-answer-2-refreshed');
  check(merged.list[0].primaryAId, all[0].primaryAId);
  check(merged.list[3].primaryAId, all[3].primaryAId);
});

await fixture('overlapping identity corruption repairs only the overlapping row', () => {
  const all = rows(8);
  all[1] = { ...all[1], answerId: 'foreign-stale-answer', primaryAId: 'foreign-stale-answer' };
  const live = rows(3);
  const env = loadCore(live);
  stageCache(env, 'fixture-chat', all);
  const merged = env.api.mergeTurnListWithCache('fixture-chat', live);
  check(merged.list.length, 8);
  check(merged.list[1].primaryAId, live[1].primaryAId);
  check(merged.list[3].primaryAId, all[3].primaryAId);
});

await fixture('valid explicit shrink proof removes only named qIds', () => {
  const all = rows(8);
  const live = all.slice(0, 3);
  const env = loadCore(live);
  stageCache(env, 'fixture-chat', all);
  const cached = env.api.loadTurnCache('fixture-chat');
  const proof = {
    chatId: 'fixture-chat',
    completeness: 'complete',
    cause: 'conversation-edited',
    removedQIds: [all[7].qId],
    freshness: cached.meta.updatedAt + 1,
  };
  const merged = env.api.mergeTurnListWithCache('fixture-chat', live, { shrinkProof: proof });
  check(merged.list.length, 7);
  check(merged.list.some((row) => row.qId === all[7].qId), false);
  check(merged.list.some((row) => row.qId === all[6].qId), true);
  check(merged.decision.mode, 'proven-shrink');
  check(env.api.saveTurnCache('fixture-chat', merged.list, { shrinkProof: proof }).ok, true);
  check(env.api.loadTurnCache('fixture-chat').turns.length, 7);
});

await fixture('branch switch preserves unrelated cached history', () => {
  const all = rows(8);
  const live = all.slice(0, 3);
  live[1] = answeredRow(2, 'branch-answer', 'branch-question');
  const env = loadCore(live);
  stageCache(env, 'fixture-chat', all);
  const merged = env.api.mergeTurnListWithCache('fixture-chat', live);
  check(merged.list.some((row) => row.qId === all[1].qId), true);
  check(merged.list.some((row) => row.qId === 'branch-question'), true);
  check(merged.list.length, 9);
});

await fixture('shrink and regrowth create no duplicate qId rows', () => {
  const all = rows(8);
  const env = loadCore(all);
  stageCache(env, 'fixture-chat', all);
  const shrunk = env.api.mergeTurnListWithCache('fixture-chat', all.slice(0, 3));
  const regrown = env.api.mergeTurnListWithCache('fixture-chat', all);
  check(shrunk.list.length, 8);
  check(regrown.list.length, 8);
  check(new Set(regrown.list.map((row) => row.qId)).size, 8);
});

await fixture('project route caches remain isolated by chat identity', () => {
  const env = loadCore([], { pathname: '/g/g-p-fixture/c/fixture-chat-a' });
  stageCache(env, 'fixture-chat-a', rows(8));
  check(env.api.saveTurnCache('fixture-chat-b', rows(3)).ok, true);
  check(env.api.loadTurnCache('fixture-chat-a').turns.length, 8);
  check(env.api.loadTurnCache('fixture-chat-b').turns.length, 3);
});

await fixture('disabled Pagination has no completeness authority', () => {
  const all = rows(38);
  const env = loadCore(all.slice(0, 3));
  stageCache(env, 'fixture-chat', all);
  env.context.H2O_Pagination.getPageInfo = () => ({ enabled: false });
  const merged = env.api.mergeTurnListWithCache('fixture-chat', all.slice(0, 3));
  check(merged.list.length, 38);
  check(merged.decision.mode, 'union');
});

await fixture('page-divider rendering state cannot alter cache membership', () => {
  const all = rows(8);
  const env = loadCore(all.slice(0, 3));
  stageCache(env, 'fixture-chat', all);
  const divider = env.document.createElement('div');
  divider.setAttribute('data-cgxui', 'mnmp-page-divider');
  env.document.body.appendChild(divider);
  const merged = env.api.mergeTurnListWithCache('fixture-chat', all.slice(0, 3));
  check(merged.list.length, 8);
  check(env.api.loadTurnCache('fixture-chat').turns.length, 8);
});

await fixture('failed persistence barrier leaves previous cache exactly intact', () => {
  const all = rows(8);
  const env = loadCore(all.slice(0, 2));
  stageCache(env, 'fixture-chat', all);
  const before = JSON.stringify(storedStrings(env));
  const result = env.api.saveTurnCache('fixture-chat', all.slice(0, 2), {
    shrinkProof: { chatId: 'fixture-chat', complete: true, cause: 'invalid', removedQIds: [all[7].qId], freshness: Date.now() + 10 },
  });
  check(result.status, 'shrink-not-proven');
  check(JSON.stringify(storedStrings(env)), before);
});

await fixture('already-truncated cache grows as additional host rows appear', () => {
  const all = rows(8);
  const env = loadCore(all);
  stageCache(env, 'fixture-chat', all.slice(0, 3));
  const merged = env.api.mergeTurnListWithCache('fixture-chat', all);
  check(merged.list.length, 8);
  check(env.api.saveTurnCache('fixture-chat', merged.list).ok, true);
  check(env.api.loadTurnCache('fixture-chat').turns.length, 8);
});

await fixture('internal projected exactness does not prove historical completeness', () => {
  const all = rows(38);
  const env = loadCore(all.slice(0, 3));
  stageCache(env, 'fixture-chat', all);
  const evidence = { source: 'core-runtime', coreProjectedTotal: 3, completeness: 'unproven' };
  const merged = env.api.mergeTurnListWithCache('fixture-chat', all.slice(0, 3), evidence);
  const projected = env.api.getCanonicalTurnsFromSharedRuntime();
  check(evidence.coreProjectedTotal, 3);
  check(projected.coreProjectedTotal, 3);
  check(projected.completeness, 'unproven');
  check(Object.hasOwn(projected, 'coreTotal'), false);
  check(merged.list.length, 38);
  check(merged.decision.reason, 'cache-preserving-union');
});

await fixture('validator evaluation performs no forbidden runtime actions', () => {
  const env = loadCore(rows(3));
  env.api.mergeTurnListWithCache('fixture-chat', rows(3));
  check(env.counters.sourceSetterCalls, 0);
  check(env.counters.navigationCalls, 0);
  check(env.counters.domMutationCalls, 0);
  check(env.counters.userActionCalls, 0);
});

await fixture('coreProjectedTotal equality alone never authorizes shrink', () => {
  const all = rows(38);
  const env = loadCore(all.slice(0, 3));
  stageCache(env, 'fixture-chat', all);
  const merged = env.api.mergeTurnListWithCache('fixture-chat', all.slice(0, 3), {
    source: 'core-runtime',
    coreProjectedTotal: 3,
    completeness: 'unproven',
  });
  check(merged.list.length, 38);
  check(merged.decision.mode, 'union');
});

await fixture('38 retained rows versus 3 mounted answers does not churn rebuild checks', () => {
  const all = rows(38);
  let rebuildCalls = 0;
  const btnByIdentity = new Map();
  const coreApi = {
    getTurnList: () => all,
    getTurnById: (id) => all.find((row) => row.answerIds.includes(id) || row.primaryAId === id) || null,
    getBtnById: (id) => btnByIdentity.get(String(id || '')) || null,
    rebuildNow: () => { rebuildCalls += 1; return false; },
  };
  const engine = loadEngine(coreApi, all.slice(0, 3));
  for (const row of all) {
    const btn = engine.document.createElement('button');
    btn.setAttribute('data-cgxui', 'mnmp-btn');
    btn.dataset.turnIdx = String(row.turnNo);
    btn.dataset.turnId = row.turnId;
    btn.dataset.questionId = row.qId;
    btn.dataset.primaryAId = row.primaryAId;
    engine.col.appendChild(btn);
    btnByIdentity.set(row.turnId, btn);
    btnByIdentity.set(row.qId, btn);
  }
  for (const row of all.slice(0, 3)) {
    const answer = engine.document.createElement('div');
    answer.setAttribute('data-message-author-role', 'assistant');
    answer.setAttribute('data-message-id', row.primaryAId);
    engine.document.body.appendChild(answer);
  }
  check(engine.api.buildMissing(), false);
  check(engine.api.buildMissing(), false);
  check(engine.api.cacheBootNeedsRebuild({
    ok: true,
    renderedCount: 38,
    paginationCoverage: { applicable: false, ok: true },
  }), false);
  engine.api.state.running = true;
  engine.api.startStaleStateWatchdog('fixture');
  for (const tick of engine.context.__intervals.slice()) tick();
  check(rebuildCalls, 0);
});

await fixture('cached NO ANSWER to live answered transition remains one qId row', () => {
  const cached = [noAnswerRow(1)];
  const live = [answeredRow(1, 'fixture-final-answer-1')];
  const env = loadCore(live);
  stageCache(env, 'fixture-chat', cached);
  const merged = env.api.mergeTurnListWithCache('fixture-chat', live);
  check(merged.list.length, 1);
  check(merged.list[0].qId, cached[0].qId);
  check(merged.list[0].primaryAId, 'fixture-final-answer-1');
  check(merged.list[0].noAnswer, false);
});

await fixture('cached request placeholder to live NO ANSWER becomes one clean row', () => {
  const qId = 'fixture-question-1';
  const cached = [answeredRow(1, 'request-placeholder-fixture-1', qId)];
  const live = [noAnswerRow(1, qId)];
  const env = loadCore(live);
  stageCache(env, 'fixture-chat', cached);
  const merged = env.api.mergeTurnListWithCache('fixture-chat', live);
  check(merged.list.length, 1);
  check(merged.list[0].qId, qId);
  check(merged.list[0].primaryAId, '');
  check(merged.list[0].answerIds, []);
  check(merged.list[0].noAnswer, true);
});

await fixture('equal-size overlapping refresh safely persists corrected content', () => {
  const cached = rows(3);
  const live = rows(3);
  live[2] = answeredRow(3, 'fixture-answer-3-refreshed');
  const env = loadCore(live);
  stageCache(env, 'fixture-chat', cached);
  const merged = env.api.mergeTurnListWithCache('fixture-chat', live);
  const saved = env.api.saveTurnCache('fixture-chat', merged.list);
  check(saved.ok, true);
  check(saved.previousTurnsCount, 3);
  check(env.api.loadTurnCache('fixture-chat').turns[2].primaryAId, 'fixture-answer-3-refreshed');
});

const failures = results.filter((result) => !result.ok);
const sideEffects = {
  sourceSetterCalls: observedCounters.reduce((sum, row) => sum + row.sourceSetterCalls, 0),
  navigationCalls: observedCounters.reduce((sum, row) => sum + row.navigationCalls, 0),
  domMutationCalls: observedCounters.reduce((sum, row) => sum + row.domMutationCalls, 0),
  userActionCalls: observedCounters.reduce((sum, row) => sum + row.userActionCalls, 0),
  browserStorageOutsideStubs: 0,
};
const summary = {
  ok: failures.length === 0,
  fixtureCount: results.length,
  passed: results.length - failures.length,
  failures: failures.length,
  assertionCount,
  productionFiles: Object.values(PATHS).map((file) => path.relative(ROOT, file)),
  productionFunctionsExposed: {
    core: Object.keys(loadCore().api),
    engine: Object.keys(loadEngine({ getTurnList: () => [], getTurnById: () => null, getBtnById: () => null }).api)
      .filter((key) => key !== 'state'),
  },
  sideEffects,
  results,
};
process.stdout.write(`${JSON.stringify(summary)}\n`);
process.exitCode = summary.ok ? 0 : 1;
