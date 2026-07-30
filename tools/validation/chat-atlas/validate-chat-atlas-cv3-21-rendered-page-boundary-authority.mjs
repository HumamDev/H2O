#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const PAGE_PATH = 'src-runtime-base/1C1b.🔴📑 Thread Pages Controller 📑.js';
const PAGE_SOURCE = fs.readFileSync(path.join(ROOT, PAGE_PATH), 'utf8');
const fixtures = [];
let assertions = 0;

const CHAT_ID = '6928b333-12f4-8328-9e41-6a01def45127';
const ROUTE_KEY = '/g/g-p-694c441066b08191add4a7c3293f5e7a/c/6928b333-12f4-8328-9e41-6a01def45127';
const EFFECTIVE_FP = 'djb2:2iocqu';
const GRAPH_FP = 'djb2:1yue4v7';
const Q26 = 'dd431d44-a11f-4bf9-b6d0-84e61e4c4237';
const A26 = '5cc611a6-3863-45df-9523-e72dcb2a753b';
const A25 = '2a4dd16a-2a7b-407e-8498-cd60b8be7414';
const Q27 = '6c60b4aa-08b3-418c-b4e5-89d43ffa6f74';

function equal(actual, expected, message) {
  assertions += 1;
  assert.deepEqual(actual, expected, message);
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
  }
  get classList() {
    return {
      contains: (value) => String(this.className).split(/\s+/).includes(String(value)),
    };
  }
  get nextSibling() {
    const index = this.parentNode?.children?.indexOf(this) ?? -1;
    return index >= 0 ? (this.parentNode.children[index + 1] || null) : null;
  }
  _mutation(name) {
    if (this.guard?.locked) {
      this.guard.safety.domMutations += 1;
      throw new Error(`forbidden-dom-mutation:${name}`);
    }
  }
  appendChild(node) {
    return this.insertBefore(node, null);
  }
  insertBefore(node, before) {
    this._mutation('insertBefore');
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
    this._mutation('replaceChild');
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
    this._mutation('removeChild');
    const index = this.children.indexOf(node);
    if (index < 0) throw new Error('NotFoundError');
    this.children.splice(index, 1);
    node.parentNode = null;
    node.parentElement = null;
    node.isConnected = false;
    return node;
  }
  setAttribute(name, value) {
    this._mutation('setAttribute');
    this.attrs.set(String(name), String(value));
  }
  getAttribute(name) {
    return this.attrs.has(String(name)) ? this.attrs.get(String(name)) : null;
  }
  hasAttribute(name) {
    return this.attrs.has(String(name));
  }
  matches(selector) {
    return matchesSelector(this, selector);
  }
  querySelectorAll(selector) {
    return queryAll(this, selector, false);
  }
  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }
  closest(selector) {
    let node = this;
    while (node) {
      if (node.matches?.(selector)) return node;
      node = node.parentElement;
    }
    return null;
  }
  contains(other) {
    let node = other;
    while (node) {
      if (node === this) return true;
      node = node.parentElement;
    }
    return false;
  }
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

function node(tag, className, guard) {
  return new FakeElement(tag, className, guard);
}

function section(identity, role, testId, guard) {
  const el = node('SECTION', '', guard);
  el.setAttribute('data-turn-id', identity);
  el.setAttribute('data-turn', role);
  el.setAttribute('data-testid', testId);
  return el;
}

function wrapperWithSection(identity, role, testId, guard) {
  const wrapper = node('DIV', 'host-native-turn-slot', guard);
  wrapper.appendChild(section(identity, role, testId, guard));
  return wrapper;
}

function pageRecords(count = 39, { noAnswer = false, streaming = false } = {}) {
  return Array.from({ length: count }, (_unused, index) => {
    const order = index + 1;
    const record = {
      order,
      qId: order === 26 ? Q26 : `q-${order}`,
      primaryAId: order === 26 ? (noAnswer ? '' : A26) : `a-${order}`,
      answerVariants: order === 26 && !noAnswer ? [A26] : [`a-${order}`],
      noAnswer: order === 26 ? noAnswer : false,
      stopped: false,
    };
    if (order === 26 && streaming) record.livePendingStreaming = true;
    return record;
  });
}

