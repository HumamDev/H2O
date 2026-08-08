#!/usr/bin/env node
// CV-3.28 — exact final-page atomic collapse and expansion.
//
// The immutable parent aa62b8e8 rejected every final page in
// buildPageCollapseRangePlan with `final-page-end-authority-unavailable`
// before any tail could be considered, so a single-page conversation and the
// last page of a multi-page conversation could never collapse. This validator
// reproduces both parent rejections through real production bodies, then
// proves the corrected final-page tail authority, the shared range classifier,
// the atomic transaction and the one-way Chat -> MiniMap propagation.
//
// The harness is parameterized by turn count and page size so no host-wrapper
// count, page count or order is hard-coded into the expectations: every
// expected count is derived from the fixture that built the DOM.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const PAGE_PATH = 'src-runtime-base/1C1b.🔴📑 Thread Pages Controller 📑.js';
const PARENT_SHA = 'aa62b8e8e0d21958d118313af2fde81038df74d0';
const SOURCE = fs.readFileSync(path.join(ROOT, PAGE_PATH), 'utf8');
const PARENT = execFileSync('git', ['show', `${PARENT_SHA}:${PAGE_PATH}`], {
  cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
});

let assertions = 0;
const fixtures = [];
function equal(actual, expected, message) { assertions += 1; assert.deepEqual(actual, expected, message); }
function ok(value, message) { assertions += 1; assert.ok(value, message); }
async function fixture(name, run) {
  try { await run(); fixtures.push({ name, ok: true }); console.log(`PASS ${name}`); }
  catch (error) { fixtures.push({ name, ok: false, error: String(error?.stack || error) }); console.error(`FAIL ${name}\n${String(error?.stack || error)}`); }
}

function extractFunction(source, name) {
  const anchor = `  function ${name}(`;
  const start = source.indexOf(anchor);
  if (start < 0 || source.indexOf(anchor, start + anchor.length) >= 0) throw new Error(`function-anchor-invalid:${name}`);
  const bodyStart = source.indexOf('{', source.indexOf(')', start));
  let depth = 0, quote = '', escaped = false, lineComment = false, blockComment = false;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index], next = source[index + 1];
    if (lineComment) { if (char === '\n') lineComment = false; continue; }
    if (blockComment) { if (char === '*' && next === '/') { blockComment = false; index += 1; } continue; }
    if (quote) { if (escaped) escaped = false; else if (char === '\\') escaped = true; else if (char === quote) quote = ''; continue; }
    if (char === '/' && next === '/') { lineComment = true; index += 1; continue; }
    if (char === '/' && next === '*') { blockComment = true; index += 1; continue; }
    if (char === '"' || char === "'" || char === '`') { quote = char; continue; }
    if (char === '{') depth += 1;
    else if (char === '}' && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`function-boundary-invalid:${name}`);
}
function extractAssignedArrow(source, target) {
  const anchor = `    ${target} = (ev) => {`;
  const start = source.indexOf(anchor);
  if (start < 0) throw new Error(`arrow-anchor-invalid:${target}`);
  const bodyStart = source.indexOf('{', source.indexOf('=>', start));
  let depth = 0, quote = '', escaped = false, lineComment = false, blockComment = false;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index], next = source[index + 1];
    if (lineComment) { if (char === '\n') lineComment = false; continue; }
    if (blockComment) { if (char === '*' && next === '/') { blockComment = false; index += 1; } continue; }
    if (quote) { if (escaped) escaped = false; else if (char === '\\') escaped = true; else if (char === quote) quote = ''; continue; }
    if (char === '/' && next === '/') { lineComment = true; index += 1; continue; }
    if (char === '/' && next === '*') { blockComment = true; index += 1; continue; }
    if (char === '"' || char === "'" || char === '`') { quote = char; continue; }
    if (char === '{') depth += 1;
    else if (char === '}' && --depth === 0) return source.slice(source.indexOf('(ev) =>', start), index + 1);
  }
  throw new Error(`arrow-boundary-invalid:${target}`);
}

// ── Minimal DOM with real connection semantics ────────────────────────────
function selectorParts(selector) {
  return String(selector || '').split(',').map((p) => p.trim()).filter(Boolean);
}
function matchesSimple(node, selector) {
  const text = String(selector || '').trim();
  const tagMatch = text.match(/^([a-zA-Z]+)/);
  if (tagMatch && String(node.tagName).toUpperCase() !== tagMatch[1].toUpperCase()) return false;
  for (const cls of Array.from(text.matchAll(/\.([A-Za-z0-9_-]+)/g)).map((m) => m[1])) {
    if (!String(node.className || '').split(/\s+/).includes(cls)) return false;
  }
  for (const m of text.matchAll(/#([A-Za-z0-9_-]+)/g)) {
    if (node.getAttribute('id') !== m[1]) return false;
  }
  for (const m of text.matchAll(/\[([^\]=^]+)(\^?)=?"?([^"\]]*)"?\]/g)) {
    const name = m[1].trim();
    const caret = m[2] === '^';
    const want = m[3];
    const actual = node.getAttribute(name);
    if (actual == null) return false;
    if (want === '') continue;
    if (caret) { if (!String(actual).startsWith(want)) return false; }
    else if (String(actual) !== want) return false;
  }
  return true;
}
class El {
  constructor(tag = 'DIV', className = '') {
    this.tagName = String(tag).toUpperCase();
    this.nodeType = 1;
    this.className = className;
    this.children = [];
    this.parentElement = null;
    this.attrs = new Map();
    this.isConnected = false;
    this.style = {
      _v: new Map(),
      setProperty(k, v) { this._v.set(k, v); },
      removeProperty(k) { this._v.delete(k); },
      getPropertyValue(k) { return this._v.get(k) || ''; },
    };
  }
  addEventListener() {}
  removeEventListener() {}
  get id() { return this.getAttribute('id') || ''; }
  set id(v) { this.setAttribute('id', v); }
  setAttribute(n, v) { this.attrs.set(String(n), String(v)); }
  getAttribute(n) { return this.attrs.has(String(n)) ? this.attrs.get(String(n)) : null; }
  hasAttribute(n) { return this.attrs.has(String(n)); }
  removeAttribute(n) { this.attrs.delete(String(n)); }
  _connect(state) { this.isConnected = state; for (const c of this.children) c._connect(state); }
  appendChild(c) { if (c.parentElement) c.parentElement.removeChild(c); c.parentElement = this; this.children.push(c); c._connect(this.isConnected); return c; }
  insertBefore(c, ref) {
    if (c.parentElement) c.parentElement.removeChild(c);
    c.parentElement = this;
    const i = ref ? this.children.indexOf(ref) : -1;
    if (i < 0) this.children.push(c); else this.children.splice(i, 0, c);
    c._connect(this.isConnected);
    return c;
  }
  removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); c.parentElement = null; c._connect(false); return c; }
  remove() { if (this.parentElement) this.parentElement.removeChild(c => c); if (this.parentElement) this.parentElement.removeChild(this); }
  get nextSibling() { const p = this.parentElement; if (!p) return null; const i = p.children.indexOf(this); return p.children[i + 1] || null; }
  matches(sel) { return selectorParts(sel).some((p) => matchesSimple(this, p)); }
  closest(sel) { let n = this; while (n) { if (n.matches(sel)) return n; n = n.parentElement; } return null; }
  querySelectorAll(sel) { const out = []; const walk = (n) => { for (const c of n.children) { if (c.matches(sel)) out.push(c); walk(c); } }; walk(this); return out; }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  contains(o) { let n = o; while (n) { if (n === this) return true; n = n.parentElement; } return false; }
  getBoundingClientRect() { return { top: 100, bottom: 127, height: 27 }; }
}
El.prototype.remove = function remove() { if (this.parentElement) this.parentElement.removeChild(this); };

