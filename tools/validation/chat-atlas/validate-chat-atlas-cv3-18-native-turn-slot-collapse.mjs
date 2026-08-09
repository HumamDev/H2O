#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const PAGE_PATH = 'src-runtime-base/1C1b.🔴📑 Thread Pages Controller 📑.js';
const CORE_PATH = 'src-runtime-base/1A1b.🟥🗺️ MiniMap Core 🧱🗺️.js';
const SKIN_PATH = 'src-runtime-base/1A1e.🟥🗺️ MiniMap Skin 🖐🗺️.js';
const PAGE_SOURCE = fs.readFileSync(path.join(ROOT, PAGE_PATH), 'utf8');
// The chat page's structural implementation moved out of MiniMap Core into
// 0C3a Chat Page Structure Engine, so the MiniMap source read here is that
// file plus the engine the code now lives in. No assertion below is altered:
// positive checks and by-name function extraction still find the code, and
// negative checks get strictly stronger, because a forbidden pattern must now
// be absent from both files instead of from MiniMap Core alone.
const STRUCTURE_PATH = 'src-runtime-base/0C3a.⬛️📐 Chat Page Structure Engine 📐.js';
const STRUCTURE_SOURCE = fs.readFileSync(path.join(ROOT, STRUCTURE_PATH), 'utf8');
const CORE_SOURCE = `${fs.readFileSync(path.join(ROOT, CORE_PATH), 'utf8')}\n${STRUCTURE_SOURCE}`;
const SKIN_SOURCE = fs.readFileSync(path.join(ROOT, SKIN_PATH), 'utf8');
const PARENT_ROOT = '/Users/hobayda/H2OCode/repos/h2o-platforms/cockpit-pro/worktrees/h2o-cp-collapse-unavailable-feedback-1f3d1c83-20260729T191656Z';
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
    if (String(this.style.getPropertyValue('display')).toLowerCase() === 'none') return 0;
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

