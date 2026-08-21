#!/usr/bin/env node
// Focused T11 lifecycle validation for Studio Reader orchestration and S0D3e.
// Uses the real lifecycle functions with small DOM/storage seams so refresh,
// replacement, route leave/return, and stale async completion remain testable
// without browser infrastructure or downstream Reader implementation.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..', '..', '..');
const STUDIO_REL = 'src-surfaces-base/studio/studio.js';
const HOST_REL = 'src-surfaces-base/studio/S0D3e. 🎬 Transcript Studio Host - Studio.js';
const studioSource = fs.readFileSync(path.join(REPO_ROOT, STUDIO_REL), 'utf8');
const hostSource = fs.readFileSync(path.join(REPO_ROOT, HOST_REL), 'utf8');

function extractFunction(source, name) {
  const match = new RegExp(`\\b(?:async\\s+)?function\\s+${name}\\s*\\(`).exec(source);
  if (!match) throw new Error(`extractFunction: '${name}' not found`);
  const start = match.index;
  const braceOpen = source.indexOf('{', start);
  let depth = 0;
  for (let i = braceOpen; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`extractFunction: unterminated '${name}'`);
}

class FakeNode {
  constructor(snapshotId = '') {
    this.snapshotId = snapshotId;
    this.isConnected = false;
    this.attrs = new Map();
  }
  setAttribute(name, value) { this.attrs.set(name, String(value)); }
  getAttribute(name) { return this.attrs.get(name) || null; }
  removeAttribute(name) { this.attrs.delete(name); }
}

class FakeReaderElement {
  constructor() {
    this.children = [];
    this.hidden = true;
    this._html = '';
  }
  replaceChildren(...nodes) {
    for (const node of this.children) node.isConnected = false;
    this.children = nodes;
    for (const node of nodes) node.isConnected = true;
    this._html = '';
  }
  set innerHTML(value) {
    this.replaceChildren();
    this._html = String(value || '');
  }
  get innerHTML() { return this._html; }
  appendChild(node) {
    this.children.push(node);
    node.isConnected = true;
    return node;
  }
  contains(node) { return this.children.includes(node) && node.isConnected; }
}

function makeLocation(pathname = '/studio.html', hash = '') {
  return { pathname, search: '', hash };
}

