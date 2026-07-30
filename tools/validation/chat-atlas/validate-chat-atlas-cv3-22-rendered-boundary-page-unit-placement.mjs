#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const CORE_PATH = 'src-runtime-base/1A1b.🟥🗺️ MiniMap Core 🧱🗺️.js';
const PAGE_PATH = 'src-runtime-base/1C1b.🔴📑 Thread Pages Controller 📑.js';
const PARENT_COMMIT = '1f4449a478cf976bba443a9cec4b8642bff035e9';
const CORE_SOURCE = fs.readFileSync(path.join(ROOT, CORE_PATH), 'utf8');
const PAGE_SOURCE = fs.readFileSync(path.join(ROOT, PAGE_PATH), 'utf8');
const PARENT_CORE_SOURCE = execFileSync('git', ['show', `${PARENT_COMMIT}:${CORE_PATH}`], {
  cwd: ROOT,
  encoding: 'utf8',
});

const CHAT_ID = '6928b333-12f4-8328-9e41-6a01def45127';
const ROUTE_KEY = '/g/g-p/c/6928b333-12f4-8328-9e41-6a01def45127';
const EFFECTIVE_FP = 'djb2:2iocqu';
const GRAPH_FP = 'djb2:1yue4v7';
const Q26 = 'dd431d44-a11f-4bf9-b6d0-84e61e4c4237';
const A26 = '5cc611a6-3863-45df-9523-e72dcb2a753b';

const fixtures = [];
let assertionCount = 0;

function equal(actual, expected, message) {
  assertionCount += 1;
  assert.deepEqual(actual, expected, message);
}

