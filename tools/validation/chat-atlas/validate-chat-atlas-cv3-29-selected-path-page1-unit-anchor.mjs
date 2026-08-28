#!/usr/bin/env node
// CV-3.29 — selected-path Page 1 unit anchor.
//
// The immutable parent c9110c1a skipped Page 1 in
// resolveRenderedBoundaryPageUnitAnchor (`pageNum <= 1` returned
// {applicable:false}), so Page 1 never consumed rendered-boundary authority and
// fell through to mounted-artifact fallbacks. On a canonical 39-turn layout the
// fallback coincidentally resolved the same node, which is why the defect stayed
// hidden. On an 18-turn selected-path projection the exact order-1 wrapper sits
// at an early flow index while the fallbacks left the Page 1 start sentinel and
// divider near the tail — after the wrapper they must precede.
//
// A second defect made the failure invisible: reconcileChatPageUnits computed
// `settled` from divider ascending order alone, and a single page is trivially
// ascending, so the document reported settled while placement was wrong.
//
// Every fixture runs real production bodies from 1A1b and 1C1b.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const CORE_PATH = 'src-runtime-base/1A1b.🟥🗺️ MiniMap Core 🧱🗺️.js';
const PAGE_PATH = 'src-runtime-base/1C1b.🔴📑 Thread Pages Controller 📑.js';
const PARENT_SHA = 'c9110c1af1edc1f3cb1c063af2a2b820af848049';
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
const PAGE_SOURCE = fs.readFileSync(path.join(ROOT, PAGE_PATH), 'utf8');
const CORE_PARENT = execFileSync('git', ['show', `${PARENT_SHA}:${CORE_PATH}`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const PAGE_PARENT = execFileSync('git', ['show', `${PARENT_SHA}:${PAGE_PATH}`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

const CHAT_ID = 'chat-selected-path';
const ROUTE_KEY = '/c/chat-selected-path';
const EFFECTIVE_FP = 'djb2:15jcf17';
const GRAPH_FP = 'djb2:1yue4v7';

let assertions = 0;
const fixtures = [];
function equal(a, b, m) { assertions += 1; assert.deepEqual(a, b, m); }
function ok(v, m) { assertions += 1; assert.ok(v, m); }
async function fixture(name, run) {
  try { await run(); fixtures.push({ name, ok: true }); console.log(`PASS ${name}`); }
  catch (e) { fixtures.push({ name, ok: false, error: String(e?.stack || e) }); console.error(`FAIL ${name}\n${String(e?.stack || e)}`); }
}
function extractFunction(source, name) {
  const anchor = `  function ${name}(`;
  const start = source.indexOf(anchor);
  if (start < 0 || source.indexOf(anchor, start + anchor.length) >= 0) throw new Error(`function-anchor-invalid:${name}`);
  const bodyStart = source.indexOf('{', source.indexOf(')', start));
  let d = 0, q = '', esc = false, lc = false, bc = false;
  for (let i = bodyStart; i < source.length; i += 1) {
    const c = source[i], n = source[i + 1];
    if (lc) { if (c === '\n') lc = false; continue; }
    if (bc) { if (c === '*' && n === '/') { bc = false; i += 1; } continue; }
    if (q) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === q) q = ''; continue; }
    if (c === '/' && n === '/') { lc = true; i += 1; continue; }
    if (c === '/' && n === '*') { bc = true; i += 1; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if (c === '{') d += 1;
    else if (c === '}' && --d === 0) return source.slice(start, i + 1);
  }
  throw new Error(`function-boundary-invalid:${name}`);
}

// ── DOM with real connection semantics ────────────────────────────────────
function parts(sel) { return String(sel || '').split(',').map(s => s.trim()).filter(Boolean); }
function matchOne(node, sel) {
  const t = String(sel || '').trim();
  const tag = t.match(/^([a-zA-Z]+)/);
  if (tag && String(node.tagName).toUpperCase() !== tag[1].toUpperCase()) return false;
  for (const c of Array.from(t.matchAll(/\.([A-Za-z0-9_-]+)/g)).map(m => m[1])) {
    if (!String(node.className || '').split(/\s+/).includes(c)) return false;
  }
  for (const m of t.matchAll(/#([A-Za-z0-9_-]+)/g)) if (node.getAttribute('id') !== m[1]) return false;
  for (const m of t.matchAll(/\[([^\]=^]+)(\^?)=?"?([^"\]]*)"?\]/g)) {
    const name = m[1].trim(), caret = m[2] === '^', want = m[3];
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
    this.tagName = String(tag).toUpperCase(); this.nodeType = 1; this.className = className;
    this.children = []; this.parentElement = null; this.attrs = new Map(); this.isConnected = false;
    this.style = { _v: new Map(), setProperty(k, v) { this._v.set(k, v); }, removeProperty(k) { this._v.delete(k); }, getPropertyValue(k) { return this._v.get(k) || ''; } };
  }
  addEventListener() {} removeEventListener() {}
  get id() { return this.getAttribute('id') || ''; } set id(v) { this.setAttribute('id', v); }
  get parentNode() { return this.parentElement; }
  setAttribute(n, v) { this.attrs.set(String(n), String(v)); }
  getAttribute(n) { return this.attrs.has(String(n)) ? this.attrs.get(String(n)) : null; }
  hasAttribute(n) { return this.attrs.has(String(n)); }
  removeAttribute(n) { this.attrs.delete(String(n)); }
  get classList() { const self = this; return { contains: (c) => String(self.className || '').split(/\s+/).includes(c), add: (c) => { if (!self.classList.contains(c)) self.className = `${self.className} ${c}`.trim(); }, remove: () => {} }; }
  _conn(v) { this.isConnected = v; for (const c of this.children) c._conn(v); }
  appendChild(c) { if (c.parentElement) c.parentElement.removeChild(c); c.parentElement = this; this.children.push(c); c._conn(this.isConnected); return c; }
  insertBefore(c, ref) { if (c.parentElement) c.parentElement.removeChild(c); c.parentElement = this; const i = ref ? this.children.indexOf(ref) : -1; if (i < 0) this.children.push(c); else this.children.splice(i, 0, c); c._conn(this.isConnected); return c; }
  removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); c.parentElement = null; c._conn(false); return c; }
  remove() { if (this.parentElement) this.parentElement.removeChild(this); }
  get nextSibling() { const p = this.parentElement; if (!p) return null; return p.children[p.children.indexOf(this) + 1] || null; }
  get firstElementChild() { return this.children[0] || null; }
  matches(sel) { return parts(sel).some(p => matchOne(this, p)); }
  closest(sel) { let n = this; while (n) { if (n.matches(sel)) return n; n = n.parentElement; } return null; }
  querySelectorAll(sel) { const out = []; const w = (n) => { for (const c of n.children) { if (c.matches(sel)) out.push(c); w(c); } }; w(this); return out; }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  contains(o) { let n = o; while (n) { if (n === this) return true; n = n.parentElement; } return false; }
  getBoundingClientRect() { return { top: 100, bottom: 127, height: 27 }; }
  compareDocumentPosition(other) {
    const root = (n) => { let c = n; while (c.parentElement) c = c.parentElement; return c; };
    const flat = []; const w = (n) => { flat.push(n); for (const c of n.children) w(c); }; w(root(this));
    return flat.indexOf(other) > flat.indexOf(this) ? 4 : 2;
  }
}

function wrapperFor(id, role, testId, mounted) {
  const w = new El('DIV', 'host-turn-slot');
  w.setAttribute('data-turn-id-container', id);
  if (mounted) {
    const h = new El('SECTION', 'native-turn-host'); h.setAttribute('data-testid', testId);
    const c = new El('SECTION', 'identity-carrier'); c.setAttribute('data-turn-id', id); c.setAttribute('data-turn', role);
    h.appendChild(c); w.appendChild(h);
  }
  return w;
}

// options: { count, pageSize, mountBoundary, misplaceStartUnits, coreSource }
function createHarness(options = {}) {
  const coreSource = options.coreSource || CORE_SOURCE;
  const pageSource = options.pageSource || PAGE_SOURCE;
  const count = Number(options.count || 18);
  const pageSize = Number(options.pageSize || 25);
  const pageCount = Math.max(1, Math.ceil(count / pageSize));
  const qId = (o) => `q-sel-${o}`;
  const aId = (o) => `a-sel-${o}`;

  const thread = new El('DIV', 'thread'); thread.setAttribute('id', 'thread'); thread.isConnected = true;
  const flow = new El('DIV', 'active-flow'); thread.appendChild(flow);

  const records = [];
  const graph = new Map();
  for (let o = 1; o <= count; o += 1) {
    records.push({ order: o, qId: qId(o), primaryAId: aId(o), answerVariants: [aId(o)], noAnswer: false, stopped: false, livePendingStreaming: false });
    graph.set(qId(o), { productUser: true, productAnswer: false });
    graph.set(aId(o), { productUser: false, productAnswer: true });
  }

  // Three leading H2O/helper children, then the host wrappers. The selected
  // path's exact order-1 wrapper therefore sits at an early — but not zeroth —
  // direct-flow index, exactly as the live 18-turn branch reported.
  const lead = [];
  for (let i = 0; i < 3; i += 1) { const n = new El('DIV', i === 0 ? 'minimap-root' : 'helper-node'); if (i === 0) n.setAttribute('id', 'cgx-mm-root'); else n.setAttribute('data-cgxui-owner', 'mnmp'); flow.appendChild(n); lead.push(n); }

  const hostWrappers = [];
  let testNo = 0;
  for (let o = 1; o <= count; o += 1) {
    testNo += 1;
    const mounted = options.mountBoundary === true ? true : (o !== 1);
    const qw = wrapperFor(qId(o), 'user', `conversation-turn-${testNo}`, mounted);
    flow.appendChild(qw); hostWrappers.push(qw);
    testNo += 1;
    const aw = wrapperFor(aId(o), 'assistant', `conversation-turn-${testNo}`, true);
    flow.appendChild(aw); hostWrappers.push(aw);
  }

  // Page units. The parent layout retains the Page 1 start units near the tail,
  // which is exactly what the live 18-turn selected path reported.
  const units = { sentinels: new Map(), dividers: new Map() };
  const mkSentinel = (page, kind) => {
    const n = new El('SPAN', 'h2o-page-boundary');
    n.setAttribute('data-h2o-chat-page-boundary', `page-${page}-${kind}`);
    n.setAttribute('data-h2o-chat-page-boundary-page', String(page));
    n.setAttribute('data-h2o-chat-page-boundary-kind', kind);
    n.setAttribute('data-cgxui-owner', 'mnmp');
    return n;
  };
  const mkDivider = (page) => {
    const n = new El('DIV', 'cgxui-chat-page-divider');
    n.setAttribute('data-page-num', String(page));
    n.setAttribute('data-cgxui-owner', 'mnmp');
    n.setAttribute('data-cgxui-chat-page-divider', '1');
    const dot = new El('SPAN', 'cgxui-chat-page-divider-dot');
    n.appendChild(dot);
    return n;
  };
  const wrapperOfOrder = (o) => hostWrappers[(o - 1) * 2];
  for (let p = 1; p <= pageCount; p += 1) {
    const s = mkSentinel(p, 'start');
    const d = mkDivider(p);
    units.sentinels.set(`${p}:start`, s);
    units.dividers.set(p, d);
    const pageStartWrapper = wrapperOfOrder(((p - 1) * pageSize) + 1);
    if (p === 1 && options.misplaceStartUnits !== false) {
      const tailAnchor = hostWrappers[hostWrappers.length - 3];
      flow.insertBefore(s, tailAnchor);
      flow.insertBefore(d, tailAnchor);
    } else {
      flow.insertBefore(s, pageStartWrapper);
      flow.insertBefore(d, pageStartWrapper);
    }
    const e = mkSentinel(p, 'end');
    units.sentinels.set(`${p}:end`, e);
    const pageEndOrder = Math.min(p * pageSize, count);
    const terminal = hostWrappers[((pageEndOrder - 1) * 2) + 1];
    flow.insertBefore(e, terminal.nextSibling || null);
    if (p === pageCount && options.tailInterveningKind === 'ambiguous') {
      flow.insertBefore(new El('DIV', 'mystery-node'), e);
    }
  }
  const startSentinel = units.sentinels.get('1:start');
  const divider = units.dividers.get(1);
  const endSentinel = units.sentinels.get(`${pageCount}:end`);
  const composer = new El('FORM', 'composer'); flow.appendChild(composer);

  const status = {
    source: 'selected-path-overlay', overlayActive: true, count,
    canonicalFingerprint: EFFECTIVE_FP, chatId: CHAT_ID, routeKey: ROUTE_KEY, generation: 2, pathLength: count,
  };
  const projection = { authoritative: true, chatId: CHAT_ID, routeGeneration: 2, fingerprint: EFFECTIVE_FP, selectedPathConfirmationPending: false, selectedPathConfirmationLeaseActive: false, selectedPathRequestLeaseActive: false };
  const runtime = {
    getEffectivePresentationStatus: () => Object.freeze({ ...status }),
    getEffectivePresentationIndex: () => Object.freeze({ complete: true, sourceFingerprint: status.canonicalFingerprint, turns: records.map(r => Object.freeze({ ...r })) }),
    getCompleteTurnIndexProjectionStatus: () => Object.freeze({ ...projection, fingerprint: status.canonicalFingerprint }),
    getEffectiveTurnRecordByQId: (id) => records.find(r => r.qId === id) || null,
    getGraphIdentityDiagnostics: (ids) => Object.freeze({
      available: true, reason: null,
      scope: Object.freeze({ chatId: CHAT_ID, routeKey: ROUTE_KEY, generation: 2, fingerprint: GRAPH_FP }),
      records: Object.freeze((Array.isArray(ids) ? ids : []).map(id => Object.freeze({ requestedId: id, found: graph.has(id), productUser: graph.get(id)?.productUser === true, productAnswer: graph.get(id)?.productAnswer === true }))),
    }),
  };

  const document = {
    createElement: (t) => new El(t),
    querySelectorAll: (sel) => (thread.matches(sel) ? [thread] : []).concat(thread.querySelectorAll(sel)),
    querySelector: (sel) => ((thread.matches(sel) ? [thread] : []).concat(thread.querySelectorAll(sel)))[0] || null,
    documentElement: new El('HTML'),
    body: thread,
    scrollingElement: null,
  };
  document.documentElement.isConnected = true;

  const pageState = {
    renderedPageBoundaryLeases: new Map(), pageCollapseRangeContinuity: new Map(),
    atomicPageCollapseTransactions: new Map(), atomicPageCollapseGuards: new Set(),
    atomicPageCollapseAttemptSeq: 0, atomicPageCollapseLastAttempt: null,
    nativeRangeActivePages: new Set(), collapsedBoundaryDiagnostics: new Map(),
    titleListPagesByChat: new Map(), collapsedPagesByChat: new Map(),
    titleListStacksByKey: new Map(), titleListStackStatsByKey: new Map(),
  };
  const safety = { storageWrites: 0, networkCalls: 0, scrollCalls: 0, timerCalls: 0, rafCalls: 0, observerCalls: 0, hydrationRequests: 0, minimapPropagations: 0 };
  const minimapCollapsed = new Set();

  const PAGE_NAMES = [
    'frozenRenderedPageBoundaryCapability', 'renderedBoundaryStatusIdentity', 'renderedBoundaryDirectChildUnder',
    'renderedBoundaryRoleFromCarrier', 'resolveRenderedTurnSurfaceByIdentity', 'renderedBoundaryThreadDivider',
    'renderedBoundaryStartSentinel', 'renderedBoundaryPageEndSentinel', 'renderedBoundaryOrderingNodeAllowed',
    'renderedBoundaryLayoutProof', 'renderedBoundaryWrapperCarriesIdentity', 'renderedBoundaryColdWrapperH2OOwned',
    'resolveColdRenderedBoundaryWrapper', 'renderedBoundaryPageUnitPlacement', 'renderedBoundaryTransitionActive',
    'renderedBoundaryRecordStreaming', 'readRenderedBoundaryAuthority', 'renderedBoundaryLeaseScopeCurrent',
    'getRenderedPageBoundaryCapability', 'frozenPageCollapseRangeDiagnostics', 'pageCollapseRangeH2OOwned',
    'pageCollapseRangeIdentityCarriers', 'pageCollapseRangeIdentityOfCarrier', 'pageCollapseRangeContainerIdentity',
    'pageCollapseRangeNodeCarriesIdentity', 'pageCollapseMemberIdentityCurrent',
    'pageCollapseRangeHasRetainedHeight', 'pageCollapseRangeScopeCurrent',
    'clearStalePageCollapseRangeContinuity', 'readPageCollapseRangeGraphRecords', 'readFinalPageTerminalRecord',
    'resolveFinalPageTerminalWrapper', 'resolveFinalPageTailAuthority', 'buildPageCollapseRangePlan',
    'classifyPageCollapseRange', 'getPageCollapseRangeDiagnostics', 'frozenPageCollapseCapability',
    'pageCollapseCapabilityProductReason', 'evaluatePageCollapseCapability', 'getPageCollapseCapability',
    'frozenCollapsedBoundaryResult',
    'isTitleListActive', 'collapsedBoundaryDividers', 'setCollapseFeedbackAttribute',
    'collapseUnavailableStatusNode', 'clearCollapseUnavailableFeedback',
    'applyCollapsedBoundaryControlState', 'applyExpandedCollapseControlState',
    'resolveSyntheticRowTitle', 'projectSyntheticRowTitle', 'applyStackedTitleBarWash', 'applyCollapsedNativeRange',
    'captureCollapsedPageViewportAnchor', 'restoreCollapsedPageViewportAnchor', 'propagateChatPageCollapseToMiniMap',
    'setAtomicTitleListMemory', 'setAtomicCollapsedPageMemory', 'prepareDetachedPageTitleList',
    'revalidateAtomicPageCollapsePlan', 'releaseAtomicPageCollapseState', 'rollbackAtomicPageCollapse',
    'validateCommittedAtomicPageCollapse', 'collapsePageWithRenderedBoundaries', 'expandPageWithRenderedBoundaries',
    'reconcileAtomicPageCollapseTransactions', 'expandAllAtomicPageCollapses',
    'frozenAtomicPageCollapseDiagnostic', 'recordAtomicPageCollapseAttempt', 'getAtomicPageCollapseTransactionDiagnostic',
    'atomicPageCollapseFailureStage', 'executeAtomicPageCollapseTransaction',
  ];

  const controller = vm.runInNewContext(`(() => {
    const document = injectedDocument;
    const S = injectedState;
    const W = { getComputedStyle: () => ({ overflowY: 'visible' }), scrollBy() {} };
    const TITLE_LIST_PAGE_SIZE = ${pageSize};
    const TURN_HOST_SEL = '[data-testid="conversation-turn"], [data-testid^="conversation-turn-"]';
    const RENDERED_BOUNDARY_SENTINEL_ATTR = 'data-h2o-chat-page-boundary';
    const RENDERED_BOUNDARY_SENTINEL_PAGE_ATTR = 'data-h2o-chat-page-boundary-page';
    const RENDERED_BOUNDARY_SENTINEL_KIND_ATTR = 'data-h2o-chat-page-boundary-kind';
    const ATTR_CHAT_PAGE_NATIVE_HIDDEN = 'data-cgxui-chat-page-native-hidden';
    const ATTR_TITLE_LIST_NUM = 'data-cgxui-chat-page-title-list-num';
    const ATTR_COLLAPSE_READINESS = 'data-h2o-collapse-readiness';
    const ATTR_COLLAPSE_REASON = 'data-h2o-collapse-reason';
    const ATTR_COLLAPSE_CONTROL_STATE = 'data-h2o-collapse-control-state';
    const ATTR_COLLAPSE_FEEDBACK = 'data-h2o-collapse-feedback';
    const COLLAPSE_UNAVAILABLE_STATUS = 'collapsed-exact-boundary-unavailable';
    const COLLAPSE_UNAVAILABLE_MESSAGE = 'u';
    const COLLAPSE_LAYOUT_INCOMPLETE_MESSAGE = 'l';
    const COLLAPSE_TRANSIENT_FAILURE_MESSAGE = 't';
    const TURN_RUNTIME = () => injectedRuntime;
    const resolveChatId = () => '${CHAT_ID}';
    const collapsedNativeRangeKey = (c, p) => String(c) + '::' + String(p);
    const titleListStackRegistryKey = (p, c) => String(c) + '::' + String(p);
    const titleListStackDomId = (p) => 'stack-' + String(p);
    const MM_CORE_PAGES = () => ({ setMiniMapPageCollapsed(p, c) { injectedSafety.minimapPropagations += 1; if (c) injectedMinimap.add(Number(p)); else injectedMinimap.delete(Number(p)); return { ok: true }; } });
    const buildTitleListPresentationPageModel = () => {
      const turns = injectedRuntime.getEffectivePresentationIndex().turns;
      const pages = []; const total = Math.max(1, Math.ceil(turns.length / TITLE_LIST_PAGE_SIZE));
      for (let p = 1; p <= total; p += 1) {
        const s = ((p - 1) * TITLE_LIST_PAGE_SIZE) + 1, e = Math.min(p * TITLE_LIST_PAGE_SIZE, turns.length); const tr = [];
        for (let o = s; o <= e; o += 1) { const t = turns[o - 1]; tr.push(Object.freeze({ id: t.primaryAId || t.qId, answerId: t.primaryAId || '', questionId: t.qId, turnNo: o, type: t.primaryAId ? 'answer' : 'no-answer' })); }
        pages.push(Object.freeze({ pageNo: p, startOrder: s, endOrder: e, turnRecords: Object.freeze(tr) }));
      }
      return Object.freeze({ coherent: true, source: 'canonical', count: turns.length, pageSize: TITLE_LIST_PAGE_SIZE, pageCount: total, pages: Object.freeze(pages) });
    };
    const getSyntheticTitleListContainers = (p) => Array.from(document.querySelectorAll('.cgxui-chat-page-title-list-synth')).filter(n => Number(n.getAttribute('data-page-num') || 0) === Number(p));
    const AT_PUBLIC = () => ({ buildDetachedBar(i) { const b = document.createElement('div'); b.className = 'cgxui-answer-title'; b.setAttribute('data-answer-id', String(i.answerId || '')); return b; }, getBar: () => null, getTitle: () => '' });
    const WASH_PUBLIC = () => null;
    const onSyntheticTitleRowDblClick = () => {};
    const titleListAnswerFamilyIds = (m) => [m && m.answerId].filter(Boolean);
    const titleBarStrictlyMatchesMember = () => false;
    const titleListIdentityMatchesMember = () => false;
    const isSyntheticTitlePlaceholder = (v) => { const t = String(v || '').trim(); return !t || t === 'Untitled Answer'; };
    const turnRecordForTitleListIdentity = () => null;
    const restoreAllInlineTurns = () => 0;
    const releaseTitleStackBars = () => 0;
    const getTitleListStackStats = () => ({ activeStackId: '' });
    const syncTitleOnlyModeRootAttribute = () => {};
    const clearCollapsedBoundaryDiagnostic = () => {};
    const recordCollapsedBoundaryDiagnostic = () => ({ reason: '' });
    const explicitCollapseFeedbackSource = () => false;
    const releaseCollapsedNativeRange = () => 0;
    const localForgetTitleListPage = () => {};
    const getDividerPageNum = (d) => Number((d && d.getAttribute && d.getAttribute('data-page-num')) || 0);
    const showCollapseUnavailableFeedback = () => ({ ok: true });
    const handleCollapseUnavailableActivation = () => ({ ok: false });
    function failClosedCollapsedTitleList() { return { ok: false }; }
    const syncSyntheticTitleList = () => ({ ok: true });
    ${PAGE_NAMES.filter(n => pageSource.includes(`  function ${n}(`)).map(n => extractFunction(pageSource, n)).join('\n')}
    return Object.freeze({
      getRenderedPageBoundaryCapability,
      getPageCollapseRangeDiagnostics,
      getPageCollapseCapability,
      collapse: (p) => executeAtomicPageCollapseTransaction(p, 'chat-page-divider:circle', {}),
      diagnostic: getAtomicPageCollapseTransactionDiagnostic,
      reconcile: (reason) => reconcileAtomicPageCollapseTransactions(reason || 'presentation-updated'),
      expand: (p, source) => expandPageWithRenderedBoundaries(p, { source: source || 'lifecycle' }),
      validateCommitted: (p) => validateCommittedAtomicPageCollapse(
        S.atomicPageCollapseTransactions.get(collapsedNativeRangeKey(resolveChatId(), p)) || null
      ),
      transactionCount: () => S.atomicPageCollapseTransactions.size,
    });
  })()`, { injectedDocument: document, injectedState: pageState, injectedRuntime: runtime, injectedSafety: safety, injectedMinimap: minimapCollapsed });

  const coreState = { turnList: records.map(r => ({ order: r.order, qId: r.qId, primaryAId: r.primaryAId })) };
  const modelBuild = () => {
    const pages = [];
    for (let p = 1; p <= pageCount; p += 1) {
      const startOrder = ((p - 1) * pageSize) + 1;
      const endOrder = Math.min(p * pageSize, count);
      const recs = [];
      for (let o = startOrder; o <= endOrder; o += 1) recs.push({ order: o, turn: { qId: qId(o), questionId: qId(o), primaryAId: aId(o), answerId: aId(o) } });
      pages.push({
        pageNum: p, startOrder, endOrder, records: recs, artifacts: [],
        exactStart: null, earliest: null, latest: null,
        titleListRoot: (() => {
          const n = document.querySelector(`[data-cgxui="chat-page-title-list-synth"][data-page-num="${p}"]`);
          return n && n.isConnected ? n : null;
        })(),
        nativeStartSlot: null, nativeEndSlot: null, nextNativeStartSlot: null,
      });
    }
    return { identity: coreIdentity(), source: 'selected-path-overlay', count, pageCount, pages };
  };
  let coreIdentity = () => `${CHAT_ID}|${ROUTE_KEY}|selected-path-overlay|${count}|${EFFECTIVE_FP}|2|${pageCount}`;

  const controllerForCore = options.capabilityOverride
    ? Object.freeze({
      ...controller,
      getRenderedPageBoundaryCapability: (p) => options.capabilityOverride(controller.getRenderedPageBoundaryCapability(p), p),
    })
    : controller;

  const core = vm.runInNewContext(`(() => {
    const document = injectedDocument;
    const S = injectedState;
    const W = { location: { pathname: '${ROUTE_KEY}' } };
    const TOPW = { H2O: { ChatPageTitleIntent: { api: injectedController } } };
    const Node = { DOCUMENT_POSITION_FOLLOWING: 4, DOCUMENT_POSITION_PRECEDING: 2 };
    const UI_TOK = { OWNER: 'mnmp' };
    const ATTR_CHAT_PAGE_NUM = 'data-cgxui-chat-page-num';
    const ATTR_CHAT_PAGE_DIVIDER = 'data-cgxui-chat-page-divider';
    const CHAT_PAGE_BOUNDARY_ATTR = 'data-h2o-chat-page-boundary';
    const CHAT_PAGE_BOUNDARY_PAGE_ATTR = 'data-h2o-chat-page-boundary-page';
    const CHAT_PAGE_BOUNDARY_KIND_ATTR = 'data-h2o-chat-page-boundary-kind';
    const CHAT_PAGE_UNIT_OWNER = '1A1b:reconcileChatPageUnits';
    const resolveChatId = () => '${CHAT_ID}';
    const getChatPagesControllerApi = () => injectedController;
    const getTurnPageBand = () => 'normal';
    const buildChatPageUnitModel = () => injectedModel();
    const resolveChatPageExactArtifact = (turn) => {
      const id = String((turn && (turn.answerId || turn.primaryAId)) || '').trim();
      if (!id) return null;
      const flow = injectedDocument.querySelector('.active-flow');
      const w = flow && Array.from(flow.children).find((n) => (
        n.getAttribute && n.getAttribute('data-turn-id-container') === id
      ));
      return w && w.isConnected ? { section: w, wrapper: w } : null;
    };
    const UM_PUBLIC = () => ({ requestMountPairByUid() { injectedSafety.hydrationRequests += 1; return true; }, requestMountByUid() { injectedSafety.hydrationRequests += 1; return true; } });
    const setTimeout = () => { injectedSafety.timerCalls += 1; throw new Error('forbidden-timer'); };
    const setInterval = setTimeout;
    const requestAnimationFrame = () => { injectedSafety.rafCalls += 1; throw new Error('forbidden-raf'); };
    const MutationObserver = class { constructor() { injectedSafety.observerCalls += 1; throw new Error('forbidden-observer'); } };
    const localStorage = Object.freeze({ setItem() { injectedSafety.storageWrites += 1; throw new Error('forbidden-storage'); } });
    const state = { identity: '', sentinels: injectedUnits.sentinels, pendingDividers: injectedUnits.dividers, reconcileInFlight: false, hydrationRequested: new Set(), last: null };
    const getChatPageUnitState = () => state;
    ${extractFunction(coreSource, 'createChatPageDivider')}
    ${extractFunction(coreSource, 'isDividerPassThroughEl')}
    ${extractFunction(coreSource, 'getNextTurnTestIdAfterDivider')}
    ${extractFunction(coreSource, 'createChatPageBoundarySentinel')}
    ${extractFunction(coreSource, 'ensureChatPageBoundarySentinels')}
    ${extractFunction(coreSource, 'compareChatPageNodes')}
    ${extractFunction(coreSource, 'resolveRenderedBoundaryWrapperFromCapability')}
    ${extractFunction(coreSource, 'resolveRenderedBoundaryPageUnitAnchor')}
    ${coreSource.includes('function resolveChatPageTerminalArtifact(') ? extractFunction(coreSource, 'resolveChatPageTerminalArtifact') : ''}
    ${extractFunction(coreSource, 'resolveChatPageBoundaryAnchor')}
    ${extractFunction(coreSource, 'requestChatPageUnitHydration')}
    ${extractFunction(coreSource, 'getActualThreadPageDividers')}
    ${extractFunction(coreSource, 'pageNumberOfThreadDivider')}
    ${extractFunction(coreSource, 'removeH2OChatPageUnitNode')}
    ${extractFunction(coreSource, 'detachDeferredChatPageDivider')}
    ${coreSource.includes('function setChatPageUnitAttributeIfChanged(') ? extractFunction(coreSource, 'setChatPageUnitAttributeIfChanged') : ''}
    ${extractFunction(coreSource, 'enforceChatPageUnitOrder')}
    function getCompleteIndexProjectionStatus() {
      return {
        trustedSelectionIntentActive: false,
        branchSelectionStale: false,
        selectedPathRequestLeaseActive: false,
        selectedPathConfirmationLeaseActive: false,
        selectedPathConfirmationPending: false,
      };
    }
    function getEffectivePresentationRuntimeStatus() {
      return { source: 'canonical', overlayActive: false, count: 0, canonicalFingerprint: '', effectiveFingerprint: '', effectiveCount: 0, anchorQId: null, pathLength: 0, generation: 0 };
    }
    ${coreSource.match(/const CHAT_PAGE_BOUNDARY_SENTINEL_VALUE = .+;/) ? coreSource.match(/const CHAT_PAGE_BOUNDARY_SENTINEL_VALUE = .+;/)[0] : ''}
    ${coreSource.includes('function isOwnedChatPageBoundarySentinel(') ? extractFunction(coreSource, 'isOwnedChatPageBoundarySentinel') : ''}
    ${coreSource.includes('function chatPageUnitBranchTransitionActive(') ? extractFunction(coreSource, 'chatPageUnitBranchTransitionActive') : ''}
    ${coreSource.includes('function chatPageUnitPresentationCoherence(') ? extractFunction(coreSource, 'chatPageUnitPresentationCoherence') : ''}
    ${coreSource.includes('function withdrawChatPageUnits(') ? extractFunction(coreSource, 'withdrawChatPageUnits') : ''}
    ${extractFunction(coreSource, 'reconcileChatPageUnits')}
    return Object.freeze({
      reconcile: reconcileChatPageUnits,
      diagnostics: () => state.last,
      state: () => state,
      pageAnchor: resolveRenderedBoundaryPageUnitAnchor,
    });
  })()`, { injectedDocument: document, injectedState: coreState, injectedController: controllerForCore, injectedModel: modelBuild, injectedUnits: units, injectedSafety: safety });

  const idx = (n) => flow.children.indexOf(n);
  return {
    core, controller, flow, thread, document, units, records, hostWrappers, composer, safety, minimapCollapsed,
    count, pageCount, startSentinel, divider, endSentinel,
    startWrapper: hostWrappers[0],
    terminalWrapper: hostWrappers[hostWrappers.length - 1],
    idx,
    orderingStatus: () => document.documentElement.getAttribute('data-h2o-page-unit-ordering-status'),
    orderingCount: () => document.documentElement.getAttribute('data-h2o-page-unit-ordering-count'),
    placement: (p = 1) => controller.getRenderedPageBoundaryCapability(p),
    setIdentity: (fn) => { coreIdentity = fn; },
    status,
    stamps: () => flow.querySelectorAll('[data-cgxui-chat-page-native-hidden]'),
    lists: () => thread.querySelectorAll('[data-cgxui="chat-page-title-list-synth"]'),
  };
}

function prime(h) { for (let p = 1; p <= h.pageCount; p += 1) h.controller.getRenderedPageBoundaryCapability(p); }

// ── 1-5: parent reproduction ──────────────────────────────────────────────
await fixture('1-2 parent leaves Page 1 units after the exact wrapper and still reports settled', () => {
  const h = createHarness({ coreSource: CORE_PARENT });
  prime(h);
  const before = h.placement(1);
  equal(before.supported, true, 'boundary supported');
  equal(before.leaseCurrent, true, 'lease current');
  equal(before.pageUnitOrderCurrent, false, 'placement not current before reconcile');
  h.core.reconcile('parent');
  ok(h.idx(h.startSentinel) > h.idx(h.startWrapper), 'start sentinel remains after the wrapper');
  ok(h.idx(h.divider) > h.idx(h.startWrapper), 'divider remains after the wrapper');
  equal(h.orderingStatus(), 'settled', 'parent incorrectly reports settled');
  const after = h.placement(1);
  equal(after.pageUnitOrderCurrent, false, 'still not current');
  equal(after.pageUnitOrderReason, 'sentinel-after-boundary', 'live reason reproduced');
  equal(after.placementRepairRequired, true, 'repair still required');
  const range = h.controller.getPageCollapseRangeDiagnostics(1);
  equal(range.supported, false, 'range blocked');
  equal(range.reason, 'page-unit-order-invalid', 'blocked with page-unit-order-invalid');
  equal(h.controller.getPageCollapseCapability(1).activationReady, false, 'capability not ready');
});

await fixture('3-5 exact Page 1 wrapper is current while both start units follow it', () => {
  const h = createHarness({ coreSource: CORE_PARENT });
  prime(h);
  equal(h.startWrapper.isConnected, true, 'wrapper connected');
  equal(h.startWrapper.parentElement, h.flow, 'wrapper is a direct flow child');
  equal(h.startWrapper.getAttribute('data-turn-id-container'), h.records[0].qId, 'wrapper carries the exact identity');
  equal(h.placement(1).boundaryIdentityCurrent, true, 'identity current');
  ok(h.idx(h.startSentinel) > h.idx(h.startWrapper), 'sentinel initially after');
  ok(h.idx(h.divider) > h.idx(h.startWrapper), 'divider initially after');
  // Root cause: Page 1 is excluded from rendered-boundary anchoring.
  const parentAnchor = extractFunction(CORE_PARENT, 'resolveRenderedBoundaryPageUnitAnchor');
  ok(/pageNum \|\| 0\) <= 1/.test(parentAnchor), 'parent skips Page 1');
  const anchor = extractFunction(CORE_SOURCE, 'resolveRenderedBoundaryPageUnitAnchor');
  ok(!/pageNum \|\| 0\) <= 1/.test(anchor), 'corrected source no longer skips Page 1');
});

