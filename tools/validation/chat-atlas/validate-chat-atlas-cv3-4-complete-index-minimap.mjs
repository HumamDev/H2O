#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const MINIMAP_PATH = 'src-runtime-base/1A1b.🟥🗺️ MiniMap Core 🧱🗺️.js';
const source = fs.readFileSync(path.join(ROOT, MINIMAP_PATH), 'utf8');
const CHAT_ID = '6928b333-12f4-8328-9e41-6a01def45127';
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
const environments = [];

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

function replaceUnique(input, anchor, replacement, label) {
  const index = input.indexOf(anchor);
  if (index < 0 || index !== input.lastIndexOf(anchor)) throw new Error(`instrumentation-anchor-invalid:${label}`);
  return `${input.slice(0, index)}${replacement}${input.slice(index + anchor.length)}`;
}

const instrumentedSource = replaceUnique(
  source,
  "  installGlobalApi();\n  initCore();\n  if (!installIntoKernelShared()) scheduleInstallRetry();",
  `  globalThis.__CV34_COMPLETE_INDEX_MINIMAP__ = Object.freeze({
    getCompleteIndexProjectionStatus,
    getCompleteIndexMiniMapDiagnostics,
    getCanonicalTurnsFromSharedRuntime,
    getAuthoritativeTurnSnapshot,
    indexTurns,
    publishTurnSnapshot,
    ensureTurnButtons,
    renderCompleteIndexBoundaryState,
    clearCompleteIndexBoundaryState,
    renderFromCache,
    appendTurnFromAnswerEl,
    rebuildNow,
    bindCompleteIndexStateListener,
    unbindCompleteIndexStateListener,
    getTurnList,
    saveTurnCache,
    loadTurnCache,
    state: S,
  });`,
  'minimap-bootstrap',
);

function dataAttrName(key) {
  return `data-${String(key).replace(/[A-Z]/g, (character) => `-${character.toLowerCase()}`)}`;
}

function selectorMatches(element, selector) {
  const value = String(selector || '').trim();
  if (!value || !element) return false;
  if (value.includes(',')) return value.split(',').some((part) => selectorMatches(element, part));
  if (value.includes(' ')) return selectorMatches(element, value.split(/\s+/).pop());
  const clean = value.replace(/:not\([^)]*\)/g, '');
  const classes = [...clean.matchAll(/\.([\w-]+)/g)].map((match) => match[1]);
  if (classes.some((name) => !element.classList.contains(name))) return false;
  const attributes = [...clean.matchAll(/\[([^\]=~$*^]+)(?:[$*^~|]?="([^"]*)")?\]/g)];
  for (const [, rawName, expected] of attributes) {
    const actual = element.getAttribute(rawName.trim());
    if (actual == null || (expected != null && actual !== expected)) return false;
  }
  return classes.length > 0 || attributes.length > 0 || clean.toLowerCase() === element.tagName.toLowerCase();
}

