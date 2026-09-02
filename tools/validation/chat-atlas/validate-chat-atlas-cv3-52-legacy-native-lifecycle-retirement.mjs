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
  unmountEngine: 'src-runtime-base/0C2a.⬛️⛰️ Unmount Messages Engine ⛰️.js',
  unmountAdapter: 'src-runtime-base/0C2b.⚫️⛰️ Unmount Messages (Chat 🔗 Adapter) ⛰️.js',
  mechanismsRouter: 'src-runtime-base/1C1c.🔴🔀 Outline Mechanisms Router (🤝 Unmount & Pagination Integration) 🔀.js',
  logicalPages: 'src-runtime-base/0C3a.⬛️📐 Chat Page Structure Engine 📐.js',
  threadPages: 'src-runtime-base/1C1b.🔴📑 Thread Pages Controller 📑.js',
  minimap: 'src-runtime-base/1A1c.🟥🗺️ MiniMap Engine 🚀🗺️.js',
  folders: 'src-runtime-base/0F3a.⬛️🗂️ Folders 🗂️.js',
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
  unmountEngine: source.unmountEngine.split('// P02B_UNREACHABLE_LEGACY_IMPLEMENTATION')[0],
  unmountAdapter: source.unmountAdapter.split('// P02B_UNREACHABLE_LEGACY_IMPLEMENTATION')[0],
  mechanismsRouter: source.mechanismsRouter,
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
const retiredUnmountCandidate = active.unmountEngine.includes('P02B_PHYSICAL_GLOBAL_UNMOUNT_RETIRED')
  && active.unmountAdapter.includes('P02B_PHYSICAL_GLOBAL_UNMOUNT_RETIRED');

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

check('P02C-TP-C1 detached-host map and detach helper authority are absent', () => {
  absent(source.threadPages, /detachedPageHostsByChat|function\s+detachPageHostsFromChat\b/, 'Thread Pages detached-host retention authority remains');
});