function turnWrapper(id, role, testId, mounted = true) {
  const wrapper = new El('DIV', 'host-turn-slot');
  wrapper.setAttribute('data-turn-id-container', id);
  if (mounted) {
    const host = new El('SECTION', 'native-turn-host');
    host.setAttribute('data-testid', testId);
    const carrier = new El('SECTION', 'identity-carrier');
    carrier.setAttribute('data-turn-id', id);
    carrier.setAttribute('data-turn', role);
    host.appendChild(carrier);
    wrapper.appendChild(host);
  }
  return wrapper;
}
function boundarySentinel(page, kind) {
  const n = new El('SPAN', 'h2o-page-boundary');
  n.setAttribute('data-h2o-chat-page-boundary', `page-${page}-${kind}`);
  n.setAttribute('data-h2o-chat-page-boundary-page', String(page));
  n.setAttribute('data-h2o-chat-page-boundary-kind', kind);
  n.setAttribute('data-cgxui-owner', 'mnmp');
  return n;
}
function pageDivider(page) {
  const n = new El('DIV', 'cgxui-chat-page-divider');
  n.setAttribute('data-page-num', String(page));
  n.setAttribute('data-cgxui-owner', 'mnmp');
  const dot = new El('SPAN', 'cgxui-chat-page-divider-dot');
  n.appendChild(dot);
  return { divider: n, dot };
}

const CHAT = 'chat-final-page';
const ROUTE = '/c/chat-final-page';
const EFFECTIVE_FP = 'djb2:effective-final';
const GRAPH_FP = 'djb2:graph-final';

const NAMES = [
  'frozenRenderedPageBoundaryCapability', 'renderedBoundaryStatusIdentity',
  'renderedBoundaryDirectChildUnder', 'renderedBoundaryRoleFromCarrier',
  'resolveRenderedTurnSurfaceByIdentity', 'renderedBoundaryThreadDivider',
  'renderedBoundaryStartSentinel', 'renderedBoundaryPageEndSentinel',
  'renderedBoundaryOrderingNodeAllowed', 'renderedBoundaryLayoutProof',
  'renderedBoundaryWrapperCarriesIdentity', 'renderedBoundaryColdWrapperH2OOwned',
  'resolveColdRenderedBoundaryWrapper', 'renderedBoundaryPageUnitPlacement',
  'renderedBoundaryTransitionActive', 'renderedBoundaryRecordStreaming',
  'readRenderedBoundaryAuthority', 'renderedBoundaryLeaseScopeCurrent',
  'getRenderedPageBoundaryCapability',
  'frozenPageCollapseRangeDiagnostics', 'pageCollapseRangeH2OOwned',
  'pageCollapseRangeIdentityCarriers', 'pageCollapseRangeIdentityOfCarrier',
  'pageCollapseRangeContainerIdentity', 'pageCollapseRangeNodeCarriesIdentity',
  'pageCollapseRangeHasRetainedHeight', 'pageCollapseRangeScopeCurrent',
  'clearStalePageCollapseRangeContinuity', 'readPageCollapseRangeGraphRecords',
  'readFinalPageTerminalRecord', 'resolveFinalPageTerminalWrapper',
  'resolveFinalPageTailAuthority',
  'buildPageCollapseRangePlan', 'classifyPageCollapseRange', 'getPageCollapseRangeDiagnostics',
  'frozenPageCollapseCapability', 'pageCollapseCapabilityProductReason',
  'evaluatePageCollapseCapability', 'getPageCollapseCapability',
  'frozenCollapsedBoundaryResult', 'getCollapsedNativeBoundaryReadiness',
  'resolveSyntheticRowTitle', 'projectSyntheticRowTitle', 'applyStackedTitleBarWash',
  'applyCollapsedNativeRange', 'captureCollapsedPageViewportAnchor',
  'restoreCollapsedPageViewportAnchor', 'propagateChatPageCollapseToMiniMap',
  'setAtomicTitleListMemory', 'setAtomicCollapsedPageMemory',
  'prepareDetachedPageTitleList', 'revalidateAtomicPageCollapsePlan',
  'releaseAtomicPageCollapseState', 'rollbackAtomicPageCollapse',
  'validateCommittedAtomicPageCollapse', 'collapsePageWithRenderedBoundaries',
  'applyExpandedCollapseControlState',
  'expandPageWithRenderedBoundaries', 'reconcileAtomicPageCollapseTransactions',
  'expandAllAtomicPageCollapses', 'frozenAtomicPageCollapseDiagnostic',
  'recordAtomicPageCollapseAttempt', 'getAtomicPageCollapseTransactionDiagnostic',
  'atomicPageCollapseFailureStage', 'executeAtomicPageCollapseTransaction',
];

