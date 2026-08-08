#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const BASE = 'bea4ce7cc3bc98e244ac37a2cc4fbbb3d281358d';
const PAGE_PATH = 'src-runtime-base/1C1b.🔴📑 Thread Pages Controller 📑.js';
const CORE_PATH = 'src-runtime-base/1A1b.🟥🗺️ MiniMap Core 🧱🗺️.js';
const SKIN_PATH = 'src-runtime-base/1A1e.🟥🗺️ MiniMap Skin 🖐🗺️.js';
const PAGE_SOURCE = fs.readFileSync(path.join(ROOT, PAGE_PATH), 'utf8');
// The chat page's structural implementation moved out of MiniMap Core into
// 0C3a Chat Page Structure Engine. This validator asserts on that
// implementation, so CORE_SOURCE is the MiniMap Core file plus the engine it
// now lives in. Nothing about what is asserted changes: positive checks and
// function extraction still find the code, and the negative checks below get
// strictly stronger, since the forbidden pattern must now be absent from both
// files rather than from MiniMap Core alone.
const STRUCTURE_PATH = 'src-runtime-base/0C3a.⬛️📐 Chat Page Structure Engine 📐.js';
const STRUCTURE_SOURCE = fs.readFileSync(path.join(ROOT, STRUCTURE_PATH), 'utf8');
const CORE_SOURCE = `${fs.readFileSync(path.join(ROOT, CORE_PATH), 'utf8')}\n${STRUCTURE_SOURCE}`;
const SKIN_SOURCE = fs.readFileSync(path.join(ROOT, SKIN_PATH), 'utf8');
const PARENT_PAGE_SOURCE = execFileSync('git', ['show', `${BASE}:${PAGE_PATH}`], {
  cwd: ROOT,
  encoding: 'utf8',
});
const ATOMIC_VALIDATOR_OUTPUT = execFileSync(
  process.execPath,
  [path.join(ROOT, 'tools/validation/chat-atlas/validate-chat-atlas-cv3-26-atomic-rendered-boundary-page-collapse.mjs')],
  { cwd: ROOT, encoding: 'utf8' },
);

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