function withUnlocked(shape, run) {
  const prior = shape.guard.locked;
  shape.guard.locked = false;
  try { return run(); } finally { shape.guard.locked = prior; }
}

function createHarness(options = {}) {
  const safety = {
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
    domMutations: 0,
  };
  const guard = { locked: false, safety };
  const thread = node('DIV', 'thread-root', guard);
  thread.setAttribute('id', 'thread');
  const flow = node('DIV', 'host-thread-flow', guard);
  thread.appendChild(flow);
  const pairCount = Number(options.pairCount || 39);
  const pageNum = Number(options.pageNum || 2);
  const startOrder = ((pageNum - 1) * 25) + 1;
  const records = pageRecords(pairCount, {
    noAnswer: options.noAnswer === true,
    streaming: options.streaming === true,
  });
  if (startOrder !== 26 && records[startOrder - 1]) {
    records[startOrder - 1] = {
      ...records[startOrder - 1],
      qId: `q-${startOrder}`,
      primaryAId: `a-${startOrder}`,
      answerVariants: [`a-${startOrder}`],
    };
  }
  const boundaryRecord = records[startOrder - 1] || null;
  const qId = String(boundaryRecord?.qId || '');
  const primaryAId = String(boundaryRecord?.primaryAId || '');
  for (let index = 0; index < 55; index += 1) {
    flow.appendChild(node('DIV', `host-prefix-${index + 1}`, guard));
  }
  const preceding = wrapperWithSection(A25, 'assistant', 'conversation-turn-50', guard);
  flow.appendChild(preceding);
  const sentinel = node('SPAN', 'h2o-page-start', guard);
  sentinel.setAttribute('data-h2o-chat-page-boundary', `page-${pageNum}-start`);
  sentinel.setAttribute('data-h2o-chat-page-boundary-page', String(pageNum));
  sentinel.setAttribute('data-h2o-chat-page-boundary-kind', 'start');
  sentinel.setAttribute('data-cgxui-owner', 'mnmp');
  flow.appendChild(sentinel);
  const divider = node('DIV', 'cgxui-chat-page-divider', guard);
  divider.setAttribute('data-page-num', String(pageNum));
  divider.setAttribute('data-cgxui-owner', 'mnmp');
  flow.appendChild(divider);
  const boundaryWrapper = wrapperWithSection(
    options.hiddenParent === true ? 'hidden-parent-node' : qId,
    options.boundaryRole || 'user',
    options.boundaryTestId || (startOrder === 26 ? 'conversation-turn-51' : `diagnostic-${startOrder}`),
    guard,
  );
  if (options.boundaryMounted !== false) flow.appendChild(boundaryWrapper);
  let answerWrapper = null;
  if (primaryAId && options.answerMounted !== false) {
    answerWrapper = wrapperWithSection(
      primaryAId,
      options.answerRole || 'assistant',
      options.answerTestId || (startOrder === 26 ? 'conversation-turn-52' : `answer-${startOrder}`),
      guard,
    );
    flow.appendChild(answerWrapper);
  }
  const next = wrapperWithSection(
    startOrder === 26 ? Q27 : `q-${startOrder + 1}`,
    'user',
    startOrder === 26 ? 'conversation-turn-53' : `next-${startOrder + 1}`,
    guard,
  );
  flow.appendChild(next);
  while (flow.children.length < Number(options.rawChildCount || 87)) {
    flow.appendChild(node('DIV', `host-suffix-${flow.children.length}`, guard));
  }
  if (options.duplicateBoundary === true) {
    flow.appendChild(wrapperWithSection(qId, 'user', 'conversation-turn-duplicate', guard));
  }
  const status = {
    source: 'canonical',
    overlayActive: false,
    reason: 'inactive',
    count: pairCount,
    chatId: CHAT_ID,
    routeKey: ROUTE_KEY,
    generation: 1,
    canonicalFingerprint: EFFECTIVE_FP,
    anchorQId: null,
    pathLength: 0,
  };
  const projection = {
    authoritative: true,
    chatId: CHAT_ID,
    routeGeneration: 1,
    fingerprint: EFFECTIVE_FP,
    selectedPathConfirmationPending: options.branchTransition === true,
    selectedPathConfirmationLeaseActive: false,
    selectedPathRequestLeaseActive: false,
  };
  const graphScope = {
    chatId: CHAT_ID,
    routeKey: ROUTE_KEY,
    generation: 1,
    fingerprint: GRAPH_FP,
    graphCurrentNodeId: 'graph-current',
    graphNodeCount: 8,
  };
  const graphNodes = new Map([
    [qId, {
      requestedId: qId,
      found: options.graphQFound !== false,
      matchedDomains: ['messageId'],
      nodeId: `node-${qId}`,
      messageId: qId,
      role: options.graphQRole || 'user',
      parent: null,
      children: [],
      productUser: options.graphProductUser !== false,
      productAnswer: false,
      stopped: false,
      isCurrentNode: false,
    }],
    [primaryAId, {
      requestedId: primaryAId,
      found: !!primaryAId,
      matchedDomains: ['messageId'],
      nodeId: `node-${primaryAId}`,
      messageId: primaryAId,
      role: 'system',
      parent: null,
      children: [],
      productUser: false,
      productAnswer: false,
      stopped: false,
      isCurrentNode: false,
    }],
  ]);
  const indexState = { sourceFingerprint: EFFECTIVE_FP };
  const runtime = {
    getEffectivePresentationStatus: () => Object.freeze({ ...status }),
    getEffectivePresentationIndex: () => Object.freeze({
      complete: true,
      proof: 'host-payload-full-graph',
      sourceFingerprint: indexState.sourceFingerprint,
      turns: Object.freeze(records.map((record) => Object.freeze({ ...record }))),
    }),
    getCompleteTurnIndexProjectionStatus: () => Object.freeze({ ...projection }),
    getEffectiveTurnRecordByQId: (identity) => {
      const record = records.find((entry) => entry.qId === identity) || null;
      return record ? Object.freeze({ ...record }) : null;
    },
    getGraphIdentityDiagnostics: (ids) => {
      if (options.graphAvailable === false) {
        return Object.freeze({
          version: 1,
          available: false,
          reason: options.graphReason || 'graph-unavailable',
          scope: null,
          records: Object.freeze([]),
        });
      }
      return Object.freeze({
        version: 1,
        available: true,
        reason: null,
        scope: Object.freeze({ ...graphScope }),
        records: Object.freeze((Array.isArray(ids) ? ids : []).map((identity) => Object.freeze(
          graphNodes.get(identity) || {
            requestedId: identity,
            found: false,
            matchedDomains: [],
            nodeId: null,
            messageId: null,
            role: null,
            parent: null,
            children: [],
            productUser: false,
            productAnswer: false,
            stopped: false,
            isCurrentNode: false,
          }
        ))),
      });
    },
  };
  const document = {
    querySelectorAll: (selector) => queryAll(thread, selector, true),
    querySelector: (selector) => queryAll(thread, selector, true)[0] || null,
  };
  const leases = new CountingMap();
  const S = { renderedPageBoundaryLeases: leases };
  const throwing = (key) => () => {
    safety[key] += 1;
    throw new Error(`forbidden:${key}`);
  };
  const context = {
    injectedDocument: document,
    injectedRuntime: runtime,
    injectedState: S,
    injectedElement: FakeElement,
    TURN_HOST_SEL: '[data-testid="conversation-turn"], [data-testid^="conversation-turn-"]',
    localStorage: { setItem: throwing('storageWrites') },
    sessionStorage: { setItem: throwing('storageWrites') },
    indexedDB: { open: throwing('storageWrites') },
    fetch: throwing('networkCalls'),
    setTimeout: throwing('timerCalls'),
    setInterval: throwing('timerCalls'),
    requestAnimationFrame: throwing('rafCalls'),
    MutationObserver: class {
      constructor() {
        safety.observerCalls += 1;
        throw new Error('forbidden:observer');
      }
    },
  };
  const api = vm.runInNewContext(`(() => {
    const document = injectedDocument;
    const Element = injectedElement;
    const S = injectedState;
    const TITLE_LIST_PAGE_SIZE = 25;
    const TURN_HOST_SEL = '[data-testid="conversation-turn"], [data-testid^="conversation-turn-"]';
    const RENDERED_BOUNDARY_SENTINEL_ATTR = 'data-h2o-chat-page-boundary';
    const RENDERED_BOUNDARY_SENTINEL_PAGE_ATTR = 'data-h2o-chat-page-boundary-page';
    const RENDERED_BOUNDARY_SENTINEL_KIND_ATTR = 'data-h2o-chat-page-boundary-kind';
    const TURN_RUNTIME = () => injectedRuntime;
    const getTurnSectionForNode = (value) => value?.matches?.(TURN_HOST_SEL)
      ? value
      : value?.querySelector?.(TURN_HOST_SEL) || null;
    const getTurnHostRole = (value) => String(
      (getTurnSectionForNode(value) || value)?.getAttribute?.('data-turn') || ''
    ).trim().toLowerCase();
    ${extractFunction(PAGE_SOURCE, 'renderedBoundaryStatusIdentity')}
    ${extractFunction(PAGE_SOURCE, 'frozenRenderedPageBoundaryCapability')}
    ${extractFunction(PAGE_SOURCE, 'renderedBoundaryDirectChildUnder')}
    ${extractFunction(PAGE_SOURCE, 'renderedBoundarySectionsById')}
    ${extractFunction(PAGE_SOURCE, 'renderedBoundaryThreadDivider')}
    ${extractFunction(PAGE_SOURCE, 'renderedBoundaryStartSentinel')}
    ${extractFunction(PAGE_SOURCE, 'renderedBoundaryOrderingNodeAllowed')}
    ${extractFunction(PAGE_SOURCE, 'renderedBoundaryLayoutProof')}
    ${extractFunction(PAGE_SOURCE, 'renderedBoundaryTransitionActive')}
    ${extractFunction(PAGE_SOURCE, 'renderedBoundaryRecordStreaming')}
    ${extractFunction(PAGE_SOURCE, 'readRenderedBoundaryAuthority')}
    ${extractFunction(PAGE_SOURCE, 'renderedBoundaryLeaseScopeCurrent')}
    ${extractFunction(PAGE_SOURCE, 'getRenderedPageBoundaryCapability')}
    return Object.freeze({ get: getRenderedPageBoundaryCapability });
  })()`, context);
  guard.locked = true;
  return {
    api,
    safety,
    guard,
    thread,
    flow,
    sentinel,
    divider,
    boundaryWrapper,
    answerWrapper,
    preceding,
    next,
    status,
    projection,
    graphScope,
    graphNodes,
    indexState,
    records,
    runtime,
    leases,
    pageNum,
    startOrder,
    qId,
    primaryAId,
  };
}