// options: { count, pageSize, noAnswerOrders, endSentinelBeforeTerminal,
//            interveningKind, omitEndSentinel, productionSource }
function createHarness(options = {}) {
  const productionSource = options.productionSource || SOURCE;
  const count = Number(options.count || 18);
  const pageSize = Number(options.pageSize || 25);
  const pageCount = Math.max(1, Math.ceil(count / pageSize));
  const noAnswer = new Set(options.noAnswerOrders || []);

  const thread = new El('DIV', 'thread');
  thread.setAttribute('id', 'thread');
  thread.isConnected = true;
  const flow = new El('DIV', 'active-flow');
  thread.appendChild(flow);

  const records = [];
  const graphNodes = new Map();
  for (let order = 1; order <= count; order += 1) {
    const qId = `q-${order}`;
    const primaryAId = noAnswer.has(order) ? '' : `a-${order}`;
    records.push({ order, qId, primaryAId, answerVariants: primaryAId ? [primaryAId] : [], noAnswer: !primaryAId, stopped: false, livePendingStreaming: false });
    graphNodes.set(qId, { found: true, productUser: true, productAnswer: false });
    if (primaryAId) graphNodes.set(primaryAId, { found: true, productUser: false, productAnswer: true });
  }

  const units = { sentinels: new Map(), dividers: new Map(), dots: new Map() };
  const hostWrappersByPage = new Map();
  let testNo = 0;
  for (let page = 1; page <= pageCount; page += 1) {
    const startOrder = ((page - 1) * pageSize) + 1;
    const endOrder = Math.min(page * pageSize, count);
    const startSentinel = boundarySentinel(page, 'start');
    const { divider, dot } = pageDivider(page);
    units.sentinels.set(`${page}:start`, startSentinel);
    units.dividers.set(page, divider);
    units.dots.set(page, dot);
    flow.appendChild(startSentinel);
    flow.appendChild(divider);
    const wrappers = [];
    for (let order = startOrder; order <= endOrder; order += 1) {
      const rec = records[order - 1];
      testNo += 1;
      const qw = turnWrapper(rec.qId, 'user', `conversation-turn-${testNo}`);
      flow.appendChild(qw);
      wrappers.push(qw);
      if (rec.primaryAId) {
        testNo += 1;
        const aw = turnWrapper(rec.primaryAId, 'assistant', `conversation-turn-${testNo}`);
        flow.appendChild(aw);
        wrappers.push(aw);
      }
    }
    hostWrappersByPage.set(page, wrappers);
    if (page === pageCount) {
      // Final page: end sentinel after the terminal wrapper unless a fixture
      // deliberately mis-places it or drops it.
      const endSentinel = boundarySentinel(page, 'end');
      units.sentinels.set(`${page}:end`, endSentinel);
      if (options.omitEndSentinel === true) {
        // no end sentinel at all
      } else if (options.endSentinelBeforeTerminal === true) {
        flow.insertBefore(endSentinel, wrappers[wrappers.length - 1]);
      } else {
        if (options.interveningKind === 'host') {
          flow.appendChild(turnWrapper('stray-host', 'assistant', 'conversation-turn-stray'));
        } else if (options.interveningKind === 'ambiguous') {
          flow.appendChild(new El('DIV', 'mystery-node'));
        } else if (options.interveningKind === 'h2o') {
          const extra = new El('DIV', 'cgxui-chat-page-title-list-synth');
          extra.setAttribute('data-cgxui', 'chat-page-title-list-synth');
          flow.appendChild(extra);
        }
        flow.appendChild(endSentinel);
      }
    }
  }
  const composer = new El('FORM', 'composer');
  flow.appendChild(composer);

  const status = {
    source: 'canonical', overlayActive: false, count,
    canonicalFingerprint: EFFECTIVE_FP, chatId: CHAT, routeKey: ROUTE, generation: 1,
  };
  const projection = {
    authoritative: true, chatId: CHAT, routeGeneration: 1, fingerprint: EFFECTIVE_FP,
    selectedPathConfirmationPending: options.branchTransition === true,
    selectedPathConfirmationLeaseActive: false, selectedPathRequestLeaseActive: false,
  };
  const graphScope = { chatId: CHAT, routeKey: ROUTE, generation: 1, fingerprint: GRAPH_FP, graphNodeCount: graphNodes.size };
  const minimapCalls = [];
  const minimapCollapsed = new Set();
  const runtime = {
    getEffectivePresentationStatus: () => Object.freeze({ ...status }),
    getEffectivePresentationIndex: () => Object.freeze({
      complete: true, sourceFingerprint: status.canonicalFingerprint,
      turns: records.map((r) => Object.freeze({ ...r })),
    }),
    getCompleteTurnIndexProjectionStatus: () => Object.freeze({ ...projection, fingerprint: status.canonicalFingerprint }),
    getEffectiveTurnRecordByQId: (qId) => records.find((r) => r.qId === qId) || null,
    getGraphIdentityDiagnostics: (ids) => Object.freeze({
      available: true, reason: null, scope: Object.freeze({ ...graphScope }),
      records: Object.freeze((Array.isArray(ids) ? ids : []).map((id) => Object.freeze({
        requestedId: id, found: graphNodes.has(id),
        productUser: graphNodes.get(id)?.productUser === true,
        productAnswer: graphNodes.get(id)?.productAnswer === true,
      }))),
    }),
  };

  const S = {
    renderedPageBoundaryLeases: new Map(),
    pageCollapseRangeContinuity: new Map(),
    atomicPageCollapseTransactions: new Map(),
    atomicPageCollapseGuards: new Set(),
    atomicPageCollapseAttemptSeq: 0,
    atomicPageCollapseLastAttempt: null,
    nativeRangeActivePages: new Set(),
    collapsedBoundaryDiagnostics: new Map(),
    titleListPagesByChat: new Map(),
    collapsedPagesByChat: new Map(),
    titleListStacksByKey: new Map(),
    titleListStackStatsByKey: new Map(),
  };
  const safety = { storage: 0, network: 0, navigation: 0, timers: 0, observers: 0, hostRemovals: 0, pageUnitMoves: 0 };

  // The document root itself is part of the search space, exactly as in a real
  // document — the capability resolves the active thread with querySelector.
  const queryAll = (sel) => {
    const out = thread.matches(sel) ? [thread] : [];
    return out.concat(thread.querySelectorAll(sel));
  };
  const document = {
    createElement: (tag) => new El(tag),
    querySelectorAll: queryAll,
    querySelector: (sel) => queryAll(sel)[0] || null,
    body: thread,
    scrollingElement: null,
  };

  const body = NAMES.filter((n) => productionSource.includes(`  function ${n}(`))
    .map((n) => extractFunction(productionSource, n)).join('\n');
  const clickArrow = extractAssignedArrow(productionSource, 'S.onDividerDotClick');
  const keyboard = productionSource.includes('  function forwardCollapseControlKeyboardActivation(')
    ? extractFunction(productionSource, 'forwardCollapseControlKeyboardActivation') : '';

  const ctx = {
    injectedDocument: document, injectedWindow: { getComputedStyle: () => ({ overflowY: 'visible' }), scrollBy() {} },
    injectedState: S, injectedRuntime: runtime, injectedSafety: safety,
    injectedMinimapCalls: minimapCalls, injectedMinimapCollapsed: minimapCollapsed,
    injectedPageSize: pageSize, injectedStackStats: { activeStackId: '' },
    injectedCalls: { capability: 0, plans: 0, preparations: 0, feedback: [] },
  };

  const api = vm.runInNewContext(`(() => {
    const document = injectedDocument;
    const W = injectedWindow;
    const S = injectedState;
    const safety = injectedSafety;
    const calls = injectedCalls;
    const TITLE_LIST_PAGE_SIZE = injectedPageSize;
    const TURN_HOST_SEL = '[data-testid="conversation-turn"], [data-testid^="conversation-turn-"]';
    const RENDERED_BOUNDARY_SENTINEL_ATTR = 'data-h2o-chat-page-boundary';
    const RENDERED_BOUNDARY_SENTINEL_PAGE_ATTR = 'data-h2o-chat-page-boundary-page';
    const RENDERED_BOUNDARY_SENTINEL_KIND_ATTR = 'data-h2o-chat-page-boundary-kind';
    const ATTR_CHAT_PAGE_NATIVE_HIDDEN = 'data-cgxui-chat-page-native-hidden';
    const ATTR_TITLE_LIST_NUM = 'data-cgxui-chat-page-title-list-num';
    const COLLAPSE_UNAVAILABLE_STATUS = 'collapsed-exact-boundary-unavailable';
    const COLLAPSE_UNAVAILABLE_MESSAGE = 'Collapse unavailable until the next page boundary is loaded.';
    const COLLAPSE_LAYOUT_INCOMPLETE_MESSAGE = 'Collapse temporarily unavailable because the conversation layout is incomplete.';
    const COLLAPSE_TRANSIENT_FAILURE_MESSAGE = 'Collapse is temporarily unavailable. Please try again.';
    const TURN_RUNTIME = () => injectedRuntime;
    const resolveChatId = () => '${CHAT}';
    const collapsedNativeRangeKey = (chatId, pageNum) => String(chatId) + '::' + String(pageNum);
    const titleListStackRegistryKey = (pageNum, chatId) => String(chatId) + '::' + String(pageNum);
    const titleListStackDomId = (pageNum) => 'stack-' + String(pageNum);
    const MM_CORE_PAGES = () => ({
      setMiniMapPageCollapsed(pageNum, collapsed, chatId, opts) {
        // MiniMap owner: writes MiniMap state only. Never calls back into the
        // Chat page, so a Chat -> MiniMap propagation cannot recurse.
        injectedMinimapCalls.push({ pageNum, collapsed: !!collapsed, source: String(opts && opts.source || '') });
        if (collapsed) injectedMinimapCollapsed.add(Number(pageNum));
        else injectedMinimapCollapsed.delete(Number(pageNum));
        return { ok: true };
      },
    });
    const buildTitleListPresentationPageModel = () => {
      const turns = injectedRuntime.getEffectivePresentationIndex().turns;
      const pages = [];
      const total = Math.max(1, Math.ceil(turns.length / TITLE_LIST_PAGE_SIZE));
      for (let p = 1; p <= total; p += 1) {
        const startOrder = ((p - 1) * TITLE_LIST_PAGE_SIZE) + 1;
        const endOrder = Math.min(p * TITLE_LIST_PAGE_SIZE, turns.length);
        const turnRecords = [];
        for (let o = startOrder; o <= endOrder; o += 1) {
          const t = turns[o - 1];
          turnRecords.push(Object.freeze({
            id: t.primaryAId || t.qId, answerId: t.primaryAId || '', questionId: t.qId,
            turnNo: o, type: t.primaryAId ? 'answer' : 'no-answer',
          }));
        }
        pages.push(Object.freeze({ pageNo: p, startOrder, endOrder, turnRecords: Object.freeze(turnRecords) }));
      }
      return Object.freeze({ coherent: true, source: 'canonical', count: turns.length, pageSize: TITLE_LIST_PAGE_SIZE, pageCount: total, pages: Object.freeze(pages) });
    };
    const getSyntheticTitleListContainers = (pageNum) => Array.from(document.querySelectorAll('.cgxui-chat-page-title-list-synth')).filter((n) => Number(n.getAttribute('data-page-num') || 0) === Number(pageNum));
    const AT_PUBLIC = () => ({
      buildDetachedBar(input) { const b = document.createElement('div'); b.className = 'cgxui-answer-title'; b.setAttribute('data-answer-id', String(input.answerId || '')); return b; },
      getBar: () => null, getTitle: () => '',
    });
    const WASH_PUBLIC = () => null;
    const onSyntheticTitleRowDblClick = () => {};
    const titleListAnswerFamilyIds = (m) => [m && m.answerId].filter(Boolean);
    const titleBarStrictlyMatchesMember = () => false;
    const titleListIdentityMatchesMember = () => false;
    const isSyntheticTitlePlaceholder = (v) => { const t = String(v || '').trim(); return !t || t === 'Untitled Answer'; };
    const turnRecordForTitleListIdentity = () => null;
    const restoreAllInlineTurns = () => 0;
    const releaseTitleStackBars = () => 0;
    const getTitleListStackStats = () => injectedStackStats;
    const syncTitleOnlyModeRootAttribute = () => {};
    const clearCollapsedBoundaryDiagnostic = () => {};
    const clearCollapseUnavailableFeedback = () => {};
    const applyCollapsedBoundaryControlState = () => ({ ok: true });
    const collapsedBoundaryDividers = () => [];
    const recordCollapsedBoundaryDiagnostic = (p, r) => ({ reason: String((r && r.reason) || 'readiness-api-unavailable') });
    const explicitCollapseFeedbackSource = (s) => /^chat-page-divider:(circle|keyboard-enter|keyboard-space)$/.test(String(s || '').trim());
    const releaseCollapsedNativeRange = () => 0;
    const localForgetTitleListPage = () => {};
    const getDividerPageNum = (d) => Number((d && d.getAttribute && d.getAttribute('data-page-num')) || 0);
    const showCollapseUnavailableFeedback = (pageNum, chatId, readiness) => {
      const structural = String((readiness && readiness.structuralReason) || '').trim();
      const message = String((readiness && readiness.productReason) || '') === 'transient-failure'
        ? COLLAPSE_TRANSIENT_FAILURE_MESSAGE
        : structural ? COLLAPSE_LAYOUT_INCOMPLETE_MESSAGE : COLLAPSE_UNAVAILABLE_MESSAGE;
      calls.feedback.push({ message, reason: String((readiness && readiness.reason) || '') });
      return { ok: true, message };
    };
    const handleCollapseUnavailableActivation = (p, c, r, s) => failClosedCollapsedTitleList(p, c, r, s);
    function failClosedCollapsedTitleList(pageNum, chatId, readiness, source) {
      if (explicitCollapseFeedbackSource(source)) showCollapseUnavailableFeedback(pageNum, chatId, readiness);
      return { ok: false, status: 'collapsed-exact-boundary-unavailable' };
    }
    const syncSyntheticTitleList = () => ({ ok: true });

    ${body}
    ${keyboard}

    const _eval = evaluatePageCollapseCapability;
    evaluatePageCollapseCapability = (n, o) => { calls.capability += 1; const r = _eval(n, o); if (o && o.includePlan && r && r.plan) calls.plans += 1; return r; };
    const _prep = prepareDetachedPageTitleList;
    prepareDetachedPageTitleList = (plan) => { calls.preparations += 1; return _prep(plan); };
    const onDividerDotClick = ${clickArrow};
    S.onDividerDotClick = onDividerDotClick;

    return Object.freeze({
      boundary: getRenderedPageBoundaryCapability,
      range: (n) => getPageCollapseRangeDiagnostics(n),
      capability: (n) => getPageCollapseCapability(n),
      click: onDividerDotClick,
      keyboard: typeof forwardCollapseControlKeyboardActivation === 'function' ? forwardCollapseControlKeyboardActivation : null,
      diagnostic: typeof getAtomicPageCollapseTransactionDiagnostic === 'function' ? getAtomicPageCollapseTransactionDiagnostic : null,
      tail: typeof resolveFinalPageTailAuthority === 'function' ? resolveFinalPageTailAuthority : null,
      terminal: typeof readFinalPageTerminalRecord === 'function' ? readFinalPageTerminalRecord : null,
      authority: readRenderedBoundaryAuthority,
      expandAll: typeof expandAllAtomicPageCollapses === 'function' ? expandAllAtomicPageCollapses : null,
      reconcile: typeof reconcileAtomicPageCollapseTransactions === 'function' ? reconcileAtomicPageCollapseTransactions : null,
    });
  })()`, ctx);

  for (let page = 1; page <= pageCount; page += 1) api.boundary(page);

  const clickPage = (page, source = 'chat-page-divider:circle') => api.click({
    target: units.dots.get(page), detail: 1, h2oActivationSource: source,
    preventDefault() {}, stopPropagation() {},
  });
  const stamps = () => flow.querySelectorAll('[data-cgxui-chat-page-native-hidden]');
  const lists = () => thread.querySelectorAll('[data-cgxui="chat-page-title-list-synth"]');

  return {
    api, flow, thread, units, records, count, pageSize, pageCount, composer,
    hostWrappersByPage, hostCountFor: (p) => (hostWrappersByPage.get(p) || []).length,
    rowCountFor: (p) => Math.min(p * pageSize, count) - (((p - 1) * pageSize) + 1) + 1,
    clickPage, stamps, lists, S, status, safety, minimapCalls, minimapCollapsed,
    calls: ctx.injectedCalls,
    setMiniMapDirect: (page, collapsed) => {
      // Direct MiniMap owner call — the isolated surface, not the Chat origin.
      minimapCalls.push({ pageNum: page, collapsed, source: 'minimap:direct' });
      if (collapsed) minimapCollapsed.add(page); else minimapCollapsed.delete(page);
    },
  };
}

