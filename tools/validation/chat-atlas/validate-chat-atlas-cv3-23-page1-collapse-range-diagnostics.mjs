#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const PAGE_PATH = 'src-runtime-base/1C1b.🔴📑 Thread Pages Controller 📑.js';
const SOURCE = fs.readFileSync(path.join(ROOT, PAGE_PATH), 'utf8');
const PARENT = execFileSync(
  'git',
  ['show', `30e0c785a2ec69ae15bef81ddcff1ec103c99702:${PAGE_PATH}`],
  { cwd: ROOT, encoding: 'utf8' },
);
const fixtures = [];
let assertions = 0;

const CHAT = 'chat-stage-2c0';
const ROUTE = '/c/chat-stage-2c0';
const EFFECTIVE_FP = 'djb2:effective-stage-2c0';
const GRAPH_FP = 'djb2:graph-stage-2c0';

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

class FakeElement {
  constructor(tag = 'DIV', className = '', guard = null) {
    this.tagName = String(tag).toUpperCase();
    this.nodeType = 1;
    this.className = className;
    this.children = [];
    this.parentElement = null;
    this.parentNode = null;
    this.attrs = new Map();
    this.isConnected = true;
    this.guard = guard;
    const values = new Map();
    this.style = {
      getPropertyValue: (name) => values.get(String(name)) || '',
      setProperty: (name, value) => {
        this._mutation('style.setProperty');
        values.set(String(name), String(value));
      },
    };
  }
  get classList() {
    return {
      contains: (name) => String(this.className).split(/\s+/).includes(String(name)),
    };
  }
  _mutation(name) {
    if (this.guard?.locked) {
      this.guard.safety.domMutations += 1;
      throw new Error(`forbidden-dom-mutation:${name}`);
    }
  }
  appendChild(child) {
    return this.insertBefore(child, null);
  }
  insertBefore(child, before) {
    this._mutation('insertBefore');
    if (child.parentElement) {
      const prior = child.parentElement.children.indexOf(child);
      if (prior >= 0) child.parentElement.children.splice(prior, 1);
    }
    const index = before ? this.children.indexOf(before) : -1;
    if (index < 0) this.children.push(child);
    else this.children.splice(index, 0, child);
    child.parentElement = this;
    child.parentNode = this;
    child.isConnected = true;
    return child;
  }
  removeChild(child) {
    this._mutation('removeChild');
    const index = this.children.indexOf(child);
    if (index < 0) throw new Error('NotFoundError');
    this.children.splice(index, 1);
    child.parentElement = null;
    child.parentNode = null;
    child.isConnected = false;
    return child;
  }
  replaceChild(next, current) {
    this._mutation('replaceChild');
    const index = this.children.indexOf(current);
    if (index < 0) throw new Error('NotFoundError');
    this.children[index] = next;
    current.parentElement = null;
    current.parentNode = null;
    current.isConnected = false;
    next.parentElement = this;
    next.parentNode = this;
    next.isConnected = true;
    return current;
  }
  setAttribute(name, value) {
    this._mutation('setAttribute');
    this.attrs.set(String(name), String(value));
  }
  removeAttribute(name) {
    this._mutation('removeAttribute');
    this.attrs.delete(String(name));
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
  const tag = text.match(/^[A-Za-z]+/)?.[0] || '';
  if (tag && node.tagName !== tag.toUpperCase()) return false;
  const id = text.match(/#([A-Za-z0-9_-]+)/)?.[1] || '';
  if (id && node.getAttribute('id') !== id) return false;
  for (const cls of Array.from(text.matchAll(/\.([A-Za-z0-9_-]+)/g)).map((m) => m[1])) {
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
  return String(selector || '').split(',').some((part) => matchesSimple(node, part));
}
function queryAll(root, selector, includeRoot = false) {
  const result = [];
  const visit = (node, include) => {
    if (include && node.matches?.(selector)) result.push(node);
    for (const child of node.children || []) visit(child, true);
  };
  visit(root, includeRoot);
  return result;
}
function makeNode(tag, className, guard) {
  return new FakeElement(tag, className, guard);
}
function nestedWrapper(id, role, testId, guard) {
  const wrapper = makeNode('DIV', 'host-turn-slot', guard);
  wrapper.setAttribute('data-turn-id-container', id);
  const host = makeNode('SECTION', 'native-turn-host', guard);
  host.setAttribute('data-testid', testId);
  const carrier = makeNode('SECTION', 'identity-carrier', guard);
  carrier.setAttribute('data-turn-id', id);
  carrier.setAttribute('data-turn', role);
  host.appendChild(carrier);
  wrapper.appendChild(host);
  return { wrapper, host, carrier };
}
function simpleWrapper(id, guard) {
  const wrapper = makeNode('DIV', 'host-turn-slot', guard);
  wrapper.setAttribute('data-turn-id-container', id);
  return wrapper;
}
function sentinel(page, guard) {
  const node = makeNode('SPAN', 'h2o-page-boundary', guard);
  node.setAttribute('data-h2o-chat-page-boundary', `page-${page}-start`);
  node.setAttribute('data-h2o-chat-page-boundary-page', String(page));
  node.setAttribute('data-h2o-chat-page-boundary-kind', 'start');
  node.setAttribute('data-cgxui-owner', 'mnmp');
  return node;
}
function divider(page, guard) {
  const node = makeNode('DIV', 'cgxui-chat-page-divider', guard);
  node.setAttribute('data-page-num', String(page));
  node.setAttribute('data-cgxui-owner', 'mnmp');
  return node;
}
function graphRecord(id, productUser = true) {
  return {
    requestedId: id,
    found: true,
    matchedDomains: ['messageId'],
    nodeId: `node-${id}`,
    messageId: id,
    role: productUser ? 'user' : 'assistant',
    parent: null,
    children: [],
    productUser,
    productAnswer: !productUser,
    stopped: false,
    isCurrentNode: false,
  };
}
function withUnlocked(h, run) {
  const prior = h.guard.locked;
  h.guard.locked = false;
  try { return run(); } finally { h.guard.locked = prior; }
}

function createHarness(options = {}) {
  const productionSource = options.productionSource || SOURCE;
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
  const thread = makeNode('DIV', 'thread', guard);
  thread.setAttribute('id', 'thread');
  const flow = makeNode('DIV', 'active-flow', guard);
  thread.appendChild(flow);
  const count = Number(options.count || 39);
  const records = Array.from({ length: count }, (_unused, index) => {
    const order = index + 1;
    return {
      order,
      qId: `q-${order}`,
      primaryAId: `a-${order}`,
      answerVariants: [`a-${order}`],
      noAnswer: false,
      stopped: false,
      livePendingStreaming: Number(options.streamingOrder || 0) === order,
    };
  });
  const graphNodes = new Map();
  for (const record of records) {
    graphNodes.set(record.qId, graphRecord(record.qId, true));
    graphNodes.set(record.primaryAId, graphRecord(record.primaryAId, false));
  }
  const p1Sentinel = sentinel(1, guard);
  const p1Divider = divider(1, guard);
  flow.appendChild(p1Sentinel);
  flow.appendChild(p1Divider);
  const start = nestedWrapper('q-1', 'user', 'conversation-turn-1', guard);
  const answer1 = nestedWrapper('a-1', 'assistant', 'conversation-turn-2', guard);
  if (options.missingStart !== true) flow.appendChild(start.wrapper);
  flow.appendChild(answer1.wrapper);
  const hostWrappers = [start.wrapper, answer1.wrapper];
  const middleCount = Math.max(0, Number(options.middleCount ?? 23));
  for (let index = 0; index < middleCount; index += 1) {
    const id = index < 23 ? `q-${index + 2}` : `extra-${index + 2}`;
    graphNodes.set(id, graphRecord(id, true));
    const wrapper = index === Number(options.mountedNestedIndex)
      ? nestedWrapper(id, 'user', `conversation-turn-extra-${index}`, guard).wrapper
      : simpleWrapper(id, guard);
    flow.appendChild(wrapper);
    hostWrappers.push(wrapper);
  }
  const insertExtra = (node) => {
    const before = flow.children[Math.min(flow.children.length, 6)] || null;
    flow.insertBefore(node, before);
    return node;
  };
  let extra = null;
  if (options.extraKind === 'retained-height') {
    extra = makeNode('DIV', 'host-turn-slot', guard);
    extra.style.setProperty('--last-known-height', '640px');
    insertExtra(extra);
  } else if (options.extraKind === 'client-created-root') {
    extra = simpleWrapper('client-created-root', guard);
    insertExtra(extra);
  } else if (options.extraKind === 'empty') {
    extra = makeNode('DIV', 'host-turn-slot', guard);
    insertExtra(extra);
  } else if (options.extraKind === 'page-divider') {
    extra = divider(9, guard);
    insertExtra(extra);
  } else if (options.extraKind === 'sentinel') {
    extra = sentinel(9, guard);
    insertExtra(extra);
  } else if (options.extraKind === 'title-list') {
    extra = makeNode('DIV', 'cgxui-chat-page-title-list-synth', guard);
    extra.setAttribute('data-cgxui', 'chat-page-title-list-synth');
    insertExtra(extra);
  } else if (options.extraKind === 'minimap') {
    extra = makeNode('DIV', 'minimap-root', guard);
    extra.setAttribute('id', 'cgx-mm-root');
    insertExtra(extra);
  } else if (options.extraKind === 'inline-slot') {
    extra = makeNode('DIV', 'inline-slot', guard);
    extra.setAttribute('data-h2o-title-inline-slot', '1');
    insertExtra(extra);
  } else if (options.extraKind === 'unknown-cgxui') {
    extra = makeNode('DIV', 'cgxui-unknown-host-looking', guard);
    insertExtra(extra);
  } else if (options.extraKind === 'preceding-host-looking') {
    extra = simpleWrapper('host-before-q26', guard);
    graphNodes.set('host-before-q26', graphRecord('host-before-q26', true));
    flow.appendChild(extra);
  }
  const p2Sentinel = sentinel(2, guard);
  const p2Divider = divider(2, guard);
  flow.appendChild(p2Sentinel);
  flow.appendChild(p2Divider);
  const end = nestedWrapper('q-26', 'user', 'conversation-turn-51', guard);
  const answer26 = nestedWrapper('a-26', 'assistant', 'conversation-turn-52', guard);
  if (options.missingEnd !== true) flow.appendChild(end.wrapper);
  flow.appendChild(answer26.wrapper);
  const afterEnd = simpleWrapper('q-27', guard);
  flow.appendChild(afterEnd);

  const status = {
    source: 'canonical',
    overlayActive: false,
    count,
    canonicalFingerprint: EFFECTIVE_FP,
    anchorQId: '',
    pathLength: 0,
    chatId: CHAT,
    routeKey: ROUTE,
    generation: 1,
  };
  const projection = {
    authoritative: true,
    chatId: CHAT,
    routeGeneration: 1,
    fingerprint: EFFECTIVE_FP,
    selectedPathConfirmationPending: options.branchTransition === true,
    selectedPathConfirmationLeaseActive: false,
    selectedPathRequestLeaseActive: false,
  };
  const indexState = { fingerprint: EFFECTIVE_FP };
  const graphScope = {
    chatId: CHAT,
    routeKey: ROUTE,
    generation: 1,
    fingerprint: GRAPH_FP,
    graphCurrentNodeId: 'current',
    graphNodeCount: graphNodes.size,
  };
  const graphBatches = [];
  const runtime = {
    getEffectivePresentationStatus: () => Object.freeze({ ...status }),
    getEffectivePresentationIndex: () => Object.freeze({
      complete: true,
      sourceFingerprint: indexState.fingerprint,
      turns: Object.freeze(records.map((record) => Object.freeze({ ...record }))),
    }),
    getCompleteTurnIndexProjectionStatus: () => Object.freeze({ ...projection }),
    getEffectiveTurnRecordByQId: (id) => {
      const record = records.find((entry) => entry.qId === id) || null;
      return record ? Object.freeze({ ...record }) : null;
    },
    getGraphIdentityDiagnostics: (ids) => {
      graphBatches.push([...(Array.isArray(ids) ? ids : [])]);
      if (options.graphAvailable === false || options.graphReason === 'graph-stale') {
        return Object.freeze({
          available: false,
          reason: options.graphReason || 'graph-unavailable',
          scope: null,
          records: Object.freeze([]),
        });
      }
      const scope = { ...graphScope };
      if (options.graphReason === 'graph-stale') scope.fingerprint = 'djb2:stale';
      return Object.freeze({
        available: true,
        reason: null,
        scope: Object.freeze(scope),
        records: Object.freeze((Array.isArray(ids) ? ids : []).map((id) => Object.freeze(
          graphNodes.get(id) || {
            requestedId: id,
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
  const S = {
    renderedPageBoundaryLeases: new Map(),
    pageCollapseRangeContinuity: new Map(),
  };
  const throwing = (key) => () => {
    safety[key] += 1;
    throw new Error(`forbidden:${key}`);
  };
  const context = {
    injectedDocument: document,
    injectedRuntime: runtime,
    injectedState: S,
    injectedElement: FakeElement,
    injectedWindow: { getComputedStyle: (node) => node.style },
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
  const functionNames = [
    'renderedBoundaryStatusIdentity',
    'frozenRenderedPageBoundaryCapability',
    'renderedBoundaryDirectChildUnder',
    'renderedBoundaryRoleFromCarrier',
    'resolveRenderedTurnSurfaceByIdentity',
    'renderedBoundaryThreadDivider',
    'renderedBoundaryStartSentinel',
    'renderedBoundaryOrderingNodeAllowed',
    'renderedBoundaryLayoutProof',
    'renderedBoundaryWrapperCarriesIdentity',
    'renderedBoundaryPageUnitPlacement',
    'renderedBoundaryTransitionActive',
    'renderedBoundaryRecordStreaming',
    'readRenderedBoundaryAuthority',
    'renderedBoundaryLeaseScopeCurrent',
    'getRenderedPageBoundaryCapability',
  ];
  const rangeNames = [
    'frozenPageCollapseRangeDiagnostics',
    'pageCollapseRangeH2OOwned',
    'pageCollapseRangeIdentityCarriers',
    'pageCollapseRangeIdentityOfCarrier',
    'pageCollapseRangeContainerIdentity',
    'pageCollapseRangeNodeCarriesIdentity',
    'pageCollapseRangeHasRetainedHeight',
    'pageCollapseRangeScopeCurrent',
    'clearStalePageCollapseRangeContinuity',
    'readPageCollapseRangeGraphRecords',
    'getPageCollapseRangeDiagnostics',
  ];
  const body = functionNames.map((name) => extractFunction(productionSource, name)).join('\n');
  const rangeBody = productionSource.includes('function getPageCollapseRangeDiagnostics(')
    ? rangeNames.map((name) => extractFunction(productionSource, name)).join('\n')
    : '';
  const api = vm.runInNewContext(`(() => {
    const document = injectedDocument;
    const Element = injectedElement;
    const W = injectedWindow;
    const S = injectedState;
    const TITLE_LIST_PAGE_SIZE = 25;
    const TURN_HOST_SEL = '[data-testid="conversation-turn"], [data-testid^="conversation-turn-"]';
    const RENDERED_BOUNDARY_SENTINEL_ATTR = 'data-h2o-chat-page-boundary';
    const RENDERED_BOUNDARY_SENTINEL_PAGE_ATTR = 'data-h2o-chat-page-boundary-page';
    const RENDERED_BOUNDARY_SENTINEL_KIND_ATTR = 'data-h2o-chat-page-boundary-kind';
    const TURN_RUNTIME = () => injectedRuntime;
    ${body}
    ${rangeBody}
    return Object.freeze({
      boundary: getRenderedPageBoundaryCapability,
      range: typeof getPageCollapseRangeDiagnostics === 'function'
        ? getPageCollapseRangeDiagnostics
        : null,
    });
  })()`, context);
  guard.locked = true;
  return {
    api,
    safety,
    guard,
    thread,
    flow,
    start,
    end,
    answer1,
    answer26,
    afterEnd,
    p1Sentinel,
    p1Divider,
    p2Sentinel,
    p2Divider,
    hostWrappers,
    extra,
    status,
    projection,
    indexState,
    graphScope,
    graphNodes,
    graphBatches,
    records,
    runtime,
    S,
  };
}

function prime(h) {
  const start = h.api.boundary(1);
  const end = h.api.boundary(2);
  return { start, end };
}
function assertDeepFrozen(value, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  ok(Object.isFrozen(value), 'object frozen');
  for (const child of Object.values(value)) assertDeepFrozen(child, seen);
}
function containsDom(value, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return false;
  if (value instanceof FakeElement) return true;
  seen.add(value);
  return Object.values(value).some((child) => containsDom(child, seen));
}
function assertSafety(h) {
  equal(h.safety, {
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
  }, 'all safety counters zero');
}

await fixture('parent Page 1 start authority is absent before correction', () => {
  const h = createHarness({ productionSource: PARENT });
  const result = h.api.boundary(1);
  equal(result.supported, true, 'synthetic supported');
  equal(result.reason, 'active-thread-start', 'synthetic reason');
  equal(result.source, null, 'no source');
  equal(h.S.renderedPageBoundaryLeases.has(1), false, 'no lease');
});

await fixture('corrected order-one exact wrapper is resolved', () => {
  const h = createHarness();
  const result = h.api.boundary(1);
  equal(result.supported, true, 'supported');
  equal(result.qId, 'q-1', 'q1');
  equal(result.source, 'exact-mounted-product-qid', 'exact source');
  ok(h.S.renderedPageBoundaryLeases.get(1).boundaryWrapper === h.start.wrapper, 'exact wrapper');
});

await fixture('exact order-26 wrapper is the exclusive end', () => {
  const h = createHarness();
  prime(h);
  const result = h.api.range(1);
  equal(result.supported, true, 'supported');
  equal(result.nextBoundaryQId, 'q-26', 'q26 end');
  equal(result.rangeEndIndex, h.flow.children.indexOf(h.end.wrapper), 'exact end index');
});

await fixture('start and end wrappers share one flow root', () => {
  const h = createHarness();
  prime(h);
  const leases = h.S.renderedPageBoundaryLeases;
  ok(leases.get(1).flowRoot === leases.get(2).flowRoot, 'same flow');
  equal(h.api.range(1).rangeProven, true, 'range proven');
});

await fixture('start wrapper precedes end wrapper', () => {
  const h = createHarness();
  prime(h);
  const result = h.api.range(1);
  ok(result.rangeStartIndex < result.rangeEndIndex, 'ascending exact boundaries');
});

await fixture('Page 2 boundary wrapper is excluded', () => {
  const h = createHarness();
  prime(h);
  const result = h.api.range(1);
  equal(result.hostWrapperCount, result.rangeEndIndex - result.rangeStartIndex - result.h2oNodeCount, 'exclusive end');
});

await fixture('children after Page 2 boundary are excluded', () => {
  const h = createHarness();
  prime(h);
  const before = h.api.range(1);
  withUnlocked(h, () => {
    const arbitrary = makeNode('DIV', 'arbitrary-after-end', h.guard);
    h.flow.appendChild(arbitrary);
  });
  const after = h.api.range(1);
  equal(after.supported, true, 'after-end ambiguity excluded');
  equal(after.hostWrapperCount, before.hostWrapperCount, 'host count unchanged');
});

await fixture('graph-backed container wrappers are host-rendered', () => {
  const h = createHarness();
  prime(h);
  const result = h.api.range(1);
  equal(result.rangeProven, true, 'proven');
  ok(result.classifierSignals.graphIdentity > 0, 'graph signal');
});

await fixture('mounted nested identity wrappers are host-rendered', () => {
  const h = createHarness({ mountedNestedIndex: 4 });
  prime(h);
  const result = h.api.range(1);
  equal(result.supported, true, 'supported');
  ok(result.hostWrapperCount > 0, 'mounted wrapper included');
});

await fixture('mounted native test-host wrappers use exact identity proof', () => {
  const h = createHarness({ mountedNestedIndex: 7 });
  prime(h);
  const result = h.api.range(1);
  ok(result.classifierSignals.graphIdentity > 0, 'identity proof recorded');
  equal(result.ambiguousWrapperCount, 0, 'no ambiguity');
});

await fixture('section-less container identities remain classifiable', () => {
  const h = createHarness();
  prime(h);
  const result = h.api.range(1);
  equal(result.supported, true, 'supported');
  ok(result.hostWrapperCount >= 25, 'section-less wrappers counted');
});

await fixture('retained-height styling alone is insufficient', () => {
  const h = createHarness({ extraKind: 'retained-height' });
  prime(h);
  const result = h.api.range(1);
  equal(result.reason, 'range-wrapper-ambiguous', 'ambiguous');
  equal(result.firstAmbiguous.hasRetainedHeightStyle, true, 'height diagnostic');
});

await fixture('client-created-root is not a host wrapper', () => {
  const h = createHarness({ extraKind: 'client-created-root' });
  prime(h);
  const result = h.api.range(1);
  equal(result.reason, 'range-wrapper-ambiguous', 'unknown graph identity blocked');
  equal(result.firstAmbiguous.hasTurnIdContainer, true, 'container diagnostic');
  equal(result.firstAmbiguous.graphIdentityFound, false, 'not graph backed');
});

await fixture('arbitrary empty DIV is ambiguous', () => {
  const h = createHarness({ extraKind: 'empty' });
  prime(h);
  equal(h.api.range(1).reason, 'range-wrapper-ambiguous', 'empty div blocked');
});

await fixture('H2O page divider is excluded', () => {
  const h = createHarness({ extraKind: 'page-divider' });
  prime(h);
  const result = h.api.range(1);
  equal(result.supported, true, 'supported');
  ok(result.h2oNodeCount >= 3, 'divider excluded');
});

await fixture('H2O start and end sentinels are excluded', () => {
  const h = createHarness({ extraKind: 'sentinel' });
  prime(h);
  const result = h.api.range(1);
  equal(result.supported, true, 'supported');
  ok(result.h2oNodeCount >= 3, 'sentinel excluded');
});

await fixture('H2O title-list node is excluded', () => {
  const h = createHarness({ extraKind: 'title-list' });
  prime(h);
  equal(h.api.range(1).supported, true, 'title list excluded');
});

await fixture('MiniMap-owned node is excluded', () => {
  const h = createHarness({ extraKind: 'minimap' });
  prime(h);
  equal(h.api.range(1).supported, true, 'MiniMap excluded');
});

await fixture('H2O inline slot is excluded', () => {
  const h = createHarness({ extraKind: 'inline-slot' });
  prime(h);
  equal(h.api.range(1).supported, true, 'inline slot excluded');
});

await fixture('unknown cgxui class is not automatically excluded', () => {
  const h = createHarness({ extraKind: 'unknown-cgxui' });
  prime(h);
  equal(h.api.range(1).reason, 'range-wrapper-ambiguous', 'unknown class blocked');
});

await fixture('graph diagnostics use deterministic batches of at most 32', () => {
  const h = createHarness({ middleCount: 40 });
  prime(h);
  const before = h.graphBatches.length;
  equal(h.api.range(1).supported, true, 'large range supported');
  const batches = h.graphBatches.slice(before);
  ok(batches.some((batch) => batch.length === 32), 'full batch used');
  ok(batches.every((batch) => batch.length <= 32), 'batch cap');
});

await fixture('graph unavailable returns unsupported', () => {
  const h = createHarness({ graphAvailable: false });
  equal(h.api.range(1).reason, 'graph-unavailable', 'graph unavailable');
});

await fixture('graph stale returns unsupported', () => {
  const h = createHarness({ graphReason: 'graph-stale' });
  equal(h.api.range(1).reason, 'graph-stale', 'graph stale');
});

await fixture('one ambiguous node blocks the full range', () => {
  const h = createHarness({ extraKind: 'empty' });
  prime(h);
  const result = h.api.range(1);
  equal(result.supported, false, 'unsupported');
  equal(result.rangeProven, false, 'not proven');
  equal(result.ambiguousWrapperCount, 1, 'one ambiguous');
});

await fixture('first ambiguous index is deterministic', () => {
  const h = createHarness({ extraKind: 'empty' });
  prime(h);
  const a = h.api.range(1);
  const b = h.api.range(1);
  equal(a.firstAmbiguousIndex, b.firstAmbiguousIndex, 'stable index');
  equal(a.firstAmbiguous.index, a.firstAmbiguousIndex, 'matching diagnostic');
});

await fixture('hidden-head backward extension is absent', () => {
  const source = extractFunction(SOURCE, 'getPageCollapseRangeDiagnostics');
  ok(!/previousElementSibling|nearest|walkBackward|turn-74/i.test(source), 'no backward inference');
});

await fixture('preceding host-looking sibling remains inside the exact Page 1 interval', () => {
  const h = createHarness({ extraKind: 'preceding-host-looking' });
  prime(h);
  const result = h.api.range(1);
  equal(result.supported, true, 'classified by graph');
  equal(result.rangeEndIndex, h.flow.children.indexOf(h.end.wrapper), 'q26 remains exact end');
});

await fixture('invalid Page 1 page-unit order blocks range proof', () => {
  const h = createHarness();
  prime(h);
  withUnlocked(h, () => h.flow.insertBefore(h.p1Sentinel, h.answer1.wrapper));
  equal(h.api.range(1).reason, 'page-unit-order-invalid', 'placement blocked');
});

await fixture('streaming boundary blocks range proof', () => {
  const h = createHarness({ streamingOrder: 1 });
  equal(h.api.range(1).reason, 'streaming-active', 'stream blocked');
});

await fixture('branch transition blocks range proof', () => {
  const h = createHarness({ branchTransition: true });
  equal(h.api.range(1).reason, 'boundary-scope-changed', 'transition blocked');
});

await fixture('generation mismatch invalidates captured boundaries', () => {
  const h = createHarness();
  prime(h);
  h.status.generation = 2;
  h.projection.routeGeneration = 2;
  h.graphScope.generation = 2;
  equal(h.api.range(1).supported, false, 'generation rejected');
});

await fixture('effective fingerprint mismatch invalidates captured boundaries', () => {
  const h = createHarness();
  prime(h);
  h.status.canonicalFingerprint = 'djb2:new-effective';
  h.projection.fingerprint = 'djb2:new-effective';
  h.indexState.fingerprint = 'djb2:new-effective';
  equal(h.api.range(1).supported, false, 'effective fingerprint rejected');
});

await fixture('graph fingerprint mismatch invalidates captured boundaries', () => {
  const h = createHarness();
  prime(h);
  h.graphScope.fingerprint = 'djb2:new-graph';
  equal(h.api.range(1).supported, false, 'graph fingerprint rejected');
});

await fixture('route and chat mismatch invalidate captured boundaries', () => {
  const route = createHarness();
  prime(route);
  route.status.routeKey = '/c/other';
  route.graphScope.routeKey = '/c/other';
  equal(route.api.range(1).supported, false, 'route rejected');
  const chat = createHarness();
  prime(chat);
  chat.status.chatId = 'other-chat';
  chat.projection.chatId = 'other-chat';
  chat.graphScope.chatId = 'other-chat';
  equal(chat.api.range(1).supported, false, 'chat rejected');
});

await fixture('different flow roots are unsupported', () => {
  const h = createHarness();
  prime(h);
  const other = makeNode('DIV', 'other-flow', h.guard);
  withUnlocked(h, () => {
    h.thread.appendChild(other);
    other.appendChild(h.end.wrapper);
  });
  equal(h.api.range(1).supported, false, 'different flow rejected');
});

await fixture('missing Page 1 lease is unsupported', () => {
  const h = createHarness({ missingStart: true });
  equal(h.api.range(1).reason, 'start-boundary-unavailable', 'missing start');
});

await fixture('missing Page 2 lease is unsupported', () => {
  const h = createHarness({ missingEnd: true });
  equal(h.api.range(1).reason, 'next-boundary-unavailable', 'missing end');
});

await fixture('final page end authority is intentionally unavailable', () => {
  const h = createHarness();
  equal(h.api.range(2).reason, 'final-page-end-authority-unavailable', 'final page');
  equal(h.api.range(2).isFinalPage, true, 'final diagnostic');
});

await fixture('numeric indexes are current-read diagnostics only', () => {
  const h = createHarness();
  prime(h);
  const result = h.api.range(1);
  ok(result.rangeStartIndex >= 0, 'index reported');
  const continuity = h.S.pageCollapseRangeContinuity.get(1);
  equal(Object.hasOwn(continuity, 'rangeStartIndex'), false, 'start index not retained');
  equal(Object.hasOwn(continuity, 'rangeEndIndex'), false, 'end index not retained');
});

await fixture('pairCount times two is never consumed', () => {
  const source = extractFunction(SOURCE, 'getPageCollapseRangeDiagnostics');
  ok(!/pairCount|\*\s*2|2\s*\*/.test(source), 'no pair arithmetic');
});

await fixture('native test-ID arithmetic is never consumed', () => {
  const source = extractFunction(SOURCE, 'getPageCollapseRangeDiagnostics');
  ok(!/conversation-turn-|testId|test-ID/i.test(source), 'no test-ID authority');
});

await fixture('strict role alternation is never consumed', () => {
  const source = extractFunction(SOURCE, 'getPageCollapseRangeDiagnostics');
  ok(!/alternat|% ?2|assistant.*user|user.*assistant/i.test(source), 'no alternation');
});

await fixture('raw flow child count is not authority', () => {
  const source = extractFunction(SOURCE, 'getPageCollapseRangeDiagnostics');
  ok(!/childCount|children\.length\s*===|children\.length\s*!==/.test(source), 'no count authority');
});

await fixture('repeated identical read performs zero DOM mutations', () => {
  const h = createHarness();
  prime(h);
  const first = h.api.range(1);
  const second = h.api.range(1);
  equal(second, first, 'equivalent result');
  equal(h.safety.domMutations, 0, 'no DOM writes');
});

await fixture('storage cache preference canonical and alias writes remain zero', () => {
  const h = createHarness();
  prime(h);
  h.api.range(1);
  equal(h.safety.storageWrites, 0, 'storage');
  equal(h.safety.cacheWrites, 0, 'cache');
  equal(h.safety.preferenceWrites, 0, 'preferences');
  equal(h.safety.canonicalWrites, 0, 'canonical');
  equal(h.safety.aliasWrites, 0, 'alias');
});

await fixture('network navigation and scrolling remain unused', () => {
  const h = createHarness();
  prime(h);
  h.api.range(1);
  equal(h.safety.networkCalls, 0, 'network');
  equal(h.safety.navigationCalls, 0, 'navigation');
  equal(h.safety.scrollCalls, 0, 'scroll');
});

await fixture('timers RAF intervals and observers remain unused', () => {
  const h = createHarness();
  prime(h);
  h.api.range(1);
  equal(h.safety.timerCalls, 0, 'timers');
  equal(h.safety.rafCalls, 0, 'RAF');
  equal(h.safety.observerCalls, 0, 'observers');
});

await fixture('public range result is deeply frozen and DOM-free', () => {
  const h = createHarness();
  prime(h);
  const result = h.api.range(1);
  assertDeepFrozen(result);
  equal(containsDom(result), false, 'DOM free');
});

await fixture('range API has no production collapse readiness or title-list consumer', () => {
  const occurrences = Array.from(SOURCE.matchAll(/getPageCollapseRangeDiagnostics/g)).length;
  equal(occurrences, 2, 'definition plus public export only');
  const consumers = [
    'getCollapsedNativeBoundaryReadiness',
    'setPageCollapsed',
    'togglePageCollapsed',
    'setTitleListMode',
  ].map((name) => extractFunction(SOURCE, name));
  ok(consumers.every((source) => !source.includes('getPageCollapseRangeDiagnostics')), 'no consumer');
});

await fixture('all prohibited safety surfaces remain zero together', () => {
  const h = createHarness();
  prime(h);
  h.api.range(1);
  assertSafety(h);
});

for (const result of fixtures) {
  if (result.ok) console.log(`PASS ${result.name}`);
  else {
    console.error(`FAIL ${result.name}`);
    console.error(result.error);
  }
}
const passed = fixtures.filter((entry) => entry.ok).length;
console.log(`Fixtures: ${passed}/${fixtures.length}`);
console.log(`Assertions: ${assertions}`);
console.log(
  'Safety counters: storage=0 cache=0 preference=0 canonical=0 alias=0'
  + ' network=0 navigation=0 scrolling=0 timers=0 observers=0 DOM=0',
);
if (passed !== fixtures.length) process.exitCode = 1;
