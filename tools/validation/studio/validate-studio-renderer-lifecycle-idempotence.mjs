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
    this.children = [];
  }
  setAttribute(name, value) { this.attrs.set(name, String(value)); }
  getAttribute(name) { return this.attrs.get(name) || null; }
  removeAttribute(name) { this.attrs.delete(name); }
  setConnected(value) {
    this.isConnected = !!value;
    for (const child of this.children) child.setConnected(value);
  }
  appendChild(node) {
    this.children.push(node);
    node.setConnected(this.isConnected);
    return node;
  }
  contains(node) { return node === this || this.children.some((child) => child.contains(node)); }
}

class FakeReaderElement {
  constructor() {
    this.children = [];
    this.hidden = true;
    this._html = '';
  }
  replaceChildren(...nodes) {
    for (const node of this.children) node.setConnected(false);
    this.children = nodes;
    for (const node of nodes) node.setConnected(true);
    this._html = '';
  }
  set innerHTML(value) {
    this.replaceChildren();
    this._html = String(value || '');
  }
  get innerHTML() { return this._html; }
  appendChild(node) {
    this.children.push(node);
    node.setConnected(true);
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
  const overlayRefreshes = [];

  const hostState = {
    root: null,
    turns: null,
    scroll: null,
    snapshot: null,
    mountCount: 0,
    unmountCount: 0,
    rejectSnapshotUpdate: false,
  };
  const studioHost = {
    mount(opts) {
      if (hostState.root || hostState.snapshot) this.unmount('remount');
      hostState.root = opts.readerRoot || null;
      hostState.turns = opts.turnsEl || null;
      hostState.scroll = opts.scrollEl || null;
      hostState.snapshot = opts.snapshot || null;
      hostState.root?.setAttribute('data-h2o-studio-reader', '1');
      hostState.turns?.setAttribute('data-testid', 'conversation-turns');
      hostState.scroll?.setAttribute('data-scroll-root', '1');
      hostState.mountCount += 1;
      return true;
    },
    unmount() {
      if (!hostState.root && !hostState.snapshot) return false;
      hostState.root?.removeAttribute('data-h2o-studio-reader');
      hostState.scroll?.removeAttribute('data-scroll-root');
      hostState.root = null;
      hostState.turns = null;
      hostState.scroll = null;
      hostState.snapshot = null;
      hostState.unmountCount += 1;
      return true;
    },
    getReaderRoot() {
      return hostState.root?.isConnected ? hostState.root : null;
    },
    getTurnsRoot() {
      return hostState.turns?.isConnected ? hostState.turns : null;
    },
    getScrollRoot() {
      return hostState.scroll?.isConnected ? hostState.scroll : null;
    },
    updateSnapshot(snapshot) {
      if (hostState.rejectSnapshotUpdate) return false;
      if (!hostState.root?.isConnected || !hostState.turns?.isConnected || !hostState.scroll?.isConnected) return false;
      if (!hostState.root.contains(hostState.turns) || !hostState.root.contains(hostState.scroll)) return false;
      hostState.snapshot = snapshot || null;
      return true;
    },
  };

  const state = {
    renderToken: 0,
    rowsCache: [],
    currentReaderSnapshot: null,
    currentReaderEditOverrides: null,
    selectedSnapshotId: '',
    selectedChatId: '',
    lastView: 'saved',
    lastFolderId: '',
    activeRoute: 'list',
  };

  const rendererProjection = (snapshot) => {
    const meta = snapshot?.meta && typeof snapshot.meta === 'object'
      ? snapshot.meta
      : (snapshot?.metadata && typeof snapshot.metadata === 'object' ? snapshot.metadata : {});
    return JSON.stringify({
      snapshotId: String(snapshot?.snapshotId || ''),
      chatId: String(snapshot?.chatId || ''),
      title: String(meta.title || snapshot?.title || snapshot?.chatId || 'Saved chat'),
      projectId: String(meta.projectId || snapshot?.projectId || ''),
      messages: Array.isArray(snapshot?.messages) ? snapshot.messages : [],
      richTurns: Array.isArray(snapshot?.richTurns || meta.richTurns) ? (snapshot.richTurns || meta.richTurns) : [],
    });
  };
  const chatRenderer = {
    normalizeInput(snapshot) { return snapshot; },
    isRenderEquivalent(left, right) { return rendererProjection(left) === rendererProjection(right); },
    render() { return null; },
  };
  const W = {
    location,
    history,
    H2O: {
      studioHost,
      Studio: {
        chatRenderer,
        SELECTORS: {
          ATTR: { TESTID: 'data-testid' },
          TESTIDS: { CONVERSATION_TURNS: 'conversation-turns' },
        },
      },
    },
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
    getEditOverride() { return null; },
    buildReaderDOM(snap) {
      const root = new FakeNode(String(snap?.snapshotId || ''));
      const turns = new FakeNode(`${root.snapshotId}-turns`);
      root.appendChild(turns);
      roots.push(root);
      studioHost.mount({ readerRoot: root, turnsEl: turns, scrollEl: turns, snapshot: snap });
      return root;
    },
    refreshReaderOverlay(root, snap) { overlayRefreshes.push({ root, snap }); },
    renderReaderRouteMeta() {},
    setActiveSidebarChat() {},
    syncSelectionControls() {},
    applyUiState() {},
    esc: (value) => String(value || ''),
  });

