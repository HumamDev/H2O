#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const PAGE_PATH = 'src-runtime-base/1C1b.🔴📑 Thread Pages Controller 📑.js';
const VALIDATOR_PATH = 'tools/validation/chat-atlas/validate-chat-atlas-cv3-12-page-scoped-title-collapse.mjs';
const PAGE_SOURCE = fs.readFileSync(path.join(ROOT, PAGE_PATH), 'utf8');
const BASE = 'c69bb1932f740dfcf72dc212820eba6fd9d0d923';

const fixtures = [];
let assertionCount = 0;
const safety = {
  storageWrites: 0,
  preferenceWrites: 0,
  canonicalWrites: 0,
  titleAliasWrites: 0,
  cacheWrites: 0,
  networkCalls: 0,
  polling: 0,
  repeatingTimers: 0,
  newBroadObservers: 0,
  destructiveRemovals: 0,
};

function normalize(value) {
  return value && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : value;
}

function equal(actual, expected, message) {
  assertionCount += 1;
  assert.deepEqual(normalize(actual), normalize(expected), message);
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

function canonicalRecords() {
  return Array.from({ length: 39 }, (_value, index) => {
    const order = index + 1;
    return {
      order,
      turnNo: order,
      idx: order,
      qId: `q-${order}`,
      turnId: `turn:q-${order}`,
      primaryAId: `a-${order}`,
      answerIds: [`a-${order}`],
      answerVariants: [`a-${order}`],
      noAnswer: false,
    };
  });
}

function memberFromRecord(record) {
  return {
    id: record.primaryAId,
    answerId: record.primaryAId,
    questionId: record.qId,
    turnId: record.turnId,
    aliasIds: Array.from(record.answerVariants || []),
    turnNo: record.order,
    type: 'answer',
  };
}

function createAuthorityHarness() {
  const canonical = canonicalRecords();
  const selected = canonical.slice(0, 18).map((record) => ({ ...record }));
  const state = { overlay: false, invalid: false, drift: false };
  let statusReads = 0;
  const current = () => (state.overlay ? selected : canonical);
  const runtime = {
    listTurnRecords: () => canonical,
    getEffectivePresentationStatus() {
      statusReads += 1;
      const count = state.overlay ? 18 : 39;
      return {
        source: state.overlay ? 'selected-path-overlay' : 'canonical',
        overlayActive: state.overlay,
        count: state.drift && statusReads % 2 === 0 ? count + 1 : count,
        canonicalFingerprint: 'canonical-39',
        anchorQId: state.overlay ? 'q-17' : '',
        pathLength: state.overlay ? 18 : 0,
        chatId: 'chat',
        routeKey: '/c/chat',
        generation: 4,
      };
    },
    getEffectivePresentationIndex() {
      return {
        complete: !state.invalid,
        proof: state.overlay ? 'selected-path-overlay' : 'host-payload-full-graph',
        turns: current(),
      };
    },
    getEffectiveTurnRecordByQId(id) {
      return current().find((record) => record.qId === id) || null;
    },
    getEffectiveTurnRecordByAId(id) {
      return current().find((record) => record.primaryAId === id) || null;
    },
  };
  const api = vm.runInNewContext(`(() => {
    const TURN_RUNTIME = () => injectedRuntime;
    const MM_CORE_API = () => null;
    const TITLE_LIST_EFFECTIVE_METHOD = Object.freeze({
      STATUS: ['get', 'Effective', 'PresentationStatus'].join(''),
      INDEX: ['get', 'Effective', 'PresentationIndex'].join(''),
      BY_QID: ['get', 'Effective', 'TurnRecordByQId'].join(''),
      BY_AID: ['get', 'Effective', 'TurnRecordByAId'].join(''),
    });
    ${extractFunction(PAGE_SOURCE, 'pureCanonicalPageMemberDetails')}
    ${extractFunction(PAGE_SOURCE, 'titleListEffectiveStatusIdentity')}
    ${extractFunction(PAGE_SOURCE, 'titleListMemberFromPresentationRecord')}
    ${extractFunction(PAGE_SOURCE, 'readEffectiveTitleListAuthority')}
    ${extractFunction(PAGE_SOURCE, 'readTitleListPresentationAuthority')}
    ${extractFunction(PAGE_SOURCE, 'purePresentationPageMemberDetails')}
    return Object.freeze({
      authority: readTitleListPresentationAuthority,
      page: purePresentationPageMemberDetails,
    });
  })()`, { injectedRuntime: runtime });
  return {
    api,
    state,
    canonical,
    selected,
    resetReads() { statusReads = 0; },
  };
}

class FakeStyle {
  constructor() { this.values = new Map(); }
  setProperty(name, value) { this.values.set(name, String(value)); }
  removeProperty(name) { this.values.delete(name); }
  getPropertyValue(name) { return this.values.get(name) || ''; }
}

class FakeElement {
  constructor(name, attrs = {}, classes = []) {
    this.name = name;
    this.nodeType = 1;
    this.attrs = new Map(Object.entries(attrs).map(([key, value]) => [key, String(value)]));
    this.classes = new Set(classes);
    this.style = new FakeStyle();
    this.children = [];
    this.parentElement = null;
    this.isConnected = true;
    this.owningOrder = 0;
  }
  append(...nodes) {
    for (const node of nodes) {
      if (node.parentElement) {
        node.parentElement.children = node.parentElement.children.filter((candidate) => candidate !== node);
      }
      node.parentElement = this;
      this.children.push(node);
    }
  }
  contains(node) {
    if (node === this) return true;
    return this.children.some((child) => child.contains(node));
  }
  setAttribute(name, value) { this.attrs.set(name, String(value)); }
  getAttribute(name) { return this.attrs.get(name) || null; }
  hasAttribute(name) { return this.attrs.has(name); }
  removeAttribute(name) { this.attrs.delete(name); }
  matches(selector) {
    return selector.split(',').some((part) => {
      const rule = part.trim().replace(/^:scope\s*>\s*/, '');
      if (!rule) return false;
      for (const match of rule.matchAll(/\.([A-Za-z0-9_-]+)/g)) {
        if (!this.classes.has(match[1])) return false;
      }
      for (const match of rule.matchAll(/\[([^\]=^]+)(\^?=)?(?:"([^"]*)")?\]/g)) {
        const [, key, operator, value = ''] = match;
        if (!this.attrs.has(key)) return false;
        if (operator === '=' && this.getAttribute(key) !== value) return false;
        if (operator === '^=' && !String(this.getAttribute(key) || '').startsWith(value)) return false;
      }
      return true;
    });
  }
  closest(selector) {
    let node = this;
    while (node) {
      if (node.matches(selector)) return node;
      node = node.parentElement;
    }
    return null;
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
}

function member(order) {
  return {
    id: `a-${order}`,
    answerId: `a-${order}`,
    questionId: `q-${order}`,
    turnId: `turn:q-${order}`,
    aliasIds: [`a-${order}`],
    turnNo: order,
    type: 'answer',
  };
}

function turn(name, order, role) {
  return new FakeElement(name, {
    'data-testid': `conversation-turn-${order * 2 + (role === 'assistant' ? 0 : -1)}`,
    'data-turn': role,
    'data-turn-id': role === 'assistant' ? `a-${order}` : `q-${order}`,
  });
}

function createVisibilityHarness() {
  const html = new FakeElement('html');
  const flow = new FakeElement('flow');
  const conversation = new FakeElement('shared-conversation-wrapper');
  html.append(flow);
  const divider1 = new FakeElement('divider-1', { 'data-page-num': '1' }, ['cgxui-chat-page-divider']);
  const container1 = new FakeElement(
    'title-list-1',
    { 'data-cgxui': 'chat-page-title-list-synth', 'data-page-num': '1' },
    ['cgxui-chat-page-title-list-synth'],
  );
  const divider2 = new FakeElement('divider-2', { 'data-page-num': '2' }, ['cgxui-chat-page-divider']);
  const container2 = new FakeElement(
    'title-list-2',
    { 'data-cgxui': 'chat-page-title-list-synth', 'data-page-num': '2' },
    ['cgxui-chat-page-title-list-synth'],
  );
  const p1User = turn('page1-user', 25, 'user');
  const p1Quote = new FakeElement('page1-quote');
  const p1Answer = turn('page1-answer', 25, 'assistant');
  const p1Footer = new FakeElement('page1-footer');
  const p1Timestamp = new FakeElement('page1-timestamp', {
    role: 'separator',
    'data-h2o-native-ts': '1',
  });
  p1Timestamp.owningOrder = 25;
  const p2User = turn('page2-user', 26, 'user');
  const p2Quote = new FakeElement('page2-quote');
  const p2Answer = turn('page2-answer', 26, 'assistant');
  const p2Footer = new FakeElement('page2-footer');
  const p2Timestamp = new FakeElement('page2-timestamp', {
    role: 'separator',
    'data-h2o-native-ts': '1',
  });
  p2Timestamp.owningOrder = 26;
  flow.append(divider1, container1, conversation);
  conversation.append(
    p1User,
    p1Quote,
    p1Answer,
    p1Footer,
    p1Timestamp,
    divider2,
    container2,
    p2User,
    p2Quote,
    p2Answer,
    p2Footer,
    p2Timestamp,
  );
  const activePages = new Set();
  const anchors = new Map([
    ['a-25', [p1User, p1Answer]],
    ['a-26', [p2User, p2Answer]],
  ]);
  const document = {
    documentElement: html,
    querySelector(selector) { return html.querySelector(selector); },
    querySelectorAll(selector) {
      const own = html.matches(selector) ? [html] : [];
      return own.concat(html.querySelectorAll(selector));
    },
  };
  const topWindow = {
    H2O: {
      NativeTimestamps: { scan() { return 2; } },
    },
  };
  const api = vm.runInNewContext(`(() => {
    const ATTR_TITLE_LIST_FLOW_HIDDEN = 'data-cgxui-chat-page-title-list-hidden';
    const ATTR_TITLE_ONLY_ACTIVE_PAGES = 'data-cgxui-chat-title-only-pages';
    const ATTR_TITLE_STACK_INLINE = 'data-h2o-title-stack-inline';
    const ATTR_TITLE_INLINE_SLOT = 'data-h2o-title-inline-slot';
    const TITLE_LIST_SYNTH_SEL = '[data-cgxui="chat-page-title-list-synth"]';
    const TURN_HOST_SEL = '[data-testid="conversation-turn"], [data-testid^="conversation-turn-"]';
    const TOPW = injectedWindow;
    const W = injectedWindow;
    const document = injectedDocument;
    const resolveChatId = () => 'chat';
    const readTitleListPages = () => injectedActivePages;
    const restoreInlineTurnToFlow = () => {};
    const getComputedStyle = (node) => ({ display: node.style.getPropertyValue('display') || 'block' });
    const memberAllFlowAnchors = (row) => injectedAnchors.get(row.id) || [];
    const findStackRowForMember = () => null;
    const titleListAdjacentTurnOrders = (node) => node.owningOrder ? [node.owningOrder] : [];
    const readTitleListPresentationAuthority = () => ({ source: 'canonical' });
    ${extractFunction(PAGE_SOURCE, 'setTitleListFlowAnchorHidden')}
    ${extractFunction(PAGE_SOURCE, 'sweepSyntheticTitleListHidden')}
    ${extractFunction(PAGE_SOURCE, 'syncTitleOnlyModeRootAttribute')}
    ${extractFunction(PAGE_SOURCE, 'titleListFlowArtifactAllowed')}
    ${extractFunction(PAGE_SOURCE, 'stampTitleListNativeTimestampArtifacts')}
    ${extractFunction(PAGE_SOURCE, 'applyAtomicTitleOnlyPageProjection')}
    return Object.freeze({
      apply: applyAtomicTitleOnlyPageProjection,
      sweep: sweepSyntheticTitleListHidden,
    });
  })()`, {
    injectedWindow: topWindow,
    injectedDocument: document,
    injectedActivePages: activePages,
    injectedAnchors: anchors,
  });
  return {
    api,
    html,
    flow,
    conversation,
    divider1,
    container1,
    divider2,
    container2,
    p1User,
    p1Quote,
    p1Answer,
    p1Footer,
    p1Timestamp,
    p2User,
    p2Quote,
    p2Answer,
    p2Footer,
    p2Timestamp,
    activePages,
    anchors,
    document,
  };
}

function hiddenBy(pageNum, node) {
  return node.getAttribute('data-cgxui-chat-page-title-list-hidden') === String(pageNum)
    && node.style.getPropertyValue('display') === 'none';
}

function visible(node) {
  return node.getAttribute('data-cgxui-chat-page-title-list-hidden') == null
    && node.style.getPropertyValue('display') !== 'none';
}

function realBoundaryTimestampOwner() {
  const previous = { order: 25, role: 'user' };
  const next = { order: 26, role: 'user' };
  const separator = {
    compareDocumentPosition(section) {
      return section === previous ? 2 : 4;
    },
  };
  const readOwner = vm.runInNewContext(`(() => {
    const listTurnSections = () => injectedSections;
    const getTurnHostRole = (section) => section.role;
    const titleListExactTurnOrderForSection = (section) => Number(section?.order || 0);
    ${extractFunction(PAGE_SOURCE, 'titleListAdjacentTurnOrders')}
    return titleListAdjacentTurnOrders;
  })()`, { injectedSections: [previous, next] });
  return readOwner(separator);
}

await fixture('canonical baseline has two normal pages', () => {
  const authority = createAuthorityHarness();
  equal(authority.api.authority().count, 39, 'canonical count is 39');
  equal(authority.api.authority().pageCount, 2, 'canonical count produces two pages');
  equal(authority.api.page(1).length, 25, 'page one owns 25 turns');
  equal(authority.api.page(2).length, 14, 'page two owns 14 turns');
});

await fixture('collapsing Page 1 hides only Page 1 artifacts', () => {
  const h = createVisibilityHarness();
  h.activePages.add(1);
  const result = h.api.apply(1, 'chat', [member(25)], h.container1);
  equal(result.status, 'title-only', 'page one title-only projection succeeds');
  for (const node of [h.p1User, h.p1Quote, h.p1Answer, h.p1Footer]) {
    equal(hiddenBy(1, node), true, `${node.name} is Page 1 hidden`);
  }
  for (const node of [h.p2User, h.p2Quote, h.p2Answer, h.p2Footer]) {
    equal(visible(node), true, `${node.name} remains visible`);
  }
  equal(visible(h.conversation), true, 'shared conversation wrapper is never globally hidden');
});

await fixture('Page 2 native timestamp remains visible under Page 1 collapse', () => {
  const h = createVisibilityHarness();
  h.activePages.add(1);
  h.api.apply(1, 'chat', [member(25)], h.container1);
  equal(realBoundaryTimestampOwner(), [26], 'real timestamp ownership selects the following Page 2 turn');
  equal(visible(h.p2Timestamp), true, 'Page 2 timestamp is not borrowed by Page 1');
  equal(h.p2Timestamp.getAttribute('data-cgxui-chat-page-title-list-hidden'), null, 'Page 2 timestamp has no Page 1 stamp');
});

await fixture('Page 1 native timestamp is hidden under Page 1 collapse', () => {
  const h = createVisibilityHarness();
  h.activePages.add(1);
  const result = h.api.apply(1, 'chat', [member(25)], h.container1);
  equal(hiddenBy(1, h.p1Timestamp), true, 'Page 1 timestamp is hidden');
  equal(result.nativeTimestampsHidden <= 1, true, 'timestamp repair performs at most one additional owning-page hide');
  equal(visible(h.p2Timestamp), true, 'timestamp repair does not cross into Page 2');
});

await fixture('collapsing Page 2 hides Page 2 and keeps Page 1 normal', () => {
  const h = createVisibilityHarness();
  h.activePages.add(2);
  h.api.apply(2, 'chat', [member(26)], h.container2);
  for (const node of [h.p2User, h.p2Quote, h.p2Answer, h.p2Footer, h.p2Timestamp]) {
    equal(hiddenBy(2, node), true, `${node.name} is Page 2 hidden`);
  }
  for (const node of [h.p1User, h.p1Quote, h.p1Answer, h.p1Footer, h.p1Timestamp]) {
    equal(visible(node), true, `${node.name} remains Page 1 visible`);
  }
});

await fixture('expanding Page 1 restores it without changing Page 2 state', () => {
  const h = createVisibilityHarness();
  h.activePages.add(1);
  h.activePages.add(2);
  h.api.apply(1, 'chat', [member(25)], h.container1);
  h.api.apply(2, 'chat', [member(26)], h.container2);
  h.activePages.delete(1);
  h.api.sweep(1);
  equal(visible(h.p1User), true, 'Page 1 user restores');
  equal(visible(h.p1Timestamp), true, 'Page 1 timestamp restores');
  equal(hiddenBy(2, h.p2Answer), true, 'Page 2 collapse remains owned');
});

await fixture('expanding Page 2 restores it without changing Page 1 state', () => {
  const h = createVisibilityHarness();
  h.activePages.add(1);
  h.activePages.add(2);
  h.api.apply(1, 'chat', [member(25)], h.container1);
  h.api.apply(2, 'chat', [member(26)], h.container2);
  h.activePages.delete(2);
  h.api.sweep(2);
  equal(visible(h.p2Answer), true, 'Page 2 answer restores');
  equal(visible(h.p2Timestamp), true, 'Page 2 timestamp restores');
  equal(hiddenBy(1, h.p1Answer), true, 'Page 1 collapse remains owned');
});

await fixture('collapsed-page state is independent rather than global', () => {
  const h = createVisibilityHarness();
  h.activePages.add(1);
  h.activePages.add(2);
  h.api.apply(1, 'chat', [member(25)], h.container1);
  h.api.apply(2, 'chat', [member(26)], h.container2);
  equal(h.html.getAttribute('data-cgxui-chat-title-only-pages'), '1,2', 'root diagnostic records two independent pages');
  equal(h.p1Answer.getAttribute('data-cgxui-chat-page-title-list-hidden'), '1', 'Page 1 keeps owner 1');
  equal(h.p2Answer.getAttribute('data-cgxui-chat-page-title-list-hidden'), '2', 'Page 2 keeps owner 2');
});

await fixture('remounted Page 1 content is immediately hidden', () => {
  const h = createVisibilityHarness();
  h.activePages.add(1);
  h.api.apply(1, 'chat', [member(25)], h.container1);
  const remounted = turn('page1-remount', 25, 'assistant');
  h.conversation.append(remounted);
  h.anchors.set('a-25', [h.p1User, remounted]);
  h.api.apply(1, 'chat', [member(25)], h.container1);
  equal(hiddenBy(1, remounted), true, 'Page 1 remount is hidden in the same repair');
  equal(visible(h.p2Answer), true, 'repair does not hide Page 2');
});

await fixture('remounted Page 2 content stays visible under Page 1 collapse', () => {
  const h = createVisibilityHarness();
  h.activePages.add(1);
  h.api.apply(1, 'chat', [member(25)], h.container1);
  const remounted = turn('page2-remount', 26, 'assistant');
  h.conversation.append(remounted);
  h.api.apply(1, 'chat', [member(25)], h.container1);
  equal(visible(remounted), true, 'foreign page remount remains visible');
  equal(visible(h.conversation), true, 'shared wrapper remains visible');
});

await fixture('selected 18-turn authority has only Page 1', () => {
  const h = createAuthorityHarness();
  h.state.overlay = true;
  h.resetReads();
  equal(h.api.authority().source, 'selected-path-overlay', 'effective overlay is coherent');
  equal(h.api.authority().count, 18, 'effective count is 18');
  equal(h.api.page(1).map((row) => row.turnNo), Array.from({ length: 18 }, (_v, i) => i + 1), 'Page 1 is 1..18');
  equal(h.api.page(2).length, 0, 'Page 2 does not exist');
});

await fixture('canonical return restores Page 2 as normal while Page 1 stays collapsed', () => {
  const authority = createAuthorityHarness();
  authority.state.overlay = true;
  authority.resetReads();
  equal(authority.api.page(2).length, 0, 'selected path starts without Page 2');
  authority.state.overlay = false;
  authority.resetReads();
  equal(authority.api.page(1).length, 25, 'Page 1 returns to 25');
  equal(authority.api.page(2).length, 14, 'Page 2 returns with 14 normal turns');
  const h = createVisibilityHarness();
  h.activePages.add(1);
  h.api.apply(1, 'chat', [member(25)], h.container1);
  equal(visible(h.p2Answer), true, 'returned Page 2 does not inherit Page 1 collapse');
});

await fixture('invalid effective authority falls wholly back to canonical page ownership', () => {
  const h = createAuthorityHarness();
  h.state.overlay = true;
  h.state.invalid = true;
  h.resetReads();
  equal(h.api.authority().source, 'canonical', 'invalid overlay falls back atomically');
  equal(h.api.page(1).length, 25, 'fallback Page 1 remains 25');
  equal(h.api.page(2).length, 14, 'fallback Page 2 remains 14');
  h.state.invalid = false;
  h.state.drift = true;
  h.resetReads();
  equal(h.api.authority().source, 'canonical', 'status drift cannot mix page counts');
});

await fixture('atomic projection never creates an intermediate global hide', () => {
  const h = createVisibilityHarness();
  h.activePages.add(1);
  const result = h.api.apply(1, 'chat', [member(25)], h.container1);
  equal(result.hidden >= 4, true, 'Page 1 artifacts hide in one projection');
  equal(visible(h.conversation), true, 'shared root is visible in the committed state');
  equal(visible(h.p2User), true, 'Page 2 is visible in the same committed state');
  equal(h.html.style.getPropertyValue('display'), '', 'document root is never display-hidden');
});

await fixture('restore removes only the owning page stamp and preserves inline integrity', () => {
  const h = createVisibilityHarness();
  h.activePages.add(1);
  h.api.apply(1, 'chat', [member(25)], h.container1);
  const released = h.api.sweep(1);
  ok(released >= 5, 'Page 1 stamps release');
  for (const node of [h.p1User, h.p1Quote, h.p1Answer, h.p1Footer, h.p1Timestamp]) {
    equal(node.getAttribute('data-cgxui-chat-page-title-list-hidden'), null, `${node.name} owner clears`);
    equal(node.style.getPropertyValue('display'), '', `${node.name} display restores`);
  }
});

await fixture('repeated page-scoped toggles are idempotent', () => {
  const h = createVisibilityHarness();
  h.activePages.add(1);
  const first = h.api.apply(1, 'chat', [member(25)], h.container1);
  const second = h.api.apply(1, 'chat', [member(25)], h.container1);
  equal(first.activePages, [1], 'first pass owns Page 1');
  equal(second.activePages, [1], 'second pass owns the same Page 1');
  equal(second.hidden, 0, 'unchanged pass performs no new hide writes');
  equal(visible(h.p2Answer), true, 'idempotent pass never accumulates into Page 2');
});

await fixture('safety invariants remain zero', () => {
  const diff = execFileSync('git', ['diff', '--unified=0', BASE, '--', PAGE_PATH], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  const added = diff.split('\n').filter((line) => line.startsWith('+') && !line.startsWith('+++')).join('\n');
  equal(/\bfetch\s*\(/.test(added), false, 'no network call');
  equal(/\bsetInterval\s*\(/.test(added), false, 'no polling');
  equal(/\bnew\s+MutationObserver\b/.test(added), false, 'no broad observer');
  equal(/localStorage\.(?:setItem|removeItem|clear)\s*\(/.test(added), false, 'no storage write');
  equal(/sessionStorage\.(?:setItem|removeItem|clear)\s*\(/.test(added), false, 'no session cache write');
  equal(/canonical.*(?:set|write|mutat)/i.test(added), false, 'no canonical write');
  equal(/alias(?:es)?\\.(?:set|write|delete)/i.test(added), false, 'no alias write');
  equal(/\\.remove\\(\\)/.test(added), false, 'no destructive removal');
  equal(PAGE_SOURCE.includes("hub.onMutations('chat-pages:title-list'"), true, 'existing Observer Hub remains the remount owner');
});

await fixture('scope is limited to Thread Pages and CV-3.12', () => {
  const changedTracked = execFileSync('git', ['diff', '--name-only', '-z', BASE], {
    cwd: ROOT,
    encoding: 'utf8',
  }).split('\0').filter(Boolean);
  const changedUntracked = execFileSync('git', ['ls-files', '--others', '--exclude-standard', '-z'], {
    cwd: ROOT,
    encoding: 'utf8',
  }).split('\0').filter(Boolean);
  const changed = Array.from(new Set([...changedTracked, ...changedUntracked])).sort();
  equal(changed, [PAGE_PATH, VALIDATOR_PATH].sort(), 'only approved files change');
  equal(PAGE_SOURCE.includes("const existingOwner = Math.max(0, Number(anchor.getAttribute?.(ATTR_TITLE_LIST_FLOW_HIDDEN)"), true, 'page stamp ownership cannot be stolen');
  equal(PAGE_SOURCE.includes("kind: owned && foreign ? 'mixed'"), true, 'mixed shared wrappers are explicitly classified');
  equal(PAGE_SOURCE.includes('nextBoundary'), true, 'page end boundary is explicit');
  equal(PAGE_SOURCE.includes('selected-path-overlay'), true, 'effective authority remains branch-aware');
});

for (const key of Object.keys(safety)) equal(safety[key], 0, `safety counter ${key} remains zero`);

const failed = fixtures.filter((entry) => !entry.ok);
for (const entry of fixtures) {
  console.log(`${entry.ok ? 'PASS' : 'FAIL'} ${entry.name}`);
  if (!entry.ok) console.log(entry.error);
}
console.log(`\nCV-3.12 page-scoped title collapse: ${fixtures.length - failed.length}/${fixtures.length} fixtures passed; ${assertionCount} assertions`);
console.log(`Safety counters: ${JSON.stringify(safety)}`);

if (failed.length) process.exitCode = 1;
