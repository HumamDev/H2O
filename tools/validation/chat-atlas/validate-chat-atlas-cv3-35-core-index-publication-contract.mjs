#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const CORE_REL = 'src-runtime-base/0A1a.⬛️🧠 H2O Core 🧠.js';
const CORE_SOURCE = fs.readFileSync(path.join(ROOT, CORE_REL), 'utf8');
const CORE_INDEX_EVENT = 'evt:h2o:core:index:updated';
const CORE_TURN_EVENT = 'evt:h2o:core:turn:updated';

const fixtures = [];
let assertions = 0;
const gate = {
  initialPublications: null,
  identicalRefreshPublications: null,
  versionAfterInitial: null,
  versionAfterIdentical: null,
  versionAdvancedOnIdentical: null,
};

function clean(value) {
  if (value === undefined) return value;
  return value && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : value;
}

function equal(actual, expected, message) {
  assertions += 1;
  assert.deepEqual(clean(actual), clean(expected), message);
}

function ok(value, message) {
  assertions += 1;
  assert.ok(value, message);
}

async function fixture(name, run) {
  try {
    await run();
    fixtures.push({ name, ok: true });
  } catch (error) {
    fixtures.push({ name, ok: false, error: String(error?.stack || error) });
  }
}

function instrumentCore(source) {
  const marker = '  /* ───────────────────────────── 🟨 7) TIME / OBSERVERS ───────────────────────────── */';
  const close = '\n})();';
  const markerIndex = source.indexOf(marker);
  const closeIndex = source.lastIndexOf(close);
  if (markerIndex < 0 || closeIndex <= markerIndex) {
    throw new Error('core-bootstrap-boundary-invalid');
  }
  const exports = `
  globalThis.__CV335_CORE__ = Object.freeze({
    setCanonical(drafts) {
      turnState.paginationDrafts = Array.isArray(drafts) ? drafts : null;
      commitTurnDrafts(turnState.paginationDrafts || [], []);
      return listTurnRecords();
    },
    setMounted(specs) {
      return D.__cv335SetMounted(Array.isArray(specs) ? specs : []);
    },
    refresh(reason) {
      refresh(reason);
      return this.snapshot();
    },
    snapshot() {
      return {
        version: state.version,
        mountedQIds: state.qList.map((row) => row.id),
        mountedAIds: state.aList.map((row) => row.id),
        turns: turnState.turns.map((turn) => ({
          turnNo: turn.turnNo,
          qId: turn.qId || null,
          primaryAId: turn.primaryAId || null,
          noAnswer: turn.noAnswer === true,
          stopped: turn.stopped === true,
        })),
      };
    },
  });
  globalThis.__CV335_CORE_BOOTSTRAP_SUPPRESSED__ = true;
`;
  return `${source.slice(0, markerIndex)}${exports}${close}\n`;
}

const CORE_PROGRAM = instrumentCore(CORE_SOURCE);

class HarnessEvent {
  constructor(type, init = {}) {
    this.type = type;
    this.detail = init.detail;
  }
}

class HarnessElement {
  constructor(id, role, ordinal) {
    this.id = id;
    this.role = role;
    this.ordinal = ordinal;
    this.isConnected = true;
    this.dataset = {
      messageId: id,
      testid: `conversation-turn-${id}`,
      turnId: id,
    };
    this.parentElement = null;
    this.parentNode = null;
    this.ownerDocument = null;
  }

  getAttribute(name) {
    if (name === 'data-message-author-role') return this.role;
    if (name === 'data-message-id') return this.id;
    if (name === 'data-testid') return this.dataset.testid;
    return null;
  }

  hasAttribute(name) {
    return this.getAttribute(name) != null;
  }

  closest() { return null; }
  matches() { return false; }
  contains(node) { return node === this; }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  getBoundingClientRect() {
    return { top: this.ordinal * 100, bottom: this.ordinal * 100 + 80, left: 0, right: 800, width: 800, height: 80 };
  }
  compareDocumentPosition(other) {
    if (other === this) return 0;
    return this.ordinal < other.ordinal ? 4 : 2;
  }
}