class FakeElement {
  constructor(tagName = 'div', counters = null) {
    this.tagName = String(tagName).toUpperCase();
    this.attributes = new Map();
    this.children = [];
    this.parentElement = null;
    this.nodeType = 1;
    this.className = '';
    this._textContent = '';
    this._counters = counters;
    this.style = { cssText: '', getPropertyValue: () => '', setProperty() {}, removeProperty() {} };
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
  get firstElementChild() { return this.children[0] || null; }
  get childElementCount() { return this.children.length; }
  get textContent() {
    return this._textContent || this.children.map((child) => child.textContent).join('');
  }
  set textContent(value) {
    this._textContent = String(value || '');
    for (const child of this.children) child.parentElement = null;
    this.children = [];
  }
  set innerHTML(value) {
    this.textContent = '';
    const html = String(value || '');
    for (const match of html.matchAll(/<span class="([^"]+)"[^>]*>([^<]*)<\/span>/g)) {
      const span = new FakeElement('span', this._counters);
      span.className = match[1];
      span.textContent = match[2];
      this.appendChild(span);
    }
  }
  get innerHTML() { return ''; }
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
    if (this._counters) this._counters.domWrites += 1;
    return child;
  }
  replaceChildren(...children) {
    for (const child of this.children) child.parentElement = null;
    this.children = [];
    this._textContent = '';
    for (const child of children) {
      if (child?.tagName === 'FRAGMENT') {
        for (const nested of child.children.slice()) this.appendChild(nested);
      } else if (child) this.appendChild(child);
    }
  }
  remove() {
    if (!this.parentElement) return;
    this.parentElement.children = this.parentElement.children.filter((child) => child !== this);
    this.parentElement = null;
    if (this._counters) this._counters.domWrites += 1;
  }
  contains(candidate) { return candidate === this || this.children.some((child) => child.contains(candidate)); }
  matches(selector) { return selectorMatches(this, selector); }
  closest(selector) {
    let current = this;
    while (current) {
      if (selectorMatches(current, selector)) return current;
      current = current.parentElement;
    }
    return null;
  }
  querySelectorAll(selector) {
    const output = [];
    const visit = (node) => {
      for (const child of node.children) {
        if (selectorMatches(child, selector)) output.push(child);
        visit(child);
      }
    };
    visit(this);
    return output;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  addEventListener() {}
  removeEventListener() {}
  getBoundingClientRect() { return { top: 0, bottom: 10, left: 0, right: 10, width: 10, height: 10 }; }
}

class FakeDocument {
  constructor(counters) {
    this.counters = counters;
    this.documentElement = new FakeElement('html', counters);
    this.head = new FakeElement('head', counters);
    this.body = new FakeElement('body', counters);
    this.documentElement.appendChild(this.head);
    this.documentElement.appendChild(this.body);
    this.readyState = 'complete';
    this.visibilityState = 'visible';
  }
  createElement(tagName) { return new FakeElement(tagName, this.counters); }
  createDocumentFragment() { return new FakeElement('fragment', this.counters); }
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
  const state = { reads: 0, writes: 0, removals: 0 };
  return {
    map,
    state,
    api: {
      getItem(key) { state.reads += 1; return map.has(String(key)) ? map.get(String(key)) : null; },
      setItem(key, value) { state.writes += 1; map.set(String(key), String(value)); },
      removeItem(key) { state.removals += 1; map.delete(String(key)); },
      key(index) { return [...map.keys()][index] || null; },
      get length() { return map.size; },
    },
  };
}

function acceptedRecords() {
  const rows = [];
  for (let turnNo = 1; turnNo <= 38; turnNo += 1) {
    let qId = `fixture-product-q-${String(turnNo).padStart(2, '0')}`;
    let answerIds = [`fixture-product-a-${String(turnNo).padStart(2, '0')}`];
    let primaryAId = answerIds[0];
    let noAnswer = false;
    let stopped = false;
    if (turnNo === 20) {
      qId = HISTORICAL_Q;
      answerIds = [];
      primaryAId = null;
      noAnswer = true;
      stopped = true;
    } else if (turnNo === 29) {
      qId = Q29;
      answerIds = [A545];
      primaryAId = A545;
    } else if (turnNo === 34) {
      qId = D824;
      answerIds = [A84, A733];
      primaryAId = A733;
    } else if (turnNo === 38) {
      qId = LATEST_Q;
      answerIds = [];
      primaryAId = null;
      noAnswer = true;
    }
    rows.push({
      turnNo,
      idx: turnNo,
      index: turnNo,
      qId,
      questionId: qId,
      turnId: `turn:${qId}`,
      answerIds,
      primaryAId,
      answerId: primaryAId,
      noAnswer,
      stopped,
      hasAssistant: !noAnswer,
      completeIndexAuthority: true,
      completenessProvenance: 'host-payload-full-graph',
      live: { qEl: null, primaryAEl: null, answerEls: [], connected: false },
    });
  }
  return rows;
}

function defaultStatus(overrides = {}) {
  return {
    enabled: false,
    authoritative: false,
    status: 'disabled',
    diagnosticStatus: null,
    chatId: CHAT_ID,
    count: 0,
    source: null,
    fingerprint: null,
    completenessProof: null,
    routeGeneration: 1,
    ...overrides,
  };
}

