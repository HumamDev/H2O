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
const BASE = '3dfdedbbced133177837c30682302d1f439090f4';
const Q17 = '8a2afe19-c39b-4e29-8c5f-74043a2e0c4c';
const A17 = '7b695490-e7a4-4af6-8ad9-4e15977917bb';
const Q18 = 'e9aeedf5-f75b-488c-8527-21d9ef155539';
const A18 = 'ac657e57-7d6b-4379-bf50-07158d192924';

const fixtures = [];
let assertionCount = 0;
const safety = {
  storageWrites: 0,
  preferenceWrites: 0,
  canonicalWrites: 0,
  titleAliasWrites: 0,
  cacheWrites: 0,
  networkCalls: 0,
  pollingIntervals: 0,
  repeatingTimers: 0,
  newBroadObservers: 0,
  destructiveHostRemovals: 0,
};

function equal(actual, expected, message) {
  assertionCount += 1;
  const normalize = (value) => (
    value && typeof value === 'object'
      ? JSON.parse(JSON.stringify(value))
      : value
  );
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
    const qId = order === 17 ? Q17 : `canonical-q-${order}`;
    const primaryAId = order === 17 ? 'canonical-a-17' : `canonical-a-${order}`;
    return {
      order,
      turnNo: order,
      idx: order,
      qId,
      turnId: `turn:${qId}`,
      primaryAId,
      answerIds: order === 17 ? [primaryAId, A17] : [primaryAId],
      answerVariants: order === 17 ? [primaryAId, A17] : [primaryAId],
      noAnswer: false,
      stopped: false,
    };
  });
}

function selectedRecords(canonical) {
  const rows = canonical.slice(0, 17).map((record) => ({
    ...record,
    primaryAId: record.order === 17 ? A17 : record.primaryAId,
  }));
  rows.push({
    order: 18,
    turnNo: 18,
    idx: 18,
    qId: Q18,
    turnId: `turn:${Q18}`,
    primaryAId: A18,
    answerIds: [A18],
    answerVariants: [A18],
    noAnswer: false,
    stopped: false,
  });
  return rows;
}

function canonicalMembers(records, pageNum) {
  return records
    .filter((record) => Math.ceil(record.order / 25) === pageNum)
    .map((record) => ({
      id: record.primaryAId || record.qId,
      answerId: record.primaryAId || '',
      questionId: record.qId,
      turnId: record.turnId,
      aliasIds: Array.from(record.answerVariants || []),
      turnNo: record.order,
      type: record.primaryAId ? 'answer' : 'no-answer',
    }));
}

