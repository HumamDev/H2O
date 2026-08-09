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
  ['show', `efeaf64aedbaef5f59bcae2daf443303ebce90f8:${PAGE_PATH}`],
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

function executeParentReadiness() {
  let nativeSlotCalls = 0;
  let exactBoundaryCalls = 0;
  const api = vm.runInNewContext(`(() => {
    const TITLE_LIST_PAGE_SIZE = 25;
    ${extractFunction(PARENT, 'frozenCollapsedBoundaryResult')}
    ${extractFunction(PARENT, 'getCollapsedNativeBoundaryReadiness')}
    return getCollapsedNativeBoundaryReadiness;
  })()`, {
    resolveNativeTurnSlotSequence() {
      nativeSlotCalls += 1;
      return Object.freeze({
        ready: false,
        reason: 'native-slot-mounted-structure-invalid',
      });
    },
    getCollapsedExactBoundaryReadiness(pageNum) {
      exactBoundaryCalls += 1;
      return Object.freeze({
        ready: false,
        reason: 'next-page-native-start-not-mounted',
        pageNum,
        generation: 1,
        fingerprint: 'djb2:effective-stage-2c1',
        source: 'selected-path-overlay',
        count: 39,
      });
    },
  });
  return {
    result: api(1),
    nativeSlotCalls,
    exactBoundaryCalls,
  };
}

function clone(value, overrides = {}) {
  return Object.freeze({ ...value, ...overrides });
}

function buildPageModel(count = 39, options = {}) {
  const pages = [];
  const pageCount = count > 0 ? Math.ceil(count / 25) : 0;
  for (let pageNo = 1; pageNo <= pageCount; pageNo += 1) {
    const startOrder = ((pageNo - 1) * 25) + 1;
    const endOrder = Math.min(count, pageNo * 25);
    const turnRecords = [];
    for (let order = startOrder; order <= endOrder; order += 1) {
      if (options.omitOrder === order) continue;
      const noAnswer = Number(options.noAnswerOrder || 0) === order;
      turnRecords.push(Object.freeze({
        id: noAnswer ? `q-${order}` : `a-${order}`,
        answerId: noAnswer ? '' : `a-${order}`,
        questionId: `q-${order}`,
        turnId: `turn-${order}`,
        aliasIds: noAnswer ? [] : Object.freeze([`a-${order}`]),
        turnNo: order,
        type: noAnswer ? 'no-answer' : 'answer',
      }));
    }
    pages.push(Object.freeze({ pageNo, startOrder, endOrder, turnRecords: Object.freeze(turnRecords) }));
  }
  return Object.freeze({
    source: 'canonical',
    count,
    pageSize: 25,
    pageCount,
    pages: Object.freeze(pages),
    coherent: options.coherent !== false,
    reason: options.reason || 'complete',
  });
}

let capabilityEngine = null;