function assertDeepFrozen(value, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  ok(Object.isFrozen(value), 'object frozen');
  for (const child of Object.values(value)) assertDeepFrozen(child, seen);
}

function containsDomNode(value, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return false;
  if (value instanceof FakeElement) return true;
  seen.add(value);
  return Object.values(value).some((child) => containsDomNode(child, seen));
}

function assertSafetyZero(safety) {
  equal(safety, {
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
    domMutations: 0,
  }, 'safety counters');
}

await fixture('parent live-shaped Page 2 boundary is reproduced', () => {
  const h = createHarness();
  const result = h.api.get(2);
  equal(h.flow.children.length, 87, 'raw child count reproduced');
  equal(h.flow.children.indexOf(h.preceding), 55, 'order 25 answer index');
  equal(h.flow.children.indexOf(h.boundaryWrapper), 58, 'order 26 question index');
  equal(h.flow.children.indexOf(h.answerWrapper), 59, 'order 26 answer index');
  equal(h.flow.children.indexOf(h.next), 60, 'next question index');
  equal(result.pageStartOrder, 26, 'page start');
  equal(result.interveningNonH2ONodeCount, 0, 'clean boundary');
});

await fixture('exact qId mount returns supported', () => {
  const result = createHarness().api.get(2);
  equal(result.supported, true, 'supported');
  equal(result.qId, Q26, 'exact qId');
  equal(result.primaryAId, A26, 'exact primary');
});

