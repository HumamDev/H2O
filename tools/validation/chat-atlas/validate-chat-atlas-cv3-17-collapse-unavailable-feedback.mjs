#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
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
    console.log(`PASS ${name}`);
  } catch (error) {
    fixtures.push({ name, ok: false, error: String(error?.stack || error) });
    console.error(`FAIL ${name}`);
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

function selectorParts(selector) {
  return String(selector || '').split(',').map((part) => part.trim()).filter(Boolean);
}

function matchesSimple(node, selector) {
  const text = String(selector || '').trim();
  for (const cls of Array.from(text.matchAll(/\.([A-Za-z0-9_-]+)/g)).map((match) => match[1])) {
    if (!String(node.className || '').split(/\s+/).includes(cls)) return false;
  }
  for (const match of text.matchAll(/\[([^\]=]+)(?:="([^"]*)")?\]/g)) {
    const actual = node.getAttribute(match[1]);
    if (match[2] == null && actual == null) return false;
    if (match[2] != null && actual !== match[2]) return false;
  }
  return true;
}

class FakeElement {
  constructor(tagName = 'div') {
    this.tagName = String(tagName).toUpperCase();
    this.nodeType = 1;
    this.className = '';
    this.children = [];
    this.parentElement = null;
    this.parentNode = null;
    this.attrs = new Map();
    this.hidden = false;
    this.textContent = '';
    this.isConnected = true;
  }
  setAttribute(name, value) { this.attrs.set(String(name), String(value)); }
  getAttribute(name) { return this.attrs.has(String(name)) ? this.attrs.get(String(name)) : null; }
  hasAttribute(name) { return this.attrs.has(String(name)); }
  removeAttribute(name) { this.attrs.delete(String(name)); }
  appendChild(node) {
    node.parentElement = this;
    node.parentNode = this;
    node.isConnected = true;
    this.children.push(node);
    return node;
  }
  remove() {
    if (this.getAttribute('data-host-owned') === '1') throw new Error('host-removal');
    const index = this.parentNode?.children?.indexOf(this) ?? -1;
    if (index >= 0) this.parentNode.children.splice(index, 1);
    this.parentElement = null;
    this.parentNode = null;
    this.isConnected = false;
  }
  matches(selector) {
    return selectorParts(selector).some((part) => matchesSimple(this, part));
  }
  querySelectorAll(selector) {
    const out = [];
    const visit = (node) => {
      for (const child of node.children) {
        if (child.matches(selector)) out.push(child);
        visit(child);
      }
    };
    visit(this);
    return out;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  closest(selector) {
    let node = this;
    while (node) {
      if (node.matches(selector)) return node;
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

function makeHarness({ reason = 'next-page-native-start-not-mounted' } = {}) {
  const root = new FakeElement('main');
  const page1 = new FakeElement('div');
  page1.className = 'cgxui-chat-page-divider';
  page1.setAttribute('data-page-num', '1');
  const page1Dot = new FakeElement('span');
  page1Dot.className = 'cgxui-chat-page-divider-dot';
  page1Dot.setAttribute('aria-hidden', 'true');
  page1.appendChild(page1Dot);
  root.appendChild(page1);
  const page2 = new FakeElement('div');
  page2.className = 'cgxui-chat-page-divider';
  page2.setAttribute('data-page-num', '2');
  root.appendChild(page2);

  let nextTimer = 1;
  const timers = new Map();
  const counters = {
    nativeRelease: 0,
    titleListForget: 0,
    titleListRelease: 0,
    titleListCreate: 0,
    hiddenWrappers: 0,
    scroll: 0,
    navigation: 0,
    storage: 0,
    cache: 0,
    preference: 0,
    network: 0,
    observers: 0,
    hostRemovals: 0,
    events: 0,
    clickForwards: 0,
  };
  const document = {
    activeElement: page1Dot,
    createElement: (tag) => new FakeElement(tag),
    querySelectorAll: (selector) => {
      const all = [root, ...root.querySelectorAll('*')];
      return all.filter((node) => node !== root && node.matches(selector));
    },
  };
  const W = {
    setTimeout(callback, delay) {
      const id = nextTimer++;
      timers.set(id, { callback, delay });
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
    dispatchEvent() { counters.events += 1; },
  };
  const sandbox = {
    console,
    Object,
    String,
    Number,
    Math,
    Map,
    Set,
    Array,
    RegExp,
    document,
    W,
    CustomEvent: class CustomEvent {
      constructor(type, init = {}) { this.type = type; this.detail = init.detail; }
    },
    ATTR_COLLAPSE_READINESS: 'data-h2o-collapse-readiness',
    ATTR_COLLAPSE_REASON: 'data-h2o-collapse-reason',
    ATTR_COLLAPSE_CONTROL_STATE: 'data-h2o-collapse-control-state',
    ATTR_COLLAPSE_FEEDBACK: 'data-h2o-collapse-feedback',
    COLLAPSE_UNAVAILABLE_STATUS: 'collapsed-exact-boundary-unavailable',
    COLLAPSE_UNAVAILABLE_MESSAGE: 'Collapse unavailable until the next page boundary is loaded.',
    S: {
      collapsedBoundaryDiagnostics: new Map(),
      nativeRangeActivePages: new Set(),
      atomicPageCollapseTransactions: new Map(),
      atomicPageCollapseGuards: new Set(),
      onDividerDotClick: null,
    },
    resolveChatId: () => 'chat-1',
    collapsedNativeRangeKey: (chatId, pageNum) => `${String(chatId || 'chat-1')}:${Number(pageNum || 0)}`,
    isTitleListActive: () => sandbox.__titleListActive === true,
    releaseCollapsedNativeRange: () => { counters.nativeRelease += 1; return 0; },
    expandPageWithRenderedBoundaries: () => ({ ok: true, status: 'inactive', mutations: 0 }),
    localForgetTitleListPage: () => { counters.titleListForget += 1; },
    syncSyntheticTitleList: (_page, _chat, active) => {
      if (active) counters.titleListCreate += 1;
      else counters.titleListRelease += 1;
      return { ok: true, status: active ? 'active' : 'inactive' };
    },
    localStorage: new Proxy({}, { get() { counters.storage += 1; throw new Error('localStorage-forbidden'); } }),
    sessionStorage: new Proxy({}, { get() { counters.storage += 1; throw new Error('sessionStorage-forbidden'); } }),
    indexedDB: new Proxy({}, { get() { counters.storage += 1; throw new Error('indexedDB-forbidden'); } }),
    fetch() { counters.network += 1; throw new Error('network-forbidden'); },
    setInterval() { throw new Error('interval-forbidden'); },
    MutationObserver: class MutationObserver {
      constructor() { counters.observers += 1; throw new Error('observer-forbidden'); }
    },
    __titleListActive: false,
    resolveChatId: () => 'chat-1',
    getDividerPageNum: (divider) => Number(divider?.getAttribute?.('data-page-num') || 0),
    // Keyboard activation now converges on the single atomic transaction
    // owner instead of synthesising a divider click. For this validator the
    // owner stands in for a capability that is not ready, so the observable
    // contract under test — one activation, one message, focus retained — is
    // unchanged.
    executeAtomicPageCollapseTransaction: (pageNum, activationSource) => {
      counters.clickForwards += 1;
      sandbox.__api.handleCollapseUnavailableActivation(
        pageNum,
        'chat-1',
        sandbox.__readiness,
        activationSource,
      );
      return { ok: false, status: 'collapsed-exact-boundary-unavailable', pageNum };
    },
  };
  vm.createContext(sandbox);
  const names = [
    'collapsedBoundaryDividers',
    'setCollapseFeedbackAttribute',
    'collapseUnavailableStatusNode',
    'clearCollapseUnavailableFeedback',
    'applyCollapsedBoundaryControlState',
    'showCollapseUnavailableFeedback',
    'explicitCollapseFeedbackSource',
    'handleCollapseUnavailableActivation',
    'forwardCollapseControlKeyboardActivation',
    'recordCollapsedBoundaryDiagnostic',
    'failClosedCollapsedTitleList',
  ];
  const source = names.map((name) => extractFunction(PAGE_SOURCE, name)).join('\n')
    + `\nglobalThis.__api = { ${names.join(', ')} };`;
  new vm.Script(source, { filename: PAGE_PATH }).runInContext(sandbox);
  const readiness = Object.freeze({
    ready: false,
    reason,
    pageNum: 1,
    generation: 2,
    fingerprint: 'djb2:2iocqu',
  });
  sandbox.__readiness = readiness;
  return {
    api: sandbox.__api,
    sandbox,
    root,
    page1,
    page1Dot,
    page2,
    document,
    W,
    counters,
    timers,
    readiness,
  };
}

function feedbackNodes(harness) {
  return harness.page1.querySelectorAll('[data-h2o-collapse-feedback]');
}

await fixture('readiness false remains expanded with no projection or movement', () => {
  const h = makeHarness();
  const result = h.api.handleCollapseUnavailableActivation(1, 'chat-1', h.readiness, 'chat-page-divider:circle');
  equal(result.ok, false, 'rejection result');
  equal(result.status, 'collapsed-exact-boundary-unavailable', 'rejection status');
  equal(h.counters.titleListCreate, 0, 'no title list');
  equal(h.counters.hiddenWrappers, 0, 'no hidden wrapper');
  equal(h.counters.scroll, 0, 'no scroll');
  equal(h.counters.navigation, 0, 'no navigation');
  equal(h.page1.getAttribute('data-h2o-collapse-readiness'), 'collapsed-exact-boundary-unavailable', 'readiness attribute');
});

await fixture('mouse activation shows one human-readable source-grounded message', () => {
  const h = makeHarness();
  h.api.handleCollapseUnavailableActivation(1, 'chat-1', h.readiness, 'chat-page-divider:circle');
  const nodes = feedbackNodes(h);
  equal(nodes.length, 1, 'one feedback node');
  equal(nodes[0].hidden, false, 'visible');
  equal(nodes[0].textContent, 'Collapse unavailable until the next page boundary is loaded.', 'message');
  equal(nodes[0].getAttribute('data-h2o-collapse-reason'), h.readiness.reason, 'technical reason');
  equal(nodes[0].getAttribute('role'), 'status', 'status role');
});

await fixture('Enter reaches the transaction owner once without focus loss', () => {
  const h = makeHarness();
  const result = h.api.forwardCollapseControlKeyboardActivation({
    key: 'Enter',
    target: h.page1Dot,
    repeat: false,
    preventDefault() {},
    stopPropagation() {},
  });
  equal(result.source, 'chat-page-divider:keyboard-enter', 'Enter source');
  equal(h.counters.clickForwards, 1, 'one activation through the single owner');
  equal(h.document.activeElement, h.page1Dot, 'focus retained');
  equal(feedbackNodes(h).length, 1, 'one message');
});

await fixture('Space reaches the transaction owner once and suppresses repeats', () => {
  const h = makeHarness();
  const first = h.api.forwardCollapseControlKeyboardActivation({
    key: ' ',
    target: h.page1Dot,
    repeat: false,
    preventDefault() {},
    stopPropagation() {},
  });
  const repeat = h.api.forwardCollapseControlKeyboardActivation({
    key: ' ',
    target: h.page1Dot,
    repeat: true,
    preventDefault() {},
    stopPropagation() {},
  });
  equal(first.source, 'chat-page-divider:keyboard-space', 'Space source');
  equal(repeat.status, 'repeat-ignored', 'repeat ignored');
  equal(h.counters.clickForwards, 1, 'one activation');
});

await fixture('repeated activation reuses one node without a cleanup timer', () => {
  const h = makeHarness();
  h.api.handleCollapseUnavailableActivation(1, 'chat-1', h.readiness, 'chat-page-divider:circle');
  const first = feedbackNodes(h)[0];
  h.api.handleCollapseUnavailableActivation(1, 'chat-1', h.readiness, 'chat-page-divider:circle');
  equal(feedbackNodes(h).length, 1, 'no stacked message');
  equal(feedbackNodes(h)[0], first, 'same node');
  equal(h.timers.size, 0, 'no timer');
});

await fixture('blocked visual contract is non-color and accessible', () => {
  const h = makeHarness();
  h.api.applyCollapsedBoundaryControlState(1, 'chat-1', h.readiness);
  equal(h.page1Dot.getAttribute('data-h2o-collapse-control-state'), 'blocked', 'blocked state');
  equal(h.page1Dot.getAttribute('role'), 'button', 'button role');
  equal(h.page1Dot.getAttribute('tabindex'), '0', 'keyboard focusable');
  equal(h.page1Dot.getAttribute('title'), 'Collapse currently unavailable', 'stable product title');
  ok(!h.page1Dot.getAttribute('aria-label').includes(h.readiness.reason), 'technical reason excluded from aria label');
  equal(h.page1.getAttribute('data-h2o-collapse-reason'), h.readiness.reason, 'technical reason retained on divider diagnostic');
  equal(h.page1Dot.hasAttribute('aria-disabled'), false, 'feedback activation remains enabled');
  ok(SKIN_SOURCE.includes('cursor: not-allowed !important'), 'blocked cursor');
  ok(SKIN_SOURCE.includes('content: \"!\"'), 'non-color indicator');
});

await fixture('navigation surface remains available while dot alone is blocked', () => {
  const h = makeHarness();
  h.api.applyCollapsedBoundaryControlState(1, 'chat-1', h.readiness);
  equal(h.page1.hasAttribute('aria-disabled'), false, 'divider not disabled');
  equal(h.page1Dot.getAttribute('data-h2o-collapse-control-state'), 'blocked', 'only collapse control blocked');
  ok(PAGE_SOURCE.includes('openTagsCloudFromDivider(divider)'), 'divider navigation path retained');
});

await fixture('false to true clears blocked state and stale feedback without auto-collapse', () => {
  const h = makeHarness();
  h.api.handleCollapseUnavailableActivation(1, 'chat-1', h.readiness, 'chat-page-divider:circle');
  const result = h.api.applyCollapsedBoundaryControlState(1, 'chat-1', { ready: true, reason: 'ready' });
  equal(result.blocked, false, 'unblocked');
  equal(h.page1.hasAttribute('data-h2o-collapse-readiness'), false, 'attribute cleared');
  equal(feedbackNodes(h).length, 1, 'owned status node retained for reuse');
  equal(feedbackNodes(h)[0].hidden, true, 'stale feedback hidden');
  equal(feedbackNodes(h)[0].textContent, '', 'stale feedback text cleared');
  equal(h.counters.titleListCreate, 0, 'no automatic collapse');
  equal(h.page1Dot.getAttribute('title'), 'Collapse Page 1', 'normal action restored');
});

await fixture('true to false restores blocked affordance without collapse', () => {
  const h = makeHarness();
  h.api.applyCollapsedBoundaryControlState(1, 'chat-1', { ready: true, reason: 'ready' });
  const result = h.api.applyCollapsedBoundaryControlState(1, 'chat-1', h.readiness);
  equal(result.blocked, true, 'blocked again');
  equal(h.counters.titleListCreate, 0, 'no unsafe collapse');
  equal(h.page1Dot.getAttribute('data-h2o-collapse-control-state'), 'blocked', 'state restored');
});

await fixture('diagnostic readiness attribute stays source-grounded', () => {
  const h = makeHarness();
  const detail = h.api.recordCollapsedBoundaryDiagnostic(1, h.readiness, 'chat-page-divider:circle');
  equal(detail.status, 'collapsed-exact-boundary-unavailable', 'bounded diagnostic status');
  equal(detail.reason, h.readiness.reason, 'exact reason');
  equal(h.page1.getAttribute('data-h2o-collapse-reason'), h.readiness.reason, 'DOM reason');
});

await fixture('rejection never creates title-list projection', () => {
  const h = makeHarness();
  h.api.handleCollapseUnavailableActivation(1, 'chat-1', h.readiness, 'chat-page-divider:circle');
  equal(h.counters.titleListCreate, 0, 'no create');
  equal(h.root.querySelectorAll('[data-cgxui=\"chat-page-title-list-synth\"]').length, 0, 'no synthetic list');
});

await fixture('rejection creates no retained-footprint mutation', () => {
  const h = makeHarness();
  h.api.handleCollapseUnavailableActivation(1, 'chat-1', h.readiness, 'chat-page-divider:circle');
  equal(h.root.querySelectorAll('[data-cgxui-chat-page-native-hidden]').length, 0, 'no native clamp');
  equal(h.counters.hiddenWrappers, 0, 'no height mutation');
});

await fixture('Page 2 divider remains present', () => {
  const h = makeHarness();
  h.api.handleCollapseUnavailableActivation(1, 'chat-1', h.readiness, 'chat-page-divider:circle');
  equal(h.page2.isConnected, true, 'Page 2 connected');
  equal(h.root.children.includes(h.page2), true, 'Page 2 retained');
});

await fixture('storage cache and preference safety surfaces remain untouched', () => {
  const h = makeHarness();
  h.api.handleCollapseUnavailableActivation(1, 'chat-1', h.readiness, 'chat-page-divider:circle');
  equal(h.counters.storage, 0, 'storage');
  equal(h.counters.cache, 0, 'cache');
  equal(h.counters.preference, 0, 'preference');
});

await fixture('no network requests', () => {
  const h = makeHarness();
  h.api.handleCollapseUnavailableActivation(1, 'chat-1', h.readiness, 'chat-page-divider:circle');
  equal(h.counters.network, 0, 'network');
});

await fixture('no polling or repeating timers', () => {
  const h = makeHarness();
  h.api.handleCollapseUnavailableActivation(1, 'chat-1', h.readiness, 'chat-page-divider:circle');
  equal(h.timers.size, 0, 'no timer');
  equal(PAGE_SOURCE.includes('setInterval('), false, 'no interval');
  equal(extractFunction(PAGE_SOURCE, 'showCollapseUnavailableFeedback').includes('setTimeout('), false, 'no feedback timer');
});

await fixture('no broad observer introduced', () => {
  const h = makeHarness();
  h.api.handleCollapseUnavailableActivation(1, 'chat-1', h.readiness, 'chat-page-divider:circle');
  equal(h.counters.observers, 0, 'observer count');
  equal(extractFunction(PAGE_SOURCE, 'showCollapseUnavailableFeedback').includes('MutationObserver'), false, 'no observer');
});

await fixture('no host reparenting or removal', () => {
  const h = makeHarness();
  const host = new FakeElement('section');
  host.setAttribute('data-host-owned', '1');
  h.root.appendChild(host);
  h.api.handleCollapseUnavailableActivation(1, 'chat-1', h.readiness, 'chat-page-divider:circle');
  equal(host.parentElement, h.root, 'host retained');
  equal(host.isConnected, true, 'host connected');
  equal(h.counters.hostRemovals, 0, 'removals');
});

await fixture('idempotent blocked repair performs zero second-pass mutations', () => {
  const h = makeHarness();
  const first = h.api.applyCollapsedBoundaryControlState(1, 'chat-1', h.readiness);
  const second = h.api.applyCollapsedBoundaryControlState(1, 'chat-1', h.readiness);
  ok(first.mutations > 0, 'first pass mutates');
  equal(second.mutations, 0, 'second pass no-op');
});

await fixture('loader-order absence remains expanded and explains unavailability', () => {
  const h = makeHarness({ reason: 'readiness-api-unavailable' });
  const result = h.api.handleCollapseUnavailableActivation(
    1,
    'chat-1',
    h.readiness,
    'chat-page-divider:keyboard-enter'
  );
  equal(result.ok, false, 'safe result');
  equal(h.counters.titleListCreate, 0, 'expanded');
  equal(feedbackNodes(h).length, 1, 'feedback visible');
  equal(h.page1Dot.getAttribute('data-h2o-collapse-control-state'), 'blocked', 'blocked');
});

const sourceChecks = {
  noAutomaticCampaign: !/complete-index.*(navigate|campaign)|mounting-target/i.test(
    extractFunction(PAGE_SOURCE, 'getCollapsedNativeBoundaryReadiness')
  ),
  noReadinessScroll: !/scroll(?:By|To|IntoView)?\s*\(/.test(
    extractFunction(PAGE_SOURCE, 'getCollapsedNativeBoundaryReadiness')
  ),
  noPositionalOwnership: !/nearest|mounted-array|childIndex|ordinal/i.test(
    extractFunction(PAGE_SOURCE, 'getCollapsedNativeBoundaryReadiness')
  ),
  // The readiness consumer is the divider renderer, which now lives in 0C3a.
  coreOnlyConsumesReadiness: STRUCTURE_SOURCE.includes("divider.getAttribute?.('data-h2o-collapse-readiness')"),
};
ok(sourceChecks.noAutomaticCampaign, 'readiness has no campaign');
ok(sourceChecks.noReadinessScroll, 'readiness has no scroll');
ok(sourceChecks.noPositionalOwnership, 'readiness has no positional inference');
ok(sourceChecks.coreOnlyConsumesReadiness, 'Core consumes readiness data');


// ══════════════════════════════════════════════════════════════════════════
// Stage 2C-2eB — collapse-control hit target (real-element correction).
//
// The painted circle is small, inside a ~108px label, so clicks a few pixels
// off it landed on the label and opened the Tags cloud. A ::before region was
// tried first and REJECTED: the live pointer test still opened Tags even
// though elementsFromPoint reported the dot. The correction is a real
// transparent child node inside the dot.
//
// Real CSS geometry is not measurable in this Node harness, so the sizing
// assertions below are source contracts; the pixel proof belongs to the live
// canary. The ownership assertions, by contrast, are executed against the
// real production markup helpers.
// ══════════════════════════════════════════════════════════════════════════

const HIT_SELECTOR = '.cgxui-chat-page-divider-dot-hit, .cgxui-pgnw-page-divider-dot-hit';
const DOT_SELECTOR = '.cgxui-chat-page-divider-dot, .cgxui-pgnw-page-divider-dot';

function cssRule(source, selector) {
  const start = source.indexOf(selector);
  if (start < 0) throw new Error(`css-rule-missing:${selector}`);
  const open = source.indexOf('{', start + selector.length - 1);
  if (open < 0) throw new Error(`css-rule-body-invalid:${selector}`);
  for (let index = open + 1; index < source.length; index += 1) {
    // The skin emits CSS from a JS template literal, so a rule body can
    // contain `${...}` whose closing brace is not the end of the rule.
    if (source[index] === '$' && source[index + 1] === '{') {
      const close = source.indexOf('}', index + 2);
      if (close < 0) throw new Error(`css-interpolation-unclosed:${selector}`);
      index = close;
      continue;
    }
    if (source[index] === '}') return source.slice(open + 1, index);
  }
  throw new Error(`css-rule-body-invalid:${selector}`);
}

// The divider click owners are assigned arrows, not declarations, so
// extractFunction's `function name(` anchor does not reach them.
function extractAssignedArrow(source, name) {
  const anchor = `${name} = (`;
  const start = source.indexOf(anchor);
  if (start < 0 || source.indexOf(anchor, start + anchor.length) >= 0) {
    throw new Error(`arrow-anchor-invalid:${name}`);
  }
  const bodyStart = source.indexOf('{', source.indexOf('=>', start));
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    else if (source[index] === '}' && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`arrow-boundary-invalid:${name}`);
}

// Run the REAL markup helpers from MiniMap Core against the fake DOM, so the
// ownership proofs below are executed rather than merely pattern-matched.
function makeMarkupApi() {
  const sandbox = vm.createContext({
    document: { createElement: (tag) => new FakeElement(tag) },
    console,
  });
  const names = ['getChatPageDividerDotHitEl', 'ensureChatPageDividerDotHitEl'];
  const source = names.map((name) => extractFunction(CORE_SOURCE, name)).join('\n')
    + `\nglobalThis.__markup = { ${names.join(', ')} };`;
  new vm.Script(source, { filename: CORE_PATH }).runInContext(sandbox);
  return sandbox.__markup;
}

function makeDividerWithDot() {
  const divider = new FakeElement('div');
  divider.className = 'cgxui-chat-page-divider';
  const label = new FakeElement('span');
  label.className = 'cgxui-chat-page-divider-label';
  const dot = new FakeElement('span');
  dot.className = 'cgxui-chat-page-divider-dot';
  dot.setAttribute('aria-hidden', 'true');
  const text = new FakeElement('span');
  text.className = 'cgxui-chat-page-divider-text';
  text.textContent = 'Page 1';
  label.appendChild(dot);
  label.appendChild(text);
  divider.appendChild(label);
  return { divider, label, dot, text };
}

await fixture('hit target: the rejected ::before hit region is absent', () => {
  ok(!SKIN_SOURCE.includes('.cgxui-chat-page-divider-dot::before'), 'no chat ::before hit rule');
  ok(!SKIN_SOURCE.includes('.cgxui-pgnw-page-divider-dot::before'), 'no pgnw ::before hit rule');
  // Exactly one hit-target mechanism may exist.
  equal(SKIN_SOURCE.split('cgxui-chat-page-divider-dot-hit').length - 1, 1, 'one chat hit-child rule selector');
  // The blocked "!" badge is the only pseudo-element the dot may still own.
  const dotPseudos = [...SKIN_SOURCE.matchAll(/divider-dot::(before|after)/g)].map((m) => m[1]);
  ok(dotPseudos.length > 0 && dotPseudos.every((kind) => kind === 'after'), 'the dot owns no ::before region');
});

await fixture('hit target: every divider dot gets exactly one real hit child', () => {
  const markup = makeMarkupApi();
  const { dot } = makeDividerWithDot();
  equal(dot.children.length, 0, 'dot starts empty');
  markup.ensureChatPageDividerDotHitEl(dot, false);
  equal(dot.querySelectorAll(HIT_SELECTOR).length, 1, 'one hit child created');
  // Idempotent: the decorate path runs on every divider pass.
  markup.ensureChatPageDividerDotHitEl(dot, false);
  markup.ensureChatPageDividerDotHitEl(dot, false);
  equal(dot.querySelectorAll(HIT_SELECTOR).length, 1, 'still exactly one hit child');
  // The creation template ships the child too, so it exists before any repair.
  ok(CORE_SOURCE.includes('<span class="cgxui-chat-page-divider-dot" aria-hidden="true"><span class="cgxui-chat-page-divider-dot-hit" aria-hidden="true"></span></span>'), 'divider template nests the hit child inside the dot');
  ok(extractFunction(CORE_SOURCE, 'ensureChatPageDividerMarkup').includes('ensureChatPageDividerDotHitEl(dot,'), 'markup repair ensures the hit child');
});

await fixture('hit target: the child is a real descendant of the dot', () => {
  const markup = makeMarkupApi();
  const { dot, label } = makeDividerWithDot();
  const hit = markup.ensureChatPageDividerDotHitEl(dot, false);
  equal(hit.parentElement, dot, 'child is nested directly in the dot');
  ok(dot.contains(hit), 'dot contains the child');
  ok(label.querySelector(HIT_SELECTOR) === hit, 'child is reachable from the label only through the dot');
  equal(hit.nodeType, 1, 'child is a real element node');
});

await fixture('hit target: the child is inert for accessibility', () => {
  const markup = makeMarkupApi();
  const { dot } = makeDividerWithDot();
  const hit = markup.ensureChatPageDividerDotHitEl(dot, false);
  equal(hit.getAttribute('aria-hidden'), 'true', 'child is aria-hidden');
  equal(hit.getAttribute('role'), null, 'child has no role');
  equal(hit.getAttribute('tabindex'), null, 'child has no tabindex');
  equal(hit.getAttribute('aria-label'), null, 'child has no accessible name');
  equal(hit.getAttribute('title'), null, 'child has no title');
  // No listener is attached to the child anywhere in the runtime.
  ok(!CORE_SOURCE.includes('dot-hit\').addEventListener'), 'core attaches no listener to the child');
  ok(!PAGE_SOURCE.includes('cgxui-chat-page-divider-dot-hit'), 'the controller never targets the child directly');
});

await fixture('hit target: the dot remains the sole accessible control', () => {
  const control = extractFunction(PAGE_SOURCE, 'applyCollapsedBoundaryControlState');
  ok(control.includes("divider.querySelector?.('.cgxui-chat-page-divider-dot, .cgxui-pgnw-page-divider-dot')"), 'control state resolves the dot, not the child');
  for (const attr of ["'role', 'button'", "'tabindex', '0'", 'aria-label', 'title', 'ATTR_COLLAPSE_CONTROL_STATE']) {
    ok(control.includes(attr), `${attr} still written to the dot`);
  }
  const keyboard = extractFunction(PAGE_SOURCE, 'forwardCollapseControlKeyboardActivation');
  ok(keyboard.includes(`closest?.('${DOT_SELECTOR}')`), 'keyboard activation owned by the dot');
  ok(/key !== 'Enter' && key !== ' ' && key !== 'Spacebar'/.test(keyboard), 'Enter and Space retained');
});

await fixture('hit target: authoritative visual circle is exactly 14x14', () => {
  // The live circle is decided by the controller tokens, which become inline
  // !important declarations - not by the authored base CSS alone.
  const tokens = PAGE_SOURCE.slice(PAGE_SOURCE.indexOf('const DIVIDER_VISUAL_KEYS'));
  equal(Number((tokens.match(/dotSizeExpandedPx:\s*(\d+)/) || [])[1]), 14, 'expanded circle token is 14');
  equal(Number((tokens.match(/dotSizeCollapsedPx:\s*(\d+)/) || [])[1]), 14, 'collapsed circle token is 14');
  for (const prop of ['width', 'height', 'min-width', 'min-height']) {
    ok(PAGE_SOURCE.includes(`dot.style.setProperty('${prop}', \`\${effectiveTokens.dotSizePx}px\`, 'important')`), `${prop} written from the same token`);
  }
  // The authored base agrees, so the circle is 14 with or without the tokens.
  const base = cssRule(SKIN_SOURCE, '.cgxui-chat-page-divider-dot,\n.cgxui-pgnw-page-divider-dot{');
  for (const prop of ['width', 'height', 'min-width', 'min-height']) {
    ok(new RegExp(`(?<![-\\w])${prop}:\\s*14px`).test(base), `base ${prop} is 14px`);
  }
  ok(/position:\s*relative/.test(base), 'dot remains the positioning context');
});

await fixture('hit target: the real child is exactly 28x28, centred and out of layout', () => {
  const size = Number((SKIN_SOURCE.match(/DOT_HIT_SIZE_PX:\s*(\d+)/) || [])[1] || 0);
  ok(size >= 28, `declared hit size ${size} is at least 28`);
  const hit = cssRule(SKIN_SOURCE, '.cgxui-chat-page-divider-dot-hit,\n.cgxui-pgnw-page-divider-dot-hit{');
  ok(/width:\s*\$\{CHAT_PAGE_DIVIDER_LAYOUT\.DOT_HIT_SIZE_PX\}px/.test(hit), 'width uses the declared hit size');
  ok(/height:\s*\$\{CHAT_PAGE_DIVIDER_LAYOUT\.DOT_HIT_SIZE_PX\}px/.test(hit), 'height uses the declared hit size');
  ok(/position:\s*absolute/.test(hit), 'absolutely positioned, so out of flow');
  ok(/left:\s*50%/.test(hit) && /top:\s*50%/.test(hit), 'anchored to the dot centre');
  ok(/transform:\s*translate\(-50%,\s*-50%\)/.test(hit), 'centred, not offset');
  ok(/pointer-events:\s*auto/.test(hit), 'child receives pointer events');
  ok(/z-index:\s*[1-9]/.test(hit), 'raised above the sibling label text');
  // Transparent: no fill, border or shadow.
  ok(/background:\s*transparent/.test(hit), 'no fill');
  ok(/border:\s*0/.test(hit), 'no border');
  ok(/box-shadow:\s*none/.test(hit), 'no shadow');
  ok(!/margin/.test(hit), 'no margin that could shift siblings');
  ok(!/display:\s*(block|inline-block|flex)/.test(hit), 'no in-flow display');
  // Nothing clips the region.
  ok(!/overflow/.test(cssRule(SKIN_SOURCE, '.cgxui-chat-page-divider{')), 'divider does not clip overflow');
  ok(!/overflow/.test(cssRule(SKIN_SOURCE, '.cgxui-chat-page-divider-label,\n.cgxui-pgnw-page-divider-pill{')), 'label does not clip overflow');
});

await fixture('hit target: a child-targeted event resolves to the parent dot', () => {
  const markup = makeMarkupApi();
  const { dot, text } = makeDividerWithDot();
  const hit = markup.ensureChatPageDividerDotHitEl(dot, false);
  // This is the exact expression both click owners evaluate.
  equal(hit.closest(DOT_SELECTOR), dot, 'child resolves to the dot');
  equal(dot.closest(DOT_SELECTOR), dot, 'the dot still resolves to itself');
  equal(text.closest(DOT_SELECTOR), null, 'label text is outside dot ownership');
});

await fixture('hit target: onDividerDotClick activates collapse from a child target', () => {
  const clickOwner = extractAssignedArrow(PAGE_SOURCE, 'S.onDividerDotClick');
  ok(clickOwner.includes(`ev?.target?.closest?.('${DOT_SELECTOR}')`), 'collapse owner resolves the target through the dot selector');
  ok(clickOwner.includes('if (!dot) return;'), 'non-dot targets are ignored');
  ok(clickOwner.includes('executeAtomicPageCollapseTransaction('), 'reaches the existing single transaction owner');
  // Executed proof: the child target satisfies the owner's guard.
  const markup = makeMarkupApi();
  const { dot } = makeDividerWithDot();
  const hit = markup.ensureChatPageDividerDotHitEl(dot, false);
  ok(hit.closest(DOT_SELECTOR) !== null, 'guard passes for a child target');
});

await fixture('hit target: onDividerClick returns before the Tags timer for a child target', () => {
  const tagsOwner = extractAssignedArrow(PAGE_SOURCE, 'S.onDividerClick');
  const dotIndex = tagsOwner.indexOf(`ev?.target?.closest?.('${DOT_SELECTOR}')`);
  const returnIndex = tagsOwner.indexOf('if (dot) return;');
  const timerIndex = tagsOwner.indexOf('S.dividerClickTimer = W.setTimeout(');
  ok(dotIndex >= 0, 'Tags handler tests the same dot predicate');
  ok(returnIndex > dotIndex, 'dot-owned targets return early');
  ok(timerIndex > returnIndex, 'the Tags timer is scheduled only after that early return');
  ok(tagsOwner.includes('openTagsCloudFromDivider'), 'Tags behaviour still exists for non-dot clicks');
});

await fixture('hit target: label clicks outside the region still reach the Tags path', () => {
  const markup = makeMarkupApi();
  const { divider, dot, text } = makeDividerWithDot();
  markup.ensureChatPageDividerDotHitEl(dot, false);
  // A click on the label text is not dot-owned, so the Tags handler proceeds.
  equal(text.closest(DOT_SELECTOR), null, 'label text is not dot-owned');
  equal(text.closest('.cgxui-chat-page-divider, .cgxui-pgnw-page-divider'), divider, 'label text still resolves to the divider');
  const tagsOwner = extractAssignedArrow(PAGE_SOURCE, 'S.onDividerClick');
  ok(tagsOwner.includes("closest?.('.cgxui-chat-page-divider, .cgxui-pgnw-page-divider')"), 'divider clicks still classified');
  // The region is bounded: it cannot be the whole label or the divider.
  const size = Number((SKIN_SOURCE.match(/DOT_HIT_SIZE_PX:\s*(\d+)/) || [])[1] || 0);
  const labelMin = Number((cssRule(SKIN_SOURCE, '.cgxui-chat-page-divider-label,\n.cgxui-pgnw-page-divider-pill{').match(/min-width:\s*(\d+)px/) || [])[1] || 0);
  ok(labelMin > 0 && size < labelMin, `hit region ${size}px stays narrower than the ${labelMin}px label`);
});

await fixture('hit target: double-click suppression still excludes the region', () => {
  const dbl = extractAssignedArrow(PAGE_SOURCE, 'S.onDividerDblClick');
  const dotIndex = dbl.indexOf(`closest?.('${DOT_SELECTOR}')`);
  const returnIndex = dbl.indexOf('if (dot) return;');
  const toggleIndex = dbl.indexOf('routeChatPageDividerDblClick');
  ok(dotIndex >= 0, 'double-click handler tests the same dot predicate');
  ok(returnIndex > dotIndex && toggleIndex > returnIndex, 'dot-owned targets return before the double-click toggle');
  for (const name of ['S.onDividerClick', 'S.onDividerDotClick']) {
    ok(extractAssignedArrow(PAGE_SOURCE, name).includes('if (Number(ev?.detail || 1) > 1) return;'), `${name} retains multi-click suppression`);
  }
});

await fixture('hit target: state attributes stay on the parent dot', () => {
  ok(SKIN_SOURCE.includes('cursor: not-allowed !important'), 'blocked cursor retained');
  ok(SKIN_SOURCE.includes('content: "!"'), 'blocked indicator retained');
  ok(SKIN_SOURCE.includes('.cgxui-chat-page-divider-dot::after'), 'blocked badge still belongs to the dot');
  for (const state of ['expanded', 'mixed', 'collapsed']) {
    ok(SKIN_SOURCE.includes(`[data-cgxui-chat-page-title-state="${state}"] .cgxui-chat-page-divider-dot`), `${state} state rule targets the dot`);
  }
  // No state rule was retargeted onto the child.
  ok(!/data-h2o-collapse-control-state[^\n]*dot-hit/.test(SKIN_SOURCE), 'no control-state rule targets the child');
});

await fixture('hit target: no second listener or collapse owner exists', () => {
  equal((PAGE_SOURCE.match(/addEventListener\('click',\s*S\.onDivider/g) || []).length, 2, 'still exactly the two pre-existing click listeners');
  equal((PAGE_SOURCE.match(/function executeAtomicPageCollapseTransaction\(/g) || []).length, 1, 'one collapse transaction owner is defined');
  equal((extractAssignedArrow(PAGE_SOURCE, 'S.onDividerDotClick').match(/executeAtomicPageCollapseTransaction\(/g) || []).length, 1, 'pointer activation calls that owner exactly once');
  ok(!CORE_SOURCE.includes("addEventListener('click'") || !CORE_SOURCE.includes('divider-dot-hit'), 'core adds no click listener for the child');
});

await fixture('hit target: Chat to MiniMap propagation is unchanged', () => {
  ok(PAGE_SOURCE.includes('propagateChatPageCollapseToMiniMap'), 'one-way propagation retained');
  // The correction touched markup and styling only, not synchronization.
  ok(!extractFunction(CORE_SOURCE, 'ensureChatPageDividerDotHitEl').includes('propagate'), 'the hit child does not synchronize state');
  ok(!extractFunction(CORE_SOURCE, 'ensureChatPageDividerDotHitEl').includes('setPageCollapsed'), 'the hit child owns no collapse state');
});

const failed = fixtures.filter((entry) => !entry.ok);
console.log(`Fixtures: ${fixtures.length - failed.length}/${fixtures.length}`);
console.log(`Assertions: ${assertionCount}`);
if (failed.length) {
  for (const entry of failed) console.error(entry.error);
  process.exitCode = 1;
}
