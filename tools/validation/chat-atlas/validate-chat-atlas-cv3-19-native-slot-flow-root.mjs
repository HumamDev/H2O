#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const PAGE_PATH = 'src-runtime-base/1C1b.🔴📑 Thread Pages Controller 📑.js';
const CORE_PATH = 'src-runtime-base/1A1b.🟥🗺️ MiniMap Core 🧱🗺️.js';
const PAGE_SOURCE = fs.readFileSync(path.join(ROOT, PAGE_PATH), 'utf8');
const CORE_SOURCE = fs.readFileSync(path.join(ROOT, CORE_PATH), 'utf8');
const BASE_PAGE_SOURCE = fs.readFileSync(path.join(
  '/Users/hobayda/H2OCode/repos/h2o-platforms/cockpit-pro/worktrees',
  'h2o-cp-native-turn-slot-collapse-806501b6-20260729T211749Z',
  PAGE_PATH,
), 'utf8');

const fixtures = [];
let assertions = 0;

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
  constructor(tagName = 'DIV', className = '') {
    this.tagName = String(tagName).toUpperCase();
    this.nodeType = 1;
    this.className = className;
    this.children = [];
    this.parentNode = null;
    this.parentElement = null;
    this.attrs = new Map();
    this.isConnected = true;
    this.lastKnownHeight = '';
    this.layoutHeight = 0;
    this.hostOwned = false;
    this.style = {
      values: new Map(),
      setProperty: (name, value) => this.style.values.set(String(name), String(value)),
      removeProperty: (name) => this.style.values.delete(String(name)),
      getPropertyValue: (name) => this.style.values.get(String(name)) || '',
    };
  }
  get firstChild() { return this.children[0] || null; }
  get firstElementChild() { return this.firstChild; }
  get nextSibling() {
    const index = this.parentNode?.children?.indexOf(this) ?? -1;
    return index >= 0 ? (this.parentNode.children[index + 1] || null) : null;
  }
  get nextElementSibling() { return this.nextSibling; }
  get classList() {
    return {
      contains: (value) => String(this.className).split(/\s+/).includes(String(value)),
    };
  }
  appendChild(node) { return this.insertBefore(node, null); }
  insertBefore(node, before) {
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
    if (node?.hostOwned) throw new Error('destructive-host-node-removal');
    const index = this.children.indexOf(node);
    if (index < 0) throw new Error('NotFoundError');
    this.children.splice(index, 1);
    node.parentNode = null;
    node.parentElement = null;
    node.isConnected = false;
    return node;
  }
  remove() {
    if (this.hostOwned) throw new Error('destructive-host-node-removal');
    this.parentNode?.removeChild?.(this);
  }
  setAttribute(name, value) { this.attrs.set(String(name), String(value)); }
  getAttribute(name) { return this.attrs.has(String(name)) ? this.attrs.get(String(name)) : null; }
  hasAttribute(name) { return this.attrs.has(String(name)); }
  removeAttribute(name) { this.attrs.delete(String(name)); }
  matches(selector) { return matchesSelector(this, selector); }
  querySelectorAll(selector) { return queryAll(this, selector, false); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
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
  compareDocumentPosition(other) {
    const flat = flatten(topRoot(this));
    const a = flat.indexOf(this);
    const b = flat.indexOf(other);
    return a < b ? 4 : a > b ? 2 : 0;
  }
  renderedHeight() {
    if (this.hasAttribute('data-cgxui-chat-page-native-hidden')) return 0;
    return Number(this.layoutHeight || 0);
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
  const text = String(selector || '').trim().replace(/^:scope\s*>\s*/, '');
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

function pageMembers(count = 39) {
  return Array.from({ length: count }, (_unused, index) => ({
    id: `a-${index + 1}`,
    answerId: `a-${index + 1}`,
    questionId: `q-${index + 1}`,
    turnId: `turn-${index + 1}`,
    aliasIds: [],
    turnNo: index + 1,
    type: 'answer',
  }));
}

function sectionForOrdinal(ordinal) {
  const section = new FakeElement('SECTION');
  section.setAttribute('data-testid', `conversation-turn-${ordinal}`);
  section.setAttribute('data-turn', ordinal % 2 ? 'user' : 'assistant');
  section.setAttribute('data-turn-id', `${ordinal % 2 ? 'q' : 'a'}-${Math.ceil(ordinal / 2)}`);
  return section;
}

function nativeSlot(ordinal, mounted = false, depthVariant = 0) {
  const slot = new FakeElement('DIV', 'host-native-turn-slot host-virtualized-item');
  slot.hostOwned = true;
  slot.lastKnownHeight = `${580 + (ordinal % 13)}px`;
  slot.layoutHeight = 588;
  slot.setAttribute('data-fixture-slot', String(ordinal));
  if (!mounted) return slot;
  const section = sectionForOrdinal(ordinal);
  if (depthVariant === 0) {
    slot.appendChild(section);
  } else {
    let owner = slot;
    for (let level = 0; level < depthVariant; level += 1) {
      const wrapper = new FakeElement('DIV', `host-turn-inner depth-${level + 1}`);
      owner.appendChild(wrapper);
      owner = wrapper;
    }
    owner.appendChild(section);
    // A host sibling makes the local only-child climb stop below the common
    // direct-flow root. The mounted section still maps exactly to `slot`.
    slot.appendChild(new FakeElement('SPAN', 'host-turn-decoration'));
  }
  return slot;
}

function h2oNode(kind, pageNum = 0) {
  const node = new FakeElement(kind === 'sentinel' ? 'SPAN' : 'DIV');
  if (kind === 'divider') {
    node.className = 'cgxui-chat-page-divider';
    node.setAttribute('data-page-num', String(pageNum));
  } else if (kind === 'title-list') {
    node.setAttribute('data-cgxui', 'chat-page-title-list-synth');
    node.setAttribute('data-page-num', String(pageNum));
  } else if (kind === 'sentinel') {
    node.setAttribute('data-h2o-chat-page-boundary', `page-${pageNum}-start`);
  } else if (kind === 'minimap') {
    node.setAttribute('id', 'cgx-mm-root');
  }
  return node;
}

const REQUIRED_MOUNTED = [1, 12, 19, 27, 33, 39, 44, 50, 51, 58, 66, 70, 74, 78];

function createLiveShape({
  pairCount = 39,
  mounted = REQUIRED_MOUNTED,
  source = 'canonical',
  generation = 7,
  fingerprint = `fp-${pairCount}`,
  extraEmpty = false,
} = {}) {
  const thread = new FakeElement('DIV', 'thread-root');
  thread.setAttribute('id', 'thread');
  const flow = new FakeElement('DIV', 'host-thread-flow');
  thread.appendChild(flow);
  const mountedSet = new Set(mounted.filter((ordinal) => ordinal <= pairCount * 2));
  const slots = Array.from({ length: pairCount * 2 }, (_unused, index) => {
    const ordinal = index + 1;
    const depth = mountedSet.has(ordinal) ? ordinal % 3 : 0;
    return nativeSlot(ordinal, mountedSet.has(ordinal), depth);
  });
  const exclusions = [
    h2oNode('divider', 1),
    h2oNode('sentinel', 1),
    h2oNode('sentinel', 1),
    h2oNode('title-list', 1),
    h2oNode('divider', 2),
    h2oNode('sentinel', 2),
    h2oNode('sentinel', 2),
    h2oNode('minimap'),
    new FakeElement('FORM'),
  ];
  let exclusionIndex = 0;
  for (let index = 0; index < slots.length; index += 1) {
    if ([0, 10, 24, 35, 49, 50, 62, 73, 77].includes(index)) {
      flow.appendChild(exclusions[exclusionIndex]);
      exclusionIndex += 1;
    }
    flow.appendChild(slots[index]);
  }
  if (extraEmpty) flow.appendChild(new FakeElement('DIV', 'unrelated-empty-host-box'));
  while (exclusionIndex < exclusions.length) {
    flow.appendChild(exclusions[exclusionIndex]);
    exclusionIndex += 1;
  }
  const members = pageMembers(pairCount);
  const status = {
    source,
    overlayActive: source === 'selected-path-overlay',
    count: pairCount,
    canonicalFingerprint: fingerprint,
    chatId: 'chat',
    routeKey: '/c/chat',
    generation,
  };
  const model = {
    source,
    count: pairCount,
    pageSize: 25,
    pageCount: Math.ceil(pairCount / 25),
    coherent: true,
    pages: [],
  };
  for (let pageNo = 1; pageNo <= model.pageCount; pageNo += 1) {
    const startOrder = ((pageNo - 1) * 25) + 1;
    const endOrder = Math.min(pairCount, pageNo * 25);
    model.pages.push({
      pageNo,
      startOrder,
      endOrder,
      turnRecords: members.slice(startOrder - 1, endOrder),
    });
  }
  const document = {
    body: new FakeElement('BODY'),
    documentElement: new FakeElement('HTML'),
    createElement: (tag) => new FakeElement(tag),
    querySelectorAll: (selector) => queryAll(thread, selector, true),
    querySelector: (selector) => queryAll(thread, selector, true)[0] || null,
  };
  const safety = {
    storageWrites: 0,
    preferenceWrites: 0,
    canonicalWrites: 0,
    aliasWrites: 0,
    cacheWrites: 0,
    networkCalls: 0,
    polling: 0,
    repeatingTimers: 0,
    broadObservers: 0,
    destructiveHostRemovals: 0,
    scrollCalls: 0,
  };
  return {
    thread,
    flow,
    slots,
    exclusions,
    document,
    status,
    model,
    safety,
    pairCount,
  };
}

function createResolverHarness(source, options = {}) {
  const shape = createLiveShape(options);
  const api = vm.runInNewContext(`(() => {
    const document = injectedDocument;
    const W = {
      getComputedStyle: (node) => ({
        getPropertyValue: (name) => name === '--last-known-height' ? String(node.lastKnownHeight || '') : '',
      }),
      scrollBy() { injectedSafety.scrollCalls += 1; },
      dispatchEvent() {},
    };
    const Node = { DOCUMENT_POSITION_FOLLOWING: 4, DOCUMENT_POSITION_PRECEDING: 2 };
    const Element = injectedElement;
    const CSS = { escape: (value) => String(value) };
    const TITLE_LIST_PAGE_SIZE = 25;
    const TURN_HOST_SEL = '[data-testid="conversation-turn"], [data-testid^="conversation-turn-"]';
    const TITLE_LIST_SYNTH_SEL = '[data-cgxui="chat-page-title-list-synth"]';
    const ATTR_CHAT_PAGE_NATIVE_HIDDEN = 'data-cgxui-chat-page-native-hidden';
    const TITLE_LIST_EFFECTIVE_METHOD = Object.freeze({
      STATUS: 'getEffectivePresentationStatus',
      INDEX: 'getEffectivePresentationIndex',
      BY_QID: 'getEffectiveTurnRecordByQId',
      BY_AID: 'getEffectiveTurnRecordByAId',
    });
    const runtime = {
      getEffectivePresentationStatus: () => Object.freeze({ ...injectedStatus }),
    };
    const TURN_RUNTIME = () => runtime;
    const resolveChatId = () => 'chat';
    const buildTitleListPresentationPageModel = () => injectedModel;
    const getTurnSectionForNode = (node) => node?.matches?.(TURN_HOST_SEL)
      ? node
      : node?.querySelector?.(TURN_HOST_SEL) || null;
    const getTurnHostRole = (node) => String(
      (getTurnSectionForNode(node) || node)?.getAttribute?.('data-turn') || ''
    ).trim().toLowerCase();
    ${extractFunction(source, 'turnNumberOfSection')}
    ${extractFunction(source, 'getTurnAnchorNode')}
    ${extractFunction(source, 'collapsedNativeRangeKey')}
    ${extractFunction(source, 'collapsedBoundaryStatusIdentity')}
    ${extractFunction(source, 'exactNativeStartSection')}
    ${extractFunction(source, 'frozenCollapsedBoundaryResult')}
    ${extractFunction(source, 'frozenNativeTurnSlotSequence')}
    ${extractFunction(source, 'nativeTurnSlotClassSignature')}
    ${extractFunction(source, 'nativeTurnSlotLastKnownHeight')}
    ${extractFunction(source, 'isNativeTurnSlotExcluded')}
    ${extractFunction(source, 'nativeTurnSlotMountedIdentity')}
    ${extractFunction(source, 'resolveNativeTurnSlotSequence')}
    ${extractFunction(source, 'getCollapsedExactBoundaryReadiness')}
    ${extractFunction(source, 'getCollapsedNativeBoundaryReadiness')}
    ${extractFunction(source, 'isCollapsedNativeRangeExcluded')}
    ${extractFunction(source, 'directNodePresentationPages')}
    ${extractFunction(source, 'releaseCollapsedNativeRange')}
    ${extractFunction(source, 'applyCollapsedNativeRange')}
    return Object.freeze({
      resolve: resolveNativeTurnSlotSequence,
      readiness: getCollapsedNativeBoundaryReadiness,
      apply: applyCollapsedNativeRange,
      release: releaseCollapsedNativeRange,
    });
  })()`, {
    injectedDocument: shape.document,
    injectedElement: FakeElement,
    injectedStatus: shape.status,
    injectedModel: shape.model,
    injectedSafety: shape.safety,
    localStorage: new Proxy({}, { set() { shape.safety.storageWrites += 1; throw new Error('storage-write'); } }),
    sessionStorage: new Proxy({}, { set() { shape.safety.storageWrites += 1; throw new Error('session-write'); } }),
    indexedDB: new Proxy({}, { get() { shape.safety.storageWrites += 1; throw new Error('indexeddb'); } }),
    fetch: () => { shape.safety.networkCalls += 1; throw new Error('network'); },
    setInterval: () => { shape.safety.polling += 1; throw new Error('polling'); },
    setTimeout: () => { shape.safety.repeatingTimers += 1; throw new Error('timer'); },
    MutationObserver: class {
      constructor() { shape.safety.broadObservers += 1; throw new Error('observer'); }
    },
  });
  return { ...shape, api };
}

function createCoreOrderingHarness(pageHarness) {
  const sequence = pageHarness.api.resolve();
  const state = {
    identity: '',
    sentinels: new Map(),
    pendingDividers: new Map(),
    reconcileInFlight: false,
    hydrationRequested: new Set(),
    last: null,
  };
  const pageCount = Math.ceil(pageHarness.pairCount / 25);
  for (let pageNum = 1; pageNum <= pageCount; pageNum += 1) {
    const start = h2oNode('sentinel', pageNum);
    const end = h2oNode('sentinel', pageNum);
    end.setAttribute('data-h2o-chat-page-boundary', `page-${pageNum}-end`);
    state.sentinels.set(`${pageNum}:start`, start);
    state.sentinels.set(`${pageNum}:end`, end);
  }
  const titleList = pageHarness.exclusions.find(
    (node) => node.getAttribute('data-cgxui') === 'chat-page-title-list-synth'
  ) || null;
  const pages = [];
  for (let pageNum = 1; pageNum <= pageCount; pageNum += 1) {
    const nativeStartOrdinal = ((pageNum - 1) * 25 * 2) + 1;
    const nativeEndOrdinal = Math.min(pageNum * 25 * 2, sequence.expectedSlotCount);
    pages.push({
      pageNum,
      startOrder: ((pageNum - 1) * 25) + 1,
      endOrder: Math.min(pageHarness.pairCount, pageNum * 25),
      records: [],
      artifacts: [],
      exactStart: null,
      earliest: null,
      latest: null,
      titleListRoot: pageNum === 1 ? titleList : null,
      nativeStartOrdinal,
      nativeEndOrdinal,
      nativeStartSlot: sequence.slots[nativeStartOrdinal - 1]?.element || null,
      nativeEndSlot: sequence.slots[nativeEndOrdinal - 1]?.element || null,
      nextNativeStartSlot: sequence.slots[nativeEndOrdinal]?.element || null,
    });
  }
  const model = {
    identity: `chat|${sequence.source}|${sequence.count}|${sequence.fingerprint}`,
    source: sequence.source,
    count: sequence.count,
    pageCount,
    pages,
  };
  const api = vm.runInNewContext(`(() => {
    const Node = { DOCUMENT_POSITION_FOLLOWING: 4, DOCUMENT_POSITION_PRECEDING: 2 };
    const ATTR_CHAT_PAGE_NUM = 'data-cgxui-chat-page-num';
    const CHAT_PAGE_BOUNDARY_ATTR = 'data-h2o-chat-page-boundary';
    const CHAT_PAGE_UNIT_OWNER = '1A1b:reconcileChatPageUnits';
    const getChatPageUnitState = () => injectedState;
    const ensureChatPageBoundarySentinels = () => ({
      state: injectedState,
      stale: [],
      keep: new Set(injectedState.sentinels.values()),
    });
    const createChatPageDivider = (pageNum) => injectedCreateDivider(pageNum);
    const getTurnPageBand = () => 'normal';
    const removeH2OChatPageUnitNode = (node) => {
      if (!node?.parentNode || node.hostOwned) return false;
      node.parentNode.removeChild(node);
      return true;
    };
    const requestChatPageUnitHydration = () => {
      throw new Error('automatic-hydration-forbidden');
    };
    const getNextTurnTestIdAfterDivider = (divider) => (
      divider?.nextSibling?.querySelector?.('[data-testid^="conversation-turn-"]')?.getAttribute?.('data-testid') || ''
    );
    ${extractFunction(CORE_SOURCE, 'compareChatPageNodes')}
    ${CORE_SOURCE.includes('function resolveChatPageTerminalArtifact(') ? extractFunction(CORE_SOURCE, 'resolveChatPageTerminalArtifact') : ''}
    ${extractFunction(CORE_SOURCE, 'resolveChatPageBoundaryAnchor')}
    ${extractFunction(CORE_SOURCE, 'enforceChatPageUnitOrder')}
    const placeNode = (parent, node, before) => {
      if (!parent || !node || before === node) return false;
      if (node.parentNode === parent && node.nextSibling === before) return false;
      parent.insertBefore(node, before || null);
      return true;
    };
    return Object.freeze({
      enforce: (model, candidates) => enforceChatPageUnitOrder(model, candidates, 'cv3.19', placeNode),
    });
  })()`, {
    injectedState: state,
    injectedCreateDivider: (pageNum) => h2oNode('divider', pageNum),
  });
  const candidates = new Map();
  candidates.set(1, pageHarness.exclusions.filter(
    (node) => node.classList.contains('cgxui-chat-page-divider')
      && node.getAttribute('data-page-num') === '1'
  ));
  if (pageCount > 1) {
    candidates.set(2, pageHarness.exclusions.filter(
      (node) => node.classList.contains('cgxui-chat-page-divider')
        && node.getAttribute('data-page-num') === '2'
    ));
  }
  return { api, state, model, candidates, titleList };
}

function positiveHeight(nodes = []) {
  return nodes.reduce((sum, node) => sum + node.renderedHeight(), 0);
}

await fixture('parent live-shape reproduction reaches the real flow-parent failure', () => {
  const harness = createResolverHarness(BASE_PAGE_SOURCE);
  equal(harness.flow.children.length, 87, '87 direct children');
  equal(harness.slots.length, 78, '78 native slots');
  equal(harness.exclusions.length, 9, '9 exclusions');
  equal(harness.document.querySelectorAll('[data-testid^="conversation-turn-"]').length, 14, '14 mounted sections');
  const result = harness.api.resolve();
  equal(result.ready, false, 'parent not ready');
  equal(result.reason, 'native-slot-flow-parent-incoherent', 'exact live failure');
  equal(result.actualSlotCount, 0, 'failure occurs before candidate count');
});

await fixture('corrected resolver selects the deepest valid flow root', () => {
  const harness = createResolverHarness(PAGE_SOURCE);
  const result = harness.api.resolve();
  equal(result.ready, true, 'ready');
  equal(result.flowRoot, harness.flow, 'deepest valid root');
  equal(result.flowRoot === harness.thread, false, 'thread ancestor rejected');
});

await fixture('varying only-child wrapper depth does not break root selection', () => {
  const harness = createResolverHarness(PAGE_SOURCE);
  const localParents = new Set(
    REQUIRED_MOUNTED.map((ordinal) => {
      const section = harness.slots[ordinal - 1].querySelector('[data-testid^="conversation-turn-"]');
      let node = section;
      while (node.parentElement?.children?.length === 1) node = node.parentElement;
      return node.parentElement;
    })
  );
  ok(localParents.size > 1, 'fixture has varied local parents');
  equal(harness.api.resolve().flowRoot, harness.flow, 'shared root recovered');
});

await fixture('each mounted section maps to one direct child under the selected root', () => {
  const harness = createResolverHarness(PAGE_SOURCE);
  const result = harness.api.resolve();
  const mountedSlots = result.slots.filter((slot) => slot.mountedTestId);
  equal(mountedSlots.length, 14, '14 exact mounted slots');
  equal(new Set(mountedSlots.map((slot) => slot.element)).size, 14, 'unique direct children');
  equal(mountedSlots.every((slot) => slot.element.parentElement === harness.flow), true, 'common parent');
});

await fixture('H2O nodes are excluded before native slot counting', () => {
  const harness = createResolverHarness(PAGE_SOURCE);
  const result = harness.api.resolve();
  const selected = new Set(result.slots.map((slot) => slot.element));
  equal(harness.exclusions.every((node) => !selected.has(node)), true, 'all nine excluded');
  equal(harness.flow.children.length, 87, 'raw count retained');
});

await fixture('canonical authority resolves exactly 78 native slots', () => {
  const result = createResolverHarness(PAGE_SOURCE).api.resolve();
  equal(result.expectedSlotCount, 78, 'expected');
  equal(result.actualSlotCount, 78, 'actual');
  equal(result.calibrated, true, 'calibrated');
});

await fixture('all required early middle and late native identities calibrate exactly', () => {
  const identities = createResolverHarness(PAGE_SOURCE).api.resolve().calibrationIdentities;
  const byOrdinal = new Map(identities.map((identity) => [identity.ordinal, identity]));
  for (const ordinal of [1, 12, 39, 50, 51, 74, 78]) {
    equal(byOrdinal.get(ordinal)?.testId, `conversation-turn-${ordinal}`, `turn ${ordinal}`);
  }
});

await fixture('Turn 51 may unmount while structural slot 51 remains ready', () => {
  const harness = createResolverHarness(PAGE_SOURCE, {
    mounted: REQUIRED_MOUNTED.filter((ordinal) => ordinal !== 51),
  });
  const result = harness.api.resolve();
  equal(result.ready, true, 'ready without mounted 51');
  equal(result.slots[50].ordinal, 51, 'slot 51 retained');
  equal(result.slots[50].mountedTestId, '', 'section absent');
});

await fixture('mounted Turn 74 remains ordinal 74 rather than Page 2 start', () => {
  const result = createResolverHarness(PAGE_SOURCE, {
    mounted: REQUIRED_MOUNTED.filter((ordinal) => ordinal !== 51),
  }).api.resolve();
  const turn74 = result.slots.find((slot) => slot.mountedTestId === 'conversation-turn-74');
  equal(turn74?.ordinal, 74, 'exact ordinal');
  equal(result.slots[50].ordinal, 51, 'Page 2 still starts at 51');
});

await fixture('Page 2 slots 51 through 73 remain untouched by Page 1 collapse', () => {
  const harness = createResolverHarness(PAGE_SOURCE, {
    mounted: REQUIRED_MOUNTED.filter((ordinal) => ordinal !== 51),
  });
  const applied = harness.api.apply(harness.api.readiness(1));
  equal(applied.ok, true, 'collapse succeeds');
  equal(harness.slots.slice(50, 73).every(
    (slot) => !slot.hasAttribute('data-cgxui-chat-page-native-hidden')
  ), true, 'Page 2 untouched');
});

await fixture('Page 1 collapse hides exactly native slots 1 through 50', () => {
  const harness = createResolverHarness(PAGE_SOURCE);
  const applied = harness.api.apply(harness.api.readiness(1));
  equal(applied.hidden, 50, '50 hidden');
  equal(harness.slots.slice(0, 50).every(
    (slot) => slot.getAttribute('data-cgxui-chat-page-native-hidden') === '1'
  ), true, 'Page 1 stamped');
});

await fixture('Page 2 divider follows the title list and precedes slot 51', () => {
  const harness = createResolverHarness(PAGE_SOURCE);
  const core = createCoreOrderingHarness(harness);
  harness.api.apply(harness.api.readiness(1));
  core.api.enforce(core.model, core.candidates);
  const children = harness.flow.children;
  const titleIndex = children.indexOf(core.titleList);
  const page2Divider = harness.exclusions.find(
    (node) => node.getAttribute('data-page-num') === '2'
      && node.classList.contains('cgxui-chat-page-divider')
  );
  const dividerIndex = children.indexOf(page2Divider);
  const slot51Index = children.indexOf(harness.slots[50]);
  ok(titleIndex < dividerIndex, 'title before Page 2');
  ok(dividerIndex < slot51Index, 'Page 2 before slot 51');
});

await fixture('residual title-list to Page 2 gap remains below 200px', () => {
  const harness = createResolverHarness(PAGE_SOURCE);
  const core = createCoreOrderingHarness(harness);
  harness.api.apply(harness.api.readiness(1));
  core.api.enforce(core.model, core.candidates);
  const page2Divider = harness.exclusions.find(
    (node) => node.getAttribute('data-page-num') === '2'
      && node.classList.contains('cgxui-chat-page-divider')
  );
  const children = harness.flow.children;
  const between = children.slice(children.indexOf(core.titleList) + 1, children.indexOf(page2Divider));
  ok(positiveHeight(between) < 200, 'bounded gap');
});

await fixture('section unmount and remount preserve the native sequence', () => {
  const harness = createResolverHarness(PAGE_SOURCE);
  const slot = harness.slots[38];
  const section = slot.querySelector('[data-testid="conversation-turn-39"]');
  const parent = section.parentElement;
  parent.removeChild(section);
  equal(harness.api.resolve().slots[38].ordinal, 39, 'unmounted ordinal');
  parent.appendChild(section);
  equal(harness.api.resolve().slots[38].mountedTestId, 'conversation-turn-39', 'remounted identity');
});

await fixture('host wrapper replacement is reacquired structurally', () => {
  const harness = createResolverHarness(PAGE_SOURCE);
  const replacement = nativeSlot(33, false);
  harness.flow.replaceChild(replacement, harness.slots[32]);
  harness.slots[32] = replacement;
  const result = harness.api.resolve();
  equal(result.ready, true, 'ready');
  equal(result.slots[32].element, replacement, 'replacement acquired');
  equal(result.slots[32].ordinal, 33, 'ordinal preserved');
});

await fixture('wrong common ancestor is rejected in favor of the deepest valid root', () => {
  const harness = createResolverHarness(PAGE_SOURCE);
  const result = harness.api.resolve();
  equal(result.flowRoot, harness.flow, 'flow selected');
  equal(result.flowRoot, harness.thread.children[0], 'exact child');
  equal(result.flowRoot === harness.thread, false, 'colliding ancestor rejected');
});

await fixture('87 raw children are accepted after filtering to 78 slots', () => {
  const harness = createResolverHarness(PAGE_SOURCE);
  const result = harness.api.resolve();
  equal(harness.flow.children.length, 87, 'raw');
  equal(result.actualSlotCount, 78, 'filtered');
});

await fixture('raw child-count equality is never required', () => {
  const source = extractFunction(PAGE_SOURCE, 'resolveNativeTurnSlotSequence');
  equal(/children\.length\s*!==\s*expectedSlotCount/.test(source), false, 'no raw count gate');
  ok(source.includes('candidateSlots.length !== expectedSlotCount'), 'filtered count gate');
});

await fixture('arbitrary empty non-slot DIV is excluded', () => {
  const harness = createResolverHarness(PAGE_SOURCE, { extraEmpty: true });
  const result = harness.api.resolve();
  equal(harness.flow.children.length, 88, 'extra raw child');
  equal(result.ready, true, 'still ready');
  equal(result.actualSlotCount, 78, 'empty DIV excluded');
});

await fixture('two mounted sections colliding in one direct slot fail closed', () => {
  const harness = createResolverHarness(PAGE_SOURCE);
  const sourceSection = harness.slots[11].querySelector('[data-testid="conversation-turn-12"]');
  harness.slots[11].hostOwned = false;
  sourceSection.parentElement.removeChild(sourceSection);
  harness.slots[11].hostOwned = true;
  harness.slots[0].appendChild(sourceSection);
  const result = harness.api.resolve();
  equal(result.ready, false, 'collision rejected');
  ok(
    result.reason === 'native-slot-mounted-slot-collision'
      || result.reason === 'native-slot-mounted-structure-invalid',
    'source-grounded collision reason'
  );
});

await fixture('non-monotonic mounted calibration fails closed', () => {
  const harness = createResolverHarness(PAGE_SOURCE);
  const slot1 = harness.slots[0];
  const slot12 = harness.slots[11];
  harness.flow.insertBefore(slot12, slot1);
  const result = harness.api.resolve();
  equal(result.ready, false, 'mismatch rejected');
  equal(result.reason, 'native-slot-calibration-mismatch', 'calibration reason');
});

await fixture('stale generation and fingerprint fail closed', () => {
  const generation = createResolverHarness(PAGE_SOURCE, { generation: 0 }).api.resolve();
  equal(generation.ready, false, 'generation rejected');
  const fingerprint = createResolverHarness(PAGE_SOURCE, { fingerprint: '' }).api.resolve();
  equal(fingerprint.ready, false, 'fingerprint rejected');
});

await fixture('effective 18 resolves 36 slots and no Page 2', () => {
  const harness = createResolverHarness(PAGE_SOURCE, {
    pairCount: 18,
    source: 'selected-path-overlay',
    mounted: [1, 12, 24, 36],
  });
  const result = harness.api.resolve();
  equal(result.ready, true, 'ready');
  equal(result.actualSlotCount, 36, '36 slots');
  equal(harness.model.pageCount, 1, 'one page');
});

await fixture('effective 18 to canonical 39 restores 78 slots and boundary 51', () => {
  const selected = createResolverHarness(PAGE_SOURCE, {
    pairCount: 18,
    source: 'selected-path-overlay',
    mounted: [1, 12, 24, 36],
  });
  equal(selected.api.resolve().actualSlotCount, 36, 'selected');
  const canonical = createResolverHarness(PAGE_SOURCE);
  equal(canonical.api.resolve().actualSlotCount, 78, 'canonical');
  equal(canonical.api.readiness(1).nextPageNativeStart, canonical.slots[50], 'boundary 51');
});

await fixture('three-page native range formula remains generic', () => {
  const harness = createResolverHarness(PAGE_SOURCE, {
    pairCount: 60,
    mounted: [1, 12, 39, 50, 51, 74, 78, 100, 101, 120],
  });
  const page2 = harness.api.readiness(2);
  const page3 = harness.api.readiness(3);
  equal(page2.nativeStartOrdinal, 51, 'Page 2 start');
  equal(page2.nativeEndOrdinal, 100, 'Page 2 end');
  equal(page3.nativeStartOrdinal, 101, 'Page 3 start');
  equal(page3.nativeEndOrdinal, 120, 'Page 3 end');
});

await fixture('resolver performs no automatic navigation or scrolling', () => {
  const harness = createResolverHarness(PAGE_SOURCE);
  harness.api.resolve();
  equal(harness.safety.scrollCalls, 0, 'scroll');
  equal(harness.safety.networkCalls, 0, 'network');
  const source = extractFunction(PAGE_SOURCE, 'resolveNativeTurnSlotSequence');
  equal(/navigate|campaign|scrollIntoView|scrollBy|conversation-turn-74/.test(source), false, 'no forbidden path');
});

await fixture('storage cache and preference safety surfaces remain untouched', () => {
  const harness = createResolverHarness(PAGE_SOURCE);
  harness.api.resolve();
  harness.api.apply(harness.api.readiness(1));
  equal(harness.safety.storageWrites, 0, 'storage');
  equal(harness.safety.preferenceWrites, 0, 'preferences');
  equal(harness.safety.canonicalWrites, 0, 'canonical');
  equal(harness.safety.aliasWrites, 0, 'aliases');
  equal(harness.safety.cacheWrites, 0, 'cache');
  equal(harness.safety.networkCalls, 0, 'network');
});

await fixture('no polling repeating timers or broad observer are introduced', () => {
  const harness = createResolverHarness(PAGE_SOURCE);
  harness.api.resolve();
  equal(harness.safety.polling, 0, 'polling');
  equal(harness.safety.repeatingTimers, 0, 'timers');
  equal(harness.safety.broadObservers, 0, 'observers');
});

await fixture('collapse performs no host reparenting or destructive removal', () => {
  const harness = createResolverHarness(PAGE_SOURCE);
  const parents = harness.slots.map((slot) => slot.parentElement);
  harness.api.apply(harness.api.readiness(1));
  equal(harness.slots.every((slot, index) => slot.parentElement === parents[index]), true, 'parents stable');
  equal(harness.safety.destructiveHostRemovals, 0, 'no removals');
});

await fixture('second identical resolver and collapse reconciliation are mutation-free', () => {
  const harness = createResolverHarness(PAGE_SOURCE);
  const first = harness.api.resolve();
  const second = harness.api.resolve();
  equal(second.flowRoot, first.flowRoot, 'stable root');
  equal(second.slots.every((slot, index) => slot.element === first.slots[index].element), true, 'stable slots');
  const readiness = harness.api.readiness(1);
  equal(harness.api.apply(readiness).mutations, 50, 'first mutation');
  equal(harness.api.apply(readiness).mutations, 0, 'second mutation');
});

const failed = fixtures.filter((entry) => !entry.ok);
for (const entry of fixtures) {
  console.log(`${entry.ok ? 'PASS' : 'FAIL'} ${entry.name}`);
  if (!entry.ok) console.log(entry.error);
}
console.log(`Fixtures: ${fixtures.length - failed.length}/${fixtures.length}`);
console.log(`Assertions: ${assertions}`);
if (failed.length) process.exitCode = 1;