function createEnvironment({ records = acceptedRecords(), status = defaultStatus(), storage = makeStorage() } = {}) {
  const counters = {
    sourceSetterCalls: 0,
    navigation: 0,
    userActions: 0,
    networkReads: 0,
    networkWrites: 0,
    automaticCanaryExecutions: 0,
    domWrites: 0,
    scheduledRebuilds: 0,
  };
  const document = new FakeDocument(counters);
  const holder = { records: records.slice(), status: { ...status } };
  const turnRuntime = {
    listTurnRecords: () => holder.records,
    listTurns: () => holder.records,
    getTurnRecordByTurnId: (id) => holder.records.find((row) => row.turnId === id) || null,
    getTurnRecordByQId: (id) => holder.records.find((row) => row.qId === id) || null,
    getTurnRecordByAId: (id) => holder.records.find((row) => row.answerIds.includes(id)) || null,
    getCompleteTurnIndexProjectionStatus: () => ({ ...holder.status }),
    setCompleteTurnIndexProjectionCanary: () => {
      counters.sourceSetterCalls += 1;
      throw new Error('canary-setter-forbidden');
    },
    setChatAtlasCanonicalSource: () => {
      counters.sourceSetterCalls += 1;
      throw new Error('source-setter-forbidden');
    },
  };
  const listeners = new Map();
  const context = {
    console: { log() {}, warn() {}, error() {}, assert() {}, debug() {} },
    document,
    location: {
      href: `https://chatgpt.com/c/${CHAT_ID}`,
      origin: 'https://chatgpt.com',
      pathname: `/c/${CHAT_ID}`,
      search: '',
      hash: '',
      assign() { counters.navigation += 1; },
      replace() { counters.navigation += 1; },
      reload() { counters.navigation += 1; },
    },
    history: {
      pushState() { counters.navigation += 1; },
      replaceState() { counters.navigation += 1; },
    },
    navigator: { userAgent: 'cv3.4-complete-index-minimap-validator' },
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
    setInterval: () => 1,
    clearInterval() {},
    queueMicrotask() {},
    fetch() { counters.networkReads += 1; throw new Error('network-forbidden'); },
    XMLHttpRequest: class XMLHttpRequest { constructor() { counters.networkReads += 1; throw new Error('network-forbidden'); } },
    WebSocket: class WebSocket { constructor() { counters.networkWrites += 1; throw new Error('network-forbidden'); } },
    getComputedStyle: () => ({ getPropertyValue: () => '', display: 'block', visibility: 'visible' }),
    localStorage: storage.api,
    sessionStorage: makeStorage().api,
    H2O: { turnRuntime, SEL: {}, util: { getChatId: () => CHAT_ID } },
    H2O_Pagination: { getPageInfo: () => ({ enabled: false }) },
  };
  context.window = context;
  context.globalThis = context;
  context.top = context;
  context.parent = context;
  context.dispatchEvent = () => true;
  context.addEventListener = (type, listener) => {
    const rows = listeners.get(type) || [];
    rows.push(listener);
    listeners.set(type, rows);
  };
  context.removeEventListener = (type, listener) => {
    listeners.set(type, (listeners.get(type) || []).filter((row) => row !== listener));
  };
  vm.createContext(context);
  new vm.Script(instrumentedSource, { filename: MINIMAP_PATH }).runInContext(context, { timeout: 4_000 });
  const api = context.__CV34_COMPLETE_INDEX_MINIMAP__;
  const root = document.createElement('div');
  root.setAttribute('data-cgxui', 'mnmp-root');
  root.setAttribute('data-cgxui-owner', 'mnmp');
  const panel = document.createElement('div');
  const col = document.createElement('div');
  col.className = 'cgxui-mm-col';
  col.setAttribute('data-cgxui', 'mnmp-col');
  col.setAttribute('data-cgxui-owner', 'mnmp');
  panel.appendChild(col);
  root.appendChild(panel);
  document.body.appendChild(root);
  context.H2O_MM_SHARED = {
    get: () => ({
      SEL_: { MM_COL: '.cgxui-mm-col' },
      util: {
        mm: {
          ui: () => ({ ensureUI: () => ({ root, panel }) }),
          uiRefs: () => ({ root, panel, col }),
          rt: () => null,
          core: () => api,
        },
      },
    }),
  };
  const environment = { context, api, document, root, panel, col, holder, storage, counters, listeners };
  environments.push(environment);
  return environment;
}