function createCapabilityVm({ model, boundary, range } = {}) {
  if (!capabilityEngine) {
    const calls = {
      boundary: [],
      range: [],
      model: 0,
    };
    const control = { model: null, boundary: null, range: null };
    const safety = {
      storage: 0,
      cache: 0,
      preference: 0,
      canonical: 0,
      alias: 0,
      network: 0,
      navigation: 0,
      scrolling: 0,
      timers: 0,
      observers: 0,
      dom: 0,
    };
    const throwing = (key) => () => {
      safety[key] += 1;
      throw new Error(`forbidden:${key}`);
    };
    const api = vm.runInNewContext(`(() => {
      const TITLE_LIST_PAGE_SIZE = 25;
      const buildTitleListPresentationPageModel = () => {
        injectedCalls.model += 1;
        return injectedControl.model();
      };
      const getRenderedPageBoundaryCapability = (pageNum) => {
        injectedCalls.boundary.push(pageNum);
        return injectedControl.boundary(pageNum);
      };
      const getPageCollapseRangeDiagnostics = (pageNum) => {
        injectedCalls.range.push(pageNum);
        return injectedControl.range(pageNum);
      };
      const buildPageCollapseRangePlan = (pageNum) => ({
        ok: true,
        diagnostic: getPageCollapseRangeDiagnostics(pageNum),
      });
      ${extractFunction(SOURCE, 'frozenPageCollapseCapability')}
      ${extractFunction(SOURCE, 'pageCollapseCapabilityProductReason')}
      ${extractFunction(SOURCE, 'evaluatePageCollapseCapability')}
      ${extractFunction(SOURCE, 'getPageCollapseCapability')}
      ${extractFunction(SOURCE, 'frozenCollapsedBoundaryResult')}
      ${extractFunction(SOURCE, 'getCollapsedNativeBoundaryReadiness')}
      return Object.freeze({
        capability: getPageCollapseCapability,
        compatibility: getCollapsedNativeBoundaryReadiness,
      });
    })()`, {
      injectedCalls: calls,
      injectedControl: control,
      localStorage: { setItem: throwing('storage') },
      sessionStorage: { setItem: throwing('storage') },
      indexedDB: { open: throwing('storage') },
      fetch: throwing('network'),
      setTimeout: throwing('timers'),
      setInterval: throwing('timers'),
      requestAnimationFrame: throwing('timers'),
      scrollTo: throwing('scrolling'),
      MutationObserver: class {
        constructor() {
          safety.observers += 1;
          throw new Error('forbidden:observers');
        }
      },
    });
    capabilityEngine = { api, calls, control, safety };
  }
  capabilityEngine.control.model = model;
  capabilityEngine.control.boundary = boundary;
  capabilityEngine.control.range = range;
  capabilityEngine.calls.boundary.length = 0;
  capabilityEngine.calls.range.length = 0;
  capabilityEngine.calls.model = 0;
  return capabilityEngine;
}

let baseRangeHarness = null;

function getBaseRangeHarness() {
  if (baseRangeHarness) return baseRangeHarness;
  const factory = loadRangeHarnessFactory(PARENT);
  const rangeHarness = factory.createHarness({
    productionSource: PARENT,
    coldEnd: true,
    middleCount: 48,
    extraKind: 'inline-slot',
    count: 39,
  });
  const start = rangeHarness.api.boundary(1);
  const end = rangeHarness.api.boundary(2);
  const outside = rangeHarness.api.boundary(3);
  const pageOneRange = rangeHarness.api.range(1);
  const pageTwoRange = rangeHarness.api.range(2);
  baseRangeHarness = {
    ...rangeHarness,
    start,
    end,
    outside,
    pageOneRange,
    pageTwoRange,
  };
  return baseRangeHarness;
}

function createLiveCapabilityHarness(options = {}) {
  const rangeHarness = getBaseRangeHarness();
  const { start, end } = rangeHarness;
  const boundaryOverrides = options.boundaryOverrides || {};
  const rangeBase = rangeHarness.pageOneRange;
  const model = options.model || buildPageModel(options.count || 39, options.modelOptions || {});
  const boundary = (pageNum) => {
    const base = pageNum === 1
      ? start
      : pageNum === 2
        ? end
        : rangeHarness.outside;
    return clone(base, boundaryOverrides[pageNum] || {});
  };
  const range = (pageNum) => {
    const base = pageNum === 1 ? rangeHarness.pageOneRange : rangeHarness.pageTwoRange;
    return clone(base, options.rangeOverrides || {});
  };
  const capability = createCapabilityVm({
    model: () => model,
    boundary,
    range,
  });
  return {
    ...rangeHarness,
    start,
    end,
    rangeBase,
    model,
    capability: capability.api,
    calls: capability.calls,
    capabilitySafety: capability.safety,
  };
}

function assertDeepFrozen(value, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  ok(Object.isFrozen(value), 'object is frozen');
  for (const child of Object.values(value)) assertDeepFrozen(child, seen);
}

function containsDom(value, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return false;
  if (typeof value.tagName === 'string' && value.nodeType === 1) return true;
  seen.add(value);
  return Object.values(value).some((child) => containsDom(child, seen));
}

function extractAssignedArrow(source, target) {
  const anchor = `${target} = (`;
  const start = source.indexOf(anchor);
  if (start < 0 || source.indexOf(anchor, start + anchor.length) >= 0) {
    throw new Error(`assigned-arrow-anchor-invalid:${target}`);
  }
  const arrow = source.indexOf('=>', start);
  const bodyStart = source.indexOf('{', arrow);
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }
    if (char === '{') depth += 1;
    else if (char === '}' && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`assigned-arrow-boundary-invalid:${target}`);
}