  const lifecycleFunctions = [
    'getStudioChatRenderer',
    'studioHostUnmount',
    'studioHostUnmountPreservingRouteHash',
    'isCurrentReaderRoot',
    'getReusableReaderMount',
    'isReusableReaderMountCurrent',
    'collectRendererEditOverrides',
    'haveEquivalentRendererEditOverrides',
    'canReuseReaderDOM',
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
    rejectHostSnapshotUpdate(value = true) { hostState.rejectSnapshotUpdate = !!value; },
    readerEl,
    listPanel,
    state,
    hostState,
    roots,
    overlayRefreshes,
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
  const state = { currentReaderEditOverrides: [] };
  const sandbox = vm.createContext({ W, document, state, String, Object });
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
  const instrumentedHostSource = hostSource.replace(
    '  W.H2O.studioHost = {',
    '  W.__getStudioHostSnapshotForTest = () => STATE.snapshot;\n\n  W.H2O.studioHost = {'
  );
  assert.notEqual(instrumentedHostSource, hostSource, 'host snapshot test hook must install');
  vm.runInContext(instrumentedHostSource, sandbox, { filename: HOST_REL });
  return {
    api: W.H2O.studioHost,
    W,
    D,
    routeEvents,
    originalGetChatId,
    getSnapshot: () => W.__getStudioHostSnapshotForTest(),
  };
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
  assert.equal(h.readerEl.children[0], firstRoot, 'equivalent refresh must preserve root identity');
  assert.equal(firstRoot.isConnected, true);
  assert.equal(h.hostState.root, h.readerEl.children[0]);
  assert.equal(h.hostState.snapshot.snapshotId, 'A');
  assert.equal(h.hostState.mountCount, 1, 'equivalent refresh must not remount S0D3e');
  assert.equal(h.overlayRefreshes.length, 1, 'fast refresh must refresh downstream Overlay projection');
  assert.equal(h.state.currentReaderSnapshot.snapshotId, 'A');
  assert.equal(h.state.currentReaderSnapshot.meta.folderId, 'folder-1');
  assert.equal(JSON.stringify(source), before, 'folder projection must not mutate loaded snapshot');
});

