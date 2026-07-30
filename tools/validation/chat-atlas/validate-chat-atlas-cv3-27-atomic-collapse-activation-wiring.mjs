#!/usr/bin/env node
// CV-3.27 — atomic collapse activation wiring.
//
// Proves the Stage 2C-2a correction against the immutable parent
// 2fa12b87a31d58f244614924db1717c925b1ace3. The parent reached the atomic
// transaction, wrote 50 stamps and one title list, and then rolled the whole
// commit back because its own title-list insertion was counted as an
// intervening host node by renderedBoundaryOrderingNodeAllowed — flipping
// pageUnitOrderCurrent to false inside validateCommittedAtomicPageCollapse.
// The user saw the next-page-boundary message while the capability reported
// activationReady:true.
//
// Every fixture runs real production function bodies. The only mocked surfaces
// are those outside the collapse mechanism (canonical authority model, title
// bar factory, washer), and the harness intentionally uses real DOM connection
// semantics — a freshly created, unattached node is NOT connected — because
// the atomic transaction's detached preparation depends on them.

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
const PARENT_SHA = '2fa12b87a31d58f244614924db1717c925b1ace3';
const SOURCE = fs.readFileSync(path.join(ROOT, PAGE_PATH), 'utf8');
const PARENT = execFileSync('git', ['show', `${PARENT_SHA}:${PAGE_PATH}`], {
  cwd: ROOT,
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
});

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
    if (lineComment) { if (char === '\n') lineComment = false; continue; }
    if (blockComment) { if (char === '*' && next === '/') { blockComment = false; index += 1; } continue; }
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '/' && next === '/') { lineComment = true; index += 1; continue; }
    if (char === '/' && next === '*') { blockComment = true; index += 1; continue; }
    if (char === '"' || char === "'" || char === '`') { quote = char; continue; }
    if (char === '{') depth += 1;
    else if (char === '}' && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`function-boundary-invalid:${name}`);
}