function nativeSlot(ordinal, mounted = false) {
  const slot = new FakeElement('DIV', 'host-native-turn-slot host-virtualized-item');
  slot.hostOwned = true;
  slot.lastKnownHeight = `${580 + (ordinal % 13)}px`;
  slot.layoutHeight = ordinal <= 71 ? (ordinal === 71 ? 627 : 588) : 0;
  slot.setAttribute('data-fixture-slot', String(ordinal));
  if (mounted) slot.appendChild(sectionForOrdinal(ordinal));
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

function createFlow({
  pairCount = 39,
  mounted = [1, 12, 39, 50, 74, 78],
  misplacedPage2 = true,
  includeTitleList = true,
} = {}) {
  const flow = new FakeElement('DIV', 'host-thread-flow');
  flow.setAttribute('id', 'thread');
  const page1Divider = h2oNode('divider', 1);
  const page2Divider = h2oNode('divider', 2);
  const titleList = h2oNode('title-list', 1);
  const sentinel = h2oNode('sentinel', 1);
  const minimap = h2oNode('minimap');
  const composer = new FakeElement('FORM');
  const mountedSet = new Set(mounted.filter((ordinal) => ordinal <= pairCount * 2));
  const slots = Array.from({ length: pairCount * 2 }, (_unused, index) => (
    nativeSlot(index + 1, mountedSet.has(index + 1))
  ));
  flow.appendChild(page1Divider);
  if (includeTitleList) flow.appendChild(titleList);
  flow.appendChild(sentinel);
  if (pairCount > 25 && misplacedPage2) {
    for (const slot of slots.slice(0, 75)) flow.appendChild(slot);
    flow.appendChild(page2Divider);
    for (const slot of slots.slice(75)) flow.appendChild(slot);
  } else {
    for (const slot of slots) flow.appendChild(slot);
    if (pairCount > 25) flow.appendChild(page2Divider);
  }
  flow.appendChild(minimap);
  flow.appendChild(composer);
  return { flow, slots, page1Divider, page2Divider, titleList, sentinel, minimap, composer };
}

function createDocument(flow) {
  return {
    body: new FakeElement('BODY'),
    documentElement: new FakeElement('HTML'),
    createElement: (tag) => new FakeElement(tag),
    querySelectorAll: (selector) => queryAll(flow, selector, true),
    querySelector: (selector) => queryAll(flow, selector, true)[0] || null,
  };
}

function createPageHarness(options = {}) {
  const geometry = createFlow(options);
  const pairCount = options.pairCount || 39;
  const document = createDocument(geometry.flow);
  const members = pageMembers(pairCount);
  const status = {
    source: options.source || 'canonical',
    overlayActive: options.source === 'selected-path-overlay',
    count: pairCount,
    canonicalFingerprint: options.fingerprint || `fp-${pairCount}`,
    chatId: 'chat',
    routeKey: '/c/chat',
    generation: options.generation || 7,
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
  const model = {
    source: status.source,
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
    ${extractFunction(PAGE_SOURCE, 'turnNumberOfSection')}
    ${extractFunction(PAGE_SOURCE, 'getTurnAnchorNode')}
    ${extractFunction(PAGE_SOURCE, 'collapsedNativeRangeKey')}
    ${extractFunction(PAGE_SOURCE, 'collapsedBoundaryStatusIdentity')}
    ${extractFunction(PAGE_SOURCE, 'exactNativeStartSection')}
    ${extractFunction(PAGE_SOURCE, 'frozenCollapsedBoundaryResult')}
    ${extractFunction(PAGE_SOURCE, 'nativeTurnSlotClassSignature')}
    ${extractFunction(PAGE_SOURCE, 'nativeTurnSlotLastKnownHeight')}
    ${extractFunction(PAGE_SOURCE, 'isNativeTurnSlotExcluded')}
    ${extractFunction(PAGE_SOURCE, 'nativeTurnSlotMountedIdentity')}
    ${extractFunction(PAGE_SOURCE, 'frozenNativeTurnSlotSequence')}
    ${extractFunction(PAGE_SOURCE, 'resolveNativeTurnSlotSequence')}
    ${extractFunction(PAGE_SOURCE, 'getCollapsedExactBoundaryReadiness')}
    ${extractFunction(PAGE_SOURCE, 'getCollapsedNativeBoundaryReadiness')}
    ${extractFunction(PAGE_SOURCE, 'isCollapsedNativeRangeExcluded')}
    ${extractFunction(PAGE_SOURCE, 'directNodePresentationPages')}
    ${extractFunction(PAGE_SOURCE, 'releaseCollapsedNativeRange')}
    ${extractFunction(PAGE_SOURCE, 'applyCollapsedNativeRange')}
    return Object.freeze({
      resolve: resolveNativeTurnSlotSequence,
      readiness: getCollapsedNativeBoundaryReadiness,
      apply: applyCollapsedNativeRange,
      release: releaseCollapsedNativeRange,
    });
  })()`, {
    injectedDocument: document,
    injectedElement: FakeElement,
    injectedStatus: status,
    injectedModel: model,
    injectedSafety: safety,
    localStorage: new Proxy({}, { set() { safety.storageWrites += 1; throw new Error('storage-write'); } }),
    sessionStorage: new Proxy({}, { set() { safety.storageWrites += 1; throw new Error('session-write'); } }),
    fetch: () => { safety.networkCalls += 1; throw new Error('network'); },
    setInterval: () => { safety.polling += 1; throw new Error('polling'); },
    MutationObserver: class {
      constructor() { safety.broadObservers += 1; throw new Error('observer'); }
    },
  });
  return { ...geometry, document, api, model, status, safety };
}

function createCoreOrderingHarness(pageHarness) {
  const state = {
    identity: '',
    sentinels: new Map(),
    pendingDividers: new Map(),
    reconcileInFlight: false,
    hydrationRequested: new Set(),
    last: null,
  };
  for (let pageNum = 1; pageNum <= pageHarness.model.pageCount; pageNum += 1) {
    const start = h2oNode('sentinel', pageNum);
    const end = h2oNode('sentinel', pageNum);
    end.setAttribute('data-h2o-chat-page-boundary', `page-${pageNum}-end`);
    state.sentinels.set(`${pageNum}:start`, start);
    state.sentinels.set(`${pageNum}:end`, end);
  }
  const sequence = pageHarness.api.resolve();
  const pages = pageHarness.model.pages.map((page) => {
    const nativeStartOrdinal = ((page.pageNo - 1) * 25 * 2) + 1;
    const nativeEndOrdinal = Math.min(page.pageNo * 25 * 2, sequence.expectedSlotCount);
    return {
      pageNum: page.pageNo,
      startOrder: page.startOrder,
      endOrder: page.endOrder,
      records: [],
      artifacts: [],
      exactStart: null,
      earliest: null,
      latest: null,
      titleListRoot: page.pageNo === 1 ? pageHarness.titleList : null,
      nativeStartOrdinal,
      nativeEndOrdinal,
      nativeStartSlot: sequence.slots[nativeStartOrdinal - 1]?.element || null,
      nativeEndSlot: sequence.slots[nativeEndOrdinal - 1]?.element || null,
      nextNativeStartSlot: sequence.slots[nativeEndOrdinal]?.element || null,
    };
  });
  const model = {
    identity: `chat|${sequence.source}|${sequence.count}|${sequence.fingerprint}`,
    source: sequence.source,
    count: sequence.count,
    pageCount: pageHarness.model.pageCount,
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
    const createChatPageDivider = (pageNum) => {
      const divider = injectedCreateDivider(pageNum);
      return divider;
    };
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
      enforce: (model, candidates) => enforceChatPageUnitOrder(model, candidates, 'cv3.18', placeNode),
    });
  })()`, {
    injectedState: state,
    injectedCreateDivider: (pageNum) => h2oNode('divider', pageNum),
  });
  const candidates = new Map();
  candidates.set(1, [pageHarness.page1Divider]);
  if (pageHarness.model.pageCount > 1) candidates.set(2, [pageHarness.page2Divider]);
  return { api, state, model, candidates };
}