// ── 1-2: parent reproduction ──────────────────────────────────────────────
await fixture('1 parent rejects the single-page final page (18 turns)', () => {
  const h = createHarness({ productionSource: PARENT, count: 18 });
  const range = h.api.range(1);
  equal(range.supported, false, 'range refused');
  equal(range.reason, 'final-page-end-authority-unavailable', 'final-page rejection');
  const cap = h.api.capability(1);
  equal(cap.activationReady, false, 'not activation ready');
  equal(cap.productReason, 'layout-incomplete', 'layout-incomplete surfaced');
  h.clickPage(1);
  equal(h.stamps().length, 0, 'zero stamps');
  equal(h.lists().length, 0, 'zero title lists');
});

await fixture('2 parent rejects the final page of a multi-page chat (39 turns, page 2)', () => {
  const h = createHarness({ productionSource: PARENT, count: 39 });
  equal(h.pageCount, 2, 'two pages');
  const range = h.api.range(2);
  equal(range.supported, false, 'range refused');
  equal(range.reason, 'final-page-end-authority-unavailable', 'no page 3 boundary');
  equal(h.api.capability(2).activationReady, false, 'page 2 not activation ready');
  h.clickPage(2);
  equal(h.stamps().length, 0, 'zero stamps');
});

// ── 3-20: corrected tail authority ────────────────────────────────────────
await fixture('3 corrected single-page final range is proven', () => {
  const h = createHarness({ count: 18 });
  const range = h.api.range(1);
  equal(range.supported, true, 'supported');
  equal(range.rangeProven, true, 'range proven');
  equal(range.isFinalPage, true, 'final page');
  equal(range.finalTailSupported, true, 'tail supported');
  equal(range.hostWrapperCount, h.hostCountFor(1), 'derived host count');
  equal(range.ambiguousWrapperCount, 0, 'no ambiguity');
});

