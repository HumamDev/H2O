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
const CORE_SOURCE = fs.readFileSync(path.join(ROOT, CORE_PATH), 'utf8');
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
      onDividerDotClick: null,
    },
    resolveChatId: () => 'chat-1',
    collapsedNativeRangeKey: (chatId, pageNum) => `${String(chatId || 'chat-1')}:${Number(pageNum || 0)}`,
    isTitleListActive: () => sandbox.__titleListActive === true,
    releaseCollapsedNativeRange: () => { counters.nativeRelease += 1; return 0; },
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

await fixture('Enter forwards once without focus loss', () => {
  const h = makeHarness();
  h.sandbox.S.onDividerDotClick = (event) => {
    h.counters.clickForwards += 1;
    h.api.handleCollapseUnavailableActivation(1, 'chat-1', h.readiness, event.h2oActivationSource);
  };
  const result = h.api.forwardCollapseControlKeyboardActivation({
    key: 'Enter',
    target: h.page1Dot,
    repeat: false,
    preventDefault() {},
    stopPropagation() {},
  });
  equal(result.source, 'chat-page-divider:keyboard-enter', 'Enter source');
  equal(h.counters.clickForwards, 1, 'one forward');
  equal(h.document.activeElement, h.page1Dot, 'focus retained');
  equal(feedbackNodes(h).length, 1, 'one message');
});

await fixture('Space forwards once and suppresses repeats', () => {
  const h = makeHarness();
  h.sandbox.S.onDividerDotClick = (event) => {
    h.counters.clickForwards += 1;
    h.api.handleCollapseUnavailableActivation(1, 'chat-1', h.readiness, event.h2oActivationSource);
  };
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
  ok(h.page1Dot.getAttribute('title').includes(h.readiness.reason), 'technical title');
  ok(h.page1Dot.getAttribute('aria-label').includes(h.readiness.reason), 'technical aria label');
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
  coreOnlyConsumesReadiness: CORE_SOURCE.includes("divider.getAttribute?.('data-h2o-collapse-readiness')"),
};
ok(sourceChecks.noAutomaticCampaign, 'readiness has no campaign');
ok(sourceChecks.noReadinessScroll, 'readiness has no scroll');
ok(sourceChecks.noPositionalOwnership, 'readiness has no positional inference');
ok(sourceChecks.coreOnlyConsumesReadiness, 'Core consumes readiness data');

const failed = fixtures.filter((entry) => !entry.ok);
console.log(`Fixtures: ${fixtures.length - failed.length}/${fixtures.length}`);
console.log(`Assertions: ${assertionCount}`);
if (failed.length) {
  for (const entry of failed) console.error(entry.error);
  process.exitCode = 1;
}
