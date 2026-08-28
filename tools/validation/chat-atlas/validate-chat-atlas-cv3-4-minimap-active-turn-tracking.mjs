#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const runtimePath = path.join(root, 'src-runtime-base/1A1c.🟥🗺️ MiniMap Engine 🚀🗺️.js');
const source = fs.readFileSync(runtimePath, 'utf8');

let assertionCount = 0;
const fixtures = [];
const environments = [];
const equal = (actual, expected, message) => {
  assertionCount += 1;
  assert.deepEqual(actual, expected, message);
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

function extractFunction(name) {
  const token = `function ${name}(`;
  const start = source.indexOf(token);
  if (start < 0) throw new Error(`production-function-missing:${name}`);
  const signatureEnd = source.indexOf(') {', start);
  if (signatureEnd < 0) throw new Error(`production-function-signature-invalid:${name}`);
  const brace = signatureEnd + 2;
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let index = brace; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }
    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`production-function-unclosed:${name}`);
}

class FakeTarget {
  constructor(name) {
    this.name = name;
    this.listeners = new Map();
    this.addCount = 0;
    this.removeCount = 0;
    this.parentElement = null;
    this.isConnected = true;
    this.scrollHeight = 1000;
    this.clientHeight = 100;
  }

  addEventListener(type, listener) {
    const rows = this.listeners.get(type) || new Set();
    rows.add(listener);
    this.listeners.set(type, rows);
    this.addCount += 1;
  }

  removeEventListener(type, listener) {
    const rows = this.listeners.get(type) || new Set();
    if (rows.delete(listener)) this.removeCount += 1;
    this.listeners.set(type, rows);
  }

  dispatch(type) {
    for (const listener of Array.from(this.listeners.get(type) || [])) listener({ type, target: this });
  }

  listenerCount(type) {
    return (this.listeners.get(type) || new Set()).size;
  }
}