// ── 6-15: corrected placement ─────────────────────────────────────────────
await fixture('6-7 corrected reconciliation consumes rendered capability for Page 1', () => {
  const h = createHarness();
  prime(h);
  const anchor = h.core.pageAnchor({ pages: [] }, { pageNum: 1 });
  equal(anchor.applicable, true, 'Page 1 is applicable to rendered authority');
  h.core.reconcile('corrected');
  equal(h.divider.getAttribute('data-h2o-divider-anchor-mode'), 'rendered-boundary-authority', 'exact wrapper has highest anchor priority');
});

await fixture('8-11 start units move before the exact wrapper in the required order', () => {
  const h = createHarness();
  prime(h);
  h.core.reconcile('corrected');
  ok(h.idx(h.startSentinel) < h.idx(h.startWrapper), 'sentinel precedes the wrapper');
  ok(h.idx(h.divider) < h.idx(h.startWrapper), 'divider precedes the wrapper');
  ok(h.idx(h.startSentinel) < h.idx(h.divider), 'sentinel precedes divider');
  const between = h.flow.children.slice(h.idx(h.startSentinel) + 1, h.idx(h.startWrapper));
  const nonH2O = between.filter(n => !n.matches('.cgxui-chat-page-divider, [data-h2o-chat-page-boundary], [data-cgxui="chat-page-title-list-synth"], #cgx-mm-root, [data-cgxui-owner="mnmp"]'));
  equal(nonH2O.length, 0, 'no non-H2O node intervenes');
  equal(h.placement(1).interveningNonH2ONodeCount, 0, 'capability agrees');
});

