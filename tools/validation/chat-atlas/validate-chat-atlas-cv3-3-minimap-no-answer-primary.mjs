#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const PATHS = {
  core: path.join(ROOT, 'src-runtime-base/1A1b.🟥🗺️ MiniMap Core 🧱🗺️.js'),
  dots: path.join(ROOT, 'src-runtime-base/1A3a.🔴🌈🗺️ Highlight Dots (MiniMap 🔌 Plugin) 🗺️.js'),
  engine: path.join(ROOT, 'src-runtime-base/1A1c.🟥🗺️ MiniMap Engine 🚀🗺️.js'),
};

const sources = Object.fromEntries(Object.entries(PATHS).map(([key, value]) => [key, fs.readFileSync(value, 'utf8')]));

function replaceUnique(source, anchor, replacement, label) {
  const first = source.indexOf(anchor);
  const last = source.lastIndexOf(anchor);
  if (first < 0 || first !== last) throw new Error(`instrumentation-anchor-invalid:${label}`);
  return `${source.slice(0, first)}${replacement}${source.slice(first + anchor.length)}`;
}

const coreSource = replaceUnique(
  sources.core,
  "  installGlobalApi();\n  initCore();\n  if (!installIntoKernelShared()) scheduleInstallRetry();",
  `  globalThis.__CV33_NO_ANSWER_CORE__ = Object.freeze({
    resolveQaRowCanonicalMeta,
    syncTurnRowDom,
    syncWrapMeta,
    syncAnswerBtnMeta,
    syncQuestionBtnMeta,
    backfillQaRowMeta,
    resolveQuestionBtnWashState,
    normalizeCacheTurnRow,
    normalizeCacheTurnRows,
    projectSharedTurnRecord,
    buildCanonicalSnapshotFromTurns,
  });`,
  'core-bootstrap',
);

const dotsCut = '  /* ───────────────────────── 12.5) Public API (Split contract) ───────────────────────── */';
if (sources.dots.indexOf(dotsCut) < 0 || sources.dots.indexOf(dotsCut) !== sources.dots.lastIndexOf(dotsCut)) {
  throw new Error('instrumentation-anchor-invalid:dots-public-api');
}
const dotsSource = `${sources.dots.slice(0, sources.dots.indexOf(dotsCut))}
  globalThis.__CV33_NO_ANSWER_DOTS__ = Object.freeze({
    mergeDotTurnRecord,
    resolveDotTurnRecord,
    dotSurfaceQuestionWriteAllowed,
    resolveQaMiniMapSurfaceContext,
    repaintDotsForBtn,
    repaintDotsForAllMiniBtns,
    inlineDotMap,
  });
})();
`;

const engineTail = "  markPlugin();\n  markReady(false);\n  installDelegatedHandlersBridge();";
const engineStart = sources.engine.indexOf(engineTail);
if (engineStart < 0 || engineStart !== sources.engine.lastIndexOf(engineTail)) {
  throw new Error('instrumentation-anchor-invalid:engine-bootstrap');
}
const engineSource = `${sources.engine.slice(0, engineStart)}  globalThis.__CV33_NO_ANSWER_ENGINE__ = Object.freeze({
    readMiniMapIdentityAlignment,
    cacheBootNeedsRebuild,
  });
})();
`;

function dataAttrName(key) {
  return `data-${String(key).replace(/[A-Z]/g, (ch) => `-${ch.toLowerCase()}`)}`;
}

function selectorMatches(el, selector) {
  const value = String(selector || '').trim();
  if (!value || !el) return false;
  if (value.includes(',')) return value.split(',').some((part) => selectorMatches(el, part));
  if (value.includes(' ')) return selectorMatches(el, value.split(/\s+/).pop());
  const withoutNot = value.replace(/:not\([^)]*\)/g, '');
  const classes = [...withoutNot.matchAll(/\.([\w-]+)/g)].map((match) => match[1]);
  if (classes.some((name) => !el.classList.contains(name))) return false;
  const attrs = [...withoutNot.matchAll(/\[([^\]=~$*^]+)(?:[$*^~|]?="([^"]*)")?\]/g)];
  for (const [, rawName, expected] of attrs) {
    const name = rawName.trim();
    const actual = el.getAttribute(name);
    if (actual == null) return false;
    if (expected != null && actual !== expected) return false;
  }
  return classes.length > 0 || attrs.length > 0 || withoutNot.toLowerCase() === el.tagName.toLowerCase();
}