function positiveGeometry(slots) {
  const heights = slots.map((slot) => slot.renderedHeight()).filter((height) => height > 0);
  return { count: heights.length, total: heights.reduce((sum, height) => sum + height, 0) };
}

await fixture('parent 41k footprint reproduced from accepted real parent validator', () => {
  const output = execFileSync('node', [
    'tools/validation/chat-atlas/validate-chat-atlas-cv3-16-collapsed-page-layout-stability.mjs',
  ], { cwd: PARENT_ROOT, encoding: 'utf8' });
  ok(output.includes('parent real projection reproduces 41,823px retained-footprint failure'), 'real parent fixture executed');
  const harness = createPageHarness();
  equal(harness.slots.slice(0, 75).length, 75, '75 intermediate slots');
  equal(positiveGeometry(harness.slots.slice(0, 75)).count, 71, '71 positive boxes');
  equal(positiveGeometry(harness.slots.slice(0, 75)).total, 41787, 'measured retained height');
});

await fixture('canonical 39 resolves exactly 78 native slots', () => {
  const result = createPageHarness().api.resolve();
  equal(result.ready, true, 'sequence ready');
  equal(result.expectedSlotCount, 78, 'expected slots');
  equal(result.actualSlotCount, 78, 'actual slots');
});

await fixture('mounted test id N calibrates to slot ordinal N', () => {
  const result = createPageHarness().api.resolve();
  for (const identity of result.calibrationIdentities) equal(identity.ordinal, Number(identity.testId.split('-').pop()), identity.testId);
});

await fixture('early middle and late calibration identities are exact', () => {
  const ids = createPageHarness().api.resolve().calibrationIdentities.map((entry) => entry.ordinal);
  ok(ids.some((ordinal) => ordinal <= 26), 'early identity');
  ok(ids.some((ordinal) => ordinal > 26 && ordinal <= 52), 'middle identity');
  ok(ids.some((ordinal) => ordinal > 52), 'late identity');
});

await fixture('section unmount leaves stable slot ordinal', () => {
  const harness = createPageHarness();
  const before = harness.api.resolve();
  const slot = harness.slots[38];
  const section = slot.querySelector('[data-testid^="conversation-turn-"]');
  slot.hostOwned = false;
  slot.removeChild(section);
  slot.hostOwned = true;
  const after = harness.api.resolve();
  equal(after.ready, true, 'still ready');
  equal(after.slots[38].element, before.slots[38].element, 'same slot');
  equal(after.slots[38].ordinal, 39, 'same ordinal');
});