await fixture('12-15 end sentinel untouched and host wrappers never move, are removed or reparented', () => {
  const h = createHarness();
  prime(h);
  const hostsBefore = h.flow.children.filter(n => n.hasAttribute('data-turn-id-container'));
  const endBefore = h.idx(h.endSentinel);
  const endNext = h.endSentinel.nextSibling;
  h.core.reconcile('corrected');
  const hostsAfter = h.flow.children.filter(n => n.hasAttribute('data-turn-id-container'));
  equal(hostsAfter.length, hostsBefore.length, 'no host removed or added');
  equal(hostsAfter.every((n, i) => n === hostsBefore[i]), true, 'host order unchanged');
  equal(hostsAfter.every(n => n.parentElement === h.flow), true, 'no host reparented');
  ok(h.idx(h.endSentinel) > h.idx(h.terminalWrapper), 'end sentinel still after the terminal wrapper');
  equal(h.endSentinel.nextSibling, endNext, 'end sentinel neighbour unchanged');
  ok(endBefore >= 0, 'end sentinel was present before');
});

await fixture('16-17 supported-but-unresolved fails closed; unsupported keeps the approved fallback', () => {
  const h = createHarness();
  prime(h);
  // Supported capability whose exact wrapper cannot be resolved must not fall
  // back to a weaker anchor.
  const unresolved = h.core.pageAnchor({ pages: [] }, { pageNum: 1, records: [] });
  ok(unresolved.applicable === true, 'still applicable');
  const stub = { supported: true, boundaryIdentityCurrent: true, leaseCurrent: true, qId: 'missing-identity' };
  const resolvedMiss = vm.runInNewContext(`(() => {
    ${extractFunction(CORE_SOURCE, 'resolveRenderedBoundaryWrapperFromCapability')}
    return resolveRenderedBoundaryWrapperFromCapability(injectedFlow, injectedCapability);
  })()`, { injectedFlow: h.flow, injectedCapability: stub });
  equal(resolvedMiss.ok, false, 'unresolved identity refuses');
  equal(resolvedMiss.reason, 'rendered-boundary-wrapper-unavailable', 'exact refusal reason');
  const unsupported = vm.runInNewContext(`(() => {
    ${extractFunction(CORE_SOURCE, 'resolveRenderedBoundaryWrapperFromCapability')}
    return resolveRenderedBoundaryWrapperFromCapability(injectedFlow, { supported: false });
  })()`, { injectedFlow: h.flow });
  equal(unsupported.reason, 'rendered-boundary-capability-unsupported', 'unsupported defers to fallback contract');
});