await check('same-ID Renderer-visible changes always replace the mounted transcript', async () => {
  const variants = [
    ['canonical text', (snap) => { snap.messages[0].text = 'changed text'; }],
    ['canonical role', (snap) => { snap.messages[0].role = 'system'; }],
    ['attachment', (snap) => { snap.messages[0].attachments = [{ kind: 'image', alt: 'changed' }]; }],
    ['rich HTML', (snap) => {
      snap.richTurns = [{ turnIdx: 1, role: 'user', outerHTML: '<article>changed</article>' }];
    }],
  ];
  for (const [label, mutate] of variants) {
    const h = createRenderHarness();
    const initial = makeSnapshot('A');
    h.setLoad('A', initial);
    await h.renderReader('A');
    const firstRoot = h.readerEl.children[0];
    const changed = structuredClone(initial);
    mutate(changed);
    h.setLoad('A', changed);
    await h.renderReader('A');
    assert.notEqual(h.readerEl.children[0], firstRoot, `${label} change must replace the root`);
    assert.equal(firstRoot.isConnected, false, `${label} change must detach the previous root`);
    assert.equal(h.hostState.mountCount, 2, `${label} change must remount S0D3e`);
  }
});

await check('equivalent fast refresh publishes the fresh snapshot without mutation', async () => {
  const h = createRenderHarness();
  const initial = makeSnapshot('A');
  h.setLoad('A', initial);
  await h.renderReader('A');
  const root = h.readerEl.children[0];
  const fresh = structuredClone(initial);
  fresh.meta.category = { id: 'surrounding-only' };
  const before = JSON.stringify(fresh);
  h.setLoad('A', fresh);
  await h.renderReader('A');
  assert.equal(h.readerEl.children[0], root);
  assert.equal(h.state.currentReaderSnapshot, fresh, 'fresh loaded snapshot object must become current');
  assert.equal(h.hostState.snapshot, fresh, 'fast refresh must replace the host snapshot reference');
  assert.equal(JSON.stringify(fresh), before, 'fast refresh must not mutate the loaded snapshot');
});

await check('host snapshot publication failure forces the normal rebuild path', async () => {
  const h = createRenderHarness();
  const initial = makeSnapshot('A');
  h.setLoad('A', initial);
  await h.renderReader('A');
  const firstRoot = h.readerEl.children[0];
  const fresh = structuredClone(initial);
  fresh.meta.category = { id: 'presentation-only' };
  h.setLoad('A', fresh);
  h.rejectHostSnapshotUpdate(true);
  await h.renderReader('A');
  assert.notEqual(h.readerEl.children[0], firstRoot, 'publication failure must replace the mounted root');
  assert.equal(firstRoot.isConnected, false, 'publication failure must detach the obsolete root');
  assert.equal(h.hostState.mountCount, 2, 'publication failure must use the normal host mount path');
  assert.equal(h.hostState.snapshot, fresh, 'full rebuild must publish the fresh snapshot');
});

await check('detached or stale host roots reject otherwise-equivalent fast refresh', async () => {
  const detached = createRenderHarness();
  detached.setLoad('A', makeSnapshot('A'));
  await detached.renderReader('A');
  const detachedRoot = detached.readerEl.children[0];
  detachedRoot.setConnected(false);
  await detached.renderReader('A');
  assert.notEqual(detached.readerEl.children[0], detachedRoot, 'detached root must be rebuilt');
  assert.equal(detached.hostState.mountCount, 2);

  const stale = createRenderHarness();
  stale.setLoad('A', makeSnapshot('A'));
  await stale.renderReader('A');
  const staleRoot = stale.readerEl.children[0];
  const unrelatedTurns = new FakeNode('unrelated-turns');
  unrelatedTurns.setConnected(true);
  stale.hostState.turns = unrelatedTurns;
  stale.hostState.scroll = unrelatedTurns;
  await stale.renderReader('A');
  assert.notEqual(stale.readerEl.children[0], staleRoot, 'stale host references must force rebuild');
  assert.equal(stale.hostState.mountCount, 2);
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
  h.setLoad('A', makeSnapshot('A'));
  await h.renderReader('A');
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
  assert.equal(h.hostState.mountCount, 2, 'stale refreshed A must never reuse or remount after B');
});