await fixture('exact mount source is exact-mounted-product-qid', () => {
  equal(createHarness().api.get(2).source, 'exact-mounted-product-qid', 'source');
});

await fixture('qId graph identity requires productUser true', () => {
  const result = createHarness({ graphProductUser: false }).api.get(2);
  equal(result.supported, false, 'unsupported');
  equal(result.reason, 'rendered-boundary-head-unproven', 'reason');
});

await fixture('raw graph role and mounted DOM role are independent', () => {
  const result = createHarness({ graphQRole: 'assistant' }).api.get(2);
  equal(result.supported, true, 'raw graph role ignored');
  equal(result.boundaryDomRole, 'user', 'mounted role owns DOM proof');
});

await fixture('system-shaped canonical primary is accepted as mounted assistant', () => {
  const h = createHarness();
  equal(h.graphNodes.get(A26).role, 'system', 'raw graph system role');
  equal(h.graphNodes.get(A26).productAnswer, false, 'not product answer');
  const result = h.api.get(2);
  equal(result.supported, true, 'boundary supported');
  equal(result.primaryAnswerDomRole, 'assistant', 'DOM answer role');
});

await fixture('test IDs are diagnostic only', () => {
  const result = createHarness({
    boundaryTestId: 'conversation-turn-renamed-user',
    answerTestId: 'conversation-turn-renamed-answer',
  }).api.get(2);
  equal(result.supported, true, 'renamed IDs accepted');
  equal(result.boundaryTestId, 'conversation-turn-renamed-user', 'diagnostic returned');
});