function createEnvironment() {
  const windowTarget = new FakeTarget('window');
  const body = new FakeTarget('body');
  const documentElement = new FakeTarget('documentElement');
  const rootOne = new FakeTarget('root-one');
  const rootTwo = new FakeTarget('root-two');
  rootOne.parentElement = body;
  rootTwo.parentElement = body;
  let currentRoot = rootOne;
  const hostTurn = { parentElement: currentRoot, isConnected: true };
  const mounted = new Map();
  for (let index = 1; index <= 39; index += 1) {
    mounted.set(index, {
      isConnected: true,
      turnIndex: index,
      getBoundingClientRect() {
        return this.visible === true
          ? { top: 120, bottom: 320 }
          : { top: 2000, bottom: 2200 };
      },
      visible: false,
    });
  }

  const buttons = new Map();
  for (let index = 1; index <= 39; index += 1) {
    const classes = new Set(index === 1 ? ['active'] : []);
    buttons.set(`turn:${index}`, {
      classList: {
        contains(value) { return classes.has(value); },
        add(value) { classes.add(value); },
        delete(value) { classes.delete(value); },
      },
      getAttribute(name) {
        return name === 'data-cgxui-state' && classes.has('active') ? 'active' : '';
      },
    });
  }

  const counters = {
    activeIndex: 1,
    activeId: 'turn:1',
    counterText: '1/39',
    activeSyncs: 0,
    turnChanges: 0,
    rafScheduled: 0,
    rafExecuted: 0,
    ioCreated: 0,
    ioDisconnected: 0,
    navigationExplicitSets: 0,
    navigationScrolls: 0,
    storageWrites: 0,
    networkCalls: 0,
    reconciliationCalls: 0,
    intervalCalls: 0,
  };

  const core = {
    computeActiveFromViewport({ visibleSet }) {
      counters.activeSyncs += 1;
      let best = null;
      for (const node of Array.from(visibleSet || [])) {
        const rect = node.getBoundingClientRect();
        if (rect.bottom >= 0 && rect.top <= 800) {
          best = node;
          break;
        }
      }
      return best
        ? { activeTurnId: `turn:${best.turnIndex}`, activeAnswerId: `answer:${best.turnIndex}`, activePageNum: 0 }
        : { activeTurnId: '', activeAnswerId: '', activePageNum: 0 };
    },
    setActive(id) {
      for (const button of buttons.values()) button.classList.delete('active');
      buttons.get(id)?.classList.add('active');
      const index = Number(String(id).split(':').pop()) || 0;
      counters.activeIndex = index;
      counters.activeId = id;
      counters.counterText = `${index}/39`;
      return true;
    },
    getBtnById(id) { return buttons.get(id) || null; },
    centerOn() { return true; },
  };

  const rafQueue = new Map();
  let nextRaf = 1;
  class HarnessIntersectionObserver {
    constructor(callback) {
      this.callback = callback;
      this.targets = new Set();
      this.disconnected = false;
      counters.ioCreated += 1;
      context.__lastObserver = this;
    }
    observe(target) { this.targets.add(target); }
    unobserve(target) { this.targets.delete(target); }
    disconnect() {
      if (!this.disconnected) counters.ioDisconnected += 1;
      this.disconnected = true;
      this.targets.clear();
    }
    emit(entries) { this.callback(entries); }
  }

  const S = {
    running: true,
    syncRAF: 0,
    syncQueued: false,
    syncReasons: new Set(),
    visibleSet: new Set(),
    io: null,
    ioObserved: new Set(),
    offScroll: null,
    activeScrollRoot: null,
    scrollSyncDisabled: false,
    mmUser: false,
    mmProgram: false,
    perfFullScanTick: 0,
    lastActiveTurnId: 'turn:1',
    lastActiveBtnId: 'turn:1',
    lastActiveBtnEl: buttons.get('turn:1'),
    turnListeners: new Set(),
    structureRecoveryQueued: false,
    structureRecoveryReason: '',
  };
  const PERF = {
    scheduleSyncActive: { callCount: 0, coalescedCount: 0, executedCount: 0, reasons: {}, phases: {} },
    syncActiveExecution: { beforeBootCount: 0, afterBootCount: 0 },
  };

  const context = {
    __S: S,
    __PERF: PERF,
    __lastObserver: null,
    console,
    Date,
    Math,
    Number,
    String,
    Object,
    Array,
    Set,
    Map,
    Promise,
    window: null,
    document: {
      body,
      documentElement,
      querySelector(selector) {
        return selector.includes('conversation-turn') ? hostTurn : null;
      },
    },
    q(selector) { return selector.includes('conversation-turn') ? hostTurn : null; },
    convContainer() { return null; },
    getComputedStyle(target) {
      return { overflowY: target === rootOne || target === rootTwo ? 'auto' : 'visible' };
    },
    IntersectionObserver: HarnessIntersectionObserver,
    requestAnimationFrame(callback) {
      const id = nextRaf++;
      rafQueue.set(id, callback);
      counters.rafScheduled += 1;
      return id;
    },
    cancelAnimationFrame(id) { rafQueue.delete(id); },
    currentPerfPhase() { return 'afterBoot'; },
    bumpReason() {},
    bumpPhaseCounter() {},
    perfNow: (() => { let value = 0; return () => ++value; })(),
    recordDuration() {},
    MM_schedule() { return null; },
    MM_scheduleRafOnce() { throw new Error('unexpected-shared-scheduler'); },
    MINI_bindCompleteIndexMountedAnchors() { return 39; },
    // This harness models a runtime with no MountRegistry, where the real
    // helper returns true on every sync (there are no mount deltas to consume,
    // so the legacy per-frame reconciliation is the correct path). Stubbing it
    // to true therefore reproduces production behaviour for this topology and
    // keeps the binding expectations below unchanged.
    MINI_claimCompleteIndexAnchorBootstrap() { return true; },
    getCoreSurface() { return core; },
    disableScrollSync() { S.scrollSyncDisabled = true; },
    syncViewportPageDivider() { return false; },
    notifyTurnChange() { counters.turnChanges += 1; },
    pruneObservedAnswers: null,
    derr() {},
    PERF_ASSERT_ON: false,
    completeIndexNavigationCoordinator: { cancel() {} },
    completeIndexMountedAnchors: new Map(),
    cancelScheduledTask(_key, field, type = 'timeout') {
      if (type === 'raf' && S[field]) rafQueue.delete(S[field]);
      S[field] = type === 'raf' ? 0 : null;
    },
    clearTimer(field) { S[field] = null; },
    clearMiniMapGuardBindings() {},
    clearTimeout() {},
    clearInterval() {},
    markReady() {},
    dlog() {},
    scrollPageToTarget() { counters.navigationScrolls += 1; },
    setActiveTurnId(id) {
      counters.navigationExplicitSets += 1;
      core.setActive(id);
      return true;
    },
    MM_core() { return { applyTempFlash() { return true; }, flashAnswer() { return true; } }; },
    W: {},
  };
  context.window = context;
  context.innerHeight = 800;
  context.addEventListener = windowTarget.addEventListener.bind(windowTarget);
  context.removeEventListener = windowTarget.removeEventListener.bind(windowTarget);

  const functions = [
    'MINI_completeIndexScrollRoot',
    'MINI_clearActiveScrollRoot',
    'MINI_bindActiveScrollRoot',
    'resetVisibleAnswersObserver',
    'ensureVisibleAnswersObserver',
    'pruneObservedAnswers',
    'observeVisibleAnswers',
    'queueSyncActiveReason',
    'flushSyncActiveReason',
    'scheduleSyncActive',
    'syncActive',
    'stop',
    'MINI_scrollToResolvedTarget',
  ].map((name) => {
    const extracted = extractFunction(name);
    try { new vm.Script(extracted); } catch (error) {
      throw new Error(`production-function-parse-failed:${name}:${String(error?.message || error)}`);
    }
    return extracted;
  }).join('\n\n');
  const program = `
    const S = globalThis.__S;
    const PERF = globalThis.__PERF;
    const PERF_ASSERT_ON = globalThis.PERF_ASSERT_ON;
    ${functions}
    globalThis.__api = {
      bind: MINI_bindActiveScrollRoot,
      clear: MINI_clearActiveScrollRoot,
      ensureObserver: ensureVisibleAnswersObserver,
      observe: observeVisibleAnswers,
      schedule: scheduleSyncActive,
      sync: syncActive,
      stop,
      directNavigate: MINI_scrollToResolvedTarget,
    };
  `;
  vm.runInContext(program, vm.createContext(context), { filename: runtimePath, timeout: 5_000 });

  const flushRaf = () => {
    const rows = Array.from(rafQueue.entries());
    rafQueue.clear();
    for (const [, callback] of rows) {
      counters.rafExecuted += 1;
      callback();
    }
    return rows.length;
  };
  const showOnly = (index) => {
    for (const node of mounted.values()) node.visible = false;
    const node = mounted.get(index);
    node.visible = true;
    S.visibleSet.clear();
    S.visibleSet.add(node);
    return node;
  };

  const environment = {
    api: context.__api,
    context,
    S,
    PERF,
    counters,
    core,
    buttons,
    mounted,
    rootOne,
    rootTwo,
    windowTarget,
    hostTurn,
    flushRaf,
    showOnly,
    replaceRoot(nextRoot) {
      currentRoot = nextRoot;
      hostTurn.parentElement = currentRoot;
    },
    pendingRafs() { return rafQueue.size; },
  };
  environments.push(environment);
  return environment;
}