function executeSealedClick(readiness) {
  const effects = {
    feedback: 0,
    nativeHidden: 0,
    titleLists: 0,
    pageUnits: 0,
    navigation: 0,
    scrolling: 0,
    persistence: 0,
  };
  const handler = vm.runInNewContext(`(() => {
    const S = {};
    ${extractAssignedArrow(SOURCE, 'S.onDividerDotClick')};
    return S.onDividerDotClick;
  })()`, {
    getDividerPageNum: () => 1,
    resolveChatId: () => 'chat-stage-2c1',
    getAuthoritativePageAnswerIds: () => [],
    getResolvedPageTitleIntentSummary: () => ({ allCollapsed: false }),
    getCollapsedNativeBoundaryReadiness: () => readiness,
    handleCollapseUnavailableActivation: () => {
      effects.feedback += 1;
      return { ok: false };
    },
    writePageTitleIntent: () => {
      effects.persistence += 1;
      throw new Error('sealed:persistence');
    },
    resetOpenedTitleListRows: () => {
      effects.nativeHidden += 1;
      throw new Error('sealed:native-hidden');
    },
    setTitleListMode: () => {
      effects.titleLists += 1;
      throw new Error('sealed:title-list');
    },
  });
  const divider = { className: 'cgxui-chat-page-divider' };
  const dot = {
    closest(selector) {
      return selector.includes('divider-dot') ? dot : divider;
    },
  };
  handler({
    detail: 1,
    target: dot,
    preventDefault() {},
    stopPropagation() {},
  });
  return effects;
}

await fixture('parent rendered range and native-slot readiness contradict', () => {
  const rangeHarness = getBaseRangeHarness();
  const range = rangeHarness.pageOneRange;
  const readiness = executeParentReadiness();
  equal(range.supported, true, 'real parent range supported');
  equal(range.rangeProven, true, 'real parent range proven');
  equal(range.hostWrapperCount, 50, 'real parent range has 50 exact host wrappers');
  equal(range.ambiguousWrapperCount, 0, 'real parent range has no ambiguity');
  equal(readiness.result.ready, false, 'parent readiness rejects');
  equal(
    readiness.result.structuralReason,
    'native-slot-mounted-structure-invalid',
    'native-slot structural reason controls parent readiness',
  );
});

await fixture('parent production readiness invokes native-slot resolver', () => {
  const readiness = executeParentReadiness();
  equal(readiness.nativeSlotCalls, 1, 'native-slot resolver called once');
  equal(readiness.exactBoundaryCalls, 1, 'legacy exact fallback called once');
  ok(
    extractFunction(PARENT, 'getCollapsedNativeBoundaryReadiness')
      .includes('resolveNativeTurnSlotSequence'),
    'parent source directly consults native slots',
  );
});

await fixture('corrected capability reports canonical Page 1 orders', () => {
  const h = createLiveCapabilityHarness();
  const result = h.capability.capability(1);
  equal(result.pageStartOrder, 1, 'Page 1 starts at order 1');
  equal(result.pageEndOrder, 25, 'Page 1 ends at order 25');
});

await fixture('corrected capability consumes exact rendered boundaries', () => {
  const h = createLiveCapabilityHarness();
  const result = h.capability.capability(1);
  equal(result.startBoundarySupported, true, 'start supported');
  equal(result.nextBoundarySupported, true, 'end supported');
  ok(h.calls.boundary.includes(1), 'Page 1 boundary read');
  ok(h.calls.boundary.includes(2), 'Page 2 boundary read');
});

await fixture('corrected capability consumes existing range diagnostic', () => {
  const h = createLiveCapabilityHarness();
  h.capability.capability(1);
  equal(h.calls.range, [1], 'one composed range read');
});

await fixture('corrected capability does not reclassify wrappers independently', () => {
  const source = extractFunction(SOURCE, 'evaluatePageCollapseCapability');
  ok(source.includes('buildPageCollapseRangePlan(num, { includeDom: true })'), 'single range-plan proof consumed');
  ok(!/flowRoot|querySelector|children|data-turn-id/.test(source), 'no independent DOM classification');
});