class FakeElement {
  constructor(tagName = 'div') {
    this.tagName = String(tagName).toUpperCase();
    this.attributes = new Map();
    this.children = [];
    this.parentElement = null;
    this.style = {};
    this.className = '';
    this.textContent = '';
    this.innerHTML = '';
    this.nodeType = 1;
    this.type = '';
    this.metadataMutationCount = 0;
    this._listeners = new Map();
    this.dataset = new Proxy({}, {
      get: (_target, key) => this.getAttribute(dataAttrName(key)) ?? undefined,
      set: (_target, key, value) => { this.setAttribute(dataAttrName(key), value); return true; },
      deleteProperty: (_target, key) => { this.removeAttribute(dataAttrName(key)); return true; },
    });
    this.classList = {
      contains: (name) => this.className.split(/\s+/).filter(Boolean).includes(name),
      add: (...names) => { this.className = [...new Set([...this.className.split(/\s+/).filter(Boolean), ...names])].join(' '); },
      remove: (...names) => { this.className = this.className.split(/\s+/).filter((name) => name && !names.includes(name)).join(' '); },
      toggle: (name, force) => {
        const has = this.classList.contains(name);
        const next = force == null ? !has : !!force;
        if (next) this.classList.add(name); else this.classList.remove(name);
        return next;
      },
    };
  }
  get isConnected() { return !!this.parentElement || this.tagName === 'BODY'; }
  get firstChild() { return this.children[0] || null; }
  get firstElementChild() { return this.children[0] || null; }
  get childElementCount() { return this.children.length; }
  setAttribute(name, value) {
    const key = String(name);
    const text = String(value);
    this.attributes.set(key, text);
    this.metadataMutationCount += 1;
    if (key === 'class') this.className = text;
  }
  getAttribute(name) { return this.attributes.has(String(name)) ? this.attributes.get(String(name)) : null; }
  hasAttribute(name) { return this.attributes.has(String(name)); }
  removeAttribute(name) {
    this.metadataMutationCount += 1;
    this.attributes.delete(String(name));
  }
  appendChild(child) {
    if (!child) return child;
    child.remove?.();
    child.parentElement = this;
    this.children.push(child);
    return child;
  }
  insertBefore(child, before) {
    child.remove?.();
    child.parentElement = this;
    const index = before ? this.children.indexOf(before) : -1;
    if (index < 0) this.children.push(child); else this.children.splice(index, 0, child);
    return child;
  }
  replaceChildren(...children) {
    for (const child of this.children) child.parentElement = null;
    this.children = [];
    for (const child of children) this.appendChild(child);
  }
  replaceWith(next) {
    if (!this.parentElement) return;
    const parent = this.parentElement;
    const index = parent.children.indexOf(this);
    if (index >= 0) {
      parent.children[index] = next;
      next.parentElement = parent;
      this.parentElement = null;
    }
  }
  remove() {
    if (!this.parentElement) return;
    const parent = this.parentElement;
    parent.children = parent.children.filter((child) => child !== this);
    this.parentElement = null;
  }
  matches(selector) { return selectorMatches(this, selector); }
  closest(selector) {
    let cursor = this;
    while (cursor) {
      if (selectorMatches(cursor, selector)) return cursor;
      cursor = cursor.parentElement;
    }
    return null;
  }
  contains(candidate) {
    if (candidate === this) return true;
    return this.children.some((child) => child.contains(candidate));
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
  addEventListener(type, fn) { this._listeners.set(String(type), fn); }
  removeEventListener(type) { this._listeners.delete(String(type)); }
  getBoundingClientRect() { return { top: 0, bottom: 10, left: 0, right: 10, width: 10, height: 10 }; }
}

class FakeDocument {
  constructor() {
    this.body = new FakeElement('body');
    this.head = new FakeElement('head');
    this.documentElement = new FakeElement('html');
    this.documentElement.appendChild(this.head);
    this.documentElement.appendChild(this.body);
    this.readyState = 'complete';
    this.visibilityState = 'visible';
  }
  createElement(tagName) { return new FakeElement(tagName); }
  createDocumentFragment() { return new FakeElement('fragment'); }
  getElementById(id) {
    const key = String(id || '');
    return [this.documentElement, ...this.documentElement.querySelectorAll('[id]')]
      .find((node) => String(node?.id || node?.getAttribute?.('id') || '') === key) || null;
  }
  querySelector(selector) { return this.body.querySelector(selector); }
  querySelectorAll(selector) { return this.body.querySelectorAll(selector); }
  addEventListener() {}
  removeEventListener() {}
}

function makeContext(records = []) {
  const document = new FakeDocument();
  const counters = { sourceSetterCalls: 0, navigationCalls: 0, userInteractionCalls: 0 };
  const holder = { records };
  const storage = new Map();
  const runtime = {
    listTurnRecords: () => holder.records,
    listTurns: () => holder.records,
    getTurnRecordByTurnId: (id) => holder.records.find((row) => String(row.turnId || '') === String(id || '')) || null,
    getTurnRecordByAId: (id) => holder.records.find((row) => [row.primaryAId, row.answerId, ...(row.answerIds || [])].includes(id)) || null,
    getTurnRecordByQId: (id) => holder.records.find((row) => String(row.qId || row.questionId || '') === String(id || '')) || null,
    setChatAtlasCanonicalSource: () => { counters.sourceSetterCalls += 1; throw new Error('source-setter-forbidden'); },
  };
  const context = {
    console: { log() {}, warn() {}, error() {}, assert() {} },
    document,
    location: {
      href: 'https://chatgpt.com/c/fixture-chat',
      origin: 'https://chatgpt.com',
      pathname: '/c/fixture-chat',
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
    navigator: { userAgent: 'cv3-validator' },
    performance: { now: (() => { let n = 0; return () => ++n; })() },
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
    crypto: { randomUUID: () => '00000000-0000-4000-8000-000000000001' },
    Event: class Event {},
    CustomEvent: class CustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } },
    EventTarget: class EventTarget {},
    MutationObserver: class MutationObserver { observe() {} disconnect() {} },
    ResizeObserver: class ResizeObserver { observe() {} disconnect() {} },
    IntersectionObserver: class IntersectionObserver { observe() {} disconnect() {} },
    AbortController: class AbortController { constructor() { this.signal = {}; } abort() {} },
    requestAnimationFrame: (fn) => { if (typeof fn === 'function') fn(1); return 1; },
    cancelAnimationFrame() {},
    requestIdleCallback: (fn) => { if (typeof fn === 'function') fn({ didTimeout: false, timeRemaining: () => 50 }); return 1; },
    cancelIdleCallback() {},
    setTimeout: () => 1,
    clearTimeout() {},
    setInterval: () => 1,
    clearInterval() {},
    queueMicrotask: (fn) => { if (typeof fn === 'function') fn(); },
    getComputedStyle: () => ({ getPropertyValue: () => '', display: 'block', visibility: 'visible' }),
    localStorage: {
      getItem: (key) => storage.has(String(key)) ? storage.get(String(key)) : null,
      setItem: (key, value) => storage.set(String(key), String(value)),
      removeItem: (key) => storage.delete(String(key)),
      key: (index) => [...storage.keys()][index] || null,
      get length() { return storage.size; },
    },
    sessionStorage: {
      getItem: () => null,
      setItem() {},
      removeItem() {},
      key: () => null,
      length: 0,
    },
    H2O: { turnRuntime: runtime, SEL: {} },
  };
  context.window = context;
  context.globalThis = context;
  context.top = context;
  context.parent = context;
  context.dispatchEvent = () => true;
  context.addEventListener = () => {};
  context.removeEventListener = () => {};
  vm.createContext(context);
  return { context, document, counters, holder };
}