function semanticTurns(overrides = {}) {
  const defaults = [
    { turnNo: 1, qId: 'Q1', primaryAId: 'A1', noAnswer: false, stopped: false },
    { turnNo: 2, qId: 'Q2', primaryAId: 'A2', noAnswer: false, stopped: false },
    { turnNo: 3, qId: 'Q3', primaryAId: 'A3', noAnswer: false, stopped: false },
  ];
  return defaults.map((turn, index) => {
    const patch = overrides[index] || {};
    const merged = { ...turn, ...patch };
    const answerIds = merged.noAnswer ? [] : [merged.primaryAId].filter(Boolean);
    return {
      turnNo: merged.turnNo,
      qId: merged.qId,
      answerIds,
      primaryAId: merged.noAnswer ? null : merged.primaryAId,
      noAnswer: merged.noAnswer === true,
      stopped: merged.stopped === true,
      completeIndexAuthority: true,
      completenessProvenance: 'cv3.35-fixture',
      aliasIds: [merged.qId, ...answerIds],
      live: { qEl: null, primaryAEl: null, answerEls: [], connected: false },
    };
  });
}

function mountedPair(qId, aId) {
  return [
    { id: qId, role: 'user' },
    { id: aId, role: 'assistant' },
  ];
}

function createRuntime({ turns = semanticTurns(), mounted = mountedPair('Q1', 'A1') } = {}) {
  const listeners = new Map();
  const events = [];
  let mountedNodes = [];
  let now = 1_000;

  function addEventListener(type, listener) {
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type).add(listener);
  }

  function removeEventListener(type, listener) {
    listeners.get(type)?.delete(listener);
  }

  function dispatchEvent(event) {
    events.push({ type: event.type, detail: clean(event.detail) });
    for (const listener of listeners.get(event.type) || []) listener.call(sandbox, event);
    return true;
  }

  const location = {
    pathname: '/c/cv3-35-core-index',
    href: 'https://chatgpt.com/c/cv3-35-core-index',
    origin: 'https://chatgpt.com',
  };
  const body = new HarnessElement('body', '', 0);
  const document = {
    location,
    body,
    documentElement: body,
    visibilityState: 'visible',
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; },
    querySelectorAll(selector) {
      const text = String(selector || '');
      if (text === '[data-message-author-role]') return mountedNodes.slice();
      if (text === '[data-message-author-role="user"]') return mountedNodes.filter((node) => node.role === 'user');
      if (text === '[data-message-author-role="assistant"]') return mountedNodes.filter((node) => node.role === 'assistant');
      return [];
    },
    getElementById() { return null; },
    createElement() { throw new Error('forbidden-dom-write'); },
    createTextNode() { throw new Error('forbidden-dom-write'); },
    addEventListener,
    removeEventListener,
    dispatchEvent,
    __cv335SetMounted(specs) {
      mountedNodes = specs.map((spec, index) => {
        const node = new HarnessElement(spec.id, spec.role, index + 1);
        node.ownerDocument = document;
        return node;
      });
      return mountedNodes.length;
    },
  };
  body.ownerDocument = document;

  const storage = Object.freeze({
    getItem() { return null; },
    setItem() { throw new Error('forbidden-storage-write'); },
    removeItem() { throw new Error('forbidden-storage-write'); },
  });
  const quietConsole = Object.freeze({ log() {}, warn() {}, error() {}, info() {}, debug() {} });
  const sandbox = {
    console: quietConsole,
    document,
    location,
    history: Object.freeze({ pushState() {}, replaceState() {} }),
    navigator: Object.freeze({ userAgent: 'cv3.35-core-index-publication-contract' }),
    performance: Object.freeze({ now() { return now; } }),
    Date,
    Event: HarnessEvent,
    CustomEvent: HarnessEvent,
    Element: HarnessElement,
    HTMLElement: HarnessElement,
    Node: Object.freeze({ DOCUMENT_POSITION_PRECEDING: 2, DOCUMENT_POSITION_FOLLOWING: 4 }),
    AbortController,
    requestAnimationFrame(fn) { fn(now += 16); return 1; },
    cancelAnimationFrame() {},
    setTimeout(fn) { fn(); return 1; },
    clearTimeout() {},
    setInterval() { throw new Error('forbidden-interval'); },
    clearInterval() {},
    queueMicrotask,
    localStorage: storage,
    sessionStorage: storage,
    crypto: Object.freeze({ randomUUID() { return '00000000-0000-4000-8000-000000000335'; } }),
    addEventListener,
    removeEventListener,
    dispatchEvent,
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.top = sandbox;
  sandbox.globalThis = sandbox;

  document.__cv335SetMounted(mounted);
  const context = vm.createContext(sandbox, { codeGeneration: { strings: false, wasm: false } });
  vm.runInContext(CORE_PROGRAM, context, { filename: CORE_REL, timeout: 8_000 });
  equal(context.__CV335_CORE_BOOTSTRAP_SUPPRESSED__, true, 'Core observer/bootstrap effects are suppressed');
  const api = context.__CV335_CORE__;
  api.setCanonical(turns);
  events.length = 0;
  return {
    api,
    events,
    indexEvents() { return events.filter((event) => event.type === CORE_INDEX_EVENT); },
    turnEvents() { return events.filter((event) => event.type === CORE_TURN_EVENT); },
    setCanonical(nextTurns) { api.setCanonical(nextTurns); },
    setMounted(nextMounted) { api.setMounted(nextMounted); },
  };
}

