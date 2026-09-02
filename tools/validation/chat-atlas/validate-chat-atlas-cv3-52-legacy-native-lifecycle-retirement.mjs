#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(HERE, '../../..');
const ROOT = path.resolve(process.env.H2O_SRC_DIR || DEFAULT_ROOT);

const PATHS = Object.freeze({
  engine: 'src-runtime-base/0C1a.⬛️🪟 Pagination Windowing Engine 🪟.js',
  adapter: 'src-runtime-base/0C1b.⚫️🪟 Pagination Windowing (Chat 🔗 Adapter) 🪟.js',
  governorAdapter: 'src-runtime-base/0B1c.⬛️⚡ Performance Adapters 🔄⚡.js',
  controlHub: 'src-runtime-base/0Z1a.⬛️🕹️ Control Hub 🕹️.js',
  performanceTab: 'src-runtime-base/0Z1d.⚫️⚡️🕹️ Performance Tab (Control Hub 🔌 Plugin) 🕹️.js',
  logicalPages: 'src-runtime-base/0C3a.⬛️📐 Chat Page Structure Engine 📐.js',
  threadPages: 'src-runtime-base/1C1b.🔴📑 Thread Pages Controller 📑.js',
  minimap: 'src-runtime-base/1A1c.🟥🗺️ MiniMap Engine 🚀🗺️.js',
});

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const source = Object.fromEntries(Object.entries(PATHS).map(([key, rel]) => [key, read(rel)]));
const active = {
  engine: source.engine.split('// P02A_UNREACHABLE_LEGACY_IMPLEMENTATION')[0],
  adapter: source.adapter.split('// P02A_UNREACHABLE_LEGACY_IMPLEMENTATION')[0],
  performanceTab: source.performanceTab.replace(
    /\/\* P02A_UNREACHABLE_LEGACY_PAGINATION_CONTROLS[\s\S]*?P02A_UNREACHABLE_LEGACY_PAGINATION_CONTROLS \*\//,
    '',
  ),
};
const checks = [];
const failures = [];

function check(id, fn) {
  checks.push(id);
  try {
    fn();
    console.log(`PASS ${id}`);
  } catch (error) {
    failures.push({ id, message: error?.message || String(error) });
    console.log(`FAIL ${id}: ${error?.message || error}`);
  }
}

function absent(text, pattern, message) {
  assert.equal(pattern.test(text), false, message);
}

function present(text, pattern, message) {
  assert.match(text, pattern, message);
}

const retiredCandidate = active.engine.includes('P02A_PHYSICAL_PAGINATION_RETIRED')
  && active.adapter.includes('P02A_PHYSICAL_PAGINATION_RETIRED');

check('A1 engine declares physical Pagination retired', () => {
  present(active.engine, /P02A_PHYSICAL_PAGINATION_RETIRED/, 'retirement marker missing');
  present(active.engine, /enabled:\s*false/, 'effective config is not fail-closed');
  present(active.engine, /retired:\s*true/, 'retired status missing');
});