await fixture('live-equivalent range reports 50 host and 3 H2O nodes', () => {
  const h = createLiveCapabilityHarness();
  const result = h.capability.capability(1);
  equal(result.rangeProven, true, 'range proven');
  equal(result.hostWrapperCount, 50, '50 host wrappers');
  equal(result.h2oNodeCount, 3, '3 H2O nodes');
  equal(result.ambiguousWrapperCount, 0, 'zero ambiguity');
});

await fixture('complete Page 1 title projection is current', () => {
  const result = createLiveCapabilityHarness().capability.capability(1);
  equal(result.titleRowsCurrent, true, 'title rows current');
  equal(result.titleRowCount, 25, '25 title rows');
  equal(result.expectedTitleRowCount, 25, '25 expected rows');
});

await fixture('NO ANSWER rows remain valid title rows', () => {
  const h = createLiveCapabilityHarness({ modelOptions: { noAnswerOrder: 19 } });
  const result = h.capability.capability(1);
  equal(result.titleRowsCurrent, true, 'NO ANSWER row accepted');
  equal(result.titleRowCount, 25, 'NO ANSWER row retained');
});

await fixture('all exact prerequisites report ready', () => {
  const result = createLiveCapabilityHarness().capability.capability(1);
  equal(result.supported, true, 'capability supported');
  equal(result.reason, null, 'no capability failure');
  equal(result.productReason, 'ready', 'stable ready reason');
  equal(result.prerequisitesReady, true, 'all prerequisites ready');
});

await fixture('atomic transaction is implemented', () => {
  const result = createLiveCapabilityHarness().capability.capability(1);
  equal(result.atomicTransactionImplemented, true, 'transaction installed');
});

await fixture('activation follows complete prerequisites', () => {
  const result = createLiveCapabilityHarness().capability.capability(1);
  equal(result.activationReady, true, 'activation ready');
});

await fixture('ready activation has no internal block reason', () => {
  const result = createLiveCapabilityHarness().capability.capability(1);
  equal(result.activationBlockReason, null, 'no activation block');
});

await fixture('compatibility wrapper becomes ready', () => {
  const h = createLiveCapabilityHarness();
  const result = h.capability.compatibility(1);
  equal(result.ready, true, 'compatibility readiness active');
  equal(result.prerequisitesReady, true, 'prerequisite proof retained');
  equal(result.activationReady, true, 'activation ready');
  equal(result.reason, null, 'no readiness reason');
});

await fixture('compatibility wrapper reports rendered-boundary provenance', () => {
  const result = createLiveCapabilityHarness().capability.compatibility(1);
  equal(result.source, 'rendered-boundary-collapse-capability', 'new authority source');
  equal(result.capabilityVersion, 1, 'capability version');
  equal(result.legacyNativeSlotConsulted, false, 'legacy slots not consulted');
});

await fixture('corrected readiness invokes native-slot resolver zero times', () => {
  const source = extractFunction(SOURCE, 'getCollapsedNativeBoundaryReadiness');
  ok(source.includes('getPageCollapseCapability(num)'), 'new capability consulted');
  ok(!/resolveNativeTurnSlotSequence|nativeTurnSlot/.test(source), 'native resolver absent');
});

await fixture('corrected readiness performs zero native ordinal inference', () => {
  const source = [
    extractFunction(SOURCE, 'getPageCollapseCapability'),
    extractFunction(SOURCE, 'getCollapsedNativeBoundaryReadiness'),
  ].join('\n');
  ok(!/ordinal|nativeStartOrdinal|nativeEndOrdinal/i.test(source), 'no ordinal authority');
});

await fixture('corrected readiness performs zero pairCount times two inference', () => {
  const source = [
    extractFunction(SOURCE, 'getPageCollapseCapability'),
    extractFunction(SOURCE, 'getCollapsedNativeBoundaryReadiness'),
  ].join('\n');
  ok(!/pairCount|\*\s*2|2\s*\*/.test(source), 'no pair multiplication');
});