await fixture('sectionless slot retains structural classification', () => {
  const result = createPageHarness().api.resolve();
  equal(result.slots[50].mountedTestId, '', 'turn 51 unmounted');
  equal(result.slots[50].structuralClassification, 'sectionless-last-known-height', 'sectionless signature');
});

await fixture('H2O divider title-list sentinel and UI nodes are excluded', () => {
  const harness = createPageHarness();
  const elements = new Set(harness.api.resolve().slots.map((slot) => slot.element));
  for (const node of [harness.page1Divider, harness.page2Divider, harness.titleList, harness.sentinel, harness.minimap, harness.composer]) {
    equal(elements.has(node), false, 'H2O/UI node excluded');
  }
});

await fixture('Page 1 range resolves to slots 1 through 50', () => {
  const readiness = createPageHarness().api.readiness(1);
  equal(readiness.ready, true, 'ready');
  equal(readiness.nativeStartOrdinal, 1, 'start');
  equal(readiness.nativeEndOrdinal, 50, 'end');
});

await fixture('Page 2 starts at slot 51 with conversation-turn-51 unmounted', () => {
  const harness = createPageHarness();
  equal(harness.slots[50].querySelector('[data-testid="conversation-turn-51"]'), null, 'turn 51 absent');
  const readiness = harness.api.readiness(1);
  equal(readiness.ready, true, 'slot readiness succeeds');
  equal(readiness.nextPageNativeStart, harness.slots[50], 'exact ordinal boundary');
});

await fixture('Page 2 slots 51 through 73 never become Page 1', () => {
  const harness = createPageHarness();
  harness.api.apply(harness.api.readiness(1));
  for (const slot of harness.slots.slice(50, 73)) equal(slot.hasAttribute('data-cgxui-chat-page-native-hidden'), false, 'Page 2 untouched');
});

await fixture('collapse hides exactly 50 native slots', () => {
  const harness = createPageHarness();
  const result = harness.api.apply(harness.api.readiness(1));
  equal(result.ok, true, 'collapse succeeds');
  equal(result.hidden, 50, 'exact hidden count');
  equal(harness.slots.filter((slot) => slot.hasAttribute('data-cgxui-chat-page-native-hidden')).length, 50, '50 markers');
});

await fixture('Page 1 title list remains present', () => {
  const harness = createPageHarness();
  harness.api.apply(harness.api.readiness(1));
  equal(harness.titleList.isConnected, true, 'title list connected');
  equal(harness.titleList.getAttribute('data-page-num'), '1', 'Page 1 list');
});

await fixture('Page 2 divider follows title unit and precedes slot 51', () => {
  const harness = createPageHarness();
  const core = createCoreOrderingHarness(harness);
  harness.api.apply(harness.api.readiness(1));
  core.api.enforce(core.model, core.candidates);
  const order = harness.flow.children;
  const titleIndex = order.indexOf(harness.titleList);
  const dividerIndex = order.indexOf(harness.page2Divider);
  const slot51Index = order.indexOf(harness.slots[50]);
  ok(titleIndex < dividerIndex, 'title before Page 2');
  ok(dividerIndex < slot51Index, 'Page 2 before slot 51');
  equal(order.slice(titleIndex + 1, dividerIndex).every((node) => node.hasAttribute('data-h2o-chat-page-boundary')), true, 'only inert sentinels between');
});

await fixture('residual title-list to Page 2 gap stays below 200px', () => {
  const harness = createPageHarness();
  const core = createCoreOrderingHarness(harness);
  harness.api.apply(harness.api.readiness(1));
  core.api.enforce(core.model, core.candidates);
  const children = harness.flow.children;
  const from = children.indexOf(harness.titleList) + 1;
  const to = children.indexOf(harness.page2Divider);
  const residual = children.slice(from, to).reduce((sum, node) => sum + node.renderedHeight(), 0);
  ok(residual < 200, `residual ${residual}`);
});

await fixture('ten host reinflation attempts cannot restore Page 1', () => {
  const harness = createPageHarness();
  harness.api.apply(harness.api.readiness(1));
  for (let attempt = 0; attempt < 10; attempt += 1) {
    for (const slot of harness.slots.slice(0, 50)) slot.layoutHeight = 50000 + attempt;
    equal(positiveGeometry(harness.slots.slice(0, 50)).total, 0, `attempt ${attempt + 1}`);
  }
});