function completeStatus(status = 'complete-from-cache') {
  return defaultStatus({
    enabled: true,
    authoritative: true,
    status,
    count: 38,
    source: status === 'complete-from-host-payload' ? 'host-payload' : 'cache',
    fingerprint: 'djb2:fixture-complete-index',
    completenessProof: 'host-payload-full-graph',
  });
}

function boxCount(environment) {
  return environment.col.querySelectorAll('[data-cgxui="mnmp-wrap"], [data-cgxui="mm-wrap"], .cgxui-mm-wrap').length;
}

function publishedQIds(environment) {
  return environment.api.getTurnList().map((row) => row.qId);
}

function addMountedAnswers(environment, count) {
  for (let index = 0; index < count; index += 1) {
    const section = environment.document.createElement('section');
    section.setAttribute('data-testid', `conversation-turn-${index + 1}`);
    const answer = environment.document.createElement('article');
    answer.setAttribute('data-message-author-role', 'assistant');
    answer.setAttribute('data-message-id', `mounted-answer-${index + 1}`);
    section.appendChild(answer);
    environment.document.body.appendChild(section);
  }
}

await fixture('gate-disabled status preserves legacy projection behavior', () => {
  const env = createEnvironment({ records: acceptedRecords().slice(0, 4), status: defaultStatus() });
  const result = env.api.rebuildNow('fixture-disabled');
  equal(result.ok, true);
  equal(env.api.getTurnList().length, 4);
  equal(boxCount(env), 4);
  equal(env.api.getCompleteIndexMiniMapDiagnostics().enabled, false);
});

await fixture('loading without cache renders an accessible bounded marker and zero normal boxes', () => {
  const env = createEnvironment({ records: acceptedRecords().slice(0, 7), status: defaultStatus({ enabled: true, status: 'loading-full-index' }) });
  const result = env.api.rebuildNow('fixture-loading');
  equal(result.status, 'loading-full-index');
  equal(env.api.getTurnList().length, 0);
  equal(boxCount(env), 0);
  const marker = env.col.querySelector('[data-cgxui="mnmp-complete-index-status"]');
  ok(marker, 'loading marker missing');
  equal(marker.getAttribute('role'), 'status');
  equal(marker.getAttribute('aria-busy'), 'true');
  equal(marker.textContent, 'Loading full conversation index…');
});

await fixture('payload failure without cache renders full-index-unavailable', () => {
  const env = createEnvironment({ status: defaultStatus({ enabled: true, status: 'full-index-unavailable' }) });
  const result = env.api.rebuildNow('fixture-unavailable');
  equal(result.status, 'full-index-unavailable');
  equal(boxCount(env), 0);
  const marker = env.col.querySelector('[data-complete-index-status="full-index-unavailable"]');
  ok(marker, 'unavailable marker missing');
  equal(marker.getAttribute('aria-busy'), 'false');
  equal(marker.textContent, 'Full conversation index unavailable');
});

await fixture('partial fallback remains diagnostic-only rather than normal boxes', () => {
  const env = createEnvironment({
    records: acceptedRecords().slice(0, 3),
    status: defaultStatus({ enabled: true, status: 'full-index-unavailable', diagnosticStatus: 'partial-fallback-diagnostic-only' }),
  });
  const result = env.api.rebuildNow('fixture-partial-diagnostic');
  equal(result.reason, 'partial-fallback-diagnostic-only');
  equal(env.api.getTurnList().length, 0);
  equal(boxCount(env), 0);
});

await fixture('valid complete cache projects all 38 boxes immediately', () => {
  const env = createEnvironment({ status: completeStatus('complete-from-cache') });
  const result = env.api.rebuildNow('fixture-cache-complete');
  equal(result.ok, true);
  equal(result.built.turns, 38);
  equal(env.api.getTurnList().length, 38);
  equal(boxCount(env), 38);
  equal(env.api.getCompleteIndexMiniMapDiagnostics().boundaryStatus, 'complete');
});