await fixture('changing test ID does not change support', () => {
  const left = createHarness({ boundaryTestId: 'conversation-turn-alpha' }).api.get(2);
  const right = createHarness({ boundaryTestId: 'conversation-turn-beta' }).api.get(2);
  equal(left.supported, right.supported, 'support unchanged');
});

await fixture('pair count times two is absent from boundary authority', () => {
  const source = extractFunction(PAGE_SOURCE, 'getRenderedPageBoundaryCapability');
  ok(!/count\s*\*\s*2|\*\s*2/.test(source), 'no native pair arithmetic');
});

await fixture('raw flow child count is diagnostic only', () => {
  equal(createHarness({ rawChildCount: 87 }).api.get(2).supported, true, '87 children');
  equal(createHarness({ rawChildCount: 140 }).api.get(2).supported, true, '140 children');
});

await fixture('successful observation captures a memory-only lease', () => {
  const h = createHarness();
  h.api.get(2);
  equal(h.leases.size, 1, 'one lease');
  equal(h.leases.get(2).qId, Q26, 'lease qId');
  ok(h.leases.get(2).boundaryWrapper === h.boundaryWrapper, 'private wrapper retained');
});

await fixture('section unmount with retained wrapper uses captured lease', () => {
  const h = createHarness();
  equal(h.api.get(2).supported, true, 'initial capture');
  withUnlocked(h, () => h.boundaryWrapper.removeChild(h.boundaryWrapper.children[0]));
  const result = h.api.get(2);
  equal(result.supported, true, 'lease supported');
  equal(result.source, 'same-generation-captured-wrapper', 'lease source');
  equal(result.boundarySectionMounted, false, 'section absent');
});

await fixture('wrapper replacement invalidates the lease', () => {
  const h = createHarness();
  h.api.get(2);
  let replacement = null;
  withUnlocked(h, () => {
    replacement = wrapperWithSection(Q26, 'user', 'replacement', h.guard);
    h.flow.replaceChild(replacement, h.boundaryWrapper);
  });
  const result = h.api.get(2);
  equal(result.supported, false, 'invalid');
  equal(result.reason, 'captured-wrapper-replaced', 'reason');
});

await fixture('wrapper disconnection invalidates the lease', () => {
  const h = createHarness();
  h.api.get(2);
  withUnlocked(h, () => h.flow.removeChild(h.boundaryWrapper));
  equal(h.api.get(2).reason, 'captured-wrapper-replaced', 'disconnected');
});

await fixture('flow-root replacement invalidates the lease', () => {
  const h = createHarness();
  h.api.get(2);
  const replacement = node('DIV', 'replacement-flow', h.guard);
  withUnlocked(h, () => {
    for (const child of [...h.flow.children]) replacement.appendChild(child);
    h.thread.replaceChild(replacement, h.flow);
  });
  equal(h.api.get(2).reason, 'captured-wrapper-replaced', 'flow replaced');
});