await fixture('expansion clears exactly Page 1 range', () => {
  const harness = createPageHarness();
  harness.slots[55].setAttribute('data-cgxui-chat-page-native-hidden', '2');
  harness.api.apply(harness.api.readiness(1));
  equal(harness.api.release(1), 50, '50 Page 1 markers released');
  equal(harness.slots.slice(0, 50).some((slot) => slot.hasAttribute('data-cgxui-chat-page-native-hidden')), false, 'Page 1 restored');
  equal(harness.slots[55].getAttribute('data-cgxui-chat-page-native-hidden'), '2', 'Page 2 source preserved');
});

await fixture('five collapse expand cycles have no drift', () => {
  const harness = createPageHarness();
  for (let cycle = 0; cycle < 5; cycle += 1) {
    equal(harness.api.apply(harness.api.readiness(1)).hidden, 50, `collapse ${cycle + 1}`);
    equal(harness.api.release(1), 50, `expand ${cycle + 1}`);
  }
  equal(harness.slots.some((slot) => slot.hasAttribute('data-cgxui-chat-page-native-hidden')), false, 'no marker drift');
});

await fixture('wrapper replacement re-resolves same ordinal', () => {
  const harness = createPageHarness();
  const replacement = nativeSlot(33, false);
  replacement.hostOwned = true;
  harness.flow.replaceChild(replacement, harness.slots[32]);
  harness.slots[32] = replacement;
  const result = harness.api.resolve();
  equal(result.ready, true, 'repaired');
  equal(result.slots[32].element, replacement, 'replacement acquired');
  equal(result.slots[32].ordinal, 33, 'ordinal preserved');
});

await fixture('second identical collapse performs zero mutations', () => {
  const harness = createPageHarness();
  const readiness = harness.api.readiness(1);
  equal(harness.api.apply(readiness).mutations, 50, 'first pass');
  equal(harness.api.apply(readiness).mutations, 0, 'second pass');
});

await fixture('effective 39 to 18 resolves 36 slots and removes Page 2 authority', () => {
  const harness = createPageHarness({
    pairCount: 18,
    source: 'selected-path-overlay',
    mounted: [1, 12, 24, 36],
    misplacedPage2: false,
  });
  const result = harness.api.resolve();
  equal(result.ready, true, '18 sequence ready');
  equal(result.expectedSlotCount, 36, '36 slots');
  equal(harness.model.pageCount, 1, 'one page');
});

await fixture('effective 18 to canonical 39 restores boundary 51', () => {
  const selected = createPageHarness({ pairCount: 18, source: 'selected-path-overlay', mounted: [1, 12, 24, 36] });
  equal(selected.api.resolve().expectedSlotCount, 36, 'selected count');
  const canonical = createPageHarness();
  equal(canonical.api.resolve().expectedSlotCount, 78, 'canonical count');
  equal(canonical.api.readiness(1).nextPageNativeStart, canonical.slots[50], 'boundary restored');
});

await fixture('three-page formula is generic', () => {
  const harness = createPageHarness({ pairCount: 60, mounted: [1, 40, 80, 120], misplacedPage2: false });
  const page2 = harness.api.readiness(2);
  const page3 = harness.api.readiness(3);
  equal(page2.nativeStartOrdinal, 51, 'Page 2 start');
  equal(page2.nativeEndOrdinal, 100, 'Page 2 end');
  equal(page3.nativeStartOrdinal, 101, 'Page 3 start');
  equal(page3.nativeEndOrdinal, 120, 'Page 3 end');
});

await fixture('incorrect slot count fails closed without hiding', () => {
  const harness = createPageHarness();
  const missing = harness.slots[20];
  missing.hostOwned = false;
  harness.flow.removeChild(missing);
  const readiness = harness.api.readiness(1);
  equal(readiness.ready, false, 'not ready');
  equal(harness.api.apply(readiness).mutations, 0, 'no mutation');
  equal(harness.slots.some((slot) => slot.hasAttribute('data-cgxui-chat-page-native-hidden')), false, 'nothing hidden');
});

