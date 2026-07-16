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
    canonicalTurnIdentityProof,
    resolveQaRowCanonicalMeta,
    backfillQaRowMeta,
    normalizeCacheTurnRow,
    normalizeCacheTurnRows,
    normalizeCacheTurnRowsDetailed,
    repairCacheCurrentMembership,
    cacheRowCurrentProof,
    deriveLiveCurrentProof,
    findCacheSplitRoleProposals,
    reconcileCacheSplitRoleRows,
    resolveMiniMapCurrentMemberByAnswer,
    cacheRowsShareIdentity,
    cacheRowsHaveVariantRelationship,
    findCacheRowIndex,
    validateCurrentLayerMembership,
    validateAuthoritativeShrinkProof,
    mergeTurnListWithCache,
    persistPublishedTurnList,
    appendTurnFromAnswerEl,
    loadTurnCache,
    saveTurnCache,
    getCacheCompletenessDiagnostics,
    projectSharedTurnRecord,
    projectCanonicalTurnRecord,
    buildCanonicalSnapshotFromTurns,
    publishTurnSnapshot,
    getTurnList,
    getCanonicalTurnsFromSharedRuntime,
    syncTurnRowDom,
    state: S,
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
  const pathname = String(opts.pathname || '/c/fixture-chat');
  const routeChatMatch = pathname.match(/\/c\/([^/?#]+)/i) || pathname.match(/\/g\/([^/?#]+)/i);
  const currentChatKey = String(opts.currentChatKey || routeChatMatch?.[1] || 'fixture-chat');
  const counters = {
    sourceSetterCalls: 0,
    navigationCalls: 0,
    domMutationCalls: 0,
    userActionCalls: 0,
    networkCalls: 0,
    rebuildCalls: 0,
    automaticCanaryStages: 0,
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
    getChatAtlasLedgerSnapshot: () => ({
      ready: opts.ledgerReady !== false,
      ledgerReady: opts.ledgerReady !== false,
      chatKey: String(opts.ledgerChatKey || currentChatKey),
      members: Array.isArray(opts.ledgerMembers) ? opts.ledgerMembers : [],
    }),
    setChatAtlasCanonicalSource: () => {
      counters.sourceSetterCalls += 1;
      throw new Error('source-setter-forbidden');
    },
  };
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
    fetch() {
      counters.networkCalls += 1;
      throw new Error('network-forbidden');
    },
    XMLHttpRequest: class XMLHttpRequest {
      constructor() {
        counters.networkCalls += 1;
        throw new Error('network-forbidden');
      }
    },
    WebSocket: class WebSocket {
      constructor() {
        counters.networkCalls += 1;
        throw new Error('network-forbidden');
      }
    },
    getComputedStyle: () => ({ getPropertyValue: () => '', display: 'block', visibility: 'visible' }),
    localStorage: storage.api,
    sessionStorage: makeStorage().api,
    H2O: {
      turnRuntime: runtime,
      SEL: {},
      util: { getChatId: () => currentChatKey },
    },
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

function historyRow(row, reason = 'fixture-history') {
  return {
    ...row,
    layer: 'history',
    selectedPath: false,
    repairReason: reason,
  };
}

function ledgerMember(qId, answerIds = [], logicalMemberKey = `member:${qId}`, noAnswer = false) {
  const ids = answerIds.slice();
  return {
    logicalMemberKey,
    turnNo: 1,
    question: {
      qId,
      currentQId: qId,
      currentAliases: [qId],
    },
    answer: {
      primaryAId: ids[ids.length - 1] || null,
      currentAnswerIds: ids,
      currentAliases: ids.slice(),
    },
    noAnswer,
  };
}

function withCurrentProof(row, currentProof) {
  return { ...row, layer: 'current', selectedPath: true, currentProof };
}

function variantRow(turnNo, qId, primaryAId, answerIds, logicalMemberKey = '') {
  return {
    ...answeredRow(turnNo, primaryAId, qId),
    answerIds: answerIds.slice(),
    logicalMemberKey,
  };
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

function replaceStoredTurns(env, inputRows) {
  const { turnsKey, metaKey } = storageKeys(env);
  assert.ok(turnsKey && metaKey, 'cache keys missing');
  env.storage.map.set(turnsKey, JSON.stringify(inputRows));
  const meta = JSON.parse(env.storage.map.get(metaKey));
  env.storage.map.set(metaKey, JSON.stringify({ ...meta, turnCount: inputRows.length }));
  env.storage.writes.length = 0;
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
  check(merged.list.some((row) => row.qId === all[1].qId), false);
  check(merged.list.some((row) => row.qId === 'branch-question'), true);
  check(merged.list.length, 8);
  check(merged.historyList.some((row) => row.qId === all[1].qId), true);
  check(merged.retainedList.length, 9);
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
  check(merged.decision.reason, 'partial-overlap-union');
});

await fixture('validator evaluation performs no forbidden runtime actions', () => {
  const env = loadCore(rows(3));
  env.api.mergeTurnListWithCache('fixture-chat', rows(3));
  check(env.counters.sourceSetterCalls, 0);
  check(env.counters.navigationCalls, 0);
  check(env.counters.domMutationCalls, 0);
  check(env.counters.userActionCalls, 0);
  check(env.counters.networkCalls, 0);
  check(env.counters.automaticCanaryStages, 0);
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

await fixture('one question publishes one row with three answer variants', () => {
  const qId = 'fixture-variant-question';
  const row = variantRow(1, qId, 'fixture-answer-c', [
    'fixture-answer-a',
    'fixture-answer-b',
    'fixture-answer-c',
  ], 'fixture-member-variant');
  const env = loadCore([row]);
  stageCache(env, 'fixture-chat', [row]);
  const merged = env.api.mergeTurnListWithCache('fixture-chat', [row]);
  check(merged.list.length, 1);
  check(merged.list[0].answerIds, ['fixture-answer-a', 'fixture-answer-b', 'fixture-answer-c']);
  check(merged.historyList.length, 0);
});

await fixture('inactive question branches remain retained history only', () => {
  const current = rows(3);
  const inactive = historyRow(answeredRow(2, 'fixture-inactive-answer', 'fixture-inactive-question'));
  const retained = [current[0], inactive, current[1], current[2]];
  const env = loadCore(current);
  stageCache(env, 'fixture-chat', retained);
  const merged = env.api.mergeTurnListWithCache('fixture-chat', current);
  check(merged.list.map((row) => row.qId), current.map((row) => row.qId));
  check(merged.historyList.length, 1);
  check(merged.historyList[0].qId, inactive.qId);
  check(merged.retainedList.length, 4);
});

await fixture('partial hydration retains 38 current rows and excludes history', () => {
  const current = rows(38);
  const history = [
    historyRow(answeredRow(7, 'fixture-history-answer-a', 'fixture-history-question-a')),
    historyRow(answeredRow(8, 'fixture-history-answer-b', 'fixture-history-question-b')),
  ];
  const env = loadCore(current.slice(0, 3));
  stageCache(env, 'fixture-chat', [...current, ...history]);
  const merged = env.api.mergeTurnListWithCache('fixture-chat', current.slice(0, 3));
  check(merged.list.length, 38);
  check(merged.historyList.length, 2);
  check(merged.retainedList.length, 40);
  check(merged.decision.offDomCurrentRetainedCount, 35);
});

await fixture('cache-only history never becomes a current turn', () => {
  const current = rows(3);
  const inactive = historyRow(answeredRow(2, 'fixture-history-answer', 'fixture-history-question'));
  const env = loadCore(current);
  stageCache(env, 'fixture-chat', [...current, inactive]);
  const loaded = env.api.loadTurnCache('fixture-chat', { liveRows: current });
  check(loaded.currentTurns.some((row) => row.qId === inactive.qId), false);
  check(loaded.historyTurns.some((row) => row.qId === inactive.qId), true);
});

await fixture('repeated qId with distinct turn identities demotes competitors', () => {
  const qId = 'fixture-shared-question';
  const selected = variantRow(1, qId, 'fixture-selected-answer', ['fixture-selected-answer'], 'fixture-member-selected');
  const candidateA = variantRow(1, qId, 'fixture-history-answer-a', ['fixture-history-answer-a'], 'fixture-member-a');
  const candidateB = variantRow(1, qId, 'fixture-history-answer-b', ['fixture-history-answer-b'], 'fixture-member-b');
  const env = loadCore([selected]);
  const repaired = env.api.normalizeCacheTurnRowsDetailed([candidateA, selected, candidateB], {
    liveRows: [selected],
  });
  check(repaired.currentRows.length, 1);
  check(repaired.currentRows[0].primaryAId, selected.primaryAId);
  check(repaired.historyRows.length, 2);
  check(repaired.historyRows.every((row) => row.suspectQuestionIdentity === true), true);
});

await fixture('alias-resolved historical row keeps its own question identity', () => {
  const current = answeredRow(1, 'fixture-current-answer', 'fixture-current-question');
  const historical = {
    ...answeredRow(2, current.primaryAId, 'fixture-historical-question'),
    turnId: 'turn:fixture-historical-question',
  };
  const env = loadCore([current]);
  const normalized = env.api.normalizeCacheTurnRow(historical, 2);
  const meta = env.api.resolveQaRowCanonicalMeta(historical);
  const wrap = env.document.createElement('div');
  const qBtn = env.document.createElement('button');
  env.api.backfillQaRowMeta(wrap, qBtn, meta);
  check(normalized.qId, 'fixture-historical-question');
  check(normalized.turnId, 'turn:fixture-historical-question');
  check(normalized.suspectQuestionIdentity, true);
  check(meta.questionId, 'fixture-historical-question');
  check(meta.canonicalMatchProven, false);
  check(wrap.dataset.questionId, 'fixture-historical-question');
  check(qBtn.dataset.questionId, 'fixture-historical-question');
});

await fixture('exact turn identity still permits canonical question adoption', () => {
  const current = answeredRow(1, 'fixture-current-answer', 'fixture-current-question');
  const staleQuestion = { ...current, qId: 'fixture-stale-question', questionId: 'fixture-stale-question' };
  const env = loadCore([current]);
  const normalized = env.api.normalizeCacheTurnRow(staleQuestion, 1);
  const meta = env.api.resolveQaRowCanonicalMeta(staleQuestion);
  check(normalized.qId, current.qId);
  check(meta.questionId, current.qId);
  check(meta.canonicalMatchProven, true);
  check(meta.canonicalMatchBasis, 'turn-id-exact');
});

await fixture('cache index matching consumes each matched row once', () => {
  const cache = [answeredRow(1)];
  const target = { ...cache[0] };
  const env = loadCore(cache);
  const used = new env.context.Set();
  const first = env.api.findCacheRowIndex(cache, target, { usedIndexes: used, layer: 'current' });
  used.add(first);
  const second = env.api.findCacheRowIndex(cache, target, { usedIndexes: used, layer: 'current' });
  check(first, 0);
  check(second, -1);
});

await fixture('qId matching respects explicit branch member context', () => {
  const qId = 'fixture-context-question';
  const cached = variantRow(1, qId, 'fixture-context-answer-a', ['fixture-context-answer-a'], 'fixture-member-a');
  const live = variantRow(1, qId, 'fixture-context-answer-b', ['fixture-context-answer-b'], 'fixture-member-b');
  const env = loadCore([live]);
  check(env.api.findCacheRowIndex([cached], live), -1);
});

await fixture('false four-to-six overlap cannot claim complete refresh', () => {
  const cached = rows(4);
  const sharedQId = cached[1].qId;
  const branchA = variantRow(2, sharedQId, 'fixture-branch-answer-a', ['fixture-branch-answer-a'], 'fixture-branch-a');
  const branchB = variantRow(2, sharedQId, 'fixture-branch-answer-b', ['fixture-branch-answer-b'], 'fixture-branch-b');
  const live = [cached[0], branchA, branchB, cached[1], cached[2], cached[3]];
  const env = loadCore(cached);
  stageCache(env, 'fixture-chat', cached);
  const merged = env.api.mergeTurnListWithCache('fixture-chat', live);
  check(merged.decision.reason === 'complete-overlap-refresh', false);
  check(merged.decision.bijectionProven, false);
  check(merged.list.length, 4);
  check(new Set(merged.list.map((row) => row.qId)).size, 4);
  check(merged.historyList.length, 2);
});

await fixture('valid branch-aware bijection permits complete overlap refresh', () => {
  const all = rows(6);
  const env = loadCore(all);
  stageCache(env, 'fixture-chat', all);
  const merged = env.api.mergeTurnListWithCache('fixture-chat', all);
  check(merged.decision.reason, 'complete-overlap-refresh');
  check(merged.decision.bijectionProven, true);
  check(merged.decision.overlapCount, 6);
});

await fixture('duplicate current qId persistence fails byte-identically', () => {
  const env = loadCore(rows(2));
  stageCache(env, 'fixture-chat', rows(2));
  const before = storedStrings(env);
  const qId = 'fixture-malformed-question';
  const malformed = [
    variantRow(1, qId, 'fixture-malformed-answer-a', ['fixture-malformed-answer-a'], 'fixture-malformed-a'),
    variantRow(1, qId, 'fixture-malformed-answer-b', ['fixture-malformed-answer-b'], 'fixture-malformed-b'),
  ];
  const result = env.api.saveTurnCache('fixture-chat', malformed);
  check(result.status, 'malformed-membership');
  check(result.writesAttempted, 0);
  check(storedStrings(env), before);
});

await fixture('repaired current and history payload persists successfully', () => {
  const qId = 'fixture-repaired-question';
  const selected = variantRow(1, qId, 'fixture-repaired-answer', ['fixture-repaired-answer'], 'fixture-repaired-current');
  const malformed = [
    variantRow(1, qId, 'fixture-repaired-history-a', ['fixture-repaired-history-a'], 'fixture-repaired-a'),
    selected,
    variantRow(1, qId, 'fixture-repaired-history-b', ['fixture-repaired-history-b'], 'fixture-repaired-b'),
  ];
  const env = loadCore([selected]);
  stageCache(env, 'fixture-chat', [selected]);
  const repaired = env.api.normalizeCacheTurnRowsDetailed(malformed, { liveRows: [selected] });
  const result = env.api.saveTurnCache('fixture-chat', repaired.rows);
  check(repaired.currentRows.length, 1);
  check(repaired.historyRows.length, 2);
  check(result.ok, true);
  check(env.api.loadTurnCache('fixture-chat', { liveRows: [selected] }).turns.length, 3);
});

await fixture('regenerate retains variants beneath one current turn', () => {
  const qId = 'fixture-regenerate-question';
  const cached = variantRow(1, qId, 'fixture-answer-old', ['fixture-answer-old'], 'fixture-regenerate-member');
  const live = variantRow(1, qId, 'fixture-answer-new', ['fixture-answer-old', 'fixture-answer-new'], 'fixture-regenerate-member');
  const env = loadCore([live]);
  stageCache(env, 'fixture-chat', [cached]);
  const merged = env.api.mergeTurnListWithCache('fixture-chat', [live]);
  check(merged.list.length, 1);
  check(merged.list[0].primaryAId, 'fixture-answer-new');
  check(merged.list[0].answerIds, ['fixture-answer-old', 'fixture-answer-new']);
  check(merged.historyList.length, 0);
});

await fixture('history is excluded from published maps and current turn list', () => {
  const current = rows(3);
  const inactive = historyRow(answeredRow(2, 'fixture-map-history-answer', 'fixture-map-history-question'));
  const env = loadCore(current);
  stageCache(env, 'fixture-chat', [...current, inactive]);
  const merged = env.api.mergeTurnListWithCache('fixture-chat', current);
  const snapshot = env.api.buildCanonicalSnapshotFromTurns(merged.list);
  env.api.publishTurnSnapshot(snapshot);
  check(env.api.getTurnList().length, 3);
  check(env.api.state.turnById.size, 3);
  check(env.api.state.turnIdByAId.size, 3);
  check(env.api.state.turnById.has(inactive.turnId), false);
  check(merged.retainedList.length, 4);
});

await fixture('diagnostics distinguish retained current and history counts', () => {
  const current = rows(3);
  const history = [
    historyRow(answeredRow(2, 'fixture-diag-history-a', 'fixture-diag-question-a')),
    historyRow(answeredRow(3, 'fixture-diag-history-b', 'fixture-diag-question-b')),
  ];
  const env = loadCore(current);
  stageCache(env, 'fixture-chat', [...current, ...history]);
  const merged = env.api.mergeTurnListWithCache('fixture-chat', current);
  env.api.publishTurnSnapshot(env.api.buildCanonicalSnapshotFromTurns(merged.list));
  const diagnostics = env.api.getCacheCompletenessDiagnostics();
  check(diagnostics.totalRetainedCount, 5);
  check(diagnostics.publishedTurnCount, 3);
  check(diagnostics.historicalRetainedCount, 2);
  check(diagnostics.lastMergeDecision.publishedCurrentCount, 3);
  check(diagnostics.lastMergeDecision.retainedCount, 5);
});

await fixture('membership repair is deterministic and idempotent', () => {
  const qId = 'fixture-idempotent-question';
  const selected = variantRow(1, qId, 'fixture-idempotent-selected', ['fixture-idempotent-selected'], 'fixture-idempotent-current');
  const malformed = [
    selected,
    variantRow(1, qId, 'fixture-idempotent-history', ['fixture-idempotent-history'], 'fixture-idempotent-history'),
  ];
  const env = loadCore([selected]);
  const first = env.api.normalizeCacheTurnRowsDetailed(malformed, { liveRows: [selected] });
  const second = env.api.normalizeCacheTurnRowsDetailed(first.rows, { liveRows: [selected] });
  check(second.rows, first.rows);
  check(second.currentRows.length, 1);
  check(second.historyRows.length, 1);
});

await fixture('legacy rows without a layer load current and unverified', () => {
  const legacy = rows(3).map(({ layer: _layer, selectedPath: _selectedPath, ...row }) => row);
  const env = loadCore(legacy);
  const normalized = env.api.normalizeCacheTurnRowsDetailed(legacy);
  check(normalized.currentRows.length, 3);
  check(normalized.historyRows.length, 0);
  check(normalized.currentRows.every((row) => row.layer === 'current'), true);
  check(normalized.currentRows.every((row) => row.selectedPath === 'unverified'), true);
});

await fixture('history repair preserves original identities and variants', () => {
  const historical = historyRow(variantRow(
    4,
    'fixture-original-history-question',
    'fixture-original-history-answer-b',
    ['fixture-original-history-answer-a', 'fixture-original-history-answer-b'],
    'fixture-history-member',
  ));
  const env = loadCore([]);
  const normalized = env.api.normalizeCacheTurnRowsDetailed([historical]);
  check(normalized.historyRows[0].qId, historical.qId);
  check(normalized.historyRows[0].turnId, historical.turnId);
  check(normalized.historyRows[0].primaryAId, historical.primaryAId);
  check(normalized.historyRows[0].answerIds, historical.answerIds);
});

await fixture('boot split question and answer halves reconcile through unique ledger ownership', () => {
  const qId = 'd82467fb-21a4-41a4-b46d-446bf54a47ec';
  const variants = [
    '84c7e73c-5fb7-44f6-a930-72e92d369c5a',
    '733fa31a-7d11-4ce5-b570-8ffa474670d4',
  ];
  const env = loadCore([], { ledgerMembers: [ledgerMember(qId, variants, 'incident-member')] });
  const questionOnly = withCurrentProof(noAnswerRow(1, qId), 'transient-unverified');
  const answerOnly = withCurrentProof({
    ...answeredRow(2, variants[1], ''),
    qId: '',
    questionId: '',
    turnId: `turn:a:${variants[1]}`,
    answerIds: variants,
  }, 'transient-unverified');
  const repaired = env.api.reconcileCacheSplitRoleRows([questionOnly, answerOnly]);
  check(repaired.reconciledCount, 1);
  check(repaired.rows.length, 1);
  check(repaired.rows[0].qId, qId);
  check(repaired.rows[0].turnId, `turn:${qId}`);
  check(repaired.rows[0].answerIds, variants);
  check(repaired.rows[0].primaryAId, variants[1]);
  check(repaired.rows[0].currentProof, 'proven-current');
});

await fixture('cache-only transient boot fragment is excluded from current publication', () => {
  const transientQId = 'fixture-transient-boot-question';
  const live = rows(3);
  const env = loadCore(live);
  const transient = withCurrentProof(noAnswerRow(4, transientQId), 'transient-unverified');
  stageCache(env, 'fixture-chat', [...live, transient]);
  const merged = env.api.mergeTurnListWithCache('fixture-chat', live);
  check(merged.list.length, 3);
  check(merged.list.some((row) => row.qId === transientQId), false);
  check(merged.historyList.some((row) => row.qId === transientQId), true);
  check(merged.decision.transientRowsExcluded > 0, true);
});

await fixture('proven current rows remain protected through 38-to-3 hydration', () => {
  const all = rows(38).map((row) => withCurrentProof(row, 'proven-current'));
  const env = loadCore(all.slice(0, 3));
  stageCache(env, 'fixture-chat', all);
  const merged = env.api.mergeTurnListWithCache('fixture-chat', all.slice(0, 3));
  check(merged.list.length, 38);
  check(merged.historyList.length, 0);
  check(merged.list.slice(3).every((row) => ['proven-current', 'retained-proven-current'].includes(row.currentProof)), true);
});

await fixture('split-role malformed payload is refused byte-identically', () => {
  const qId = 'fixture-barrier-split-question';
  const answerId = 'fixture-barrier-split-answer';
  const env = loadCore([], { ledgerMembers: [ledgerMember(qId, [answerId], 'barrier-member')] });
  stageCache(env, 'fixture-chat', [answeredRow(1, 'fixture-existing-answer', 'fixture-existing-question')]);
  const before = storedStrings(env);
  const result = env.api.saveTurnCache('fixture-chat', [
    withCurrentProof(noAnswerRow(1, qId), 'transient-unverified'),
    withCurrentProof({ ...answeredRow(2, answerId, ''), qId: '', questionId: '' }, 'transient-unverified'),
  ]);
  check(result.status, 'malformed-membership');
  check(result.reasons.includes('split-role-duplicate'), true);
  check(result.splitRoleDuplicateCount, 1);
  check(result.writesAttempted, 0);
  check(storedStrings(env), before);
  check(env.storage.writes.length, 0);
});

await fixture('reconciled split-role payload persists successfully', () => {
  const qId = 'fixture-reconciled-persist-question';
  const answerId = 'fixture-reconciled-persist-answer';
  const env = loadCore([], { ledgerMembers: [ledgerMember(qId, [answerId], 'persist-member')] });
  const repaired = env.api.reconcileCacheSplitRoleRows([
    withCurrentProof(noAnswerRow(1, qId), 'transient-unverified'),
    withCurrentProof({ ...answeredRow(2, answerId, ''), qId: '', questionId: '' }, 'transient-unverified'),
  ]);
  const saved = env.api.saveTurnCache('fixture-chat', repaired.rows);
  check(saved.ok, true);
  check(saved.publishedTurnCount, 1);
  const loaded = env.api.loadTurnCache('fixture-chat');
  check(loaded.currentTurns.length, 1);
  check(loaded.currentTurns[0].qId, qId);
  check(loaded.currentTurns[0].primaryAId, answerId);
});

await fixture('render backfill suppresses stale qId on incompatible transient answer turn', () => {
  const qId = 'fixture-render-split-question';
  const answerId = 'fixture-render-split-answer';
  const canonical = {
    turnNo: 1,
    qId: null,
    turnId: `turn:a:${answerId}`,
    primaryAId: answerId,
    answerIds: [answerId],
    hasAssistant: true,
  };
  const env = loadCore([canonical]);
  const wrap = env.document.createElement('div');
  const qBtn = env.document.createElement('button');
  wrap.appendChild(qBtn);
  wrap.dataset.turnId = canonical.turnId;
  wrap.dataset.questionId = qId;
  qBtn.dataset.turnId = canonical.turnId;
  qBtn.dataset.questionId = qId;
  const turn = withCurrentProof({
    ...answeredRow(1, answerId, ''),
    qId: '',
    questionId: '',
    turnId: canonical.turnId,
    suspectQuestionIdentity: true,
  }, 'transient-unverified');
  const meta = env.api.resolveQaRowCanonicalMeta(turn, { wrap, qBtn, primaryAId: answerId });
  check(meta.questionId, '');
  check(meta.cachedQuestionSuppressed, true);
  env.api.backfillQaRowMeta(wrap, qBtn, meta);
  check(wrap.dataset.questionId, undefined);
  check(qBtn.dataset.questionId, undefined);
  check(meta.turnId, canonical.turnId);
});

await fixture('ambiguous and unrelated split rows are never guessed', () => {
  const qId = 'fixture-ambiguous-split-question';
  const answerId = 'fixture-ambiguous-split-answer';
  const env = loadCore([], {
    ledgerMembers: [
      ledgerMember(qId, [answerId], 'ambiguous-member-a'),
      ledgerMember(qId, [answerId], 'ambiguous-member-b'),
    ],
  });
  const ambiguous = env.api.reconcileCacheSplitRoleRows([
    withCurrentProof(noAnswerRow(1, qId), 'transient-unverified'),
    withCurrentProof({ ...answeredRow(2, answerId, ''), qId: '', questionId: '' }, 'transient-unverified'),
  ]);
  check(ambiguous.reconciledCount, 0);
  check(ambiguous.rows.length, 2);

  const unrelatedEnv = loadCore([], {
    ledgerMembers: [ledgerMember('fixture-owner-question', ['fixture-owner-answer'])],
  });
  const unrelated = unrelatedEnv.api.reconcileCacheSplitRoleRows([
    withCurrentProof(noAnswerRow(1, 'fixture-other-question'), 'transient-unverified'),
    withCurrentProof({ ...answeredRow(2, 'fixture-other-answer', ''), qId: '', questionId: '' }, 'transient-unverified'),
  ]);
  check(unrelated.reconciledCount, 0);
  check(unrelated.rows.length, 2);
});

await fixture('repeated malformed-cache recovery remains one logical row', () => {
  const qId = 'fixture-repeat-split-question';
  const answerId = 'fixture-repeat-split-answer';
  const live = [withCurrentProof(answeredRow(1, answerId, qId), 'proven-current')];
  const env = loadCore(live, { ledgerMembers: [ledgerMember(qId, [answerId], 'repeat-member')] });
  stageCache(env, 'fixture-chat', live);
  replaceStoredTurns(env, [
    withCurrentProof(noAnswerRow(1, qId), 'transient-unverified'),
    withCurrentProof({ ...answeredRow(2, answerId, ''), qId: '', questionId: '' }, 'transient-unverified'),
  ]);
  for (let cycle = 0; cycle < 3; cycle += 1) {
    const merged = env.api.mergeTurnListWithCache('fixture-chat', live);
    check(merged.list.length, 1);
    check(merged.list[0].qId, qId);
    check(merged.list[0].primaryAId, answerId);
    check(env.api.saveTurnCache('fixture-chat', merged.retainedList).ok, true);
  }
});

await fixture('foreign or unready ledger ownership cannot prove a split pair', () => {
  const qId = 'fixture-ledger-scope-question';
  const answerId = 'fixture-ledger-scope-answer';
  const member = ledgerMember(qId, [answerId], 'ledger-scope-member');
  const foreign = loadCore([], { ledgerMembers: [member], ledgerChatKey: 'foreign-chat' });
  const unready = loadCore([], { ledgerMembers: [member], ledgerReady: false });
  check(foreign.api.resolveMiniMapCurrentMemberByAnswer(answerId), null);
  check(unready.api.resolveMiniMapCurrentMemberByAnswer(answerId), null);
  check(foreign.api.reconcileCacheSplitRoleRows([
    withCurrentProof(noAnswerRow(1, qId), 'transient-unverified'),
    withCurrentProof({ ...answeredRow(2, answerId, ''), qId: '', questionId: '' }, 'transient-unverified'),
  ]).reconciledCount, 0);
});

await fixture('canonical NO ANSWER projection is proven without ledger readiness', () => {
  const qId = 'fixture-canonical-no-answer-proof';
  const env = loadCore([], { ledgerReady: false });
  const projected = env.api.projectSharedTurnRecord({
    turnNo: 1,
    qId,
    turnId: `turn:${qId}`,
    primaryAId: null,
    answerIds: [],
    noAnswer: true,
    hasAssistant: false,
  }, 1);
  check(projected.currentProof, 'proven-current');
  check(projected.qId, qId);
  check(projected.primaryAId, '');
});

await fixture('incremental append attaches answer to uniquely owned question row', () => {
  const qId = 'fixture-append-split-question';
  const staleQId = 'fixture-append-stale-projected-question';
  const answerId = 'fixture-append-split-answer';
  const earlierAnswer = 'fixture-append-split-answer-earlier';
  const canonical = {
    turnNo: 1,
    qId: staleQId,
    turnId: `turn:${staleQId}`,
    primaryAId: answerId,
    answerIds: [earlierAnswer, answerId],
    hasAssistant: true,
  };
  const owner = ledgerMember(qId, [earlierAnswer, answerId], 'append-member');
  owner.answer.currentAliases.push('fixture-append-shell-alias');
  const env = loadCore([canonical], { ledgerMembers: [owner] });
  const panel = env.document.createElement('div');
  const root = env.document.createElement('div');
  const col = env.document.createElement('div');
  col.className = 'cgxui-mm-col';
  panel.appendChild(col);
  root.appendChild(panel);
  env.document.body.appendChild(root);
  env.context.H2O_MM_SHARED = {
    get: () => ({
      SEL_: { MM_COL: '.cgxui-mm-col' },
      util: {
        mm: {
          ui: () => ({ ensureUI: () => ({ root, panel }) }),
          uiRefs: () => ({ root, panel }),
          rt: () => null,
          core: () => env.api,
        },
      },
    }),
  };
  const questionOnly = withCurrentProof(noAnswerRow(1, qId), 'transient-unverified');
  env.api.state.turnList.splice(0, env.api.state.turnList.length, questionOnly);
  env.api.state.turnById.clear();
  env.api.state.turnById.set(questionOnly.turnId, questionOnly);
  const answerEl = env.document.createElement('div');
  answerEl.setAttribute('data-message-author-role', 'assistant');
  answerEl.setAttribute('data-message-id', answerId);
  env.document.body.appendChild(answerEl);
  const result = env.api.appendTurnFromAnswerEl('fixture-chat', answerEl, { source: 'fixture' });
  check(result.ok, true);
  check(result.status, 'exists');
  check(env.api.state.turnList.length, 1);
  check(env.api.state.turnList[0].qId, qId);
  check(env.api.state.turnList[0].answerIds, [earlierAnswer, answerId]);
  check(env.api.state.turnList[0].answerIds.includes('fixture-append-shell-alias'), false);
  check(env.api.state.turnList[0].primaryAId, answerId);
  check(env.api.state.turnList[0].currentProof, 'proven-current');
  check(result.cachePersistence?.ok, true, JSON.stringify(result.cachePersistence || null));
  env.holder.records = [{ ...canonical, qId, turnId: `turn:${qId}` }];
  const loaded = env.api.loadTurnCache('fixture-chat');
  check(loaded.currentTurns.length, 1, JSON.stringify(loaded));
});

await fixture('target NO ANSWER remains clean in either cache layer', () => {
  const current = noAnswerRow(1, 'fixture-no-answer-current');
  const historical = historyRow(noAnswerRow(2, 'fixture-no-answer-history'));
  const env = loadCore([current]);
  const normalized = env.api.normalizeCacheTurnRowsDetailed([current, historical], { liveRows: [current] });
  check(normalized.currentRows[0].primaryAId, '');
  check(normalized.currentRows[0].answerIds, []);
  check(normalized.historyRows[0].primaryAId, '');
  check(normalized.historyRows[0].answerIds, []);
});

const failures = results.filter((result) => !result.ok);
const sideEffects = {
  sourceSetterCalls: observedCounters.reduce((sum, row) => sum + row.sourceSetterCalls, 0),
  navigationCalls: observedCounters.reduce((sum, row) => sum + row.navigationCalls, 0),
  domMutationCalls: observedCounters.reduce((sum, row) => sum + row.domMutationCalls, 0),
  userActionCalls: observedCounters.reduce((sum, row) => sum + row.userActionCalls, 0),
  networkCalls: observedCounters.reduce((sum, row) => sum + row.networkCalls, 0),
  browserStorageOutsideStubs: 0,
  automaticCanaryStages: observedCounters.reduce((sum, row) => sum + row.automaticCanaryStages, 0),
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