await fixture('18-20 no test-ID, ordinal or pairCount inference in the anchor path', () => {
  const src = extractFunction(CORE_SOURCE, 'resolveRenderedBoundaryPageUnitAnchor')
    + extractFunction(CORE_SOURCE, 'resolveRenderedBoundaryWrapperFromCapability');
  ok(!/conversation-turn-/.test(src), 'no test-ID arithmetic');
  ok(!/Ordinal/.test(src), 'no native ordinal inference');
  ok(!/\*\s*2\b/.test(src), 'no pairCount inference');
  ok(!/children\.length/.test(src), 'no raw child count');
  ok(/data-turn-id-container/.test(src), 'resolves by exact identity');
});

// ── 21-26: selected-path invalidation and settled contract ────────────────
await fixture('21-24 scope changes invalidate a previous settled result', () => {
  const identity = extractFunction(CORE_SOURCE, 'chatPageUnitIdentity');
  ok(/generation/.test(identity), 'identity scopes on generation');
  ok(/pageCount/.test(identity), 'identity scopes on page count');
  ok(/count/.test(identity), 'identity scopes on effective count');
  ok(/fingerprint/.test(identity), 'identity scopes on fingerprint');
  ok(/source/.test(identity), 'identity scopes on effective source');
  const ensure = extractFunction(CORE_SOURCE, 'ensureChatPageBoundarySentinels');
  ok(/state\.last = null/.test(ensure), 'a scope change drops the previous placement result');
  const parentEnsure = extractFunction(CORE_PARENT, 'ensureChatPageBoundarySentinels');
  ok(!/state\.last = null/.test(parentEnsure), 'parent retained it');
  // A 39-turn settled result cannot survive into the 18-turn layout.
  const h = createHarness();
  prime(h);
  h.core.reconcile('first');
  h.core.state().last = Object.freeze({ status: 'settled', stale: true });
  h.setIdentity(() => 'different|scope|selected-path-overlay|18|djb2:other|3|1');
  h.core.reconcile('scope-change');
  ok(h.core.state().last?.stale !== true, 'stale settled result discarded');
});