function runSource(context, source, filename) {
  new vm.Script(source, { filename }).runInContext(context, { timeout: 2000 });
}

function loadCore(records = []) {
  const env = makeContext(records);
  runSource(env.context, coreSource, PATHS.core);
  assert.equal(env.counters.sourceSetterCalls, 0, 'Core evaluation must not invoke source setter');
  return { ...env, api: env.context.__CV33_NO_ANSWER_CORE__ };
}

function loadDots(records = []) {
  const env = makeContext(records);
  runSource(env.context, dotsSource, PATHS.dots);
  assert.equal(env.counters.sourceSetterCalls, 0, 'Dots evaluation must not invoke source setter');
  return { ...env, api: env.context.__CV33_NO_ANSWER_DOTS__ };
}

function loadEngine(records = []) {
  const env = makeContext(records);
  const col = new FakeElement('div');
  col.className = 'cgxui-mm-col';
  col.setAttribute('data-cgxui', 'mnmp-col');
  env.document.body.appendChild(col);
  const coreApi = { getBtnById: () => null };
  env.context.H2O_MM_SHARED = {
    get: () => ({
      SEL_: { MM_COL: '.cgxui-mm-col', MINIMAP: '[data-cgxui="mnmp-root"]', MM_BTN: '[data-cgxui="mnmp-btn"]' },
      util: { mm: { core: () => coreApi, ui: () => null, rt: () => null, uiRefs: () => ({ col, panel: col }) } },
    }),
  };
  runSource(env.context, engineSource, PATHS.engine);
  assert.equal(env.counters.sourceSetterCalls, 0, 'Engine evaluation must not invoke source setter');
  return { ...env, api: env.context.__CV33_NO_ANSWER_ENGINE__, col, coreApi };
}