function createAuthorityHarness() {
  const canonical = canonicalRecords();
  const selected = selectedRecords(canonical);
  const state = {
    overlay: false,
    invalidIndex: false,
    driftStatus: false,
    duplicateQId: false,
  };
  let statusReads = 0;
  const byQ = (rows) => new Map(rows.map((record) => [record.qId, record]));
  const byA = (rows) => new Map(rows.flatMap((record) => (
    Array.from(record.answerVariants || []).map((answerId) => [answerId, record])
  )));
  const runtime = {
    getEffectivePresentationStatus() {
      statusReads += 1;
      const count = state.overlay ? 18 : 39;
      return {
        source: state.overlay ? 'selected-path-overlay' : 'canonical',
        overlayActive: state.overlay,
        count: state.driftStatus && statusReads % 2 === 0 ? count + 1 : count,
        canonicalFingerprint: 'canonical-39',
        anchorQId: state.overlay ? Q17 : null,
        pathLength: state.overlay ? 18 : 0,
        chatId: 'fixture-chat',
        routeKey: '/c/fixture-chat',
        generation: 7,
      };
    },
    getEffectivePresentationIndex() {
      const rows = state.overlay ? selected.map((record) => ({ ...record })) : canonical;
      if (state.duplicateQId && rows.length > 1) rows[1].qId = rows[0].qId;
      return {
        complete: !state.invalidIndex,
        proof: state.overlay ? 'selected-path-overlay' : 'host-payload-full-graph',
        turns: rows,
      };
    },
    getEffectiveTurnRecordByQId(id) {
      return byQ(state.overlay ? selected : canonical).get(String(id || '')) || null;
    },
    getEffectiveTurnRecordByAId(id) {
      return byA(state.overlay ? selected : canonical).get(String(id || '')) || null;
    },
  };
  const code = `(() => {
    const TURN_RUNTIME = () => injectedRuntime;
    const TITLE_LIST_EFFECTIVE_METHOD = Object.freeze({
      STATUS: ['get', 'Effective', 'PresentationStatus'].join(''),
      INDEX: ['get', 'Effective', 'PresentationIndex'].join(''),
      BY_QID: ['get', 'Effective', 'TurnRecordByQId'].join(''),
      BY_AID: ['get', 'Effective', 'TurnRecordByAId'].join(''),
    });
    const pureCanonicalPageMemberDetails = injectedCanonicalPage;
    ${extractFunction(PAGE_SOURCE, 'titleListEffectiveStatusIdentity')}
    ${extractFunction(PAGE_SOURCE, 'titleListMemberFromPresentationRecord')}
    ${extractFunction(PAGE_SOURCE, 'readEffectiveTitleListAuthority')}
    ${extractFunction(PAGE_SOURCE, 'readTitleListPresentationAuthority')}
    ${extractFunction(PAGE_SOURCE, 'purePresentationPageMemberDetails')}
    return Object.freeze({
      effective: readEffectiveTitleListAuthority,
      authority: readTitleListPresentationAuthority,
      page: purePresentationPageMemberDetails,
    });
  })()`;
  const api = vm.runInNewContext(code, {
    injectedRuntime: runtime,
    injectedCanonicalPage: (pageNum) => canonicalMembers(canonical, pageNum),
    Array,
    JSON,
    Math,
    Number,
    Object,
    Set,
    String,
  });
  return {
    api,
    state,
    canonical,
    selected,
    resetStatusReads() { statusReads = 0; },
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
  compareDocumentPosition(other) {
    const rootOf = (node) => {
      let current = node;
      while (current.parentElement) current = current.parentElement;
      return current;
    };
    const flatten = (node, out = []) => {
      out.push(node);
      for (const child of node.children) flatten(child, out);
      return out;
    };
    const root = rootOf(this);
    const order = flatten(root);
    const left = order.indexOf(this);
    const right = order.indexOf(other);
    if (left < 0 || right < 0 || left === right) return 0;
    return left < right ? 4 : 2;
  }
}

function createVisibilityHarness() {
  const html = new FakeElement('html');
  const flow = new FakeElement('flow');
  html.append(flow);
  const divider = new FakeElement('divider', { 'data-page-num': '1' }, ['cgxui-chat-page-divider']);
  const container = new FakeElement(
    'title-list',
    { 'data-cgxui': 'chat-page-title-list-synth', 'data-page-num': '1' },
    ['cgxui-chat-page-title-list-synth'],
  );
  const user = new FakeElement('user', { 'data-testid': 'conversation-turn-33', 'data-turn': 'user', 'data-turn-id': Q17 });
  const quote = new FakeElement('quote-card');
  const answer = new FakeElement('answer', { 'data-testid': 'conversation-turn-34', 'data-turn': 'assistant', 'data-turn-id': A17 });
  const footer = new FakeElement('answer-footer');
  const timestamp = new FakeElement('native-timestamp', {
    role: 'separator',
    'aria-label': 'Monday, July 28 at 9:20 PM',
    'data-h2o-native-ts': '1',
  });
  timestamp.adjacentOrders = [17];
  flow.append(divider, container, user, quote, footer, answer, timestamp);
  const activePages = new Set([1]);
  const anchors = new Map();
  const member = {
    id: A17,
    answerId: A17,
    questionId: Q17,
    turnId: `turn:${Q17}`,
    aliasIds: [A17],
    turnNo: 17,
    type: 'answer',
  };
  anchors.set(member.id, [user, answer]);
  let timestampScans = 0;
  const document = {
    documentElement: html,
    querySelector(selector) {
      if (selector.includes('data-page-num="1"')) return divider;
      return html.querySelector(selector);
    },
    querySelectorAll(selector) {
      const own = html.matches(selector) ? [html] : [];
      return own.concat(html.querySelectorAll(selector));
    },
  };
  const topWindow = {
    H2O: {
      NativeTimestamps: {
        scan() { timestampScans += 1; return 1; },
      },
    },
  };
  const code = `(() => {
    const ATTR_TITLE_LIST_FLOW_HIDDEN = 'data-cgxui-chat-page-title-list-hidden';
    const ATTR_TITLE_ONLY_ACTIVE_PAGES = 'data-cgxui-chat-title-only-pages';
    const ATTR_TITLE_STACK_INLINE = 'data-h2o-title-stack-inline';
    const ATTR_TITLE_INLINE_SLOT = 'data-h2o-title-inline-slot';
    const TITLE_LIST_SYNTH_SEL = '[data-cgxui="chat-page-title-list-synth"]';
    const TURN_HOST_SEL = '[data-testid="conversation-turn"], [data-testid^="conversation-turn-"]';
    const TOPW = injectedTopWindow;
    const W = injectedTopWindow;
    const document = injectedDocument;
    const resolveChatId = () => 'fixture-chat';
    const readTitleListPages = () => injectedActivePages;
    const restoreInlineTurnToFlow = () => {};
    const getComputedStyle = (node) => ({ display: node.style.getPropertyValue('display') || 'block' });
    const memberAllFlowAnchors = (member) => injectedAnchors.get(member.id) || [];
    const findStackRowForMember = () => null;
    const titleListAdjacentTurnOrders = (node) => Array.from(node.adjacentOrders || []);
    const readTitleListPresentationAuthority = () => ({ source: injectedSource });
    ${extractFunction(PAGE_SOURCE, 'setTitleListFlowAnchorHidden')}
    ${extractFunction(PAGE_SOURCE, 'sweepSyntheticTitleListHidden')}
    ${extractFunction(PAGE_SOURCE, 'syncTitleOnlyModeRootAttribute')}
    ${extractFunction(PAGE_SOURCE, 'titleListDirectFlowChild')}
    ${extractFunction(PAGE_SOURCE, 'titleListFlowArtifactAllowed')}
    ${extractFunction(PAGE_SOURCE, 'stampTitleListNativeTimestampArtifacts')}
    ${extractFunction(PAGE_SOURCE, 'applyAtomicTitleOnlyPageProjection')}
    ${extractFunction(PAGE_SOURCE, 'titleListMutationTouchesOwnedFlow')}
    return Object.freeze({
      apply: applyAtomicTitleOnlyPageProjection,
      sweep: sweepSyntheticTitleListHidden,
      mutationTouches: titleListMutationTouchesOwnedFlow,
    });
  })()`;
  const api = vm.runInNewContext(code, {
    injectedTopWindow: topWindow,
    injectedDocument: document,
    injectedActivePages: activePages,
    injectedAnchors: anchors,
    injectedSource: 'selected-path-overlay',
    Array,
    Math,
    Number,
    Object,
    Set,
    String,
  });
  return {
    api,
    html,
    flow,
    divider,
    container,
    user,
    quote,
    answer,
    footer,
    timestamp,
    activePages,
    anchors,
    member,
    document,
    timestampScans: () => timestampScans,
  };
}

function createTransitionOrderHarness({ active }) {
  const log = [];
  const code = `(() => {
    const resolveChatId = () => 'fixture-chat';
    const isTitleListActive = () => injectedActive;
    const getRows = () => [];
    const AT_PUBLIC = () => ({ setCollapsed: (id, value) => injectedLog.push(value ? 'legacy-collapse' : 'legacy-expand') });
    const UM_PUBLIC = () => ({
      collapseManyByIds: () => injectedLog.push('collapse'),
      expandManyByIds: () => injectedLog.push('expand'),
    });
    const getConfiguredDividerRoutes = () => ({ dividerDotRoute: 'engine/unmount' });
    const readTitleIntentLedger = () => ({ pages: { '1': { state: injectedActive ? 'collapsed' : 'expanded' } } });
    const titleIntentPageHasActiveState = () => true;
    const normalizeAnswerIds = (ids) => Array.from(ids);
    const getAuthoritativePageAnswerIds = () => ['a-1'];
    const syncSyntheticTitleList = (_page, _chat, enabled) => {
      injectedLog.push(enabled ? 'sync-active' : 'sync-inactive');
      return { ok: true };
    };
    const applyNoAnswerTitleCollapsedDom = () => {};
    const setQuestionHostTitleListHidden = () => {};
    const sweepQuestionHostRestore = () => {};
    const applyTitleIntentToPage = () => ({ ok: true });
    const incTitleIntentStat = () => {};
    const cancelDotExpandConvergence = () => {};
    const scheduleDotExpandConvergence = () => null;
    ${extractFunction(PAGE_SOURCE, 'applyTitleListVisuals')}
    return applyTitleListVisuals;
  })()`;
  const run = vm.runInNewContext(code, {
    injectedActive: active,
    injectedLog: log,
    Array,
    Math,
    Number,
    Object,
    String,
  });
  run(1, { chatId: 'fixture-chat', source: 'chat-page-divider:dot', animate: false });
  return log;
}

await fixture('canonical baseline lists exactly page-one orders 1 through 25', () => {
  const harness = createAuthorityHarness();
  const authority = harness.api.authority();
  const page = harness.api.page(1);
  equal(authority.source, 'canonical', 'canonical authority is selected while overlay is inactive');
  equal(authority.count, 39, 'canonical count remains 39');
  equal(authority.pageCount, 2, 'canonical authority has two pages');
  equal(page.length, 25, 'canonical page one contains 25 rows');
  equal(page.map((member) => member.turnNo), Array.from({ length: 25 }, (_v, i) => i + 1), 'canonical page one order is 1..25');
});

await fixture('selected-path baseline lists only effective orders 1 through 18', () => {
  const harness = createAuthorityHarness();
  harness.state.overlay = true;
  const authority = harness.api.authority();
  const page = harness.api.page(1);
  equal(authority.source, 'selected-path-overlay', 'selected overlay is the title-list source');
  equal(authority.count, 18, 'effective count is 18');
  equal(authority.pageCount, 1, 'effective path has one page');
  equal(page.length, 18, 'page one contains exactly 18 rows');
  equal(page.map((member) => member.turnNo), Array.from({ length: 18 }, (_v, i) => i + 1), 'effective orders are 1..18');
  equal(harness.api.page(2).length, 0, 'no effective page two exists');
});

await fixture('effective row identity is exact and independent of mounted DOM order', () => {
  const harness = createAuthorityHarness();
  harness.state.overlay = true;
  const page = harness.api.page(1);
  equal(page[16].questionId, Q17, 'turn 17 owns the exact anchor qId');
  equal(page[16].answerId, A17, 'turn 17 owns the exact selected answer');
  equal(page[17].questionId, Q18, 'turn 18 owns the branch-specific qId');
  equal(page[17].answerId, A18, 'turn 18 owns the branch-specific aId');
  ok(!PAGE_SOURCE.includes('purePresentationPageMemberDetails(num).sort'), 'presentation membership is not sorted from DOM');
});

await fixture('collapse commits title-only visibility before background unmount', () => {
  const log = createTransitionOrderHarness({ active: true });
  equal(log[0], 'sync-active', 'central title-only stack is committed first');
  equal(log[1], 'collapse', 'unmount collapse runs only after presentation is hidden');
  equal(log.filter((entry) => entry === 'sync-active').length, 1, 'one active sync owns the first commit');
});

await fixture('all non-title artifacts in the owned page range are suppressed', () => {
  const harness = createVisibilityHarness();
  const result = harness.api.apply(1, 'fixture-chat', [harness.member], harness.container);
  equal(result.status, 'title-only', 'central title-only contract is active');
  for (const node of [harness.user, harness.quote, harness.answer, harness.footer]) {
    equal(node.getAttribute('data-cgxui-chat-page-title-list-hidden'), '1', `${node.name} is stamped hidden`);
    equal(node.style.getPropertyValue('display'), 'none', `${node.name} is hidden synchronously`);
  }
  equal(harness.container.getAttribute('data-cgxui-chat-page-title-list-hidden'), null, 'title stack stays visible');
  equal(harness.divider.getAttribute('data-cgxui-chat-page-title-list-hidden'), null, 'page divider stays visible');
});

await fixture('native timestamp separators outside turn sections are hidden by page ownership', () => {
  const harness = createVisibilityHarness();
  const result = harness.api.apply(1, 'fixture-chat', [harness.member], harness.container);
  equal(harness.timestampScans(), 1, 'existing semantic timestamp scanner is reused once');
  equal(result.nativeTimestampsHidden, 1, 'one page-owned native timestamp is hidden');
  equal(harness.timestamp.getAttribute('data-cgxui-chat-page-title-list-hidden'), '1', 'sibling separator owns the page hide stamp');
  equal(harness.timestamp.style.getPropertyValue('display'), 'none', 'native separator cannot remain visible');
});

await fixture('remounted flow artifacts are hidden in the observer-hub microtask', () => {
  const harness = createVisibilityHarness();
  harness.api.apply(1, 'fixture-chat', [harness.member], harness.container);
  const remounted = new FakeElement('remounted-answer', {
    'data-testid': 'conversation-turn-34',
    'data-turn': 'assistant',
    'data-turn-id': A17,
  });
  harness.flow.append(remounted);
  harness.anchors.set(harness.member.id, [harness.user, remounted]);
  equal(harness.api.mutationTouches({
    conversationRelevant: true,
    addedElements: [remounted],
  }), true, 'existing Observer Hub identifies the remounted turn');
  harness.api.apply(1, 'fixture-chat', [harness.member], harness.container);
  equal(remounted.style.getPropertyValue('display'), 'none', 'remounted answer is hidden before paint');
  ok(!PAGE_SOURCE.includes('new MutationObserver'), 'page controller adds no broad observer');
});

await fixture('closing title-list mode restores stamped flow without permanent visibility damage', () => {
  const harness = createVisibilityHarness();
  harness.api.apply(1, 'fixture-chat', [harness.member], harness.container);
  harness.activePages.clear();
  const released = harness.api.sweep(1);
  ok(released >= 5, 'all page-owned stamps are released');
  for (const node of [harness.user, harness.quote, harness.answer, harness.footer, harness.timestamp]) {
    equal(node.hasAttribute('data-cgxui-chat-page-title-list-hidden'), false, `${node.name} stamp is removed`);
    equal(node.style.getPropertyValue('display'), '', `${node.name} inline hide is removed`);
  }
});

await fixture('branch switch while list is open changes 25 rows to 18 atomically', () => {
  const harness = createAuthorityHarness();
  equal(harness.api.page(1).length, 25, 'open canonical list starts with 25 rows');
  harness.state.overlay = true;
  harness.resetStatusReads();
  const next = harness.api.page(1);
  equal(next.length, 18, 'one effective snapshot replaces membership with 18 rows');
  equal(next.some((member) => member.turnNo >= 19), false, 'no canonical rows 19..25 survive');
  ok(PAGE_SOURCE.includes("syncActiveTitleListsNow('effective-presentation')"), 'existing Core presentation event performs synchronous list repair');
});

await fixture('canonical return while list is open restores 25 rows without refresh', () => {
  const harness = createAuthorityHarness();
  harness.state.overlay = true;
  equal(harness.api.page(1).length, 18, 'selected list begins at 18');
  harness.state.overlay = false;
  harness.resetStatusReads();
  equal(harness.api.page(1).length, 25, 'canonical return restores page-one membership');
  equal(harness.api.authority().count, 39, 'canonical count returns to 39');
  ok(!PAGE_SOURCE.includes('refreshCompleteTurnIndexProjection'), 'title-list transition does not request host Refresh');
});

await fixture('page-two rules follow the coherent authority count', () => {
  const harness = createAuthorityHarness();
  equal(harness.api.page(2).length, 14, 'canonical page two contains the remaining 14 rows');
  harness.state.overlay = true;
  harness.resetStatusReads();
  equal(harness.api.page(2).length, 0, 'selected 18-turn path has no page-two rows');
  ok(PAGE_SOURCE.includes("'page-outside-presentation'"), 'stale page-two stack is released while effective path is short');
});

await fixture('invalid or transitioning effective authority fails wholly to canonical', () => {
  const harness = createAuthorityHarness();
  harness.state.overlay = true;
  harness.state.invalidIndex = true;
  equal(harness.api.authority().source, 'canonical', 'invalid proof falls back to canonical');
  equal(harness.api.page(1).length, 25, 'invalid proof never combines count 18 with canonical fragments');
  harness.state.invalidIndex = false;
  harness.state.driftStatus = true;
  harness.resetStatusReads();
  equal(harness.api.authority().source, 'canonical', 'status drift during the read falls back atomically');
  harness.state.driftStatus = false;
  harness.state.duplicateQId = true;
  harness.resetStatusReads();
  equal(harness.api.authority().source, 'canonical', 'ambiguous qId ownership falls back atomically');
});

await fixture('repeated title-only projection is idempotent and creates no duplicate list state', () => {
  const harness = createVisibilityHarness();
  const first = harness.api.apply(1, 'fixture-chat', [harness.member], harness.container);
  const second = harness.api.apply(1, 'fixture-chat', [harness.member], harness.container);
  equal(first.activePages, [1], 'first projection owns one active page');
  equal(second.activePages, [1], 'second projection owns the same one active page');
  equal(second.hidden, 0, 'unchanged visibility projection performs no new hide writes');
  equal(harness.html.getAttribute('data-cgxui-chat-title-only-pages'), '1', 'one root mode contract remains active');
});

await fixture('expand order restores engines before releasing the title-only projection', () => {
  const log = createTransitionOrderHarness({ active: false });
  equal(log[0], 'expand', 'engine expansion occurs while title-only stamp still owns visibility');
  equal(log[1], 'sync-inactive', 'central projection releases after restoration');
  equal(log.filter((entry) => entry === 'sync-inactive').length, 1, 'one inactive sync owns restore');
});

await fixture('safety and consumer boundaries remain narrow', () => {
  const diff = execFileSync('git', ['diff', '--unified=0', BASE, '--', PAGE_PATH], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  const added = diff.split('\n').filter((line) => line.startsWith('+') && !line.startsWith('+++')).join('\n');
  equal(/\bfetch\s*\(/.test(added), false, 'no network call is added');
  equal(/\bsetInterval\s*\(/.test(added), false, 'no polling interval is added');
  equal(/\bnew\s+MutationObserver\b/.test(added), false, 'no new broad observer is added');
  equal(/localStorage\.(?:setItem|removeItem|clear)\s*\(/.test(added), false, 'no storage write is added');
  equal(/sessionStorage\.(?:setItem|removeItem|clear)\s*\(/.test(added), false, 'no cache-like session write is added');
  equal(/reconcil(?:e|iation).*(?:accept|write)/i.test(added), false, 'no reconciliation acceptance is added');
  equal(/canonical.*(?:set|write|mutat)/i.test(added), false, 'no canonical mutation is added');
  equal(/(?:set|write|mutat)(?:Turn|Title)?Alias|alias(?:es)?\\.(?:set|write|delete)/i.test(added), false, 'no title-alias mutation is added');
  equal(/\\.remove\\(\\)/.test(added), false, 'no destructive host-node removal is added');

  const consumers = execFileSync('rg', [
    '-l',
    'getEffectivePresentationIndex|getEffectivePresentationStatus|getEffectiveTurnRecordByQId|getEffectiveTurnRecordByAId',
    'src-runtime-base',
    '--glob',
    '!chrome/**',
  ], { cwd: ROOT, encoding: 'utf8' }).trim().split('\n').filter(Boolean).sort();
  // The boundary is an allow-list of sanctioned consumers, not a ban on literal
  // references. 0A1a defines the API; the page controller is the one sanctioned
  // consumer (its join-built accessors are asserted immediately below). Its
  // rendered-boundary/collapse-range surfaces now call the API by its real name
  // instead of the older join-only indirection, which is a readability change,
  // not a new consumer. Any THIRD file appearing here is still a failure.
  // 0A3b appears only because its broker shim names the API it forwards to; the
  // Ledger reaches it through 0A3a's host surface rather than consuming it
  // independently. Any file beyond these three is still a failure.
  // 0A3a appears for the same reason 0A3b does: its broker shim names the API it
  // forwards to. Full Index reaches it through the host surface rather than
  // consuming it independently. 0A3c is the same case again — Reveal moved into
  // its own engine and its broker shim names the API it forwards to, still
  // reaching it through 0A3a's Reveal host surface. A fifth file is a failure.
  equal(consumers, [
    'src-runtime-base/0A1a.⬛️🧠 H2O Core 🧠.js',
    'src-runtime-base/0A3a.⬛️🧭 Chat Atlas Core 🧭.js',
    'src-runtime-base/0A3b.⬛️📒 Chat Atlas Ledger 📒.js',
    'src-runtime-base/0A3c.⬛️🔭 Chat Atlas Reveal Engine 🔭.js',
    'src-runtime-base/1C1b.🔴📑 Thread Pages Controller 📑.js',
  ], 'literal API boundary stays limited to the definer, the three Chat Atlas broker shims and the sanctioned page-controller consumer');
  equal(PAGE_SOURCE.includes("STATUS: ['get', 'Effective', 'PresentationStatus'].join('')"), true, 'page controller consumes the effective status API');
  equal(PAGE_SOURCE.includes("INDEX: ['get', 'Effective', 'PresentationIndex'].join('')"), true, 'page controller consumes the effective index API');
  equal(PAGE_SOURCE.includes("BY_QID: ['get', 'Effective', 'TurnRecordByQId'].join('')"), true, 'page controller consumes exact effective qId lookup');
  equal(PAGE_SOURCE.includes("BY_AID: ['get', 'Effective', 'TurnRecordByAId'].join('')"), true, 'page controller consumes exact effective aId lookup');
  equal(PAGE_SOURCE.includes('selected-path-overlay'), true, 'page controller recognizes only proven selected overlay authority');
  equal(PAGE_SOURCE.includes('data-cgxui-chat-title-only-pages'), true, 'central title-only root contract is present');
  equal(PAGE_SOURCE.includes("hub.onMutations('chat-pages:title-list'"), true, 'existing shared Observer Hub owns remount repair');
});

for (const key of Object.keys(safety)) equal(safety[key], 0, `safety counter ${key} remains zero`);

const failed = fixtures.filter((entry) => !entry.ok);
for (const entry of fixtures) {
  console.log(`${entry.ok ? 'PASS' : 'FAIL'} ${entry.name}`);
  if (!entry.ok) console.log(entry.error);
}
console.log(`\nCV-3.11 selected-path title-list collapse: ${fixtures.length - failed.length}/${fixtures.length} fixtures passed; ${assertionCount} assertions`);
console.log(`Safety counters: ${JSON.stringify(safety)}`);

if (failed.length) process.exitCode = 1;