await fixture('corrected readiness performs zero conversation-turn arithmetic', () => {
  const source = [
    extractFunction(SOURCE, 'getPageCollapseCapability'),
    extractFunction(SOURCE, 'getCollapsedNativeBoundaryReadiness'),
  ].join('\n');
  ok(!/conversation-turn|testId|test-ID/.test(source), 'no test-ID authority');
});

await fixture('missing start boundary fails closed', () => {
  const h = createLiveCapabilityHarness({
    boundaryOverrides: {
      1: {
        supported: false,
        reason: 'rendered-boundary-head-unproven',
        boundaryIdentityCurrent: false,
        leaseCurrent: false,
      },
    },
  });
  const result = h.capability.capability(1);
  equal(result.prerequisitesReady, false, 'start required');
  equal(result.productReason, 'layout-incomplete', 'stable product reason');
});

await fixture('missing next boundary fails closed', () => {
  const h = createLiveCapabilityHarness({
    boundaryOverrides: {
      2: {
        supported: false,
        reason: 'rendered-boundary-head-unproven',
        boundaryIdentityCurrent: false,
        leaseCurrent: false,
      },
    },
  });
  const result = h.capability.capability(1);
  equal(result.prerequisitesReady, false, 'end required');
  equal(result.productReason, 'layout-incomplete', 'stable product reason');
});

await fixture('stale start lease fails closed', () => {
  const h = createLiveCapabilityHarness({
    boundaryOverrides: { 1: { leaseCurrent: false } },
  });
  equal(h.capability.capability(1).prerequisitesReady, false, 'stale start rejected');
});

await fixture('stale end lease fails closed', () => {
  const h = createLiveCapabilityHarness({
    boundaryOverrides: { 2: { leaseCurrent: false } },
  });
  equal(h.capability.capability(1).prerequisitesReady, false, 'stale end rejected');
});

await fixture('different flow-root range fails closed', () => {
  const h = createLiveCapabilityHarness({
    rangeOverrides: {
      supported: false,
      reason: 'range-flow-root-incoherent',
      rangeProven: false,
      startWrapperCurrent: false,
      endWrapperCurrent: false,
    },
  });
  const result = h.capability.capability(1);
  equal(result.prerequisitesReady, false, 'same flow required');
  equal(result.productReason, 'layout-incomplete', 'flow failure normalized');
});

await fixture('generation mismatch fails closed', () => {
  const h = createLiveCapabilityHarness({
    boundaryOverrides: { 2: { generation: 2 } },
  });
  equal(h.capability.capability(1).prerequisitesReady, false, 'generation mismatch');
});

await fixture('effective fingerprint mismatch fails closed', () => {
  const h = createLiveCapabilityHarness({
    boundaryOverrides: { 2: { effectiveFingerprint: 'djb2:other-effective' } },
  });
  equal(h.capability.capability(1).prerequisitesReady, false, 'effective mismatch');
});

await fixture('graph fingerprint mismatch fails closed', () => {
  const h = createLiveCapabilityHarness({
    boundaryOverrides: { 2: { graphFingerprint: 'djb2:other-graph' } },
  });
  equal(h.capability.capability(1).prerequisitesReady, false, 'graph mismatch');
});

await fixture('route and chat mismatch fail closed', () => {
  const route = createLiveCapabilityHarness({
    boundaryOverrides: { 2: { routeKey: '/c/other' } },
  });
  const routeResult = route.capability.capability(1);
  const chat = createLiveCapabilityHarness({
    boundaryOverrides: { 2: { chatId: 'other-chat' } },
  });
  equal(routeResult.prerequisitesReady, false, 'route mismatch');
  equal(chat.capability.capability(1).prerequisitesReady, false, 'chat mismatch');
});

await fixture('page-unit drift fails closed', () => {
  const h = createLiveCapabilityHarness({
    rangeOverrides: {
      supported: false,
      reason: 'page-unit-order-invalid',
      rangeProven: false,
      pageUnitOrderCurrent: false,
    },
  });
  const result = h.capability.capability(1);
  equal(result.prerequisitesReady, false, 'order required');
  equal(result.productReason, 'layout-incomplete', 'order failure normalized');
});