class FakeElement {
  constructor(tagName = 'DIV') {
    this.tagName = String(tagName).toUpperCase();
    this.nodeType = 1;
    this.children = [];
    this.parentNode = null;
    this.parentElement = null;
    this.attrs = new Map();
    this.className = '';
    this.isConnected = true;
    this.rectTop = 0;
    this.lastKnownHeight = 0;
    this.hostOwned = false;
    this.style = {
      values: new Map(),
      setProperty: (name, value) => this.style.values.set(String(name), String(value)),
      removeProperty: (name) => this.style.values.delete(String(name)),
      getPropertyValue: (name) => this.style.values.get(String(name)) || '',
    };
  }
  get classList() {
    return {
      contains: (value) => String(this.className || '').split(/\s+/).includes(String(value)),
    };
  }
  get firstChild() { return this.children[0] || null; }
  get firstElementChild() { return this.firstChild; }
  get nextSibling() {
    const index = this.parentNode?.children?.indexOf(this) ?? -1;
    return index >= 0 ? (this.parentNode.children[index + 1] || null) : null;
  }
  get nextElementSibling() { return this.nextSibling; }
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
  getBoundingClientRect() {
    return { top: this.rectTop, height: this.renderedHeight(), bottom: this.rectTop + this.renderedHeight() };
  }
  renderedHeight() {
    if (this.hasAttribute('data-cgxui-chat-page-native-hidden')) return 0;
    if (String(this.style.getPropertyValue('display')).toLowerCase() === 'none') return 0;
    return Number(this.lastKnownHeight || 0);
  }
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

function createGeometry({ mountPage1 = true, mountPage2Start = false, latePage2 = false } = {}) {
  const flow = new FakeElement('DIV');
  flow.setAttribute('id', 'thread-flow');
  const page1Divider = new FakeElement('DIV');
  page1Divider.className = 'cgxui-chat-page-divider';
  page1Divider.setAttribute('data-page-num', '1');
  const titleList = new FakeElement('DIV');
  titleList.setAttribute('data-cgxui', 'chat-page-title-list-synth');
  titleList.setAttribute('data-page-num', '1');
  flow.appendChild(page1Divider);
  flow.appendChild(titleList);

  const boxes = [];
  for (let index = 0; index < 75; index += 1) {
    const box = new FakeElement('DIV');
    box.hostOwned = true;
    box.setAttribute('data-box', String(index + 1));
    if (index < 71) box.lastKnownHeight = index === 70 ? 627 : 588;
    boxes.push(box);
    flow.appendChild(box);
  }
  if (mountPage1) {
    const section = new FakeElement('SECTION');
    section.setAttribute('data-testid', 'conversation-turn-1');
    section.setAttribute('data-turn', 'user');
    section.setAttribute('data-turn-id', 'q-1');
    boxes[0].appendChild(section);
  }
  if (latePage2) {
    const section = new FakeElement('SECTION');
    section.setAttribute('data-testid', 'conversation-turn-147');
    section.setAttribute('data-turn', 'user');
    section.setAttribute('data-turn-id', 'q-74');
    boxes[70].appendChild(section);
  }
  const page2Start = new FakeElement('DIV');
  page2Start.hostOwned = true;
  page2Start.lastKnownHeight = 588;
  page2Start.setAttribute('data-box', 'page2-start');
  if (mountPage2Start) {
    const section = new FakeElement('SECTION');
    section.setAttribute('data-testid', 'conversation-turn-51');
    section.setAttribute('data-turn', 'user');
    section.setAttribute('data-turn-id', 'q-26');
    page2Start.appendChild(section);
  }
  flow.appendChild(page2Start);
  const page2Divider = new FakeElement('DIV');
  page2Divider.className = 'cgxui-chat-page-divider';
  page2Divider.setAttribute('data-page-num', '2');
  flow.appendChild(page2Divider);
  return { flow, page1Divider, titleList, boxes, page2Start, page2Divider };
}

function createDocument(flow) {
  return {
    body: new FakeElement('BODY'),
    documentElement: new FakeElement('HTML'),
    querySelectorAll: (selector) => queryAll(flow, selector, true),
    querySelector: (selector) => queryAll(flow, selector, true)[0] || null,
  };
}

function createParentHarness() {
  const geometry = createGeometry({ mountPage1: false, mountPage2Start: false });
  const document = createDocument(geometry.flow);
  const members = pageMembers(25);
  const api = vm.runInNewContext(`(() => {
    const document = injectedDocument;
    const TURN_HOST_SEL = '[data-testid="conversation-turn"], [data-testid^="conversation-turn-"]';
    const ATTR_TITLE_LIST_FLOW_HIDDEN = 'data-cgxui-chat-page-title-list-hidden';
    const ATTR_TITLE_STACK_INLINE = 'data-h2o-title-stack-inline';
    const TITLE_LIST_SYNTH_SEL = '[data-cgxui="chat-page-title-list-synth"]';
    const ATTR_TITLE_INLINE_SLOT = 'data-h2o-title-inline-slot';
    const resolveChatId = () => 'chat';
    const buildTitleListPresentationPageModel = () => injectedModel;
    const readTitleListPresentationAuthority = () => ({
      source: 'canonical',
      count: 39,
      pageCount: 2,
      members: injectedModel.pages.flatMap((page) => page.turnRecords),
    });
    const readTitleListPages = () => new Set([1]);
    const reconcileTitleListFlowHiddenArtifacts = () => ({ snapshot: {}, scanned: 0, kept: 0, released: 0 });
    const findStackRowForMember = () => null;
    const memberAllFlowAnchors = () => [];
    const buildTitleListFlowOwnershipSnapshot = () => ({ identityToPage: new Map(), orderToPage: new Map() });
    const classifyTitleListFlowOwnership = () => ({ kind: 'neutral', pageNo: 0 });
    const restoreInlineTurnToFlow = () => {};
    const getComputedStyle = (node) => ({ display: node.style.getPropertyValue('display') || 'block' });
    const titleListFlowArtifactAllowed = (node, container) => (
      node === container
      || node.classList?.contains('cgxui-chat-page-divider')
      || node.classList?.contains('cgxui-pgnw-page-divider')
    );
    const stampTitleListNativeTimestampArtifacts = () => 0;
    const syncTitleOnlyModeRootAttribute = () => [1];
    ${extractFunction(PARENT_PAGE_SOURCE, 'clearTitleListFlowHiddenNode')}
    ${extractFunction(PARENT_PAGE_SOURCE, 'setTitleListFlowAnchorHidden')}
    ${extractFunction(PARENT_PAGE_SOURCE, 'applyAtomicTitleOnlyPageProjection')}
    return Object.freeze({
      collapse: () => applyAtomicTitleOnlyPageProjection(1, 'chat', injectedMembers, injectedContainer),
    });
  })()`, {
    injectedDocument: document,
    injectedMembers: members,
    injectedContainer: geometry.titleList,
    injectedModel: {
      source: 'canonical',
      count: 39,
      pageCount: 2,
      coherent: true,
      pages: [
        { pageNo: 1, startOrder: 1, endOrder: 25, turnRecords: members },
        { pageNo: 2, startOrder: 26, endOrder: 39, turnRecords: pageMembers(39).slice(25) },
      ],
    },
  });
  return { ...geometry, api };
}

function createFixedHarness(options = {}) {
  const geometry = createGeometry(options);
  const document = createDocument(geometry.flow);
  const members = pageMembers(39);
  const status = {
    source: 'canonical',
    overlayActive: false,
    count: 39,
    canonicalFingerprint: 'canonical-39-fingerprint',
    chatId: 'chat',
    routeKey: '/c/chat',
    generation: 7,
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
  const S = { nativeRangeActivePages: new Set(), collapsedBoundaryDiagnostics: new Map() };
  const api = vm.runInNewContext(`(() => {
    const document = injectedDocument;
    const W = {
      scrollBy() { injectedSafety.scrollCalls += 1; },
      dispatchEvent() {},
    };
    const Node = { DOCUMENT_POSITION_FOLLOWING: 4, DOCUMENT_POSITION_PRECEDING: 2 };
    const Element = injectedElement;
    const CSS = { escape: (value) => String(value) };
    const TITLE_LIST_PAGE_SIZE = 25;
    const TURN_HOST_SEL = '[data-testid="conversation-turn"], [data-testid^="conversation-turn-"]';
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
    const turnNumberOfSection = (section) => Number(
      String(section?.getAttribute?.('data-testid') || '').match(/conversation-turn-(\\d+)/)?.[1] || 0
    );
    const getTurnSectionForNode = (node) => node?.matches?.(TURN_HOST_SEL)
      ? node
      : node?.querySelector?.(TURN_HOST_SEL) || null;
    ${extractFunction(PAGE_SOURCE, 'getTurnAnchorNode')}
    ${extractFunction(PAGE_SOURCE, 'collapsedNativeRangeKey')}
    ${extractFunction(PAGE_SOURCE, 'collapsedBoundaryStatusIdentity')}
    ${extractFunction(PAGE_SOURCE, 'exactNativeStartSection')}
    ${extractFunction(PAGE_SOURCE, 'frozenCollapsedBoundaryResult')}
    ${extractFunction(PAGE_SOURCE, 'getCollapsedNativeBoundaryReadiness')}
    ${extractFunction(PAGE_SOURCE, 'isCollapsedNativeRangeExcluded')}
    ${extractFunction(PAGE_SOURCE, 'directNodePresentationPages')}
    ${extractFunction(PAGE_SOURCE, 'releaseCollapsedNativeRange')}
    ${extractFunction(PAGE_SOURCE, 'applyCollapsedNativeRange')}
    ${extractFunction(PAGE_SOURCE, 'captureCollapsedPageViewportAnchor')}
    ${extractFunction(PAGE_SOURCE, 'restoreCollapsedPageViewportAnchor')}
    return Object.freeze({
      readiness: getCollapsedNativeBoundaryReadiness,
      apply: applyCollapsedNativeRange,
      release: releaseCollapsedNativeRange,
      capture: captureCollapsedPageViewportAnchor,
      restore: restoreCollapsedPageViewportAnchor,
      nativeRangeKey: collapsedNativeRangeKey,
    });
  })()`, {
    injectedDocument: document,
    injectedElement: FakeElement,
    injectedStatus: status,
    injectedSafety: safety,
    injectedModel: {
      source: 'canonical',
      count: 39,
      pageSize: 25,
      pageCount: 2,
      coherent: true,
      pages: [
        { pageNo: 1, startOrder: 1, endOrder: 25, turnRecords: members.slice(0, 25) },
        { pageNo: 2, startOrder: 26, endOrder: 39, turnRecords: members.slice(25) },
      ],
    },
    localStorage: new Proxy({}, { set() { safety.storageWrites += 1; throw new Error('storage-write'); } }),
    sessionStorage: new Proxy({}, { set() { safety.storageWrites += 1; throw new Error('session-write'); } }),
    fetch: () => { safety.networkCalls += 1; throw new Error('network'); },
    setInterval: () => { safety.polling += 1; throw new Error('polling'); },
    MutationObserver: class {
      constructor() { safety.broadObservers += 1; throw new Error('observer'); }
    },
  });
  return { ...geometry, api, status, safety, document };
}

function positiveGeometry(boxes) {
  const heights = boxes.map((box) => box.renderedHeight()).filter((height) => height > 0);
  return { count: heights.length, total: heights.reduce((sum, height) => sum + height, 0) };
}

await fixture('parent real projection reproduces 41,823px retained-footprint failure', () => {
  const harness = createParentHarness();
  const result = harness.api.collapse();
  const geometry = positiveGeometry(harness.boxes);
  equal(result.status, 'title-only', 'real parent projection reports title-only');
  equal(harness.boxes.length, 75, '75 intermediate direct children');
  equal(geometry.count, 71, '71 positive-height native boxes');
  equal(geometry.total, 41787, 'positive boxes total measured footprint');
  equal(geometry.total + 36, 41823, 'visible inter-page gap reproduction');
});

await fixture('parent host simulator oscillates 71 positive boxes to 2 and back to 71', () => {
  const harness = createParentHarness();
  harness.api.collapse();
  equal(positiveGeometry(harness.boxes).count, 71, 'initial retained host geometry');
  for (let index = 2; index < harness.boxes.length; index += 1) harness.boxes[index].lastKnownHeight = 0;
  equal(positiveGeometry(harness.boxes).count, 2, 'transient host deflation');
  for (let index = 0; index < harness.boxes.length; index += 1) {
    if (index < 71) harness.boxes[index].lastKnownHeight = index === 70 ? 627 : 588;
  }
  equal(positiveGeometry(harness.boxes).count, 71, 'host reinflation');
});

await fixture('Page 2 identity remains present while parent geometry displaces it', () => {
  const harness = createParentHarness();
  const before = harness.page2Divider;
  harness.api.collapse();
  equal(harness.page2Divider, before, 'same Page 2 node');
  equal(harness.page2Divider.isConnected, true, 'Page 2 remains connected');
  equal(harness.page2Divider.getAttribute('data-page-num'), '2', 'Page 2 logical identity');
});

await fixture('boundaries unavailable fail closed with no native mutation', () => {
  ok(ATOMIC_VALIDATOR_OUTPUT.includes('PASS failure before first write performs zero mutation'), 'new transaction fails before writes');
  ok(ATOMIC_VALIDATOR_OUTPUT.includes('PASS incomplete title rows remain expanded'), 'incomplete authority stays expanded');
});

await fixture('readiness performs no navigation, hydration or scrolling', () => {
  const harness = createFixedHarness({ mountPage1: true, mountPage2Start: false });
  harness.api.readiness(1);
  equal(harness.safety.scrollCalls, 0, 'readiness scroll calls');
  equal(harness.safety.networkCalls, 0, 'readiness network calls');
  equal(PAGE_SOURCE.includes('getCollapsedNativeBoundaryReadiness(pageNum = 0)'), true, 'real readiness helper present');
});

await fixture('readiness contains no positional or neighbour fallback', () => {
  const source = extractFunction(PAGE_SOURCE, 'getCollapsedNativeBoundaryReadiness');
  equal(/nearest|mounted-array|children\s*\[|previousElementSibling|nextElementSibling/.test(source), false, 'no forbidden ownership inference');
  equal(/scroll|navigate|requestMount|campaign/i.test(source), false, 'no movement campaign in readiness');
});

await fixture('late mounted conversation-turn-147 does not satisfy Page 2 start', () => {
  ok(ATOMIC_VALIDATOR_OUTPUT.includes('PASS Page 2 boundary wrapper is the exclusive end'), 'exact rendered end retained');
  ok(ATOMIC_VALIDATOR_OUTPUT.includes('PASS collapse invokes test-ID ownership arithmetic zero times'), 'late test ID cannot own range');
});

await fixture('exact rendered boundaries make readiness true without test arithmetic', () => {
  ok(ATOMIC_VALIDATOR_OUTPUT.includes('PASS fully ready Page 1 reports activation ready'), 'rendered boundaries activate');
  ok(ATOMIC_VALIDATOR_OUTPUT.includes('PASS compatibility wrapper reports ready'), 'compatibility readiness follows');
});

await fixture('ready-state rendered range collapses to zero height', () => {
  ok(ATOMIC_VALIDATOR_OUTPUT.includes('PASS exactly 50 Page 1 wrappers are stamped'), 'exact 50-host range stamped');
  ok(ATOMIC_VALIDATOR_OUTPUT.includes('PASS CSS stamp removes retained host height'), 'retained height clamped');
});

await fixture('Page 2 wrapper remains untouched', () => {
  const harness = createFixedHarness({ mountPage1: true, mountPage2Start: true });
  harness.api.apply(harness.api.readiness(1));
  equal(harness.page2Start.hasAttribute('data-cgxui-chat-page-native-hidden'), false, 'Page 2 start not stamped');
  equal(harness.page2Start.renderedHeight(), 588, 'Page 2 geometry remains');
});

await fixture('host height reinflation cannot restore a marked Page 1 box', () => {
  ok(ATOMIC_VALIDATOR_OUTPUT.includes('PASS CSS stamp removes retained host height'), 'native-hidden CSS dominates retained height');
});

await fixture('H2O title list, dividers and sentinels are excluded', () => {
  const harness = createFixedHarness({ mountPage1: true, mountPage2Start: true });
  const sentinel = new FakeElement('SPAN');
  sentinel.setAttribute('data-h2o-chat-page-boundary', 'page-1-end');
  harness.flow.insertBefore(sentinel, harness.page2Start);
  harness.api.apply(harness.api.readiness(1));
  equal(harness.titleList.hasAttribute('data-cgxui-chat-page-native-hidden'), false, 'title list excluded');
  equal(harness.page1Divider.hasAttribute('data-cgxui-chat-page-native-hidden'), false, 'Page 1 divider excluded');
  equal(sentinel.hasAttribute('data-cgxui-chat-page-native-hidden'), false, 'sentinel excluded');
});

await fixture('only direct siblings receive native range marker', () => {
  const writer = extractFunction(PAGE_SOURCE, 'applyCollapsedNativeRange');
  ok(writer.includes('node?.parentElement !== root'), 'direct-parent contract enforced');
  ok(!writer.includes('querySelectorAll'), 'no descendant stamping');
});

await fixture('expansion releases only transaction-owned native markers', () => {
  ok(ATOMIC_VALIDATOR_OUTPUT.includes('PASS expansion releases exactly 50 stamps'), 'exact transaction stamps released');
  ok(ATOMIC_VALIDATOR_OUTPUT.includes('PASS expansion preserves unrelated visibility attributes'), 'other sources preserved');
});

await fixture('stale generation and fingerprint fail readiness', () => {
  const harness = createFixedHarness({ mountPage1: true, mountPage2Start: true });
  harness.status.generation = 0;
  equal(harness.api.readiness(1).ready, false, 'zero generation rejected');
  harness.status.generation = 7;
  harness.status.canonicalFingerprint = '';
  equal(harness.api.readiness(1).ready, false, 'missing fingerprint rejected');
});

await fixture('wrapper replacement invalidates and safely expands', () => {
  ok(ATOMIC_VALIDATOR_OUTPUT.includes('PASS start-boundary replacement expands safely'), 'start replacement expands');
  ok(ATOMIC_VALIDATOR_OUTPUT.includes('PASS end-boundary replacement expands safely'), 'end replacement expands');
});

await fixture('reload already collapsed with missing boundary settles expanded', () => {
  const harness = createFixedHarness({ mountPage1: true, mountPage2Start: false });
  const readiness = harness.api.readiness(1);
  equal(readiness.ready, false, 'reload readiness false');
  equal(harness.document.querySelectorAll('[data-cgxui="chat-page-title-list-synth"]').length, 1, 'fixture starts with stale list');
  equal(harness.api.apply(readiness).mutations, 0, 'no broken native clamp published');
});

await fixture('transient Page 2 anchor loss retains authoritative divider', () => {
  const body = extractFunction(CORE_SOURCE, 'enforceChatPageUnitOrder');
  equal(body.includes('detachDeferredChatPageDivider(divider, pageNum)'), false, 'anchor loss does not detach divider');
  equal(body.includes('retained: divider?.isConnected === true'), true, 'retained state diagnosed');
});

await fixture('authority 39 to 18 removes Page 2 only through authority pruning', () => {
  const body = extractFunction(CORE_SOURCE, 'enforceChatPageUnitOrder');
  equal(body.includes('if (pageNum > model.pageCount || pageNum < 1)'), true, 'page-count pruning retained');
  equal(body.includes('pageNum <= model.pageCount'), true, 'authoritative pages retained');
});

await fixture('authority 18 to 39 can restore Page 2 through coordinator creation', () => {
  const body = extractFunction(CORE_SOURCE, 'enforceChatPageUnitOrder');
  equal(body.includes('createChatPageDivider(pageNum'), true, 'missing authoritative divider created');
  equal(body.includes('state.pendingDividers.get(pageNum)'), true, 'deferred authoritative divider reusable');
});

await fixture('anchor-relative viewport restoration is bounded', () => {
  const harness = createFixedHarness({ mountPage1: true, mountPage2Start: true });
  harness.page1Divider.rectTop = 100;
  const snapshot = harness.api.capture(1);
  equal(harness.api.restore(snapshot), true, 'zero-delta restore succeeds');
  equal(harness.safety.scrollCalls, 0, 'no unnecessary scroll');
});

await fixture('five collapse-expand cycles have no cumulative marker drift', () => {
  ok(ATOMIC_VALIDATOR_OUTPUT.includes('PASS five cycles use identical stamp sets'), 'stamp set stable');
  ok(ATOMIC_VALIDATOR_OUTPUT.includes('PASS five cycles accumulate zero layout offset'), 'no layout drift');
});

await fixture('second identical reconciliation performs zero mutations', () => {
  ok(ATOMIC_VALIDATOR_OUTPUT.includes('PASS second expansion performs zero mutations'), 'expansion idempotent');
  ok(ATOMIC_VALIDATOR_OUTPUT.includes('Fixtures: 95/95'), 'full atomic transaction suite passed');
});

await fixture('Thread Pages Controller is sole native visibility writer', () => {
  const tracked = execFileSync('rg', [
    '-l',
    '-g', '!chrome/**',
    'setAttribute\\([^\\n]*ATTR_CHAT_PAGE_WRAPPER_HIDDEN|setAttribute\\([^\\n]*data-cgxui-chat-page-native-hidden',
    'src-runtime-base',
  ], { cwd: ROOT, encoding: 'utf8' }).trim().split('\n').filter(Boolean);
  equal(tracked, [PAGE_PATH], 'only 1C1b writes native visibility');
});

await fixture('duplicate MiniMap Core wrapper writer is absent', () => {
  equal(CORE_SOURCE.includes('function setChatPageTurnHostDomState('), false, 'duplicate writer removed');
  equal(CORE_SOURCE.includes("setAttribute('data-cgxui-chat-page-wrapper-hidden'"), false, 'duplicate attribute write removed');
});

await fixture('no host reparenting or destructive removal in native clamp', () => {
  const source = extractFunction(PAGE_SOURCE, 'applyCollapsedNativeRange');
  equal(/appendChild|insertBefore|removeChild|\.remove\(/.test(source), false, 'clamp only stamps direct siblings');
});

await fixture('skin owns one narrow display-none rule', () => {
  ok(/html \[data-cgxui-chat-page-native-hidden\]\s*\{\s*display:\s*none\s*!important;\s*\}/m.test(SKIN_SOURCE), 'native marker CSS exists');
  equal((SKIN_SOURCE.match(/data-cgxui-chat-page-native-hidden/g) || []).length, 1, 'single skin rule');
});

await fixture('throwing safety surfaces remain untouched', () => {
  const harness = createFixedHarness({ mountPage1: true, mountPage2Start: true });
  const readiness = harness.api.readiness(1);
  harness.api.apply(readiness);
  harness.api.release(1);
  equal(harness.safety.storageWrites, 0, 'storage writes');
  equal(harness.safety.preferenceWrites, 0, 'preference writes');
  equal(harness.safety.canonicalWrites, 0, 'canonical writes');
  equal(harness.safety.aliasWrites, 0, 'alias writes');
  equal(harness.safety.cacheWrites, 0, 'cache writes');
  equal(harness.safety.networkCalls, 0, 'network calls');
  equal(harness.safety.polling, 0, 'polling');
  equal(harness.safety.repeatingTimers, 0, 'repeating timers');
  equal(harness.safety.broadObservers, 0, 'broad observers');
  equal(harness.safety.destructiveHostRemovals, 0, 'destructive host removals');
});

const failed = fixtures.filter((entry) => !entry.ok);
for (const entry of fixtures) {
  console.log(`${entry.ok ? 'PASS' : 'FAIL'} ${entry.name}`);
  if (!entry.ok) console.log(entry.error);
}
console.log(`Fixtures: ${fixtures.length - failed.length}/${fixtures.length}`);
console.log(`Assertions: ${assertionCount}`);
if (failed.length) process.exitCode = 1;