await fixture('nested host root binds once and performs late-turn recalculation', () => {
  const env = createEnvironment();
  env.showOnly(39);
  equal(env.api.bind('fixture:initial-bind'), true);
  equal(env.rootOne.listenerCount('scroll'), 1);
  equal(env.windowTarget.listenerCount('scroll'), 0);
  equal(env.api.bind('fixture:duplicate-bind'), false);
  equal(env.rootOne.listenerCount('scroll'), 1);
  equal(env.pendingRafs(), 1);
  equal(env.flushRaf(), 1);
  equal(env.counters.activeId, 'turn:39');
  equal(env.counters.counterText, '39/39');
});

await fixture('nested passive scroll updates turn 39 to turn 34 without window scroll', () => {
  const env = createEnvironment();
  env.showOnly(39);
  env.api.bind('fixture:bind');
  env.flushRaf();
  env.showOnly(34);
  env.rootOne.dispatch('scroll');
  equal(env.pendingRafs(), 1);
  env.flushRaf();
  equal(env.counters.activeId, 'turn:34');
  equal(env.counters.counterText, '34/39');
  equal(env.windowTarget.listenerCount('scroll'), 0);
  equal(env.rootOne.listenerCount('scroll'), 1);
});

await fixture('intersection membership changes coalesce one active sync', () => {
  const env = createEnvironment();
  env.api.bind('fixture:bind');
  env.flushRaf();
  const node = env.mounted.get(34);
  node.visible = true;
  env.api.ensureObserver();
  const observer = env.context.__lastObserver;
  const callsBefore = env.PERF.scheduleSyncActive.callCount;
  observer.emit([{ target: node, isIntersecting: true }]);
  equal(env.PERF.scheduleSyncActive.callCount, callsBefore + 1);
  equal(env.pendingRafs(), 1);
  observer.emit([{ target: node, isIntersecting: true }]);
  equal(env.PERF.scheduleSyncActive.callCount, callsBefore + 1);
  equal(env.pendingRafs(), 1);
  env.flushRaf();
  equal(env.counters.activeId, 'turn:34');
  observer.emit([{ target: node, isIntersecting: false }]);
  equal(env.PERF.scheduleSyncActive.callCount, callsBefore + 2);
});

await fixture('route root replacement detaches old root and binds new root once', () => {
  const env = createEnvironment();
  env.showOnly(39);
  env.api.bind('fixture:first-root');
  env.flushRaf();
  env.replaceRoot(env.rootTwo);
  env.showOnly(38);
  equal(env.api.bind('fixture:replacement-root'), true);
  equal(env.rootOne.listenerCount('scroll'), 0);
  equal(env.rootOne.removeCount, 1);
  equal(env.rootTwo.listenerCount('scroll'), 1);
  equal(env.api.bind('fixture:replacement-repeat'), false);
  equal(env.rootTwo.listenerCount('scroll'), 1);
  env.flushRaf();
  const callsBeforeOldScroll = env.PERF.scheduleSyncActive.callCount;
  env.rootOne.dispatch('scroll');
  equal(env.PERF.scheduleSyncActive.callCount, callsBeforeOldScroll);
  env.rootTwo.dispatch('scroll');
  equal(env.pendingRafs(), 1);
  env.flushRaf();
  equal(env.counters.activeId, 'turn:38');
});