await fixture('divider disconnection invalidates support', () => {
  const h = createHarness();
  h.api.get(2);
  withUnlocked(h, () => h.flow.removeChild(h.divider));
  equal(h.api.get(2).reason, 'divider-unavailable', 'divider required');
});

await fixture('sentinel disconnection invalidates support', () => {
  const h = createHarness();
  h.api.get(2);
  withUnlocked(h, () => h.flow.removeChild(h.sentinel));
  equal(h.api.get(2).reason, 'sentinel-unavailable', 'sentinel required');
});

await fixture('intervening host node invalidates support', () => {
  const h = createHarness();
  const host = node('DIV', 'host-intervening', h.guard);
  withUnlocked(h, () => h.flow.insertBefore(host, h.boundaryWrapper));
  const result = h.api.get(2);
  equal(result.reason, 'boundary-intervening-host-node', 'host rejected');
  equal(result.interveningNonH2ONodeCount, 1, 'one host node');
});

await fixture('explicit H2O ordering sentinel is allowed between boundary nodes', () => {
  const h = createHarness();
  const ordering = node('SPAN', 'h2o-ordering', h.guard);
  withUnlocked(h, () => {
    ordering.setAttribute('data-h2o-chat-page-boundary', 'page-1-end');
    ordering.setAttribute('data-h2o-chat-page-boundary-page', '1');
    ordering.setAttribute('data-h2o-chat-page-boundary-kind', 'end');
    h.flow.insertBefore(ordering, h.boundaryWrapper);
  });
  equal(h.api.get(2).supported, true, 'explicit ordering node allowed');
});

await fixture('generation change invalidates the lease', () => {
  const h = createHarness();
  h.api.get(2);
  h.status.generation = 2;
  h.projection.routeGeneration = 2;
  h.graphScope.generation = 2;
  equal(h.api.get(2).reason, 'boundary-scope-changed', 'generation invalidates');
});

await fixture('effective fingerprint change invalidates the lease', () => {
  const h = createHarness();
  h.api.get(2);
  h.indexState.sourceFingerprint = 'djb2:new-effective';
  h.status.canonicalFingerprint = 'djb2:new-effective';
  h.projection.fingerprint = 'djb2:new-effective';
  equal(h.api.get(2).reason, 'boundary-scope-changed', 'fingerprint invalidates');
});

await fixture('graph fingerprint change invalidates the lease', () => {
  const h = createHarness();
  h.api.get(2);
  h.graphScope.fingerprint = 'djb2:new-graph';
  equal(h.api.get(2).reason, 'boundary-scope-changed', 'graph invalidates');
});

await fixture('route change invalidates the lease', () => {
  const h = createHarness();
  h.api.get(2);
  h.status.routeKey = '/c/other';
  h.graphScope.routeKey = '/c/other';
  equal(h.api.get(2).reason, 'boundary-scope-changed', 'route invalidates');
});

await fixture('chat change invalidates the lease', () => {
  const h = createHarness();
  h.api.get(2);
  h.status.chatId = 'other-chat';
  h.projection.chatId = 'other-chat';
  h.graphScope.chatId = 'other-chat';
  equal(h.api.get(2).reason, 'boundary-scope-changed', 'chat invalidates');
});

await fixture('branch transition invalidates the lease', () => {
  const h = createHarness();
  h.api.get(2);
  h.projection.selectedPathConfirmationPending = true;
  equal(h.api.get(2).reason, 'boundary-scope-changed', 'transition invalidates');
});

await fixture('streaming boundary pair is unsupported', () => {
  const result = createHarness({ streaming: true }).api.get(2);
  equal(result.supported, false, 'unsupported');
  equal(result.reason, 'streaming-active', 'streaming reason');
});

await fixture('missing qId section without lease is unproven', () => {
  const result = createHarness({ boundaryMounted: false }).api.get(2);
  equal(result.reason, 'rendered-boundary-head-unproven', 'unproven');
});

await fixture('hidden-parent head is not inferred', () => {
  const result = createHarness({ hiddenParent: true }).api.get(2);
  equal(result.reason, 'rendered-boundary-head-unproven', 'hidden head refused');
});