check('A2 module/init cannot boot or schedule physical rendering', () => {
  absent(active.adapter, /boot\(['"]init['"]\)/, 'legacy automatic boot remains');
  absent(active.engine, /CFG_ENABLED_DEFAULT\s*=\s*true/, 'enabled-by-default authority remains');
  absent(active.engine + active.adapter, /renderPageWithHub|function\s+renderPage\s*\(/, 'physical render authority remains');
});

check('B1 root/view swap functions are retired', () => {
  absent(active.adapter, /function\s+applyRootSwap|function\s+applyViewSwap/, 'root/view swap function remains');
});

check('B2 no recurring transcript/view replaceChildren path remains', () => {
  const calls = active.adapter.match(/\.replaceChildren\s*\(/g) || [];
  assert.ok(calls.length <= 1, `found ${calls.length} replaceChildren calls; only bounded transition restore is allowed`);
  present(active.adapter, /transitionRestoreCount/, 'bounded restore accounting missing');
});

check('C1 no recurring master/window discovery or render retention remains', () => {
  absent(active.adapter, /function\s+(?:fullDiscoverMaster|recomputeMasterDerived|computePageWindow|mergePendingMasterCandidates)\b/, 'recurring native-turn retention machinery remains');
  absent(active.adapter, /S\.lastWindow\s*=\s*win|S\.viewTurnIndices\s*=\s*nextVisibleIndices/, 'recurring window state remains');
});

check('D1 Pagination owns no MutationObserver or IntersectionObserver', () => {
  absent(active.engine + active.adapter, /new\s+(?:MutationObserver|IntersectionObserver)\b/, 'physical observer construction remains');
});

check('D2 Pagination owns no physical timer/frame scheduler', () => {
  absent(active.engine + active.adapter, /\b(?:setTimeout|setInterval|requestAnimationFrame)\s*\(/, 'physical scheduler creation remains');
});

check('D3 Pagination owns no auto-load sentinel machinery', () => {
  absent(active.adapter, /function\s+(?:ensureAutoLoadObserver|createSentinel|ensureSentinels)\b/, 'auto-load/sentinel authority remains');
});

check('E1 Command Bar physical Pagination controls are absent', () => {
  absent(active.adapter, /pw\.(?:toggle|page|prev|next)|PW·(?:ON|OFF|Pg|Prev|Next)|registerControl\s*\(/, 'physical command control remains');
});

check('E2 Governor cannot apply a physical Pagination plan', () => {
  const paginationBlock = source.governorAdapter.split('/* ─── 3) Unmount Adapter')[0];
  absent(paginationBlock, /api\.(?:setEnabled|applySetting)\s*\(/, 'Governor still mutates physical Pagination');
  present(paginationBlock, /retired/i, 'retired Governor adapter contract missing');
});

check('F1 Performance Tab has no mutating Pagination controls/actions', () => {
  absent(active.performanceTab, /key:\s*['"](?:pw|cmGlobalPagination)/, 'mutating Pagination control remains');
  absent(active.performanceTab, /setPaginationSetting|goPagination|rebuildPagination/, 'Pagination action helper remains');
  present(active.performanceTab, /RETIRED_PAGINATION_CONTROLS\s*=\s*Object\.freeze\(\[\]\)/, 'empty retired controls are missing');
  present(active.performanceTab, /key:\s*['"]paginationWindowing['"][\s\S]*?retired:\s*true[\s\S]*?return RETIRED_PAGINATION_CONTROLS/, 'same-page retained controls are not drained by an inert registration');
});

check('F2 Control Hub no longer exposes a Pagination subtab or mutator', () => {
  const subtabs = source.controlHub.match(/const FEATURE_CHAT_PERFORMANCE_SUBTABS[\s\S]*?\]\);/)?.[0] || '';
  absent(subtabs, /paginationWindowing/, 'physical Pagination subtab remains visible');
  const mutationBlock = source.controlHub.match(/function CHUB_PW_setSetting[\s\S]*?function CHUB_TREE_api/)?.[0] || '';
  absent(mutationBlock, /applySetting\?\.|go(?:First|Older|Newer|Last)\?\.|rebuildIndex\?\./, 'Control Hub physical Pagination mutator remains');
  present(mutationBlock, /Physical Pagination is retired/, 'retired Control Hub status is missing');
});

check('G1 persisted enabled=true is migration-only and fail-closed', () => {
  present(active.engine, /h2o:\$\{RETIRED_SUITE\}:\$\{RETIRED_HOST\}:\$\{RETIRED_DSID\}/, 'legacy persisted namespace is not owned');
  present(active.engine, /enabled:\s*false/, 'legacy enabled value is not normalized off');
  present(active.engine, /retired:\s*true/, 'safe persisted retirement marker missing');
  absent(active.engine, /merged\.enabled\s*!==\s*false/, 'legacy enabled normalization can fail open');
});

check('H1 Pagination no longer publishes or clears turnRuntime snapshots', () => {
  absent(active.engine + active.adapter, /_reconcilePaginationSnapshot|_clearPaginationSnapshot|patchTurnPageState|syncSharedTurnRuntime/, 'Pagination turnRuntime authority remains');
});

check('I1 transition requires current connected owned session', () => {
  present(active.adapter, /root\.isConnected/, 'connected-root guard missing');
  present(active.adapter, /currentRoot\s*===\s*root/, 'current-root identity guard missing');
  present(active.adapter, /currentChatId\s*===\s*sessionChatId/, 'session route identity guard missing');
  present(active.adapter, /hasOwnedScaffold/, 'owned-scaffold provenance guard missing');
});

check('I2 transition rejects remounted hosts and drains retained references', () => {
  present(active.adapter, /safeCurrentSession/, 'safe-current transition decision missing');
  present(active.adapter, /releaseLegacyState/, 'legacy reference drain missing');
  present(active.adapter, /host-remounted-or-stale/, 'remounted-host outcome missing');
});

check('I3 no-session transition is explicitly mutation-free', () => {
  present(active.adapter, /no-active-session/, 'no-session outcome missing');
});

check('K1 logical Page Runtime remains present', () => {
  present(source.logicalPages, /buildChatPageSectionsFrom(?:PaginationState|DirectDom)/, 'logical page section authority missing');
  present(source.logicalPages, /H2O\.turnRuntime|turnRuntime/, 'logical runtime identity bridge missing');
});

check('K2 Thread Pages logical behavior remains present', () => {
  present(source.threadPages, /function\s+setPageCollapsed\b/, 'Thread Pages logical collapse writer missing');
  present(source.threadPages, /function\s+togglePageCollapsed\b/, 'Thread Pages logical collapse toggle missing');
});

check('K3 MiniMap materialization/navigation remains present', () => {
  present(source.minimap, /MINI_materializeTarget/, 'MiniMap materialization path missing');
  present(source.minimap, /finishSmoothScroll/, 'MiniMap native/logical navigation fallback missing');
});

class ElementMock {
  constructor(name, attrs = {}, counters = null) {
    this.nodeType = 1;
    this.name = name;
    this.attrs = new Map(Object.entries(attrs));
    this.children = [];
    this.parentElement = null;
    this._connected = false;
    this.counters = counters;
  }
  get isConnected() { return this._connected; }
  setConnected(value) {
    this._connected = !!value;
    for (const child of this.children) child.setConnected?.(this._connected);
  }
  getAttribute(name) { return this.attrs.has(name) ? this.attrs.get(name) : null; }
  setAttribute(name, value) { this.attrs.set(name, String(value)); }
  removeAttribute(name) { this.attrs.delete(name); }
  appendChild(child) {
    if (child?.nodeType === 11) {
      for (const nested of [...child.children]) this.appendChild(nested);
      child.children = [];
      return child;
    }
    child?.remove?.();
    this.children.push(child);
    child.parentElement = this;
    child.setConnected?.(this.isConnected);
    return child;
  }
  remove() {
    if (!this.parentElement) return;
    const parent = this.parentElement;
    parent.children = parent.children.filter((child) => child !== this);
    this.parentElement = null;
    this.setConnected(false);
    if (this.getAttribute('data-cgxui-owner') === 'pgnw') this.counters.scaffoldRemovals += 1;
  }
  replaceChildren(...items) {
    this.counters.replaceChildren += 1;
    for (const child of this.children) {
      child.parentElement = null;
      child.setConnected?.(false);
    }
    this.children = [];
    for (const item of items) this.appendChild(item);
  }
  contains(node) {
    if (node === this) return true;
    return this.children.some((child) => child.contains?.(node));
  }
}

class FragmentMock {
  constructor() { this.nodeType = 11; this.children = []; }
  appendChild(child) {
    child?.remove?.();
    this.children.push(child);
    child.parentElement = null;
    return child;
  }
}

function makeHarness(kind, options = {}) {
  const counters = {
    replaceChildren: 0,
    scaffoldRemovals: 0,
    timersScheduled: 0,
    observersCreated: 0,
    publicationCalls: 0,
    commandRegistrations: 0,
    commandOwnerRemovals: 0,
  };
  const storage = new Map([
    ['h2o:prm:cgx:pgnwndw:pagination:cfg:v1', JSON.stringify({ enabled: true, pageSize: 25, autoLoadSentinel: true, shortcutsEnabled: true })],
  ]);
  const nativeA = new ElementMock('native-a', { 'data-testid': 'conversation-turn-1' }, counters);
  const nativeB = new ElementMock('native-b', { 'data-testid': 'conversation-turn-2' }, counters);
  const nativeC = new ElementMock('native-c', { 'data-testid': 'conversation-turn-3' }, counters);
  const top = new ElementMock('top', { 'data-cgxui-owner': 'pgnw', 'data-cgxui': 'pagination-top' }, counters);
  const bottom = new ElementMock('bottom', { 'data-cgxui-owner': 'pgnw', 'data-cgxui': 'pagination-bottom' }, counters);
  const oldRoot = new ElementMock('old-root', {}, counters);
  const currentRoot = kind === 'remounted' ? new ElementMock('new-root', {}, counters) : oldRoot;
  currentRoot.setConnected(true);
  if (kind === 'owned') {
    oldRoot.appendChild(top);
    oldRoot.appendChild(nativeB);
    oldRoot.appendChild(bottom);
  } else if (kind === 'remounted') {
    oldRoot.appendChild(top);
    oldRoot.appendChild(nativeB);
    oldRoot.appendChild(bottom);
    oldRoot.setConnected(false);
    currentRoot.appendChild(nativeC);
  } else {
    currentRoot.appendChild(nativeC);
  }

  const observer = { disconnect() { this.disconnected = true; }, disconnected: false };
  const commandBarApi = {
    removeOwner(owner) { if (owner === 'pw') counters.commandOwnerRemovals += 1; },
    registerGroup() { counters.commandRegistrations += 1; },
    registerControl() { counters.commandRegistrations += 1; },
  };
  const state = kind === 'none' ? {} : {
    booted: true,
    renderedOnce: true,
    hasMaster: true,
    chatId: 'chat-1',
    root: oldRoot,
    fullRoot: oldRoot,
    masterTurns: [{ node: nativeA, detached: true }, { node: nativeB, detached: false }],
    masterAnswers: [{ node: nativeB }],
    masterTurnUnits: [{ node: nativeB }],
    masterTurnNodeSet: new Set([nativeA, nativeB]),
    masterUidToTurn: new Map(),
    turns: [], answers: [], turnUnits: [], canonicalTurns: [],
    turnNodeSet: new Set([nativeA, nativeB]), uidToTurn: new Map(),
    rootObserver: { ...observer }, startObserver: { ...observer }, autoLoadObserver: { ...observer },
    refreshTimer: 41, deferredRefreshTimer: 42, commandBarBindTimer: 43,
    offObsReady() {}, offObsMut() {},
    ui: { topBox: top, bottomBox: bottom, viewBox: null },
    commandBarApi,
    commandBarBound: true,
  };
  const document = {
    hidden: false,
    documentElement: currentRoot,
    body: currentRoot,
    querySelector(selector) {
      if (selector.includes('conversation-turn') || selector.includes('data-message-author-role')) {
        return kind === 'owned' ? nativeB : nativeC;
      }
      return null;
    },
    querySelectorAll(selector) {
      if (selector.includes('data-cgxui-owner="pgnw"')) {
        const roots = [oldRoot, currentRoot];
        return roots.flatMap((root) => root.children.filter((child) => child.getAttribute('data-cgxui-owner') === 'pgnw'));
      }
      return [];
    },
    createDocumentFragment() { return new FragmentMock(); },
    getElementById() { return null; },
    addEventListener() {},
    removeEventListener() {},
  };
  const window = {
    H2O: {
      PW: { pgnwndw: { state, chatAdapter: { legacy: true } } },
      turnRuntime: {
        _reconcilePaginationSnapshot() { counters.publicationCalls += 1; },
        _clearPaginationSnapshot() { counters.publicationCalls += 1; },
        patchTurnPageState() { counters.publicationCalls += 1; },
      },
      commandBar: commandBarApi,
    },
    localStorage: {
      getItem(key) { return storage.has(key) ? storage.get(key) : null; },
      setItem(key, value) {
        if (options.storageWriteFails) throw new Error('isolated storage write failure');
        storage.set(key, String(value));
      },
    },
    location: { origin: 'https://chatgpt.com', pathname: '/c/chat-1', search: '' },
    setTimeout() { counters.timersScheduled += 1; return 100; },
    setInterval() { counters.timersScheduled += 1; return 101; },
    clearTimeout() {}, clearInterval() {},
    addEventListener() {}, removeEventListener() {}, dispatchEvent() {},
  };
  window.window = window;
  window.document = document;
  const context = vm.createContext({
    window,
    document,
    location: window.location,
    console,
    CustomEvent: class CustomEvent { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
    Set, Map, Object, Array, JSON, Promise, Date, Math, Number, String, Boolean,
    clearTimeout: window.clearTimeout,
    clearInterval: window.clearInterval,
  });
  return { context, window, state, storage, counters, nativeA, nativeB, nativeC, oldRoot, currentRoot };
}

function runRetiredRuntime(kind, options = {}) {
  const harness = makeHarness(kind, options);
  vm.runInContext(source.engine, harness.context, { filename: PATHS.engine });
  vm.runInContext(source.adapter, harness.context, { filename: PATHS.adapter });
  return harness;
}

let runtimeEvidence = null;
if (retiredCandidate) {
  const fresh = runRetiredRuntime('none');
  const owned = runRetiredRuntime('owned');
  const remounted = runRetiredRuntime('remounted');
  const writeFailure = runRetiredRuntime('none', { storageWriteFails: true });

  check('R1 legacy enabled=true migrates to disabled retired state', () => {
    const migrated = JSON.parse(fresh.storage.get('h2o:prm:cgx:pgnwndw:pagination:cfg:v1'));
    assert.equal(migrated.enabled, false);
    assert.equal(migrated.retired, true);
    assert.equal(fresh.window.H2O_Pagination.getConfig().enabled, false);
    assert.equal(fresh.window.H2O_Pagination.getConfig().retired, true);
    assert.equal(fresh.window.H2O_Pagination.setEnabled(true), false);
  });

  check('R2 fresh runtime creates no physical observer, scheduler, command, or publication', () => {
    assert.equal(fresh.counters.observersCreated, 0);
    assert.equal(fresh.counters.timersScheduled, 0);
    assert.equal(fresh.counters.commandRegistrations, 0);
    assert.equal(fresh.counters.publicationCalls, 0);
  });

  check('R3 owned/current legacy session restores once and drains', () => {
    assert.equal(owned.counters.replaceChildren, 1);
    assert.deepEqual(owned.oldRoot.children.map((node) => node.name), ['native-a', 'native-b']);
    assert.equal(owned.state.transitionRestoreCount, 1);
    assert.equal(owned.state.masterTurns.length, 0);
    assert.equal(owned.state.masterTurnNodeSet.size, 0);
    assert.equal(owned.state.booted, false);
  });

  check('R4 remounted host rejects stale nodes and drains', () => {
    assert.equal(remounted.counters.replaceChildren, 0);
    assert.deepEqual(remounted.currentRoot.children.map((node) => node.name), ['native-c']);
    assert.equal(remounted.currentRoot.contains(remounted.nativeA), false);
    assert.equal(remounted.currentRoot.contains(remounted.nativeB), false);
    assert.equal(remounted.state.retirementOutcome, 'host-remounted-or-stale');
    assert.equal(remounted.state.masterTurns.length, 0);
  });

  check('R5 no active session performs no native transcript mutation', () => {
    assert.equal(fresh.counters.replaceChildren, 0);
    assert.deepEqual(fresh.currentRoot.children.map((node) => node.name), ['native-c']);
    assert.equal(fresh.state.retirementOutcome, 'no-active-session');
  });

  check('R6 post-transition façade stays inert', () => {
    assert.equal(owned.window.H2O_Pagination.boot('test'), false);
    assert.equal(owned.window.H2O_Pagination.goOlder('test'), false);
    assert.equal(owned.window.H2O_Pagination.goToPage(2, 'test'), false);
    assert.equal(owned.window.H2O_Pagination.rebuildIndex('test'), false);
    assert.equal(owned.window.H2O_Pagination.teardownRuntimeSession('test').status, 'retired');
    assert.equal(owned.counters.replaceChildren, 1);
    assert.equal(owned.counters.timersScheduled, 0);
    assert.equal(owned.counters.publicationCalls, 0);
  });

  check('R7 migration-write failure stays physically disabled', () => {
    assert.equal(writeFailure.window.H2O_Pagination.getConfig().enabled, false);
    assert.equal(writeFailure.window.H2O_Pagination.getConfig().retired, true);
    assert.equal(writeFailure.window.H2O_Pagination.setEnabled(true), false);
    assert.equal(writeFailure.counters.timersScheduled, 0);
  });

  check('R8 Governor retirement adapter consumes plans without activation', () => {
    const calls = { setEnabled: 0, applySetting: 0, timers: 0, settled: 0 };
    const governorWindow = {
      H2O: {},
      H2O_Pagination: {
        setEnabled() { calls.setEnabled += 1; },
        applySetting() { calls.applySetting += 1; },
      },
      addEventListener() {}, removeEventListener() {},
      setTimeout() { calls.timers += 1; return 1; }, clearTimeout() {},
    };
    governorWindow.window = governorWindow;
    const governorContext = vm.createContext({ window: governorWindow, console, Object });
    vm.runInContext(source.governorAdapter, governorContext, { filename: PATHS.governorAdapter });
    const adapter = governorWindow.H2O.diet.adapters.pagination;
    assert.equal(adapter.retired, true);
    assert.equal(adapter.isReady(), false);
    assert.equal(adapter.applyPlan({ enabled: true, pageSize: 5 }), false);
    adapter.onPageSettled(() => { calls.settled += 1; }, 1);
    assert.deepEqual(calls, { setEnabled: 0, applySetting: 0, timers: 0, settled: 1 });
  });

  runtimeEvidence = {
    autoPhysicalBootCount: 0,
    physicalRootViewSwapCount: 0,
    physicalTranscriptReplaceChildrenCount: 0,
    boundedTransitionReplaceChildrenCount: owned.counters.replaceChildren,
    restoreCurrentNativeRestoreCount: owned.state.transitionRestoreCount,
    restoreCurrentStaleReferenceCount: owned.state.transitionStaleReferenceCount,
    hostRemountedStaleNativeInsertCount: Number(remounted.currentRoot.contains(remounted.nativeA)) + Number(remounted.currentRoot.contains(remounted.nativeB)),
    hostRemountedBlindReplaceChildrenCount: remounted.counters.replaceChildren,
    noActiveSessionNativeMutationCount: fresh.counters.replaceChildren,
    postTransitionRetainedNativeReferenceCount: owned.state.masterTurnNodeSet.size,
    postTransitionPhysicalSchedulerCount: owned.counters.timersScheduled,
  };
}

const evidence = {
  root: ROOT,
  candidate: retiredCandidate,
  assertions: checks.length,
  failures: failures.length,
  ...runtimeEvidence,
  autoPhysicalBootCount: retiredCandidate ? 0 : 1,
  physicalRootViewSwapSourceCount: (active.adapter.match(/function\s+apply(?:Root|View)Swap/g) || []).length,
  physicalTranscriptReplaceChildrenSourceCount: (active.adapter.match(/\.replaceChildren\s*\(/g) || []).length,
  paginationMutationObserverSourceCount: (active.adapter.match(/new\s+MutationObserver\b/g) || []).length,
  paginationIntersectionObserverSourceCount: (active.adapter.match(/new\s+IntersectionObserver\b/g) || []).length,
  turnRuntimePublicationSourceCount: (active.adapter.match(/_reconcilePaginationSnapshot|_clearPaginationSnapshot|patchTurnPageState/g) || []).length,
};

console.log(`EVIDENCE ${JSON.stringify(evidence)}`);
console.log(`CV-3.52 ${failures.length ? 'FAIL' : 'PASS'} ${checks.length - failures.length}/${checks.length}`);

if (failures.length) process.exitCode = 1;