// The production divider-dot handler, verbatim.
function extractAssignedArrow(source, target) {
  const anchor = `    ${target} = (ev) => {`;
  const start = source.indexOf(anchor);
  if (start < 0) throw new Error(`arrow-anchor-invalid:${target}`);
  const bodyStart = source.indexOf('{', source.indexOf('=>', start));
  let depth = 0;
  let quote = '';
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (lineComment) { if (char === '\n') lineComment = false; continue; }
    if (blockComment) { if (char === '*' && next === '/') { blockComment = false; index += 1; } continue; }
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '/' && next === '/') { lineComment = true; index += 1; continue; }
    if (char === '/' && next === '*') { blockComment = true; index += 1; continue; }
    if (char === '"' || char === "'" || char === '`') { quote = char; continue; }
    if (char === '{') depth += 1;
    else if (char === '}' && --depth === 0) {
      return source.slice(source.indexOf('(ev) =>', start), index + 1);
    }
  }
  throw new Error(`arrow-boundary-invalid:${target}`);
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
  })()`, { injectedSource: productionSource, injectedAssert: assert, injectedVm: vm });
}

const CHAT = 'chat-stage-2c0';

function buildTitleModel(count = 39) {
  const pages = [];
  for (let pageNo = 1; pageNo <= Math.ceil(count / 25); pageNo += 1) {
    const turnRecords = [];
    const startOrder = ((pageNo - 1) * 25) + 1;
    const endOrder = Math.min(count, pageNo * 25);
    for (let turnNo = startOrder; turnNo <= endOrder; turnNo += 1) {
      turnRecords.push(Object.freeze({
        id: `a-${turnNo}`,
        answerId: `a-${turnNo}`,
        questionId: `q-${turnNo}`,
        turnId: `turn-${turnNo}`,
        aliasIds: Object.freeze([`a-${turnNo}`]),
        turnNo,
        type: 'answer',
      }));
    }
    pages.push(Object.freeze({ pageNo, startOrder, endOrder, turnRecords: Object.freeze(turnRecords) }));
  }
  return Object.freeze({
    coherent: true, source: 'canonical', count, pageSize: 25,
    pageCount: pages.length, pages: Object.freeze(pages),
  });
}

const ATOMIC_NAMES = [
  'resolveSyntheticRowTitle', 'projectSyntheticRowTitle', 'applyStackedTitleBarWash',
  'applyCollapsedNativeRange', 'captureCollapsedPageViewportAnchor',
  'restoreCollapsedPageViewportAnchor', 'setAtomicTitleListMemory',
  'setAtomicCollapsedPageMemory', 'prepareDetachedPageTitleList',
  'revalidateAtomicPageCollapsePlan', 'releaseAtomicPageCollapseState',
  'rollbackAtomicPageCollapse', 'validateCommittedAtomicPageCollapse',
  'collapsePageWithRenderedBoundaries', 'expandPageWithRenderedBoundaries',
  'reconcileAtomicPageCollapseTransactions', 'expandAllAtomicPageCollapses',
  'frozenAtomicPageCollapseDiagnostic', 'recordAtomicPageCollapseAttempt',
  'getAtomicPageCollapseTransactionDiagnostic', 'atomicPageCollapseFailureStage',
  'executeAtomicPageCollapseTransaction',
];
const BOUNDARY_NAMES = [
  'frozenRenderedPageBoundaryCapability', 'renderedBoundaryStatusIdentity',
  'renderedBoundaryDirectChildUnder', 'renderedBoundaryRoleFromCarrier',
  'resolveRenderedTurnSurfaceByIdentity', 'renderedBoundaryThreadDivider',
  'renderedBoundaryStartSentinel', 'renderedBoundaryOrderingNodeAllowed',
  'renderedBoundaryLayoutProof', 'renderedBoundaryWrapperCarriesIdentity',
  'renderedBoundaryColdWrapperH2OOwned', 'resolveColdRenderedBoundaryWrapper',
  'renderedBoundaryPageUnitPlacement', 'renderedBoundaryTransitionActive',
  'renderedBoundaryRecordStreaming', 'readRenderedBoundaryAuthority',
  'renderedBoundaryLeaseScopeCurrent', 'getRenderedPageBoundaryCapability',
];
const RANGE_NAMES = [
  'frozenPageCollapseRangeDiagnostics', 'pageCollapseRangeH2OOwned',
  'pageCollapseRangeIdentityCarriers', 'pageCollapseRangeIdentityOfCarrier',
  'pageCollapseRangeContainerIdentity', 'pageCollapseRangeNodeCarriesIdentity',
  'pageCollapseRangeHasRetainedHeight', 'pageCollapseRangeScopeCurrent',
  'clearStalePageCollapseRangeContinuity', 'readPageCollapseRangeGraphRecords',
  'buildPageCollapseRangePlan', 'getPageCollapseRangeDiagnostics',
];
const CAPABILITY_NAMES = [
  'frozenPageCollapseCapability', 'pageCollapseCapabilityProductReason',
  'evaluatePageCollapseCapability', 'getPageCollapseCapability',
  'frozenCollapsedBoundaryResult', 'getCollapsedNativeBoundaryReadiness',
];

// One live-equivalent activation harness: real flow root, real Page 1/Page 2
// rendered boundaries, retained Page 2 lease, 50 host wrappers, 3 H2O nodes,
// 25 title rows, a real divider dot, and the real registered handlers.
function createActivationHarness(options = {}) {
  const productionSource = options.productionSource || SOURCE;
  const factory = loadRangeHarnessFactory(productionSource);
  const h = factory.createHarness({
    count: 39,
    middleCount: 48,
    extraKind: options.extraKind === undefined ? 'minimap' : options.extraKind,
    missingEnd: options.missingEnd === true,
    coldEnd: options.coldEnd === true,
    streamingOrder: options.streamingOrder || 0,
    branchTransition: options.branchTransition === true,
  });

  h.S.titleListPagesByChat = new Map();
  h.S.collapsedPageDriversByChat = new Map();
  h.S.collapsedPageModesByChat = new Map();
  h.S.titleListStacksByKey = new Map();
  h.S.titleListStackStatsByKey = new Map();
  h.S.nativeRangeActivePages = new Set();
  h.S.collapsedBoundaryDiagnostics = new Map();
  h.S.atomicPageCollapseTransactions = new Map();
  h.S.atomicPageCollapseGuards = new Set();
  h.S.atomicPageCollapseAttemptSeq = 0;
  h.S.atomicPageCollapseLastAttempt = null;
  h.S.collapsedPagesByChat = new Map();
  h.guard.locked = false;

  // Real DOM semantics: a created, unattached node is not connected.
  const createElement = h.document.createElement;
  h.document.createElement = (tag) => {
    const node = createElement(tag);
    node.isConnected = false;
    return node;
  };
  h.p1Divider.getBoundingClientRect = () => ({ top: 100, bottom: 127 });
  h.p2Divider.getBoundingClientRect = () => ({ top: 900, bottom: 927 });

  const dot = h.document.createElement('div');
  dot.className = 'cgxui-chat-page-divider-dot';
  h.p1Divider.appendChild(dot);

  const calls = {
    capabilityEvaluations: 0,
    rangePlans: 0,
    preparations: 0,
    revalidations: 0,
    atomicEntries: 0,
    firstWrites: 0,
    rollbacks: 0,
    legacyTitleListMode: 0,
    legacySyncSynthetic: 0,
    legacyApplyTitleListVisuals: 0,
    legacyNativeSlotResolver: 0,
    legacyCompatibilityFieldReads: 0,
    feedbackMessages: [],
    pageUnitMoves: 0,
    timers: 0,
    observers: 0,
    networkCalls: 0,
    navigationCalls: 0,
    storageWrites: 0,
  };

  const names = [...BOUNDARY_NAMES, ...RANGE_NAMES, ...CAPABILITY_NAMES, ...ATOMIC_NAMES]
    .filter((name) => productionSource.includes(`  function ${name}(`));
  const body = names.map((name) => extractFunction(productionSource, name)).join('\n');
  const clickArrow = extractAssignedArrow(productionSource, 'S.onDividerDotClick');
  const keyboardBody = productionSource.includes('  function forwardCollapseControlKeyboardActivation(')
    ? extractFunction(productionSource, 'forwardCollapseControlKeyboardActivation')
    : '';
  const legacyEntryBody = ['setPageCollapsed', 'togglePageCollapsed']
    .filter((name) => productionSource.includes(`  function ${name}(`))
    .map((name) => extractFunction(productionSource, name))
    .join('\n');

  const context = {
    injectedDocument: h.document,
    injectedWindow: { getComputedStyle: () => ({ overflowY: 'visible' }), scrollBy() {} },
    injectedState: h.S,
    injectedRuntime: h.runtime,
    injectedModel: options.model || buildTitleModel(39),
    injectedCalls: calls,
    injectedStackStats: { activeStackId: '', rowReplaceCount: 0, replaceCount: 0 },
    injectedControl: options.control || {},
  };

  const api = vm.runInNewContext(`(() => {
    const document = injectedDocument;
    const W = injectedWindow;
    const S = injectedState;
    const calls = injectedCalls;
    const control = injectedControl;
    const TITLE_LIST_PAGE_SIZE = 25;
    const TURN_HOST_SEL = '[data-testid="conversation-turn"], [data-testid^="conversation-turn-"]';
    const RENDERED_BOUNDARY_SENTINEL_ATTR = 'data-h2o-chat-page-boundary';
    const RENDERED_BOUNDARY_SENTINEL_PAGE_ATTR = 'data-h2o-chat-page-boundary-page';
    const RENDERED_BOUNDARY_SENTINEL_KIND_ATTR = 'data-h2o-chat-page-boundary-kind';
    const ATTR_CHAT_PAGE_NATIVE_HIDDEN = 'data-cgxui-chat-page-native-hidden';
    const ATTR_TITLE_LIST_NUM = 'data-cgxui-chat-page-title-list-num';
    const COLLAPSE_UNAVAILABLE_MESSAGE = 'Collapse unavailable until the next page boundary is loaded.';
    const COLLAPSE_LAYOUT_INCOMPLETE_MESSAGE = 'Collapse temporarily unavailable because the conversation layout is incomplete.';
    const COLLAPSE_TRANSIENT_FAILURE_MESSAGE = 'Collapse is temporarily unavailable. Please try again.';
    const TURN_RUNTIME = () => injectedRuntime;
    const resolveChatId = () => '${CHAT}';
    const collapsedNativeRangeKey = (chatId, pageNum) => String(chatId) + '::' + String(pageNum);
    const titleListStackRegistryKey = (pageNum, chatId) => String(chatId) + '::' + String(pageNum);
    const titleListStackDomId = (pageNum) => 'cgxui-chat-page-title-stack-' + String(pageNum);
    const buildTitleListPresentationPageModel = () => injectedModel;
    const normalizeVisualDriver = (value) => (String(value || '') === 'engine' ? 'engine' : 'legacy');
    const isPageCollapsed = (pageNum, chatId) => (S.collapsedPagesByChat.get(String(chatId)) instanceof Set)
      && S.collapsedPagesByChat.get(String(chatId)).has(Number(pageNum));
    const getSyntheticTitleListContainers = (pageNum) => Array.from(
      document.querySelectorAll('.cgxui-chat-page-title-list-synth')
    ).filter((node) => Number(node.getAttribute('data-page-num') || 0) === Number(pageNum));
    const AT_PUBLIC = () => ({
      buildDetachedBar(input) {
        if (control.failBarFactory === true) return null;
        const bar = document.createElement('div');
        bar.className = 'cgxui-answer-title';
        bar.setAttribute('data-answer-id', String(input.answerId || ''));
        return bar;
      },
      getBar: () => null,
      getTitle: () => '',
    });
    const WASH_PUBLIC = () => null;
    const onSyntheticTitleRowDblClick = () => {};
    const titleListAnswerFamilyIds = (member) => [member && member.answerId].filter(Boolean);
    const titleBarStrictlyMatchesMember = () => false;
    const titleListIdentityMatchesMember = () => false;
    const isSyntheticTitlePlaceholder = (v) => {
      const t = String(v || '').trim();
      return !t || t === 'Untitled Answer';
    };
    const turnRecordForTitleListIdentity = () => null;
    const restoreAllInlineTurns = () => 0;
    const releaseTitleStackBars = () => 0;
    const getTitleListStackStats = () => injectedStackStats;
    const syncTitleOnlyModeRootAttribute = () => {};
    const clearCollapsedBoundaryDiagnostic = () => {};
    const clearCollapseUnavailableFeedback = () => {};
    const applyCollapsedBoundaryControlState = () => ({ ok: true });
    const collapsedBoundaryDividers = () => [];
    const recordCollapsedBoundaryDiagnostic = (pageNum, readiness) => ({
      reason: String((readiness && readiness.reason) || 'readiness-api-unavailable'),
    });
    const explicitCollapseFeedbackSource = (source) => /^chat-page-divider:(circle|keyboard-enter|keyboard-space)$/.test(String(source || '').trim());
    const releaseCollapsedNativeRange = () => 0;
    const localForgetTitleListPage = () => {};
    const localReadCollapsedPagesSet = () => new Set();
    const localWriteCollapsedPagesSet = () => { calls.storageWrites += 1; };
    const setPageCollapseDriver = () => {};
    const setPageCollapseMode = () => {};
    const applyPageCollapsedVisuals = () => ({ ok: true });
    const setTitleListMode = () => { calls.legacyTitleListMode += 1; return { ok: true }; };
    const syncSyntheticTitleList = () => { calls.legacySyncSynthetic += 1; return { ok: true }; };
    const applyTitleListVisuals = () => { calls.legacyApplyTitleListVisuals += 1; return { ok: true }; };
    const resolveNativeTurnSlotSequence = () => {
      calls.legacyNativeSlotResolver += 1;
      return Object.freeze({ ready: false, reason: 'native-slot-mounted-structure-invalid' });
    };
    const getDividerPageNum = (divider) => Number((divider && divider.getAttribute && divider.getAttribute('data-page-num')) || 0);
    const handleCollapseUnavailableActivation = (pageNum, chatId, readiness, source) => failClosedCollapsedTitleList(pageNum, chatId, readiness, source);
    function failClosedCollapsedTitleList(pageNum, chatId, readiness, source) {
      if (explicitCollapseFeedbackSource(source)) showCollapseUnavailableFeedback(pageNum, chatId, readiness);
      return { ok: false, status: 'collapsed-exact-boundary-unavailable', reason: String((readiness && readiness.reason) || 'readiness-api-unavailable') };
    }
    function showCollapseUnavailableFeedback(pageNum, chatId, readiness) {
      const structuralReason = String((readiness && readiness.structuralReason) || '').trim();
      const reason = structuralReason || String((readiness && readiness.reason) || 'readiness-api-unavailable');
      const message = String((readiness && readiness.productReason) || '') === 'transient-failure'
        ? COLLAPSE_TRANSIENT_FAILURE_MESSAGE
        : structuralReason
          ? COLLAPSE_LAYOUT_INCOMPLETE_MESSAGE
          : COLLAPSE_UNAVAILABLE_MESSAGE;
      calls.feedbackMessages.push({ message, reason });
      return { ok: true, reason, message };
    }

    ${body}
    ${legacyEntryBody}

    const _evaluate = evaluatePageCollapseCapability;
    evaluatePageCollapseCapability = (pageNum, opts) => {
      calls.capabilityEvaluations += 1;
      const out = _evaluate(pageNum, opts);
      if (opts && opts.includePlan === true && out && out.plan) calls.rangePlans += 1;
      return out;
    };
    const _prepare = prepareDetachedPageTitleList;
    prepareDetachedPageTitleList = (plan) => {
      calls.preparations += 1;
      const out = _prepare(plan);
      if (out && out.ok === true && typeof control.afterPrepare === 'function') {
        const hook = control.afterPrepare;
        control.afterPrepare = null;
        hook();
      }
      return out;
    };
    const _revalidate = revalidateAtomicPageCollapsePlan;
    revalidateAtomicPageCollapsePlan = (plan) => {
      calls.revalidations += 1;
      return _revalidate(plan);
    };
    const _stamp = applyCollapsedNativeRange;
    applyCollapsedNativeRange = (plan) => {
      calls.firstWrites += 1;
      return _stamp(plan);
    };
    const _rollback = rollbackAtomicPageCollapse;
    rollbackAtomicPageCollapse = (t, v, reason) => {
      calls.rollbacks += 1;
      return _rollback(t, v, reason);
    };
    const _collapse = collapsePageWithRenderedBoundaries;
    collapsePageWithRenderedBoundaries = (pageNum, opts) => {
      calls.atomicEntries += 1;
      return _collapse(pageNum, opts);
    };
    ${keyboardBody}
    const onDividerDotClick = ${clickArrow};
    S.onDividerDotClick = onDividerDotClick;

    return Object.freeze({
      boundary: getRenderedPageBoundaryCapability,
      capability: (n) => getPageCollapseCapability(n),
      compatibility: (n) => getCollapsedNativeBoundaryReadiness(n),
      click: onDividerDotClick,
      keyboard: typeof forwardCollapseControlKeyboardActivation === 'function' ? forwardCollapseControlKeyboardActivation : null,
      diagnostic: typeof getAtomicPageCollapseTransactionDiagnostic === 'function' ? getAtomicPageCollapseTransactionDiagnostic : null,
      setPageCollapsed: typeof setPageCollapsed === 'function' ? setPageCollapsed : null,
      togglePageCollapsed: typeof togglePageCollapsed === 'function' ? togglePageCollapsed : null,
      reconcile: typeof reconcileAtomicPageCollapseTransactions === 'function' ? reconcileAtomicPageCollapseTransactions : null,
      expandAll: typeof expandAllAtomicPageCollapses === 'function' ? expandAllAtomicPageCollapses : null,
      guardKey: (n) => '${CHAT}' + '::' + String(n),
    });
  })()`, context);

  api.boundary(1);
  api.boundary(2);

  const clickOnce = (source = 'chat-page-divider:circle') => api.click({
    target: dot,
    detail: 1,
    h2oActivationSource: source,
    preventDefault() {},
    stopPropagation() {},
  });
  const pressKey = (key = 'Enter') => (api.keyboard ? api.keyboard({
    key,
    target: dot,
    repeat: false,
    preventDefault() {},
    stopPropagation() {},
  }) : null);
  const stamps = () => h.flow.querySelectorAll('[data-cgxui-chat-page-native-hidden]').length;
  const lists = () => h.document.querySelectorAll('.cgxui-chat-page-title-list-synth').length;

  return { h, api, calls, dot, clickOnce, pressKey, stamps, lists };
}

// ── Fixtures 1-5: immutable parent reproduction ───────────────────────────
await fixture('1 parent capability is activation-ready', () => {
  const t = createActivationHarness({ productionSource: PARENT });
  const cap = t.api.capability(1);
  equal(cap.supported, true, 'supported');
  equal(cap.productReason, 'ready', 'ready');
  equal(cap.rangeProven, true, 'range proven');
  equal(cap.hostWrapperCount, 50, '50 host wrappers');
  equal(cap.h2oNodeCount, 3, '3 H2O nodes');
  equal(cap.ambiguousWrapperCount, 0, 'no ambiguity');
  equal(cap.activationReady, true, 'activation ready');
  equal(cap.legacyNativeSlotConsulted, false, 'no legacy slot');
});

await fixture('2 parent compatibility ready with null legacy DOM fields', () => {
  const t = createActivationHarness({ productionSource: PARENT });
  const compat = t.api.compatibility(1);
  equal(compat.ready, true, 'ready');
  equal(compat.reason, null, 'no reason');
  equal(compat.source, 'rendered-boundary-collapse-capability', 'source');
  equal(compat.activationReady, true, 'activation ready');
  equal(compat.flowRoot, null, 'flowRoot null');
  equal(compat.nativeStart, null, 'nativeStart null');
  equal(compat.nextPageNativeStart, null, 'nextPageNativeStart null');
  equal(compat.nativeSlotSequence, null, 'nativeSlotSequence null');
  equal(compat.nativeStartOrdinal, 0, 'startOrdinal 0');
  equal(compat.nativeEndOrdinal, 0, 'endOrdinal 0');
});

await fixture('3 parent real divider click reaches unavailable feedback', () => {
  const t = createActivationHarness({ productionSource: PARENT });
  t.clickOnce();
  ok(t.calls.feedbackMessages.length >= 1, 'feedback shown');
  equal(
    t.calls.feedbackMessages[0].message,
    'Collapse unavailable until the next page boundary is loaded.',
    'live message reproduced',
  );
});

await fixture('4 parent click produces zero stamps and zero title list', () => {
  const t = createActivationHarness({ productionSource: PARENT });
  t.clickOnce();
  equal(t.stamps(), 0, 'no stamps survive');
  equal(t.lists(), 0, 'no title list survives');
});

await fixture('5 parent root cause is post-commit page-unit miscount rollback', () => {
  const t = createActivationHarness({ productionSource: PARENT });
  t.clickOnce();
  equal(t.calls.atomicEntries, 1, 'transaction entered');
  equal(t.calls.firstWrites, 1, 'first write reached');
  equal(t.calls.rollbacks, 1, 'rolled back');
  // The parent ordering rule counted the transaction's own H2O title list.
  const parentRule = extractFunction(PARENT, 'renderedBoundaryOrderingNodeAllowed');
  ok(!parentRule.includes('pageCollapseRangeH2OOwned'), 'parent rule ignores H2O ownership');
  const correctedRule = extractFunction(SOURCE, 'renderedBoundaryOrderingNodeAllowed');
  ok(correctedRule.includes('pageCollapseRangeH2OOwned'), 'corrected rule honours H2O ownership');
});

// ── Fixtures 6-21: corrected activation ───────────────────────────────────
await fixture('6 corrected pointer click enters the transaction exactly once', () => {
  const t = createActivationHarness();
  t.clickOnce();
  equal(t.calls.atomicEntries, 1, 'one entry');
  const d = t.api.diagnostic();
  equal(d.result, 'committed', 'committed');
  equal(d.activationSource, 'chat-page-divider:circle', 'pointer source');
});

await fixture('7 corrected keyboard activation enters the same transaction once', () => {
  const t = createActivationHarness();
  const result = t.pressKey('Enter');
  equal(result.ok, true, 'keyboard ok');
  equal(t.calls.atomicEntries, 1, 'one entry');
  const d = t.api.diagnostic();
  equal(d.result, 'committed', 'committed');
  equal(d.activationSource, 'chat-page-divider:keyboard-enter', 'keyboard source');
});

await fixture('8 pointer and keyboard share one owner, not independent paths', () => {
  const owner = extractFunction(SOURCE, 'forwardCollapseControlKeyboardActivation');
  ok(owner.includes('executeAtomicPageCollapseTransaction'), 'keyboard calls owner directly');
  ok(!owner.includes('S.onDividerDotClick('), 'keyboard no longer synthesises a click');
  const click = extractAssignedArrow(SOURCE, 'S.onDividerDotClick');
  ok(click.includes('executeAtomicPageCollapseTransaction'), 'pointer calls owner');
});

await fixture('9 one click evaluates capability exactly once', () => {
  const t = createActivationHarness();
  t.calls.capabilityEvaluations = 0;
  t.clickOnce();
  equal(t.calls.capabilityEvaluations, 1, 'single evaluation');
  equal(t.api.diagnostic().capabilityEvaluations, 1, 'diagnostic agrees');
});

await fixture('10 one click builds one exact range plan', () => {
  const t = createActivationHarness();
  t.calls.rangePlans = 0;
  t.clickOnce();
  equal(t.calls.rangePlans, 1, 'single plan');
  equal(t.api.diagnostic().rangePlansBuilt, 1, 'diagnostic agrees');
});

await fixture('11 one click prepares one detached title list', () => {
  const t = createActivationHarness();
  t.calls.preparations = 0;
  t.clickOnce();
  equal(t.calls.preparations, 1, 'single preparation');
  equal(t.api.diagnostic().detachedListsPrepared, 1, 'diagnostic agrees');
});

await fixture('12 activation path never reads legacy compatibility DOM fields', () => {
  const owner = extractFunction(SOURCE, 'executeAtomicPageCollapseTransaction');
  const click = extractAssignedArrow(SOURCE, 'S.onDividerDotClick');
  const keyboard = extractFunction(SOURCE, 'forwardCollapseControlKeyboardActivation');
  const path = `${owner}\n${click}\n${keyboard}`;
  for (const field of [
    'nativeStart', 'nextPageNativeStart', 'nativeSlotSequence',
    'nativeStartOrdinal', 'nativeEndOrdinal', 'startIdentity', 'nextStartIdentity',
  ]) {
    ok(!path.includes(field), `activation path free of ${field}`);
  }
  ok(!click.includes('getCollapsedNativeBoundaryReadiness'), 'click does not re-read legacy readiness');
});

await fixture('13 setTitleListMode is not the user activation owner', () => {
  const t = createActivationHarness();
  t.clickOnce();
  equal(t.calls.legacyTitleListMode, 0, 'legacy title-list mode not used');
  const click = extractAssignedArrow(SOURCE, 'S.onDividerDotClick');
  ok(!click.includes('setTitleListMode'), 'click never calls setTitleListMode');
  const owner = extractFunction(SOURCE, 'executeAtomicPageCollapseTransaction');
  ok(!owner.includes('setTitleListMode'), 'owner never calls setTitleListMode');
});

await fixture('14 syncSyntheticTitleList does not gate the initial commit', () => {
  const t = createActivationHarness();
  t.clickOnce();
  equal(t.calls.legacySyncSynthetic, 0, 'stack sync not consulted');
  equal(t.api.diagnostic().result, 'committed', 'commit succeeded regardless');
});

await fixture('15 applyCollapsedNativeRange is not independently activated', () => {
  const t = createActivationHarness();
  t.clickOnce();
  equal(t.calls.firstWrites, 1, 'exactly one stamping pass');
  equal(t.calls.legacyApplyTitleListVisuals, 0, 'no legacy visuals path');
});

await fixture('16 ready click reaches first write', () => {
  const t = createActivationHarness();
  t.clickOnce();
  equal(t.api.diagnostic().firstWriteReached, true, 'first write reached');
});

await fixture('17 ready click inserts exactly one synthetic title list', () => {
  const t = createActivationHarness();
  t.clickOnce();
  equal(t.lists(), 1, 'one list');
  equal(t.api.diagnostic().syntheticListsInserted, 1, 'diagnostic agrees');
  equal(t.api.diagnostic().titleRowsPrepared, 25, '25 rows');
});

await fixture('18 ready click stamps exactly 50 wrappers', () => {
  const t = createActivationHarness();
  t.clickOnce();
  equal(t.stamps(), 50, '50 stamps');
  const d = t.api.diagnostic();
  equal(d.wrappersPlanned, 50, 'planned 50');
  equal(d.wrappersStamped, 50, 'stamped 50');
});

await fixture('19 Page 2 boundary receives zero stamp', () => {
  const t = createActivationHarness();
  t.clickOnce();
  equal(t.h.end.wrapper.hasAttribute('data-cgxui-chat-page-native-hidden'), false, 'boundary unstamped');
});

await fixture('20 three H2O nodes receive zero stamps', () => {
  const t = createActivationHarness();
  t.clickOnce();
  for (const node of [t.h.p2Sentinel, t.h.p2Divider, t.h.extra, t.h.p1Sentinel, t.h.p1Divider]) {
    if (!node) continue;
    equal(node.hasAttribute('data-cgxui-chat-page-native-hidden'), false, 'H2O node unstamped');
  }
});

await fixture('21 all Page 2 wrappers remain visible', () => {
  const t = createActivationHarness();
  t.clickOnce();
  for (const node of [t.h.end.wrapper, t.h.answer26.wrapper, t.h.afterEnd]) {
    equal(node.hasAttribute('data-cgxui-chat-page-native-hidden'), false, 'page 2 visible');
  }
});

// ── Fixtures 22-25: expansion and reentrancy ──────────────────────────────
await fixture('22 expansion uses the atomic expansion transaction', () => {
  const t = createActivationHarness();
  t.clickOnce();
  t.clickOnce();
  const d = t.api.diagnostic();
  equal(d.result, 'expanded', 'expanded');
  equal(t.stamps(), 0, 'stamps released');
  equal(t.lists(), 0, 'list removed');
});

await fixture('23 second click expands exactly once', () => {
  const t = createActivationHarness();
  t.clickOnce();
  const before = t.calls.atomicEntries;
  t.clickOnce();
  equal(t.calls.atomicEntries, before, 'no second collapse entry');
  equal(t.h.S.atomicPageCollapseTransactions.size, 0, 'registry empty');
});

await fixture('24 reentrant pointer click is blocked', () => {
  const t = createActivationHarness();
  t.h.S.atomicPageCollapseGuards.add(t.api.guardKey(1));
  t.clickOnce();
  const d = t.api.diagnostic();
  equal(d.result, 'reentrant-blocked', 'blocked');
  equal(d.internalReason, 'transaction-busy', 'busy');
  equal(t.stamps(), 0, 'no mutation');
});

await fixture('25 reentrant keyboard activation is blocked', () => {
  const t = createActivationHarness();
  t.h.S.atomicPageCollapseGuards.add(t.api.guardKey(1));
  const result = t.pressKey(' ');
  equal(result.ok, false, 'refused');
  equal(t.api.diagnostic().result, 'reentrant-blocked', 'blocked');
  equal(t.stamps(), 0, 'no mutation');
});

// ── Fixtures 26-32: fail-closed behaviour preserved ───────────────────────
await fixture('26 genuine missing next boundary still fails closed', () => {
  const t = createActivationHarness({ missingEnd: true });
  t.clickOnce();
  equal(t.stamps(), 0, 'no stamps');
  equal(t.lists(), 0, 'no list');
  equal(t.api.capability(1).activationReady, false, 'capability refuses');
});

await fixture('27 genuine ambiguous range still fails closed', () => {
  const t = createActivationHarness({ extraKind: 'unknown-cgxui' });
  const cap = t.api.capability(1);
  ok(cap.ambiguousWrapperCount > 0, 'ambiguity detected');
  equal(cap.activationReady, false, 'capability refuses');
  t.clickOnce();
  equal(t.stamps(), 0, 'no stamps');
  equal(t.lists(), 0, 'no list');
});

await fixture('28 streaming and branch transition still fail closed', () => {
  const streaming = createActivationHarness({ streamingOrder: 1 });
  equal(streaming.api.capability(1).activationReady, false, 'streaming refuses');
  streaming.clickOnce();
  equal(streaming.stamps(), 0, 'streaming no stamps');
  const branch = createActivationHarness({ branchTransition: true });
  equal(branch.api.capability(1).activationReady, false, 'branch refuses');
  branch.clickOnce();
  equal(branch.stamps(), 0, 'branch no stamps');
});

await fixture('29 mid-click generation change aborts before mutation', () => {
  const control = {};
  const t = createActivationHarness({ control });
  control.afterPrepare = () => { t.h.status.generation = 9; };
  t.clickOnce();
  equal(t.stamps(), 0, 'no stamps');
  equal(t.lists(), 0, 'no list');
  equal(t.api.diagnostic().firstWriteReached, false, 'never wrote');
  equal(t.api.diagnostic().result, 'revalidation-failed', 'revalidation stage');
});

await fixture('30 mid-click wrapper change aborts before mutation', () => {
  const control = {};
  const t = createActivationHarness({ control });
  control.afterPrepare = () => { t.h.end.wrapper.remove(); };
  t.clickOnce();
  equal(t.stamps(), 0, 'no stamps');
  equal(t.lists(), 0, 'no list');
  equal(t.api.diagnostic().firstWriteReached, false, 'never wrote');
});

await fixture('31 detached preparation failure produces zero live mutation', () => {
  const t = createActivationHarness({ control: { failBarFactory: true } });
  t.clickOnce();
  equal(t.stamps(), 0, 'no stamps');
  equal(t.lists(), 0, 'no list');
  const d = t.api.diagnostic();
  equal(d.result, 'preparation-failed', 'preparation stage');
  equal(d.firstWriteReached, false, 'never wrote');
});

await fixture('32 final revalidation failure produces zero live mutation', () => {
  const control = {};
  const t = createActivationHarness({ control });
  control.afterPrepare = () => { t.h.status.canonicalFingerprint = 'djb2:changed'; t.h.indexState.fingerprint = 'djb2:changed'; };
  t.clickOnce();
  equal(t.stamps(), 0, 'no stamps');
  equal(t.lists(), 0, 'no list');
  equal(t.api.diagnostic().firstWriteReached, false, 'never wrote');
});

await fixture('33 commit failure rolls back completely', () => {
  const t = createActivationHarness();
  // A pre-existing stamp inside the planned range makes stamping refuse.
  t.h.hostWrappers[5].setAttribute('data-cgxui-chat-page-native-hidden', '1');
  t.clickOnce();
  const residual = Array.from(t.h.flow.querySelectorAll('[data-cgxui-chat-page-native-hidden]'));
  equal(residual.length, 1, 'only the pre-existing stamp remains');
  equal(t.lists(), 0, 'inserted list removed');
  const d = t.api.diagnostic();
  equal(d.rollbackPerformed, true, 'rollback recorded');
  equal(d.result, 'rolled-back', 'rolled-back stage');
});

// ── Fixtures 34-39: diagnostic and feedback contract ──────────────────────
await fixture('34 diagnostic reports committed success accurately', () => {
  const t = createActivationHarness();
  t.clickOnce();
  const d = t.api.diagnostic();
  equal(d.version, 1, 'version');
  equal(d.available, true, 'available');
  equal(d.result, 'committed', 'result');
  equal(d.internalReason, null, 'no internal reason');
  equal(d.productReason, null, 'no product reason');
  equal(d.rollbackPerformed, false, 'no rollback');
  ok(d.finishedAt >= d.startedAt, 'timestamps ordered');
  ok(d.attemptId >= 1, 'attempt id');
});

await fixture('35 diagnostic reports pre-commit failure accurately', () => {
  const t = createActivationHarness({ control: { failBarFactory: true } });
  t.clickOnce();
  const d = t.api.diagnostic();
  equal(d.result, 'preparation-failed', 'stage');
  equal(d.productReason, 'transient-failure', 'transient');
  equal(d.wrappersStamped, 0, 'no stamps');
  equal(d.syntheticListsInserted, 0, 'no list');
  ok(typeof d.internalReason === 'string' && d.internalReason.length > 0, 'internal reason present');
});

await fixture('36 diagnostic is deeply frozen and DOM-free', () => {
  const t = createActivationHarness();
  t.clickOnce();
  const d = t.api.diagnostic();
  const seen = new Set();
  const walk = (value) => {
    if (!value || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    ok(Object.isFrozen(value), 'frozen');
    for (const child of Object.values(value)) {
      ok(!(child && typeof child === 'object' && typeof child.getAttribute === 'function'), 'no DOM node');
      walk(child);
    }
  };
  walk(d);
  const json = JSON.stringify(d);
  for (const forbidden of ['q-1', 'a-1', 'Untitled Answer', '<div', 'Error']) {
    ok(!json.includes(forbidden), `no leaked ${forbidden}`);
  }
});

await fixture('37 diagnostic performs zero DOM and storage writes', () => {
  const t = createActivationHarness();
  t.clickOnce();
  const stampsBefore = t.stamps();
  const listsBefore = t.lists();
  const writesBefore = t.calls.storageWrites;
  t.api.diagnostic();
  t.api.diagnostic();
  equal(t.stamps(), stampsBefore, 'no dom change');
  equal(t.lists(), listsBefore, 'no list change');
  equal(t.calls.storageWrites, writesBefore, 'no storage write');
});

await fixture('38 ready capability never maps to the next-boundary message', () => {
  const t = createActivationHarness({ control: { failBarFactory: true } });
  t.clickOnce();
  ok(t.calls.feedbackMessages.length >= 1, 'feedback shown');
  for (const entry of t.calls.feedbackMessages) {
    ok(
      !entry.message.includes('next page boundary'),
      'transaction failure never blames the next boundary',
    );
    equal(entry.message, 'Collapse is temporarily unavailable. Please try again.', 'neutral message');
  }
});

await fixture('39 genuine next-boundary-unavailable keeps its boundary message', () => {
  const t = createActivationHarness({ missingEnd: true });
  t.clickOnce();
  ok(t.calls.feedbackMessages.length >= 1, 'feedback shown');
  const messages = t.calls.feedbackMessages.map((entry) => entry.message);
  ok(
    messages.every((message) => message !== 'Collapse is temporarily unavailable. Please try again.'),
    'genuine boundary failure is not reported as transient',
  );
});

// ── Fixtures 40-50: prohibitions and stability ────────────────────────────
await fixture('40 native-slot resolver calls remain zero', () => {
  const t = createActivationHarness();
  t.clickOnce();
  equal(t.calls.legacyNativeSlotResolver, 0, 'resolver untouched');
  equal(t.api.capability(1).legacyNativeSlotConsulted, false, 'capability flag false');
});

await fixture('41-43 no ordinal, pairCount or test-ID arithmetic on the activation path', () => {
  const owner = extractFunction(SOURCE, 'executeAtomicPageCollapseTransaction');
  const click = extractAssignedArrow(SOURCE, 'S.onDividerDotClick');
  const keyboard = extractFunction(SOURCE, 'forwardCollapseControlKeyboardActivation');
  const path = `${owner}\n${click}\n${keyboard}`;
  ok(!/Ordinal/.test(path), 'no ordinal inference');
  ok(!/\*\s*2\b/.test(path), 'no pairCount x2 inference');
  ok(!/conversation-turn-/.test(path), 'no test-ID ownership arithmetic');
  ok(!/Math\.ceil\(/.test(path), 'no ceil mapping');
  ok(!/resolveNativeTurnSlotSequence/.test(path), 'no native slot resolver');
});

await fixture('44 collapse causes zero persistence writes', () => {
  const t = createActivationHarness();
  t.calls.storageWrites = 0;
  t.clickOnce();
  equal(t.calls.storageWrites, 0, 'no storage writes');
  equal(t.h.safety.storageWrites, 0, 'harness storage counter zero');
  equal(t.h.safety.cacheWrites, 0, 'no cache writes');
  equal(t.h.safety.preferenceWrites, 0, 'no preference writes');
  equal(t.h.safety.canonicalWrites, 0, 'no canonical writes');
  equal(t.h.safety.aliasWrites, 0, 'no alias writes');
});

await fixture('45 collapse causes zero navigation and network', () => {
  const t = createActivationHarness();
  t.clickOnce();
  equal(t.h.safety.networkCalls, 0, 'no network');
  equal(t.h.safety.navigationCalls, 0, 'no navigation');
});

await fixture('46 collapse adds no timers, RAF loops or observers', () => {
  const t = createActivationHarness();
  t.clickOnce();
  equal(t.h.safety.timerCalls, 0, 'no timers');
  equal(t.h.safety.rafCalls, 0, 'no raf');
  equal(t.h.safety.observerCalls, 0, 'no observers');
});

await fixture('47 page-unit movement remains zero', () => {
  const t = createActivationHarness();
  const before = Array.from(t.h.flow.children).indexOf(t.h.p2Divider);
  const sentinelBefore = Array.from(t.h.flow.children).indexOf(t.h.p2Sentinel);
  t.clickOnce();
  const children = Array.from(t.h.flow.children);
  // The only insertion is the title list before Page 1 content, so Page 2
  // units shift by exactly one position and never reorder relative to itself.
  equal(children.indexOf(t.h.p2Divider) - children.indexOf(t.h.p2Sentinel), before - sentinelBefore, 'page 2 unit order unchanged');
  ok(children.indexOf(t.h.p2Divider) < children.indexOf(t.h.end.wrapper), 'divider still before boundary');
});

await fixture('48 boundary and range APIs remain semantically unchanged', () => {
  const t = createActivationHarness();
  const boundary = t.api.boundary(2);
  equal(boundary.supported, true, 'page 2 supported');
  equal(boundary.leaseCurrent, true, 'lease current');
  const cap = t.api.capability(1);
  equal(cap.pageStartOrder, 1, 'start order');
  equal(cap.pageEndOrder, 25, 'end order');
  equal(cap.rangeProven, true, 'range proven');
});

await fixture('49 graph getter remains present', () => {
  const t = createActivationHarness();
  equal(typeof t.h.runtime.getGraphIdentityDiagnostics, 'function', 'graph getter present');
  ok(t.api.capability(1).graphFingerprint.length > 0, 'graph fingerprint consumed');
});

await fixture('50 five collapse and expand cycles remain stable', () => {
  const t = createActivationHarness();
  for (let cycle = 0; cycle < 5; cycle += 1) {
    t.clickOnce();
    equal(t.stamps(), 50, `cycle ${cycle} collapsed`);
    equal(t.lists(), 1, `cycle ${cycle} one list`);
    t.clickOnce();
    equal(t.stamps(), 0, `cycle ${cycle} expanded`);
    equal(t.lists(), 0, `cycle ${cycle} list removed`);
  }
  equal(t.h.S.atomicPageCollapseTransactions.size, 0, 'no leaked transactions');
  equal(t.h.S.atomicPageCollapseGuards.size, 0, 'no leaked guards');
});

const failed = fixtures.filter((entry) => !entry.ok);
console.log(`\nCV-3.27 fixtures ${fixtures.length - failed.length}/${fixtures.length} assertions ${assertions}`);
if (failed.length) {
  for (const entry of failed) console.error(`FAILED ${entry.name}`);
  process.exit(1);
}