await fixture('host payload completeness publishes all boxes in one transition', () => {
  const env = createEnvironment({ status: defaultStatus({ enabled: true, status: 'loading-full-index' }) });
  env.api.rebuildNow('fixture-before-host');
  equal(boxCount(env), 0);
  env.holder.status = completeStatus('complete-from-host-payload');
  const result = env.api.rebuildNow('fixture-host-complete');
  equal(result.built.turns, 38);
  equal(boxCount(env), 38);
  equal(env.api.getTurnList().length, 38);
});

await fixture('complete-validated keeps the exact 38-row projection', () => {
  const env = createEnvironment({ status: completeStatus('complete-validated') });
  env.api.rebuildNow('fixture-validated');
  equal(env.api.getTurnList().length, 38);
  equal(boxCount(env), 38);
  equal(env.api.getCompleteIndexMiniMapDiagnostics().status, 'complete-validated');
});

await fixture('offline complete cache still renders 38 boxes', () => {
  const env = createEnvironment({ status: completeStatus('offline-complete-cache') });
  env.api.rebuildNow('fixture-offline-cache');
  equal(env.api.getTurnList().length, 38);
  equal(boxCount(env), 38);
});

await fixture('three mounted turns cannot shrink complete MiniMap membership', () => {
  const env = createEnvironment({ status: completeStatus() });
  addMountedAnswers(env, 3);
  env.api.rebuildNow('fixture-three-mounted');
  equal(env.document.querySelectorAll('[data-message-author-role="assistant"]').length, 3);
  equal(env.api.getTurnList().length, 38);
  equal(boxCount(env), 38);
});

await fixture('seven mounted turns cannot shrink complete MiniMap membership', () => {
  const env = createEnvironment({ status: completeStatus() });
  addMountedAnswers(env, 7);
  env.api.rebuildNow('fixture-seven-mounted');
  equal(env.document.querySelectorAll('[data-message-author-role="assistant"]').length, 7);
  equal(env.api.getTurnList().length, 38);
  equal(boxCount(env), 38);
});

await fixture('simulated scrolling windows never change count order or numbering', () => {
  const env = createEnvironment({ status: completeStatus() });
  const expectedQIds = acceptedRecords().map((row) => row.qId);
  for (const count of [3, 7, 12, 5, 20, 1, 38]) {
    for (const node of env.document.querySelectorAll('[data-testid]')) node.remove();
    addMountedAnswers(env, count);
    env.api.rebuildNow(`fixture-scroll-window-${count}`);
    equal(env.api.getTurnList().length, 38);
    equal(publishedQIds(env), expectedQIds);
    equal(env.api.getTurnList().map((row) => row.index), Array.from({ length: 38 }, (_v, index) => index + 1));
  }
});

await fixture('DOM mutation incremental append cannot mint historical membership', () => {
  const env = createEnvironment({ status: completeStatus() });
  env.api.rebuildNow('fixture-before-append');
  const section = env.document.createElement('section');
  const answer = env.document.createElement('article');
  answer.setAttribute('data-message-author-role', 'assistant');
  answer.setAttribute('data-message-id', 'foreign-mounted-answer');
  section.appendChild(answer);
  env.document.body.appendChild(section);
  const result = env.api.appendTurnFromAnswerEl(CHAT_ID, answer, { source: 'fixture-mutation' });
  equal(result.status, 'complete-index-authority');
  equal(env.api.getTurnList().length, 38);
  equal(boxCount(env), 38);
});

await fixture('legacy partial MiniMap cache cannot claim or alter complete authority', () => {
  const env = createEnvironment({ status: defaultStatus() });
  const legacyRows = acceptedRecords().slice(0, 3).map((row) => ({ ...row, layer: 'current', currentProof: 'proven-current' }));
  equal(env.api.saveTurnCache(CHAT_ID, legacyRows).ok, true);
  env.holder.status = completeStatus();
  env.api.rebuildNow('fixture-partial-legacy-cache');
  equal(env.api.getTurnList().length, 38);
  equal(boxCount(env), 38);
  equal(env.api.getCompleteIndexMiniMapDiagnostics().legacyCacheAuthoritative, false);
});