function assertSinglePublicationForMutation(name, mutate, verify) {
  const runtime = createRuntime();
  const baseline = runtime.api.refresh('baseline');
  const before = runtime.indexEvents().length;
  mutate(runtime);
  const after = runtime.api.refresh(name);
  ok(
    JSON.stringify(after.turns) !== JSON.stringify(baseline.turns),
    `${name} fixture must change semantic identity`,
  );
  verify(after, baseline);
  equal(runtime.indexEvents().length - before, 1, `${name} must publish one core index update`);
}

await fixture('identical refresh suppresses duplicate index publication while version advances', () => {
  const runtime = createRuntime();
  const initial = runtime.api.refresh('initial');
  gate.initialPublications = runtime.indexEvents().length;
  gate.versionAfterInitial = initial.version;
  equal(gate.initialPublications, 1, 'initial refresh must publish exactly one core index update');
  ok(gate.versionAfterInitial > 0, 'initial refresh must advance state.version');

  const identical = runtime.api.refresh('identical');
  gate.identicalRefreshPublications = runtime.indexEvents().length;
  gate.versionAfterIdentical = identical.version;
  gate.versionAdvancedOnIdentical = gate.versionAfterIdentical === gate.versionAfterInitial + 1;
  equal(gate.versionAdvancedOnIdentical, true, 'state.version must advance on an identical refresh attempt');
  equal(
    gate.identicalRefreshPublications,
    1,
    'IDENTICAL_CORE_INDEX_REFRESH_MUST_NOT_REPUBLISH',
  );
});

await fixture('semantic identity changes publish', () => {
  assertSinglePublicationForMutation('qId identity change', (runtime) => {
    runtime.setCanonical(semanticTurns({ 2: { qId: 'Q4', primaryAId: 'A4' } }));
  }, (after) => {
    equal(after.turns.map((turn) => turn.qId), ['Q1', 'Q2', 'Q4'], 'qId control must replace the ordered qId identity');
  });
  assertSinglePublicationForMutation('primaryAId identity change', (runtime) => {
    runtime.setCanonical(semanticTurns({ 1: { primaryAId: 'A2b' } }));
  }, (after) => {
    equal(after.turns[1].primaryAId, 'A2b', 'primaryAId control must replace the selected answer identity');
  });
  assertSinglePublicationForMutation('order change', (runtime) => {
    const source = semanticTurns();
    runtime.setCanonical([source[1], source[0], source[2]]);
  }, (after) => {
    equal(after.turns.map((turn) => turn.qId), ['Q2', 'Q1', 'Q3'], 'order control must reorder semantic identities');
  });
  assertSinglePublicationForMutation('noAnswer semantic change', (runtime) => {
    runtime.setCanonical(semanticTurns({ 1: { noAnswer: true, primaryAId: null } }));
  }, (after) => {
    equal(
      { noAnswer: after.turns[1].noAnswer, primaryAId: after.turns[1].primaryAId },
      { noAnswer: true, primaryAId: null },
      'noAnswer control must change semantic answer state',
    );
  });
  assertSinglePublicationForMutation('stopped semantic change', (runtime) => {
    runtime.setCanonical(semanticTurns({ 1: { stopped: true } }));
  }, (after) => {
    equal(after.turns[1].stopped, true, 'stopped control must change semantic terminal state');
  });
});

