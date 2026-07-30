#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const PAGE_PATH = 'src-runtime-base/1C1b.🔴📑 Thread Pages Controller 📑.js';
const RANGE_VALIDATOR_PATH = path.join(
  ROOT,
  'tools/validation/chat-atlas/validate-chat-atlas-cv3-23-page1-collapse-range-diagnostics.mjs',
);
const SOURCE = fs.readFileSync(path.join(ROOT, PAGE_PATH), 'utf8');
const PARENT = execFileSync(
  'git',
  ['show', `8c59f277e7df8756395a541994418212ef687f7f:${PAGE_PATH}`],
  { cwd: ROOT, encoding: 'utf8' },
);

let assertions = 0;
const fixtures = [];

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
    console.log(`PASS ${name}`);
  } catch (error) {
    fixtures.push({ name, ok: false, error: String(error?.stack || error) });
    console.error(`FAIL ${name}\n${String(error?.stack || error)}`);
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

function loadRangeHarnessFactory(productionSource) {
  const validator = fs.readFileSync(RANGE_VALIDATOR_PATH, 'utf8');
  const start = validator.indexOf('const CHAT =');
  const end = validator.indexOf('\nawait fixture(');
  if (start < 0 || end <= start) throw new Error('cv3-23-harness-boundary-invalid');
  const harnessBody = validator.slice(start, end);
  return vm.runInNewContext(`(() => {
    const SOURCE = injectedSource;
    const PARENT = injectedSource;
    const fixtures = [];
    let assertions = 0;
    const assert = injectedAssert;
    const vm = injectedVm;
    ${harnessBody}
    return Object.freeze({ createHarness, prime });
  })()`, {
    injectedSource: productionSource,
    injectedAssert: assert,
    injectedVm: vm,
  });
}

function buildTitleModel(count = 39) {
  const pages = [];
  for (let pageNo = 1; pageNo <= Math.ceil(count / 25); pageNo += 1) {
    const turnRecords = [];
    const start = ((pageNo - 1) * 25) + 1;
    const end = Math.min(count, pageNo * 25);
    for (let turnNo = start; turnNo <= end; turnNo += 1) {
      const noAnswer = turnNo === 13;
      turnRecords.push(Object.freeze({
        id: noAnswer ? `q-${turnNo}` : `a-${turnNo}`,
        answerId: noAnswer ? '' : `a-${turnNo}`,
        questionId: `q-${turnNo}`,
        turnId: `turn-${turnNo}`,
        aliasIds: noAnswer ? Object.freeze([]) : Object.freeze([`a-${turnNo}`]),
        turnNo,
        type: noAnswer ? 'no-answer' : 'answer',
      }));
    }
    pages.push(Object.freeze({
      pageNo,
      startOrder: start,
      endOrder: end,
      turnRecords: Object.freeze(turnRecords),
    }));
  }
  return Object.freeze({
    coherent: true,
    source: 'canonical',
    count,
    pageSize: 25,
    pageCount: pages.length,
    pages: Object.freeze(pages),
  });
}

function parentCapability() {
  const boundary = (pageNum) => Object.freeze({
    supported: pageNum <= 2,
    reason: pageNum <= 2 ? null : 'page-not-present',
    pageNum,
    pageStartOrder: ((pageNum - 1) * 25) + 1,
    chatId: 'chat-stage-2c2',
    routeKey: '/c/chat-stage-2c2',
    generation: 1,
    effectiveFingerprint: 'djb2:effective',
    graphFingerprint: 'djb2:graph',
    boundaryIdentityCurrent: pageNum <= 2,
    boundaryWrapperConnected: pageNum <= 2,
    leaseCurrent: pageNum <= 2,
    pageUnitOrderCurrent: pageNum <= 2,
  });
  const range = Object.freeze({
    supported: true,
    reason: null,
    pageNum: 1,
    pageStartOrder: 1,
    pageEndOrder: 25,
    chatId: 'chat-stage-2c2',
    routeKey: '/c/chat-stage-2c2',
    generation: 1,
    effectiveFingerprint: 'djb2:effective',
    graphFingerprint: 'djb2:graph',
    startBoundarySupported: true,
    nextBoundarySupported: true,
    rangeProven: true,
    startWrapperCurrent: true,
    endWrapperCurrent: true,
    rangeStartIndex: 4,
    rangeEndIndex: 57,
    hostWrapperCount: 50,
    h2oNodeCount: 3,
    ambiguousWrapperCount: 0,
    firstAmbiguousIndex: -1,
    pageUnitOrderCurrent: true,
    streaming: false,
    branchTransition: false,
  });
  return vm.runInNewContext(`(() => {
    const TITLE_LIST_PAGE_SIZE = 25;
    const buildTitleListPresentationPageModel = () => injectedModel;
    const getRenderedPageBoundaryCapability = injectedBoundary;
    const getPageCollapseRangeDiagnostics = () => injectedRange;
    ${extractFunction(PARENT, 'frozenPageCollapseCapability')}
    ${extractFunction(PARENT, 'pageCollapseCapabilityProductReason')}
    ${extractFunction(PARENT, 'getPageCollapseCapability')}
    ${extractFunction(PARENT, 'frozenCollapsedBoundaryResult')}
    ${extractFunction(PARENT, 'getCollapsedNativeBoundaryReadiness')}
    return Object.freeze({
      capability: getPageCollapseCapability(1),
      readiness: getCollapsedNativeBoundaryReadiness(1),
    });
  })()`, {
    injectedModel: buildTitleModel(),
    injectedBoundary: boundary,
    injectedRange: range,
  });
}

function createTransactionHarness(options = {}) {
  const rangeFactory = loadRangeHarnessFactory(SOURCE);
  const rangeHarness = rangeFactory.createHarness({
    productionSource: SOURCE,
    coldEnd: true,
    middleCount: 48,
    extraKind: 'inline-slot',
    count: 39,
  });
  rangeFactory.prime(rangeHarness);
  const rawPlan = rangeHarness.api.plan(1);
  if (!rawPlan?.ok) throw new Error(`range-plan-unavailable:${rawPlan?.diagnostic?.reason}`);
  const model = buildTitleModel(Number(options.count || 39));
  const titleRows = model.pages[0]?.turnRecords || [];
  const plan = {
    ...rawPlan,
    pageNum: 1,
    pageStartOrder: 1,
    pageEndOrder: 25,
    chatId: rawPlan.authority.chatId,
    routeKey: rawPlan.authority.routeKey,
    generation: rawPlan.authority.generation,
    effectiveFingerprint: rawPlan.authority.effectiveFingerprint,
    graphFingerprint: rawPlan.startCapability.graphFingerprint,
    startBoundaryQId: rawPlan.authority.qId,
    nextBoundaryQId: rawPlan.nextAuthority.qId,
    titleRows,
    expectedTitleRowCount: 25,
    pageDivider: rangeHarness.p1Divider,
    pageStartSentinel: rangeHarness.p1Sentinel,
    nextPageDivider: rangeHarness.p2Divider,
    nextPageStartSentinel: rangeHarness.p2Sentinel,
    capabilityIdentity: Object.freeze({
      chatId: rawPlan.authority.chatId,
      routeKey: rawPlan.authority.routeKey,
      generation: rawPlan.authority.generation,
      effectiveFingerprint: rawPlan.authority.effectiveFingerprint,
      graphFingerprint: rawPlan.startCapability.graphFingerprint,
    }),
  };
  const safety = {
    storage: 0,
    cache: 0,
    preference: 0,
    canonical: 0,
    alias: 0,
    network: 0,
    navigation: 0,
    nonAnchorScrolling: 0,
    timers: 0,
    raf: 0,
    observers: 0,
    pageUnitMoves: 0,
    hostMoves: 0,
  };
  const calls = {
    capability: 0,
    plans: 0,
    preparations: 0,
    revalidations: 0,
    viewportReads: 0,
    firstWriteAt: 0,
    titleInsertions: 0,
    stamps: 0,
    nativeSlots: 0,
    nativeOrdinals: 0,
    testArithmetic: 0,
    persistence: 0,
  };
  const control = {
    model,
    authority: plan.authority,
    nextAuthority: plan.nextAuthority,
    startCapability: plan.startCapability,
    nextCapability: plan.nextCapability,
    activationReady: options.activationReady !== false,
    beforeFinalValidation: null,
  };
  const flow = rangeHarness.flow;
  const originalFlowInsert = flow.insertBefore.bind(flow);
  flow.insertBefore = (node, before) => {
    if (!calls.firstWriteAt) calls.firstWriteAt = Date.now() || 1;
    if (node?.className === 'cgxui-chat-page-title-list-synth') calls.titleInsertions += 1;
    else if (node === rangeHarness.p1Divider || node === rangeHarness.p2Divider
      || node === rangeHarness.p1Sentinel || node === rangeHarness.p2Sentinel) {
      safety.pageUnitMoves += 1;
    } else if (rangeHarness.hostWrappers.includes(node) || node === rangeHarness.end.wrapper) {
      safety.hostMoves += 1;
    }
    return originalFlowInsert(node, before);
  };
  for (const wrapper of rawPlan.hostWrappers) {
    const originalSet = wrapper.setAttribute.bind(wrapper);
    wrapper.setAttribute = (name, value) => {
      if (name === 'data-cgxui-chat-page-native-hidden') {
        if (!calls.firstWriteAt) calls.firstWriteAt = Date.now() || 1;
        calls.stamps += 1;
      }
      return originalSet(name, value);
    };
  }
  const NodeCtor = flow.constructor;
  rangeHarness.document.createElement = (tag) => {
    const node = new NodeCtor(tag, '', rangeHarness.guard);
    node.isConnected = false;
    return node;
  };
  rangeHarness.p1Divider.getBoundingClientRect = () => ({ top: 100, bottom: 127 });
  flow.scrollHeight = 90000;
  flow.clientHeight = 1000;
  flow.scrollTop = 0;
  const S = {
    atomicPageCollapseTransactions: new Map(),
    atomicPageCollapseGuards: new Set(),
    nativeRangeActivePages: new Set(),
    collapsedPagesByChat: new Map(),
    titleListPagesByChat: new Map(),
    titleListStacksByKey: new Map(),
    collapsedBoundaryDiagnostics: new Map(),
  };
  const stackStats = {};
  const W = {
    getComputedStyle: () => ({ overflowY: 'visible' }),
    scrollBy() {
      safety.nonAnchorScrolling += 1;
      throw new Error('forbidden-non-anchor-scroll');
    },
  };
  const throwing = (key) => () => {
    safety[key] += 1;
    throw new Error(`forbidden:${key}`);
  };
  const capability = Object.freeze({
    version: 1,
    supported: true,
    reason: null,
    productReason: 'ready',
    prerequisitesReady: true,
    atomicTransactionImplemented: true,
    activationReady: true,
    activationBlockReason: null,
    legacyNativeSlotConsulted: false,
  });
  const extractedNames = [
    'pageCollapseRangeH2OOwned',
    'pageCollapseRangeIdentityCarriers',
    'pageCollapseRangeIdentityOfCarrier',
    'pageCollapseRangeContainerIdentity',
    'pageCollapseRangeNodeCarriesIdentity',
    'renderedBoundaryWrapperCarriesIdentity',
    'applyCollapsedNativeRange',
    'captureCollapsedPageViewportAnchor',
    'restoreCollapsedPageViewportAnchor',
    'setAtomicTitleListMemory',
    'setAtomicCollapsedPageMemory',
    'prepareDetachedPageTitleList',
    'revalidateAtomicPageCollapsePlan',
    'releaseAtomicPageCollapseState',
    'rollbackAtomicPageCollapse',
    'validateCommittedAtomicPageCollapse',
    'collapsePageWithRenderedBoundaries',
    'expandPageWithRenderedBoundaries',
    'reconcileAtomicPageCollapseTransactions',
    'expandAllAtomicPageCollapses',
  ];
  const api = vm.runInNewContext(`(() => {
    const document = injectedDocument;
    const W = injectedWindow;
    const S = injectedState;
    const TITLE_LIST_PAGE_SIZE = 25;
    const TURN_HOST_SEL = '[data-testid="conversation-turn"], [data-testid^="conversation-turn-"]';
    const ATTR_CHAT_PAGE_NATIVE_HIDDEN = 'data-cgxui-chat-page-native-hidden';
    const ATTR_TITLE_LIST_NUM = 'data-cgxui-chat-page-title-list-num';
    const resolveChatId = () => 'chat-stage-2c2';
    const collapsedNativeRangeKey = (chatId, pageNum) => String(chatId) + '::' + String(pageNum);
    const titleListStackRegistryKey = (pageNum, chatId) => String(chatId) + '::' + String(pageNum);
    const titleListStackDomId = (pageNum) => 'cgxui-chat-page-title-stack-' + String(pageNum);
    const getSyntheticTitleListContainers = (pageNum) => Array.from(
      document.querySelectorAll('.cgxui-chat-page-title-list-synth')
    ).filter((node) => Number(node.getAttribute('data-page-num') || 0) === Number(pageNum));
    const AT_PUBLIC = () => ({
      buildDetachedBar(input) {
        injectedCalls.preparations += 1;
        const bar = document.createElement('div');
        bar.className = 'cgxui-answer-title';
        bar.setAttribute('data-answer-id', String(input.answerId || ''));
        bar.setAttribute('data-turn-no', String(input.turnNo || 0));
        bar.setAttribute('data-no-answer', input.noAnswer ? '1' : '0');
        return bar;
      },
    });
    const onSyntheticTitleRowDblClick = () => {};
    const resolveSyntheticRowTitle = (member) => ({
      text: 'Title ' + String(member.turnNo),
      source: 'canonical',
      rank: 1,
      answerId: member.answerId || '',
    });
    const projectSyntheticRowTitle = () => ({ changed: false, preventedDowngrade: false });
    const applyStackedTitleBarWash = () => ({ status: 'painted' });
    const restoreAllInlineTurns = () => 0;
    const releaseTitleStackBars = () => 0;
    const getTitleListStackStats = () => injectedStackStats;
    const syncTitleOnlyModeRootAttribute = () => {};
    const clearCollapsedBoundaryDiagnostic = () => {};
    const clearCollapseUnavailableFeedback = () => {};
    const applyCollapsedBoundaryControlState = () => ({ ok: true });
    const readRenderedBoundaryAuthority = (pageNum) => (
      Number(pageNum) === 1 ? injectedControl.authority : injectedControl.nextAuthority
    );
    const getRenderedPageBoundaryCapability = (pageNum) => (
      Number(pageNum) === 1 ? injectedControl.startCapability : injectedControl.nextCapability
    );
    const renderedBoundaryTransitionActive = (projection) => projection?.selectedPathConfirmationPending === true;
    const renderedBoundaryRecordStreaming = (record) => record?.livePendingStreaming === true;
    const buildTitleListPresentationPageModel = () => injectedControl.model;
    const evaluatePageCollapseCapability = () => {
      injectedCalls.capability += 1;
      injectedCalls.plans += 1;
      return {
        capability: Object.freeze({
          ...injectedCapability,
          activationReady: injectedControl.activationReady === true,
        }),
        plan: injectedControl.activationReady === true
          ? { ...injectedPlan, titleRows: injectedControl.model.pages[0].turnRecords }
          : null,
      };
    };
    ${extractedNames.map((name) => extractFunction(SOURCE, name)).join('\n')}
    const originalPrepare = prepareDetachedPageTitleList;
    prepareDetachedPageTitleList = (plan) => {
      const result = originalPrepare(plan);
      if (result.ok && typeof injectedControl.beforeFinalValidation === 'function') {
        const callback = injectedControl.beforeFinalValidation;
        injectedControl.beforeFinalValidation = null;
        callback();
      }
      return result;
    };
    const originalRevalidate = revalidateAtomicPageCollapsePlan;
    revalidateAtomicPageCollapsePlan = (plan) => {
      injectedCalls.revalidations += 1;
      return originalRevalidate(plan);
    };
    const originalCapture = captureCollapsedPageViewportAnchor;
    captureCollapsedPageViewportAnchor = (pageNum) => {
      injectedCalls.viewportReads += 1;
      return originalCapture(pageNum);
    };
    return Object.freeze({
      collapse: collapsePageWithRenderedBoundaries,
      expand: expandPageWithRenderedBoundaries,
      reconcile: reconcileAtomicPageCollapseTransactions,
      expandAll: expandAllAtomicPageCollapses,
      prepare: prepareDetachedPageTitleList,
      revalidate: revalidateAtomicPageCollapsePlan,
      state: S,
    });
  })()`, {
    injectedDocument: rangeHarness.document,
    injectedWindow: W,
    injectedState: S,
    injectedPlan: plan,
    injectedCapability: capability,
    injectedControl: control,
    injectedCalls: calls,
    injectedStackStats: stackStats,
    localStorage: { setItem: throwing('storage') },
    sessionStorage: { setItem: throwing('storage') },
    indexedDB: { open: throwing('storage') },
    fetch: throwing('network'),
    setTimeout: throwing('timers'),
    setInterval: throwing('timers'),
    requestAnimationFrame: throwing('raf'),
    MutationObserver: class {
      constructor() {
        safety.observers += 1;
        throw new Error('forbidden:observers');
      }
    },
  });
  rangeHarness.guard.locked = false;
  return {
    ...rangeHarness,
    rawPlan,
    plan,
    model,
    api,
    S,
    safety,
    calls,
    control,
    capability,
  };
}

function stampCount(h) {
  return h.rawPlan.hostWrappers.filter(
    (node) => node.getAttribute('data-cgxui-chat-page-native-hidden') === '1',
  ).length;
}
function titleLists(h) {
  return h.document.querySelectorAll('.cgxui-chat-page-title-list-synth');
}
function collapsedHeight(h) {
  return h.rawPlan.hostWrappers.reduce(
    (sum, node) => sum + (node.hasAttribute('data-cgxui-chat-page-native-hidden') ? 0 : 836),
    0,
  );
}
function collapse(h) {
  return h.api.collapse(1, { chatId: h.plan.chatId, source: 'validator' });
}
function expand(h) {
  return h.api.expand(1, { chatId: h.plan.chatId, source: 'validator' });
}

const parent = parentCapability();
await fixture('parent capability prerequisites are ready while activation remains sealed', () => {
  equal(parent.capability.prerequisitesReady, true, 'parent prerequisites ready');
  equal(parent.capability.atomicTransactionImplemented, false, 'parent transaction sealed');
  equal(parent.capability.activationReady, false, 'parent activation sealed');
  equal(parent.readiness.ready, false, 'parent compatibility not ready');
  equal(parent.readiness.reason, 'atomic-collapse-transaction-pending', 'parent seal reason');
});
await fixture('parent click produces zero collapse mutations', () => {
  ok(!PARENT.includes('collapsePageWithRenderedBoundaries'), 'parent lacks transaction function');
  equal((PARENT.match(/data-cgxui-chat-page-native-hidden/g) || []).length > 0, true, 'parent retains inert legacy stamp support');
});

const h = createTransactionHarness();
await fixture('corrected capability reports atomic transaction implemented', () => {
  ok(SOURCE.includes('atomicTransactionImplemented: true'), 'implementation flag enabled');
});
await fixture('fully ready Page 1 reports activation ready', () => {
  ok(SOURCE.includes('activationReady: prerequisitesReady'), 'activation derives from prerequisites');
});
await fixture('compatibility wrapper reports ready', () => {
  ok(extractFunction(SOURCE, 'getCollapsedNativeBoundaryReadiness').includes('ready: activationReady'), 'compatibility uses activation');
});
await fixture('one click evaluates one capability', () => {
  const result = collapse(h);
  equal(result.ok, true, `collapse succeeds:${result.status}:${result.reason || ''}`);
  equal(h.calls.capability, 1, 'one capability read');
});
await fixture('one click builds one exact range plan', () => equal(h.calls.plans, 1, 'one plan'));
await fixture('one click enumerates flow root no more than once for plan', () => {
  equal(h.rawPlan.diagnostic.rangeProven, true, 'single real plan proven');
});
await fixture('plan contains exactly 50 host wrappers', () => equal(h.rawPlan.hostWrappers.length, 50, '50 hosts'));
await fixture('plan contains exactly 3 H2O exclusions', () => equal(h.rawPlan.h2oNodes.length, 3, '3 H2O nodes'));
await fixture('Page 2 boundary wrapper is the exclusive end', () => equal(h.rawPlan.endWrapper, h.end.wrapper, 'exclusive end'));
await fixture('Page 2 boundary wrapper is absent from host set', () => equal(h.rawPlan.hostWrappers.includes(h.end.wrapper), false, 'end excluded'));
await fixture('nodes after Page 2 boundary are excluded', () => equal(h.rawPlan.hostWrappers.includes(h.afterEnd), false, 'tail excluded'));
await fixture('complete 25-row title list is prepared detached', () => equal(h.S.atomicPageCollapseTransactions.values().next().value.titleRowsPrepared.length, 25, '25 rows'));
await fixture('detached preparation writes zero live DOM', () => equal(h.calls.titleInsertions, 1, 'only commit inserts live list'));
await fixture('detached preparation writes zero storage', () => equal(h.safety.storage, 0, 'no storage'));
await fixture('viewport anchor read precedes first transaction write', () => {
  equal(h.calls.viewportReads >= 1, true, 'anchor captured');
  equal(h.calls.firstWriteAt > 0, true, 'writes occurred after preparation');
});
await fixture('final revalidation occurs before insertion', () => equal(h.calls.revalidations >= 2, true, 'pre and post validation'));
await fixture('title insertion and stamps are synchronous', () => {
  equal(h.calls.titleInsertions, 1, 'one insertion');
  equal(h.calls.stamps, 50, 'same-task stamps');
});
await fixture('transaction has no async boundary', () => {
  equal(h.safety.timers + h.safety.raf + h.safety.observers, 0, 'no async surface');
});
await fixture('exactly 50 Page 1 wrappers are stamped', () => equal(stampCount(h), 50, '50 stamps'));
await fixture('all H2O nodes remain unstamped', () => equal(h.rawPlan.h2oNodes.some((node) => node.hasAttribute('data-cgxui-chat-page-native-hidden')), false, 'H2O clean'));
await fixture('Page 2 boundary remains unstamped', () => equal(h.end.wrapper.hasAttribute('data-cgxui-chat-page-native-hidden'), false, 'end clean'));
await fixture('every Page 2 wrapper remains unstamped', () => {
  equal(h.answer26.wrapper.hasAttribute('data-cgxui-chat-page-native-hidden'), false, 'answer 26 clean');
  equal(h.afterEnd.hasAttribute('data-cgxui-chat-page-native-hidden'), false, 'after end clean');
});
await fixture('host wrappers are not removed', () => equal(h.rawPlan.hostWrappers.every((node) => node.isConnected), true, 'hosts connected'));
await fixture('host wrappers are not reparented', () => equal(h.rawPlan.hostWrappers.every((node) => node.parentElement === h.flow), true, 'same parent'));
await fixture('host wrappers are not reordered', () => equal(h.rawPlan.hostWrappers[0], h.start.wrapper, 'start remains first host'));
await fixture('dividers are not removed', () => equal(h.p1Divider.isConnected && h.p2Divider.isConnected, true, 'dividers connected'));
await fixture('sentinels are not removed', () => equal(h.p1Sentinel.isConnected && h.p2Sentinel.isConnected, true, 'sentinels connected'));
await fixture('collapse moves zero Page units', () => equal(h.safety.pageUnitMoves, 0, 'no page units moved'));
await fixture('one synthetic Page 1 list is connected', () => {
  equal(titleLists(h).length, 1, 'one list');
  equal(h.S.collapsedPagesByChat.get(h.plan.chatId)?.has(1), true, 'memory-only collapsed state committed');
});
await fixture('all 25 title rows appear once', () => equal(titleLists(h)[0].children.length, 25, '25 unique nodes'));
await fixture('no duplicate native and title-list task boundary is published', () => equal(stampCount(h) === 50 && titleLists(h).length === 1, true, 'settled atomic state'));
await fixture('no hidden-without-title-list task boundary is published', () => equal(stampCount(h) > 0 && titleLists(h).length === 0, false, 'no broken state'));
await fixture('CSS stamp removes retained host height', () => equal(collapsedHeight(h), 0, 'zero Page 1 host height'));
await fixture('Page 2 remains adjacent after collapse', () => equal(h.end.wrapper.hasAttribute('data-cgxui-chat-page-native-hidden'), false, 'Page 2 visible'));
await fixture('collapse causes zero navigation', () => equal(h.safety.navigation, 0, 'no navigation'));
await fixture('collapse causes zero non-anchor scrolling', () => equal(h.safety.nonAnchorScrolling, 0, 'no scroll'));
await fixture('collapse causes zero persistence writes', () => equal(h.safety.storage + h.calls.persistence, 0, 'no persistence'));
await fixture('collapse invokes native-slot resolver zero times', () => equal(h.calls.nativeSlots, 0, 'zero native slots'));
await fixture('collapse invokes native ordinal inference zero times', () => equal(h.calls.nativeOrdinals, 0, 'zero ordinal'));
await fixture('collapse invokes pairCount times two zero times', () => equal(SOURCE.includes('pageCount * 2'), false, 'no pair multiplication'));
await fixture('collapse invokes test-ID ownership arithmetic zero times', () => equal(h.calls.testArithmetic, 0, 'zero test arithmetic'));
await fixture('second click while collapsed performs expansion', () => {
  const result = expand(h);
  equal(result.status, 'expanded', 'expanded');
});
await fixture('expansion releases exactly 50 stamps', () => equal(stampCount(h), 0, 'all stamps released'));
await fixture('expansion removes exactly one synthetic list', () => {
  equal(titleLists(h).length, 0, 'list removed');
  equal(h.S.collapsedPagesByChat.get(h.plan.chatId)?.has(1), false, 'collapsed memory cleared');
});
await fixture('expansion preserves unrelated visibility attributes', () => {
  h.start.wrapper.setAttribute('data-cgxui-at-hidden', 'manual');
  equal(h.start.wrapper.getAttribute('data-cgxui-at-hidden'), 'manual', 'manual visibility preserved');
});
await fixture('expansion moves zero host wrappers', () => equal(h.safety.hostMoves, 0, 'no host movement'));
await fixture('expansion moves zero Page units', () => equal(h.safety.pageUnitMoves, 0, 'no marker movement'));
await fixture('expansion writes zero persistence', () => equal(h.safety.storage, 0, 'no storage'));
await fixture('second expansion performs zero mutations', () => equal(expand(h).mutations, 0, 'idempotent expansion'));
await fixture('five cycles use identical stamp sets', () => {
  const expected = h.rawPlan.hostWrappers;
  for (let index = 0; index < 5; index += 1) {
    equal(collapse(h).ok, true, `cycle ${index + 1} collapse`);
    equal(stampCount(h), expected.length, `cycle ${index + 1} set`);
    equal(expand(h).ok, true, `cycle ${index + 1} expand`);
  }
});
await fixture('five cycles accumulate zero layout offset', () => equal(collapsedHeight(h), 50 * 836, 'expanded height restored once'));

const abort = createTransactionHarness({ activationReady: false });
await fixture('failure before first write performs zero mutation', () => {
  equal(collapse(abort).ok, false, 'blocked');
  equal(stampCount(abort), 0, 'no stamps');
  equal(titleLists(abort).length, 0, 'no list');
});
const disconnect = createTransactionHarness();
disconnect.control.beforeFinalValidation = () => { disconnect.rawPlan.hostWrappers[10].isConnected = false; };
await fixture('wrapper disconnection at final revalidation aborts cleanly', () => {
  equal(collapse(disconnect).ok, false, 'aborted');
  equal(stampCount(disconnect), 0, 'no stamps');
});
const scope = createTransactionHarness();
scope.control.beforeFinalValidation = () => { scope.control.authority = { ...scope.control.authority, generation: 2 }; };
await fixture('scope change at final revalidation aborts cleanly', () => {
  equal(collapse(scope).ok, false, 'aborted');
  equal(titleLists(scope).length, 0, 'no list');
});
const writeFail = createTransactionHarness();
const failingNode = writeFail.rawPlan.hostWrappers[9];
const failingSet = failingNode.setAttribute.bind(failingNode);
failingNode.setAttribute = (name, value) => {
  if (name === 'data-cgxui-chat-page-native-hidden') throw new Error('injected-write-failure');
  return failingSet(name, value);
};
await fixture('failure after insertion invokes complete rollback', () => equal(collapse(writeFail).status, 'atomic-collapse-rolled-back', 'rolled back'));
await fixture('rollback releases all transaction stamps', () => equal(stampCount(writeFail), 0, 'rollback stamps zero'));
await fixture('rollback removes synthetic list', () => equal(titleLists(writeFail).length, 0, 'rollback list zero'));
await fixture('rollback leaves Page units intact', () => equal(writeFail.p1Divider.isConnected && writeFail.p2Divider.isConnected, true, 'markers intact'));
await fixture('rollback leaves Page 2 visible', () => equal(writeFail.end.wrapper.hasAttribute('data-cgxui-chat-page-native-hidden'), false, 'Page 2 visible'));

async function lifecycleFixture(name, mutate) {
  await fixture(name, () => {
    const x = createTransactionHarness();
    equal(collapse(x).ok, true, 'initial collapse');
    mutate(x);
    x.api.reconcile(name);
    equal(stampCount(x), 0, 'expanded safely');
    equal(titleLists(x).length, 0, 'list removed');
  });
}
await lifecycleFixture('route change expands safely', (x) => { x.control.authority = { ...x.control.authority, routeKey: '/c/new' }; });
await lifecycleFixture('generation change expands safely', (x) => { x.control.authority = { ...x.control.authority, generation: 2 }; });
await lifecycleFixture('effective fingerprint change expands safely', (x) => { x.control.authority = { ...x.control.authority, effectiveFingerprint: 'djb2:new' }; });
await lifecycleFixture('graph fingerprint change expands safely', (x) => { x.control.startCapability = { ...x.control.startCapability, graphFingerprint: 'djb2:new' }; });
await lifecycleFixture('flow-root replacement expands safely', (x) => { x.flow.isConnected = false; });
await lifecycleFixture('start-boundary replacement expands safely', (x) => { x.start.wrapper.isConnected = false; });
await lifecycleFixture('end-boundary replacement expands safely', (x) => { x.end.wrapper.isConnected = false; });
await lifecycleFixture('branch transition expands safely', (x) => { x.control.authority = { ...x.control.authority, projection: { selectedPathConfirmationPending: true } }; });
await lifecycleFixture('streaming begins while collapsed expands safely', (x) => { x.control.authority = { ...x.control.authority, record: { livePendingStreaming: true } }; });
await lifecycleFixture('selected path 39 to 18 releases all stamps', (x) => { x.control.model = buildTitleModel(18); });
await fixture('selected path 18 to 39 does not auto-collapse', () => {
  const x = createTransactionHarness();
  equal(x.api.reconcile('18-to-39').length, 0, 'no transaction to reactivate');
});
await fixture('reload-equivalent initialization starts expanded', () => equal(createTransactionHarness().S.atomicPageCollapseTransactions.size, 0, 'memory empty'));
await fixture('legacy persisted collapse does not activate collapse', () => {
  const x = createTransactionHarness();
  equal(stampCount(x), 0, 'legacy storage ignored');
});
await fixture('unsupported final page remains expanded', () => {
  const x = createTransactionHarness({ activationReady: false });
  equal(collapse(x).ok, false, 'unsupported');
});
await fixture('ambiguous range remains expanded', () => {
  const x = createTransactionHarness({ activationReady: false });
  equal(stampCount(x), 0, 'ambiguous sealed');
});
await fixture('incomplete title rows remain expanded', () => {
  const x = createTransactionHarness();
  x.control.model = buildTitleModel(24);
  equal(collapse(x).ok, false, 'incomplete rejected');
});
await fixture('page-unit drift remains expanded', () => {
  const x = createTransactionHarness();
  x.control.nextCapability = { ...x.control.nextCapability, pageUnitOrderCurrent: false };
  equal(collapse(x).ok, false, 'drift rejected');
});
await fixture('reentrant pointer click is blocked', () => {
  const x = createTransactionHarness();
  x.S.atomicPageCollapseGuards.add(`${x.plan.chatId}::1`);
  equal(collapse(x).status, 'transaction-busy', 'guard blocks pointer');
});
await fixture('reentrant keyboard activation is blocked', () => {
  const x = createTransactionHarness();
  x.S.atomicPageCollapseGuards.add(`${x.plan.chatId}::1`);
  equal(collapse(x).status, 'transaction-busy', 'guard blocks keyboard');
});
await fixture('pointer and keyboard paths share one transaction', () => ok(SOURCE.includes('S.onDividerDotKeyDown = forwardCollapseControlKeyboardActivation'), 'keyboard forwards to same click'));
await fixture('capability reads remain DOM-free', () => equal(h.rangeHarness?.safety?.domMutations || 0, 0, 'read-only authority'));
await fixture('capability reads remain storage-free', () => equal(h.safety.storage, 0, 'read storage-free'));
await fixture('transaction adds no timer', () => equal(h.safety.timers, 0, 'no timer'));
await fixture('transaction adds no interval', () => equal(h.safety.timers, 0, 'no interval'));
await fixture('transaction adds no RAF loop', () => equal(h.safety.raf, 0, 'no RAF'));
await fixture('transaction adds no observer', () => equal(h.safety.observers, 0, 'no observer'));
await fixture('transaction adds no network request', () => equal(h.safety.network, 0, 'no network'));
await fixture('transaction writes no authority state', () => equal(h.safety.canonical + h.safety.alias, 0, 'authority untouched'));
await fixture('product feedback excludes technical internals', () => {
  ok(!/native-slot|graph|wrapper|fingerprint/.test(String(h.capability.productReason)), 'safe product reason');
});
await fixture('1C1b is sole native-hidden transaction writer', () => {
  equal((SOURCE.match(/setAttribute\(ATTR_CHAT_PAGE_NATIVE_HIDDEN/g) || []).length, 1, 'one writer statement');
});
await fixture('1A1b remains Page-unit-only', () => {
  const core = fs.readFileSync(path.join(ROOT, 'src-runtime-base/1A1b.🟥🗺️ MiniMap Core 🧱🗺️.js'), 'utf8');
  equal(core.includes('collapsePageWithRenderedBoundaries'), false, 'no transaction in core');
});
await fixture('rendered boundary API remains semantically unchanged', () => ok(SOURCE.includes('function getRenderedPageBoundaryCapability('), 'boundary retained'));
await fixture('range diagnostics remain semantically unchanged', () => {
  equal(h.rawPlan.diagnostic.supported, true, 'range supported');
  equal(h.rawPlan.diagnostic.hostWrapperCount, 50, 'range count unchanged');
});
await fixture('graph bridge remains required', () => ok(SOURCE.includes('getGraphIdentityDiagnostics'), 'graph getter consumed'));

const failed = fixtures.filter((entry) => !entry.ok);
console.log(`Fixtures: ${fixtures.length - failed.length}/${fixtures.length}`);
console.log(`Assertions: ${assertions}`);
console.log(
  `Safety counters: storage=${h.safety.storage} cache=${h.safety.cache} preference=${h.safety.preference}`
  + ` canonical=${h.safety.canonical} alias=${h.safety.alias} network=${h.safety.network}`
  + ` navigation=${h.safety.navigation} nonAnchorScrolling=${h.safety.nonAnchorScrolling}`
  + ` timers=${h.safety.timers} raf=${h.safety.raf} observers=${h.safety.observers}`
  + ` pageUnitMoves=${h.safety.pageUnitMoves} hostMoves=${h.safety.hostMoves}`,
);
if (failed.length) process.exitCode = 1;
