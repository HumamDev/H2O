#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const PAGE_PATH = 'src-runtime-base/1C1b.🔴📑 Thread Pages Controller 📑.js';
const PAGE_SOURCE = fs.readFileSync(path.join(ROOT, PAGE_PATH), 'utf8');
const PARENT_COMMIT = '2da14b9ca32187cdc7c834f3167ff4bc6775e100';
const PARENT_PAGE_SOURCE = execFileSync('git', ['show', `${PARENT_COMMIT}:${PAGE_PATH}`], {
  cwd: ROOT,
  encoding: 'utf8',
});
const LEASE_PARENT_COMMIT = 'bf540a0da0c41f30643e929d08362f178d1c6f5a';
const LEASE_PARENT_PAGE_SOURCE = execFileSync(
  'git',
  ['show', `${LEASE_PARENT_COMMIT}:${PAGE_PATH}`],
  { cwd: ROOT, encoding: 'utf8' },
);
const PAGE1_PARENT_COMMIT = '30e0c785a2ec69ae15bef81ddcff1ec103c99702';
const PAGE1_PARENT_PAGE_SOURCE = execFileSync(
  'git',
  ['show', `${PAGE1_PARENT_COMMIT}:${PAGE_PATH}`],
  { cwd: ROOT, encoding: 'utf8' },
);
const COLD_PARENT_COMMIT = 'e6cacc710b44658f5f710ce86730ec2cce8335e4';
const COLD_PARENT_PAGE_SOURCE = execFileSync(
  'git',
  ['show', `${COLD_PARENT_COMMIT}:${PAGE_PATH}`],
  { cwd: ROOT, encoding: 'utf8' },
);
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

function wrapperWithNestedIdentity(identity, role, testId, guard, options = {}) {
  const wrapper = node('DIV', 'host-native-turn-slot', guard);
  const nativeTestHost = node('SECTION', 'host-native-turn', guard);
  if (options.missingNativeTestHost !== true) nativeTestHost.setAttribute('data-testid', testId);
  const identityCarrier = node('SECTION', 'host-message-identity', guard);
  identityCarrier.setAttribute('data-turn-id', identity);
  let renderedRoleCarrier = identityCarrier;
  if (options.rolePlacement === 'ancestor') {
    renderedRoleCarrier = node('DIV', 'host-rendered-role', guard);
    renderedRoleCarrier.setAttribute('data-message-author-role', role);
    renderedRoleCarrier.appendChild(identityCarrier);
    nativeTestHost.appendChild(renderedRoleCarrier);
  } else {
    if (options.rolePlacement !== 'outside') identityCarrier.setAttribute('data-turn', role);
    nativeTestHost.appendChild(identityCarrier);
    if (options.rolePlacement === 'outside') {
      renderedRoleCarrier = wrapper;
      wrapper.setAttribute('data-turn', role);
    }
  }
  wrapper.appendChild(nativeTestHost);
  return { wrapper, nativeTestHost, identityCarrier, renderedRoleCarrier };
}

function pageRecords(count = 39, { noAnswer = false, streaming = false, streamingOrder = 26 } = {}) {
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
    if (order === streamingOrder && streaming) record.livePendingStreaming = true;
    return record;
  });
}

function withUnlocked(shape, run) {
  const prior = shape.guard.locked;
  shape.guard.locked = false;
  try { return run(); } finally { shape.guard.locked = prior; }
}