await fixture('25-26 settled only after exact placement is achieved', () => {
  const h = createHarness();
  prime(h);
  // Before repair the parent-shaped layout must not read settled.
  const parent = createHarness({ coreSource: CORE_PARENT });
  prime(parent);
  parent.core.reconcile('parent');
  equal(parent.orderingStatus(), 'settled', 'parent falsely settled (documented defect)');
  h.core.reconcile('corrected');
  equal(h.orderingStatus(), 'settled', 'corrected settles only with exact placement');
  equal(h.orderingCount(), String(h.pageCount), 'count reflects effective page count');
  equal(h.placement(1).pageUnitOrderCurrent, true, 'placement genuinely current');
  // Settled is now gated on real placement, not on divider order alone.
  const reconcileSrc = extractFunction(CORE_SOURCE, 'reconcileChatPageUnits');
  ok(/placementRepairPending/.test(reconcileSrc), 'status consults actual placement');
  ok(/pageUnitOrderCurrent !== true/.test(reconcileSrc), 'a non-current page unit blocks settled');
  ok(/placementRepairRequired === true/.test(reconcileSrc), 'a repair requirement blocks settled');
  const parentReconcile = extractFunction(CORE_PARENT, 'reconcileChatPageUnits');
  ok(!/placementRepairPending/.test(parentReconcile), 'parent settled on ascending order alone');
  // A supported page still reporting a repair requirement must block settled,
  // even though its divider order is trivially ascending.
  const blocked = createHarness({
    capabilityOverride: (cap, page) => (Number(page) === 1
      ? Object.freeze({ ...cap, pageUnitOrderCurrent: false, placementRepairRequired: true })
      : cap),
  });
  prime(blocked);
  blocked.core.reconcile('repair-pending');
  equal(blocked.orderingStatus(), 'page-unit-order-invalid', 'a page needing repair is never settled');
  equal(blocked.core.diagnostics().placementRepairPending, 1, 'the pending repair is counted');
});