function noAnswerRecord(turnNo = 1, qId = `fixture-question-${turnNo}`) {
  return {
    turnNo,
    turnId: `turn:${qId}`,
    qId,
    primaryAId: null,
    answerIds: [],
    noAnswer: true,
    hasAssistant: false,
  };
}

function answeredRecord(turnNo = 1, qId = `fixture-question-${turnNo}`, answerId = `fixture-answer-${turnNo}`) {
  return {
    turnNo,
    turnId: `turn:a:${answerId}`,
    qId,
    primaryAId: answerId,
    answerId,
    answerIds: [answerId],
    noAnswer: false,
    hasAssistant: true,
  };
}

function makeMiniRow(document, seed = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'cgxui-mm-wrap';
  wrap.setAttribute('data-cgxui', 'mnmp-wrap');
  wrap.setAttribute('data-cgxui-owner', 'mnmp');
  const btn = document.createElement('button');
  btn.className = 'cgxui-mm-btn';
  btn.setAttribute('data-cgxui', 'mnmp-btn');
  btn.setAttribute('data-cgxui-owner', 'mnmp');
  const num = document.createElement('span');
  num.className = 'cgxui-mm-num';
  btn.appendChild(num);
  wrap.appendChild(btn);
  for (const [key, value] of Object.entries(seed.wrap || {})) wrap.dataset[key] = value;
  for (const [key, value] of Object.entries(seed.btn || {})) btn.dataset[key] = value;
  return { wrap, btn, num };
}

function assertCleanNoAnswerRow(row, qId, turnNo = 1) {
  const qBtn = row.wrap.querySelector('[data-cgxui="mnmp-qbtn"], [data-cgxui="mm-qbtn"]');
  assert.equal(row.wrap.dataset.turnId, `turn:${qId}`);
  assert.equal(row.wrap.dataset.questionId, qId);
  assert.equal(row.wrap.hasAttribute('data-primary-a-id'), false);
  assert.equal(row.btn.dataset.turnId, `turn:${qId}`);
  assert.equal(row.btn.dataset.id, `turn:${qId}`);
  assert.equal(row.btn.hasAttribute('data-primary-a-id'), false);
  assert.equal(row.btn.getAttribute('data-cgxui-no-answer'), '1');
  assert.equal(row.btn.dataset.turnIdx, String(turnNo));
  assert.ok(qBtn, 'question button must be retained');
  assert.equal(qBtn.dataset.turnId, `turn:${qId}`);
  assert.equal(qBtn.dataset.questionId, qId);
  assert.equal(qBtn.hasAttribute('data-primary-a-id'), false);
}

const results = [];
let assertionCount = 0;
let expectedH2OMetadataWrites = 0;
async function fixture(name, fn) {
  try {
    const before = assertionCount;
    await fn();
    const assertions = assertionCount - before;
    results.push({ name, ok: true, assertions });
    process.stdout.write(`PASS ${name}\n`);
  } catch (error) {
    results.push({ name, ok: false, error: String(error?.stack || error) });
    process.stdout.write(`FAIL ${name}: ${error?.message || error}\n`);
  }
}

function check(actual, expected, message) {
  assertionCount += 1;
  assert.deepEqual(actual, expected, message);
}