await fixture('legacy 38-row MiniMap cache remains separate and non-authoritative', () => {
  const env = createEnvironment({ status: defaultStatus() });
  const foreign = acceptedRecords().map((row, index) => ({
    ...row,
    qId: `foreign-cache-q-${index + 1}`,
    questionId: `foreign-cache-q-${index + 1}`,
    turnId: `turn:foreign-cache-q-${index + 1}`,
    layer: 'current',
    currentProof: 'proven-current',
  }));
  env.api.saveTurnCache(CHAT_ID, foreign);
  env.holder.status = completeStatus();
  env.api.rebuildNow('fixture-full-legacy-cache');
  equal(publishedQIds(env), acceptedRecords().map((row) => row.qId));
  equal(boxCount(env), 38);
});

await fixture('legacy cache-first renderer is bypassed while the complete-index gate is enabled', () => {
  const env = createEnvironment({ status: completeStatus() });
  const result = env.api.renderFromCache(CHAT_ID);
  equal(result.status, 'complete-index-authority');
  equal(result.renderedCount, 0);
  equal(env.api.getTurnList().length, 0);
});

await fixture('q29 remains one exact box with its accepted answer identity', () => {
  const env = createEnvironment({ status: completeStatus() });
  env.api.rebuildNow('fixture-q29');
  const row = env.api.getTurnList().find((turn) => turn.qId === Q29);
  equal(row.answerIds, [A545]);
  equal(row.primaryAId, A545);
  equal(env.col.querySelectorAll(`[data-question-id="${Q29}"]`).length >= 1, true);
});

await fixture('d824 variants collapse to one box with A733 primary', () => {
  const env = createEnvironment({ status: completeStatus() });
  env.api.rebuildNow('fixture-d824');
  const row = env.api.getTurnList().find((turn) => turn.qId === D824);
  equal(row.answerIds, [A84, A733]);
  equal(row.primaryAId, A733);
  equal(env.api.getTurnList().filter((turn) => turn.qId === D824).length, 1);
  equal(env.col.querySelectorAll(`[data-question-id="${D824}"]`).length >= 1, true);
});

await fixture('historical stopped NO ANSWER renders one clean logical box', () => {
  const env = createEnvironment({ status: completeStatus() });
  env.api.rebuildNow('fixture-historical-no-answer');
  const row = env.api.getTurnList().find((turn) => turn.qId === HISTORICAL_Q);
  equal({ answerIds: row.answerIds, primaryAId: row.primaryAId, noAnswer: row.noAnswer }, {
    answerIds: [], primaryAId: '', noAnswer: true,
  });
  equal(env.api.getTurnList().filter((turn) => turn.qId === HISTORICAL_Q).length, 1);
});

await fixture('latest NO ANSWER renders one clean logical box', () => {
  const env = createEnvironment({ status: completeStatus() });
  env.api.rebuildNow('fixture-latest-no-answer');
  const row = env.api.getTurnList().find((turn) => turn.qId === LATEST_Q);
  equal({ answerIds: row.answerIds, primaryAId: row.primaryAId, noAnswer: row.noAnswer }, {
    answerIds: [], primaryAId: '', noAnswer: true,
  });
  equal(env.api.getTurnList().filter((turn) => turn.qId === LATEST_Q).length, 1);
});

await fixture('all four internal context qIds stay absent from rows and boxes', () => {
  const env = createEnvironment({ status: completeStatus() });
  env.api.rebuildNow('fixture-internal-absent');
  for (const qId of INTERNAL_QIDS) {
    equal(publishedQIds(env).includes(qId), false, qId);
    equal(env.col.querySelectorAll(`[data-q-id="${qId}"]`).length, 0, qId);
  }
});

await fixture('canonical count mismatch fails closed instead of falling back to DOM', () => {
  const env = createEnvironment({ records: acceptedRecords().slice(0, 37), status: completeStatus() });
  addMountedAnswers(env, 7);
  const result = env.api.rebuildNow('fixture-count-mismatch');
  equal(result.status, 'full-index-unavailable');
  equal(result.reason, 'complete-index-canonical-count-mismatch');
  equal(env.api.getTurnList().length, 0);
  equal(boxCount(env), 0);
});