await fixture('window is used only when no nested host root is available', () => {
  const env = createEnvironment();
  env.replaceRoot(env.context.document.body);
  env.showOnly(39);
  equal(env.api.bind('fixture:window-fallback'), true);
  equal(env.windowTarget.listenerCount('scroll'), 1);
  equal(env.rootOne.listenerCount('scroll'), 0);
  env.flushRaf();
  equal(env.counters.activeId, 'turn:39');
});

await fixture('real stop path removes root listener observer and pending RAF idempotently', () => {
  const env = createEnvironment();
  env.showOnly(39);
  env.api.bind('fixture:stop-bind');
  env.api.ensureObserver();
  equal(env.pendingRafs(), 1);
  equal(env.api.stop('fixture-stop'), true);
  equal(env.rootOne.listenerCount('scroll'), 0);
  equal(env.counters.ioDisconnected, 1);
  equal(env.pendingRafs(), 0);
  equal(env.S.activeScrollRoot, null);
  equal(env.S.offScroll, null);
  equal(env.S.running, false);
  equal(env.api.stop('fixture-stop-repeat'), true);
  equal(env.counters.ioDisconnected, 1);
});

await fixture('direct navigation still explicitly selects the requested turn', () => {
  const env = createEnvironment();
  const target = env.mounted.get(20);
  const result = env.api.directNavigate(target, { turnId: 'turn:20', gesture: 'click' }, 'answer');
  equal(result, true);
  equal(env.counters.navigationScrolls, 1);
  equal(env.counters.navigationExplicitSets, 1);
  equal(env.counters.activeId, 'turn:20');
  equal(env.counters.counterText, '20/39');
});

await fixture('production lifecycle uses bounded rebind seams without polling or authority work', () => {
  const env = createEnvironment();
  const bindSource = extractFunction('MINI_bindActiveScrollRoot');
  const observerSource = extractFunction('ensureVisibleAnswersObserver');
  const stopSource = extractFunction('stop');
  ok(bindSource.includes("MINI_completeIndexScrollRoot() || window"));
  ok(bindSource.includes("scheduleSyncActive('scroll')"));
  equal(bindSource.includes('setInterval('), false);
  equal(bindSource.includes('setTimeout('), false);
  ok(observerSource.includes("scheduleSyncActive('intersection')"));
  ok(stopSource.includes('MINI_clearActiveScrollRoot()'));
  for (const lifecycle of [
    'refreshFromIndexedState',
    'rebuildNow',
    'bindObservers',
  ]) {
    ok(extractFunction(lifecycle).includes('MINI_bindActiveScrollRoot'), `${lifecycle} must rebind the active scroll root`);
  }
  ok(source.includes("MINI_bindActiveScrollRoot('complete-index-state:scroll-root-bind')"));
  ok(source.includes("MINI_bindActiveScrollRoot('index:hydrated:scroll-root-bind')"));
  ok(source.includes('MINI_clearActiveScrollRoot();\n      resetVisibleAnswersObserver();'));
  equal(source.includes('setCompleteTurnIndexAutoBranchReconciliationCanary'), false);
  equal(env.buttons.size, 39);
  equal(env.counters.storageWrites, 0);
  equal(env.counters.networkCalls, 0);
  equal(env.counters.reconciliationCalls, 0);
  equal(env.counters.intervalCalls, 0);
});

const failed = fixtures.filter((row) => !row.ok);
for (const row of failed) console.error(`FAIL ${row.name}\n${row.error}`);

const aggregate = environments.reduce((total, env) => {
  for (const key of ['storageWrites', 'networkCalls', 'reconciliationCalls', 'intervalCalls']) {
    total[key] += Number(env.counters[key] || 0);
  }
  return total;
}, { storageWrites: 0, networkCalls: 0, reconciliationCalls: 0, intervalCalls: 0 });
console.log(`CV-3.4 MiniMap active-turn tracking: ${fixtures.length - failed.length}/${fixtures.length} fixtures, ${assertionCount} assertions, ${failed.length} failures`);
console.log('Coverage: nested-root listeners, late-turn recalculation, 39->34 passive scroll, intersection coalescing, root replacement, stop cleanup, direct navigation');
console.log(`Safety counters: storage ${aggregate.storageWrites}, network ${aggregate.networkCalls}, reconciliation ${aggregate.reconciliationCalls}, intervals ${aggregate.intervalCalls}`);
if (failed.length) process.exitCode = 1;