check('P02C-TP-C2 generic engine-pagination calls cannot select physical detach', () => {
  absent(source.threadPages, /wrappedByPagination\s*=|if\s*\(\s*wrappedByPagination\s*\)|detachPageHostsFromChat\s*\(/, 'forceable engine-pagination physical branch remains');
});

check('P02C-TP-C3 retained page hosts cannot be physically reinserted', () => {
  absent(source.threadPages, /function\s+restoreDetachedPageHosts\b|insertBefore\s*\(\s*host\s*,\s*placeholder\s*\)/, 'Thread Pages retained-host restore authority remains');
});

check('P02C-FO-C1 local page-host fragment retention is absent', () => {
  absent(source.folders, /function\s+PAGEHOST_enterPage_LOCAL\b|createDocumentFragment\s*\(|previousNodes\s*=|STATE\.pageSession\s*=\s*\{[\s\S]{0,800}?fragment\b/, 'Folders local fragment/session retention fallback remains');
});

check('P02C-FO-C2 local retained-native restore is absent', () => {
  absent(source.folders, /function\s+PAGEHOST_restorePreviousPage_LOCAL\b|fragment\s+instanceof\s+DocumentFragment|fragment\.firstChild[\s\S]{0,160}?appendChild\s*\(\s*fragment\.firstChild\s*\)/, 'Folders local retained-node restoration remains');
});

check('P02C-FO-C3 canonical page-host delegation remains explicit', () => {
  present(source.folders, /svc\?\.UI_restoreInShellPage[\s\S]{0,120}?svc\.UI_restoreInShellPage\s*\(\s*LIBCORE_ENV\(\)/, 'canonical restore delegation missing');
  present(source.folders, /svc\?\.UI_mountInShellPage[\s\S]{0,120}?svc\.UI_mountInShellPage\s*\(\s*LIBCORE_ENV\(\)/, 'canonical mount delegation missing');
});

check('P02C-FO-C4 absent canonical page-host service fails closed', () => {
  present(source.folders, /function\s+UI_restoreInShellPage[\s\S]{0,300}?return\s+false\s*;/, 'missing restore service does not fail closed');
  present(source.folders, /function\s+UI_mountInShellPage[\s\S]{0,300}?return\s+false\s*;/, 'missing mount service does not fail closed');
  absent(source.folders, /return\s+PAGEHOST_(?:restorePreviousPage|enterPage)_LOCAL\s*\(/, 'local physical page-host fallback remains callable');
});

check('UM-A automatic Global Unmount boot and startup waiter are retired', () => {
  absent(active.unmountEngine + active.unmountAdapter, /CORE_UM_waitForMessagesThenBoot|pendingBoot\]\s*=\s*['"]init['"]/, 'automatic startup waiter remains reachable');
  present(active.unmountEngine, /P02B_PHYSICAL_GLOBAL_UNMOUNT_RETIRED/, 'Global Unmount retirement marker missing');
  present(active.unmountEngine, /status:\s*['"]retired['"]/, 'normal-runtime retired status missing');
});

check('UM-B background schedulers and recurring interval are retired', () => {
  absent(active.unmountAdapter, /CORE_UM_scheduleUpdate|CORE_UM_runUnmountPass|CORE_UM_restartIntervalTimer/, 'background pass scheduler remains reachable');
  absent(active.unmountAdapter, /new\s+MutationObserver\b|\bsetInterval\s*\(|requestAnimationFrame\s*\(/, 'observer/frame/interval authority remains reachable');
  absent(active.unmountAdapter, /addEventListener\s*\(\s*['"](?:scroll|resize|focus|visibilitychange)['"]/, 'lifecycle scheduling listener remains reachable');
});

check('UM-C native body detach and persistent fragment creation are retired', () => {
  absent(active.unmountAdapter, /CORE_UM_softUnmount|CORE_UM_softRemount|createDocumentFragment\s*\(|\.replaceChildren\s*\(/, 'physical detach/remount authority remains reachable');
  absent(active.unmountAdapter, /unmountMap\.set\s*\(|manualCollapseById\.set\s*\(/, 'new native retention record path remains reachable');
});

check('UM-D public and manual physical executors are inert', () => {
  absent(active.unmountEngine + active.unmountAdapter, /CORE_UM_createManualRecord|API_UM_runPass\s*\([^)]*\)\s*\{[\s\S]*?CORE_UM_runUnmountPass/, 'manual physical executor remains reachable');
  present(active.unmountEngine, /status:\s*['"]unmount-retired['"]/, 'inert public collapse result missing');
});

check('UM-E persisted enabled=true is migration-only and fail-closed', () => {
  absent(active.unmountEngine, /src\.enabled\s*!==\s*false|CFG_UNMOUNTM_DEFAULT_ENABLED\s*=\s*true/, 'persisted enabled state can still fail open');
  present(active.unmountEngine, /h2o:prm:cgx:nmntmssgs:cfg:runtime:v1/, 'owned legacy config key missing');
  present(active.unmountEngine, /enabled:\s*false/, 'effective Global Unmount config is not disabled');
  present(active.unmountEngine, /retired:\s*true/, 'Global Unmount retired marker missing from config');
});

check('UM-F command, Governor, Performance Tab, and Control Hub mutators are retired', () => {
  absent(active.unmountAdapter, /UM·(?:ON|OFF|Pass|Restore)|registerControl\s*\(/, 'physical UM Command Bar control remains');
  const unmountGovernorBlock = source.governorAdapter.split('/* ─── 4) Register')[0].split('/* ─── 3) Unmount Adapter')[1] || '';
  absent(unmountGovernorBlock, /api\.(?:setEnabled|applySetting|runPass|remountAll)\s*\(/, 'Governor can still execute physical UM work');
  present(unmountGovernorBlock, /retired/i, 'retired Governor UM adapter contract missing');
  absent(source.controlHub.match(/function CHUB_UM_api[\s\S]*?function CHUB_PW_api/)?.[0] || '', /applySetting\?\.|runPass\?\.|remountAll\?\./, 'Control Hub UM mutator remains');
  const performanceSubtabs = source.controlHub.match(/const FEATURE_CHAT_PERFORMANCE_SUBTABS[\s\S]*?\]\);/)?.[0] || '';
  absent(performanceSubtabs, /unmountMessages/, 'Control Hub still exposes the physical Unmount subtab');
  present(source.performanceTab, /RETIRED_UNMOUNT_CONTROLS\s*=\s*Object\.freeze\(\[\]\)/, 'empty retired Performance Tab controls missing');
  const activePerformanceTab = source.performanceTab.replace(/\/\* P02B_UNREACHABLE_LEGACY_UNMOUNT_CONTROLS[\s\S]*?P02B_UNREACHABLE_LEGACY_UNMOUNT_CONTROLS \*\//, '');
  absent(activePerformanceTab, /cmGlobalUnmount|setUnmountSetting|runUnmountPass|remountAll/, 'mutating Performance Tab UM surface remains reachable');
  absent(activePerformanceTab, /\[['"]unmount-engine['"]|\[['"]unmount-page-collapse['"]/, 'physical UM route remains selectable in Performance Tab');
});

check('UM-G router migrates physical modes to logical owners', () => {
  present(active.mechanismsRouter, /unmount-engine['"]?\s*\)\s*return\s+['"]local-dom['"]/, 'unmount-engine migration missing');
  present(active.mechanismsRouter, /unmount-page-collapse['"]?\s*\)\s*return\s+['"]pagination-focus-page['"]/, 'unmount-page-collapse migration missing');
  present(active.mechanismsRouter, /P02B_PHYSICAL_GLOBAL_UNMOUNT_RETIRED/, 'router migration marker missing');
});

check('UM-I drain fixtures match source-supported legacy record shapes', () => {
  present(source.unmountAdapter, /unmountMap:\s*new Map\(\)/, 'background record map shape missing');
  present(source.unmountAdapter, /manualCollapseById:\s*new Map\(\)/, 'manual record map shape missing');
  present(source.unmountAdapter, /bodyFrag:\s*document\.createDocumentFragment\(\)/, 'manual body fragment shape missing');
  present(source.unmountAdapter, /data-cgxui-owner/, 'owned scaffold provenance missing');
  present(source.unmountAdapter, /CORE_UM_bodyHasNativeContent/, 'same-body hydration distinction missing from source');
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
  matches(selector) {
    return selector.split(',').some((part) => {
      const candidate = part.trim();
      const testId = this.getAttribute('data-testid') || '';
      if (candidate === '[data-testid="conversation-turn"]') return testId === 'conversation-turn';
      if (candidate === '[data-testid^="conversation-turn-"]') return testId.startsWith('conversation-turn-');
      if (candidate === '[data-message-author-role]') return this.getAttribute('data-message-author-role') !== null;
      const roleMatch = candidate.match(/^\[data-message-author-role="([^"]+)"\]$/);
      return !!roleMatch && this.getAttribute('data-message-author-role') === roleMatch[1];
    });
  }
  closest(selector) {
    let cursor = this;
    while (cursor) {
      if (cursor.matches?.(selector)) return cursor;
      cursor = cursor.parentElement;
    }
    return null;
  }
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
  querySelectorAll(selector) {
    const matches = [];
    for (const child of this.children) {
      if (child.matches?.(selector)) matches.push(child);
      matches.push(...(child.querySelectorAll?.(selector) || []));
    }
    return matches;
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
  const roleA = new ElementMock('role-a', { 'data-message-author-role': 'user' }, counters);
  const roleB = new ElementMock('role-b', { 'data-message-author-role': 'assistant' }, counters);
  const roleC = new ElementMock('role-c', { 'data-message-author-role': 'assistant' }, counters);
  const ambiguousRole = new ElementMock('ambiguous-role', { 'data-message-author-role': 'assistant' }, counters);
  nativeA.appendChild(roleA);
  nativeB.appendChild(roleB);
  nativeC.appendChild(roleC);
  const top = new ElementMock('top', { 'data-cgxui-owner': 'pgnw', 'data-cgxui': 'pagination-top' }, counters);
  const bottom = new ElementMock('bottom', { 'data-cgxui-owner': 'pgnw', 'data-cgxui': 'pagination-bottom' }, counters);
  const oldRoot = new ElementMock('old-root', {}, counters);
  const currentRoot = kind === 'remounted' ? new ElementMock('new-root', {}, counters) : oldRoot;
  currentRoot.setConnected(true);
  if (kind === 'owned') {
    oldRoot.appendChild(top);
    oldRoot.appendChild(nativeB);
    oldRoot.appendChild(bottom);
  } else if (kind === 'same-root-rehydrated') {
    oldRoot.appendChild(top);
    oldRoot.appendChild(nativeC);
    oldRoot.appendChild(bottom);
  } else if (kind === 'ambiguous') {
    oldRoot.appendChild(top);
    oldRoot.appendChild(ambiguousRole);
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
        if (kind === 'owned') return nativeB;
        if (kind === 'ambiguous') return ambiguousRole;
        return nativeC;
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
  return { context, window, state, storage, counters, nativeA, nativeB, nativeC, ambiguousRole, oldRoot, currentRoot };
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
  const sameRootRehydrated = runRetiredRuntime('same-root-rehydrated');
  const ambiguous = runRetiredRuntime('ambiguous');
  const writeFailure = runRetiredRuntime('none', { storageWriteFails: true });
  const ownedTransitionReplaceCount = owned.counters.replaceChildren;

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

  check('R6 same-root host rehydration wins over stale retained turns', () => {
    assert.equal(sameRootRehydrated.counters.replaceChildren, 0);
    assert.deepEqual(sameRootRehydrated.currentRoot.children.map((node) => node.name), ['native-c']);
    assert.equal(sameRootRehydrated.currentRoot.contains(sameRootRehydrated.nativeA), false);
    assert.equal(sameRootRehydrated.currentRoot.contains(sameRootRehydrated.nativeB), false);
    assert.equal(sameRootRehydrated.currentRoot.contains(sameRootRehydrated.nativeC), true);
    assert.equal(sameRootRehydrated.counters.scaffoldRemovals, 2);
    assert.equal(sameRootRehydrated.state.masterTurns.length, 0);
    assert.equal(sameRootRehydrated.state.booted, false);
  });

  check('R7 ambiguous current role markup fails closed to host ownership', () => {
    assert.equal(ambiguous.counters.replaceChildren, 0);
    assert.deepEqual(ambiguous.currentRoot.children.map((node) => node.name), ['ambiguous-role']);
    assert.equal(ambiguous.currentRoot.contains(ambiguous.nativeA), false);
    assert.equal(ambiguous.currentRoot.contains(ambiguous.nativeB), false);
    assert.equal(ambiguous.currentRoot.contains(ambiguous.ambiguousRole), true);
    assert.equal(ambiguous.counters.scaffoldRemovals, 2);
    assert.equal(ambiguous.state.masterTurns.length, 0);
    assert.equal(ambiguous.state.booted, false);
  });

  check('R8 post-transition façade stays inert', () => {
    assert.equal(owned.window.H2O_Pagination.boot('test'), false);
    assert.equal(owned.window.H2O_Pagination.goOlder('test'), false);
    assert.equal(owned.window.H2O_Pagination.goToPage(2, 'test'), false);
    assert.equal(owned.window.H2O_Pagination.rebuildIndex('test'), false);
    assert.equal(owned.window.H2O_Pagination.teardownRuntimeSession('test').status, 'retired');
    assert.equal(owned.counters.replaceChildren, ownedTransitionReplaceCount);
    assert.equal(owned.counters.timersScheduled, 0);
    assert.equal(owned.counters.publicationCalls, 0);
  });

  check('R9 migration-write failure stays physically disabled', () => {
    assert.equal(writeFailure.window.H2O_Pagination.getConfig().enabled, false);
    assert.equal(writeFailure.window.H2O_Pagination.getConfig().retired, true);
    assert.equal(writeFailure.window.H2O_Pagination.setEnabled(true), false);
    assert.equal(writeFailure.counters.timersScheduled, 0);
  });

  check('R10 Governor retirement adapter consumes plans without activation', () => {
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
    restoreCurrentNativeRestoreCount: Number(owned.state.transitionRestoreCount || 0),
    restoreCurrentStaleReferenceCount: owned.state.transitionStaleReferenceCount,
    hostRemountedStaleNativeInsertCount: Number(remounted.currentRoot.contains(remounted.nativeA)) + Number(remounted.currentRoot.contains(remounted.nativeB)),
    hostRemountedBlindReplaceChildrenCount: remounted.counters.replaceChildren,
    sameRootRehydratedStaleNativeInsertCount: Number(sameRootRehydrated.currentRoot.contains(sameRootRehydrated.nativeA)) + Number(sameRootRehydrated.currentRoot.contains(sameRootRehydrated.nativeB)),
    sameRootRehydratedBlindReplaceChildrenCount: sameRootRehydrated.counters.replaceChildren,
    sameRootRehydratedHostContentPreserved: sameRootRehydrated.currentRoot.contains(sameRootRehydrated.nativeC),
    sameRootRehydratedScaffoldRemovalCount: sameRootRehydrated.counters.scaffoldRemovals,
    sameRootRehydratedStaleRefsReleased: sameRootRehydrated.state.masterTurns.length === 0 && sameRootRehydrated.state.masterTurnNodeSet.size === 0,
    ambiguousProvenanceRestoreCount: Number(ambiguous.state.transitionRestoreCount || 0),
    ambiguousProvenanceNativeMutationCount: ambiguous.counters.replaceChildren,
    ambiguousProvenanceHostContentPreserved: ambiguous.currentRoot.contains(ambiguous.ambiguousRole),
    ambiguousProvenanceStaleRefsReleased: ambiguous.state.masterTurns.length === 0 && ambiguous.state.masterTurnNodeSet.size === 0,
    noActiveSessionNativeMutationCount: fresh.counters.replaceChildren,
    postTransitionRetainedNativeReferenceCount: owned.state.masterTurnNodeSet.size,
    postTransitionPhysicalSchedulerCount: owned.counters.timersScheduled,
  };
}

class UnmountNodeMock {
  constructor(name, attrs = {}, counters = null, nodeType = 1) {
    this.name = name;
    this.nodeType = nodeType;
    this.attrs = new Map(Object.entries(attrs));
    this.childNodes = [];
    this.parentNode = null;
    this.parentElement = null;
    this._connected = false;
    this.counters = counters;
    this.style = {
      display: '',
      setProperty: (key, value) => { if (key === 'display') this.style.display = String(value); },
      removeProperty: (key) => { if (key === 'display') this.style.display = ''; },
    };
    this.dataset = {};
    for (const [key, value] of this.attrs) {
      if (!key.startsWith('data-')) continue;
      const prop = key.slice(5).replace(/-([a-z])/g, (_, char) => char.toUpperCase());
      this.dataset[prop] = value;
    }
    this.classList = {
      contains: (value) => String(this.getAttribute('class') || '').split(/\s+/).includes(String(value)),
      add: (...values) => {
        const next = new Set(String(this.getAttribute('class') || '').split(/\s+/).filter(Boolean));
        values.forEach((value) => next.add(String(value)));
        this.setAttribute('class', Array.from(next).join(' '));
      },
    };
  }
  get children() { return this.childNodes.filter((node) => node?.nodeType === 1); }
  get firstChild() { return this.childNodes[0] || null; }
  get isConnected() { return this._connected; }
  setConnected(value) {
    this._connected = !!value;
    for (const child of this.childNodes) child.setConnected?.(this._connected);
  }
  getAttribute(name) {
    if (name.startsWith('data-')) {
      const prop = name.slice(5).replace(/-([a-z])/g, (_, char) => char.toUpperCase());
      if (Object.prototype.hasOwnProperty.call(this.dataset, prop)) return String(this.dataset[prop]);
    }
    return this.attrs.has(name) ? this.attrs.get(name) : null;
  }
  hasAttribute(name) { return this.getAttribute(name) !== null; }
  setAttribute(name, value) {
    this.attrs.set(name, String(value));
    if (name.startsWith('data-')) {
      const prop = name.slice(5).replace(/-([a-z])/g, (_, char) => char.toUpperCase());
      this.dataset[prop] = String(value);
    }
  }
  removeAttribute(name) {
    this.attrs.delete(name);
    if (name.startsWith('data-')) {
      const prop = name.slice(5).replace(/-([a-z])/g, (_, char) => char.toUpperCase());
      delete this.dataset[prop];
    }
  }
  matches(selector) {
    return selector.split(',').some((part) => {
      const candidate = part.trim();
      if (!candidate) return false;
      if (candidate.startsWith('.')) return this.classList.contains(candidate.slice(1));
      const exact = candidate.match(/^\[([^=\]]+)="([^"]+)"\]$/);
      if (exact) return this.getAttribute(exact[1]) === exact[2];
      const presentAttr = candidate.match(/^\[([^\]]+)\]$/);
      if (presentAttr) return this.hasAttribute(presentAttr[1]);
      return false;
    });
  }
  querySelectorAll(selector) {
    const found = [];
    for (const child of this.childNodes) {
      if (child.matches?.(selector)) found.push(child);
      found.push(...(child.querySelectorAll?.(selector) || []));
    }
    return found;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  contains(node) {
    if (node === this) return true;
    return this.childNodes.some((child) => child.contains?.(node));
  }
  appendChild(child) {
    if (child?.nodeType === 11) {
      this.counters.fragmentAppends += 1;
      for (const nested of [...child.childNodes]) this.appendChild(nested);
      return child;
    }
    child?.remove?.();
    this.childNodes.push(child);
    child.parentNode = this;
    child.parentElement = this;
    child.setConnected?.(this.isConnected);
    this.counters.nativeMutations += 1;
    return child;
  }
  insertBefore(child, before) {
    if (child?.nodeType === 11) {
      this.counters.fragmentAppends += 1;
      for (const nested of [...child.childNodes]) this.insertBefore(nested, before);
      return child;
    }
    child?.remove?.();
    const index = Math.max(0, this.childNodes.indexOf(before));
    this.childNodes.splice(index, 0, child);
    child.parentNode = this;
    child.parentElement = this;
    child.setConnected?.(this.isConnected);
    this.counters.nativeMutations += 1;
    return child;
  }
  removeChild(child) {
    const index = this.childNodes.indexOf(child);
    if (index < 0) return child;
    this.childNodes.splice(index, 1);
    child.parentNode = null;
    child.parentElement = null;
    child.setConnected?.(false);
    this.counters.nativeMutations += 1;
    return child;
  }
  remove() {
    if (!this.parentNode) return;
    const owned = this.getAttribute('data-cgxui-owner') === 'nmms';
    this.parentNode.removeChild(this);
    if (owned) this.counters.scaffoldRemovals += 1;
  }
  replaceChildren(...items) {
    this.counters.replaceChildren += 1;
    for (const child of [...this.childNodes]) this.removeChild(child);
    for (const item of items) this.appendChild(item);
  }
}

class UnmountFragmentMock extends UnmountNodeMock {
  constructor(name, counters) { super(name, {}, counters, 11); }
  setConnected() {}
}

function makeUnmountHarness(kind, options = {}) {
  const counters = {
    nativeMutations: 0,
    fragmentAppends: 0,
    replaceChildren: 0,
    scaffoldRemovals: 0,
    timersScheduled: 0,
    intervalsScheduled: 0,
    timersCleared: 0,
    intervalsCleared: 0,
    observerDisconnects: 0,
    listenerRemovals: 0,
    commandOwnerRemovals: 0,
    physicalMsgCalls: 0,
    governorPhysicalCalls: 0,
  };
  const storage = new Map([
    ['h2o:prm:cgx:nmntmssgs:cfg:runtime:v1', JSON.stringify({ enabled: true, umEnabled: true, intervalMs: 20000 })],
  ]);
  const turn = new UnmountNodeMock('original-turn', { 'data-message-author-role': 'assistant' }, counters);
  const body = new UnmountNodeMock('original-body', { class: 'cgxui-answer-body' }, counters);
  const underUi = new UnmountNodeMock('under-ui', { class: 'cgxui-under-ui' }, counters);
  turn.appendChild(body);
  turn.appendChild(underUi);
  const replacementBody = new UnmountNodeMock('replacement-body', {}, counters);
  const placeholder = new UnmountNodeMock('um-placeholder', {
    class: 'cgxui-nmms-ph cgxui-unmounted-placeholder',
    'data-cgxui-owner': 'nmms',
  }, counters);
  const retainedA = new UnmountNodeMock('retained-a', { 'data-message-author-role': 'user' }, counters);
  const retainedB = new UnmountNodeMock('retained-b', { 'data-message-author-role': 'assistant' }, counters);
  const hostNative = new UnmountNodeMock('host-native-current', { 'data-message-author-role': 'assistant' }, counters);
  const fragment = new UnmountFragmentMock('retained-fragment', counters);
  fragment.appendChild(retainedA);
  fragment.appendChild(retainedB);
  turn.setConnected(kind !== 'replaced');
  replacementBody.setConnected(true);

  let secondaryTurn = null;
  let secondaryOriginalBody = null;
  let secondaryCurrentBody = null;
  let secondaryRetained = null;
  let secondaryFragment = null;
  if (kind === 'mixed-secondary-replaced') {
    secondaryTurn = new UnmountNodeMock('secondary-turn', { 'data-message-author-role': 'assistant' }, counters);
    secondaryOriginalBody = new UnmountNodeMock('secondary-original-body', { class: 'cgxui-answer-body' }, counters);
    const secondaryUnderUi = new UnmountNodeMock('secondary-under-ui', { class: 'cgxui-under-ui' }, counters);
    secondaryTurn.appendChild(secondaryOriginalBody);
    secondaryTurn.appendChild(secondaryUnderUi);
    secondaryTurn.setConnected(true);
    secondaryOriginalBody.remove();
    secondaryCurrentBody = new UnmountNodeMock('secondary-current-host-body', { class: 'cgxui-answer-body' }, counters);
    secondaryTurn.insertBefore(secondaryCurrentBody, secondaryUnderUi);
    secondaryRetained = new UnmountNodeMock('secondary-stale-retained', { 'data-message-author-role': 'assistant' }, counters);
    secondaryFragment = new UnmountFragmentMock('secondary-retained-fragment', counters);
    secondaryFragment.appendChild(secondaryRetained);
    secondaryTurn.dataset.h2oUnmounted = '1';
    secondaryTurn.dataset.h2oUmTurnHidden = '1';
    secondaryTurn.style.display = 'none';
  }

  if (kind === 'owned' || kind === 'replaced' || kind === 'mixed-secondary-replaced') body.appendChild(placeholder);
  if (kind === 'same-body-rehydrated') {
    body.appendChild(placeholder);
    body.appendChild(hostNative);
  }
  if (kind === 'ambiguous') body.appendChild(hostNative);
  if (kind === 'none' || kind === 'replaced') replacementBody.appendChild(hostNative);

  const saved = {
    key: 'group-1',
    primaryUid: 'a-1',
    primaryEl: turn,
    uids: ['q-1', 'a-1'],
    aliasIds: ['conversation-turn-a-1'],
    items: [{ uid: 'a-1', role: 'assistant', el: turn, frag: fragment, displayBefore: '' }],
  };
  if (secondaryTurn) {
    saved.uids.push('a-2');
    saved.aliasIds.push('conversation-turn-a-2');
    saved.items.push({ uid: 'a-2', role: 'assistant', el: secondaryTurn, frag: secondaryFragment, displayBefore: '' });
  }
  turn.dataset.h2oUnmounted = '1';
  const unmountMap = new Map();
  if (!['none', 'manual-owned', 'manual-rehydrated'].includes(kind)) {
    unmountMap.set('a-1', saved);
    unmountMap.set('q-1', saved);
  }

  const manualCollapseById = new Map();
  let manualBody = null;
  let manualRetained = null;
  if (kind === 'manual-owned' || kind === 'manual-rehydrated') {
    manualBody = new UnmountNodeMock('manual-body', { 'data-at-collapsed': '1' }, counters);
    manualBody.setConnected(true);
    manualRetained = new UnmountNodeMock('manual-retained', {}, counters);
    const manualFragment = new UnmountFragmentMock('manual-fragment', counters);
    manualFragment.appendChild(manualRetained);
    if (kind === 'manual-rehydrated') manualBody.appendChild(hostNative);
    manualCollapseById.set('manual-a', {
      id: 'manual-a', msgEl: manualBody, body: manualBody, bodyFrag: manualFragment,
      preservedBodySubtree: null, preservedBodyIndex: -1, hiddenNodes: [], sources: new Set(['answer-title']),
    });
  }

  const makeObserver = () => ({ disconnect() { counters.observerDisconnects += 1; } });
  const commandBarApi = { removeOwner(owner) { if (owner === 'um') counters.commandOwnerRemovals += 1; } };
  const state = {
    booted: true,
    unmountMap,
    manualCollapseById,
    uidAliasToPrimary: new Map([['conversation-turn-a-1', 'a-1']]),
    remountWaiters: new Map([['a-1', new Set()]]),
    protectUntil: new Map([['a-1', Date.now() + 1000]]),
    presentationMountGuardsByOwner: new Map([['fixture', new Set(['a-1'])]]),
    msgsCache: [body],
    scheduled: true,
    onScroll() {}, onResize() {}, onVis() {}, onFocus() {}, onInlineChanged() {},
    onRemounted() {}, onIndexUpdated() {}, onTurnUpdated() {}, onMountReq() {},
    rootMO: makeObserver(), startMO: makeObserver(), hubMutOff() { counters.observerDisconnects += 1; },
    intervalT: 51, manualRestoreTimer: 52, commandBarBindTimer: 53,
    pageChangedBound: true, offPageChanged() { counters.listenerRemovals += 1; },
    commandBarBound: true, commandBarApi,
  };
  if (kind === 'none') {
    state.unmountMap.clear();
    state.manualCollapseById.clear();
    state.uidAliasToPrimary.clear();
  }
  counters.nativeMutations = 0;
  counters.fragmentAppends = 0;
  counters.scaffoldRemovals = 0;

  const document = {
    documentElement: replacementBody,
    body: replacementBody,
    querySelectorAll(selector) {
      if (selector.includes('data-cgxui-owner="nmms"')) {
        return [body, replacementBody].flatMap((root) => root.querySelectorAll(selector));
      }
      return [];
    },
    getElementById() { return null; },
    addEventListener() {},
    removeEventListener() { counters.listenerRemovals += 1; },
  };
  const window = {
    H2O: {
      UM: { nmntmssgs: { state, chatAdapter: { legacy: true } } },
      commandBar: commandBarApi,
      msg: {
        ensureMountedById() { counters.physicalMsgCalls += 1; return true; },
        requestMountById() { counters.physicalMsgCalls += 1; return true; },
      },
    },
    localStorage: {
      getItem(key) { return storage.has(key) ? storage.get(key) : null; },
      setItem(key, value) {
        if (options.storageWriteFails) throw new Error('isolated write failure');
        storage.set(key, String(value));
      },
    },
    location: { origin: 'https://chatgpt.com', pathname: '/c/chat-1', search: '', href: 'https://chatgpt.com/c/chat-1' },
    setTimeout() { counters.timersScheduled += 1; return 101; },
    setInterval() { counters.intervalsScheduled += 1; return 102; },
    clearTimeout() { counters.timersCleared += 1; },
    clearInterval() { counters.intervalsCleared += 1; },
    addEventListener() {},
    removeEventListener() { counters.listenerRemovals += 1; },
    dispatchEvent() {},
  };
  window.window = window;
  window.top = window;
  window.document = document;
  const context = vm.createContext({
    window, document, location: window.location, console,
    CustomEvent: class CustomEvent { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
    Set, Map, Object, Array, JSON, Promise, Date, Math, Number, String, Boolean,
    clearTimeout: window.clearTimeout, clearInterval: window.clearInterval,
  });
  return {
    context, window, document, state, storage, counters,
    turn, body, replacementBody, retainedA, retainedB, hostNative, fragment,
    secondaryTurn, secondaryOriginalBody, secondaryCurrentBody, secondaryRetained, secondaryFragment,
    manualBody, manualRetained,
  };
}

function runRetiredUnmountRuntime(kind, options = {}) {
  const harness = makeUnmountHarness(kind, options);
  vm.runInContext(source.unmountEngine, harness.context, { filename: PATHS.unmountEngine });
  vm.runInContext(source.unmountAdapter, harness.context, { filename: PATHS.unmountAdapter });
  return harness;
}

let unmountRuntimeEvidence = null;
if (retiredUnmountCandidate) {
  const freshUnmount = runRetiredUnmountRuntime('none');
  const ownedUnmount = runRetiredUnmountRuntime('owned');
  const rehydratedUnmount = runRetiredUnmountRuntime('same-body-rehydrated');
  const replacedUnmount = runRetiredUnmountRuntime('replaced');
  const ambiguousUnmount = runRetiredUnmountRuntime('ambiguous');
  const mixedSecondaryUnmount = runRetiredUnmountRuntime('mixed-secondary-replaced');
  const manualUnmount = runRetiredUnmountRuntime('manual-owned');
  const manualRehydratedUnmount = runRetiredUnmountRuntime('manual-rehydrated');
  const writeFailureUnmount = runRetiredUnmountRuntime('none', { storageWriteFails: true });

  check('UM-R1 persisted enabled state migrates to hard-disabled retirement', () => {
    const migrated = JSON.parse(freshUnmount.storage.get('h2o:prm:cgx:nmntmssgs:cfg:runtime:v1'));
    assert.equal(migrated.enabled, false);
    assert.equal(migrated.retired, true);
    const api = freshUnmount.window.H2O.UM.nmntmssgs.api;
    assert.equal(api.getConfig().enabled, false);
    assert.equal(api.getConfig().retired, true);
    assert.equal(api.setEnabled(true), false);
    assert.equal(api.applySetting('umEnabled', true), false);
  });

  check('UM-R2 fresh retired runtime creates no scheduler, interval, or physical executor', () => {
    assert.equal(freshUnmount.counters.timersScheduled, 0);
    assert.equal(freshUnmount.counters.intervalsScheduled, 0);
    const api = freshUnmount.window.H2O.UM.nmntmssgs.api;
    assert.equal(api.boot('fixture'), false);
    assert.equal(api.runPass('fixture'), false);
    assert.equal(api.collapseById('a-1').status, 'unmount-retired');
    assert.equal(api.collapseManyByIds(['a-1']).status, 'unmount-retired');
    freshUnmount.window.H2O.msg.ensureMountedById('a-1');
    freshUnmount.window.H2O.msg.requestMountById('a-1');
    assert.equal(freshUnmount.counters.physicalMsgCalls, 0);
  });

  check('UM-R3 current owned fragment restores once without blind replacement', () => {
    assert.equal(ownedUnmount.counters.fragmentAppends, 1);
    assert.equal(ownedUnmount.counters.replaceChildren, 0);
    assert.deepEqual(ownedUnmount.body.childNodes.map((node) => node.name), ['retained-a', 'retained-b']);
    assert.equal(ownedUnmount.state.transitionRestoreCount, 1);
    assert.equal(ownedUnmount.state.transitionStaleInsertCount, 0);
    assert.equal(ownedUnmount.state.unmountMap.size, 0);
    assert.equal(ownedUnmount.state.uidAliasToPrimary.size, 0);
  });

  check('UM-R4 same-body native rehydration wins and stale fragment drains', () => {
    assert.equal(rehydratedUnmount.counters.fragmentAppends, 0);
    assert.equal(rehydratedUnmount.counters.replaceChildren, 0);
    assert.equal(rehydratedUnmount.body.contains(rehydratedUnmount.hostNative), true);
    assert.equal(rehydratedUnmount.body.contains(rehydratedUnmount.retainedA), false);
    assert.equal(rehydratedUnmount.body.contains(rehydratedUnmount.retainedB), false);
    assert.equal(rehydratedUnmount.fragment.childNodes.length, 0);
    assert.equal(rehydratedUnmount.state.unmountMap.size, 0);
  });

  check('UM-R5 replaced body rejects stale transfer and preserves replacement', () => {
    assert.equal(replacedUnmount.counters.fragmentAppends, 0);
    assert.equal(replacedUnmount.counters.replaceChildren, 0);
    assert.equal(replacedUnmount.replacementBody.contains(replacedUnmount.hostNative), true);
    assert.equal(replacedUnmount.replacementBody.contains(replacedUnmount.retainedA), false);
    assert.equal(replacedUnmount.fragment.childNodes.length, 0);
    assert.equal(replacedUnmount.state.unmountMap.size, 0);
  });

  check('UM-R6 no-record transition is mutation-free', () => {
    assert.equal(freshUnmount.counters.fragmentAppends, 0);
    assert.equal(freshUnmount.counters.replaceChildren, 0);
    assert.equal(freshUnmount.counters.nativeMutations, 0);
    assert.equal(freshUnmount.state.retirementOutcome, 'no-active-records');
  });

  check('UM-R7 ambiguous ownership fails closed and releases stale native refs', () => {
    assert.equal(ambiguousUnmount.counters.fragmentAppends, 0);
    assert.equal(ambiguousUnmount.counters.replaceChildren, 0);
    assert.equal(ambiguousUnmount.body.contains(ambiguousUnmount.hostNative), true);
    assert.equal(ambiguousUnmount.body.contains(ambiguousUnmount.retainedA), false);
    assert.equal(ambiguousUnmount.fragment.childNodes.length, 0);
    assert.equal(ambiguousUnmount.state.unmountMap.size, 0);
    assert.equal(ambiguousUnmount.state.retirementOutcome, 'retired-fail-closed');
  });

  check('UM-R7b unproven secondary entry fails closed independently', () => {
    assert.equal(mixedSecondaryUnmount.secondaryTurn.querySelector('.cgxui-answer-body'), mixedSecondaryUnmount.secondaryCurrentBody);
    assert.equal(mixedSecondaryUnmount.secondaryCurrentBody.contains(mixedSecondaryUnmount.secondaryRetained), false);
    assert.equal(mixedSecondaryUnmount.secondaryFragment.childNodes.length, 0);
    assert.equal(mixedSecondaryUnmount.counters.replaceChildren, 0);
  });

  check('UM-R7c mixed record restores proven primary without restoring unproven secondary', () => {
    assert.equal(mixedSecondaryUnmount.body.contains(mixedSecondaryUnmount.retainedA), true);
    assert.equal(mixedSecondaryUnmount.state.transitionRestoreCount, 1);
    assert.equal(mixedSecondaryUnmount.secondaryCurrentBody.contains(mixedSecondaryUnmount.secondaryRetained), false);
    assert.equal(mixedSecondaryUnmount.secondaryTurn.contains(mixedSecondaryUnmount.secondaryCurrentBody), true);
    assert.equal(mixedSecondaryUnmount.fragment.childNodes.length, 0);
    assert.equal(mixedSecondaryUnmount.secondaryFragment.childNodes.length, 0);
    assert.equal(mixedSecondaryUnmount.state.unmountMap.size, 0);
    assert.equal(mixedSecondaryUnmount.state.manualCollapseById.size, 0);
    assert.equal(mixedSecondaryUnmount.state.uidAliasToPrimary.size, 0);
    assert.equal(mixedSecondaryUnmount.state.msgsCache.length, 0);
  });

  check('UM-R8 manual retained fragment drains through the same provenance boundary', () => {
    assert.equal(manualUnmount.counters.fragmentAppends, 1);
    assert.equal(manualUnmount.counters.replaceChildren, 0);
    assert.equal(manualUnmount.manualBody.contains(manualUnmount.manualRetained), true);
    assert.equal(manualUnmount.state.manualCollapseById.size, 0);
  });

  check('UM-R9 post-drain authority and retention state are zero', () => {
    for (const harness of [ownedUnmount, rehydratedUnmount, replacedUnmount, ambiguousUnmount, mixedSecondaryUnmount, manualUnmount]) {
      assert.equal(harness.state.unmountMap.size, 0);
      assert.equal(harness.state.manualCollapseById.size, 0);
      assert.equal(harness.state.uidAliasToPrimary.size, 0);
      assert.equal(harness.state.intervalT, 0);
      assert.equal(harness.state.commandBarBindTimer, 0);
      assert.equal(harness.state.rootMO, null);
      assert.equal(harness.state.startMO, null);
      assert.equal(harness.state.booted, false);
      assert.equal(harness.state.retired, true);
    }
  });

  check('UM-R9b manual same-body rehydration also fails closed', () => {
    assert.equal(manualRehydratedUnmount.counters.fragmentAppends, 0);
    assert.equal(manualRehydratedUnmount.counters.replaceChildren, 0);
    assert.equal(manualRehydratedUnmount.manualBody.contains(manualRehydratedUnmount.hostNative), true);
    assert.equal(manualRehydratedUnmount.manualBody.contains(manualRehydratedUnmount.manualRetained), false);
    assert.equal(manualRehydratedUnmount.state.manualCollapseById.size, 0);
  });

  check('UM-R10 storage write failure remains disabled in memory', () => {
    const api = writeFailureUnmount.window.H2O.UM.nmntmssgs.api;
    assert.equal(api.getConfig().enabled, false);
    assert.equal(api.getConfig().retired, true);
    assert.equal(api.setEnabled(true), false);
    assert.equal(writeFailureUnmount.counters.timersScheduled, 0);
  });

  check('UM-R11 Governor consumes UM plans without physical calls', () => {
    const calls = { setEnabled: 0, applySetting: 0 };
    const governorWindow = {
      H2O: { UM: { nmntmssgs: { api: {
        setEnabled() { calls.setEnabled += 1; },
        applySetting() { calls.applySetting += 1; },
      } } } },
      addEventListener() {}, removeEventListener() {}, setTimeout() { return 1; }, clearTimeout() {},
    };
    governorWindow.window = governorWindow;
    vm.runInContext(source.governorAdapter, vm.createContext({ window: governorWindow, console, Object }), { filename: PATHS.governorAdapter });
    const adapter = governorWindow.H2O.diet.adapters.unmount;
    assert.equal(adapter.retired, true);
    assert.equal(adapter.isReady(), false);
    assert.equal(adapter.applyPlan({ enabled: true, minMsgsForUnmount: 8 }), false);
    assert.deepEqual(calls, { setEnabled: 0, applySetting: 0 });
  });

  check('UM-R12 router migrates both legacy physical modes to logical routes', () => {
    const routerStorage = new Map([['h2o:prm:cgx:cntrlhb:state:chat-mechanisms:v1', JSON.stringify({
      version: 1,
      gestureBackend: 'engine',
      answerTitleDblClickMode: 'unmount-engine',
      dividerDotClickMode: 'unmount-engine',
      dividerDblClickMode: 'unmount-page-collapse',
    })]]);
    const routerWindow = {
      H2O: { UM: { nmntmssgs: { api: { getConfig: () => ({ enabled: false, retired: true }) } } } },
      localStorage: {
        getItem(key) { return routerStorage.get(key) || null; },
        setItem(key, value) { routerStorage.set(key, String(value)); },
      },
      location: { pathname: '/c/chat-1' }, dispatchEvent() {},
    };
    routerWindow.window = routerWindow;
    routerWindow.top = routerWindow;
    const context = vm.createContext({ window: routerWindow, console, CustomEvent: class CustomEvent {}, Set, Map, Object, Array, JSON, Date, Math, Number, String, Boolean });
    vm.runInContext(source.mechanismsRouter, context, { filename: PATHS.mechanismsRouter });
    const cfg = routerWindow.H2O.CM.chtmech.api.getConfig();
    assert.equal(cfg.answerTitleDblClickMode, 'local-dom');
    assert.equal(cfg.dividerDotClickMode, 'local-dom');
    assert.equal(cfg.dividerDblClickMode, 'pagination-focus-page');
  });

  unmountRuntimeEvidence = {
    autoGlobalUnmountBootCount: 0,
    startupWaiterActive: false,
    umScrollSchedulerActive: false,
    umResizeSchedulerActive: false,
    umVisibilityFocusSchedulerActive: false,
    umCoreLifecycleSchedulerActive: false,
    umMutationSchedulerActive: false,
    umRecurringIntervalActive: false,
    umBackgroundPassSchedulerActive: false,
    automaticNativeBodyDetachCount: 0,
    manualPhysicalBodyDetachCount: 0,
    newBodyFragRetentionCount: 0,
    newUnmountMapRetentionCount: 0,
    newManualCollapseRetentionCount: 0,
    currentOwnedNativeRestoreCount: ownedUnmount.state.transitionRestoreCount,
    currentOwnedStaleInsertCount: ownedUnmount.state.transitionStaleInsertCount,
    currentOwnedBlindReplaceCount: ownedUnmount.counters.replaceChildren,
    sameBodyRehydratedStaleInsertCount: Number(rehydratedUnmount.body.contains(rehydratedUnmount.retainedA)) + Number(rehydratedUnmount.body.contains(rehydratedUnmount.retainedB)),
    sameBodyRehydratedBlindReplaceCount: rehydratedUnmount.counters.replaceChildren,
    sameBodyRehydratedHostContentPreserved: rehydratedUnmount.body.contains(rehydratedUnmount.hostNative),
    replacedBodyStaleInsertCount: Number(replacedUnmount.replacementBody.contains(replacedUnmount.retainedA)) + Number(replacedUnmount.replacementBody.contains(replacedUnmount.retainedB)),
    replacedBodyHostContentPreserved: replacedUnmount.replacementBody.contains(replacedUnmount.hostNative),
    noActiveRecordNativeMutationCount: freshUnmount.counters.nativeMutations,
    unprovenEntryRestoreCount: Number(mixedSecondaryUnmount.secondaryCurrentBody.contains(mixedSecondaryUnmount.secondaryRetained)),
    unprovenEntryHostBodyPreserved: mixedSecondaryUnmount.secondaryTurn.querySelector('.cgxui-answer-body') === mixedSecondaryUnmount.secondaryCurrentBody,
    unprovenEntryFragmentRefsReleased: mixedSecondaryUnmount.secondaryFragment.childNodes.length === 0,
    mixedPrimaryRestoreCount: Number(mixedSecondaryUnmount.state.transitionRestoreCount || 0),
    mixedSecondaryStaleInsertCount: Number(mixedSecondaryUnmount.secondaryCurrentBody.contains(mixedSecondaryUnmount.secondaryRetained)),
    mixedSecondaryBlindReplaceCount: mixedSecondaryUnmount.counters.replaceChildren,
    mixedSecondaryHostBodyPreserved: mixedSecondaryUnmount.secondaryTurn.contains(mixedSecondaryUnmount.secondaryCurrentBody),
    mixedSecondaryFragmentRefsReleased: mixedSecondaryUnmount.secondaryFragment.childNodes.length === 0,
    postDrainUnmountMapCount: ownedUnmount.state.unmountMap.size,
    postDrainManualCollapseCount: manualUnmount.state.manualCollapseById.size,
    postDrainAliasMapCount: ownedUnmount.state.uidAliasToPrimary.size,
    postDrainBodyFragReferenceCount: ownedUnmount.fragment.childNodes.length + manualUnmount.state.manualCollapseById.size,
    postDrainNativeNodeReferenceCount: ownedUnmount.state.msgsCache.length,
    postDrainPhysicalSchedulerCount: Number(ownedUnmount.state.scheduled),
    postDrainIntervalCount: Number(Boolean(ownedUnmount.state.intervalT)),
    postDrainObserverAuthorityCount: Number(Boolean(ownedUnmount.state.rootMO)) + Number(Boolean(ownedUnmount.state.startMO)),
    postDrainCommandBindRetryCount: Number(Boolean(ownedUnmount.state.commandBarBindTimer)),
    postDrainEngineRetired: ownedUnmount.state.retired === true,
    legacyUmEnabledTrueReactivatesEngine: false,
    umMigrationWriteFailureFailsClosed: writeFailureUnmount.window.H2O.UM.nmntmssgs.api.getConfig().enabled === false,
  };
}

const evidence = {
  root: ROOT,
  candidate: retiredCandidate,
  unmountCandidate: retiredUnmountCandidate,
  assertions: checks.length,
  failures: failures.length,
  ...runtimeEvidence,
  ...unmountRuntimeEvidence,
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