await check('Reader to non-Reader race invalidates the pending Reader result', async () => {
  const h = createRenderHarness();
  h.setLoad('A', makeSnapshot('A'));
  await h.renderReader('A');
  const a = deferred();
  h.setLoad('A', a.promise);
  const renderA = h.renderReader('A');
  h.location.hash = '#/library';
  h.leaveReader('test:library-race');
  a.resolve(makeSnapshot('A'));
  await renderA;
  assert.equal(h.readerEl.children.length, 0);
  assert.equal(h.hostState.mountCount, 1, 'late refreshed A must not reuse or remount after route leave');
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
    root.appendChild(turns);
    root.appendChild(scroll);
    root.setConnected(true);
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

  const freshB = structuredClone(makeSnapshot('B'));
  freshB.meta.folderId = 'presentation-only';
  assert.equal(h.api.updateSnapshot(freshB), true, 'current same-route snapshot should update without remount');
  assert.equal(h.api.getReaderRoot(), b.root, 'snapshot publication must preserve the mounted root');
  assert.equal(h.W.H2O.util.getChatId(), 'chat-B');
  assert.equal(h.api.updateSnapshot(makeSnapshot('C')), false, 'different-route snapshot must not replace host state');

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

await check('S0D3e snapshot publication rejects detached and inconsistent mounted roots', () => {
  const h = createHostHarness();
  const root = new FakeNode('validity-root');
  const turns = new FakeNode('validity-turns');
  const scroll = new FakeNode('validity-scroll');
  root.appendChild(turns);
  root.appendChild(scroll);
  root.setConnected(true);
  const initial = makeSnapshot('A');
  h.api.mount({ readerRoot: root, turnsEl: turns, scrollEl: scroll, snapshot: initial });
  const accepted = structuredClone(initial);
  accepted.meta.folderId = 'accepted-presentation';
  assert.equal(h.api.updateSnapshot(accepted), true);
  assert.equal(h.getSnapshot(), accepted);

  const rejected = structuredClone(initial);
  rejected.meta.folderId = 'must-not-publish';
  const assertRejectedWithoutMutation = (label) => {
    assert.equal(h.api.updateSnapshot(rejected), false, label);
    assert.equal(h.getSnapshot(), accepted, `${label}: host snapshot must remain unchanged`);
  };

  root.setConnected(false);
  assertRejectedWithoutMutation('detached Reader root must reject publication');
  root.setConnected(true);

  turns.setConnected(false);
  assertRejectedWithoutMutation('detached turns root must reject publication');
  turns.setConnected(true);

  scroll.setConnected(false);
  assertRejectedWithoutMutation('detached scroll root must reject publication');
  scroll.setConnected(true);

  root.children = [];
  assertRejectedWithoutMutation('roots outside the Reader ownership tree must reject publication');
  root.children = [turns, scroll];

  root.removeAttribute('data-h2o-studio-reader');
  assertRejectedWithoutMutation('missing Reader lifecycle marker must reject publication');
  root.setAttribute('data-h2o-studio-reader', '1');

  assert.equal(h.api.updateSnapshot(makeSnapshot('B')), false, 'route identity mismatch must reject publication');
  assert.equal(h.getSnapshot(), accepted, 'route mismatch must preserve the current host snapshot');
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

await check('mounted Reader listener retains only primitive snapshot identity', () => {
  assert.match(studioSource, /const mountedSnapshotId = String\(snap\?\.snapshotId \|\| ''\);/);
  assert.match(studioSource, /String\(currentSnap\.snapshotId \|\| ''\) === mountedSnapshotId/);
});

const total = PASS.length + FAIL.length;
console.log(`\n[validate-studio-renderer-lifecycle-idempotence] ${PASS.length}/${total} passed`);
for (const label of PASS) console.log(`  ✓ ${label}`);
if (FAIL.length) {
  console.log('');
  for (const row of FAIL) console.log(`  ✗ ${row.label}\n${row.error}`);
  process.exit(1);
}