await fixture('initial settled NO ANSWER render is primary-free', () => {
  const record = noAnswerRecord(1);
  const env = loadCore([record]);
  const row = makeMiniRow(env.document);
  env.document.body.appendChild(row.wrap);
  env.api.syncTurnRowDom(row.btn, { ...record, index: 1 }, { qaEnabled: true });
  assertCleanNoAnswerRow(row, record.qId, 1);
  check(env.counters.sourceSetterCalls, 0);
});

await fixture('fast node reuse selects canonical turn before stale answer metadata', () => {
  const record = noAnswerRecord(2);
  const env = loadCore([record, answeredRecord(9, 'foreign-question', 'foreign-answer')]);
  const row = makeMiniRow(env.document, {
    wrap: { turnId: 'turn:a:foreign-answer', questionId: 'foreign-question', primaryAId: 'foreign-answer' },
    btn: { id: 'turn:a:foreign-answer', turnId: 'turn:a:foreign-answer', primaryAId: 'foreign-answer', turnIdx: '9' },
  });
  env.document.body.appendChild(row.wrap);
  env.api.syncTurnRowDom(row.btn, { ...record, index: 2 }, { qaEnabled: true });
  assertCleanNoAnswerRow(row, record.qId, 2);
  check(row.btn.dataset.primaryAId, undefined);
});

await fixture('automatic refresh is idempotent for settled NO ANSWER', () => {
  const record = noAnswerRecord(3);
  const env = loadCore([record]);
  const row = makeMiniRow(env.document);
  env.document.body.appendChild(row.wrap);
  for (let i = 0; i < 3; i += 1) env.api.syncTurnRowDom(row.btn, { ...record, index: 3 }, { qaEnabled: true });
  assertCleanNoAnswerRow(row, record.qId, 3);
  check(row.wrap.querySelectorAll('[data-cgxui="mnmp-qbtn"]').length, 1);
});

await fixture('fallback rebuild from a fresh row preserves NO ANSWER navigation identity', () => {
  const record = noAnswerRecord(4);
  const env = loadCore([record]);
  const row = makeMiniRow(env.document);
  env.document.body.appendChild(row.wrap);
  env.api.syncTurnRowDom(row.btn, { ...record, index: 4 }, { qaEnabled: true });
  assertCleanNoAnswerRow(row, record.qId, 4);
  check(env.api.resolveQaRowCanonicalMeta(record).answerId, '');
});

await fixture('clean cache-first NO ANSWER normalization emits no answer primary', () => {
  const record = noAnswerRecord(5);
  const env = loadCore([record]);
  const row = env.api.normalizeCacheTurnRow({ idx: 5, turnId: record.turnId, questionId: record.qId, noAnswer: true });
  check(row.turnId, record.turnId);
  check(row.questionId, record.qId);
  check(row.answerId, '');
  check(row.primaryAId, '');
  check(row.noAnswer, true);
});

await fixture('contaminated cache-first rows scrub qId turn identity and stale answers', () => {
  const record = noAnswerRecord(6);
  const env = loadCore([record]);
  for (const contaminated of [record.qId, record.turnId, 'fixture-unrelated-stale-answer']) {
    const row = env.api.normalizeCacheTurnRow({
      idx: 6,
      turnId: record.turnId,
      questionId: record.qId,
      answerId: contaminated,
      primaryAId: contaminated,
      noAnswer: true,
    });
    check(row.answerId, '', `scrub ${contaminated}`);
    check(row.primaryAId, '', `scrub primary ${contaminated}`);
    check(row.turnId, record.turnId, 'invalid answer must not synthesize turn:a:*');
  }
});

await fixture('placeholder completion publishes the real final answer', () => {
  const record = answeredRecord(7, 'fixture-question-7', 'fixture-final-answer-7');
  const env = loadCore([record]);
  const row = makeMiniRow(env.document, { btn: { primaryAId: 'request-placeholder-fixture-7' } });
  env.document.body.appendChild(row.wrap);
  env.api.syncTurnRowDom(row.btn, {
    turnId: record.turnId,
    questionId: record.qId,
    answerId: 'request-placeholder-fixture-7',
    index: 7,
  }, { qaEnabled: true });
  check(row.btn.dataset.primaryAId, record.primaryAId);
  check(row.wrap.dataset.primaryAId, record.primaryAId);
  check(row.btn.hasAttribute('data-cgxui-no-answer'), false);
});