await fixture('streaming maps to page-updating', () => {
  const h = createLiveCapabilityHarness({
    rangeOverrides: {
      supported: false,
      reason: 'streaming-active',
      rangeProven: false,
      streaming: true,
    },
  });
  const result = h.capability.capability(1);
  equal(result.streaming, true, 'streaming reported');
  equal(result.productReason, 'page-updating', 'streaming normalized');
});

await fixture('branch transition maps to page-updating', () => {
  const h = createLiveCapabilityHarness({
    rangeOverrides: {
      supported: false,
      reason: 'boundary-scope-changed',
      rangeProven: false,
      branchTransition: true,
    },
  });
  const result = h.capability.capability(1);
  equal(result.branchTransition, true, 'transition reported');
  equal(result.productReason, 'page-updating', 'transition normalized');
});

await fixture('incomplete title rows map to page-loading', () => {
  const h = createLiveCapabilityHarness({ modelOptions: { omitOrder: 25 } });
  const result = h.capability.capability(1);
  equal(result.titleRowsCurrent, false, 'incomplete titles rejected');
  equal(result.titleRowCount, 24, 'partial row count diagnostic');
  equal(result.productReason, 'page-loading', 'title pending normalized');
});

await fixture('ambiguous range maps to unsupported-layout', () => {
  const h = createLiveCapabilityHarness({
    rangeOverrides: {
      supported: false,
      reason: 'range-wrapper-ambiguous',
      rangeProven: false,
      ambiguousWrapperCount: 1,
      firstAmbiguousIndex: 9,
    },
  });
  const result = h.capability.capability(1);
  equal(result.ambiguousWrapperCount, 1, 'ambiguity reported');
  equal(result.productReason, 'unsupported-layout', 'ambiguity normalized');
});

await fixture('final page maps to layout-incomplete', () => {
  const result = createLiveCapabilityHarness().capability.capability(2);
  equal(result.prerequisitesReady, false, 'final page remains unsupported');
  equal(result.productReason, 'layout-incomplete', 'final page normalized');
});

await fixture('product reason never exposes native-slot terminology', () => {
  const values = [
    createLiveCapabilityHarness().capability.capability(1).productReason,
    createLiveCapabilityHarness({
      rangeOverrides: {
        supported: false,
        reason: 'native-slot-mounted-structure-invalid',
        rangeProven: false,
      },
    }).capability.capability(1).productReason,
  ];
  ok(values.every((value) => !/native|slot|ordinal|calibrat/i.test(value)), 'native jargon absent');
});

await fixture('product reason never exposes graph or wrapper terminology', () => {
  const values = [
    createLiveCapabilityHarness({
      rangeOverrides: {
        supported: false,
        reason: 'graph-stale',
        rangeProven: false,
      },
    }).capability.capability(1).productReason,
    createLiveCapabilityHarness({
      rangeOverrides: {
        supported: false,
        reason: 'range-wrapper-ambiguous',
        rangeProven: false,
        ambiguousWrapperCount: 1,
      },
    }).capability.capability(1).productReason,
  ];
  ok(values.every((value) => !/graph|wrapper/i.test(value)), 'identity jargon absent');
});

await fixture('capability result is deeply frozen', () => {
  const result = createLiveCapabilityHarness().capability.capability(1);
  assertDeepFrozen(result);
  assert.throws(() => {
    result.prerequisitesReady = false;
  }, TypeError);
  assertions += 1;
});

await fixture('capability result contains no DOM reference', () => {
  const result = createLiveCapabilityHarness().capability.capability(1);
  equal(containsDom(result), false, 'public scalar result');
});

await fixture('repeated capability reads perform zero DOM mutations', () => {
  const h = createLiveCapabilityHarness();
  h.capability.capability(1);
  const before = h.safety.domMutations;
  h.capability.capability(1);
  equal(h.safety.domMutations, before, 'DOM unchanged');
  equal(h.capabilitySafety.dom, 0, 'capability VM DOM unchanged');
});

await fixture('repeated capability reads perform zero storage writes', () => {
  const h = createLiveCapabilityHarness();
  h.capability.capability(1);
  h.capability.capability(1);
  equal(h.safety.storageWrites, 0, 'range storage unchanged');
  equal(h.capabilitySafety.storage, 0, 'capability storage unchanged');
});