// ── 27-35: capability and final collapse become ready ─────────────────────
await fixture('27-30 corrected boundary, range and capability become ready', () => {
  const h = createHarness();
  prime(h);
  h.core.reconcile('corrected');
  const b = h.placement(1);
  equal(b.supported, true, 'supported');
  equal(b.boundaryIdentityCurrent, true, 'identity current');
  equal(b.leaseCurrent, true, 'lease current');
  equal(b.dividerBeforeBoundary, true, 'divider before boundary');
  equal(b.startSentinelBeforeBoundary, true, 'sentinel before boundary');
  equal(b.interveningNonH2ONodeCount, 0, 'no intervening host node');
  equal(b.pageUnitOrderCurrent, true, 'page unit order current');
  equal(b.pageUnitOrderReason, null, 'no reason');
  equal(b.placementRepairRequired, false, 'no repair required');
  const r = h.controller.getPageCollapseRangeDiagnostics(1);
  equal(r.supported, true, 'range supported');
  equal(r.isFinalPage, true, 'final page');
  equal(r.finalTailSupported, true, 'final tail supported');
  equal(r.startWrapperCurrent, true, 'start wrapper current');
  equal(r.terminalIdentityCurrent, true, 'terminal identity current');
  equal(r.terminalWrapperCurrent, true, 'terminal wrapper current');
  equal(r.pageEndSentinelCurrent, true, 'end sentinel current');
  equal(r.rangeProven, true, 'range proven');
  const c = h.controller.getPageCollapseCapability(1);
  equal(c.supported, true, 'capability supported');
  equal(c.productReason, 'ready', 'ready');
  equal(c.isFinalPage, true, 'final');
  equal(c.titleRowCount, h.count, 'derived title rows');
  equal(c.titleRowCount, 18, '18 rows');
  equal(c.expectedTitleRowCount, 18, '18 expected');
  equal(c.prerequisitesReady, true, 'prerequisites ready');
  equal(c.activationReady, true, 'activation ready');
});