await fixture('calibration mismatch fails closed', () => {
  const harness = createPageHarness();
  harness.slots[38].querySelector('[data-testid^="conversation-turn-"]').setAttribute('data-testid', 'conversation-turn-40');
  const result = harness.api.resolve();
  equal(result.ready, false, 'not ready');
  ok(
    result.reason === 'native-slot-mounted-structure-invalid'
      || result.reason === 'native-slot-calibration-mismatch',
    'mismatch rejected before ordinal inference'
  );
});

await fixture('stale generation and fingerprint are rejected', () => {
  const harness = createPageHarness();
  harness.status.generation = 0;
  equal(harness.api.resolve().ready, false, 'zero generation');
  harness.status.generation = 7;
  harness.status.canonicalFingerprint = '';
  equal(harness.api.resolve().ready, false, 'empty fingerprint');
});

await fixture('resolver performs no automatic navigation or scrolling', () => {
  const harness = createPageHarness();
  harness.api.resolve();
  equal(harness.safety.scrollCalls, 0, 'scroll calls');
  equal(harness.safety.networkCalls, 0, 'network calls');
  const source = extractFunction(PAGE_SOURCE, 'resolveNativeTurnSlotSequence');
  equal(/navigate|requestMount|campaign|scrollIntoView|scrollBy/.test(source), false, 'no movement path');
});

await fixture('resolver contains no nearest-neighbour or mounted-array inference', () => {
  const source = extractFunction(PAGE_SOURCE, 'resolveNativeTurnSlotSequence');
  equal(/nearest|previousElementSibling|nextElementSibling|mounted-array|conversation-turn-74/.test(source), false, 'forbidden inference absent');
  ok(source.includes('candidateSlots.length !== expectedSlotCount'), 'exact count gate');
  ok(source.includes('exact.identity.ordinal !== index + 1'), 'exact calibration gate');
});

await fixture('Thread Pages Controller remains sole native visibility writer', () => {
  const writers = execFileSync('rg', [
    '-l',
    '-g', '!chrome/**',
    'setAttribute\\([^\\n]*(ATTR_CHAT_PAGE_NATIVE_HIDDEN|data-cgxui-chat-page-native-hidden)',
    'src-runtime-base',
  ], { cwd: ROOT, encoding: 'utf8' }).trim().split('\n').filter(Boolean);
  equal(writers, [PAGE_PATH], 'single writer');
});

await fixture('collapse never reparents or removes host slots', () => {
  const source = extractFunction(PAGE_SOURCE, 'applyCollapsedNativeRange');
  equal(/appendChild|insertBefore|removeChild|\.remove\(/.test(source), false, 'marker-only collapse');
  const corePlacement = extractFunction(CORE_SOURCE, 'enforceChatPageUnitOrder');
  equal(corePlacement.includes('nativeEndSlot.parentNode'), true, 'Core only positions H2O title unit');
});

await fixture('safety surfaces remain untouched', () => {
  const harness = createPageHarness();
  harness.api.apply(harness.api.readiness(1));
  harness.api.release(1);
  equal(harness.safety.storageWrites, 0, 'storage');
  equal(harness.safety.preferenceWrites, 0, 'preferences');
  equal(harness.safety.canonicalWrites, 0, 'canonical');
  equal(harness.safety.aliasWrites, 0, 'aliases');
  equal(harness.safety.cacheWrites, 0, 'cache');
  equal(harness.safety.networkCalls, 0, 'network');
  equal(harness.safety.polling, 0, 'polling');
  equal(harness.safety.repeatingTimers, 0, 'repeating timers');
  equal(harness.safety.broadObservers, 0, 'broad observers');
  equal(harness.safety.destructiveHostRemovals, 0, 'destructive removals');
  ok(SKIN_SOURCE.includes('data-cgxui-chat-page-native-hidden'), 'existing display-none contract retained');
});

const failed = fixtures.filter((entry) => !entry.ok);
for (const entry of fixtures) {
  console.log(`${entry.ok ? 'PASS' : 'FAIL'} ${entry.name}`);
  if (!entry.ok) console.log(entry.error);
}
console.log(`Fixtures: ${fixtures.length - failed.length}/${fixtures.length}`);
console.log(`Assertions: ${assertions}`);
if (failed.length) process.exitCode = 1;