await fixture('gate rollback restores legacy projection on rebuild', () => {
  const env = createEnvironment({ status: completeStatus() });
  env.api.rebuildNow('fixture-authority');
  equal(env.api.getTurnList().length, 38);
  env.holder.records = acceptedRecords().slice(0, 4);
  env.holder.status = defaultStatus();
  const rollback = env.api.rebuildNow('fixture-rollback');
  equal(env.api.getCompleteIndexMiniMapDiagnostics().enabled, false);
  ok(rollback.cacheMerge?.mode !== 'complete-index-authority', 'rollback must restore legacy cache merge semantics');
  equal(env.api.getTurnList().length, 38);
});

await fixture('state listener schedules rebuild but never invokes a setter', () => {
  const env = createEnvironment({ status: completeStatus() });
  env.api.bindCompleteIndexStateListener();
  const listener = env.listeners.get('evt:h2o:complete-turn-index:state')?.[0];
  ok(listener, 'complete index state listener missing');
  listener({ detail: { status: 'complete-validated' } });
  equal(env.counters.sourceSetterCalls, 0);
  env.api.unbindCompleteIndexStateListener();
});

await fixture('diagnostics are bounded and expose no private rows', () => {
  const env = createEnvironment({ status: completeStatus() });
  env.api.rebuildNow('fixture-diagnostics');
  const diagnostics = env.api.getCompleteIndexMiniMapDiagnostics();
  equal(diagnostics.expectedCount, 38);
  equal(diagnostics.publishedCount, 38);
  equal('turns' in diagnostics, false);
  equal('answerIds' in diagnostics, false);
  equal('text' in diagnostics, false);
});

await fixture('source selection canary and navigation remain untouched', () => {
  const env = createEnvironment({ status: completeStatus() });
  env.api.rebuildNow('fixture-safety');
  equal(env.counters.sourceSetterCalls, 0);
  equal(env.counters.navigation, 0);
  equal(env.counters.userActions, 0);
  equal(env.counters.automaticCanaryExecutions, 0);
});

await fixture('no unexpected network write or read occurs', () => {
  const env = createEnvironment({ status: completeStatus() });
  env.api.rebuildNow('fixture-network');
  equal(env.counters.networkReads, 0);
  equal(env.counters.networkWrites, 0);
});

const failures = fixtures.filter((row) => !row.ok);
const totals = environments.reduce((out, env) => {
  out.storageReads += env.storage.state.reads;
  out.storageWrites += env.storage.state.writes;
  out.storageRemovals += env.storage.state.removals;
  out.domWrites += env.counters.domWrites;
  out.sourceSetterCalls += env.counters.sourceSetterCalls;
  out.navigation += env.counters.navigation;
  out.userActions += env.counters.userActions;
  out.automaticCanaryExecutions += env.counters.automaticCanaryExecutions;
  out.networkReads += env.counters.networkReads;
  out.networkWrites += env.counters.networkWrites;
  return out;
}, {
  storageReads: 0,
  storageWrites: 0,
  storageRemovals: 0,
  domWrites: 0,
  sourceSetterCalls: 0,
  navigation: 0,
  userActions: 0,
  automaticCanaryExecutions: 0,
  networkReads: 0,
  networkWrites: 0,
});

console.log(`CV-3.4 complete index MiniMap: ${fixtures.length - failures.length}/${fixtures.length} fixtures, ${assertionCount} assertions, ${failures.length} failures`);
console.log(`Counters: storage reads ${totals.storageReads}, writes ${totals.storageWrites}, removals ${totals.storageRemovals}; expected render DOM writes ${totals.domWrites}`);
console.log(`Safety: setters ${totals.sourceSetterCalls}, navigation ${totals.navigation}, user actions ${totals.userActions}, canary executions ${totals.automaticCanaryExecutions}, network reads ${totals.networkReads}, writes ${totals.networkWrites}`);
for (const failure of failures) console.error(`FAIL ${failure.name}\n${failure.error}`);
if (failures.length) process.exitCode = 1;