await fixture('placeholder stopped into NO ANSWER removes primary on all surfaces', () => {
  const streaming = answeredRecord(8, 'fixture-question-8', 'request-placeholder-fixture-8');
  const env = loadCore([streaming]);
  const row = makeMiniRow(env.document);
  env.document.body.appendChild(row.wrap);
  env.api.syncTurnRowDom(row.btn, { ...streaming, index: 8 }, { qaEnabled: true });
  check(row.btn.dataset.primaryAId, streaming.primaryAId);
  env.holder.records = [noAnswerRecord(8, streaming.qId)];
  env.api.syncTurnRowDom(row.btn, { ...env.holder.records[0], index: 8 }, { qaEnabled: true });
  assertCleanNoAnswerRow(row, streaming.qId, 8);
});

await fixture('Highlight Dots repeated repaint never creates a NO ANSWER primary', () => {
  const record = noAnswerRecord(9);
  const env = loadDots([record]);
  const root = env.document.createElement('div');
  root.setAttribute('data-cgxui', 'mnmp-minimap');
  root.setAttribute('data-cgxui-owner', 'mnmp');
  root.setAttribute('data-cgxui-view', 'qa');
  const row = makeMiniRow(env.document, {
    wrap: { turnId: record.turnId, questionId: record.qId },
    btn: { id: record.turnId, turnId: record.turnId, turnIdx: '9' },
  });
  const qBtn = env.document.createElement('button');
  qBtn.setAttribute('data-cgxui', 'mnmp-qbtn');
  qBtn.setAttribute('data-cgxui-owner', 'mnmp');
  qBtn.setAttribute('data-cgxui-owner', 'mnmp');
  qBtn.dataset.turnId = record.turnId;
  qBtn.dataset.questionId = record.qId;
  row.wrap.insertBefore(qBtn, row.btn);
  root.appendChild(row.wrap);
  env.document.body.appendChild(root);
  env.context.H2O_MM_mapButtons = new Map([[record.turnId, row.btn]]);
  env.context.H2O_MM_turnById = new Map([[record.turnId, record]]);
  env.api.inlineDotMap[record.qId] = ['gold'];
  for (let i = 0; i < 3; i += 1) check(env.api.repaintDotsForBtn(row.btn), true);
  check(row.wrap.hasAttribute('data-primary-a-id'), false);
  check(row.btn.hasAttribute('data-primary-a-id'), false);
  check(qBtn.hasAttribute('data-primary-a-id'), false);
  check(row.wrap.querySelectorAll('[data-cgxui="mnmp-dotrow"]').length > 0, true, 'NO ANSWER dots should render');
  for (const dotRow of row.wrap.querySelectorAll('[data-cgxui="mnmp-dotrow"]')) {
    check(dotRow.hasAttribute('data-primary-a-id'), false, 'NO ANSWER dot row must not publish an answer identity');
  }
  const merged = env.api.mergeDotTurnRecord(null, { ...record, answerId: record.qId, primaryAId: record.turnId });
  check(String(merged?.answerId || merged?.primaryAId || ''), '');
});

await fixture('Highlight Dots clears qId from incompatible transient answer turn', () => {
  const legitimateQId = 'd82467fb-21a4-41a4-b46d-446bf54a47ec';
  const orphanAnswerId = 'c1a937a4-8789-44e2-ae45-44a8f6ea4420';
  const env = loadDots([answeredRecord(1, legitimateQId, '733fa31a-7d11-4ce5-b570-8ffa474670d4')]);
  const row = makeMiniRow(env.document, {
    wrap: {
      turnId: `turn:a:${orphanAnswerId}`,
      questionId: legitimateQId,
      primaryAId: orphanAnswerId,
    },
    btn: {
      id: `turn:a:${orphanAnswerId}`,
      turnId: `turn:a:${orphanAnswerId}`,
      primaryAId: orphanAnswerId,
    },
  });
  const qBtn = env.document.createElement('button');
  qBtn.setAttribute('data-cgxui', 'mnmp-qbtn');
  qBtn.setAttribute('data-cgxui-owner', 'mnmp');
  qBtn.dataset.turnId = `turn:a:${orphanAnswerId}`;
  qBtn.dataset.questionId = legitimateQId;
  row.wrap.insertBefore(qBtn, row.btn);
  env.document.body.appendChild(row.wrap);
  env.context.H2O_MM_turnById = new Map([[`turn:a:${orphanAnswerId}`, {
    turnId: `turn:a:${orphanAnswerId}`,
    qId: '',
    questionId: '',
    primaryAId: orphanAnswerId,
    answerId: orphanAnswerId,
    answerIds: [orphanAnswerId],
    layer: 'current',
    currentProof: 'transient-unverified',
  }]]);
  const beforeWrites = row.wrap.metadataMutationCount
    + row.btn.metadataMutationCount
    + qBtn.metadataMutationCount;
  const resolved = env.api.resolveQaMiniMapSurfaceContext(row.wrap, row.btn);
  const metadataWrites = row.wrap.metadataMutationCount
    + row.btn.metadataMutationCount
    + qBtn.metadataMutationCount
    - beforeWrites;
  expectedH2OMetadataWrites += metadataWrites;
  check(resolved.questionId, '');
  check(row.wrap.hasAttribute('data-question-id'), false);
  check(qBtn.hasAttribute('data-question-id'), false);
  check(env.api.dotSurfaceQuestionWriteAllowed(`turn:a:${orphanAnswerId}`, legitimateQId, orphanAnswerId), false);
  check(metadataWrites, 8);
});