await fixture('mount-only identity change publishes with semantic route unchanged', () => {
  const runtime = createRuntime();
  const initial = runtime.api.refresh('baseline');
  const semanticBefore = initial.turns;
  const before = runtime.indexEvents().length;
  runtime.setMounted([
    ...mountedPair('Q1', 'A1'),
    ...mountedPair('Q2', 'A2'),
  ]);
  const after = runtime.api.refresh('mount-only');
  equal(after.turns, semanticBefore, 'mount-only fixture must preserve semantic route identity');
  equal(runtime.indexEvents().length - before, 1, 'mount-only identity change must publish');
});

await fixture('equal-count mounted identity swap publishes', () => {
  const runtime = createRuntime({
    mounted: [...mountedPair('Q1', 'A1'), ...mountedPair('Q2', 'A2')],
  });
  const initial = runtime.api.refresh('baseline');
  const semanticBefore = initial.turns;
  const before = runtime.indexEvents().length;
  runtime.setMounted([...mountedPair('Q2', 'A2'), ...mountedPair('Q3', 'A3')]);
  const after = runtime.api.refresh('equal-count-mount-swap');
  equal(after.turns, semanticBefore, 'equal-count mount swap must preserve semantic route identity');
  equal(after.mountedQIds.length, initial.mountedQIds.length, 'equal-count mount swap must preserve mounted question count');
  equal(after.mountedAIds.length, initial.mountedAIds.length, 'equal-count mount swap must preserve mounted answer count');
  ok(
    after.mountedQIds.join('|') !== initial.mountedQIds.join('|')
      && after.mountedAIds.join('|') !== initial.mountedAIds.join('|'),
    'equal-count mount swap must change ordered mounted identities',
  );
  equal(runtime.indexEvents().length - before, 1, 'equal-count mounted identity swap must publish');
});

await fixture('turn update publication remains independent', () => {
  const runtime = createRuntime();
  equal(runtime.turnEvents().length, 0, 'fixture setup must clear turn-update observations');
  runtime.api.refresh('initial');
  ok(runtime.turnEvents().length >= 1, 'refresh may independently publish core:turn:updated');
  equal(runtime.indexEvents().length, 1, 'turn publication must not duplicate core:index:updated');
});

const failed = fixtures.filter((entry) => !entry.ok);
const passed = fixtures.length - failed.length;

console.log(`CV-3.35 core index publication contract: ${passed}/${fixtures.length} fixtures passed; ${assertions} assertions`);
console.log(`INITIAL_PUBLICATIONS=${gate.initialPublications ?? 'unavailable'}`);
console.log(`IDENTICAL_REFRESH_PUBLICATIONS=${gate.identicalRefreshPublications ?? 'unavailable'}`);
console.log(`VERSION_AFTER_INITIAL=${gate.versionAfterInitial ?? 'unavailable'}`);
console.log(`VERSION_AFTER_IDENTICAL=${gate.versionAfterIdentical ?? 'unavailable'}`);
console.log(`VERSION_ADVANCED_ON_IDENTICAL_REFRESH=${gate.versionAdvancedOnIdentical === true ? 'yes' : 'no'}`);
for (const entry of fixtures) {
  console.log(`${entry.ok ? 'PASS' : 'FAIL'} ${entry.name}`);
  if (!entry.ok) console.log(entry.error);
}

if (failed.length !== 0) process.exitCode = 1;