function installHistory(location) {
  return {
    state: {},
    replaceState(nextState, _title, rawUrl) {
      this.state = nextState || {};
      const parsed = new URL(String(rawUrl || ''), 'https://studio.local');
      location.pathname = parsed.pathname;
      location.search = parsed.search;
      location.hash = parsed.hash;
    },
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function makeSnapshot(id, chatId = `chat-${id}`, messages = [{ role: 'user', text: id }]) {
  return { snapshotId: id, chatId, meta: { title: id }, messages };
}

function createRenderHarness() {
  const readerEl = new FakeReaderElement();
  const listPanel = { hidden: false };
  const location = makeLocation('/studio.html', '#/read/A');
  const history = installHistory(location);
  const loads = new Map();
  let bindings = new Map();
  const roots = [];
  const events = [];

  const hostState = {
    root: null,
    snapshot: null,
    mountCount: 0,
    unmountCount: 0,
  };
  const studioHost = {
    mount(opts) {
      if (hostState.root || hostState.snapshot) this.unmount('remount');
      hostState.root = opts.readerRoot || null;
      hostState.snapshot = opts.snapshot || null;
      hostState.mountCount += 1;
      return true;
    },
    unmount() {
      if (!hostState.root && !hostState.snapshot) return false;
      hostState.root = null;
      hostState.snapshot = null;
      hostState.unmountCount += 1;
      return true;
    },
    getReaderRoot() {
      return hostState.root?.isConnected ? hostState.root : null;
    },
  };

  const state = {
    renderToken: 0,
    rowsCache: [],
    currentReaderSnapshot: null,
    selectedSnapshotId: '',
    selectedChatId: '',
    lastView: 'saved',
    lastFolderId: '',
    activeRoute: 'list',
  };

  const W = {
    location,
    history,
    H2O: { studioHost },
    dispatchEvent(event) { events.push(event); },
  };
  const document = {
    getElementById(id) { return id === 'viewReader' ? readerEl : null; },
  };
  const bySelector = {
    '#viewReader': readerEl,
    '#viewListPanel': listPanel,
  };

  const sandbox = vm.createContext({
    W,
    document,
    state,
    $: (selector) => bySelector[selector] || null,
    String,
    Array,
    Object,
    Promise,
    Map,
    console,
    CustomEvent: class CustomEvent { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
    STUDIO_BOOT_AUX_TIMEOUT_MS: 1,
    setStudioRouteScope(name, opts) {
      state.activeRoute = name;
      if (opts?.clearReader) state.currentReaderSnapshot = null;
    },
    applyDesktopReaderRibbonSession() {},
    ensureReaderTopbarActions() {},
    setRouteMeta() {},
    callArchive: async (_op, payload) => {
      const value = loads.get(String(payload?.snapshotId || ''));
      return await Promise.resolve(value);
    },
    fetchWorkbenchRows: async () => [],
    enrichRowsWithFolderData: async (rows) => rows,
    renderFolderSidebar() {},
    promiseWithTimeoutFallback: async (promise, _timeout, _label, fallback) => {
      try { return await Promise.resolve(promise); } catch { return fallback; }
    },
    fetchFolderCatalog: async () => ({ canonical: [], review: [] }),
    fetchLabelCatalog: async () => [],
    fetchCategoryCatalog: async () => [],
    resolveFolderBindingsForChatIds: async () => bindings,
    normalizeFolderBinding: (value) => value || { folderId: '', folderName: '' },
    resolveFolderName: () => '',
    updateRowFolderBinding() {},
    refreshSidebarChatList() {},
    buildReaderDOM(snap) {
      const root = new FakeNode(String(snap?.snapshotId || ''));
      roots.push(root);
      studioHost.mount({ readerRoot: root, snapshot: snap });
      return root;
    },
    renderReaderRouteMeta() {},
    setActiveSidebarChat() {},
    syncSelectionControls() {},
    applyUiState() {},
    esc: (value) => String(value || ''),
  });

  const lifecycleFunctions = [
    'studioHostUnmount',
    'studioHostUnmountPreservingRouteHash',
    'isCurrentReaderRoot',
    'renderReader',
  ].map((name) => extractFunction(studioSource, name)).join('\n');
  vm.runInContext(`${lifecycleFunctions}\nthis.renderReaderUnderTest = renderReader;\nthis.isCurrentReaderRootUnderTest = isCurrentReaderRoot;\nthis.leaveReaderUnderTest = studioHostUnmountPreservingRouteHash;`, sandbox);

  return {
    renderReader: sandbox.renderReaderUnderTest,
    isCurrentReaderRoot: sandbox.isCurrentReaderRootUnderTest,
    leaveReader(reason = 'test:leave') {
      state.renderToken += 1;
      state.currentReaderSnapshot = null;
      sandbox.leaveReaderUnderTest(reason);
    },
    setLoad(id, value) { loads.set(id, value); },
    setBindings(value) { bindings = value; },
    readerEl,
    listPanel,
    state,
    hostState,
    roots,
    location,
    history,
    events,
  };
}

function createRouteHashHarness() {
  const readerEl = new FakeReaderElement();
  const oldRoot = new FakeNode('A');
  readerEl.replaceChildren(oldRoot);
  const location = makeLocation('/c/chat-A', '#/library');
  const history = installHistory(location);
  let unmounts = 0;
  const W = { location, history, H2O: { studioHost: {} } };
  const document = { getElementById: () => readerEl };
  const sandbox = vm.createContext({ W, document, String, Object });
  sandbox.W.H2O.studioHost.unmount = () => {
    unmounts += 1;
    location.pathname = '/studio.html';
    location.hash = '#/read/A';
    return true;
  };
  vm.runInContext(`${extractFunction(studioSource, 'studioHostUnmount')}\n${extractFunction(studioSource, 'studioHostUnmountPreservingRouteHash')}\nthis.leave = studioHostUnmountPreservingRouteHash;`, sandbox);
  return { leave: sandbox.leave, readerEl, oldRoot, location, getUnmounts: () => unmounts };
}

function createHostHarness() {
  const location = makeLocation('/studio.html', '#/read/A');
  const history = installHistory(location);
  const documentElement = new FakeNode();
  const body = new FakeNode();
  const routeEvents = [];
  const originalGetChatId = () => 'native-chat';
  const W = {
    location,
    history,
    H2O: {
      util: { getChatId: originalGetChatId },
      obs: {
        ensureRoot() {},
        markDirty() {},
        flush() {},
        withSuppressed(_reason, callback) { callback(); },
      },
      index: { refresh() {} },
    },
    dispatchEvent(event) { routeEvents.push(event); },
    requestAnimationFrame(callback) { callback(); },
    setTimeout(callback) { callback(); },
  };
  const D = { documentElement, body };
  const sandbox = vm.createContext({
    window: W,
    document: D,
    history,
    Object,
    String,
    Array,
    CustomEvent: class CustomEvent { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
  });
  vm.runInContext(hostSource, sandbox, { filename: HOST_REL });
  return { api: W.H2O.studioHost, W, D, routeEvents, originalGetChatId };
}

const PASS = [];
const FAIL = [];
async function check(label, fn) {
  try { await fn(); PASS.push(label); }
  catch (error) { FAIL.push({ label, error: error?.stack || String(error) }); }
}

await check('same snapshot refresh converges on one current transcript', async () => {
  const h = createRenderHarness();
  const source = makeSnapshot('A');
  h.setLoad('A', source);
  h.setBindings(new Map([['chat-A', { folderId: 'folder-1', folderName: 'Folder 1' }]]));
  const before = JSON.stringify(source);

  await h.renderReader('A');
  const firstRoot = h.readerEl.children[0];
  await h.renderReader('A');

  assert.equal(h.readerEl.children.length, 1);
  assert.equal(h.readerEl.children[0].snapshotId, 'A');
  assert.notEqual(h.readerEl.children[0], firstRoot, 'rebuild may replace node identity');
  assert.equal(firstRoot.isConnected, false, 'previous root must be disconnected');
  assert.equal(h.hostState.root, h.readerEl.children[0]);
  assert.equal(h.hostState.snapshot.snapshotId, 'A');
  assert.equal(h.state.currentReaderSnapshot.snapshotId, 'A');
  assert.equal(h.state.currentReaderSnapshot.meta.folderId, 'folder-1');
  assert.equal(JSON.stringify(source), before, 'folder projection must not mutate loaded snapshot');
});

await check('A to B replacement leaves only B active', async () => {
  const h = createRenderHarness();
  h.setLoad('A', makeSnapshot('A'));
  h.setLoad('B', makeSnapshot('B'));
  await h.renderReader('A');
  const aRoot = h.readerEl.children[0];
  await h.renderReader('B');
  assert.equal(h.readerEl.children.length, 1);
  assert.equal(h.readerEl.children[0].snapshotId, 'B');
  assert.equal(aRoot.isConnected, false);
  assert.equal(h.hostState.root.snapshotId, 'B');
  assert.equal(h.hostState.snapshot.snapshotId, 'B');
  assert.equal(h.state.selectedSnapshotId, 'B');
});

await check('rapid A to B race rejects stale late A result', async () => {
  const h = createRenderHarness();
  const a = deferred();
  const b = deferred();
  h.setLoad('A', a.promise);
  h.setLoad('B', b.promise);

  const renderA = h.renderReader('A');
  const renderB = h.renderReader('B');
  b.resolve(makeSnapshot('B'));
  await renderB;
  a.resolve(makeSnapshot('A'));
  await renderA;

  assert.equal(h.readerEl.children.length, 1);
  assert.equal(h.readerEl.children[0].snapshotId, 'B');
  assert.equal(h.state.currentReaderSnapshot.snapshotId, 'B');
  assert.equal(h.hostState.mountCount, 1, 'stale A must never mount');
});

await check('Reader to non-Reader race invalidates the pending Reader result', async () => {
  const h = createRenderHarness();
  const a = deferred();
  h.setLoad('A', a.promise);
  const renderA = h.renderReader('A');
  h.location.hash = '#/library';
  h.leaveReader('test:library-race');
  a.resolve(makeSnapshot('A'));
  await renderA;
  assert.equal(h.readerEl.children.length, 0);
  assert.equal(h.hostState.mountCount, 0, 'late A must not mount after route leave');
  assert.equal(h.state.currentReaderSnapshot, null);
});

await check('Reader leave and same/different snapshot returns remain single-mounted', async () => {
  const h = createRenderHarness();
  h.setLoad('A', makeSnapshot('A'));
  h.setLoad('B', makeSnapshot('B'));
  await h.renderReader('A');
  const aRoot = h.readerEl.children[0];
  h.location.hash = '#/library';
  h.leaveReader('test:library');
  assert.equal(h.readerEl.children.length, 0);
  assert.equal(aRoot.isConnected, false);
  assert.equal(h.hostState.root, null);
  assert.equal(h.state.currentReaderSnapshot, null);

  await h.renderReader('A');
  assert.equal(h.readerEl.children.length, 1);
  assert.equal(h.readerEl.children[0].snapshotId, 'A');
  h.location.hash = '#/library';
  h.leaveReader('test:library-repeat');

  await h.renderReader('B');
  assert.equal(h.readerEl.children.length, 1);
  assert.equal(h.readerEl.children[0].snapshotId, 'B');
  assert.equal(h.hostState.snapshot.snapshotId, 'B');
});

await check('route teardown preserves requested non-Reader hash', () => {
  const h = createRouteHashHarness();
  h.leave('test:library');
  assert.equal(h.getUnmounts(), 1);
  assert.equal(h.location.pathname, '/studio.html');
  assert.equal(h.location.hash, '#/library');
  assert.equal(h.readerEl.children.length, 0);
  assert.equal(h.oldRoot.isConnected, false);
});

await check('failed and empty snapshot refreshes remain non-accumulating', async () => {
  const h = createRenderHarness();
  const empty = makeSnapshot('empty', 'chat-empty', []);
  h.setLoad('empty', empty);
  h.setLoad('missing', null);
  await h.renderReader('empty');
  await h.renderReader('empty');
  assert.equal(h.readerEl.children.length, 1);
  assert.equal(h.readerEl.children[0].snapshotId, 'empty');
  await h.renderReader('missing');
  assert.equal(h.readerEl.children.length, 0);
  assert.equal(h.hostState.root, null);
  assert.equal(h.state.currentReaderSnapshot, null);
  assert.match(h.readerEl.innerHTML, /Snapshot not found/);
  const error = deferred();
  h.setLoad('error', error.promise);
  const errorRender = h.renderReader('error');
  error.reject(new Error('load failed'));
  await errorRender;
  assert.equal(h.readerEl.children.length, 0);
  assert.equal(h.hostState.root, null);
  assert.equal(h.state.currentReaderSnapshot, null);
  assert.match(h.readerEl.innerHTML, /load failed/);
});

await check('current-root guard rejects detached or superseded async work', async () => {
  const h = createRenderHarness();
  h.setLoad('A', makeSnapshot('A'));
  h.setLoad('B', makeSnapshot('B'));
  await h.renderReader('A');
  const aRoot = h.readerEl.children[0];
  const aSnap = h.state.currentReaderSnapshot;
  assert.equal(h.isCurrentReaderRoot(aRoot, aSnap), true);
  await h.renderReader('B');
  assert.equal(h.isCurrentReaderRoot(aRoot, aSnap), false);
  assert.equal(h.isCurrentReaderRoot(h.readerEl.children[0], h.state.currentReaderSnapshot), true);
  h.leaveReader();
  assert.equal(h.isCurrentReaderRoot(aRoot, aSnap), false);
});

await check('S0D3e repeated mount/unmount keeps only connected current roots', () => {
  const h = createHostHarness();
  const makeRoots = (name) => {
    const root = new FakeNode(name);
    const turns = new FakeNode(`${name}-turns`);
    const scroll = new FakeNode(`${name}-scroll`);
    root.isConnected = turns.isConnected = scroll.isConnected = true;
    return { root, turns, scroll };
  };
  const a = makeRoots('A');
  const b = makeRoots('B');
  h.api.mount({ readerRoot: a.root, turnsEl: a.turns, scrollEl: a.scroll, snapshot: makeSnapshot('A') });
  assert.equal(h.api.getReaderRoot(), a.root);
  assert.equal(a.root.getAttribute('data-h2o-studio-reader'), '1');
  assert.equal(a.scroll.getAttribute('data-scroll-root'), '1');
  assert.equal(h.W.H2O.util.getChatId(), 'chat-A');

  h.api.mount({ readerRoot: b.root, turnsEl: b.turns, scrollEl: b.scroll, snapshot: makeSnapshot('B') });
  assert.equal(a.root.getAttribute('data-h2o-studio-reader'), null);
  assert.equal(a.scroll.getAttribute('data-scroll-root'), null);
  assert.equal(h.api.getReaderRoot(), b.root);
  assert.equal(h.api.getTurnsRoot(), b.turns);
  assert.equal(h.api.getScrollRoot(), b.scroll);
  assert.equal(h.W.H2O.util.getChatId(), 'chat-B');

  b.root.isConnected = false;
  assert.equal(h.api.getReaderRoot(), null, 'disconnected roots must not be exposed');
  b.root.isConnected = true;
  assert.equal(h.api.unmount('test:leave'), true);
  assert.equal(h.api.getReaderRoot(), null);
  assert.equal(h.api.getTurnsRoot(), null);
  assert.equal(h.api.getScrollRoot(), null);
  assert.equal(b.root.getAttribute('data-h2o-studio-reader'), null);
  assert.equal(b.scroll.getAttribute('data-scroll-root'), null);
  assert.equal(h.W.H2O.util.getChatId(), 'native-chat');
  assert.equal(h.api.unmount('test:repeat'), false);

  const aAgain = makeRoots('A-again');
  h.api.mount({
    readerRoot: aAgain.root,
    turnsEl: aAgain.turns,
    scrollEl: aAgain.scroll,
    snapshot: makeSnapshot('A-again'),
  });
  assert.equal(h.api.getReaderRoot(), aAgain.root);
  assert.equal(h.W.H2O.util.getChatId(), 'chat-A-again');
});

await check('non-Reader routes and late overlay work use lifecycle guards', () => {
  for (const route of ['library', 'migrate', 'settings']) {
    assert.match(studioSource, new RegExp(`studioHostUnmountPreservingRouteHash\\("studio:route-${route}"\\)`));
    const branch = new RegExp(
      `if \\(route\\.name === "${route}"\\) \\{[\\s\\S]*?state\\.renderToken \\+= 1;[\\s\\S]*?studioHostUnmountPreservingRouteHash\\("studio:route-${route}"\\)`
    );
    assert.match(studioSource, branch, `${route} route must invalidate pending Reader work before teardown`);
  }
  const overlayGuard = studioSource.indexOf('if (!isCurrentReaderRoot(root, snap)) return;');
  const overlayApply = studioSource.indexOf('__applier(root, snap, __overlay || null)');
  assert.ok(overlayGuard >= 0 && overlayGuard < overlayApply,
    'late overlay result must be gated before it can touch a superseded base root');
});

const total = PASS.length + FAIL.length;
console.log(`\n[validate-studio-renderer-lifecycle-idempotence] ${PASS.length}/${total} passed`);
for (const label of PASS) console.log(`  ✓ ${label}`);
if (FAIL.length) {
  console.log('');
  for (const row of FAIL) console.log(`  ✗ ${row.label}\n${row.error}`);
  process.exit(1);
}