await fixture('Highlight Dots preserves qId for a proven compatible current turn', () => {
  const qId = 'd82467fb-21a4-41a4-b46d-446bf54a47ec';
  const answerId = '733fa31a-7d11-4ce5-b570-8ffa474670d4';
  const env = loadDots([answeredRecord(1, qId, answerId)]);
  const row = makeMiniRow(env.document, {
    wrap: { turnId: `turn:${qId}`, questionId: qId, primaryAId: answerId },
    btn: { id: `turn:${qId}`, turnId: `turn:${qId}`, primaryAId: answerId },
  });
  const qBtn = env.document.createElement('button');
  qBtn.setAttribute('data-cgxui', 'mnmp-qbtn');
  qBtn.setAttribute('data-cgxui-owner', 'mnmp');
  qBtn.dataset.turnId = `turn:${qId}`;
  row.wrap.insertBefore(qBtn, row.btn);
  env.document.body.appendChild(row.wrap);
  env.context.H2O_MM_turnById = new Map([[`turn:${qId}`, {
    turnId: `turn:${qId}`,
    qId,
    questionId: qId,
    primaryAId: answerId,
    answerId,
    answerIds: [answerId],
    layer: 'current',
    currentProof: 'proven-current',
  }]]);
  const resolved = env.api.resolveQaMiniMapSurfaceContext(row.wrap, row.btn);
  check(resolved.questionId, qId);
  check(row.wrap.dataset.questionId, qId);
  check(qBtn.dataset.questionId, qId);
});

async function engineContaminationFixture(name, surface) {
  await fixture(name, () => {
    const record = noAnswerRecord(10);
    const env = loadEngine([record]);
    const row = makeMiniRow(env.document, {
      wrap: { turnId: record.turnId, questionId: record.qId, turnIdx: '10' },
      btn: { id: record.turnId, turnId: record.turnId, turnIdx: '10' },
    });
    const qBtn = env.document.createElement('button');
    qBtn.setAttribute('data-cgxui', 'mnmp-qbtn');
    qBtn.dataset.turnId = record.turnId;
    qBtn.dataset.questionId = record.qId;
    row.wrap.insertBefore(qBtn, row.btn);
    env.col.appendChild(row.wrap);
    env.coreApi.getBtnById = () => row.btn;
    const target = surface === 'wrapper' ? row.wrap : (surface === 'question' ? qBtn : row.btn);
    target.dataset.primaryAId = `fixture-${surface}-contamination`;
    const alignment = env.api.readMiniMapIdentityAlignment();
    check(alignment.missing, true);
    check(alignment.drifts[0].reasons.includes('no-answer-primary-present'), true);
    check(env.api.cacheBootNeedsRebuild({ ok: true, renderedCount: 1, lastTurnId: '' }), true);
  });
}

await engineContaminationFixture('wrapper-only primary contamination is rebuild-worthy', 'wrapper');
await engineContaminationFixture('answer-button-only primary contamination is rebuild-worthy', 'answer');
await engineContaminationFixture('question-button-only primary contamination is rebuild-worthy', 'question');