await fixture('4 corrected final page of a multi-page chat is proven', () => {
  const h = createHarness({ count: 39 });
  const range = h.api.range(2);
  equal(range.supported, true, 'supported');
  equal(range.isFinalPage, true, 'final');
  equal(range.hostWrapperCount, h.hostCountFor(2), 'derived host count');
});

await fixture('5-7 terminal identity comes from the authoritative final row', () => {
  const h = createHarness({ count: 18 });
  const auth = h.api.authority(1);
  const withAnswer = h.api.terminal(18, auth);
  equal(withAnswer.ok, true, 'resolved');
  equal(withAnswer.terminalOrder, 18, 'exact final order');
  equal(withAnswer.terminalKind, 'answer', 'primaryAId used when accepted');
  equal(withAnswer.terminalId, 'a-18', 'primary answer identity');
  const noAns = createHarness({ count: 18, noAnswerOrders: [18] });
  const t2 = noAns.api.terminal(18, noAns.api.authority(1));
  equal(t2.terminalKind, 'question', 'qId used for NO ANSWER');
  equal(t2.terminalId, 'q-18', 'question identity');
  equal(noAns.api.range(1).supported, true, 'NO ANSWER final page still proven');
});

await fixture('8-12 tail proof requires graph-current wrapper, sentinel and ordering', () => {
  const h = createHarness({ count: 18 });
  const auth = h.api.authority(1);
  const tail = h.api.tail(1, 18, auth, h.flow);
  equal(tail.ok, true, 'tail proven');
  equal(tail.terminalIdentityCurrent, true, 'identity current');
  equal(tail.terminalWrapperCurrent, true, 'wrapper current');
  equal(tail.pageEndSentinelCurrent, true, 'sentinel current');
  equal(tail.endExclusive, h.units.sentinels.get('1:end'), 'sentinel is the delimiter');
  equal(tail.endExclusive.parentElement, h.flow, 'sentinel is a direct flow child');
});