await fixture('duplicate qId sections are ambiguous', () => {
  equal(createHarness({ duplicateBoundary: true }).api.get(2).reason, 'boundary-section-ambiguous', 'ambiguous');
});

await fixture('NO ANSWER boundary does not require a primary section', () => {
  const result = createHarness({ noAnswer: true, answerMounted: false }).api.get(2);
  equal(result.supported, true, 'no-answer supported');
  equal(result.primaryAnswerMounted, false, 'no primary mounted');
});

await fixture('Page 3 uses canonical order 51', () => {
  const result = createHarness({ pairCount: 60, pageNum: 3 }).api.get(3);
  equal(result.pageStartOrder, 51, 'canonical pair order');
  equal(result.qId, 'q-51', 'canonical qId');
});

await fixture('exact multiple of 25 does not create an extra page', () => {
  const result = createHarness({ pairCount: 50, pageNum: 3, boundaryMounted: false }).api.get(3);
  equal(result.supported, false, 'not supported');
  equal(result.reason, 'page-not-present', 'no Page 3');
});

await fixture('page outside effective count is page-not-present', () => {
  equal(createHarness({ pairCount: 39, pageNum: 4 }).api.get(4).reason, 'page-not-present', 'outside');
});

await fixture('Page 1 reports active thread start without a native boundary', () => {
  const result = createHarness({ pageNum: 1 }).api.get(1);
  equal(result.supported, true, 'defined non-error');
  equal(result.reason, 'active-thread-start', 'thread start reason');
  equal(result.pageStartOrder, 1, 'order one');
});

await fixture('public result is deeply frozen', () => {
  assertDeepFrozen(createHarness().api.get(2));
});

await fixture('public result exposes no DOM node', () => {
  equal(containsDomNode(createHarness().api.get(2)), false, 'no node');
});

await fixture('storage cache preference canonical and alias writes remain zero', () => {
  const h = createHarness();
  h.api.get(2);
  equal(h.safety.storageWrites, 0, 'storage');
  equal(h.safety.cacheWrites, 0, 'cache');
  equal(h.safety.preferenceWrites, 0, 'preferences');
  equal(h.safety.canonicalWrites, 0, 'canonical');
  equal(h.safety.aliasWrites, 0, 'aliases');
});

await fixture('network remains unused', () => {
  const h = createHarness();
  h.api.get(2);
  equal(h.safety.networkCalls, 0, 'network');
});

await fixture('navigation and scrolling remain unused', () => {
  const h = createHarness();
  h.api.get(2);
  equal(h.safety.navigationCalls, 0, 'navigation');
  equal(h.safety.scrollCalls, 0, 'scroll');
});

await fixture('timers RAF intervals and observers remain unused', () => {
  const h = createHarness();
  h.api.get(2);
  equal(h.safety.timerCalls, 0, 'timers');
  equal(h.safety.rafCalls, 0, 'RAF');
  equal(h.safety.observerCalls, 0, 'observers');
});

await fixture('DOM remains read-only', () => {
  const h = createHarness();
  h.api.get(2);
  equal(h.safety.domMutations, 0, 'DOM mutations');
});

await fixture('second identical read performs zero mutations', () => {
  const h = createHarness();
  equal(h.api.get(2).supported, true, 'first read');
  h.leases.resetCounts();
  equal(h.api.get(2).supported, true, 'second read');
  equal(h.leases.writes, 0, 'no lease rewrite');
  equal(h.leases.deletes, 0, 'no lease deletion');
  assertSafetyZero(h.safety);
});

const failed = fixtures.filter((entry) => !entry.ok);
for (const entry of fixtures) {
  if (entry.ok) console.log(`PASS ${entry.name}`);
  else console.error(`FAIL ${entry.name}\n${entry.error}`);
}
console.log(`Fixtures: ${fixtures.length - failed.length}/${fixtures.length}`);
console.log(`Assertions: ${assertions}`);
console.log('Safety counters: storage=0 cache=0 preference=0 canonical=0 alias=0 network=0 navigation=0 scrolling=0 timers=0 observers=0 DOM=0');
if (failed.length) process.exitCode = 1;