await fixture('31-35 18-turn final collapse commits and expands cleanly', () => {
  const h = createHarness();
  prime(h);
  h.core.reconcile('corrected');
  h.controller.collapse(1);
  const d = h.controller.diagnostic();
  equal(d.result, 'committed', 'committed');
  equal(d.titleRowsPrepared, 18, '18 rows prepared');
  equal(d.wrappersPlanned, d.wrappersStamped, 'planned equals stamped');
  ok(d.wrappersPlanned > 0, 'wrappers planned');
  equal(d.syntheticListsInserted, 1, 'one list');
  equal(d.rollbackPerformed, false, 'no rollback');
  equal(h.endSentinel.hasAttribute('data-cgxui-chat-page-native-hidden'), false, 'end sentinel unstamped');
  const si = h.idx(h.endSentinel);
  equal(h.flow.children.slice(si).filter(n => n.hasAttribute('data-cgxui-chat-page-native-hidden')).length, 0, 'nothing at or after the sentinel is stamped');
  equal(h.composer.hasAttribute('data-cgxui-chat-page-native-hidden'), false, 'composer unstamped');
  h.controller.collapse(1);
  equal(h.stamps().length, 0, 'expansion releases all stamps');
  equal(h.lists().length, 0, 'expansion removes the list');
});

// ── 36-41: 39-turn regression and idempotence ─────────────────────────────
await fixture('36-39 39-turn two-page placement and collapse counts are preserved', () => {
  const h = createHarness({ count: 39, misplaceStartUnits: false });
  equal(h.pageCount, 2, 'two pages');
  prime(h);
  h.core.reconcile('corrected');
  const p1 = h.placement(1);
  equal(p1.pageUnitOrderCurrent, true, 'Page 1 placement current');
  const r1 = h.controller.getPageCollapseRangeDiagnostics(1);
  equal(r1.supported, true, 'Page 1 range supported');
  equal(r1.isFinalPage, false, 'Page 1 not final');
  equal(h.controller.getPageCollapseCapability(1).titleRowCount, 25, 'Page 1 keeps 25 rows');
  equal(h.controller.getPageCollapseCapability(2).titleRowCount, 14, 'Page 2 keeps 14 rows');
  equal(h.controller.getPageCollapseCapability(2).isFinalPage, true, 'Page 2 final');
});

await fixture('40-41 repeated identical reconciliation mutates nothing', () => {
  const h = createHarness();
  prime(h);
  h.core.reconcile('first');
  const orderBefore = h.flow.children.slice();
  const statusBefore = h.orderingStatus();
  const countBefore = h.orderingCount();
  const second = h.core.reconcile('second');
  equal(h.flow.children.length, orderBefore.length, 'child count unchanged');
  equal(h.flow.children.every((n, i) => n === orderBefore[i]), true, 'zero DOM movement on the second pass');
  equal(second.moved, 0, 'zero moves reported');
  equal(h.orderingStatus(), statusBefore, 'status unchanged');
  equal(h.orderingCount(), countBefore, 'count unchanged');
});

// ── 42-50: contracts, safety and ownership ────────────────────────────────
await fixture('42-43 Chat to MiniMap stays one way and direct MiniMap leaves Chat unchanged', () => {
  const h = createHarness();
  prime(h);
  h.core.reconcile('corrected');
  h.controller.collapse(1);
  equal(h.minimapCollapsed.has(1), true, 'MiniMap page collapsed by the Chat origin');
  equal(h.safety.minimapPropagations, 1, 'exactly one propagation');
  h.controller.collapse(1);
  equal(h.minimapCollapsed.has(1), false, 'MiniMap released on expansion');
  // A direct MiniMap write touches MiniMap state only.
  h.minimapCollapsed.add(1);
  equal(h.stamps().length, 0, 'Chat page untouched by a direct MiniMap action');
  equal(h.lists().length, 0, 'no Chat title list');
});

await fixture('44-46 no persistence, navigation, network, timers or observers', () => {
  const h = createHarness();
  prime(h);
  h.core.reconcile('corrected');
  h.controller.collapse(1);
  equal(h.safety.storageWrites, 0, 'no storage writes');
  equal(h.safety.networkCalls, 0, 'no network');
  equal(h.safety.scrollCalls, 0, 'no scrolling');
  equal(h.safety.timerCalls, 0, 'no timers');
  equal(h.safety.rafCalls, 0, 'no raf');
  equal(h.safety.observerCalls, 0, 'no observers');
});

await fixture('47-49 graph getter present, page-unit ownership in 1A1b, final-tail ownership in 1C1b', () => {
  const h = createHarness();
  prime(h);
  ok(h.placement(1).graphFingerprint.length > 0, 'graph bridge consumed');
  ok(CORE_SOURCE.includes('function reconcileChatPageUnits('), 'page-unit coordinator lives in 1A1b');
  ok(!PAGE_SOURCE.includes('function reconcileChatPageUnits('), '1C1b owns no page-unit coordinator');
  ok(PAGE_SOURCE.includes('function resolveFinalPageTailAuthority('), 'final-tail authority lives in 1C1b');
  ok(!CORE_SOURCE.includes('function resolveFinalPageTailAuthority('), '1A1b owns no final-tail authority');
});

await fixture('50 product feedback no longer reports layout-incomplete after genuine repair', () => {
  const parent = createHarness({ coreSource: CORE_PARENT });
  prime(parent);
  parent.core.reconcile('parent');
  equal(parent.controller.getPageCollapseCapability(1).productReason, 'layout-incomplete', 'parent reports layout-incomplete');
  const h = createHarness();
  prime(h);
  h.core.reconcile('corrected');
  equal(h.controller.getPageCollapseCapability(1).productReason, 'ready', 'corrected reports ready');
  equal(h.controller.getPageCollapseCapability(1).activationBlockReason, null, 'no block reason');
});


// ══════════════════════════════════════════════════════════════════════════
// Stage 2C-2d — final-page end-anchor self-invalidation and obsolete
// blocked-control write.
//
// Collapsing a final page inserts its own synthetic title list near the page
// start. The parent end-anchor gave that list priority, so enforceChatPageUnitOrder
// moved the final-page end sentinel ahead of the exact terminal wrapper, the
// final-tail proof then failed, and the committed transaction was released by
// its own output — with a hard-coded collapsed-exact-boundary-unavailable
// control write attached to every non-divider expansion.
// ══════════════════════════════════════════════════════════════════════════

const controlAttrs = (h) => ({
  state: h.divider.querySelector('.cgxui-chat-page-divider-dot')?.getAttribute('data-h2o-collapse-control-state') ?? null,
  readiness: h.divider.getAttribute('data-h2o-collapse-readiness'),
  reason: h.divider.getAttribute('data-h2o-collapse-reason'),
});

await fixture('2d-1 parent moves the final-page end sentinel to its own title list', () => {
  const h = createHarness({ coreSource: CORE_PARENT, misplaceStartUnits: false });
  prime(h);
  h.core.reconcile('initial');
  ok(h.idx(h.endSentinel) > h.idx(h.terminalWrapper), 'sentinel starts after the terminal wrapper');
  h.controller.collapse(1);
  equal(h.controller.diagnostic().result, 'committed', 'collapse committed');
  h.core.reconcile('post-collapse');
  const list = h.lists()[0];
  ok(!!list, 'the synthetic title list exists');
  ok(h.idx(h.endSentinel) < h.idx(h.terminalWrapper), 'parent moved the sentinel ahead of the terminal wrapper');
  equal(h.controller.getPageCollapseRangeDiagnostics(1).supported, false, 'parent final tail becomes unprovable');
  equal(h.controller.getPageCollapseRangeDiagnostics(1).reason, 'final-page-tail-unproven', 'exact parent reason');
});