await fixture('13 only H2O nodes may sit between terminal and sentinel', () => {
  const h = createHarness({ count: 18, interveningKind: 'h2o' });
  equal(h.api.range(1).supported, true, 'H2O intervening node allowed');
});

await fixture('14 intervening host node blocks the final range', () => {
  const h = createHarness({ count: 18, interveningKind: 'host' });
  const range = h.api.range(1);
  equal(range.supported, false, 'blocked');
  equal(range.reason, 'final-page-tail-unproven', 'tail unproven');
  h.clickPage(1);
  equal(h.stamps().length, 0, 'zero stamps');
});

await fixture('15 intervening ambiguous node blocks the final range', () => {
  const h = createHarness({ count: 18, interveningKind: 'ambiguous' });
  equal(h.api.range(1).supported, false, 'blocked');
  equal(h.api.range(1).reason, 'final-page-tail-unproven', 'tail unproven');
});

await fixture('16 the sentinel alone cannot prove the tail', () => {
  const h = createHarness({ count: 18, endSentinelBeforeTerminal: true });
  const range = h.api.range(1);
  equal(range.supported, false, 'mis-placed sentinel refused');
  equal(range.reason, 'final-page-tail-unproven', 'tail unproven');
  equal(range.pageEndSentinelCurrent, true, 'sentinel exists yet is not sufficient');
  const missing = createHarness({ count: 18, omitEndSentinel: true });
  equal(missing.api.range(1).supported, false, 'absent sentinel refused');
});