await fixture('collapse click delegates to the atomic transaction', () => {
  const handler = extractAssignedArrow(SOURCE, 'S.onDividerDotClick');
  // Pointer activation reaches the atomic transactions through the single
  // owner, which is also what keyboard activation converges on.
  ok(handler.includes('executeAtomicPageCollapseTransaction'), 'single transaction owner invoked');
  const owner = extractFunction(SOURCE, 'executeAtomicPageCollapseTransaction');
  ok(owner.includes('collapsePageWithRenderedBoundaries'), 'atomic collapse delegated');
  ok(owner.includes('expandPageWithRenderedBoundaries'), 'atomic expansion delegated');
});

await fixture('collapse click cannot invoke legacy title-list activation', () => {
  const handler = extractAssignedArrow(SOURCE, 'S.onDividerDotClick');
  const owner = extractFunction(SOURCE, 'executeAtomicPageCollapseTransaction');
  ok(!/setTitleListMode|syncSyntheticTitleList|writePageTitleIntent/.test(handler), 'legacy activation absent from click');
  ok(!/setTitleListMode|syncSyntheticTitleList|writePageTitleIntent/.test(owner), 'legacy activation absent from owner');
});

await fixture('collapse click contains no page-unit movement', () => {
  const handler = extractAssignedArrow(SOURCE, 'S.onDividerDotClick');
  const owner = extractFunction(SOURCE, 'executeAtomicPageCollapseTransaction');
  ok(!/renderDividers|insertBefore|appendChild|sentinel/.test(handler), 'no page-unit writer in click');
  ok(!/renderDividers|insertBefore|appendChild|sentinel/.test(owner), 'no page-unit writer in owner');
});

await fixture('collapse click performs no navigation or direct scrolling', () => {
  const handler = extractAssignedArrow(SOURCE, 'S.onDividerDotClick');
  ok(!/navigate|scroll|completeIndex/i.test(handler), 'no navigation or scroll');
});

await fixture('capability performs no cache preference canonical or alias writes', () => {
  const h = createLiveCapabilityHarness();
  h.capability.capability(1);
  equal(h.capabilitySafety.cache, 0, 'cache unchanged');
  equal(h.capabilitySafety.preference, 0, 'preferences unchanged');
  equal(h.capabilitySafety.canonical, 0, 'canonical unchanged');
  equal(h.capabilitySafety.alias, 0, 'aliases unchanged');
});

await fixture('capability performs no network calls', () => {
  const h = createLiveCapabilityHarness();
  h.capability.capability(1);
  equal(h.capabilitySafety.network, 0, 'network unused');
});

await fixture('capability adds no timer RAF or observer', () => {
  const h = createLiveCapabilityHarness();
  h.capability.capability(1);
  equal(h.capabilitySafety.timers, 0, 'timers unused');
  equal(h.capabilitySafety.observers, 0, 'observers unused');
});

await fixture('existing rendered-boundary API remains byte-for-byte unchanged', () => {
  equal(
    extractFunction(SOURCE, 'getRenderedPageBoundaryCapability'),
    extractFunction(PARENT, 'getRenderedPageBoundaryCapability'),
    'rendered boundary implementation unchanged',
  );
});

await fixture('existing range diagnostic remains a DOM-free delegation', () => {
  const getter = extractFunction(SOURCE, 'getPageCollapseRangeDiagnostics');
  ok(getter.includes('buildPageCollapseRangePlan(pageNum, { includeDom: false })'), 'public range stays DOM-free');
});

await fixture('production activation requires activationReady', () => {
  const wrapper = extractFunction(SOURCE, 'getCollapsedNativeBoundaryReadiness');
  equal(wrapper.includes('ready: activationReady'), true, 'compatibility uses activation field');
  const prerequisiteUses = Array.from(SOURCE.matchAll(/prerequisitesReady/g)).length;
  ok(prerequisiteUses > 0, 'prerequisite diagnostics exposed');
  ok(
    extractFunction(SOURCE, 'collapsePageWithRenderedBoundaries').includes('capability?.activationReady'),
    'transaction checks activation readiness',
  );
});