await fixture('2d-2 corrected final page keeps its end sentinel at the exact terminal tail', () => {
  const h = createHarness({ misplaceStartUnits: false });
  prime(h);
  h.core.reconcile('initial');
  h.controller.collapse(1);
  equal(h.controller.diagnostic().result, 'committed', 'collapse committed');
  h.core.reconcile('post-collapse');
  ok(!!h.lists()[0], 'the synthetic title list exists');
  ok(h.idx(h.endSentinel) > h.idx(h.terminalWrapper), 'sentinel stays after the terminal wrapper');
  equal(h.endSentinel.parentElement, h.flow, 'sentinel remains a direct flow child');
});

await fixture('2d-3 inserting the title list cannot make final-tail authority unprovable', () => {
  const h = createHarness({ misplaceStartUnits: false });
  prime(h);
  h.core.reconcile('initial');
  h.controller.collapse(1);
  h.core.reconcile('post-collapse');
  const r = h.controller.getPageCollapseRangeDiagnostics(1);
  equal(r.supported, true, 'range still supported');
  equal(r.isFinalPage, true, 'still the final page');
  equal(r.finalTailSupported, true, 'final tail still supported');
  equal(r.terminalWrapperCurrent, true, 'terminal wrapper current');
  equal(r.pageEndSentinelCurrent, true, 'end sentinel current');
});

await fixture('2d-4 a committed final-page collapse survives a lifecycle reconciliation', () => {
  const h = createHarness({ misplaceStartUnits: false });
  prime(h);
  h.core.reconcile('initial');
  h.controller.collapse(1);
  const stampsBefore = h.stamps().length;
  h.core.reconcile('post-collapse');
  equal(h.controller.validateCommitted(1).ok, true, 'committed plan remains current');
  const results = h.controller.reconcile('presentation-updated');
  equal(results.length, 1, 'one transaction reconciled');
  equal(results[0].status, 'current', 'reported current, not expanded');
  equal(h.stamps().length, stampsBefore, 'stamps retained');
  equal(h.lists().length, 1, 'title list retained');
  equal(h.controller.transactionCount(), 1, 'transaction retained');
});

await fixture('2d-5 lifecycle reconciliation does not invoke the expansion owner when current', () => {
  const h = createHarness({ misplaceStartUnits: false });
  prime(h);
  h.core.reconcile('initial');
  h.controller.collapse(1);
  const before = h.controller.diagnostic().attemptId;
  h.controller.reconcile('presentation-updated');
  h.controller.reconcile('observer-hub-remount');
  equal(h.controller.diagnostic().attemptId, before, 'no new transaction attempt recorded');
  equal(h.controller.transactionCount(), 1, 'still collapsed');
  equal(h.minimapCollapsed.has(1), true, 'MiniMap page stays collapsed');
});

await fixture('2d-6 parent lifecycle expansion writes the obsolete blocked control', () => {
  const h = createHarness({ pageSource: PAGE_PARENT, misplaceStartUnits: false });
  prime(h);
  h.core.reconcile('initial');
  h.controller.collapse(1);
  h.controller.expand(1, 'presentation-updated:atomic-plan-scope-stale');
  const a = controlAttrs(h);
  equal(a.state, 'blocked', 'parent marks the expanded control blocked');
  equal(a.readiness, 'collapsed-exact-boundary-unavailable', 'parent emits the obsolete reason');
});

await fixture('2d-7 corrected lifecycle expansion renders a ready page ready', () => {
  const h = createHarness({ misplaceStartUnits: false });
  prime(h);
  h.core.reconcile('initial');
  h.controller.collapse(1);
  h.controller.expand(1, 'presentation-updated:atomic-plan-scope-stale');
  equal(h.controller.getPageCollapseCapability(1).activationReady, true, 'capability is ready after release');
  const a = controlAttrs(h);
  equal(a.state, 'ready', 'control is ready, not blocked');
  equal(a.readiness, null, 'no readiness attribute');
  ok(a.reason !== 'collapsed-exact-boundary-unavailable', 'obsolete reason not emitted');
});

await fixture('2d-8 a genuinely unavailable page still fails closed after a lifecycle expansion', () => {
  const h = createHarness({ misplaceStartUnits: false });
  prime(h);
  h.core.reconcile('initial');
  h.controller.collapse(1);
  // Remove the exact start wrapper so the capability genuinely cannot prove.
  h.startWrapper.remove();
  h.controller.expand(1, 'presentation-updated:atomic-plan-scope-stale');
  equal(h.controller.getPageCollapseCapability(1).activationReady, false, 'capability genuinely unavailable');
  const a = controlAttrs(h);
  equal(a.state, 'blocked', 'control fails closed');
  ok(typeof a.reason === 'string' && a.reason.length > 0, 'a concrete reason is surfaced');
});

await fixture('2d-9 explicit user expansion still renders ready', () => {
  const h = createHarness({ misplaceStartUnits: false });
  prime(h);
  h.core.reconcile('initial');
  h.controller.collapse(1);
  h.controller.expand(1, 'chat-page-divider:circle');
  equal(h.stamps().length, 0, 'expanded');
  equal(h.lists().length, 0, 'list removed');
  equal(controlAttrs(h).state, 'ready', 'explicit expansion stays ready');
});

await fixture('2d-10 Chat drives MiniMap one way and direct MiniMap cannot change Chat', () => {
  const h = createHarness({ misplaceStartUnits: false });
  prime(h);
  h.core.reconcile('initial');
  h.controller.collapse(1);
  equal(h.minimapCollapsed.has(1), true, 'Chat collapse propagated to MiniMap');
  equal(h.safety.minimapPropagations, 1, 'exactly one propagation');
  h.controller.collapse(1);
  equal(h.minimapCollapsed.has(1), false, 'Chat expansion propagated to MiniMap');
  // A direct MiniMap write touches MiniMap state only.
  h.minimapCollapsed.add(1);
  equal(h.stamps().length, 0, 'Chat unchanged by a direct MiniMap action');
  equal(h.lists().length, 0, 'no Chat title list');
  equal(h.controller.transactionCount(), 0, 'no Chat transaction');
});

await fixture('2d-11 ambiguity inside the final tail still fails closed, and repair is normalisation', () => {
  const amb = createHarness({ misplaceStartUnits: false, tailInterveningKind: 'ambiguous' });
  prime(amb);
  // Before reconciliation the injected node sits between the terminal wrapper
  // and the end sentinel: the tail proof must refuse it.
  const before = amb.controller.getPageCollapseRangeDiagnostics(1);
  equal(before.supported, false, 'ambiguous tail interval refused');
  equal(before.reason, 'final-page-tail-unproven', 'fails closed with the tail reason');
  amb.controller.collapse(1);
  equal(amb.stamps().length, 0, 'no stamps while the tail is unproven');
  equal(amb.lists().length, 0, 'no title list while the tail is unproven');
  // Reconciliation re-anchors the sentinel to the exact terminal tail, which
  // closes the interval rather than tolerating the unclassifiable node.
  amb.core.reconcile('repair');
  ok(amb.idx(amb.endSentinel) > amb.idx(amb.terminalWrapper), 'sentinel normalised to the terminal tail');
  equal(amb.endSentinel.parentElement.children[amb.idx(amb.endSentinel) - 1], amb.terminalWrapper, 'no node left between them');
  equal(amb.controller.getPageCollapseRangeDiagnostics(1).supported, true, 'tail provable after normalisation');
});

const failed = fixtures.filter(f => !f.ok);
console.log(`\nCV-3.29 fixtures ${fixtures.length - failed.length}/${fixtures.length} assertions ${assertions}`);
if (failed.length) { for (const f of failed) console.error(`FAILED ${f.name}`); process.exit(1); }