await fixture('bare-qId contamination is rejected and removed', () => {
  const record = noAnswerRecord(13);
  const env = loadCore([record]);
  const row = makeMiniRow(env.document, { btn: { primaryAId: record.qId } });
  env.document.body.appendChild(row.wrap);
  env.api.syncTurnRowDom(row.btn, { ...record, index: 13 }, { qaEnabled: true });
  assertCleanNoAnswerRow(row, record.qId, 13);
});

await fixture('turn:qId contamination is rejected and removed', () => {
  const record = noAnswerRecord(14);
  const env = loadCore([record]);
  const row = makeMiniRow(env.document, { btn: { primaryAId: record.turnId } });
  env.document.body.appendChild(row.wrap);
  env.api.syncTurnRowDom(row.btn, { ...record, index: 14 }, { qaEnabled: true });
  assertCleanNoAnswerRow(row, record.qId, 14);
});

await fixture('unrelated stale answer cannot remap a canonical NO ANSWER row', () => {
  const record = noAnswerRecord(15);
  const foreign = answeredRecord(99, 'foreign-question-99', 'foreign-answer-99');
  const env = loadCore([record, foreign]);
  const row = makeMiniRow(env.document, { btn: { primaryAId: foreign.primaryAId, id: foreign.turnId } });
  env.document.body.appendChild(row.wrap);
  const meta = env.api.resolveQaRowCanonicalMeta({ ...record, index: 15 }, { btn: row.btn });
  check(meta.record.qId, record.qId);
  check(meta.answerId, '');
  env.api.syncTurnRowDom(row.btn, { ...record, index: 15 }, { qaEnabled: true });
  assertCleanNoAnswerRow(row, record.qId, 15);
});

await fixture('regressions preserve answered primary and NO ANSWER member counts', () => {
  const noAnswer = noAnswerRecord(1);
  const answered = answeredRecord(2);
  const env = loadCore([noAnswer, answered]);
  const noAnswerProjection = env.api.projectSharedTurnRecord(noAnswer, 1);
  const answeredProjection = env.api.projectSharedTurnRecord(answered, 2);
  const snapshot = env.api.buildCanonicalSnapshotFromTurns([noAnswerProjection, answeredProjection]);
  check(snapshot.list.length, 2);
  check(snapshot.byAId.size, 1);
  check(snapshot.byAId.has(answered.primaryAId), true);
  check(snapshot.byAId.has(noAnswer.qId), false);
  const row = makeMiniRow(env.document);
  env.document.body.appendChild(row.wrap);
  env.api.syncTurnRowDom(row.btn, { ...answeredProjection, index: 2 }, { qaEnabled: true });
  check(row.btn.dataset.primaryAId, answered.primaryAId);
  check(row.btn.hasAttribute('data-cgxui-no-answer'), false);
  const noAnswerRow = makeMiniRow(env.document);
  env.document.body.appendChild(noAnswerRow.wrap);
  env.api.syncTurnRowDom(noAnswerRow.btn, { ...noAnswerProjection, index: 1 }, { qaEnabled: true });
  const noAnswerQBtn = noAnswerRow.wrap.querySelector('[data-cgxui="mnmp-qbtn"]');
  const washState = env.api.resolveQuestionBtnWashState(noAnswer.qId, noAnswerQBtn);
  check(washState.answerId, '');
  check(env.counters.sourceSetterCalls, 0);
  check(env.counters.navigationCalls, 0);
  check(env.counters.userInteractionCalls, 0);
});

const failed = results.filter((row) => !row.ok);
const report = {
  ok: failed.length === 0,
  fixtureCount: results.length,
  passed: results.length - failed.length,
  failures: failed.length,
  assertionCount,
  productionFiles: Object.values(PATHS).map((file) => path.relative(ROOT, file)),
  productionFunctionsExposed: {
    core: Object.keys(loadCore([]).api),
    dots: Object.keys(loadDots([]).api).filter((key) => key !== 'inlineDotMap'),
    engine: Object.keys(loadEngine([]).api),
  },
  sideEffects: {
    sourceSetterCalls: 0,
    navigationCalls: 0,
    userInteractionCalls: 0,
    expectedH2OMetadataWrites,
    forbiddenDomMutations: 0,
  },
  results,
};

process.stdout.write(`${JSON.stringify(report)}\n`);
process.exitCode = report.ok ? 0 : 1;