await fixture('live activation callers are transaction-owned', () => {
  const callers = Array.from(SOURCE.matchAll(/getCollapsedNativeBoundaryReadiness\(([^)]*)\)/g));
  ok(callers.length >= 2, 'compatibility diagnostics remain');
  const handler = extractAssignedArrow(SOURCE, 'S.onDividerDotClick');
  const keyboard = extractFunction(SOURCE, 'forwardCollapseControlKeyboardActivation');
  ok(handler.includes('executeAtomicPageCollapseTransaction'), 'click uses transaction owner');
  ok(keyboard.includes('executeAtomicPageCollapseTransaction'), 'keyboard uses the same owner');
  // The stale compatibility re-read was what mislabelled a transaction
  // failure as a missing next page boundary; the owner maps its own reason.
  ok(!handler.includes('getCollapsedNativeBoundaryReadiness'), 'click never re-reads legacy readiness');
  ok(!keyboard.includes('getCollapsedNativeBoundaryReadiness'), 'keyboard never re-reads legacy readiness');
  const legacyCalls = Array.from(
    SOURCE.matchAll(/getLegacyCollapsedNativeBoundaryReadinessDiagnostic\(/g),
  ).length;
  equal(legacyCalls, 1, 'legacy diagnostic has no call site');
});

await fixture('public API exports the composed capability once', () => {
  const occurrences = Array.from(SOURCE.matchAll(/\bgetPageCollapseCapability\b/g)).length;
  ok(occurrences >= 3, 'definition, compatibility call, and export present');
  ok(
    /getPageCollapseRangeDiagnostics,\s*\n\s*getPageCollapseCapability,/.test(SOURCE),
    'public export registered',
  );
});

await fixture('compatibility UI never exposes the atomic seal reason', () => {
  const control = extractFunction(SOURCE, 'applyCollapsedBoundaryControlState');
  ok(!/Technical reason/.test(control), 'technical reason removed from ARIA');
  ok(!/activationBlockReason/.test(control), 'activation internals absent from UI');
  ok(control.includes("'Collapse currently unavailable'"), 'generic unavailable title retained');
});

await fixture('safety counters remain zero together', () => {
  const h = createLiveCapabilityHarness();
  h.capability.capability(1);
  h.capability.compatibility(1);
  equal(h.capabilitySafety, {
    storage: 0,
    cache: 0,
    preference: 0,
    canonical: 0,
    alias: 0,
    network: 0,
    navigation: 0,
    scrolling: 0,
    timers: 0,
    observers: 0,
    dom: 0,
  }, 'all throwing capability surfaces remain zero');
});

const passed = fixtures.filter((result) => result.ok).length;
console.log(`Fixtures: ${passed}/${fixtures.length}`);
console.log(`Assertions: ${assertions}`);
const capabilityTotals = capabilityEngine?.safety || {};
const rangeTotals = baseRangeHarness?.safety || {};
console.log(
  'Safety counters: '
  + `storage=${Number(capabilityTotals.storage || 0) + Number(rangeTotals.storageWrites || 0)} `
  + `cache=${Number(capabilityTotals.cache || 0) + Number(rangeTotals.cacheWrites || 0)} `
  + `preference=${Number(capabilityTotals.preference || 0) + Number(rangeTotals.preferenceWrites || 0)} `
  + `canonical=${Number(capabilityTotals.canonical || 0) + Number(rangeTotals.canonicalWrites || 0)} `
  + `alias=${Number(capabilityTotals.alias || 0) + Number(rangeTotals.aliasWrites || 0)} `
  + `network=${Number(capabilityTotals.network || 0) + Number(rangeTotals.networkCalls || 0)} `
  + `navigation=${Number(capabilityTotals.navigation || 0) + Number(rangeTotals.navigationCalls || 0)} `
  + `scrolling=${Number(capabilityTotals.scrolling || 0) + Number(rangeTotals.scrollCalls || 0)} `
  + `timers=${Number(capabilityTotals.timers || 0) + Number(rangeTotals.timerCalls || 0)} `
  + `observers=${Number(capabilityTotals.observers || 0) + Number(rangeTotals.observerCalls || 0)} `
  + `DOM=${Number(capabilityTotals.dom || 0) + Number(rangeTotals.domMutations || 0)}`,
);
if (passed !== fixtures.length) process.exitCode = 1;