function createHarness(options = {}) {
  const productionSource = options.productionSource || PAGE_SOURCE;
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
    streamingOrder: startOrder,
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
  const boundaryIdentity = options.hiddenParent === true ? 'hidden-parent-node' : qId;
  const boundaryRole = options.boundaryRole || 'user';
  const boundaryTestId = options.boundaryTestId
    || `conversation-turn-${String(((startOrder - 1) * 2) + 1)}`;
  const boundarySurface = options.nestedBoundary === true
    ? wrapperWithNestedIdentity(boundaryIdentity, boundaryRole, boundaryTestId, guard, {
      missingNativeTestHost: options.missingBoundaryNativeTestHost === true,
      rolePlacement: options.boundaryRolePlacement,
    })
    : null;
  const boundaryWrapper = options.coldBoundaryWrapper === true
    ? node('DIV', 'host-cold-boundary-wrapper', guard)
    : (boundarySurface?.wrapper || wrapperWithSection(
      boundaryIdentity,
      boundaryRole,
      boundaryTestId,
      guard,
    ));
  boundaryWrapper.setAttribute(
    'data-turn-id-container',
    options.coldContainerIdentity || boundaryIdentity,
  );
  if (options.coldH2OOwned === true) {
    boundaryWrapper.setAttribute('data-cgxui-owner', 'mnmp');
  }
  if (options.boundaryMounted !== false) flow.appendChild(boundaryWrapper);
  let answerWrapper = null;
  let answerSurface = null;
  if (primaryAId && options.answerMounted !== false) {
    const answerRole = options.answerRole || 'assistant';
    const answerTestId = options.answerTestId
      || `conversation-turn-${String(startOrder * 2)}`;
    answerSurface = options.nestedAnswer === true
      ? wrapperWithNestedIdentity(primaryAId, answerRole, answerTestId, guard, {
        missingNativeTestHost: options.missingAnswerNativeTestHost === true,
        rolePlacement: options.answerRolePlacement,
      })
      : null;
    answerWrapper = answerSurface?.wrapper || wrapperWithSection(
      primaryAId,
      answerRole,
      answerTestId,
      guard,
    );
    flow.appendChild(answerWrapper);
    if (options.duplicateNestedAnswer === true) {
      flow.appendChild(wrapperWithNestedIdentity(
        primaryAId,
        answerRole,
        'conversation-turn-answer-duplicate',
        guard,
      ).wrapper);
    }
  }
  if (options.mismatchedBoundarySurface === true && boundarySurface && answerSurface) {
    boundarySurface.identityCarrier.closest = () => answerSurface.nativeTestHost;
    answerSurface.nativeTestHost.contains = () => true;
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
  if (options.duplicateColdBoundary === true) {
    const duplicate = node('DIV', 'host-cold-boundary-duplicate', guard);
    duplicate.setAttribute('data-turn-id-container', qId);
    flow.appendChild(duplicate);
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
    routeKey: options.graphScopeStale === true ? '/c/stale-graph' : ROUTE_KEY,
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
    ${extractFunction(productionSource, 'renderedBoundaryStatusIdentity')}
    ${extractFunction(productionSource, 'frozenRenderedPageBoundaryCapability')}
    ${extractFunction(productionSource, 'renderedBoundaryDirectChildUnder')}
    ${productionSource.includes('function renderedBoundaryRoleFromCarrier(')
      ? extractFunction(productionSource, 'renderedBoundaryRoleFromCarrier')
      : ''}
    ${productionSource.includes('function resolveRenderedTurnSurfaceByIdentity(')
      ? extractFunction(productionSource, 'resolveRenderedTurnSurfaceByIdentity')
      : extractFunction(productionSource, 'renderedBoundarySectionsById')}
    ${extractFunction(productionSource, 'renderedBoundaryThreadDivider')}
    ${extractFunction(productionSource, 'renderedBoundaryStartSentinel')}
    ${extractFunction(productionSource, 'renderedBoundaryOrderingNodeAllowed')}
    ${extractFunction(productionSource, 'renderedBoundaryLayoutProof')}
    ${productionSource.includes('function renderedBoundaryWrapperCarriesIdentity(')
      ? extractFunction(productionSource, 'renderedBoundaryWrapperCarriesIdentity')
      : ''}
    ${productionSource.includes('function renderedBoundaryColdWrapperH2OOwned(')
      ? extractFunction(productionSource, 'renderedBoundaryColdWrapperH2OOwned')
      : ''}
    ${productionSource.includes('function resolveColdRenderedBoundaryWrapper(')
      ? extractFunction(productionSource, 'resolveColdRenderedBoundaryWrapper')
      : ''}
    ${productionSource.includes('function renderedBoundaryPageUnitPlacement(')
      ? extractFunction(productionSource, 'renderedBoundaryPageUnitPlacement')
      : ''}
    ${extractFunction(productionSource, 'renderedBoundaryTransitionActive')}
    ${extractFunction(productionSource, 'renderedBoundaryRecordStreaming')}
    ${extractFunction(productionSource, 'readRenderedBoundaryAuthority')}
    ${extractFunction(productionSource, 'renderedBoundaryLeaseScopeCurrent')}
    ${extractFunction(productionSource, 'getRenderedPageBoundaryCapability')}
    return Object.freeze({
      get: getRenderedPageBoundaryCapability,
      resolveSurface: typeof resolveRenderedTurnSurfaceByIdentity === 'function'
        ? resolveRenderedTurnSurfaceByIdentity
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
    sentinel,
    divider,
    boundaryWrapper,
    boundarySurface,
    answerWrapper,
    answerSurface,
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

await fixture('parent same-element Page 2 boundary remains supported', () => {
  const h = createHarness({ productionSource: PARENT_PAGE_SOURCE });
  const result = h.api.get(2);
  equal(h.flow.children.length, 87, 'raw child count reproduced');
  equal(h.flow.children.indexOf(h.preceding), 55, 'order 25 answer index');
  equal(h.flow.children.indexOf(h.boundaryWrapper), 58, 'order 26 question index');
  equal(h.flow.children.indexOf(h.answerWrapper), 59, 'order 26 answer index');
  equal(h.flow.children.indexOf(h.next), 60, 'next question index');
  equal(result.pageStartOrder, 26, 'page start');
  equal(result.interveningNonH2ONodeCount, 0, 'clean boundary');
  equal(result.supported, true, 'parent same-element shape supported');
});

await fixture('parent nested live surface is rejected before correction', () => {
  const h = createHarness({
    nestedBoundary: true,
    nestedAnswer: true,
    productionSource: PARENT_PAGE_SOURCE,
  });
  ok(h.boundarySurface.identityCarrier !== h.boundarySurface.nativeTestHost, 'nested boundary surfaces differ');
  ok(h.answerSurface.identityCarrier !== h.answerSurface.nativeTestHost, 'nested answer surfaces differ');
  ok(
    h.boundarySurface.identityCarrier.closest('[data-testid^="conversation-turn-"]')
      === h.boundarySurface.nativeTestHost,
    'identity resolves native host',
  );
  const result = h.api.get(2);
  equal(result.supported, false, 'parent rejects live shape');
  equal(result.reason, 'rendered-boundary-head-unproven', 'parent failure reason');
  equal(result.boundarySectionMounted, false, 'parent misses mounted nested identity');
});

await fixture('parent cold exact sectionless wrapper is rejected before correction', () => {
  const h = createHarness({
    coldBoundaryWrapper: true,
    answerMounted: false,
    productionSource: COLD_PARENT_PAGE_SOURCE,
  });
  equal(
    h.boundaryWrapper.getAttribute('data-turn-id-container'),
    Q26,
    'exact canonical qId wrapper exists',
  );
  equal(h.boundaryWrapper.parentElement, h.flow, 'wrapper is a direct flow child');
  equal(h.boundaryWrapper.querySelector('section[data-turn-id]'), null, 'no nested identity section');
  equal(
    h.boundaryWrapper.querySelector('[data-testid^="conversation-turn-"]'),
    null,
    'no native test host',
  );
  equal(h.leases.size, 0, 'no existing lease');
  const result = h.api.get(2);
  equal(result.supported, false, 'parent rejects cold wrapper');
  equal(result.reason, 'rendered-boundary-head-unproven', 'parent failure reason');
  equal(result.boundarySectionMounted, false, 'section remains absent');
  equal(result.boundaryWrapperConnected, false, 'wrapper is not captured');
  equal(result.leaseCurrent, false, 'lease remains unavailable');
});

await fixture('cold exact graph-backed sectionless wrapper is supported', () => {
  const result = createHarness({
    coldBoundaryWrapper: true,
    answerMounted: false,
  }).api.get(2);
  equal(result.supported, true, 'cold wrapper supported');
  equal(result.reason, null, 'no failure reason');
  equal(result.source, 'exact-graph-backed-product-qid-wrapper', 'cold exact source');
  equal(result.boundarySectionMounted, false, 'section is absent');
  equal(result.boundaryWrapperConnected, true, 'wrapper is connected');
  equal(result.boundaryDomRole, null, 'DOM role remains unknown');
  equal(result.boundaryTestId, null, 'test ID remains unknown');
  equal(result.boundaryIdentityCurrent, true, 'identity current');
  equal(result.leaseCurrent, true, 'lease current');
});

await fixture('cold exact wrapper captures the normal memory-only lease', () => {
  const h = createHarness({ coldBoundaryWrapper: true, answerMounted: false });
  h.api.get(2);
  equal(h.leases.size, 1, 'one lease captured');
  const lease = h.leases.get(2);
  equal(lease.qId, Q26, 'lease carries exact qId');
  ok(lease.flowRoot === h.flow, 'lease carries exact flow root');
  ok(lease.boundaryWrapper === h.boundaryWrapper, 'lease carries exact wrapper');
});

await fixture('cold exact wrapper uses the retained lease on a later read', () => {
  const h = createHarness({ coldBoundaryWrapper: true, answerMounted: false });
  const first = h.api.get(2);
  const lease = h.leases.get(2);
  h.leases.resetCounts();
  const second = h.api.get(2);
  equal(first.source, 'exact-graph-backed-product-qid-wrapper', 'first read bootstraps');
  equal(second.source, 'same-generation-captured-wrapper', 'second read retains');
  ok(h.leases.get(2) === lease, 'same lease object retained');
  equal(h.leases.writes, 0, 'no lease rewrite');
});

await fixture('mounted exact surface upgrades a cold lease to mounted authority', () => {
  const h = createHarness({ coldBoundaryWrapper: true, answerMounted: false });
  equal(h.api.get(2).source, 'exact-graph-backed-product-qid-wrapper', 'cold capture');
  let mounted = null;
  withUnlocked(h, () => {
    mounted = wrapperWithNestedIdentity(
      Q26,
      'user',
      'conversation-turn-51',
      h.guard,
    );
    h.boundaryWrapper.appendChild(mounted.nativeTestHost);
  });
  const result = h.api.get(2);
  equal(result.supported, true, 'mounted surface supported');
  equal(result.source, 'exact-mounted-product-qid', 'mounted source wins');
  equal(result.boundarySectionMounted, true, 'section mounted');
  equal(result.boundaryDomRole, 'user', 'mounted role observed');
});

await fixture('cold bootstrap fails closed with zero direct exact matches', () => {
  const result = createHarness({
    coldBoundaryWrapper: true,
    coldContainerIdentity: 'other-host-identity',
    answerMounted: false,
  }).api.get(2);
  equal(result.supported, false, 'unsupported');
  equal(result.reason, 'rendered-boundary-head-unproven', 'zero-match reason');
  equal(result.leaseCurrent, false, 'no lease');
});

await fixture('cold bootstrap fails closed with duplicate direct exact matches', () => {
  const result = createHarness({
    coldBoundaryWrapper: true,
    duplicateColdBoundary: true,
    answerMounted: false,
  }).api.get(2);
  equal(result.supported, false, 'unsupported');
  equal(result.reason, 'boundary-section-ambiguous', 'duplicate reason');
  equal(result.leaseCurrent, false, 'no lease');
});

await fixture('client-created-root cannot bootstrap a rendered boundary', () => {
  const result = createHarness({
    coldBoundaryWrapper: true,
    coldContainerIdentity: 'client-created-root',
    answerMounted: false,
  }).api.get(2);
  equal(result.supported, false, 'helper identity rejected');
  equal(result.reason, 'rendered-boundary-head-unproven', 'not exact canonical qId');
});

await fixture('graph-unresolved qId cannot bootstrap a cold boundary', () => {
  const result = createHarness({
    coldBoundaryWrapper: true,
    answerMounted: false,
    graphQFound: false,
  }).api.get(2);
  equal(result.supported, false, 'unsupported');
  equal(result.reason, 'rendered-boundary-head-unproven', 'graph proof required');
});

await fixture('stale graph scope cannot bootstrap a cold boundary', () => {
  const result = createHarness({
    coldBoundaryWrapper: true,
    answerMounted: false,
    graphScopeStale: true,
  }).api.get(2);
  equal(result.supported, false, 'unsupported');
  equal(result.reason, 'graph-stale', 'stale graph rejected');
});

await fixture('non-product graph qId cannot bootstrap a cold boundary', () => {
  const result = createHarness({
    coldBoundaryWrapper: true,
    answerMounted: false,
    graphProductUser: false,
  }).api.get(2);
  equal(result.supported, false, 'unsupported');
  equal(result.reason, 'rendered-boundary-head-unproven', 'product user proof required');
});

await fixture('H2O-owned exact container cannot bootstrap a cold boundary', () => {
  const result = createHarness({
    coldBoundaryWrapper: true,
    answerMounted: false,
    coldH2OOwned: true,
  }).api.get(2);
  equal(result.supported, false, 'H2O node rejected');
  equal(result.reason, 'rendered-boundary-head-unproven', 'host ownership required');
});

await fixture('cold boundary wrapper replacement rebinds the identity-keyed lease', () => {
  const h = createHarness({ coldBoundaryWrapper: true, answerMounted: false });
  equal(h.api.get(2).supported, true, 'cold capture');
  withUnlocked(h, () => {
    const replacement = node('DIV', 'replacement-cold-wrapper', h.guard);
    replacement.setAttribute('data-turn-id-container', Q26);
    h.flow.replaceChild(replacement, h.boundaryWrapper);
  });
  const result = h.api.get(2);
  // Host-compatibility foundation: same proven identity on a fresh element
  // rebinds the identity-keyed lease instead of failing the capability.
  equal(result.supported, true, 'same identity on a fresh element stays supported');
  equal(result.leaseCurrent, true, 'lease rebinds to the replacement wrapper');
});

await fixture('cold boundary wrapper disconnection invalidates the lease', () => {
  const h = createHarness({ coldBoundaryWrapper: true, answerMounted: false });
  h.api.get(2);
  withUnlocked(h, () => h.flow.removeChild(h.boundaryWrapper));
  const result = h.api.get(2);
  equal(result.reason, 'captured-wrapper-replaced', 'disconnection rejected');
  equal(result.leaseCurrent, false, 'lease invalidated');
});

await fixture('cold boundary wrapper identity loss invalidates the lease', () => {
  const h = createHarness({ coldBoundaryWrapper: true, answerMounted: false });
  h.api.get(2);
  withUnlocked(h, () => h.boundaryWrapper.removeAttribute('data-turn-id-container'));
  const result = h.api.get(2);
  equal(result.reason, 'captured-wrapper-replaced', 'identity loss rejected');
  equal(result.leaseCurrent, false, 'lease invalidated');
});

await fixture('cold boundary flow-root replacement rebinds through the live divider parent', () => {
  const h = createHarness({ coldBoundaryWrapper: true, answerMounted: false });
  h.api.get(2);
  const replacement = node('DIV', 'replacement-cold-flow', h.guard);
  withUnlocked(h, () => {
    for (const child of [...h.flow.children]) replacement.appendChild(child);
    h.thread.replaceChild(replacement, h.flow);
  });
  const result = h.api.get(2);
  equal(result.supported, true, 'identity re-proven in the live flow root');
  equal(result.leaseCurrent, true, 'lease rebinds to the replacement flow root');
});

await fixture('streaming prevents cold wrapper bootstrap', () => {
  const result = createHarness({
    coldBoundaryWrapper: true,
    answerMounted: false,
    streaming: true,
  }).api.get(2);
  equal(result.supported, false, 'unsupported');
  equal(result.reason, 'streaming-active', 'streaming rejected');
});

await fixture('branch transition prevents cold wrapper bootstrap', () => {
  const result = createHarness({
    coldBoundaryWrapper: true,
    answerMounted: false,
    branchTransition: true,
  }).api.get(2);
  equal(result.supported, false, 'unsupported');
  equal(result.reason, 'boundary-scope-changed', 'transition rejected');
});

await fixture('cold NO ANSWER boundary has no answer-wrapper dependency', () => {
  const result = createHarness({
    coldBoundaryWrapper: true,
    noAnswer: true,
    answerMounted: false,
  }).api.get(2);
  equal(result.supported, true, 'NO ANSWER start supported');
  equal(result.primaryAId, null, 'no canonical primary answer');
  equal(result.primaryAnswerMounted, false, 'no answer surface required');
});

await fixture('cold boundary page-unit diagnostics use the exact wrapper read-only', () => {
  const h = createHarness({ coldBoundaryWrapper: true, answerMounted: false });
  withUnlocked(h, () => {
    h.flow.appendChild(h.sentinel);
    h.flow.appendChild(h.divider);
  });
  const result = h.api.get(2);
  equal(result.supported, true, 'identity remains supported');
  equal(result.source, 'exact-graph-backed-product-qid-wrapper', 'cold source');
  equal(result.pageUnitOrderCurrent, false, 'stale placement diagnosed');
  equal(result.placementRepairRequired, true, 'external repair requested');
  equal(h.flow.children.indexOf(h.boundaryWrapper) >= 0, true, 'wrapper stays in place');
});

await fixture('cold boundary direct-flow index is diagnostic only', () => {
  const a = createHarness({
    coldBoundaryWrapper: true,
    answerMounted: false,
    rawChildCount: 87,
  }).api.get(2);
  const b = createHarness({
    coldBoundaryWrapper: true,
    answerMounted: false,
    rawChildCount: 140,
  }).api.get(2);
  equal(a.supported, true, 'first raw shape supported');
  equal(b.supported, true, 'second raw shape supported');
  equal(a.qId, b.qId, 'same exact identity authority');
});

await fixture('cold result is deeply frozen and exposes no DOM node', () => {
  const result = createHarness({
    coldBoundaryWrapper: true,
    answerMounted: false,
  }).api.get(2);
  assertDeepFrozen(result);
  equal(containsDomNode(result), false, 'DOM free');
});

await fixture('cold bootstrap performs no DOM or persistent mutation', () => {
  const h = createHarness({ coldBoundaryWrapper: true, answerMounted: false });
  h.api.get(2);
  assertSafetyZero(h.safety);
  equal(h.leases.size, 1, 'only private memory lease created');
});

await fixture('cold retained read is idempotent', () => {
  const h = createHarness({ coldBoundaryWrapper: true, answerMounted: false });
  h.api.get(2);
  h.leases.resetCounts();
  equal(h.api.get(2).source, 'same-generation-captured-wrapper', 'retained source');
  equal(h.leases.writes, 0, 'no rewrite');
  equal(h.leases.deletes, 0, 'no deletion');
  assertSafetyZero(h.safety);
});

await fixture('corrected nested qId and primary-answer surfaces are supported', () => {
  const result = createHarness({ nestedBoundary: true, nestedAnswer: true }).api.get(2);
  equal(result.version, 2, 'version two semantics');
  equal(result.supported, true, 'nested boundary supported');
  equal(result.reason, null, 'no failure reason');
  equal(result.source, 'exact-mounted-product-qid', 'exact mounted source');
  equal(result.boundaryIdentityCurrent, true, 'boundary identity current');
  equal(result.boundarySectionMounted, true, 'boundary identity mounted');
  equal(result.boundaryWrapperConnected, true, 'boundary wrapper connected');
  equal(result.boundaryDomRole, 'user', 'boundary DOM role');
  equal(result.boundaryTestId, 'conversation-turn-51', 'boundary native test ID');
  equal(result.primaryAnswerMounted, true, 'primary answer mounted');
  equal(result.primaryAnswerDomRole, 'assistant', 'primary DOM role');
  equal(result.primaryAnswerTestId, 'conversation-turn-52', 'primary native test ID');
  equal(result.dividerBeforeBoundary, true, 'divider precedes boundary');
  equal(result.startSentinelBeforeBoundary, true, 'sentinel precedes boundary');
  equal(result.interveningNonH2ONodeCount, 0, 'no host node between');
  equal(result.pageUnitOrderCurrent, true, 'marker order current');
  equal(result.pageUnitOrderReason, null, 'no marker-order reason');
  equal(result.placementRepairRequired, false, 'no placement repair');
  equal(result.leaseCurrent, true, 'lease current');
});

await fixture('identity carrier and native test host share one direct-flow wrapper', () => {
  const h = createHarness({ nestedBoundary: true, nestedAnswer: true });
  const surface = h.api.resolveSurface(Q26, h.flow);
  ok(surface.identityCarrier !== surface.nativeTestHost, 'surfaces differ');
  ok(surface.directFlowWrapper === h.boundaryWrapper, 'boundary wrapper resolved');
  ok(
    surface.identityCarrier.closest('[data-testid^="conversation-turn-"]')
      === surface.nativeTestHost,
    'native host is closest test host',
  );
});

await fixture('different-wrapper identity and native-host projection fails closed', () => {
  const result = createHarness({
    nestedBoundary: true,
    nestedAnswer: true,
    mismatchedBoundarySurface: true,
  }).api.get(2);
  equal(result.supported, false, 'mismatch unsupported');
  equal(result.reason, 'boundary-wrapper-unavailable', 'mismatch reason');
});

await fixture('missing native test host fails closed', () => {
  const result = createHarness({
    nestedBoundary: true,
    nestedAnswer: true,
    missingBoundaryNativeTestHost: true,
  }).api.get(2);
  equal(result.supported, false, 'missing host unsupported');
  equal(result.reason, 'boundary-wrapper-unavailable', 'missing host reason');
});

await fixture('duplicate nested primary-answer identities fail deterministically', () => {
  const result = createHarness({
    nestedBoundary: true,
    nestedAnswer: true,
    duplicateNestedAnswer: true,
  }).api.get(2);
  equal(result.supported, false, 'duplicate answer unsupported');
  equal(result.reason, 'boundary-section-ambiguous', 'deterministic ambiguity reason');
});

await fixture('nested identity carrier itself may own rendered role', () => {
  const result = createHarness({ nestedBoundary: true, nestedAnswer: true }).api.get(2);
  equal(result.boundaryDomRole, 'user', 'identity-carrier role');
});

await fixture('nearest role-bearing ancestor inside native host may own rendered role', () => {
  const result = createHarness({
    nestedBoundary: true,
    nestedAnswer: true,
    boundaryRolePlacement: 'ancestor',
    answerRolePlacement: 'ancestor',
  }).api.get(2);
  equal(result.supported, true, 'ancestor role supported');
  equal(result.boundaryDomRole, 'user', 'boundary ancestor role');
  equal(result.primaryAnswerDomRole, 'assistant', 'answer ancestor role');
});

await fixture('role carrier outside native test host is rejected', () => {
  const result = createHarness({
    nestedBoundary: true,
    nestedAnswer: true,
    boundaryRolePlacement: 'outside',
  }).api.get(2);
  equal(result.supported, false, 'outside role unsupported');
  equal(result.reason, 'rendered-boundary-head-unproven', 'outside role reason');
});

await fixture('identity lookup never interpolates input into a selector', () => {
  const source = extractFunction(PAGE_SOURCE, 'resolveRenderedTurnSurfaceByIdentity');
  ok(source.includes("querySelectorAll('section[data-turn-id]')"), 'fixed selector used');
  ok(!/querySelectorAll\s*\(\s*`[^`]*\$\{/.test(source), 'no template selector input');
  ok(!/querySelector(All)?\s*\([^)]*identity/.test(source), 'identity never enters selector');
});

await fixture('nested test IDs remain diagnostic only', () => {
  const result = createHarness({
    nestedBoundary: true,
    nestedAnswer: true,
    boundaryTestId: 'conversation-turn-nested-alpha',
    answerTestId: 'conversation-turn-nested-beta',
  }).api.get(2);
  equal(result.supported, true, 'renamed nested test IDs supported');
  equal(result.boundaryTestId, 'conversation-turn-nested-alpha', 'boundary diagnostic');
  equal(result.primaryAnswerTestId, 'conversation-turn-nested-beta', 'answer diagnostic');
});

await fixture('nested identity unmount retains the exact wrapper lease', () => {
  const h = createHarness({ nestedBoundary: true, nestedAnswer: true });
  equal(h.api.get(2).supported, true, 'initial nested capture');
  withUnlocked(h, () => {
    h.boundarySurface.nativeTestHost.removeChild(h.boundarySurface.identityCarrier);
  });
  const result = h.api.get(2);
  equal(result.supported, true, 'lease remains supported');
  equal(result.source, 'same-generation-captured-wrapper', 'captured-wrapper source');
  equal(result.boundarySectionMounted, false, 'nested identity unmounted');
  equal(result.boundaryWrapperConnected, true, 'exact wrapper retained');
});

await fixture('parent marker drift discards an otherwise exact retained lease', () => {
  const h = createHarness({
    nestedBoundary: true,
    nestedAnswer: true,
    productionSource: LEASE_PARENT_PAGE_SOURCE,
  });
  withUnlocked(h, () => {
    h.boundaryWrapper.setAttribute('data-turn-id-container', Q26);
  });
  const initial = h.api.get(2);
  equal(initial.supported, true, 'parent captures mounted boundary');
  equal(initial.source, 'exact-mounted-product-qid', 'parent mounted source');
  equal(initial.leaseCurrent, true, 'parent lease initially current');
  const capturedLease = h.leases.get(2);
  ok(capturedLease?.boundaryWrapper === h.boundaryWrapper, 'exact wrapper captured');
  withUnlocked(h, () => {
    h.boundarySurface.nativeTestHost.removeChild(h.boundarySurface.identityCarrier);
    h.answerSurface.nativeTestHost.removeChild(h.answerSurface.identityCarrier);
    const later = wrapperWithNestedIdentity(
      'later-page-two-user',
      'user',
      'conversation-turn-74',
      h.guard,
    ).wrapper;
    h.flow.insertBefore(later, h.next);
    h.flow.insertBefore(h.sentinel, later);
    h.flow.insertBefore(h.divider, later);
  });
  ok(h.boundaryWrapper.isConnected, 'retained wrapper remains connected');
  ok(h.boundaryWrapper.parentElement === h.flow, 'retained wrapper stays in flow root');
  equal(
    h.boundaryWrapper.getAttribute('data-turn-id-container'),
    Q26,
    'retained wrapper preserves exact qId',
  );
  const drifted = h.api.get(2);
  equal(drifted.supported, false, 'parent rejects placement drift');
  equal(drifted.reason, 'boundary-order-invalid', 'parent order failure');
  equal(drifted.boundarySectionMounted, false, 'nested qId is unmounted');
  equal(drifted.boundaryWrapperConnected, true, 'exact wrapper remains connected');
  equal(drifted.leaseCurrent, false, 'parent no longer reports current lease');
  equal(h.leases.has(2), false, 'parent deletes the identity lease');
});

await fixture('corrected marker drift retains exact identity and reports placement repair', () => {
  const h = createHarness({ nestedBoundary: true, nestedAnswer: true });
  const initial = h.api.get(2);
  equal(initial.supported, true, 'initial boundary supported');
  const capturedLease = h.leases.get(2);
  withUnlocked(h, () => {
    h.boundarySurface.nativeTestHost.removeChild(h.boundarySurface.identityCarrier);
    h.answerSurface.nativeTestHost.removeChild(h.answerSurface.identityCarrier);
    const later = wrapperWithNestedIdentity(
      'later-page-two-user',
      'user',
      'conversation-turn-74',
      h.guard,
    ).wrapper;
    h.flow.insertBefore(later, h.next);
    h.flow.insertBefore(h.sentinel, later);
    h.flow.insertBefore(h.divider, later);
  });
  h.leases.resetCounts();
  const result = h.api.get(2);
  equal(result.version, 2, 'version two');
  equal(result.supported, true, 'identity remains supported');
  equal(result.reason, null, 'identity has no failure reason');
  equal(result.source, 'same-generation-captured-wrapper', 'captured source');
  equal(result.boundaryIdentityCurrent, true, 'identity current');
  equal(result.boundarySectionMounted, false, 'section unmounted');
  equal(result.boundaryWrapperConnected, true, 'wrapper connected');
  equal(result.dividerBeforeBoundary, false, 'divider drift reported');
  equal(result.startSentinelBeforeBoundary, false, 'sentinel drift reported');
  equal(result.pageUnitOrderCurrent, false, 'placement not current');
  equal(result.pageUnitOrderReason, 'sentinel-after-boundary', 'precise placement reason');
  equal(result.placementRepairRequired, true, 'repair reported');
  equal(result.leaseCurrent, true, 'lease remains current');
  ok(h.leases.get(2) === capturedLease, 'same private lease retained');
  equal(h.leases.writes, 0, 'no lease replacement');
  equal(h.leases.deletes, 0, 'no lease deletion');
});

await fixture('valid nested wrapper replacement rebinds the mounted lease', () => {
  const h = createHarness({ nestedBoundary: true, nestedAnswer: true });
  equal(h.api.get(2).supported, true, 'initial nested capture');
  withUnlocked(h, () => {
    const replacement = wrapperWithNestedIdentity(
      Q26,
      'user',
      'conversation-turn-replacement',
      h.guard,
    ).wrapper;
    h.flow.replaceChild(replacement, h.boundaryWrapper);
  });
  const result = h.api.get(2);
  equal(result.supported, true, 'same identity on a fresh section stays supported');
  equal(result.leaseCurrent, true, 'lease rebinds to the replacement wrapper');
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
  equal(result.boundaryIdentityCurrent, true, 'identity remains current');
  equal(result.pageUnitOrderCurrent, true, 'marker order remains current');
  equal(result.placementRepairRequired, false, 'repair not required');
  equal(result.leaseCurrent, true, 'lease current');
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
  equal(result.boundaryIdentityCurrent, false, 'identity invalid');
  equal(result.leaseCurrent, false, 'lease invalid');
});

await fixture('wrapper disconnection invalidates the lease', () => {
  const h = createHarness();
  h.api.get(2);
  withUnlocked(h, () => h.flow.removeChild(h.boundaryWrapper));
  const result = h.api.get(2);
  equal(result.reason, 'captured-wrapper-replaced', 'disconnected');
  equal(result.boundaryIdentityCurrent, false, 'identity invalid');
  equal(result.leaseCurrent, false, 'lease invalid');
});

await fixture('flow-root replacement rebinds through the live divider parent', () => {
  const h = createHarness();
  h.api.get(2);
  const replacement = node('DIV', 'replacement-flow', h.guard);
  withUnlocked(h, () => {
    for (const child of [...h.flow.children]) replacement.appendChild(child);
    h.thread.replaceChild(replacement, h.flow);
  });
  const result = h.api.get(2);
  equal(result.supported, true, 'identity re-proven in the live flow root');
  equal(result.leaseCurrent, true, 'lease rebinds to the replacement flow root');
});

await fixture('divider absence preserves identity and reports placement repair', () => {
  const h = createHarness();
  h.api.get(2);
  withUnlocked(h, () => h.flow.removeChild(h.divider));
  const result = h.api.get(2);
  equal(result.supported, true, 'identity remains supported');
  equal(result.boundaryIdentityCurrent, true, 'identity remains current');
  equal(result.dividerConnected, false, 'divider absent');
  equal(result.pageUnitOrderCurrent, false, 'placement not current');
  equal(result.pageUnitOrderReason, 'divider-unavailable', 'placement reason');
  equal(result.placementRepairRequired, true, 'repair required');
  equal(result.leaseCurrent, true, 'lease retained');
});

await fixture('sentinel absence preserves identity and reports placement repair', () => {
  const h = createHarness();
  h.api.get(2);
  withUnlocked(h, () => h.flow.removeChild(h.sentinel));
  const result = h.api.get(2);
  equal(result.supported, true, 'identity remains supported');
  equal(result.boundaryIdentityCurrent, true, 'identity remains current');
  equal(result.startSentinelConnected, false, 'sentinel absent');
  equal(result.pageUnitOrderCurrent, false, 'placement not current');
  equal(result.pageUnitOrderReason, 'sentinel-unavailable', 'placement reason');
  equal(result.placementRepairRequired, true, 'repair required');
  equal(result.leaseCurrent, true, 'lease retained');
});

await fixture('intervening host node reports placement repair without losing identity', () => {
  const h = createHarness();
  h.api.get(2);
  const host = node('DIV', 'host-intervening', h.guard);
  withUnlocked(h, () => h.flow.insertBefore(host, h.boundaryWrapper));
  const result = h.api.get(2);
  equal(result.supported, true, 'identity remains supported');
  equal(result.reason, null, 'identity has no failure reason');
  equal(result.pageUnitOrderCurrent, false, 'placement not current');
  equal(result.pageUnitOrderReason, 'intervening-host-node', 'placement reason');
  equal(result.placementRepairRequired, true, 'repair required');
  equal(result.interveningNonH2ONodeCount, 1, 'one host node');
  equal(result.leaseCurrent, true, 'lease retained');
});

await fixture('divider moved after boundary does not invalidate identity', () => {
  const h = createHarness();
  h.api.get(2);
  withUnlocked(h, () => h.flow.insertBefore(h.divider, h.answerWrapper));
  const result = h.api.get(2);
  equal(result.supported, true, 'identity supported');
  equal(result.boundaryIdentityCurrent, true, 'identity current');
  equal(result.dividerBeforeBoundary, false, 'divider drift reported');
  equal(result.startSentinelBeforeBoundary, true, 'sentinel remains current');
  equal(result.pageUnitOrderReason, 'divider-after-boundary', 'divider reason');
  equal(result.placementRepairRequired, true, 'repair required');
});

await fixture('start sentinel moved after boundary does not invalidate identity', () => {
  const h = createHarness();
  h.api.get(2);
  withUnlocked(h, () => h.flow.insertBefore(h.sentinel, h.answerWrapper));
  const result = h.api.get(2);
  equal(result.supported, true, 'identity supported');
  equal(result.boundaryIdentityCurrent, true, 'identity current');
  equal(result.dividerBeforeBoundary, true, 'divider remains current');
  equal(result.startSentinelBeforeBoundary, false, 'sentinel drift reported');
  equal(result.pageUnitOrderReason, 'sentinel-after-boundary', 'sentinel reason');
  equal(result.placementRepairRequired, true, 'repair required');
});

await fixture('both page-unit markers may drift without invalidating identity', () => {
  const h = createHarness();
  h.api.get(2);
  withUnlocked(h, () => {
    h.flow.insertBefore(h.sentinel, h.answerWrapper);
    h.flow.insertBefore(h.divider, h.answerWrapper);
  });
  const result = h.api.get(2);
  equal(result.supported, true, 'identity supported');
  equal(result.boundaryIdentityCurrent, true, 'identity current');
  equal(result.dividerBeforeBoundary, false, 'divider drift');
  equal(result.startSentinelBeforeBoundary, false, 'sentinel drift');
  equal(result.pageUnitOrderCurrent, false, 'placement stale');
  equal(result.pageUnitOrderReason, 'sentinel-after-boundary', 'deterministic priority');
  equal(result.leaseCurrent, true, 'lease current');
});

await fixture('marker DOM replacement does not replace the boundary identity lease', () => {
  const h = createHarness();
  h.api.get(2);
  const lease = h.leases.get(2);
  withUnlocked(h, () => {
    const sentinel = node('SPAN', 'h2o-page-start', h.guard);
    sentinel.setAttribute('data-h2o-chat-page-boundary', 'page-2-start');
    sentinel.setAttribute('data-h2o-chat-page-boundary-page', '2');
    sentinel.setAttribute('data-h2o-chat-page-boundary-kind', 'start');
    sentinel.setAttribute('data-cgxui-owner', 'mnmp');
    const divider = node('DIV', 'cgxui-chat-page-divider', h.guard);
    divider.setAttribute('data-page-num', '2');
    divider.setAttribute('data-cgxui-owner', 'mnmp');
    h.flow.replaceChild(sentinel, h.sentinel);
    h.flow.replaceChild(divider, h.divider);
  });
  const result = h.api.get(2);
  equal(result.supported, true, 'identity supported');
  equal(result.pageUnitOrderCurrent, true, 'replacement markers ordered');
  equal(result.placementRepairRequired, false, 'no repair needed');
  ok(h.leases.get(2) === lease, 'same identity lease');
});

await fixture('boundary wrapper nested deeper rebinds to the resolved direct-flow wrapper', () => {
  const h = createHarness({ nestedBoundary: true });
  h.api.get(2);
  withUnlocked(h, () => {
    const container = node('DIV', 'host-nested-container', h.guard);
    h.flow.insertBefore(container, h.boundaryWrapper);
    container.appendChild(h.boundaryWrapper);
  });
  const result = h.api.get(2);
  // A fresh capture accepted this exact structure before and after the
  // foundation refactor (probed) - the old leased-path fail was pure
  // reference-pinning, not a structural proof. Leased and fresh reads now
  // agree: the surface resolver's own acceptance decides.
  equal(result.supported, true, 'leased read matches what a fresh capture proves');
  equal(result.leaseCurrent, true, 'lease rebinds to the resolved direct-flow wrapper');
});

await fixture('retained wrapper losing exact qId container identity invalidates lease', () => {
  const h = createHarness({ nestedBoundary: true, nestedAnswer: true });
  h.api.get(2);
  withUnlocked(h, () => {
    h.boundarySurface.nativeTestHost.removeChild(h.boundarySurface.identityCarrier);
    h.boundaryWrapper.removeAttribute('data-turn-id-container');
  });
  const result = h.api.get(2);
  equal(result.supported, false, 'identity invalid');
  equal(result.boundaryIdentityCurrent, false, 'identity not current');
  equal(result.reason, 'captured-wrapper-replaced', 'lost carrier reason');
  equal(result.leaseCurrent, false, 'lease invalid');
});

await fixture('external page-unit repair restores order using the same retained lease', () => {
  const h = createHarness({ nestedBoundary: true, nestedAnswer: true });
  h.api.get(2);
  const lease = h.leases.get(2);
  withUnlocked(h, () => {
    h.boundarySurface.nativeTestHost.removeChild(h.boundarySurface.identityCarrier);
    h.flow.insertBefore(h.sentinel, h.answerWrapper);
    h.flow.insertBefore(h.divider, h.answerWrapper);
  });
  equal(h.api.get(2).pageUnitOrderCurrent, false, 'drift observed');
  withUnlocked(h, () => {
    h.flow.insertBefore(h.sentinel, h.boundaryWrapper);
    h.flow.insertBefore(h.divider, h.boundaryWrapper);
  });
  const repaired = h.api.get(2);
  equal(repaired.supported, true, 'identity remains supported');
  equal(repaired.source, 'same-generation-captured-wrapper', 'same captured source');
  equal(repaired.pageUnitOrderCurrent, true, 'placement current again');
  equal(repaired.pageUnitOrderReason, null, 'repair reason cleared');
  equal(repaired.placementRepairRequired, false, 'repair no longer required');
  ok(h.leases.get(2) === lease, 'same retained lease used');
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

await fixture('parent Page 1 shortcut bypasses exact authority and transition guards', () => {
  const mounted = createHarness({
    pageNum: 1,
    nestedBoundary: true,
    nestedAnswer: true,
    productionSource: PAGE1_PARENT_PAGE_SOURCE,
  });
  const result = mounted.api.get(1);
  equal(result.supported, true, 'synthetic support');
  equal(result.reason, 'active-thread-start', 'synthetic reason');
  equal(result.pageStartOrder, 1, 'order one');
  equal(result.source, null, 'no exact source');
  equal(result.boundarySectionMounted, false, 'mounted qId ignored');
  equal(result.boundaryWrapperConnected, false, 'wrapper not captured');
  equal(result.leaseCurrent, false, 'no lease');
  equal(mounted.leases.size, 0, 'lease map empty');

  const streaming = createHarness({
    pageNum: 1,
    nestedBoundary: true,
    streaming: true,
    productionSource: PAGE1_PARENT_PAGE_SOURCE,
  }).api.get(1);
  equal(streaming.supported, true, 'streaming bypassed');
  equal(streaming.reason, 'active-thread-start', 'streaming guard bypassed');

  const transition = createHarness({
    pageNum: 1,
    nestedBoundary: true,
    branchTransition: true,
    productionSource: PAGE1_PARENT_PAGE_SOURCE,
  }).api.get(1);
  equal(transition.supported, true, 'branch transition bypassed');
  equal(transition.reason, 'active-thread-start', 'transition guard bypassed');
});

await fixture('corrected Page 1 resolves the exact order-one qId surface', () => {
  const h = createHarness({ pageNum: 1, nestedBoundary: true, nestedAnswer: true });
  const result = h.api.get(1);
  equal(result.supported, true, 'supported');
  equal(result.reason, null, 'no failure');
  equal(result.pageStartOrder, 1, 'order one');
  equal(result.qId, 'q-1', 'exact canonical qId');
  equal(result.isThreadStart, true, 'thread-start diagnostic');
  equal(result.boundarySectionMounted, true, 'exact surface mounted');
  equal(result.boundaryDomRole, 'user', 'rendered user role');
});

await fixture('corrected Page 1 mounted source is exact product qId', () => {
  const result = createHarness({ pageNum: 1, nestedBoundary: true }).api.get(1);
  equal(result.source, 'exact-mounted-product-qid', 'exact source');
  equal(result.boundaryIdentityCurrent, true, 'identity current');
  equal(result.pageUnitOrderCurrent, true, 'page unit current');
  equal(result.leaseCurrent, true, 'lease current');
});

await fixture('corrected Page 1 captures the exact wrapper lease', () => {
  const h = createHarness({ pageNum: 1, nestedBoundary: true });
  h.api.get(1);
  equal(h.leases.size, 1, 'one lease');
  equal(h.leases.get(1).qId, 'q-1', 'lease qId');
  ok(h.leases.get(1).boundaryWrapper === h.boundaryWrapper, 'exact wrapper retained');
});

await fixture('corrected Page 1 section unmount retains its wrapper lease', () => {
  const h = createHarness({ pageNum: 1, nestedBoundary: true });
  equal(h.api.get(1).supported, true, 'initial capture');
  const lease = h.leases.get(1);
  withUnlocked(h, () => h.boundaryWrapper.removeChild(h.boundarySurface.nativeTestHost));
  const result = h.api.get(1);
  equal(result.supported, true, 'captured support');
  equal(result.source, 'same-generation-captured-wrapper', 'captured source');
  equal(result.boundarySectionMounted, false, 'section absent');
  equal(result.boundaryWrapperConnected, true, 'wrapper retained');
  ok(h.leases.get(1) === lease, 'same lease');
});

await fixture('corrected Page 1 wrapper replacement invalidates its lease', () => {
  const h = createHarness({ pageNum: 1, nestedBoundary: true });
  h.api.get(1);
  withUnlocked(h, () => {
    const replacement = wrapperWithSection('q-1', 'user', 'replacement-one', h.guard);
    replacement.setAttribute('data-turn-id-container', 'q-1');
    h.flow.replaceChild(replacement, h.boundaryWrapper);
  });
  const result = h.api.get(1);
  equal(result.supported, false, 'unsupported');
  equal(result.reason, 'captured-wrapper-replaced', 'replacement detected');
  equal(result.leaseCurrent, false, 'lease invalid');
});

await fixture('corrected Page 1 wrapper disconnection invalidates its lease', () => {
  const h = createHarness({ pageNum: 1, nestedBoundary: true });
  h.api.get(1);
  withUnlocked(h, () => h.flow.removeChild(h.boundaryWrapper));
  const result = h.api.get(1);
  equal(result.reason, 'captured-wrapper-replaced', 'disconnection detected');
  equal(result.boundaryIdentityCurrent, false, 'identity invalid');
  equal(result.leaseCurrent, false, 'lease invalid');
});

await fixture('corrected Page 1 wrapper losing qId identity invalidates its lease', () => {
  const h = createHarness({ pageNum: 1, nestedBoundary: true });
  h.api.get(1);
  withUnlocked(h, () => {
    h.boundaryWrapper.removeChild(h.boundarySurface.nativeTestHost);
    h.boundaryWrapper.removeAttribute('data-turn-id-container');
  });
  const result = h.api.get(1);
  equal(result.reason, 'captured-wrapper-replaced', 'identity loss detected');
  equal(result.leaseCurrent, false, 'lease invalid');
});

await fixture('corrected Page 1 flow-root replacement rebinds through the live divider parent', () => {
  const h = createHarness({ pageNum: 1, nestedBoundary: true });
  h.api.get(1);
  const replacement = node('DIV', 'replacement-flow-one', h.guard);
  withUnlocked(h, () => {
    for (const child of [...h.flow.children]) replacement.appendChild(child);
    h.thread.replaceChild(replacement, h.flow);
  });
  const result = h.api.get(1);
  equal(result.supported, true, 'identity re-proven in the live flow root');
  equal(result.leaseCurrent, true, 'lease rebinds to the replacement flow root');
});

await fixture('corrected Page 1 scope changes invalidate its lease', () => {
  const generation = createHarness({ pageNum: 1 });
  generation.api.get(1);
  generation.status.generation = 2;
  generation.projection.routeGeneration = 2;
  generation.graphScope.generation = 2;
  equal(generation.api.get(1).reason, 'boundary-scope-changed', 'generation');

  const fingerprint = createHarness({ pageNum: 1 });
  fingerprint.api.get(1);
  fingerprint.indexState.sourceFingerprint = 'djb2:page-one-next';
  fingerprint.status.canonicalFingerprint = 'djb2:page-one-next';
  fingerprint.projection.fingerprint = 'djb2:page-one-next';
  equal(fingerprint.api.get(1).reason, 'boundary-scope-changed', 'effective fingerprint');

  const graph = createHarness({ pageNum: 1 });
  graph.api.get(1);
  graph.graphScope.fingerprint = 'djb2:page-one-graph-next';
  equal(graph.api.get(1).reason, 'boundary-scope-changed', 'graph fingerprint');

  const route = createHarness({ pageNum: 1 });
  route.api.get(1);
  route.status.routeKey = '/c/page-one-other';
  route.graphScope.routeKey = '/c/page-one-other';
  equal(route.api.get(1).reason, 'boundary-scope-changed', 'route');

  const chat = createHarness({ pageNum: 1 });
  chat.api.get(1);
  chat.status.chatId = 'page-one-other-chat';
  chat.projection.chatId = 'page-one-other-chat';
  chat.graphScope.chatId = 'page-one-other-chat';
  equal(chat.api.get(1).reason, 'boundary-scope-changed', 'chat');
});

await fixture('corrected Page 1 streaming is unsupported', () => {
  const result = createHarness({ pageNum: 1, nestedBoundary: true, streaming: true }).api.get(1);
  equal(result.supported, false, 'unsupported');
  equal(result.reason, 'streaming-active', 'streaming reason');
});

await fixture('corrected Page 1 branch transition is unsupported', () => {
  const result = createHarness({
    pageNum: 1,
    nestedBoundary: true,
    branchTransition: true,
  }).api.get(1);
  equal(result.supported, false, 'unsupported');
  equal(result.reason, 'boundary-scope-changed', 'transition reason');
});

await fixture('corrected Page 1 test ID remains diagnostic only', () => {
  const a = createHarness({
    pageNum: 1,
    boundaryTestId: 'conversation-turn-page-one-alpha',
  }).api.get(1);
  const b = createHarness({
    pageNum: 1,
    boundaryTestId: 'conversation-turn-page-one-beta',
  }).api.get(1);
  equal(a.supported, true, 'first supported');
  equal(b.supported, true, 'second supported');
  equal(a.boundaryTestId, 'conversation-turn-page-one-alpha', 'first diagnostic');
  equal(b.boundaryTestId, 'conversation-turn-page-one-beta', 'second diagnostic');
});

await fixture('corrected Page 1 public result is frozen and DOM-free', () => {
  const result = createHarness({ pageNum: 1, nestedBoundary: true }).api.get(1);
  assertDeepFrozen(result);
  equal(containsDomNode(result), false, 'DOM free');
});

await fixture('corrected Page 1 read is mutation free', () => {
  const h = createHarness({ pageNum: 1, nestedBoundary: true });
  h.api.get(1);
  assertSafetyZero(h.safety);
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