await fixture('17-18 raw flow end and composer are never the authority', () => {
  const source = extractFunction(SOURCE, 'resolveFinalPageTailAuthority')
    + extractFunction(SOURCE, 'readFinalPageTerminalRecord')
    + extractFunction(SOURCE, 'resolveFinalPageTerminalWrapper');
  ok(!/children\.length/.test(source), 'no raw child-count authority');
  ok(!/lastElementChild|children\[children\.length/.test(source), 'no last-child authority');
  ok(!/composer|form|contenteditable/i.test(source), 'composer never consulted');
  ok(!/conversation-turn-/.test(source), 'no test-id arithmetic');
  ok(!/Math\.ceil\(|\*\s*2\b/.test(source), 'no ordinal or pairCount inference');
  const h = createHarness({ count: 18 });
  h.clickPage(1);
  equal(h.composer.hasAttribute('data-cgxui-chat-page-native-hidden'), false, 'composer unstamped');
});

await fixture('19-20 sentinel and everything after it are excluded from the hide set', () => {
  const h = createHarness({ count: 18 });
  h.clickPage(1);
  const sentinel = h.units.sentinels.get('1:end');
  equal(sentinel.hasAttribute('data-cgxui-chat-page-native-hidden'), false, 'sentinel unstamped');
  const children = h.flow.children;
  const sIdx = children.indexOf(sentinel);
  const after = children.slice(sIdx).filter((n) => n.hasAttribute('data-cgxui-chat-page-native-hidden'));
  equal(after.length, 0, 'nothing at or after the sentinel is stamped');
});

// ── 21-26: capability ─────────────────────────────────────────────────────
await fixture('21-22 final-page capabilities become activation ready', () => {
  const a = createHarness({ count: 18 });
  const capA = a.api.capability(1);
  equal(capA.supported, true, 'supported');
  equal(capA.productReason, 'ready', 'ready');
  equal(capA.prerequisitesReady, true, 'prerequisites');
  equal(capA.activationReady, true, 'activation ready');
  equal(capA.activationBlockReason, null, 'no block reason');
  equal(capA.atomicTransactionImplemented, true, 'atomic implemented');
  equal(capA.isFinalPage, true, 'final page flagged');
  const b = createHarness({ count: 39 });
  const capB = b.api.capability(2);
  equal(capB.activationReady, true, 'page 2 ready');
  equal(capB.isFinalPage, true, 'page 2 final');
});

await fixture('23 non-final page 1 of a 39-turn chat is unchanged', () => {
  const h = createHarness({ count: 39 });
  const cap = h.api.capability(1);
  equal(cap.activationReady, true, 'ready');
  equal(cap.isFinalPage, false, 'not final');
  equal(cap.titleRowCount, h.rowCountFor(1), 'derived rows');
  equal(cap.hostWrapperCount, h.hostCountFor(1), 'derived hosts');
  equal(h.api.range(1).finalTailSupported, false, 'no tail path used');
});

await fixture('24-25 title-row counts come from the current page model', () => {
  const a = createHarness({ count: 18 });
  equal(a.api.capability(1).titleRowCount, a.rowCountFor(1), '18-turn page 1 rows');
  equal(a.api.capability(1).titleRowCount, 18, '18 rows');
  const b = createHarness({ count: 39 });
  equal(b.api.capability(2).titleRowCount, b.rowCountFor(2), '39-turn page 2 rows');
  equal(b.api.capability(2).titleRowCount, 14, '14 rows');
});

await fixture('26 host counts are derived, never hard-coded', () => {
  const small = createHarness({ count: 7 });
  equal(small.api.capability(1).hostWrapperCount, small.hostCountFor(1), 'derived for 7 turns');
  const noAns = createHarness({ count: 9, noAnswerOrders: [3, 9] });
  equal(noAns.api.capability(1).hostWrapperCount, noAns.hostCountFor(1), 'derived with NO ANSWER rows');
});

// ── 27-35: atomic transaction ─────────────────────────────────────────────
await fixture('27-31 final collapse commits once and stamps exactly the planned hosts', () => {
  const h = createHarness({ count: 18 });
  h.clickPage(1);
  const d = h.api.diagnostic();
  equal(d.result, 'committed', 'committed');
  equal(d.capabilityEvaluations, 1, 'one capability evaluation');
  equal(d.rangePlansBuilt, 1, 'one range plan');
  equal(d.detachedListsPrepared, 1, 'one detached list');
  equal(d.firstWriteReached, true, 'first write');
  equal(d.wrappersPlanned, h.hostCountFor(1), 'planned equals derived hosts');
  equal(d.wrappersStamped, d.wrappersPlanned, 'stamped equals planned');
  equal(d.titleRowsPrepared, h.rowCountFor(1), 'rows equal page model');
  equal(d.syntheticListsInserted, 1, 'one list');
  equal(d.rollbackPerformed, false, 'no rollback');
  equal(h.stamps().length, h.hostCountFor(1), 'dom stamps match');
  for (const unit of [h.units.sentinels.get('1:start'), h.units.sentinels.get('1:end'), h.units.dividers.get(1)]) {
    equal(unit.hasAttribute('data-cgxui-chat-page-native-hidden'), false, 'H2O node unstamped');
  }
  equal(h.composer.hasAttribute('data-cgxui-chat-page-native-hidden'), false, 'composer unstamped');
});

await fixture('32-33 expansion releases every stamp and is idempotent', () => {
  const h = createHarness({ count: 18 });
  h.clickPage(1);
  h.clickPage(1);
  equal(h.api.diagnostic().result, 'expanded', 'expanded');
  equal(h.stamps().length, 0, 'no stamps');
  equal(h.lists().length, 0, 'no lists');
  h.clickPage(1);
  h.clickPage(1);
  equal(h.stamps().length, 0, 'still expanded after a further cycle');
  equal(h.S.atomicPageCollapseTransactions.size, 0, 'no leaked transactions');
});

await fixture('34 five final-page cycles are stable', () => {
  const h = createHarness({ count: 18 });
  for (let i = 0; i < 5; i += 1) {
    h.clickPage(1);
    equal(h.stamps().length, h.hostCountFor(1), `cycle ${i} collapsed`);
    equal(h.lists().length, 1, `cycle ${i} one list`);
    h.clickPage(1);
    equal(h.stamps().length, 0, `cycle ${i} expanded`);
    equal(h.lists().length, 0, `cycle ${i} list removed`);
  }
});

await fixture('35 reload begins expanded', () => {
  const h = createHarness({ count: 18 });
  h.clickPage(1);
  equal(h.stamps().length, h.hostCountFor(1), 'collapsed');
  const reloaded = createHarness({ count: 18 });
  equal(reloaded.stamps().length, 0, 'fresh load has no stamps');
  equal(reloaded.lists().length, 0, 'fresh load has no title list');
  equal(reloaded.S.atomicPageCollapseTransactions.size, 0, 'no transactions restored');
});

// ── 36-39: branch lifecycle ───────────────────────────────────────────────
await fixture('36-38 39 to 18 expands the old transaction without auto-collapsing', () => {
  const h = createHarness({ count: 39 });
  h.clickPage(1);
  equal(h.stamps().length, h.hostCountFor(1), 'collapsed on 39');
  // Branch shrink: the effective scope changes underneath the transaction.
  h.status.count = 18;
  h.status.canonicalFingerprint = 'djb2:effective-18';
  h.api.expandAll('branch-change');
  equal(h.stamps().length, 0, 'zero stranded stamps');
  equal(h.lists().length, 0, 'no stranded title list');
  equal(h.S.atomicPageCollapseTransactions.size, 0, 'no transaction survives');
  const fresh = createHarness({ count: 18 });
  equal(fresh.stamps().length, 0, 'new branch does not auto-collapse');
  equal(fresh.api.capability(1).activationReady, true, 'new branch is manually collapse-ready');
});

await fixture('39 18 to 39 expands safely and reacquires capability', () => {
  const h = createHarness({ count: 18 });
  h.clickPage(1);
  h.status.count = 39;
  h.status.canonicalFingerprint = 'djb2:effective-39';
  h.api.expandAll('branch-change');
  equal(h.stamps().length, 0, 'no stranded stamps');
  const grown = createHarness({ count: 39 });
  equal(grown.stamps().length, 0, 'no auto-collapse after growth');
  equal(grown.api.capability(1).activationReady, true, 'fresh capability');
});

// ── 40-44: Chat -> MiniMap one-way sync ───────────────────────────────────
await fixture('40-41 Chat Page Divider collapse and expansion drive the MiniMap page', () => {
  const h = createHarness({ count: 18 });
  h.clickPage(1);
  equal(h.minimapCollapsed.has(1), true, 'minimap page collapsed');
  const collapseCalls = h.minimapCalls.filter((c) => c.collapsed === true);
  equal(collapseCalls.length, 1, 'exactly one propagation');
  equal(collapseCalls[0].source, 'chat-page-divider:atomic-transaction', 'origin marked');
  h.clickPage(1);
  equal(h.minimapCollapsed.has(1), false, 'minimap page expanded');
  equal(h.minimapCalls.filter((c) => c.collapsed === false).length, 1, 'one expansion propagation');
});

await fixture('42-43 direct MiniMap actions never touch the Chat page', () => {
  const h = createHarness({ count: 18 });
  h.setMiniMapDirect(1, true);
  equal(h.minimapCollapsed.has(1), true, 'minimap collapsed');
  equal(h.stamps().length, 0, 'chat page untouched');
  equal(h.lists().length, 0, 'no chat title list');
  equal(h.S.atomicPageCollapseTransactions.size, 0, 'no chat transaction');
  h.setMiniMapDirect(1, false);
  equal(h.minimapCollapsed.has(1), false, 'minimap expanded');
  equal(h.stamps().length, 0, 'chat still untouched');
});

await fixture('44 no cross-surface recursion', () => {
  const h = createHarness({ count: 18 });
  h.clickPage(1);
  equal(h.minimapCalls.length, 1, 'one call per chat transaction');
  const owner = extractFunction(SOURCE, 'propagateChatPageCollapseToMiniMap');
  ok(!/collapsePageWithRenderedBoundaries|expandPageWithRenderedBoundaries|executeAtomic/.test(owner), 'propagation never re-enters the chat transaction');
});

// ── 45-52: prohibitions and contracts ─────────────────────────────────────
await fixture('45-47 collapse performs no persistence, navigation, network, timers or observers', () => {
  const h = createHarness({ count: 18 });
  h.clickPage(1);
  equal(h.safety.storage, 0, 'no storage writes');
  equal(h.safety.network, 0, 'no network');
  equal(h.safety.navigation, 0, 'no navigation');
  equal(h.safety.timers, 0, 'no timers');
  equal(h.safety.observers, 0, 'no observers');
  const owner = extractFunction(SOURCE, 'collapsePageWithRenderedBoundaries')
    + extractFunction(SOURCE, 'resolveFinalPageTailAuthority');
  ok(!/setTimeout|setInterval|requestAnimationFrame|MutationObserver/.test(owner), 'no scheduling primitives');
  ok(!/localStorage|sessionStorage/.test(owner), 'no storage');
});

await fixture('48-49 no host removal or movement, page units stay in 1A1b', () => {
  const h = createHarness({ count: 18 });
  const before = h.flow.children.slice();
  h.clickPage(1);
  const after = h.flow.children.slice();
  const hostsBefore = before.filter((n) => n.hasAttribute('data-turn-id-container'));
  const hostsAfter = after.filter((n) => n.hasAttribute('data-turn-id-container'));
  equal(hostsAfter.length, hostsBefore.length, 'no host added or removed');
  equal(hostsAfter.every((n, i) => n === hostsBefore[i]), true, 'host order unchanged');
  equal(h.units.sentinels.get('1:end').parentElement, h.flow, 'end sentinel not moved out');
  const tailSource = extractFunction(SOURCE, 'resolveFinalPageTailAuthority');
  ok(!/insertBefore|appendChild|removeChild|\.remove\(/.test(tailSource), 'tail authority never moves nodes');
});

await fixture('50-51 graph bridge and transaction diagnostic remain available and safe', () => {
  const h = createHarness({ count: 18 });
  equal(typeof h.api.diagnostic, 'function', 'diagnostic present');
  h.clickPage(1);
  const d = h.api.diagnostic();
  const seen = new Set();
  const walk = (v) => {
    if (!v || typeof v !== 'object' || seen.has(v)) return;
    seen.add(v);
    ok(Object.isFrozen(v), 'frozen');
    for (const child of Object.values(v)) {
      ok(!(child && typeof child === 'object' && typeof child.getAttribute === 'function'), 'no DOM node');
      walk(child);
    }
  };
  walk(d);
  const json = JSON.stringify(d);
  for (const forbidden of ['q-1', 'a-18', 'q-18', '<div']) ok(!json.includes(forbidden), `no leaked ${forbidden}`);
  ok(h.api.capability(1).graphFingerprint.length > 0, 'graph bridge consumed');
});

await fixture('52 a valid final page is never reported as an incomplete layout', () => {
  const h = createHarness({ count: 18 });
  equal(h.api.capability(1).productReason, 'ready', 'ready, not layout-incomplete');
  h.clickPage(1);
  equal(h.calls.feedback.length, 0, 'no unavailable feedback shown');
  equal(h.api.diagnostic().result, 'committed', 'committed');
  // A genuinely unproven tail still fails closed, with a non-technical reason.
  const blocked = createHarness({ count: 18, interveningKind: 'host' });
  equal(blocked.api.capability(1).productReason, 'page-loading', 'non-technical product reason');
  const allowed = ['page-loading', 'page-updating', 'layout-incomplete', 'unsupported-layout'];
  ok(allowed.includes(blocked.api.capability(1).productReason), 'reason is in the allowed set');
});

// ── 53: the narrow 1A1b page-end sentinel anchor correction ───────────────
// Source-proven need: resolveChatPageExactArtifact tries questionId first, so
// for a final row with an accepted answer the generic tail resolved to the
// question wrapper and the end sentinel landed between that question and its
// own answer — which the tail proof correctly refuses. The end anchor now
// resolves the terminal row by answer identity. Only H2O nodes move.
const CORE_PATH = 'src-runtime-base/1A1b.🟥🗺️ MiniMap Core 🧱🗺️.js';
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
const CORE_PARENT = execFileSync('git', ['show', `${PARENT_SHA}:${CORE_PATH}`], {
  cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
});

await fixture('53 final page-end sentinel anchors after the exact terminal wrapper', () => {
  const parentAnchor = extractFunction(CORE_PARENT, 'resolveChatPageBoundaryAnchor');
  ok(!parentAnchor.includes('resolveChatPageTerminalArtifact'), 'parent used the generic tail');
  ok(!CORE_PARENT.includes('function resolveChatPageTerminalArtifact('), 'parent had no terminal resolver');

  const anchor = extractFunction(CORE_SOURCE, 'resolveChatPageBoundaryAnchor');
  ok(anchor.includes('resolveChatPageTerminalArtifact'), 'end anchor consults the terminal artifact');

  // Behavioural proof: the resolver asks for the ANSWER identity of the last
  // row, and defers to the generic tail when the row has no accepted answer.
  const asked = [];
  const api = vm.runInNewContext(`(() => {
    const resolveChatPageExactArtifact = (turn) => {
      injectedAsked.push(turn);
      return turn && (turn.answerId || turn.primaryAId)
        ? { section: 'answer-section', wrapper: 'answer-wrapper' }
        : null;
    };
    ${extractFunction(CORE_SOURCE, 'resolveChatPageTerminalArtifact')}
    return { resolve: resolveChatPageTerminalArtifact };
  })()`, { injectedAsked: asked });

  const withAnswer = api.resolve({ records: [{ order: 17, turn: { qId: 'q-17', primaryAId: 'a-17' } }, { order: 18, turn: { qId: 'q-18', primaryAId: 'a-18' } }] });
  equal(withAnswer.wrapper, 'answer-wrapper', 'terminal wrapper is the answer wrapper');
  equal(asked.length, 1, 'one resolution');
  equal(asked[0].answerId, 'a-18', 'asked for the last row answer identity');
  ok(!('questionId' in asked[0]), 'question identity never offered first');

  const noAnswer = api.resolve({ records: [{ order: 18, turn: { qId: 'q-18', primaryAId: '' } }] });
  equal(noAnswer, null, 'NO ANSWER row defers to the generic tail');
  equal(api.resolve({ records: [] }), null, 'empty page defers');

  // The correction moves only an H2O sentinel, never a host wrapper.
  const fn = extractFunction(CORE_SOURCE, 'resolveChatPageTerminalArtifact');
  ok(!/insertBefore|appendChild|removeChild|\.remove\(/.test(fn), 'terminal resolver moves nothing');
});

const failed = fixtures.filter((f) => !f.ok);
console.log(`\nCV-3.28 fixtures ${fixtures.length - failed.length}/${fixtures.length} assertions ${assertions}`);
if (failed.length) { for (const f of failed) console.error(`FAILED ${f.name}`); process.exit(1); }