function ok(value, message) {
  assertionCount += 1;
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

function extractFunction(source, name) {
  const anchor = `  function ${name}(`;
  const start = source.indexOf(anchor);
  if (start < 0 || source.indexOf(anchor, start + anchor.length) >= 0) {
    throw new Error(`function-anchor-invalid:${name}`);
  }
  const bodyStart = source.indexOf('{', source.indexOf(')', start));
  let depth = 0;
  let quote = '';
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (lineComment) {
      if (char === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === '*' && next === '/') {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '/' && next === '/') {
      lineComment = true;
      index += 1;
      continue;
    }
    if (char === '/' && next === '*') {
      blockComment = true;
      index += 1;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }
    if (char === '{') depth += 1;
    else if (char === '}' && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`function-boundary-invalid:${name}`);
}

class CountingMap extends Map {
  constructor(...args) {
    super(...args);
    this.writes = 0;
    this.deletes = 0;
  }
  set(key, value) {
    this.writes += 1;
    return super.set(key, value);
  }
  delete(key) {
    const had = this.has(key);
    if (had) this.deletes += 1;
    return super.delete(key);
  }
  resetCounts() {
    this.writes = 0;
    this.deletes = 0;
  }
}

class FakeElement {
  constructor(tagName = 'DIV', className = '', guard = null) {
    this.tagName = String(tagName).toUpperCase();
    this.nodeType = 1;
    this.className = className;
    this.children = [];
    this.parentNode = null;
    this.parentElement = null;
    this.attrs = new Map();
    this.isConnected = true;
    this.guard = guard;
    this.hostOwned = false;
    this.style = {
      values: new Map(),
      setProperty: (name, value) => this.style.values.set(name, String(value)),
      removeProperty: (name) => this.style.values.delete(name),
      getPropertyValue: (name) => this.style.values.get(name) || '',
    };
    this.innerHTML = '';
  }
  get classList() {
    return {
      contains: (value) => String(this.className).split(/\s+/).includes(String(value)),
    };
  }
  get firstChild() { return this.children[0] || null; }
  get nextSibling() {
    const index = this.parentNode?.children?.indexOf(this) ?? -1;
    return index >= 0 ? (this.parentNode.children[index + 1] || null) : null;
  }
  get nextElementSibling() { return this.nextSibling; }
  _record(kind, node = this) {
    if (!this.guard?.locked) return;
    const target = node || this;
    if (target.hostOwned) {
      this.guard.safety.hostMutations += 1;
      throw new Error(`forbidden-host-mutation:${kind}`);
    }
    this.guard.safety.h2oMutations += 1;
  }
  appendChild(node) { return this.insertBefore(node, null); }
  insertBefore(node, before) {
    this._record('insertBefore', node);
    if (node.parentNode) {
      const oldIndex = node.parentNode.children.indexOf(node);
      if (oldIndex >= 0) node.parentNode.children.splice(oldIndex, 1);
    }
    const index = before ? this.children.indexOf(before) : -1;
    if (index < 0) this.children.push(node);
    else this.children.splice(index, 0, node);
    node.parentNode = this;
    node.parentElement = this;
    node.isConnected = true;
    return node;
  }
  replaceChild(next, current) {
    this._record('replaceChild', current);
    const index = this.children.indexOf(current);
    if (index < 0) throw new Error('NotFoundError');
    this.children[index] = next;
    current.parentNode = null;
    current.parentElement = null;
    current.isConnected = false;
    next.parentNode = this;
    next.parentElement = this;
    next.isConnected = true;
    return current;
  }
  removeChild(node) {
    this._record('removeChild', node);
    const index = this.children.indexOf(node);
    if (index < 0) throw new Error('NotFoundError');
    this.children.splice(index, 1);
    node.parentNode = null;
    node.parentElement = null;
    node.isConnected = false;
    return node;
  }
  remove() {
    if (this.parentNode) this.parentNode.removeChild(this);
  }
  setAttribute(name, value) {
    const key = String(name);
    const next = String(value);
    if (this.attrs.get(key) === next) return;
    this._record('setAttribute', this);
    this.attrs.set(key, next);
  }
  removeAttribute(name) {
    const key = String(name);
    if (!this.attrs.has(key)) return;
    this._record('removeAttribute', this);
    this.attrs.delete(key);
  }
  getAttribute(name) {
    return this.attrs.has(String(name)) ? this.attrs.get(String(name)) : null;
  }
  hasAttribute(name) { return this.attrs.has(String(name)); }
  matches(selector) { return matchesSelector(this, selector); }
  querySelectorAll(selector) { return queryAll(this, selector, false); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  closest(selector) {
    let current = this;
    while (current) {
      if (current.matches?.(selector)) return current;
      current = current.parentElement;
    }
    return null;
  }
  contains(other) {
    let current = other;
    while (current) {
      if (current === this) return true;
      current = current.parentElement;
    }
    return false;
  }
  compareDocumentPosition(other) {
    const root = topRoot(this);
    const flat = flatten(root);
    const left = flat.indexOf(this);
    const right = flat.indexOf(other);
    if (left < 0 || right < 0 || left === right) return 0;
    return left < right ? 4 : 2;
  }
}

function topRoot(node) {
  let current = node;
  while (current?.parentNode) current = current.parentNode;
  return current;
}

function flatten(root) {
  const out = [];
  const visit = (node) => {
    out.push(node);
    for (const child of node.children || []) visit(child);
  };
  if (root) visit(root);
  return out;
}

function attrConditions(selector) {
  return Array.from(String(selector).matchAll(/\[([^\]=~^$*]+)(?:([\^$*]?=)"([^"]*)")?\]/g))
    .map((match) => ({ name: match[1], op: match[2] || '', value: match[3] || '' }));
}

function matchesSimple(node, selector) {
  const text = String(selector || '').trim();
  if (!text || text.includes(' ')) return false;
  const tag = text.match(/^[a-zA-Z]+/)?.[0] || '';
  if (tag && node.tagName !== tag.toUpperCase()) return false;
  const id = text.match(/#([A-Za-z0-9_-]+)/)?.[1] || '';
  if (id && node.getAttribute('id') !== id) return false;
  for (const cls of Array.from(text.matchAll(/\.([A-Za-z0-9_-]+)/g)).map((match) => match[1])) {
    if (!node.classList.contains(cls)) return false;
  }
  for (const condition of attrConditions(text)) {
    const actual = node.getAttribute(condition.name);
    if (!condition.op && actual == null) return false;
    if (condition.op === '=' && actual !== condition.value) return false;
    if (condition.op === '^=' && !String(actual || '').startsWith(condition.value)) return false;
  }
  return true;
}

function matchesSelector(node, selector) {
  return String(selector).split(',').some((part) => matchesSimple(node, part));
}

function queryAll(root, selector, includeRoot = true) {
  const out = [];
  const visit = (node, include) => {
    if (include && matchesSelector(node, selector)) out.push(node);
    for (const child of node.children || []) visit(child, true);
  };
  visit(root, includeRoot);
  return out;
}

function node(tag, className, guard, { hostOwned = false } = {}) {
  const value = new FakeElement(tag, className, guard);
  value.hostOwned = hostOwned;
  return value;
}

function nestedTurn(identity, role, testId, guard) {
  const wrapper = node('DIV', 'host-native-turn-slot', guard, { hostOwned: true });
  wrapper.setAttribute('data-turn-id-container', identity);
  const nativeHost = node('SECTION', 'host-native-turn', guard, { hostOwned: true });
  nativeHost.setAttribute('data-testid', testId);
  const carrier = node('SECTION', 'host-message-identity', guard, { hostOwned: true });
  carrier.setAttribute('data-turn-id', identity);
  carrier.setAttribute('data-turn', role);
  nativeHost.appendChild(carrier);
  wrapper.appendChild(nativeHost);
  return { wrapper, nativeHost, carrier };
}

function marker(guard, pageNum, kind = 'divider') {
  if (kind === 'divider') {
    const divider = node('DIV', 'cgxui-chat-page-divider', guard);
    divider.setAttribute('data-cgxui-owner', 'mnmp');
    divider.setAttribute('data-cgxui-chat-page-divider', '1');
    divider.setAttribute('data-page-num', String(pageNum));
    return divider;
  }
  const sentinel = node('SPAN', 'h2o-page-boundary', guard);
  sentinel.setAttribute('data-h2o-chat-page-boundary', `page-${pageNum}-${kind}`);
  sentinel.setAttribute('data-h2o-chat-page-boundary-page', String(pageNum));
  sentinel.setAttribute('data-h2o-chat-page-boundary-kind', kind);
  sentinel.setAttribute('data-cgxui-owner', 'mnmp');
  return sentinel;
}

function createStage2AHarness(document, pageState, authorityState) {
  const leases = pageState.renderedPageBoundaryLeases;
  const runtime = {
    getEffectivePresentationStatus: () => ({ ...authorityState.status }),
    getEffectivePresentationIndex: () => ({
      complete: true,
      sourceFingerprint: authorityState.effectiveFingerprint,
      turns: authorityState.records.map((record) => ({ ...record })),
    }),
    getCompleteTurnIndexProjectionStatus: () => ({ ...authorityState.projection }),
    getEffectiveTurnRecordByQId: (qId) => (
      authorityState.records.find((record) => record.qId === qId) || null
    ),
    getGraphIdentityDiagnostics: (ids) => Object.freeze({
      available: true,
      reason: null,
      scope: Object.freeze({ ...authorityState.graphScope }),
      records: Object.freeze(ids.map((id) => Object.freeze({
        requestedId: id,
        found: id === Q26 || id === A26,
        productUser: id === Q26,
        productAnswer: false,
      }))),
    }),
  };
  return vm.runInNewContext(`(() => {
    const document = injectedDocument;
    const S = injectedState;
    const TITLE_LIST_PAGE_SIZE = 25;
    const TURN_HOST_SEL = '[data-testid="conversation-turn"], [data-testid^="conversation-turn-"]';
    const RENDERED_BOUNDARY_SENTINEL_ATTR = 'data-h2o-chat-page-boundary';
    const RENDERED_BOUNDARY_SENTINEL_PAGE_ATTR = 'data-h2o-chat-page-boundary-page';
    const RENDERED_BOUNDARY_SENTINEL_KIND_ATTR = 'data-h2o-chat-page-boundary-kind';
    const TURN_RUNTIME = () => injectedRuntime;
    ${extractFunction(PAGE_SOURCE, 'renderedBoundaryStatusIdentity')}
    ${extractFunction(PAGE_SOURCE, 'frozenRenderedPageBoundaryCapability')}
    ${extractFunction(PAGE_SOURCE, 'renderedBoundaryDirectChildUnder')}
    ${extractFunction(PAGE_SOURCE, 'renderedBoundaryRoleFromCarrier')}
    ${extractFunction(PAGE_SOURCE, 'resolveRenderedTurnSurfaceByIdentity')}
    ${extractFunction(PAGE_SOURCE, 'renderedBoundaryThreadDivider')}
    ${extractFunction(PAGE_SOURCE, 'renderedBoundaryStartSentinel')}
    ${extractFunction(PAGE_SOURCE, 'renderedBoundaryOrderingNodeAllowed')}
    ${extractFunction(PAGE_SOURCE, 'renderedBoundaryLayoutProof')}
    ${extractFunction(PAGE_SOURCE, 'renderedBoundaryWrapperCarriesIdentity')}
    ${extractFunction(PAGE_SOURCE, 'renderedBoundaryPageUnitPlacement')}
    ${extractFunction(PAGE_SOURCE, 'renderedBoundaryTransitionActive')}
    ${extractFunction(PAGE_SOURCE, 'renderedBoundaryRecordStreaming')}
    ${extractFunction(PAGE_SOURCE, 'readRenderedBoundaryAuthority')}
    ${extractFunction(PAGE_SOURCE, 'renderedBoundaryLeaseScopeCurrent')}
    ${extractFunction(PAGE_SOURCE, 'getRenderedPageBoundaryCapability')}
    return Object.freeze({ get: getRenderedPageBoundaryCapability });
  })()`, {
    injectedDocument: document,
    injectedState: pageState,
    injectedRuntime: runtime,
  });
}

function createCoreHarness(coreSource, document, coreState, modelState, controllerApi, safety) {
  return vm.runInNewContext(`(() => {
    const document = injectedDocument;
    const S = injectedState;
    const W = {
      location: { pathname: '${ROUTE_KEY}' },
      fetch() {
        injectedSafety.networkCalls += 1;
        throw new Error('forbidden-network');
      },
      scrollTo() {
        injectedSafety.scrollCalls += 1;
        throw new Error('forbidden-scroll');
      },
      setTimeout() {
        injectedSafety.timerCalls += 1;
        throw new Error('forbidden-timeout');
      },
      setInterval() {
        injectedSafety.timerCalls += 1;
        throw new Error('forbidden-interval');
      },
      requestAnimationFrame() {
        injectedSafety.rafCalls += 1;
        throw new Error('forbidden-raf');
      },
    };
    const TOPW = { H2O: { ChatPageTitleIntent: { api: injectedController } } };
    const Node = { DOCUMENT_POSITION_FOLLOWING: 4, DOCUMENT_POSITION_PRECEDING: 2 };
    const Element = injectedElement;
    const HTMLElement = injectedElement;
    const UI_TOK = { OWNER: 'mnmp' };
    const ATTR_CHAT_PAGE_NUM = 'data-cgxui-chat-page-num';
    const ATTR_CHAT_PAGE_DIVIDER = 'data-cgxui-chat-page-divider';
    const CHAT_PAGE_BOUNDARY_ATTR = 'data-h2o-chat-page-boundary';
    const CHAT_PAGE_BOUNDARY_PAGE_ATTR = 'data-h2o-chat-page-boundary-page';
    const CHAT_PAGE_BOUNDARY_KIND_ATTR = 'data-h2o-chat-page-boundary-kind';
    const CHAT_PAGE_UNIT_OWNER = '1A1b:reconcileChatPageUnits';
    const resolveChatId = () => '${CHAT_ID}';
    const getChatPagesControllerApi = () => injectedController;
    const getTurnPageBand = () => 'normal';
    const buildChatPageUnitModel = () => injectedModel();
    const UM_PUBLIC = () => ({
      requestMountPairByUid() {
        injectedSafety.hydrationRequests += 1;
        return true;
      },
      requestMountByUid() {
        injectedSafety.hydrationRequests += 1;
        return true;
      },
    });
    const fetch = W.fetch;
    const setTimeout = W.setTimeout;
    const setInterval = W.setInterval;
    const requestAnimationFrame = W.requestAnimationFrame;
    const localStorage = Object.freeze({
      setItem() {
        injectedSafety.storageWrites += 1;
        throw new Error('forbidden-local-storage');
      },
    });
    const sessionStorage = Object.freeze({
      setItem() {
        injectedSafety.storageWrites += 1;
        throw new Error('forbidden-session-storage');
      },
    });
    const indexedDB = Object.freeze({
      open() {
        injectedSafety.storageWrites += 1;
        throw new Error('forbidden-indexed-db');
      },
    });
    const MutationObserver = class {
      constructor() {
        injectedSafety.observerCalls += 1;
        throw new Error('forbidden-observer');
      }
    };
    ${extractFunction(coreSource, 'createChatPageDivider')}
    ${extractFunction(coreSource, 'isDividerPassThroughEl')}
    ${extractFunction(coreSource, 'getNextTurnTestIdAfterDivider')}
    ${extractFunction(coreSource, 'getChatPageUnitState')}
    ${extractFunction(coreSource, 'createChatPageBoundarySentinel')}
    ${extractFunction(coreSource, 'ensureChatPageBoundarySentinels')}
    ${extractFunction(coreSource, 'compareChatPageNodes')}
    ${coreSource.includes('function resolveRenderedBoundaryWrapperFromCapability(')
      ? extractFunction(coreSource, 'resolveRenderedBoundaryWrapperFromCapability')
      : ''}
    ${coreSource.includes('function resolveRenderedBoundaryPageUnitAnchor(')
      ? extractFunction(coreSource, 'resolveRenderedBoundaryPageUnitAnchor')
      : ''}
    ${extractFunction(coreSource, 'resolveChatPageBoundaryAnchor')}
    ${extractFunction(coreSource, 'requestChatPageUnitHydration')}
    ${extractFunction(coreSource, 'getActualThreadPageDividers')}
    ${extractFunction(coreSource, 'pageNumberOfThreadDivider')}
    ${extractFunction(coreSource, 'removeH2OChatPageUnitNode')}
    ${extractFunction(coreSource, 'detachDeferredChatPageDivider')}
    ${coreSource.includes('function setChatPageUnitAttributeIfChanged(')
      ? extractFunction(coreSource, 'setChatPageUnitAttributeIfChanged')
      : ''}
    ${extractFunction(coreSource, 'enforceChatPageUnitOrder')}
    ${extractFunction(coreSource, 'reconcileChatPageUnits')}
    return Object.freeze({
      reconcile: reconcileChatPageUnits,
      diagnostics: () => getChatPageUnitState().last,
      state: () => getChatPageUnitState(),
      resolveBoundary: typeof resolveRenderedBoundaryWrapperFromCapability === 'function'
        ? resolveRenderedBoundaryWrapperFromCapability
        : null,
      resolvePageAnchor: typeof resolveRenderedBoundaryPageUnitAnchor === 'function'
        ? resolveRenderedBoundaryPageUnitAnchor
        : null,
    });
  })()`, {
    injectedDocument: document,
    injectedState: coreState,
    injectedModel: modelState.build,
    injectedController: controllerApi,
    injectedElement: FakeElement,
    injectedSafety: safety,
  });
}

function createHarness({ coreSource = CORE_SOURCE, controllerAvailable = true } = {}) {
  const safety = {
    h2oMutations: 0,
    hostMutations: 0,
    hydrationRequests: 0,
    storageWrites: 0,
    cacheWrites: 0,
    preferenceWrites: 0,
    canonicalWrites: 0,
    aliasWrites: 0,
    networkCalls: 0,
    navigationCalls: 0,
    scrollCalls: 0,
    timerCalls: 0,
    rafCalls: 0,
    observerCalls: 0,
    titleListMutations: 0,
    collapseMutations: 0,
    nativeVisibilityMutations: 0,
  };
  const guard = { locked: false, safety };
  const thread = node('DIV', 'thread-root', guard);
  thread.setAttribute('id', 'thread');
  const flow = node('DIV', 'host-thread-flow', guard);
  thread.appendChild(flow);
  const documentElement = node('HTML', '', guard);
  documentElement.appendChild(thread);
  const document = {
    documentElement,
    createElement: (tag) => node(tag, '', guard),
    querySelectorAll: (selector) => queryAll(documentElement, selector, true),
    querySelector: (selector) => queryAll(documentElement, selector, true)[0] || null,
  };

  const page1Start = nestedTurn('q-1', 'user', 'conversation-turn-1', guard);
  const page1Tail = nestedTurn('a-25', 'assistant', 'conversation-turn-50', guard);
  const page1Divider = marker(guard, 1, 'divider');
  const page2Start = marker(guard, 2, 'start');
  const page2Divider = marker(guard, 2, 'divider');
  const boundary = nestedTurn(Q26, 'user', 'conversation-turn-51', guard);
  const answer = nestedTurn(A26, 'assistant', 'conversation-turn-52', guard);
  const later = nestedTurn('q-37', 'user', 'conversation-turn-74', guard);
  flow.appendChild(page1Divider);
  flow.appendChild(page1Start.wrapper);
  flow.appendChild(page1Tail.wrapper);
  flow.appendChild(page2Start);
  flow.appendChild(page2Divider);
  flow.appendChild(boundary.wrapper);
  flow.appendChild(answer.wrapper);
  flow.appendChild(later.wrapper);

  const records = Array.from({ length: 39 }, (_unused, index) => {
    const order = index + 1;
    return {
      order,
      qId: order === 26 ? Q26 : `q-${order}`,
      primaryAId: order === 26 ? A26 : `a-${order}`,
      answerVariants: [order === 26 ? A26 : `a-${order}`],
      noAnswer: false,
      stopped: false,
    };
  });
  const authorityState = {
    effectiveFingerprint: EFFECTIVE_FP,
    records,
    status: {
      source: 'canonical',
      overlayActive: false,
      count: 39,
      canonicalFingerprint: EFFECTIVE_FP,
      anchorQId: '',
      pathLength: 0,
      chatId: CHAT_ID,
      routeKey: ROUTE_KEY,
      generation: 1,
    },
    projection: {
      authoritative: true,
      chatId: CHAT_ID,
      routeGeneration: 1,
      fingerprint: EFFECTIVE_FP,
      selectedPathConfirmationPending: false,
      selectedPathConfirmationLeaseActive: false,
      selectedPathRequestLeaseActive: false,
    },
    graphScope: {
      chatId: CHAT_ID,
      routeKey: ROUTE_KEY,
      generation: 1,
      fingerprint: GRAPH_FP,
    },
  };
  const pageState = { renderedPageBoundaryLeases: new CountingMap() };
  const pageApi = createStage2AHarness(document, pageState, authorityState);
  const coreState = {
    chatPageUnitState: {
      identity: '',
      sentinels: new Map([['2:start', page2Start]]),
      pendingDividers: new Map([[1, page1Divider], [2, page2Divider]]),
      reconcileInFlight: false,
      hydrationRequested: new Set(),
      last: null,
    },
  };
  const modelState = {
    boundaryMounted: true,
    count: 39,
    build() {
      const page1 = {
        pageNum: 1,
        startOrder: 1,
        endOrder: 25,
        records: [{ order: 1, turn: records[0] }],
        artifacts: [
          { order: 1, wrapper: page1Start.wrapper },
          { order: 25, wrapper: page1Tail.wrapper },
        ],
        exactStart: { wrapper: page1Start.wrapper },
        earliest: { order: 1, wrapper: page1Start.wrapper },
        latest: { order: 25, wrapper: page1Tail.wrapper },
        titleListRoot: null,
        nativeStartSlot: null,
        nativeEndSlot: null,
        nextNativeStartSlot: null,
      };
      const page2 = {
        pageNum: 2,
        startOrder: 26,
        endOrder: 39,
        records: [{ order: 26, turn: records[25] }],
        artifacts: modelState.boundaryMounted
          ? [{ order: 26, wrapper: boundary.wrapper }, { order: 37, wrapper: later.wrapper }]
          : [{ order: 37, wrapper: later.wrapper }],
        exactStart: modelState.boundaryMounted ? { wrapper: boundary.wrapper } : null,
        earliest: modelState.boundaryMounted
          ? { order: 26, wrapper: boundary.wrapper }
          : { order: 37, wrapper: later.wrapper },
        latest: { order: 37, wrapper: later.wrapper },
        titleListRoot: null,
        nativeStartSlot: null,
        nativeEndSlot: null,
        nextNativeStartSlot: null,
      };
      return Object.freeze({
        identity: `${CHAT_ID}|${ROUTE_KEY}|canonical|${modelState.count}|${EFFECTIVE_FP}`,
        chatId: CHAT_ID,
        source: 'canonical',
        count: modelState.count,
        pageCount: modelState.count > 25 ? 2 : 1,
        pages: modelState.count > 25 ? [page1, page2] : [page1],
      });
    },
  };
  const controllerState = { override: null };
  const controllerApi = controllerAvailable
    ? {
        getRenderedPageBoundaryCapability(pageNum) {
          if (typeof controllerState.override === 'function') {
            return controllerState.override(pageNum, pageApi.get);
          }
          return pageApi.get(pageNum);
        },
      }
    : {};
  const coreApi = createCoreHarness(
    coreSource,
    document,
    coreState,
    modelState,
    controllerApi,
    safety,
  );
  guard.locked = true;

  const withMutations = (run) => {
    const prior = guard.locked;
    guard.locked = false;
    try { return run(); } finally { guard.locked = prior; }
  };
  const unmountBoundary = () => withMutations(() => {
    boundary.wrapper.removeChild(boundary.nativeHost);
    answer.wrapper.removeChild(answer.nativeHost);
    modelState.boundaryMounted = false;
  });
  const remountBoundary = () => withMutations(() => {
    boundary.wrapper.appendChild(boundary.nativeHost);
    answer.wrapper.appendChild(answer.nativeHost);
    modelState.boundaryMounted = true;
  });
  const order = () => flow.children.map((child) => {
    if (child === boundary.wrapper) return 'BOUNDARY-26';
    if (child === later.wrapper) return 'TURN-74';
    if (child.classList.contains('cgxui-chat-page-divider')) {
      return `DIVIDER-${child.getAttribute('data-page-num')}`;
    }
    const boundaryName = child.getAttribute('data-h2o-chat-page-boundary');
    return boundaryName ? `SENTINEL-${boundaryName}` : '';
  }).filter(Boolean);
  return {
    safety,
    guard,
    document,
    flow,
    pageApi,
    coreApi,
    pageState,
    coreState,
    modelState,
    authorityState,
    page1Divider,
    page1Start,
    page1Tail,
    page2Start,
    page2Divider,
    boundary,
    answer,
    later,
    withMutations,
    unmountBoundary,
    remountBoundary,
    controllerState,
    order,
    installCore(coreSource = CORE_SOURCE) {
      return createCoreHarness(
        coreSource,
        document,
        coreState,
        modelState,
        controllerApi,
        safety,
      );
    },
    resetSafety() {
      for (const key of Object.keys(safety)) safety[key] = 0;
      pageState.renderedPageBoundaryLeases.resetCounts();
      coreState.chatPageUnitState.pendingDividers.resetCounts?.();
    },
  };
}

await fixture('parent live drift is reproduced through real Stage 2A and 1A1b reconciliation', () => {
  const h = createHarness({ coreSource: PARENT_CORE_SOURCE });
  const mounted = h.pageApi.get(2);
  equal(mounted.supported, true, 'mounted identity captured');
  equal(mounted.pageUnitOrderCurrent, true, 'initial marker order current');
  equal(mounted.leaseCurrent, true, 'initial lease current');
  h.unmountBoundary();
  const retained = h.pageApi.get(2);
  equal(retained.source, 'same-generation-captured-wrapper', 'retained lease source');
  equal(retained.pageUnitOrderCurrent, true, 'markers initially remain current');
  const before = h.order();
  ok(before.indexOf('DIVIDER-2') < before.indexOf('BOUNDARY-26'), 'divider initially precedes boundary');
  const repair = h.coreApi.reconcile('parent-live-drift');
  equal(repair.pages[1].mode, 'earliest-exact-page-artifact', 'parent chooses later mounted fallback');
  const after = h.order();
  ok(after.indexOf('BOUNDARY-26') < after.indexOf('DIVIDER-2'), 'parent moves divider after exact boundary');
  ok(after.indexOf('DIVIDER-2') < after.indexOf('TURN-74'), 'parent places divider before Turn 74');
  equal(
    h.page2Divider.getAttribute('data-h2o-divider-anchor-mode'),
    'earliest-exact-page-artifact',
    'parent records later-artifact mode',
  );
  equal(
    h.page2Divider.getAttribute('data-h2o-divider-next-testid'),
    'conversation-turn-74',
    'parent records Turn 74',
  );
  const drifted = h.pageApi.get(2);
  equal(drifted.supported, true, 'identity remains supported');
  equal(drifted.boundaryIdentityCurrent, true, 'boundary identity current');
  equal(drifted.pageUnitOrderCurrent, false, 'page-unit order drifted');
  equal(drifted.placementRepairRequired, true, 'placement repair requested');
  equal(drifted.leaseCurrent, true, 'same lease remains current');
});

await fixture('corrected coordinator repairs the retained rendered boundary', () => {
  const h = createHarness({ coreSource: PARENT_CORE_SOURCE });
  equal(h.pageApi.get(2).supported, true, 'mounted boundary captured');
  h.unmountBoundary();
  h.coreApi.reconcile('parent-drift-before-fix');
  equal(h.pageApi.get(2).placementRepairRequired, true, 'parent drift requests repair');
  const corrected = h.installCore(CORE_SOURCE);
  const repair = corrected.reconcile('stage-2b-rendered-boundary');
  equal(repair.pages[1].mode, 'rendered-boundary-authority', 'rendered authority wins');
  const order = h.order();
  ok(order.indexOf('SENTINEL-page-2-start') < order.indexOf('DIVIDER-2'), 'sentinel precedes divider');
  ok(order.indexOf('DIVIDER-2') < order.indexOf('BOUNDARY-26'), 'divider precedes exact boundary');
  ok(order.indexOf('BOUNDARY-26') < order.indexOf('TURN-74'), 'retained boundary remains before Turn 74');
  equal(
    h.page2Divider.getAttribute('data-h2o-divider-anchor-mode'),
    'rendered-boundary-authority',
    'rendered-boundary mode recorded',
  );
  equal(
    h.page2Divider.getAttribute('data-h2o-divider-next-testid'),
    '',
    'late Turn 74 diagnostic cleared',
  );
  const restored = h.pageApi.get(2);
  equal(restored.supported, true, 'identity remains supported after repair');
  equal(restored.pageUnitOrderCurrent, true, 'Stage 2A sees repaired marker order');
  equal(restored.placementRepairRequired, false, 'Stage 2A no longer requests repair');
  equal(restored.leaseCurrent, true, 'same lease remains current');
});

function supportedCapability(qId = Q26) {
  return Object.freeze({
    version: 2,
    supported: true,
    reason: null,
    pageNum: 2,
    qId,
    boundaryIdentityCurrent: true,
    leaseCurrent: true,
    boundaryDirectFlowIndex: 999,
    boundaryTestId: 'conversation-turn-999',
  });
}

function repairRetainedBoundary() {
  const h = createHarness({ coreSource: PARENT_CORE_SOURCE });
  equal(h.pageApi.get(2).supported, true, 'boundary lease captured');
  h.unmountBoundary();
  h.coreApi.reconcile('parent-drift');
  const core = h.installCore(CORE_SOURCE);
  const result = core.reconcile('rendered-boundary-repair');
  return { h, core, result };
}

await fixture('exact mounted qId boundary has highest anchor priority', () => {
  const h = createHarness();
  const result = h.coreApi.reconcile('mounted-priority');
  equal(result.pages[1].mode, 'rendered-boundary-authority', 'mounted boundary authority selected');
  ok(h.order().indexOf('DIVIDER-2') < h.order().indexOf('BOUNDARY-26'), 'divider is before qId wrapper');
});

await fixture('same-generation retained wrapper has highest anchor priority', () => {
  const { h, result } = repairRetainedBoundary();
  equal(result.pages[1].mode, 'rendered-boundary-authority', 'retained wrapper authority selected');
  equal(h.pageApi.get(2).source, 'same-generation-captured-wrapper', 'same lease source retained');
});

await fixture('start sentinel moves before the exact rendered wrapper', () => {
  const { h } = repairRetainedBoundary();
  const order = h.order();
  ok(order.indexOf('SENTINEL-page-2-start') < order.indexOf('BOUNDARY-26'), 'start sentinel precedes boundary');
});

await fixture('divider follows start sentinel and precedes exact wrapper', () => {
  const { h } = repairRetainedBoundary();
  const order = h.order();
  ok(order.indexOf('SENTINEL-page-2-start') < order.indexOf('DIVIDER-2'), 'sentinel precedes divider');
  ok(order.indexOf('DIVIDER-2') < order.indexOf('BOUNDARY-26'), 'divider precedes boundary');
});

await fixture('repair moves no native wrapper', () => {
  const h = createHarness({ coreSource: PARENT_CORE_SOURCE });
  h.pageApi.get(2);
  h.unmountBoundary();
  h.coreApi.reconcile('parent-drift');
  const nativeOrder = [h.page1Start.wrapper, h.page1Tail.wrapper, h.boundary.wrapper, h.answer.wrapper, h.later.wrapper];
  const before = h.flow.children.filter((entry) => nativeOrder.includes(entry));
  h.installCore(CORE_SOURCE).reconcile('repair');
  const after = h.flow.children.filter((entry) => nativeOrder.includes(entry));
  equal(after, before, 'native relative positions unchanged');
  equal(h.safety.hostMutations, 0, 'no host mutation attempted');
});

await fixture('repair removes no native wrapper', () => {
  const { h } = repairRetainedBoundary();
  for (const wrapper of [h.page1Start.wrapper, h.page1Tail.wrapper, h.boundary.wrapper, h.answer.wrapper, h.later.wrapper]) {
    ok(wrapper.isConnected, 'native wrapper remains connected');
  }
});

await fixture('repair reparents no native wrapper', () => {
  const { h } = repairRetainedBoundary();
  for (const wrapper of [h.page1Start.wrapper, h.page1Tail.wrapper, h.boundary.wrapper, h.answer.wrapper, h.later.wrapper]) {
    equal(wrapper.parentElement, h.flow, 'native wrapper keeps flow parent');
  }
});

await fixture('later mounted Turn 74 cannot override retained qId boundary', () => {
  const { h } = repairRetainedBoundary();
  const order = h.order();
  ok(order.indexOf('DIVIDER-2') < order.indexOf('BOUNDARY-26'), 'divider uses retained boundary');
  ok(order.indexOf('BOUNDARY-26') < order.indexOf('TURN-74'), 'Turn 74 remains later');
  equal(h.page2Divider.getAttribute('data-h2o-divider-anchor-mode'), 'rendered-boundary-authority', 'late mode retired');
});

await fixture('mounted-artifact fallback remains when capability is unsupported', () => {
  const h = createHarness();
  h.pageApi.get(2);
  h.unmountBoundary();
  h.controllerState.override = (pageNum, get) => (
    pageNum === 2 ? Object.freeze({ version: 2, supported: false, reason: 'boundary-wrapper-unavailable' }) : get(pageNum)
  );
  const result = h.coreApi.reconcile('unsupported-fallback');
  equal(result.pages[1].mode, 'earliest-exact-page-artifact', 'existing fallback preserved');
  ok(h.order().indexOf('DIVIDER-2') < h.order().indexOf('TURN-74'), 'fallback anchors to later mounted artifact');
});

await fixture('supported capability with unresolved wrapper fails closed', () => {
  const h = createHarness();
  h.controllerState.override = (pageNum, get) => (
    pageNum === 2 ? supportedCapability('missing-qid') : get(pageNum)
  );
  const before = h.order().filter((entry) => (
    entry === 'SENTINEL-page-2-start'
    || entry === 'DIVIDER-2'
    || entry === 'BOUNDARY-26'
    || entry === 'TURN-74'
  ));
  const result = h.coreApi.reconcile('unresolved-supported');
  equal(result.pages[1].status, 'deferred', 'placement deferred');
  equal(result.pages[1].reason, 'rendered-boundary-wrapper-unavailable', 'deterministic diagnostic');
  equal(h.order().filter((entry) => (
    entry === 'SENTINEL-page-2-start'
    || entry === 'DIVIDER-2'
    || entry === 'BOUNDARY-26'
    || entry === 'TURN-74'
  )), before, 'Page 2 markers retained');
  equal(h.safety.hydrationRequests, 0, 'no fallback hydration');
});

await fixture('duplicate exact qId wrappers fail closed', () => {
  const h = createHarness();
  let duplicate = null;
  h.withMutations(() => {
    duplicate = node('DIV', 'host-native-turn-slot', h.guard, { hostOwned: true });
    duplicate.setAttribute('data-turn-id-container', Q26);
    h.flow.appendChild(duplicate);
  });
  const before = h.order().filter((entry) => (
    entry === 'SENTINEL-page-2-start'
    || entry === 'DIVIDER-2'
    || entry === 'BOUNDARY-26'
    || entry === 'TURN-74'
  ));
  const result = h.coreApi.reconcile('duplicate-qid');
  equal(result.pages[1].reason, 'rendered-boundary-wrapper-ambiguous', 'duplicate diagnostic');
  equal(h.order().filter((entry) => (
    entry === 'SENTINEL-page-2-start'
    || entry === 'DIVIDER-2'
    || entry === 'BOUNDARY-26'
    || entry === 'TURN-74'
  )), before, 'no Page 2 marker movement on ambiguity');
});

await fixture('disconnected exact qId wrapper fails closed', () => {
  const h = createHarness();
  const cap = supportedCapability();
  h.withMutations(() => h.flow.removeChild(h.boundary.wrapper));
  const resolved = h.coreApi.resolveBoundary(h.flow, cap);
  equal(resolved.ok, false, 'disconnected wrapper not resolved');
  equal(resolved.reason, 'rendered-boundary-wrapper-unavailable', 'disconnected diagnostic');
});

await fixture('qId wrapper under a different flow root fails closed', () => {
  const h = createHarness();
  let otherRoot = null;
  let otherWrapper = null;
  h.withMutations(() => {
    otherRoot = node('DIV', 'other-flow', h.guard);
    otherWrapper = node('DIV', 'host-native-turn-slot', h.guard, { hostOwned: true });
    otherWrapper.setAttribute('data-turn-id-container', Q26);
    h.flow.removeChild(h.boundary.wrapper);
    h.document.documentElement.appendChild(otherRoot);
    otherRoot.appendChild(otherWrapper);
  });
  const result = h.coreApi.resolveBoundary(h.flow, supportedCapability());
  equal(result.ok, false, 'other flow wrapper rejected');
});

await fixture('numeric direct-flow index is diagnostic only', () => {
  const fn = extractFunction(CORE_SOURCE, 'resolveRenderedBoundaryWrapperFromCapability');
  equal(fn.includes('boundaryDirectFlowIndex'), false, 'resolver never reads numeric index');
});

await fixture('test ID is diagnostic only', () => {
  const fn = extractFunction(CORE_SOURCE, 'resolveRenderedBoundaryWrapperFromCapability');
  equal(fn.includes('boundaryTestId'), false, 'resolver never reads test ID');
  equal(fn.includes('data-testid'), false, 'resolver never queries test ID');
});

await fixture('raw flow child count is not authority', () => {
  const fn = extractFunction(CORE_SOURCE, 'resolveRenderedBoundaryWrapperFromCapability');
  equal(fn.includes('childCount'), false, 'no raw child count');
  equal(fn.includes('.length ==='), false, 'no raw children-length authority');
});

await fixture('pair count times two is not consumed', () => {
  const fn = extractFunction(CORE_SOURCE, 'resolveRenderedBoundaryPageUnitAnchor');
  equal(fn.includes('* 2'), false, 'no pair-to-native conversion');
});

await fixture('native ordinal arithmetic is not consumed', () => {
  const joined = [
    extractFunction(CORE_SOURCE, 'resolveRenderedBoundaryWrapperFromCapability'),
    extractFunction(CORE_SOURCE, 'resolveRenderedBoundaryPageUnitAnchor'),
  ].join('\n');
  equal(/\bordinal\b/i.test(joined), false, 'no native ordinal authority');
});

await fixture('Page 3 consumes its own capability generically', () => {
  const h = createHarness();
  const q51 = 'q-page-3-start';
  let page3Wrapper = null;
  h.withMutations(() => {
    page3Wrapper = node('DIV', 'host-native-turn-slot', h.guard, { hostOwned: true });
    page3Wrapper.setAttribute('data-turn-id-container', q51);
    h.flow.appendChild(page3Wrapper);
  });
  h.controllerState.override = (pageNum, get) => (
    pageNum === 3
      ? Object.freeze({ ...supportedCapability(q51), pageNum: 3 })
      : get(pageNum)
  );
  const page = {
    pageNum: 3,
    nativeStartSlot: null,
    exactStart: null,
    titleListRoot: null,
    earliest: { wrapper: page3Wrapper },
    latest: { wrapper: page3Wrapper },
  };
  const anchor = h.coreApi.resolvePageAnchor({ pages: [null, null, page] }, page);
  equal(anchor.ok, true, 'Page 3 anchor resolves');
  equal(anchor.before, page3Wrapper, 'Page 3 uses its qId wrapper');
  equal(anchor.mode, 'rendered-boundary-authority', 'generic rendered mode');
});

await fixture('Page 1 behavior remains on its existing contract', () => {
  const h = createHarness();
  const page = h.modelState.build().pages[0];
  const rendered = h.coreApi.resolvePageAnchor(h.modelState.build(), page);
  equal(rendered.applicable, false, 'rendered authority does not apply to Page 1');
  const result = h.coreApi.reconcile('page-1-unchanged');
  equal(result.pages[0].mode, 'exact-page-start', 'existing Page 1 anchor remains');
});

await fixture('page outside effective count is removed by existing rules', () => {
  const h = createHarness();
  h.modelState.count = 18;
  const result = h.coreApi.reconcile('effective-18');
  equal(result.pageCount, 1, 'authority owns one page');
  equal(h.page2Divider.isConnected, false, 'Page 2 divider removed');
});

await fixture('missing start sentinel is repaired by existing marker ownership', () => {
  const h = createHarness();
  h.withMutations(() => {
    h.flow.removeChild(h.page2Start);
    h.coreState.chatPageUnitState.sentinels.delete('2:start');
  });
  h.coreApi.reconcile('missing-marker');
  const replacement = h.coreState.chatPageUnitState.sentinels.get('2:start');
  ok(replacement && replacement !== h.page2Start, 'new owned sentinel created');
  ok(h.flow.children.indexOf(replacement) < h.flow.children.indexOf(h.boundary.wrapper), 'replacement placed before boundary');
});

await fixture('existing marker identity is preserved when repair only moves it', () => {
  const { h } = repairRetainedBoundary();
  equal(h.coreState.chatPageUnitState.sentinels.get('2:start'), h.page2Start, 'same sentinel retained');
  equal(h.coreState.chatPageUnitState.pendingDividers.get(2), h.page2Divider, 'same divider retained');
});

await fixture('external marker replacement remains within established ownership', () => {
  const h = createHarness();
  h.coreApi.reconcile('initial');
  const replacement = marker(h.guard, 2, 'start');
  h.withMutations(() => {
    h.flow.replaceChild(replacement, h.page2Start);
    h.coreState.chatPageUnitState.sentinels.set('2:start', replacement);
  });
  h.coreApi.reconcile('replacement');
  equal(h.coreState.chatPageUnitState.sentinels.get('2:start'), replacement, 'registered replacement retained');
  ok(h.flow.children.indexOf(replacement) < h.flow.children.indexOf(h.boundary.wrapper), 'replacement ordered');
});

await fixture('second identical reconciliation performs zero DOM mutations', () => {
  const h = createHarness();
  h.coreApi.reconcile('settle');
  h.resetSafety();
  const result = h.coreApi.reconcile('same');
  equal(result.moved, 0, 'no moves');
  equal(result.created, 0, 'no creates');
  equal(result.removed, 0, 'no removals');
  equal(h.safety.h2oMutations, 0, 'no attribute or placement mutations');
});

await fixture('zero-mutation pass preserves diagnostic attributes', () => {
  const h = createHarness();
  h.coreApi.reconcile('settle');
  const before = Array.from(h.page2Divider.attrs.entries());
  h.resetSafety();
  h.coreApi.reconcile('same');
  equal(Array.from(h.page2Divider.attrs.entries()), before, 'diagnostics unchanged');
  equal(h.safety.h2oMutations, 0, 'same attributes were not rewritten');
});

await fixture('Stage 2A reports current page-unit order after repair', () => {
  const { h } = repairRetainedBoundary();
  const capability = h.pageApi.get(2);
  equal(capability.pageUnitOrderCurrent, true, 'Stage 2A sees current order');
  equal(capability.placementRepairRequired, false, 'repair no longer required');
});

await fixture('Stage 2A retains the exact boundary lease after repair', () => {
  const { h } = repairRetainedBoundary();
  const capability = h.pageApi.get(2);
  equal(capability.source, 'same-generation-captured-wrapper', 'captured source preserved');
  equal(capability.leaseCurrent, true, 'lease current');
  equal(h.pageState.renderedPageBoundaryLeases.get(2)?.boundaryWrapper, h.boundary.wrapper, 'same wrapper retained');
});

await fixture('section remount creates no duplicate markers', () => {
  const { h, core } = repairRetainedBoundary();
  h.remountBoundary();
  h.modelState.boundaryMounted = true;
  core.reconcile('section-remount');
  const dividers = h.document.querySelectorAll('.cgxui-chat-page-divider[data-page-num="2"]');
  const sentinels = h.document.querySelectorAll('[data-h2o-chat-page-boundary="page-2-start"]');
  equal(dividers.length, 1, 'one Page 2 divider');
  equal(sentinels.length, 1, 'one Page 2 start sentinel');
});

await fixture('boundary wrapper replacement invalidates support and prevents placement', () => {
  const h = createHarness();
  h.pageApi.get(2);
  h.unmountBoundary();
  let replacement = null;
  h.withMutations(() => {
    replacement = node('DIV', 'host-native-turn-slot', h.guard, { hostOwned: true });
    replacement.setAttribute('data-turn-id-container', Q26);
    h.flow.replaceChild(replacement, h.boundary.wrapper);
  });
  const capability = h.pageApi.get(2);
  equal(capability.supported, false, 'replacement invalidates lease');
  const result = h.coreApi.reconcile('wrapper-replaced');
  equal(result.pages[1].mode === 'rendered-boundary-authority', false, 'rendered placement not used');
});

await fixture('generation change prevents stale rendered placement', () => {
  const h = createHarness();
  h.pageApi.get(2);
  h.unmountBoundary();
  h.authorityState.status.generation = 2;
  h.authorityState.projection.routeGeneration = 2;
  h.authorityState.graphScope.generation = 2;
  const capability = h.pageApi.get(2);
  equal(capability.source === 'same-generation-captured-wrapper', false, 'old generation lease rejected');
});

await fixture('effective fingerprint change prevents stale rendered placement', () => {
  const h = createHarness();
  h.pageApi.get(2);
  h.unmountBoundary();
  h.authorityState.effectiveFingerprint = 'djb2:new-effective';
  const capability = h.pageApi.get(2);
  equal(capability.supported, false, 'stale effective scope rejected');
});

await fixture('graph fingerprint change prevents stale rendered placement', () => {
  const h = createHarness();
  h.pageApi.get(2);
  h.unmountBoundary();
  h.authorityState.graphScope.fingerprint = 'djb2:new-graph';
  const capability = h.pageApi.get(2);
  equal(capability.supported, false, 'stale graph lease rejected');
});

await fixture('route and chat changes prevent stale rendered placement', () => {
  const h = createHarness();
  h.pageApi.get(2);
  h.unmountBoundary();
  h.authorityState.status.routeKey = '/g/other/c/other';
  h.authorityState.status.chatId = 'other-chat';
  h.authorityState.projection.chatId = 'other-chat';
  h.authorityState.graphScope.routeKey = '/g/other/c/other';
  h.authorityState.graphScope.chatId = 'other-chat';
  equal(h.pageApi.get(2).supported, false, 'route/chat scope change rejected');
});

await fixture('branch transition prevents rendered-boundary placement', () => {
  const h = createHarness();
  h.pageApi.get(2);
  h.unmountBoundary();
  h.authorityState.projection.selectedPathConfirmationPending = true;
  equal(h.pageApi.get(2).supported, false, 'branch transition blocks capability');
});

await fixture('streaming boundary prevents rendered-boundary placement', () => {
  const h = createHarness();
  h.authorityState.records[25].livePendingStreaming = true;
  equal(h.pageApi.get(2).supported, false, 'streaming boundary unsupported');
});

await fixture('missing Stage 2A API preserves the existing fail-safe fallback', () => {
  const h = createHarness({ controllerAvailable: false });
  h.unmountBoundary();
  const result = h.coreApi.reconcile('missing-stage-2a');
  equal(result.pages[1].mode, 'earliest-exact-page-artifact', 'existing fallback used');
});

await fixture('storage cache preference canonical and alias writes remain zero', () => {
  const { h } = repairRetainedBoundary();
  equal(h.safety.storageWrites, 0, 'storage writes zero');
  equal(h.safety.cacheWrites, 0, 'cache writes zero');
  equal(h.safety.preferenceWrites, 0, 'preference writes zero');
  equal(h.safety.canonicalWrites, 0, 'canonical writes zero');
  equal(h.safety.aliasWrites, 0, 'alias writes zero');
});

await fixture('network requests remain zero', () => {
  const { h } = repairRetainedBoundary();
  equal(h.safety.networkCalls, 0, 'network calls zero');
});

await fixture('navigation and scrolling remain zero', () => {
  const { h } = repairRetainedBoundary();
  equal(h.safety.navigationCalls, 0, 'navigation calls zero');
  equal(h.safety.scrollCalls, 0, 'scroll calls zero');
});

await fixture('timers RAF intervals and observers remain zero', () => {
  const { h } = repairRetainedBoundary();
  equal(h.safety.timerCalls, 0, 'timer calls zero');
  equal(h.safety.rafCalls, 0, 'RAF calls zero');
  equal(h.safety.observerCalls, 0, 'observer calls zero');
});

await fixture('title-list state is not mutated', () => {
  const { h } = repairRetainedBoundary();
  equal(h.safety.titleListMutations, 0, 'title-list mutations zero');
  equal(CORE_SOURCE.includes('data-cgxui-chat-page-native-hidden'), false, 'core owns no native title-list marker');
});

await fixture('collapse state is not mutated', () => {
  const { h } = repairRetainedBoundary();
  equal(h.safety.collapseMutations, 0, 'collapse mutations zero');
});

await fixture('native visibility is not mutated', () => {
  const { h } = repairRetainedBoundary();
  equal(h.safety.nativeVisibilityMutations, 0, 'native visibility mutations zero');
  equal(h.safety.hostMutations, 0, 'host mutations zero');
});

const failed = fixtures.filter((entry) => !entry.ok);
for (const entry of fixtures) {
  if (entry.ok) console.log(`PASS ${entry.name}`);
  else console.error(`FAIL ${entry.name}\n${entry.error}`);
}
console.log(`Fixtures: ${fixtures.length - failed.length}/${fixtures.length}`);
console.log(`Assertions: ${assertionCount}`);
if (failed.length) process.exitCode = 1;
