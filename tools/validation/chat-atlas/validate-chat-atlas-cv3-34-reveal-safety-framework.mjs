// CV-3.34 — Stage 2C-2ag1: reveal safety framework.
//
// The one-shot reveal ACTION is disabled by contract in this stage. What is
// proven here is everything that must be trustworthy before it is ever
// enabled: which element genuinely governs the conversation, transaction
// pinning, the viewport bookmark, restoration, and telling a real user scroll
// apart from our own. Every fixture runs the real production bodies.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const CORE_PATH = 'src-runtime-base/0A1a.⬛️🧠 H2O Core 🧠.js';
// Reveal / pager / scroll moved out of H2O Core into 0A3a Chat Atlas Core, so
// the source this validator asserts on is H2O Core plus that engine. No
// assertion changes; negative checks now span both files, which is stronger.
const CHAT_ATLAS_CORE_REL = 'src-runtime-base/0A3a.\u2b1b\ufe0f\ud83e\udded Chat Atlas Core \ud83e\udded.js';
const CORE_SOURCE = `${fs.readFileSync(path.join(ROOT, CORE_PATH), 'utf8')}\n${fs.readFileSync(path.join(ROOT, CHAT_ATLAS_CORE_REL), 'utf8')}`;

const fixtures = [];
let assertions = 0;
function equal(a, b, m) { assertions += 1; assert.deepStrictEqual(a, b, m); }
function ok(v, m) { assertions += 1; assert.ok(v, m); }
async function fixture(name, run) {
  try { await run(); fixtures.push({ name, ok: true }); }
  catch (error) { fixtures.push({ name, ok: false, error }); }
}
function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`missing ${name}`);
  // Skip the parameter list first: a default like `detail = {}` would
  // otherwise be mistaken for the function body and truncate the extraction.
  let parens = 0;
  let cursor = source.indexOf('(', start);
  for (; cursor < source.length; cursor += 1) {
    if (source[cursor] === '(') parens += 1;
    else if (source[cursor] === ')') { parens -= 1; if (!parens) break; }
  }
  let depth = 0;
  for (let i = source.indexOf('{', cursor); i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') { depth -= 1; if (!depth) return source.slice(start, i + 1); }
  }
  throw new Error(`unterminated ${name}`);
}
function extractConst(source, name) {
  const re = new RegExp(`\\n  const ${name} = [^;]+;`);
  const m = source.match(re);
  if (!m) throw new Error(`missing const ${name}`);
  return m[0];
}

// ── Minimal DOM ────────────────────────────────────────────────────────────
class El {
  constructor(tag = 'DIV') {
    this.tagName = String(tag).toUpperCase(); this.nodeType = 1;
    this.children = []; this.parentElement = null; this.attrs = new Map();
    this._scrollTop = 0; this.scrollHeight = 0; this.clientHeight = 0; this.clientWidth = 600;
    this.anchorBias = 0;          // one-shot displacement, as scroll anchoring does
    this.overflowY = 'visible'; this._top = 0; this.listeners = []; this.clicks = 0;
    this._width = 0; this._height = 0; this.disabled = false; this.position = 'static';
  }
  get scrollTop() { return this._scrollTop; }
  set scrollTop(v) {
    let next = Number(v) || 0;
    if (this.anchorBias) { next += this.anchorBias; this.anchorBias = 0; }
    this._scrollTop = next;
  }
  click() { this.clicks += 1; }
  setAttribute(n, v) { this.attrs.set(String(n), String(v)); }
  getAttribute(n) { return this.attrs.has(String(n)) ? this.attrs.get(String(n)) : null; }
  appendChild(c) { c.parentElement = this; this.children.push(c); return c; }
  contains(other) { let n = other; while (n) { if (n === this) return true; n = n.parentElement; } return false; }
  get previousElementSibling() {
    const sibs = this.parentElement?.children || []; const i = sibs.indexOf(this);
    return i > 0 ? sibs[i - 1] : null;
  }
  get nextElementSibling() {
    const sibs = this.parentElement?.children || []; const i = sibs.indexOf(this);
    return i >= 0 && i < sibs.length - 1 ? sibs[i + 1] : null;
  }
  getBoundingClientRect() {
    // left is 0 in this harness; clientWidth marks the scrollbar gutter edge.
    // Mirror real layout: a node's viewport top is its layout top minus the
    // accumulated scroll of its ANCESTORS. A scroll container's own rect does
    // not move when it scrolls — only its descendants do.
    let offset = 0;
    for (let n = this.parentElement; n; n = n.parentElement) offset += n.scrollTop;
    return { top: this._top - offset, left: 0, width: this._width || 0, height: this._height || 0 };
  }
  addEventListener(type, handler, options) { this.listeners.push({ type, handler, options }); }
  removeEventListener(type, handler) {
    const i = this.listeners.findIndex((l) => l.type === type && l.handler === handler);
    if (i >= 0) this.listeners.splice(i, 1);
  }
  fire(type, event = {}) { for (const l of [...this.listeners]) if (l.type === type) l.handler(event); }
  _all(out = []) { for (const c of this.children) { out.push(c); c._all(out); } return out; }
  _one(t) {
    if (t === '*') return true;
    // A pseudo-class is a live UI state. Matching it unconditionally would let
    // a hover/focus probe report true for every element in the tree.
    if (t.startsWith(':')) return this.pseudo ? this.pseudo.has(t) : false;
    for (const m of t.matchAll(/\[([^\]=^]+)\^="([^"]*)"\]/g)) {
      const a = this.getAttribute(m[1].trim());
      if (a == null || !a.startsWith(m[2])) return false;
    }
    for (const m of t.matchAll(/\[([^\]=^]+)(?:="([^"]*)")?\]/g)) {
      const a = this.getAttribute(m[1].trim());
      if (a == null) return false;
      if (m[2] != null && a !== m[2]) return false;
    }
    return true;
  }
  matches(sel) { return String(sel).split(',').map((x) => x.trim()).filter(Boolean).some((x) => this._one(x)); }
  // Real DOM semantics: walk up from self. Live evidence shows a native pager
  // button resolves its owner through this path, so the harness must model it.
  closest(sel) { for (let n = this; n; n = n.parentElement) if (n.matches(sel)) return n; return null; }
  querySelectorAll(sel) { return this._all().filter((n) => n.matches(sel)); }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
}

function scroller(opts = {}) {
  const el = new El('DIV');
  el.overflowY = opts.overflowY || 'auto';
  el.clientHeight = opts.clientHeight ?? 800;
  el.scrollHeight = opts.scrollHeight ?? 4000;
  if (opts.testId) el.setAttribute('data-testid', opts.testId);
  return el;
}
function turn(order, qId, aId, top = 0, split = false, parent = null) {
  const mk = (id, role, suffix) => {
    const sec = new El('DIV');
    sec.setAttribute('data-testid', `conversation-turn-${order}${suffix}`);
    sec._top = top;
    const m = new El('DIV');
    m.setAttribute('data-message-author-role', role);
    m.setAttribute('data-message-id', id);
    m._top = top;
    sec.appendChild(m);
    if (parent) parent.appendChild(sec);
    return sec;
  };
  if (split) { const a = qId ? mk(qId, 'user', '') : null; if (aId) mk(aId, 'assistant', '-a'); return a; }
  const sec = new El('DIV');
  sec.setAttribute('data-testid', `conversation-turn-${order}`);
  sec._top = top;
  if (qId) { const u = new El('DIV'); u.setAttribute('data-message-author-role', 'user'); u.setAttribute('data-message-id', qId); u._top = top; sec.appendChild(u); }
  if (aId) { const a = new El('DIV'); a.setAttribute('data-message-author-role', 'assistant'); a.setAttribute('data-message-id', aId); a._top = top; sec.appendChild(a); }
  if (parent) parent.appendChild(sec);
  return sec;
}

const FN = [
  'chatAtlasRevealIsScrollable', 'chatAtlasResolveConversationScrollContainer',
  'chatAtlasRevealContainerDiagnostics', 'chatAtlasRevealCurrentPin', 'chatAtlasRevealCancelReadinessRetry', 'chatAtlasRevealReconcileElapsedMs',
  'chatAtlasRevealCancelReconcileRetry', 'chatAtlasRevealScheduleReconcileRetry', 'chatAtlasRevealFreezeReconcile', 'chatAtlasRevealScheduleReadinessRetry', 'chatAtlasRevealReadinessElapsedMs', 'chatAtlasRevealNavigationMs', 'chatAtlasRevealFreezeReadiness', 'chatAtlasRevealProceedAfterOpen', 'chatAtlasRevealScopeDrift', 'chatAtlasRevealScopeValid', 'chatAtlasRevealRestorePermitted', 'chatAtlasRevealTerminate',
  'chatAtlasRevealClearListeners', 'chatAtlasRevealIsGenuineIntent', 'chatAtlasRevealRecordSupersessionAttempt',
  'chatAtlasRevealArmInternalMovement', 'chatAtlasRevealInternalMovementActive',
  'chatAtlasRevealConsumeInternalMovement', 'chatAtlasRevealClearInternalMovement', 'chatAtlasRevealSupersede', 'chatAtlasRevealFinish',
  'chatAtlasRevealInternal', 'chatAtlasRevealInstallUserListeners', 'chatAtlasRevealOpenTransaction',
  'chatAtlasRevealCaptureBookmark', 'chatAtlasRevealRestore', 'chatAtlasPagerAuditHash', 'chatAtlasPagerAuditRegions', 'chatAtlasPagerAuditButtonLike', 'chatAtlasPagerAuditControl', 'chatAtlasPagerAuditStructuralTag',
  'chatAtlasRevealAuditPager',
  // Graph audit (Stage 2C-2ah7) and the existing helpers it CALLS.
  'chatAtlasConvergenceGraphScope', 'chatAtlasConvergenceUniqueNode', 'chatAtlasConvergenceBranchRoot',
  'chatAtlasConvergenceAnswerVariantRoots', 'chatAtlasConvergenceQuestionVariants',
  'chatAtlasAnswerIdentityForRoot', 'chatAtlasChainToRoot', 'chatAtlasGraphCreateTime',
  'chatAtlasGraphIsProductNode', 'chatAtlasEligibleTerminalNodes', 'chatAtlasSelectLatestCreatedTerminal',
  'chatAtlasTurnsFromChain', 'chatAtlasBranchVectorForChain', 'chatAtlasCompleteIndexFingerprint',
  'chatAtlasComputeDefaultLatestCreatedPath',
  'chatAtlasTurn2AuditMatchCount', 'chatAtlasTurn2AuditNodeByMessageId', 'chatAtlasTurn2AuditRole',
  'chatAtlasTurn2AuditAssistant', 'chatAtlasCaptureTurn2GraphAudit',
  // Graph-proven divergence (Stage 2C-2ah8) and the proof-only plan.
  'chatAtlasGraphDivergenceEmpty', 'chatAtlasGraphDivergencePointFor', 'chatAtlasComputeGraphDivergence',
  'chatAtlasGraphDivergence', 'chatAtlasQuestionEditSectionFor', 'chatAtlasBuildQuestionEditPlan',
  'chatAtlasProveConvergenceStep', 'chatAtlasConvergencePagerOfKind', 'chatAtlasNativeEditControls',
  'chatAtlasNativeRegenerationControls', 'chatAtlasFirstDivergenceTarget',
  // Pairing parity (Stage 2C-2ai1).
  'chatAtlasProveAnchorBranchOwnership', 'chatAtlasSelectedChainCanonicalParity',
  'chatAtlasCanonicalPresentationIndex', 'chatAtlasSelectedPathOverlayCurrent',
  'chatAtlasPathIdentityKey', 'chatAtlasFirstPathIdentityDifference',
  'chatAtlasPagerLocatorRect', 'chatAtlasPagerLocatorSvgSignature', 'chatAtlasPagerLocatorSignatureKey',
  'chatAtlasPagerLocatorOwner', 'chatAtlasPagerLocatorControl', 'chatAtlasPagerLocatorCapture',
  'chatAtlasRevealMeasureTarget',
  'chatAtlasExecuteOneShotRevealAction', 'chatAtlasRevealRunOneShot', 'chatAtlasRevealReconcileTick',
  'chatAtlasRevealDiagnostics',
  'chatAtlasMapMountedNativePath', 'chatAtlasConvergenceExactIndicator', 'chatAtlasNativeVariantPagers',
];

function runtime(root, opts = {}) {
  const scrolls = [];
  const state = {
    chatId: opts.chatId || 'c', routeKey: opts.routeKey || '/c/c',
    generation: opts.generation || 1,
  };
  const sandbox = {
    console, Object, String, Number, Math, Map, Set, Array, JSON, RegExp,
    Date: { now: () => (opts.clock ? opts.clock.now : 1000) },
    completeTurnIndexAuthorityState: state,
    selectedPathAcquisitionState: {
      graph: {
        captureIdentity: opts.capture || 'cap-1',
        chatId: opts.chatId || 'c',
        routeKey: opts.routeKey || '/c/c',
        generation: opts.generation || 1,
        identityGraph: opts.identityGraph || null,
      },
    },
    chatAtlasDefaultOverlayState: {
      terminalNodeId: opts.terminal || 'term-1',
      revealTargetOrder: 2, revealTargetQId: '7740946c-f002-4551-94d9-e6314ff85b25',
      revealTargetCurrentAId: '16e81a3e-e10a-45d2-80ab-f8dc0ab64226',
      revealTargetExpectedAId: '37ab747d-7fe1-4c25-ad63-6e9aee8e887f',
    },
    chatAtlasCompleteIndexIdentity: (v) => String(v || '').trim(),
    chatAtlasCompleteIndexStableHash: (v) => String(v || '').length.toString(36),
    getEffectivePresentationIndex: () => ({ turns: opts.effectiveTurns || [] }),
    chatAtlasFreeze: (v) => Object.freeze(v),
    D: {
      body: new El('BODY'),
      documentElement: new El('HTML'),
      scrollingElement: opts.scrollingElement || null,
      querySelectorAll: (sel) => root.querySelectorAll(sel),
      querySelector: (sel) => root.querySelector(sel),
    },
    W: {
      getComputedStyle: (el) => ({ overflowY: el?.overflowY || 'visible', position: el?.position || 'static' }),
      addEventListener(type, handler, options) { this._l = this._l || []; this._l.push({ type, handler, options }); },
      removeEventListener(type, handler) {
        this._l = (this._l || []).filter((l) => !(l.type === type && l.handler === handler));
      },
      fire(type, event) { for (const l of [...(this._l || [])]) if (l.type === type) l.handler(event); },
      listenerCount() { return (this._l || []).length; },
      performance: { now: () => (opts.clock ? opts.clock.now : 1000) },
      _timers: new Map(),
      _seq: 0,
      setTimeout(fn, ms) { this._seq += 1; this._timers.set(this._seq, { fn, ms }); return this._seq; },
      clearTimeout(id) { this._timers.delete(id); },
      pendingTimers() { return this._timers.size; },
      runTimers() {
        const due = [...this._timers.entries()];
        this._timers.clear();
        for (const [, t] of due) t.fn();
        return due.length;
      },
    },
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  const program = [
    extractConst(CORE_SOURCE, 'CHAT_ATLAS_REVEAL_SCROLLABLE_OVERFLOW'),
    extractConst(CORE_SOURCE, 'CHAT_ATLAS_REVEAL_ACTION_ENABLED'),
    extractConst(CORE_SOURCE, 'CHAT_ATLAS_REVEAL_RECONCILE_TICKS'),
    extractConst(CORE_SOURCE, 'CHAT_ATLAS_REVEAL_READINESS_MAX'),
    extractConst(CORE_SOURCE, 'CHAT_ATLAS_REVEAL_READINESS_TARGETS_MS'),
    extractConst(CORE_SOURCE, 'CHAT_ATLAS_REVEAL_GENUINE_INTENT'),
    extractConst(CORE_SOURCE, 'CHAT_ATLAS_REVEAL_RESTORE_TOLERANCE_PX'),
    extractConst(CORE_SOURCE, 'CHAT_ATLAS_PAGER_AUDIT_MAX_CANDIDATES'),
    extractConst(CORE_SOURCE, 'CHAT_ATLAS_PAGER_AUDIT_DIRECTION_WORDS'),
    extractConst(CORE_SOURCE, 'CHAT_ATLAS_PAGER_AUDIT_ADJACENCY_HOPS'),
    extractConst(CORE_SOURCE, 'CHAT_ATLAS_PAGER_LOCATOR_MAX_ITEMS'),
    extractConst(CORE_SOURCE, 'CHAT_ATLAS_PAGER_LOCATOR_NEAR_PX'),
    extractConst(CORE_SOURCE, 'CHAT_ATLAS_TURN2_AUDIT_MAX_CHILDREN'),
    extractConst(CORE_SOURCE, 'CHAT_ATLAS_TURN2_AUDIT_MAX_POINTS'),
    'let chatAtlasTurn2GraphAudit = null;',
    extractConst(CORE_SOURCE, 'CHAT_ATLAS_CONVERGENCE_MAX_STEPS'),
    "const chatAtlasGraphDivergenceState = { key: '', value: null };",
    "const chatAtlasQuestionEditPlanState = { state: 'idle', reason: null, plan: null, activations: 0 };",
    extractConst(CORE_SOURCE, 'CHAT_ATLAS_REVEAL_RECONCILE_TARGETS_MS'),
    extractConst(CORE_SOURCE, 'CHAT_ATLAS_REVEAL_RECONCILE_SCHEDULED_MAX'),
    extractConst(CORE_SOURCE, 'CHAT_ATLAS_REVEAL_RECONCILE_DEADLINE_MS'),
    extractConst(CORE_SOURCE, 'CHAT_ATLAS_REVEAL_READINESS_SCHEDULED_MAX'),
    extractConst(CORE_SOURCE, 'CHAT_ATLAS_REVEAL_READINESS_DEADLINE_MS'),
    CORE_SOURCE.slice(
      CORE_SOURCE.indexOf('  const chatAtlasRevealState = {'),
      CORE_SOURCE.indexOf('\n  // Scope pin.'),
    ),
    ...FN.map((n) => extractFunction(CORE_SOURCE, n)),
  ].join('\n') + `\nglobalThis.__rv = { ${FN.join(', ')}, chatAtlasRevealState };`;
  new vm.Script(program, { filename: CORE_PATH }).runInContext(sandbox);
  return { api: sandbox.__rv, sandbox, state, scrolls };
}

// 1 — unique container
await fixture('container: the single governing conversation scroller is selected', () => {
  const root = new El('MAIN');
  const sc = scroller({ testId: 'conv-scroller' });
  root.appendChild(sc);
  turn(1, 'q1', 'a1', 0, false, sc);
  turn(2, 'q2', 'a2', 900, false, sc);
  const rt = runtime(root);
  const r = rt.api.chatAtlasResolveConversationScrollContainer();
  equal(r.ok, true, 'a container resolves');
  equal(r.element, sc, 'it is the element governing the mounted turns');
  equal(r.candidateCount, 1, 'exactly one candidate');
  equal(r.governedTurns, 2, 'governing both mounted turns');
  const d = rt.api.chatAtlasRevealContainerDiagnostics();
  equal(d.revealContainerState, 'resolved', 'diagnostics report resolved');
  ok(String(d.revealContainerTestIdHash || '').startsWith('djb2:'), 'with a content-free identity hash');
  ok(!JSON.stringify(d).includes('conv-scroller'), 'and no raw page string in diagnostics');
  equal([d.revealContainerClientHeight, d.revealContainerScrollHeight], [800, 4000], 'and its metrics');
});

// 2 — ambiguous
await fixture('container: two governing scrollers fail closed', () => {
  const root = new El('MAIN');
  const a = scroller({ testId: 'one' });
  const b = scroller({ testId: 'two' });
  root.appendChild(a); root.appendChild(b);
  turn(1, 'q1', 'a1', 0, false, a);
  turn(2, 'q2', 'a2', 0, false, b);
  const r = runtime(root).api.chatAtlasResolveConversationScrollContainer();
  equal(r.ok, false, 'ambiguity is refused');
  equal(r.reason, 'reveal-container-ambiguous', 'named exactly');
  equal(r.candidateCount, 2, 'reporting both candidates');
  equal(r.element, null, 'and nothing is selected');
});

// 3 — a bigger unrelated panel must not win
await fixture('container: a larger side panel never wins over turn identity', () => {
  const root = new El('MAIN');
  const panel = scroller({ testId: 'side-panel', clientHeight: 900, scrollHeight: 99999 });
  const conv = scroller({ testId: 'conv', clientHeight: 800, scrollHeight: 2000 });
  root.appendChild(panel); root.appendChild(conv);
  turn(1, 'q1', 'a1', 0, false, conv);
  const r = runtime(root).api.chatAtlasResolveConversationScrollContainer();
  equal(r.ok, true, 'the conversation container resolves');
  equal(r.element, conv, 'identity beats size');
  ok(r.element !== panel, 'the larger scrollable panel is not selected');
});

await fixture('container: the innermost governing scroller wins over a larger outer one', () => {
  // A scrollable OUTER shell wraps a scrollable conversation pane. Walking up
  // from a turn must stop at the first one; preferring the bigger scrollHeight
  // would hand back the shell and scroll the wrong thing.
  const root = new El('MAIN');
  const outer = scroller({ testId: 'outer-shell', clientHeight: 1000, scrollHeight: 90000 });
  const inner = scroller({ testId: 'conv-pane', clientHeight: 800, scrollHeight: 3000 });
  root.appendChild(outer); outer.appendChild(inner);
  turn(1, 'q1', 'a1', 0, false, inner);
  turn(2, 'q2', 'a2', 400, false, inner);
  const r = runtime(root).api.chatAtlasResolveConversationScrollContainer();
  equal(r.ok, true, 'a container resolves');
  equal(r.element, inner, 'the innermost governing scroller is selected');
  ok(r.element !== outer, 'the larger outer shell is rejected');
  equal(r.candidateCount, 1, 'and it is unambiguous');
});

await fixture('container: no mounted turns and the document scroller both refuse', () => {
  const empty = runtime(new El('MAIN')).api.chatAtlasResolveConversationScrollContainer();
  equal(empty.reason, 'reveal-container-no-mounted-turns', 'no turns means no container');
  const root = new El('MAIN');
  const sc = scroller();
  root.appendChild(sc);
  turn(1, 'q1', 'a1', 0, false, sc);
  const r = runtime(root, { scrollingElement: sc }).api.chatAtlasResolveConversationScrollContainer();
  equal(r.reason, 'reveal-container-is-document', 'the document scroller is never the container');
});

// 4/5 — bookmark
await fixture('bookmark: the first visible canonical turn and its offset are captured', () => {
  const root = new El('MAIN');
  const sc = scroller();
  root.appendChild(sc);
  turn(1, 'q1', 'a1', -500, false, sc);
  turn(2, 'q2', 'a2', 120, false, sc);
  const rt = runtime(root);
  const b = rt.api.chatAtlasRevealCaptureBookmark(sc);
  equal(b.kind, 'canonical-turn', 'a canonical bookmark is captured');
  equal(b.turnId, 'q2', 'the first turn at or below the container top');
  equal(b.offset, 120, 'with its pixel offset');
  equal(sc.scrollTop, 0, 'and the viewport is not moved during capture');
});

await fixture('bookmark: scrollTop is the fallback when no canonical turn is visible', () => {
  const root = new El('MAIN');
  const sc = scroller();
  sc.scrollTop = 1234;
  root.appendChild(sc);
  turn(1, 'q1', 'a1', -900, false, sc);
  const b = runtime(root).api.chatAtlasRevealCaptureBookmark(sc);
  equal(b.kind, 'scroll-top', 'the fallback is used');
  equal(b.scrollTop, 1234, 'capturing the exact container scrollTop');
  equal(b.turnId, null, 'with no canonical identity');
});

// 6/7 — restoration
await fixture('restore: a canonical turn plus offset is restored exactly', () => {
  const root = new El('MAIN');
  const sc = scroller();
  root.appendChild(sc);
  turn(1, 'q1', 'a1', 0, false, sc);
  const t2 = turn(2, 'q2', 'a2', 300, false, sc);
  const rt = runtime(root);
  rt.api.chatAtlasRevealOpenTransaction({ order: 2, qId: 'q2', currentAId: 'a2', expectedAId: 'a2x' });
  rt.api.chatAtlasRevealCaptureBookmark(sc);
  sc.scrollTop = 2500;                              // the page moved
  const r = rt.api.chatAtlasRevealRestore(sc);
  equal(r.ok, true, 'restoration succeeds');
  equal(r.method, 'canonical-turn', 'by canonical identity');
  equal(sc.scrollTop, 0, 'putting the bookmarked turn back at its offset');
  ok(t2, 'the bookmarked turn was still mounted');
});

await fixture('restore: the scrollTop fallback restores when the turn is gone', () => {
  const root = new El('MAIN');
  const sc = scroller();
  sc.scrollTop = 777;
  root.appendChild(sc);
  turn(1, 'q1', 'a1', -900, false, sc);
  const rt = runtime(root);
  rt.api.chatAtlasRevealOpenTransaction({ order: 1, qId: 'q1', currentAId: 'a1', expectedAId: 'a1x' });
  rt.api.chatAtlasRevealCaptureBookmark(sc);
  sc.scrollTop = 0;
  const r = rt.api.chatAtlasRevealRestore(sc);
  equal(r.method, 'scroll-top', 'the fallback method is used');
  equal(sc.scrollTop, 777, 'restoring the captured position');
});

// 8/9 — supersession
await fixture('supersession: a genuine user scroll cancels the transaction and blocks restore', () => {
  const root = new El('MAIN');
  const sc = scroller();
  root.appendChild(sc);
  turn(1, 'q1', 'a1', 0, false, sc);
  const rt = runtime(root);
  rt.api.chatAtlasRevealOpenTransaction({ order: 1, qId: 'q1', currentAId: 'a1', expectedAId: 'a1x' });
  rt.api.chatAtlasRevealCaptureBookmark(sc);
  ok(sc.listeners.length > 0, 'transaction-scoped listeners are installed');
  sc.fire('wheel', {});                              // the user scrolls
  equal(rt.api.chatAtlasRevealState.superseded, true, 'the transaction is superseded');
  equal(rt.api.chatAtlasRevealScopeValid(), false, 'its scope is no longer valid, so stale callbacks are inert');
  equal(sc.listeners.length, 0, 'and its listeners are removed immediately');
  sc.scrollTop = 4321;
  const r = rt.api.chatAtlasRevealRestore(sc);
  equal(r.ok, false, 'restoration is refused');
  equal(r.reason, 'restore-superseded', 'named exactly');
  equal(sc.scrollTop, 4321, 'the user keeps their chosen position');
});

await fixture('supersession: our own movement signals never supersede the transaction', () => {
  const root = new El('MAIN');
  const sc = scroller();
  root.appendChild(sc);
  turn(1, 'q1', 'a1', 0, false, sc);
  const rt = runtime(root);
  rt.api.chatAtlasRevealOpenTransaction({ order: 1, qId: 'q1', currentAId: 'a1', expectedAId: 'a1x' });
  // Our own scroll produces a `scroll` event, not a wheel. It must not
  // supersede however trusted the browser marks it.
  sc.fire('scroll', { isTrusted: true });
  sc.fire('scroll', { isTrusted: true });
  equal(rt.api.chatAtlasRevealState.superseded, false, 'a bare scroll signal is not user intent');
  ok(sc.listeners.length > 0, 'and the transaction stays open');
  sc.fire('wheel', { isTrusted: true });
  equal(rt.api.chatAtlasRevealState.superseded, true, 'while a real wheel supersedes immediately');
});

await fixture('supersession: scrolling keys supersede, ordinary typing does not', () => {
  const root = new El('MAIN');
  const sc = scroller();
  root.appendChild(sc);
  turn(1, 'q1', 'a1', 0, false, sc);
  const rt = runtime(root);
  rt.api.chatAtlasRevealOpenTransaction({ order: 1, qId: 'q1', currentAId: 'a1', expectedAId: 'a1x' });
  rt.sandbox.W.fire('keydown', { key: 'a' });
  equal(rt.api.chatAtlasRevealState.superseded, false, 'typing is not navigation');
  rt.sandbox.W.fire('keydown', { key: 'PageDown' });
  equal(rt.api.chatAtlasRevealState.superseded, true, 'a scrolling key is');
});

// 10 — scope drift
await fixture('scope: route, generation and graph drift all make the transaction inert', () => {
  const mk = () => {
    const root = new El('MAIN');
    const sc = scroller();
    root.appendChild(sc);
    turn(1, 'q1', 'a1', 0, false, sc);
    const rt = runtime(root);
    rt.api.chatAtlasRevealOpenTransaction({ order: 1, qId: 'q1', currentAId: 'a1', expectedAId: 'a1x' });
    rt.api.chatAtlasRevealCaptureBookmark(sc);
    return { rt, sc };
  };
  const gen = mk(); gen.rt.state.generation = 9;
  equal(gen.rt.api.chatAtlasRevealScopeValid(), false, 'generation drift invalidates scope');
  equal(gen.rt.api.chatAtlasRevealRestore(gen.sc).reason, 'reveal-scope-drift', 'and blocks restore');
  const route = mk(); route.rt.state.routeKey = '/c/other';
  equal(route.rt.api.chatAtlasRevealScopeValid(), false, 'route drift invalidates scope');
  const graph = mk();
  graph.rt.sandbox.selectedPathAcquisitionState.graph.captureIdentity = 'cap-2';
  equal(graph.rt.api.chatAtlasRevealScopeValid(), true,
    'graph capture drift is SOFT: the reveal itself causes it by mounting turns');
  equal(graph.rt.api.chatAtlasRevealScopeDrift().soft, true, 'and it is classified as soft churn');
  equal(graph.rt.api.chatAtlasRevealScopeDrift().field, 'graphCaptureIdentity', 'naming the field');
  equal(gen.rt.api.chatAtlasRevealScopeDrift().hard, true, 'while generation drift is hard');
});

// 11 — listener cleanup
await fixture('listeners: every terminal path removes them', () => {
  const build = () => {
    const root = new El('MAIN');
    const sc = scroller();
    root.appendChild(sc);
    turn(1, 'q1', 'a1', 0, false, sc);
    const rt = runtime(root);
    rt.api.chatAtlasRevealOpenTransaction({ order: 1, qId: 'q1', currentAId: 'a1', expectedAId: 'a1x' });
    return { rt, sc };
  };
  for (const [label, close] of [
    ['finish/mounted', (api) => api.chatAtlasRevealFinish('target-mounted', null)],
    ['finish/unmounted', (api) => api.chatAtlasRevealFinish('target-still-unmounted', 'x')],
    ['supersede', (api) => api.chatAtlasRevealSupersede('wheel')],
  ]) {
    const { rt, sc } = build();
    ok(sc.listeners.length > 0 || rt.sandbox.W.listenerCount() > 0, `${label}: listeners installed`);
    close(rt.api);
    equal(sc.listeners.length, 0, `${label}: container listeners removed`);
    equal(rt.sandbox.W.listenerCount(), 0, `${label}: window listener removed`);
    equal(rt.api.chatAtlasRevealState.listeners.length, 0, `${label}: registry drained`);
  }
});

// 12 — disabled action
await fixture('action: the one-shot reveal moves the container exactly once', () => {
  const root = new El('MAIN');
  const sc = scroller();
  root.appendChild(sc);
  turn(1, 'q1', 'a1', 0, false, sc);
  const rt = runtime(root);
  rt.api.chatAtlasRevealOpenTransaction({ order: 1, qId: 'q1', currentAId: 'a1', expectedAId: 'a1x' });
  sc.scrollTop = 9000;
  const missing = rt.api.chatAtlasExecuteOneShotRevealAction({});
  equal(missing.executed, false, 'without a container nothing executes');
  equal(missing.reason, 'reveal-container-unavailable', 'named exactly');
  equal(sc.scrollTop, 9000, 'and nothing moved');
  const r = rt.api.chatAtlasExecuteOneShotRevealAction({ container: sc });
  equal(r.executed, true, 'the single proven action executes');
  equal(sc.scrollTop, 0, 'moving the container to absolute top');
  const d = rt.api.chatAtlasRevealDiagnostics();
  equal(d.revealTopScrollExecuted, true, 'revealTopScrollExecuted becomes true');
  equal(d.revealAttempts, 1, 'with exactly one attempt');
  sc.scrollTop = 4000;
  equal(rt.api.chatAtlasExecuteOneShotRevealAction({ container: sc }).reason,
    'reveal-attempt-exhausted', 'and a second call is refused');
  equal(sc.scrollTop, 4000, 'leaving the container untouched');
});

await fixture('action: no reveal path in production scrolls the page', () => {
  const names = [
    'chatAtlasRevealOpenTransaction', 'chatAtlasRevealCaptureBookmark',
    'chatAtlasResolveConversationScrollContainer', 'chatAtlasRevealMeasureTarget',
    'chatAtlasRevealInstallUserListeners', 'chatAtlasRevealSupersede', 'chatAtlasRevealFinish',
  ];
  for (const n of names) {
    const body = extractFunction(CORE_SOURCE, n);
    ok(!/scrollIntoView|scrollTo\(/.test(body), `${n} performs no scroll call`);
    ok(!/\.scrollTop\s*=[^=]/.test(body), `${n} assigns no scrollTop`);
  }
  // Restoration is the ONLY function permitted to move the viewport.
  const restore = extractFunction(CORE_SOURCE, 'chatAtlasRevealRestore');
  ok(/\.scrollTop\s*=[^=]/.test(restore), 'restoration moves the viewport by design');
  ok(!/scrollIntoView|scrollTo\(/.test(restore), 'but never via scrollIntoView/scrollTo');
  ok(/chatAtlasRevealInternal/.test(restore), 'and marks its movement internal');
  // Exactly two functions may move the viewport: the single reveal action and
  // the restoration. Both mark their movement internal; neither uses
  // scrollIntoView or scrollTo, and no reveal path loops.
  const action = extractFunction(CORE_SOURCE, 'chatAtlasExecuteOneShotRevealAction');
  ok(/\.scrollTop\s*=[^=]/.test(action), 'the action moves the container by design');
  ok(!/scrollIntoView|scrollTo\(/.test(action), 'but never via scrollIntoView/scrollTo');
  ok(/chatAtlasRevealInternal/.test(action), 'and marks its movement internal');
  ok(action.includes('attempts >= 1'), 'guarded by the single-attempt gate');
  for (const n of ['chatAtlasRevealRunOneShot', 'chatAtlasRevealReconcileTick']) {
    const body = extractFunction(CORE_SOURCE, n);
    ok(!/for\s*\(|while\s*\(/.test(body), `${n} contains no scrolling loop`);
  }
});

await fixture('restore: it never touches branch authority or manual override', () => {
  const restore = extractFunction(CORE_SOURCE, 'chatAtlasRevealRestore');
  for (const forbidden of [
    'manualOverrideActive', 'chatAtlasMarkManualBranchOverride', 'setActiveTurnId',
    'flashAnswer', 'centerOn', 'click(', 'chatAtlasSelectedPathOverlayEvaluate',
  ]) ok(!restore.includes(forbidden), `restoration does not use ${forbidden}`);
});

// ── One-shot reveal (Stage 2C-2ag2) ───────────────────────────────────────
// A conversation scrolled to the bottom with the target virtualized away,
// exactly as observed live (scrollTop 29956 of 31104, 6 turns mounted).

// Drive the post-scroll reconciliation to its terminal state through the
// SCHEDULED budget, the way the transaction now drives itself.
function drainReconcile(rt, max = 12) {
  let last = null;
  for (let i = 0; i < max; i += 1) {
    last = rt.api.chatAtlasRevealReconcileTick('scheduled');
    if (last && last.state !== 'awaiting-mount') return last;
  }
  return last;
}
const TQ = '7740946c-f002-4551-94d9-e6314ff85b25';
const TA = '16e81a3e-e10a-45d2-80ab-f8dc0ab64226';

function pager(section, indicator, ownerAId) {
  const group = new El('DIV');
  const label = new El('SPAN');
  label.textContent = indicator;
  const prev = new El('BUTTON'); prev.setAttribute('aria-label', 'Previous response');
  const next = new El('BUTTON'); next.setAttribute('aria-label', 'Next response');
  group.appendChild(prev); group.appendChild(label); group.appendChild(next);
  section.appendChild(group);
  return { prev, next, clicks: () => prev.clicks + next.clicks };
}

function revealWorld(opts = {}) {
  const root = new El('MAIN');
  const sc = scroller({ testId: 'conv', clientHeight: 1148, scrollHeight: 31104 });
  sc.scrollTop = opts.scrollTop ?? 29956;
  root.appendChild(sc);
  // Bottom turns are mounted; the target is not.
  turn(30, 'q30', 'a30', 29900, false, sc);
  turn(31, 'q31', 'a31', 30400, false, sc);
  const rt = runtime(root, { effectiveTurns: opts.effectiveTurns || [] });
  const clicks = { total: 0 };
  const mountTarget = (mode = 'paired') => {
    if (mode === 'wrong') { turn(2, 'q-other', 'a-other', 0, false, sc); return null; }
    if (mode === 'question-only') { turn(2, TQ, null, 0, false, sc); return null; }
    if (mode === 'duplicate') {
      const one = turn(2, TQ, TA, 0, false, sc);
      pager(one, '1/2', TA);
      const two = turn(2, TQ, TA, 600, false, sc);
      pager(two, '1/2', TA);
      return one;
    }
    const split = mode === 'split';
    const sec = turn(2, TQ, split ? null : TA, 0, split, sc);
    let answerSection = sec;
    if (split) {
      const a = new El('DIV');
      a.setAttribute('data-testid', 'conversation-turn-2-a');
      a._top = 0;
      const m = new El('DIV');
      m.setAttribute('data-message-author-role', 'assistant');
      m.setAttribute('data-message-id', TA); m._top = 0;
      a.appendChild(m); sc.appendChild(a); answerSection = a;
    }
    if (mode === 'no-pager') return sec;
    const p = pager(answerSection, '1/2', TA);
    clicks.get = () => p.clicks();
    if (mode === 'ambiguous') pager(answerSection, '1/2', TA);
    return sec;
  };
  return { rt, sc, root, mountTarget, clicks };
}
const TARGET = { order: 2, qId: TQ, currentAId: TA, expectedAId: '37ab747d-7fe1-4c25-ad63-6e9aee8e887f' };

await fixture('reveal: one top scroll mounts the exact target and the viewport is restored', () => {
  const w = revealWorld();
  const captured = w.sc.scrollTop;
  // The host mounts the top turns in response to the scroll.
  const originalRun = w.rt.api.chatAtlasRevealRunOneShot;
  w.mountTarget('paired');
  const r = originalRun(TARGET);
  equal(r.state, 'target-mounted', 'the exact target mounted');
  const d = w.rt.api.chatAtlasRevealDiagnostics();
  equal(d.revealAttempts, 1, 'exactly one attempt');
  equal(d.revealTopScrollExecuted, true, 'the one top scroll executed');
  equal(d.revealMountedQId, TQ, 'the mounted question is the target');
  equal(d.revealMountedAId, TA, 'with its paired assistant identity');
  equal(d.revealPagerPresent, true, 'and its regeneration pager is proven');
  equal(d.revealRestoreState, 'restored', 'the viewport is restored');
  equal(Math.abs(d.revealRestoreDelta) <= 2, true, `restored within rounding (delta ${d.revealRestoreDelta})`);
  equal(w.sc.scrollTop, captured, 'back at the captured position');
  equal(w.clicks.get(), 0, 'no pager control was activated');
  equal(d.revealListenerCount, 0, 'and every temporary listener is removed');
});

await fixture('reveal: a target that never mounts fails closed after one scroll', () => {
  const w = revealWorld();
  const captured = w.sc.scrollTop;
  const r = w.rt.api.chatAtlasRevealRunOneShot(TARGET);
  equal(r.state, 'awaiting-mount', 'the first tick is inconclusive');
  const last = drainReconcile(w.rt);
  equal(last.state, 'target-still-unmounted', 'the bounded window ends unmounted');
  const d = w.rt.api.chatAtlasRevealDiagnostics();
  equal(d.revealAttempts, 1, 'still exactly one attempt');
  equal(d.revealReconcileScheduledProbes, d.revealReconcileScheduledCap,
    'the reconciliation budget is spent exactly to its cap');
  equal(d.revealReconcileScheduledCap, 8, 'which is eight scheduled probes');
  equal(w.sc.scrollTop, captured, 'and the viewport is restored');
  equal(d.revealListenerCount, 0, 'with listeners removed');
});

await fixture('reveal: a different question at the target ORDER is never success', () => {
  // The effective index puts a DIFFERENT question at order 2. Matching by
  // ordinal instead of identity would call this a mounted target.
  const w = revealWorld({ effectiveTurns: [
    { order: 1, qId: 'q1', primaryAId: 'a1' },
    { order: 2, qId: 'q-other', primaryAId: 'a-other' },
  ] });
  w.mountTarget('wrong');
  w.rt.api.chatAtlasRevealRunOneShot(TARGET);
  const last = drainReconcile(w.rt);
  equal(last.state, 'target-still-unmounted', 'a turn at the same order is not the target');
  equal(last.reason, 'target-question-unmounted', 'the target question is still absent');
  equal(w.rt.api.chatAtlasRevealDiagnostics().revealMountedQId, null, 'and nothing is claimed as mounted');
});

await fixture('reveal: the target question without a paired assistant is not mounted', () => {
  const w = revealWorld();
  w.mountTarget('question-only');
  w.rt.api.chatAtlasRevealRunOneShot(TARGET);
  const last = drainReconcile(w.rt);
  equal(last.state, 'target-answer-unavailable', 'the question mounted but its answer did not');
  equal(last.reason, 'target-answer-unmounted', 'named exactly');
  equal(w.rt.api.chatAtlasRevealDiagnostics().revealMountedQId, TQ,
    'and the proven question identity is NOT discarded');
  const d = w.rt.api.chatAtlasRevealDiagnostics();
  equal(d.revealMountedAId, null, 'no assistant identity is claimed');
  equal(d.revealPagerPresent, false, 'and no pager is claimed');
});

await fixture('reveal: a duplicated target question fails closed as ambiguous', () => {
  const w = revealWorld();
  w.mountTarget('duplicate');
  const r = w.rt.api.chatAtlasRevealRunOneShot(TARGET);
  equal(r.state, 'target-mounted-ambiguous', 'two mounted copies is ambiguity');
  equal(r.reason, 'target-question-duplicated', 'named exactly');
  equal(w.rt.api.chatAtlasRevealDiagnostics().revealPagerPresent, false, 'and no pager is claimed');
});

await fixture('reveal: split user/assistant sections still prove pager ownership', () => {
  const w = revealWorld();
  w.mountTarget('split');
  const r = w.rt.api.chatAtlasRevealRunOneShot(TARGET);
  equal(r.state, 'target-mounted', 'the split topology mounts the target');
  const d = w.rt.api.chatAtlasRevealDiagnostics();
  equal([d.revealMountedQId, d.revealMountedAId], [TQ, TA], 'pairing across sections succeeds');
  equal(d.revealPagerPresent, true, 'and the pager in the answer section is owned');
});

await fixture('reveal: an ambiguous pager owner fails closed', () => {
  const w = revealWorld();
  w.mountTarget('ambiguous');
  const r = w.rt.api.chatAtlasRevealRunOneShot(TARGET);
  equal(r.state, 'target-mounted-ambiguous', 'two owning pagers is ambiguity');
  equal(w.rt.api.chatAtlasRevealDiagnostics().revealPagerPresent, false, 'no pager is claimed');
  equal(w.clicks.get(), 0, 'and nothing is clicked');
});

await fixture('reveal: a missing pager is not a mounted target', () => {
  const w = revealWorld();
  w.mountTarget('no-pager');
  w.rt.api.chatAtlasRevealRunOneShot(TARGET);
  const last = drainReconcile(w.rt);
  const d = w.rt.api.chatAtlasRevealDiagnostics();
  // Pager-unavailable is conclusive, so the very first tick terminates it.
  equal(d.revealState, 'target-mounted-pager-unavailable',
    'the target IS mounted; only its pager is unavailable');
  equal(d.revealReason, 'reveal-pager-unavailable', 'named exactly');
  ok(last, 'the drain returned a result');
  equal([d.revealMountedQId, d.revealMountedAId], [TQ, TA],
    'and both proven identities are reported, not discarded');
  equal(d.revealPagerPresent, false, 'with the pager honestly reported absent');
});

await fixture('reveal: a genuine user scroll cancels and blocks restoration', () => {
  const w = revealWorld();
  w.rt.api.chatAtlasRevealRunOneShot(TARGET);
  w.sc.fire('wheel', {});
  w.sc.scrollTop = 12345;
  w.mountTarget('paired');
  const last = w.rt.api.chatAtlasRevealReconcileTick();
  equal(last.state, 'reveal-superseded-by-user-scroll', 'the transaction is superseded');
  equal(w.sc.scrollTop, 12345, 'the user keeps their position');
  const d = w.rt.api.chatAtlasRevealDiagnostics();
  equal(d.revealUserSuperseded, true, 'supersession is reported');
  equal(d.revealRestoreState !== 'restored', true, 'and no restore ran');
});

await fixture('reveal: scope drift makes the pending transaction inert', () => {
  const w = revealWorld();
  w.rt.api.chatAtlasRevealRunOneShot(TARGET);
  w.rt.state.generation = 9;
  w.mountTarget('paired');
  const last = w.rt.api.chatAtlasRevealReconcileTick();
  equal(last.state, 'reveal-scope-drift', 'the old transaction cannot claim a mount');
  equal(w.rt.api.chatAtlasRevealDiagnostics().revealListenerCount, 0, 'and its listeners are gone');
});

await fixture('reveal: no path can scroll to top twice', () => {
  const w = revealWorld();
  w.rt.api.chatAtlasRevealRunOneShot(TARGET);
  equal(w.sc.scrollTop, 0, 'the single scroll reached the top');
  w.sc.scrollTop = 5000;
  const again = w.rt.api.chatAtlasExecuteOneShotRevealAction({ container: w.sc });
  equal(again.executed, false, 'a second action is refused');
  equal(again.reason, 'reveal-attempt-exhausted', 'because the one attempt is spent');
  equal(w.sc.scrollTop, 5000, 'and nothing moved');
  const rerun = w.rt.api.chatAtlasRevealRunOneShot(TARGET);
  equal(rerun.reason, 'reveal-already-run', 'and the transaction cannot be re-opened');
  equal(w.rt.api.chatAtlasRevealDiagnostics().revealAttempts, 1, 'attempts stay at one');
});

await fixture('reveal: the whole run activates no branch or pager control', () => {
  const w = revealWorld();
  w.mountTarget('paired');
  w.rt.api.chatAtlasRevealRunOneShot(TARGET);
  equal(w.clicks.get(), 0, 'zero pager activations across the entire run');
  const run = extractFunction(CORE_SOURCE, 'chatAtlasRevealRunOneShot');
  const tick = extractFunction(CORE_SOURCE, 'chatAtlasRevealReconcileTick');
  const measure = extractFunction(CORE_SOURCE, 'chatAtlasRevealMeasureTarget');
  for (const [name, body] of [['run', run], ['tick', tick], ['measure', measure]]) {
    ok(!/\.click\(/.test(body), `${name} activates no control`);
    ok(!body.includes('chatAtlasRunNativeConvergence'), `${name} starts no convergence`);
    ok(!body.includes('manualOverrideActive'), `${name} touches no manual override`);
  }
});

// ── Boot-order readiness (Stage 2C-2ag3) ──────────────────────────────────
// At boot the conversation has not mounted yet, so container discovery finds
// no turns. That is EARLY, not terminal: the reveal must wait through a small
// number of existing authority notifications and only then move the page once.
function bootWorld() {
  const root = new El('MAIN');
  const rt = runtime(root);
  const attach = (opts = {}) => {
    const sc = scroller({ testId: 'conv', clientHeight: 1148, scrollHeight: 31104 });
    sc.scrollTop = opts.scrollTop ?? 29956;
    root.appendChild(sc);
    turn(30, 'q30', 'a30', 29900, false, sc);
    if (opts.second) {
      const other = scroller({ testId: 'other' });
      root.appendChild(other);
      turn(31, 'q31', 'a31', 0, false, other);
    }
    if (opts.target !== false) {
      const sec = turn(2, TQ, TA, 0, false, sc);
      pager(sec, '1/2', TA);
    }
    return sc;
  };
  return { rt, root, attach };
}

await fixture('readiness: an unmounted conversation waits instead of failing terminally', () => {
  const w = bootWorld();
  const first = w.rt.api.chatAtlasRevealRunOneShot(TARGET);
  equal(first.state, 'waiting-for-container-readiness', 'the early attempt waits');
  equal(first.reason, 'reveal-container-no-mounted-turns', 'because nothing has mounted yet');
  let d = w.rt.api.chatAtlasRevealDiagnostics();
  equal(d.revealReadinessState, 'waiting', 'readiness state is waiting');
  equal(d.revealReadinessAttempts, 1, 'one readiness evaluation is counted');
  equal(d.revealAttempts, 0, 'the scroll attempt is NOT consumed');
  equal(d.revealTopScrollExecuted, false, 'and nothing was scrolled');
  equal(d.revealBookmarkCaptured, false, 'no premature bookmark is captured');
  equal(d.revealBookmarkScrollTop, 0, 'and no fake scroll position is recorded');
  // The conversation mounts; the next existing notification resolves it.
  const sc = w.attach();
  const captured = sc.scrollTop;
  const second = w.rt.api.chatAtlasRevealRunOneShot(w.rt.api.chatAtlasRevealState.readinessTarget);
  equal(second.state, 'target-mounted', 'the reveal now completes');
  d = w.rt.api.chatAtlasRevealDiagnostics();
  equal(d.revealReadinessState, 'ready', 'readiness reached ready');
  equal(d.revealAttempts, 1, 'exactly one scroll attempt');
  equal(d.revealTopScrollExecuted, true, 'the single top scroll executed');
  equal(d.revealMountedQId, TQ, 'the exact target is measured');
  equal(d.revealRestoreState, 'restored', 'and the viewport is restored');
  equal(sc.scrollTop, captured, 'back at the captured position');
});

await fixture('readiness: it gives up after the scheduled budget without ever scrolling', () => {
  const w = bootWorld();
  let last = w.rt.api.chatAtlasRevealRunOneShot(TARGET);
  // Only SCHEDULED probes spend the budget; drive them all.
  for (let i = 0; i < 12 && w.rt.sandbox.W.pendingTimers(); i += 1) {
    last = w.rt.sandbox.W.runTimers() ? w.rt.api.chatAtlasRevealDiagnostics() : last;
  }
  const d = w.rt.api.chatAtlasRevealDiagnostics();
  equal(d.revealReadinessState, 'timeout', 'reported as a timeout');
  equal(d.revealReadinessScheduledProbes, d.revealReadinessScheduledCap, 'at exactly the scheduled cap');
  equal(d.revealReadinessScheduledCap, 9, 'which is nine across the sparse window');
  equal(d.revealAttempts, 0, 'revealAttempts stays 0');
  equal(d.revealTopScrollExecuted, false, 'topScrollExecuted stays false');
  equal(d.revealBookmarkCaptured, false, 'no bookmark was captured');
  equal(d.revealRestoreState, 'idle', 'and restoration never ran');
});

await fixture('readiness: a timed-out transaction never proceeds to scroll later', () => {
  const w = bootWorld();
  w.rt.api.chatAtlasRevealRunOneShot(TARGET);
  for (let i = 0; i < 12 && w.rt.sandbox.W.pendingTimers(); i += 1) w.rt.sandbox.W.runTimers();
  const sc = w.attach();
  const before = sc.scrollTop;
  const after = w.rt.api.chatAtlasRevealRunOneShot(TARGET);
  equal(after.reason, 'reveal-already-run', 'the finished transaction cannot restart');
  equal(sc.scrollTop, before, 'and the page is not moved');
  equal(w.rt.api.chatAtlasRevealDiagnostics().revealTopScrollExecuted, false, 'no scroll ever executed');
});

await fixture('readiness: hard page drift makes a pending wait inert, boot churn does not', () => {
  // Graph capture changes constantly while a conversation loads — that is the
  // very churn readiness exists to survive. Only page identity cancels.
  const soft = bootWorld();
  equal(soft.rt.api.chatAtlasRevealRunOneShot(TARGET).state, 'waiting-for-container-readiness', 'it waits');
  soft.rt.sandbox.selectedPathAcquisitionState.graph.captureIdentity = 'cap-2';
  const sc = soft.attach();
  const resumed = soft.rt.api.chatAtlasRevealRunOneShot(TARGET);
  equal(resumed.state, 'target-mounted', 'boot graph churn does not cancel readiness');
  equal(soft.rt.api.chatAtlasRevealDiagnostics().revealAttempts, 1, 'and the reveal still runs once');
  equal(sc.scrollTop, 29956, 'with the viewport restored');
  for (const drift of ['route', 'generation']) {
    const w = bootWorld();
    equal(w.rt.api.chatAtlasRevealRunOneShot(TARGET).state, 'waiting-for-container-readiness', `${drift}: waiting`);
    if (drift === 'route') w.rt.state.routeKey = '/c/other';
    if (drift === 'generation') w.rt.state.generation = 9;
    const sc = w.attach();
    const before = sc.scrollTop;
    const last = w.rt.api.chatAtlasRevealRunOneShot(TARGET);
    equal(last.state, 'reveal-scope-drift', `${drift}: the pending wait is inert`);
    equal(sc.scrollTop, before, `${drift}: nothing is scrolled`);
    equal(w.rt.api.chatAtlasRevealDiagnostics().revealAttempts, 0, `${drift}: no attempt consumed`);
  }
});

await fixture('readiness: once the reveal begins, later notifications cannot start a second one', () => {
  const w = bootWorld();
  w.rt.api.chatAtlasRevealRunOneShot(TARGET);
  const sc = w.attach();
  equal(w.rt.api.chatAtlasRevealRunOneShot(TARGET).state, 'target-mounted', 'the reveal runs once');
  sc.scrollTop = 5000;
  const again = w.rt.api.chatAtlasRevealRunOneShot(TARGET);
  equal(again.reason, 'reveal-already-run', 'a later notification is refused');
  equal(sc.scrollTop, 5000, 'and nothing moves');
  equal(w.rt.api.chatAtlasRevealDiagnostics().revealAttempts, 1, 'still exactly one attempt');
});

await fixture('readiness: an ambiguous container after waiting fails closed without scrolling', () => {
  const w = bootWorld();
  equal(w.rt.api.chatAtlasRevealRunOneShot(TARGET).state, 'waiting-for-container-readiness', 'it waits first');
  const sc = w.attach({ second: true });
  const before = sc.scrollTop;
  const last = w.rt.api.chatAtlasRevealRunOneShot(TARGET);
  equal(last.state, 'waiting-for-container-readiness', 'ambiguity is not readiness');
  equal(last.reason, 'reveal-container-ambiguous', 'named exactly');
  equal(sc.scrollTop, before, 'and nothing is scrolled');
  equal(w.rt.api.chatAtlasRevealDiagnostics().revealAttempts, 0, 'no attempt is consumed');
});

// ── Compensating restore (Stage 2C-2ag4) ──────────────────────────────────
// The page was moved by our one scroll. Every terminal path that is still safe
// must put it back BEFORE writing its terminal state.
function driftWorld(opts = {}) {
  const w = bootWorld();
  const sc = w.attach({ target: opts.target !== false });
  const captured = sc.scrollTop;
  const first = w.rt.api.chatAtlasRevealRunOneShot(TARGET);
  return { ...w, sc, captured, first };
}

await fixture('restore: graph-capture churn after the scroll is soft and still restores', () => {
  const w = driftWorld({ target: false });
  equal(w.rt.api.chatAtlasRevealDiagnostics().revealTopScrollExecuted, true, 'the scroll executed');
  // Mounting turns re-captures the graph — exactly what the reveal caused.
  w.rt.sandbox.selectedPathAcquisitionState.graph.captureIdentity = 'cap-after-reveal';
  const last = drainReconcile(w.rt);
  const d = w.rt.api.chatAtlasRevealDiagnostics();
  equal(d.revealScopeHardInvalidation, false, 'the churn is not a hard invalidation');
  equal(d.revealScopeDriftField, 'graphCaptureIdentity', 'the drifting field is named');
  equal(last.state, 'reveal-soft-scope-drift-restored', 'and the terminal state says so');
  equal(d.revealRestoreState, 'restored', 'restoration ran');
  equal(w.sc.scrollTop, w.captured, 'and the viewport is back');
  equal(Math.abs(d.revealRestoreDelta) <= 2, true, `delta near zero (${d.revealRestoreDelta})`);
});

await fixture('restore: the divergence projection moving is soft churn, not drift', () => {
  // Mounting the target changes what the publisher reports as the current
  // first divergence. That is our own doing and must not abort the transaction.
  const w = driftWorld({ target: false });
  w.rt.sandbox.chatAtlasDefaultOverlayState.revealTargetCurrentAId = 'a-now-different';
  const drift = w.rt.api.chatAtlasRevealScopeDrift();
  equal(drift.hard, false, 'the projection move is not hard');
  equal(drift.soft, true, 'it is soft churn');
  equal(drift.field, 'divergenceFingerprint', 'naming the field');
  const last = drainReconcile(w.rt);
  equal(last.state, 'reveal-soft-scope-drift-restored', 'measurement continued to a soft terminal');
  const d = w.rt.api.chatAtlasRevealDiagnostics();
  equal(d.revealRestoreState, 'restored', 'and restoration ran');
  equal(w.sc.scrollTop, w.captured, 'with the viewport back');
});

await fixture('restore: an unmounted target still restores before failing', () => {
  const w = driftWorld({ target: false });
  const last = drainReconcile(w.rt);
  equal(last.state, 'target-still-unmounted', 'the bounded window ends unmounted');
  const d = w.rt.api.chatAtlasRevealDiagnostics();
  equal(d.revealRestoreState, 'restored', 'but restoration still ran');
  equal(w.sc.scrollTop, w.captured, 'and the page is back where it was');
});

await fixture('restore: route drift after the scroll refuses to restore over a new page', () => {
  const w = driftWorld({ target: false });
  w.rt.state.routeKey = '/c/somewhere-else';
  const last = w.rt.api.chatAtlasRevealReconcileTick();
  equal(last.state, 'reveal-scope-drift', 'route drift is a hard invalidation');
  const d = w.rt.api.chatAtlasRevealDiagnostics();
  equal(d.revealScopeHardInvalidation, true, 'classified as hard');
  equal(d.revealScopeDriftField, 'routeKey', 'naming the field');
  equal(d.revealRestoreState, 'skipped', 'restoration is skipped, not left idle');
  equal(d.revealRestoreReason, 'restore-unsafe:routeKey', 'with an exact reason');
});

await fixture('restore: a genuine user scroll is never restored over', () => {
  const w = driftWorld({ target: false });
  w.sc.fire('wheel', {});
  w.sc.scrollTop = 4242;
  const last = w.rt.api.chatAtlasRevealReconcileTick();
  equal(last.state, 'reveal-superseded-by-user-scroll', 'the user wins');
  const d = w.rt.api.chatAtlasRevealDiagnostics();
  equal(d.revealRestoreState, 'skipped', 'restoration is skipped');
  equal(d.revealRestoreReason, 'restore-superseded', 'with an exact reason');
  equal(w.sc.scrollTop, 4242, 'and the user keeps their position');
});

await fixture('restore: ambiguity and a missing pager both restore before failing', () => {
  for (const mode of ['ambiguous', 'no-pager']) {
    const w = bootWorld();
    const sc = w.attach({ target: false });
    const captured = sc.scrollTop;
    w.rt.api.chatAtlasRevealRunOneShot(TARGET);
    if (mode === 'ambiguous') {
      const one = turn(2, TQ, TA, 0, false, sc); pager(one, '1/2', TA); pager(one, '1/2', TA);
    } else {
      turn(2, TQ, TA, 0, false, sc);
    }
    drainReconcile(w.rt);
    const d = w.rt.api.chatAtlasRevealDiagnostics();
    equal(d.revealRestoreState, 'restored', `${mode}: restoration ran`);
    equal(sc.scrollTop, captured, `${mode}: viewport is back`);
  }
});

await fixture('restore: it never runs twice and never leaves a permitted restore idle', () => {
  const w = driftWorld();
  const d = w.rt.api.chatAtlasRevealDiagnostics();
  equal(d.revealRestoreState, 'restored', 'the successful reveal restored');
  equal(w.sc.scrollTop, w.captured, 'at the captured position');
  // A second terminate must not move the page again.
  w.sc.scrollTop = 111;
  w.rt.api.chatAtlasRevealTerminate('target-mounted', null);
  equal(w.sc.scrollTop, 111, 'a repeat terminate does not restore twice');
  equal(w.rt.api.chatAtlasRevealRestorePermitted(), false, 'and restoration is no longer permitted');
});

await fixture('restore: no terminal path can be written while a permitted restore is idle', () => {
  const term = extractFunction(CORE_SOURCE, 'chatAtlasRevealTerminate');
  ok(term.indexOf('chatAtlasRevealRestore(') < term.indexOf('chatAtlasRevealFinish('),
    'restoration is attempted before the terminal state is written');
  const tick = extractFunction(CORE_SOURCE, 'chatAtlasRevealReconcileTick');
  ok(!tick.includes('chatAtlasRevealFinish('), 'the tick never writes a terminal state directly');
  ok(tick.includes('chatAtlasRevealTerminate('), 'it always exits through the compensating path');
  const run = extractFunction(CORE_SOURCE, 'chatAtlasRevealRunOneShot');
  // Post-action failure must compensate; the pre-scroll readiness paths moved
  // nothing and legitimately exit directly.
  const proceed = extractFunction(CORE_SOURCE, 'chatAtlasRevealProceedAfterOpen');
  ok(proceed.includes("chatAtlasRevealTerminate('reveal-container-unavailable', action.reason)"),
    'the post-action failure path compensates');
  const afterAction = proceed.slice(proceed.indexOf('const action ='));
  ok(!afterAction.includes('chatAtlasRevealFinish('),
    'nothing after the scroll writes a terminal state directly');
  ok(run.includes('chatAtlasRevealFinish('),
    'while pre-scroll readiness exits need no compensation');
});

// ── Late readiness re-entry (Stage 2C-2ag5) ───────────────────────────────
// Live proof: two authority probes found nothing mounted, then the
// conversation finished mounting and NO further notification arrived — the
// transaction sat waiting beside a resolved container forever.
await fixture('late readiness: a scheduled probe re-enters when notifications stop', () => {
  const w = bootWorld();
  equal(w.rt.api.chatAtlasRevealRunOneShot(TARGET).state, 'waiting-for-container-readiness', 'probe 1 waits');
  let d = w.rt.api.chatAtlasRevealDiagnostics();
  equal(d.revealReadinessRetryPending, true, 'a retry is scheduled');
  equal(d.revealReadinessRetryDelayMs, 500, 'with a bounded first target');
  equal(w.rt.sandbox.W.pendingTimers(), 1, 'exactly one timer is outstanding');
  // No further authority notification: the conversation mounts on its own.
  const sc = w.attach();
  const captured = sc.scrollTop;
  equal(w.rt.sandbox.W.runTimers(), 1, 'the scheduled probe fires');
  d = w.rt.api.chatAtlasRevealDiagnostics();
  equal(d.revealReadinessState, 'ready', 'readiness reaches ready');
  equal(d.revealReadinessReason, null, 'and the stale reason is cleared');
  equal(d.revealAttempts, 1, 'the reveal runs exactly once');
  equal(d.revealTopScrollExecuted, true, 'with its single top scroll');
  equal(d.revealRestoreState, 'restored', 'and restoration ran');
  equal(sc.scrollTop, captured, 'the viewport is back');
  equal(w.rt.sandbox.W.pendingTimers(), 0, 'no timer is left installed');
  equal(d.revealReadinessRetryPending, false, 'and none is pending');
});

await fixture('late readiness: an unresolved container times out without scrolling', () => {
  const w = bootWorld();
  w.rt.api.chatAtlasRevealRunOneShot(TARGET);
  for (let i = 0; i < 12 && w.rt.sandbox.W.pendingTimers(); i += 1) w.rt.sandbox.W.runTimers();
  const d = w.rt.api.chatAtlasRevealDiagnostics();
  equal(d.revealReadinessState, 'timeout', 'readiness times out');
  equal(d.revealReadinessScheduledProbes, d.revealReadinessScheduledCap, 'at exactly the scheduled cap');
  equal(d.revealAttempts, 0, 'zero scroll attempts');
  equal(d.revealTopScrollExecuted, false, 'nothing scrolled');
  equal(w.rt.sandbox.W.pendingTimers(), 0, 'and no timer survives the timeout');
});

await fixture('late readiness: a notification and the timer cannot both run the reveal', () => {
  const w = bootWorld();
  w.rt.api.chatAtlasRevealRunOneShot(TARGET);
  const sc = w.attach();
  // The authority notification wins the race first.
  equal(w.rt.api.chatAtlasRevealRunOneShot(TARGET).state, 'target-mounted', 'the notification completes it');
  const attemptsAfterFirst = w.rt.api.chatAtlasRevealDiagnostics().revealAttempts;
  sc.scrollTop = 777;
  w.rt.sandbox.W.runTimers();                       // the stale timer fires late
  const d = w.rt.api.chatAtlasRevealDiagnostics();
  equal(d.revealAttempts, attemptsAfterFirst, 'the late timer does not run a second reveal');
  equal(sc.scrollTop, 777, 'and nothing is moved again');
});

await fixture('late readiness: duplicate notifications never stack retries', () => {
  const w = bootWorld();
  w.rt.api.chatAtlasRevealRunOneShot(TARGET);
  equal(w.rt.sandbox.W.pendingTimers(), 1, 'the first probe schedules one timer');
  w.rt.api.chatAtlasRevealRunOneShot(TARGET);
  equal(w.rt.sandbox.W.pendingTimers(), 1, 'a second probe does not stack another');
  equal(w.rt.api.chatAtlasRevealDiagnostics().revealReadinessRetryScheduled, 1,
    'and only one schedule is ever recorded while one is pending');
});

await fixture('late readiness: the scheduler guards are individually enforced', () => {
  const st = () => w.rt.api.chatAtlasRevealState;
  const w = bootWorld();
  // Not waiting => never schedules.
  equal(w.rt.api.chatAtlasRevealScheduleReadinessRetry(), false, 'idle state schedules nothing');
  equal(w.rt.sandbox.W.pendingTimers(), 0, 'with no timer created');
  w.rt.api.chatAtlasRevealRunOneShot(TARGET);
  equal(st().transactionState, 'waiting-for-container-readiness', 'now waiting');
  // Pending guard.
  equal(w.rt.api.chatAtlasRevealScheduleReadinessRetry(), false, 'a pending retry blocks another');
  equal(w.rt.sandbox.W.pendingTimers(), 1, 'still exactly one timer');
  // Cap guard.
  w.rt.api.chatAtlasRevealCancelReadinessRetry();
  st().readinessScheduledProbes = 9;
  equal(w.rt.api.chatAtlasRevealScheduleReadinessRetry(), false, 'the scheduled cap blocks scheduling');
  equal(w.rt.sandbox.W.pendingTimers(), 0, 'and creates no timer');
  // Cancel is idempotent and clears the pending flag.
  st().readinessScheduledProbes = 1;
  equal(w.rt.api.chatAtlasRevealScheduleReadinessRetry(), true, 'below the cap it schedules');
  equal(w.rt.api.chatAtlasRevealCancelReadinessRetry(), true, 'cancel removes it');
  equal(w.rt.api.chatAtlasRevealCancelReadinessRetry(), false, 'and is idempotent');
  equal(st().readinessRetryPending, false, 'leaving nothing pending');
});

await fixture('late readiness: a superseded generation callback does nothing', () => {
  const w = bootWorld();
  w.rt.api.chatAtlasRevealRunOneShot(TARGET);
  const st = w.rt.api.chatAtlasRevealState;
  // A newer schedule supersedes the outstanding one; the old callback must be
  // inert even though the transaction is still waiting.
  st.readinessRetryPending = false;
  w.rt.api.chatAtlasRevealScheduleReadinessRetry();
  equal(w.rt.sandbox.W.pendingTimers(), 2, 'both callbacks are queued for the test');
  const sc = w.attach();
  const captured = sc.scrollTop;
  w.rt.sandbox.W.runTimers();
  const d = w.rt.api.chatAtlasRevealDiagnostics();
  equal(d.revealAttempts, 1, 'exactly one reveal ran despite two queued callbacks');
  equal(sc.scrollTop, captured, 'and the viewport is restored once');
});

await fixture('late readiness: reaching ready leaves no outstanding timer', () => {
  const w = bootWorld();
  w.rt.api.chatAtlasRevealRunOneShot(TARGET);
  equal(w.rt.sandbox.W.pendingTimers(), 1, 'a retry is outstanding while waiting');
  w.attach();
  // Re-enter through the notification path; ready must cancel the retry it
  // no longer needs, independently of the terminal cleanup.
  const beforeGen = w.rt.api.chatAtlasRevealDiagnostics().revealReadinessRetryGeneration;
  w.rt.api.chatAtlasRevealRunOneShot(TARGET);
  const d = w.rt.api.chatAtlasRevealDiagnostics();
  equal(d.revealReadinessState, 'ready', 'readiness reached ready');
  equal(d.revealReadinessRetryPending, false, 'no retry remains pending');
  equal(w.rt.sandbox.W.pendingTimers(), 0, 'and no timer is installed');
  equal(d.revealReadinessRetryGeneration, beforeGen, 'no new retry was scheduled on the way');
});

await fixture('late readiness: drift before the scheduled probe makes it inert', () => {
  for (const drift of ['route', 'generation']) {
    const w = bootWorld();
    w.rt.api.chatAtlasRevealRunOneShot(TARGET);
    if (drift === 'route') w.rt.state.routeKey = '/c/elsewhere';
    if (drift === 'generation') w.rt.state.generation = 12;
    const sc = w.attach();
    const before = sc.scrollTop;
    w.rt.sandbox.W.runTimers();
    const d = w.rt.api.chatAtlasRevealDiagnostics();
    equal(d.revealAttempts, 0, `${drift}: no scroll attempt`);
    equal(sc.scrollTop, before, `${drift}: nothing moved`);
    equal(w.rt.sandbox.W.pendingTimers(), 0, `${drift}: no timer left`);
  }
});

await fixture('late readiness: supersession and finish both clean up the timer', () => {
  const sup = bootWorld();
  sup.rt.api.chatAtlasRevealRunOneShot(TARGET);
  equal(sup.rt.sandbox.W.pendingTimers(), 1, 'a timer is outstanding');
  sup.rt.api.chatAtlasRevealSupersede('wheel');
  equal(sup.rt.sandbox.W.pendingTimers(), 0, 'supersession cancels it');
  const fin = bootWorld();
  fin.rt.api.chatAtlasRevealRunOneShot(TARGET);
  fin.rt.api.chatAtlasRevealFinish('target-still-unmounted', 'x');
  equal(fin.rt.sandbox.W.pendingTimers(), 0, 'and so does finishing');
});

await fixture('late readiness: waiting can never coexist with a resolved container and no retry', () => {
  const w = bootWorld();
  w.rt.api.chatAtlasRevealRunOneShot(TARGET);
  w.attach();
  const d = w.rt.api.chatAtlasRevealDiagnostics();
  const stuck = d.revealReadinessState === 'waiting'
    && d.revealContainerState === 'resolved'
    && d.revealReadinessRetryPending === false
    && d.revealReadinessAttempts < d.revealReadinessCap;
  equal(stuck, false, 'the stuck state observed live is now unreachable');
  ok(d.revealReadinessRetryPending === true || d.revealReadinessState !== 'waiting',
    'either a retry is pending or readiness has already left waiting');
});

await fixture('late readiness: the redundant callback guards are all present', () => {
  // These three guards each cover a case the others also cover, so no
  // behavioural fixture can distinguish removing one: runOneShot's own
  // re-entry guard, the generation check and the state check overlap by
  // design. They are pinned structurally so defence-in-depth cannot be
  // silently thinned.
  const sched = extractFunction(CORE_SOURCE, 'chatAtlasRevealScheduleReadinessRetry');
  ok(sched.includes('if (Number(st.readinessRetryGeneration || 0) !== generation) return;'),
    'the fired callback checks its own generation');
  ok(sched.includes("if (st.transactionState !== 'waiting-for-container-readiness') return;"),
    'and that the transaction is still waiting');
  ok(sched.includes('if (st.readinessRetryPending === true) return false;'), 'duplicates are refused');
  ok(sched.includes('>= CHAT_ATLAS_REVEAL_READINESS_SCHEDULED_MAX) return false;'),
    'the reserved scheduled cap is enforced');
  ok(sched.includes('>= CHAT_ATLAS_REVEAL_READINESS_DEADLINE_MS) return false;'),
    'and so is the hard deadline');
  const run = extractFunction(CORE_SOURCE, 'chatAtlasRevealRunOneShot');
  // There are two ready transitions — the normal one and the late-admit path
  // inside the exhausted-budget branch. BOTH must cancel their retry first.
  const readyPositions = [];
  for (let i = run.indexOf("st.readinessState = 'ready';"); i >= 0;
    i = run.indexOf("st.readinessState = 'ready';", i + 1)) readyPositions.push(i);
  equal(readyPositions.length, 2, 'both ready transitions are present');
  for (const idx of readyPositions) {
    const cancelIdx = run.lastIndexOf('chatAtlasRevealCancelReadinessRetry();', idx);
    ok(cancelIdx > 0 && idx - cancelIdx < 400,
      `a ready transition at ${idx} cancels its outstanding retry immediately before`);
  }
  const finish = extractFunction(CORE_SOURCE, 'chatAtlasRevealFinish');
  ok(finish.includes('chatAtlasRevealCancelReadinessRetry();'), 'and every terminal exit cancels it too');
});

// ── Readiness budget accounting (Stage 2C-2ag6) ───────────────────────────
// Live proof: two boot authority publications spent two of three attempts,
// only one 250 ms retry ran, and ChatGPT mounted the turns after that.
function budgetWorld() {
  const clock = { now: 1000 };
  const root = new El('MAIN');
  const rt = runtime(root, { clock });
  const attach = () => {
    const sc = scroller({ testId: 'conv', clientHeight: 1148, scrollHeight: 31104 });
    sc.scrollTop = 29848;
    root.appendChild(sc);
    turn(30, 'q30', 'a30', 29800, false, sc);
    const sec = turn(2, TQ, TA, 0, false, sc);
    pager(sec, '1/2', TA);
    return sc;
  };
  return { rt, root, clock, attach };
}

await fixture('budget: boot authority noise never spends the scheduled budget', () => {
  const w = budgetWorld();
  for (let i = 0; i < 6; i += 1) w.rt.api.chatAtlasRevealRunOneShot(TARGET);
  const d = w.rt.api.chatAtlasRevealDiagnostics();
  equal(d.revealReadinessAuthorityProbes, 6, 'all six probes are counted as authority probes');
  equal(d.revealReadinessScheduledProbes, 0, 'and none consumed the scheduled budget');
  equal(d.revealReadinessScheduledCap, 9, 'the reserved budget is nine probes');
  equal(d.revealReadinessState, 'waiting', 'readiness is still waiting, not timed out');
  equal(w.rt.sandbox.W.pendingTimers(), 1, 'with exactly one timer outstanding');
  equal(d.revealAttempts, 0, 'and no scroll attempt consumed');
});

await fixture('budget: a container that resolves after a second is still admitted', () => {
  const w = budgetWorld();
  w.rt.api.chatAtlasRevealRunOneShot(TARGET);
  // Two scheduled probes fire while nothing is mounted.
  const t0 = w.clock.now;
  w.clock.now = t0 + 500; w.rt.sandbox.W.runTimers();
  w.clock.now = t0 + 1500; w.rt.sandbox.W.runTimers();
  let d = w.rt.api.chatAtlasRevealDiagnostics();
  equal(d.revealReadinessScheduledProbes, 2, 'two scheduled probes are spent');
  equal(d.revealReadinessState, 'waiting', 'still waiting, well inside the window');
  // ChatGPT finally mounts at ~1 s.
  const sc = w.attach();
  const captured = sc.scrollTop;
  w.clock.now = t0 + 12000; w.rt.sandbox.W.runTimers();
  d = w.rt.api.chatAtlasRevealDiagnostics();
  equal(d.revealReadinessState, 'ready', 'the late probe admits it');
  equal(d.revealAttempts, 1, 'the reveal runs exactly once');
  equal(d.revealRestoreState, 'restored', 'and restoration ran');
  equal(sc.scrollTop, captured, 'with the viewport back');
  ok(d.revealReadinessReadyElapsedMs >= 3000, `ready elapsed is reported (${d.revealReadinessReadyElapsedMs} ms)`);
  ok(d.revealReadinessFirstResolvedAtNavigationMs > 0, 'first-resolved time is recorded');
  equal(w.rt.sandbox.W.pendingTimers(), 0, 'no timer is left behind');
});

await fixture('budget: the window spans roughly forty seconds before timing out', () => {
  const w = budgetWorld();
  const start = w.clock.now;
  w.rt.api.chatAtlasRevealRunOneShot(TARGET);
  const targets = [500, 1500, 3000, 6000, 10000, 16000, 24000, 34000, 40000];
  for (const t of targets) { w.clock.now = start + t; w.rt.sandbox.W.runTimers(); }
  const d = w.rt.api.chatAtlasRevealDiagnostics();
  equal(d.revealReadinessScheduledProbes, 9, 'all nine scheduled probes ran');
  equal(d.revealReadinessState, 'timeout', 'and only then did it time out');
  equal(d.revealReadinessDeadlineMs, 40000, 'the hard deadline is forty seconds');
  equal(d.revealReadinessTerminalState, 'timeout', 'the terminal state is recorded');
  const frozen = d.revealReadinessTerminalElapsedMs;
  w.clock.now += 60000;
  equal(w.rt.api.chatAtlasRevealDiagnostics().revealReadinessTerminalElapsedMs, frozen,
    'and terminal elapsed time is frozen, not inflated by later reads');
  equal(w.rt.api.chatAtlasRevealDiagnostics().revealReadinessElapsedMs, frozen,
    'the live elapsed field reports the frozen value too');
  equal(d.revealAttempts, 0, 'zero scroll attempts');
  equal(d.revealTopScrollExecuted, false, 'nothing scrolled');
  equal(d.revealBookmarkCaptured, false, 'and no bookmark was captured');
  equal(w.rt.sandbox.W.pendingTimers(), 0, 'with no timer left pending');
});

await fixture('budget: a container resolving at the final probe is admitted, not timed out', () => {
  const w = budgetWorld();
  w.rt.api.chatAtlasRevealRunOneShot(TARGET);
  const start = w.clock.now;
  for (const t of [500, 1500, 3000, 6000, 10000, 16000, 24000]) {
    w.clock.now = start + t; w.rt.sandbox.W.runTimers();
  }
  equal(w.rt.api.chatAtlasRevealDiagnostics().revealReadinessScheduledProbes, 7, 'seven probes spent');
  const sc = w.attach();                                   // mounts just in time
  w.clock.now = start + 34000; w.rt.sandbox.W.runTimers();
  const d = w.rt.api.chatAtlasRevealDiagnostics();
  equal(d.revealReadinessState, 'ready', 'the final probe admits the container');
  equal(d.revealAttempts, 1, 'and the reveal runs');
  equal(sc.scrollTop, 29848, 'with the viewport restored');
});

await fixture('budget: the final recheck rescues a container resolving mid-timeout', () => {
  // The budget is spent, but the container resolved between the probe and the
  // terminal decision. A stale prior result must not time it out.
  const w = budgetWorld();
  const start = w.clock.now;
  w.rt.api.chatAtlasRevealRunOneShot(TARGET);
  // Spend every probe but the last.
  for (const t of [500, 1500, 3000, 6000, 10000, 16000, 24000, 34000]) {
    w.clock.now = start + t; w.rt.sandbox.W.runTimers();
  }
  equal(w.rt.api.chatAtlasRevealDiagnostics().revealReadinessScheduledProbes, 8, 'eight probes spent');
  // The container resolves only when the FINAL probe asks its second question.
  let asked = 0;
  const realQuery = w.root.querySelectorAll.bind(w.root);
  w.rt.sandbox.D.querySelectorAll = (sel) => {
    if (String(sel).includes('conversation-turn-')) {
      asked += 1;
      if (asked === 2) w.attach();
    }
    return realQuery(sel);
  };
  w.clock.now = start + 40000; w.rt.sandbox.W.runTimers();
  const d = w.rt.api.chatAtlasRevealDiagnostics();
  equal(d.revealReadinessState, 'ready', 'the final recheck admits it');
  equal(d.revealAttempts, 1, 'and the reveal proceeds exactly once');
  ok(d.revealReadinessState !== 'timeout', 'it is never timed out on a stale result');
});

await fixture('budget: an authority probe and a pending timer produce one reveal only', () => {
  const w = budgetWorld();
  w.rt.api.chatAtlasRevealRunOneShot(TARGET);
  const sc = w.attach();
  // Authority wins the race.
  equal(w.rt.api.chatAtlasRevealRunOneShot(TARGET).state, 'target-mounted', 'authority completes it');
  sc.scrollTop = 555;
  w.clock.now += 250; w.rt.sandbox.W.runTimers();
  const d = w.rt.api.chatAtlasRevealDiagnostics();
  equal(d.revealAttempts, 1, 'the late timer does not start a second reveal');
  equal(sc.scrollTop, 555, 'and nothing is moved again');
});

await fixture('budget: drift before a scheduled probe keeps it inert', () => {
  for (const drift of ['route', 'generation']) {
    const w = budgetWorld();
    w.rt.api.chatAtlasRevealRunOneShot(TARGET);
    if (drift === 'route') w.rt.state.routeKey = '/c/elsewhere';
    if (drift === 'generation') w.rt.state.generation = 42;
    const sc = w.attach();
    const before = sc.scrollTop;
    w.clock.now += 250; w.rt.sandbox.W.runTimers();
    const d = w.rt.api.chatAtlasRevealDiagnostics();
    equal(d.revealAttempts, 0, `${drift}: no scroll`);
    equal(sc.scrollTop, before, `${drift}: nothing moved`);
    equal(w.rt.sandbox.W.pendingTimers(), 0, `${drift}: no timer survives`);
  }
});

// ── Sparse 40-second window (Stage 2C-2ag7) ───────────────────────────────
// Live proof: the container was ready by ~32.8 s after navigation, long past
// the old 8 s deadline. The window is now sparse and absolute-timed.
await fixture('window: a container resolving at ~12 s is admitted', () => {
  const w = budgetWorld();
  const t0 = w.clock.now;
  w.rt.api.chatAtlasRevealRunOneShot(TARGET);
  for (const t of [500, 1500, 3000, 6000, 10000]) { w.clock.now = t0 + t; w.rt.sandbox.W.runTimers(); }
  equal(w.rt.api.chatAtlasRevealDiagnostics().revealReadinessState, 'waiting', 'still waiting at 10 s');
  const sc = w.attach();
  w.clock.now = t0 + 16000; w.rt.sandbox.W.runTimers();
  const d = w.rt.api.chatAtlasRevealDiagnostics();
  equal(d.revealReadinessState, 'ready', 'admitted well after the old 8 s deadline');
  equal(d.revealAttempts, 1, 'one reveal ran');
  equal(sc.scrollTop, 29848, 'and the viewport was restored');
});

await fixture('window: a container resolving at ~25 s is admitted, not timed out', () => {
  const w = budgetWorld();
  const t0 = w.clock.now;
  w.rt.api.chatAtlasRevealRunOneShot(TARGET);
  for (const t of [500, 1500, 3000, 6000, 10000, 16000]) { w.clock.now = t0 + t; w.rt.sandbox.W.runTimers(); }
  const sc = w.attach();
  w.clock.now = t0 + 24000; w.rt.sandbox.W.runTimers();
  const d = w.rt.api.chatAtlasRevealDiagnostics();
  equal(d.revealReadinessState, 'ready', 'admitted at the 24 s probe');
  equal(d.revealReadinessTerminalState, 'ready', 'terminal state recorded as ready');
  ok(d.revealReadinessReadyElapsedMs >= 24000, `ready elapsed ~24 s (${d.revealReadinessReadyElapsedMs})`);
  equal(sc.scrollTop, 29848, 'viewport restored');
});

await fixture('window: probe targets are absolute, so a late timer does not push the rest out', () => {
  const w = budgetWorld();
  const t0 = w.clock.now;
  w.rt.api.chatAtlasRevealRunOneShot(TARGET);
  equal(w.rt.api.chatAtlasRevealDiagnostics().revealReadinessRetryDelayMs, 500, 'first target is 500 ms');
  // The first timer fires very late; the next delay must SHRINK to hit 1500 ms.
  w.clock.now = t0 + 1400; w.rt.sandbox.W.runTimers();
  equal(w.rt.api.chatAtlasRevealDiagnostics().revealReadinessRetryDelayMs, 100,
    'the next delay compensates for the overrun instead of compounding');
  // A timer arriving past its target schedules immediately, never negative.
  w.clock.now = t0 + 9000; w.rt.sandbox.W.runTimers();
  ok(w.rt.api.chatAtlasRevealDiagnostics().revealReadinessRetryDelayMs >= 0, 'delays never go negative');
});

await fixture('window: timing diagnostics are navigation-based and freeze at terminal', () => {
  const w = budgetWorld();
  w.clock.now = 32474;                       // script start, as in the trace
  const t0 = w.clock.now;
  w.rt.api.chatAtlasRevealRunOneShot(TARGET);
  let d = w.rt.api.chatAtlasRevealDiagnostics();
  equal(d.revealReadinessStartedAtNavigationMs, t0, 'the start time is navigation-based');
  equal(d.revealReadinessTerminalElapsedMs, 0, 'nothing is frozen while running');
  const sc = w.attach();
  w.clock.now = t0 + 3000; w.rt.sandbox.W.runTimers();
  d = w.rt.api.chatAtlasRevealDiagnostics();
  equal(d.revealReadinessTerminalState, 'ready', 'terminal state is ready');
  equal(d.revealReadinessFirstResolvedAtNavigationMs, t0 + 3000, 'first-resolved is recorded');
  const frozen = d.revealReadinessTerminalElapsedMs;
  ok(frozen > 0, 'terminal elapsed is captured');
  w.clock.now += 90000;                      // long after, as the live read was
  const later = w.rt.api.chatAtlasRevealDiagnostics();
  equal(later.revealReadinessTerminalElapsedMs, frozen, 'it does not grow with later reads');
  equal(later.revealReadinessElapsedMs, frozen, 'and neither does the elapsed field');
});

// ── False supersession (Stage 2C-2ag8) ────────────────────────────────────
// Live: the one top scroll ran, then the transaction terminalized as
// "superseded by user scroll" with no user interaction, and restoration was
// refused — leaving the page 32 734 px from where it started.
// The container is mounted but the TARGET is not, so the transaction stays
// awaiting-mount with its listeners installed — the exact live window in which
// the false supersession happened. `finish()` then mounts the target and lets
// the bounded reconciliation complete.
function revealRun() {
  const w = budgetWorld();
  const sc = scroller({ testId: 'conv', clientHeight: 1148, scrollHeight: 31104 });
  sc.scrollTop = 29848;
  w.root.appendChild(sc);
  turn(30, 'q30', 'a30', 29800, false, sc);
  const captured = sc.scrollTop;
  const result = w.rt.api.chatAtlasRevealRunOneShot(TARGET);
  const finish = () => {
    const sec = turn(2, TQ, TA, 0, false, sc);
    pager(sec, '1/2', TA);
    return w.rt.api.chatAtlasRevealReconcileTick();
  };
  return { ...w, sc, captured, result, finish };
}

await fixture('false supersession: an ASYNCHRONOUS internal scroll event does not supersede', () => {
  const w = revealRun();
  // The synchronous marker has already exited; the browser now delivers the
  // scroll event caused by our own scrollTop = 0. This is the live defect.
  w.sc.fire('scroll', { isTrusted: true });
  let d = w.rt.api.chatAtlasRevealDiagnostics();
  equal(d.revealUserSuperseded, false, 'the transaction is NOT superseded');
  equal(d.revealSupersessionSource, 'scroll-observed', 'the signal is recorded');
  equal(d.revealSupersessionEventType, 'scroll', 'as a scroll event');
  equal(d.revealSupersessionEventTrusted, true, 'trusted, yet still not intent');
  equal(d.revealSupersessionReason, 'ignored-not-user-intent', 'and explicitly ignored');
  equal(w.finish().state, 'target-mounted', 'measurement then completes normally');
  d = w.rt.api.chatAtlasRevealDiagnostics();
  equal(d.revealRestoreState, 'restored', 'and restoration ran');
  equal(w.sc.scrollTop, w.captured, 'the viewport is back where it started');
  equal(Math.abs(d.revealRestoreDelta) <= 2, true, `delta near zero (${d.revealRestoreDelta})`);
});

await fixture('false supersession: host layout movement without intent does not supersede', () => {
  const w = revealRun();
  // Virtualization moves the scroll position with no pointer/wheel/key at all.
  w.sc.scrollTop = 18000;
  w.sc.fire('scroll', { isTrusted: true });
  equal(w.rt.api.chatAtlasRevealDiagnostics().revealUserSuperseded, false, 'relayout is not user intent');
  w.finish();
  equal(w.rt.api.chatAtlasRevealDiagnostics().revealRestoreState, 'restored', 'and restoration still ran');
});

await fixture('false supersession: a pointer press in the message body is not scrollbar intent', () => {
  const w = revealRun();
  w.sc.clientWidth = 600;
  w.sc.fire('pointerdown', { isTrusted: true, clientX: 300 });   // in content
  const d = w.rt.api.chatAtlasRevealDiagnostics();
  equal(d.revealUserSuperseded, false, 'an ordinary pointerdown is not supersession');
  equal(d.revealSupersessionSource, 'pointer-in-content', 'recorded as content, not gutter');
  equal(d.revealSupersessionPointerScrollArmed, false, 'scrollbar intent is not armed');
});

await fixture('genuine intent: wheel, touch, scrolling keys and the scrollbar all supersede', () => {
  const cases = [
    ['wheel', (sc) => sc.fire('wheel', { isTrusted: true }), 'wheel'],
    ['touch', (sc) => sc.fire('touchmove', { isTrusted: true }), 'touchmove'],
    ['scrollbar', (sc) => { sc.clientWidth = 600; sc.fire('pointerdown', { isTrusted: true, clientX: 610 }); }, 'scrollbar-pointer'],
  ];
  for (const [label, act, source] of cases) {
    const w = revealRun();
    w.sc.scrollTop = 9999;
    act(w.sc);
    const d = w.rt.api.chatAtlasRevealDiagnostics();
    equal(d.revealUserSuperseded, true, `${label}: supersedes`);
    equal(d.revealSupersessionSource, source, `${label}: source recorded`);
    equal(d.revealSupersessionReason, 'genuine-user-intent', `${label}: classified as intent`);
    equal(w.sc.scrollTop, 9999, `${label}: the user keeps their position`);
  }
  // Keyboard: scrolling keys supersede, ordinary typing does not.
  const typed = revealRun();
  typed.rt.sandbox.W.fire('keydown', { key: 'a', isTrusted: true });
  equal(typed.rt.api.chatAtlasRevealDiagnostics().revealUserSuperseded, false, 'typing is not navigation');
  const paged = revealRun();
  paged.rt.sandbox.W.fire('keydown', { key: 'PageDown', isTrusted: true });
  const pd = paged.rt.api.chatAtlasRevealDiagnostics();
  equal(pd.revealUserSuperseded, true, 'PageDown supersedes');
  equal(pd.revealSupersessionSource, 'user-key', 'recorded as a key intent');
});

await fixture('movement token: it is armed for both phases and bounded', () => {
  const w = revealRun();
  w.finish();
  // The restore consumed and cleared it by the terminal exit.
  equal(w.rt.api.chatAtlasRevealInternalMovementActive(), false, 'no expectation outlives the transaction');
  const arm = extractFunction(CORE_SOURCE, 'chatAtlasRevealArmInternalMovement');
  ok(arm.includes('st.movementToken = String(st.token'), 'the expectation is transaction-scoped');
  const active = extractFunction(CORE_SOURCE, 'chatAtlasRevealInternalMovementActive');
  ok(active.includes("String(st.movementToken || '') !== String(st.token || '')"),
    'a stale transaction token deactivates it');
  ok(active.includes('CHAT_ATLAS_REVEAL_RECONCILE_TICKS'), 'and it is bounded by the existing reconciliation');
  const action = extractFunction(CORE_SOURCE, 'chatAtlasExecuteOneShotRevealAction');
  ok(action.includes("chatAtlasRevealArmInternalMovement('reveal-top', 0,"), 'the top scroll arms reveal-top');
  const restore = extractFunction(CORE_SOURCE, 'chatAtlasRevealRestore');
  ok(restore.includes("chatAtlasRevealArmInternalMovement('restore-bookmark'"), 'restoration arms its own phase');
});

await fixture('false supersession: restoration movement never supersedes itself', () => {
  const w = revealRun();
  w.finish();
  equal(w.rt.api.chatAtlasRevealDiagnostics().revealRestoreState, 'restored', 'restoration completed');
  // The scroll event caused BY the restore arrives afterwards.
  w.sc.fire('scroll', { isTrusted: true });
  equal(w.rt.api.chatAtlasRevealDiagnostics().revealUserSuperseded, false, 'and does not supersede');
  equal(w.sc.scrollTop, w.captured, 'the restored position stands');
});

await fixture('false supersession: measurement completes and no control is activated', () => {
  const w = revealRun();
  w.sc.fire('scroll', { isTrusted: true });
  w.finish();
  const d = w.rt.api.chatAtlasRevealDiagnostics();
  equal(d.revealState, 'target-mounted', 'the exact target was measured');
  equal(d.revealMountedQId, TQ, 'with its question identity');
  equal(d.revealMountedAId, TA, 'its paired assistant identity');
  equal(d.revealPagerPresent, true, 'and its pager proven');
  equal(d.revealAttempts, 1, 'one scroll attempt');
  equal(w.rt.api.chatAtlasRevealDiagnostics().revealRestoreState, 'restored', 'restoration ran');
});

await fixture('false supersession: a failed target still restores when no intent occurred', () => {
  const w = budgetWorld();
  const sc = scroller({ testId: 'conv', clientHeight: 1148, scrollHeight: 31104 });
  sc.scrollTop = 29848;
  w.root.appendChild(sc);
  turn(30, 'q30', 'a30', 29800, false, sc);      // target never mounts
  const captured = sc.scrollTop;
  w.rt.api.chatAtlasRevealRunOneShot(TARGET);
  sc.fire('scroll', { isTrusted: true });
  drainReconcile(w.rt);
  const d = w.rt.api.chatAtlasRevealDiagnostics();
  equal(d.revealUserSuperseded, false, 'no false supersession');
  equal(d.revealRestoreState, 'restored', 'restoration ran before terminal failure');
  equal(sc.scrollTop, captured, 'and the viewport is back');
});

await fixture('intent classifier: only proven intent sources can supersede, whatever calls it', () => {
  // Defence in depth: even a direct call with a movement-only source must be
  // refused, so a future caller cannot reintroduce the false positive.
  const w = revealRun();
  for (const source of ['scroll-observed', 'pointer-in-content', 'layout', 'user-scroll', '']) {
    equal(w.rt.api.chatAtlasRevealIsGenuineIntent(source), false, `${source || '(empty)'} is not intent`);
    equal(w.rt.api.chatAtlasRevealSupersede(source, { eventType: 'scroll' }), false,
      `${source || '(empty)'} cannot supersede even when called directly`);
    equal(w.rt.api.chatAtlasRevealDiagnostics().revealUserSuperseded, false,
      `${source || '(empty)'} leaves the transaction running`);
  }
  for (const source of ['wheel', 'touchstart', 'touchmove', 'user-key', 'scrollbar-pointer',
    'manual-branch-selection', 'minimap-navigation']) {
    equal(w.rt.api.chatAtlasRevealIsGenuineIntent(source), true, `${source} IS intent`);
  }
  equal(w.rt.api.chatAtlasRevealSupersede('wheel', {}), true, 'and a genuine source still supersedes');
  const d = w.rt.api.chatAtlasRevealDiagnostics();
  equal(d.revealSupersessionSource, 'wheel', 'recording the winning source');
  equal(d.revealSupersessionReason, 'genuine-user-intent', 'and its classification');
});

await fixture('restore permission: supersession blocks it by two independent guards', () => {
  // The explicit superseded check and the hard-drift classification both cover
  // this; neither alone is observable, so both are pinned.
  const w = revealRun();
  w.sc.fire('wheel', { isTrusted: true });
  equal(w.rt.api.chatAtlasRevealRestorePermitted(), false, 'restoration is not permitted');
  equal(w.rt.api.chatAtlasRevealScopeDrift().field, 'user-superseded', 'drift names the supersession');
  const permitted = extractFunction(CORE_SOURCE, 'chatAtlasRevealRestorePermitted');
  ok(permitted.includes('if (chatAtlasRevealState.superseded === true) return false;'),
    'the explicit supersession guard is present');
  ok(permitted.includes('if (drift.hard === true) return false;'), 'and so is the hard-drift guard');
});

// ── Self-closing post-scroll lifecycle (Stage 2C-2ag9) ────────────────────
// Live: the scroll ran, then the transaction sat in awaiting-mount for 45 s
// because only an authority publication could drive reconciliation, and none
// came. Restoration therefore never ran and the page stayed 32 596 px away.
function scrolledWorld(opts = {}) {
  const w = budgetWorld();
  const sc = scroller({ testId: 'conv', clientHeight: 1148, scrollHeight: 31104 });
  sc.scrollTop = 32595;
  w.root.appendChild(sc);
  turn(30, 'q30', 'a30', 32500, false, sc);
  const captured = sc.scrollTop;
  w.rt.api.chatAtlasRevealRunOneShot(TARGET);
  const mountTarget = () => {
    const sec = turn(2, TQ, TA, 0, false, sc);
    if (opts.noPager !== true) pager(sec, '1/2', TA);
    return sec;
  };
  return { ...w, sc, captured, mountTarget };
}

await fixture('self-closing: with NO authority event the lifecycle still terminates and restores', () => {
  const w = scrolledWorld();
  const d0 = w.rt.api.chatAtlasRevealDiagnostics();
  equal(d0.revealState, 'awaiting-mount', 'it starts awaiting-mount after the scroll');
  equal(d0.revealTopScrollExecuted, true, 'the single scroll executed');
  equal(d0.revealReconcileRetryPending, true, 'and a reconciliation probe is already scheduled');
  equal(w.rt.sandbox.W.pendingTimers(), 1, 'exactly one timer outstanding');
  // No authority publication, no scroll event: only the transaction's own timers.
  const t0 = w.clock.now;
  for (const t of [100, 500, 1500, 3000, 6000, 12000, 20000, 30000]) {
    w.clock.now = t0 + t;
    if (w.rt.sandbox.W.pendingTimers()) w.rt.sandbox.W.runTimers();
  }
  const d = w.rt.api.chatAtlasRevealDiagnostics();
  ok(d.revealState !== 'awaiting-mount', `it terminated (${d.revealState})`);
  equal(d.revealState, 'target-still-unmounted', 'as a bounded failure');
  equal(d.revealRestoreState, 'restored', 'restoration ran');
  equal(w.sc.scrollTop, w.captured, 'and the viewport is back');
  equal(Math.abs(d.revealRestoreDelta) <= 2, true, `delta near zero (${d.revealRestoreDelta})`);
  equal(w.rt.sandbox.W.pendingTimers(), 0, 'no timer is left pending');
  equal(d.revealReconcileScheduledProbes, 8, 'the full scheduled budget was used');
  equal(d.revealAttempts, 1, 'still exactly one scroll attempt');
});

await fixture('self-closing: a target mounting at ~20 s is found by the late probe', () => {
  const w = scrolledWorld();
  const t0 = w.clock.now;
  for (const t of [100, 500, 1500, 3000, 6000, 12000]) {
    w.clock.now = t0 + t; w.rt.sandbox.W.runTimers();
  }
  equal(w.rt.api.chatAtlasRevealDiagnostics().revealState, 'awaiting-mount', 'still waiting at 12 s');
  w.mountTarget();                                   // ChatGPT finally mounts it
  w.clock.now = t0 + 20000; w.rt.sandbox.W.runTimers();
  const d = w.rt.api.chatAtlasRevealDiagnostics();
  equal(d.revealState, 'target-mounted', 'the late probe finds the exact target');
  equal([d.revealMountedQId, d.revealMountedAId], [TQ, TA], 'with both identities');
  equal(d.revealPagerPresent, true, 'and its pager proven');
  equal(d.revealRestoreState, 'restored', 'restoration ran');
  equal(w.sc.scrollTop, w.captured, 'viewport restored');
  ok(d.revealReconcileTerminalElapsedMs >= 20000, `terminal elapsed recorded (${d.revealReconcileTerminalElapsedMs})`);
});

await fixture('self-closing: the final measurement is live, not a stale earlier read', () => {
  const w = scrolledWorld();
  const t0 = w.clock.now;
  for (const t of [100, 500, 1500, 3000, 6000, 12000, 20000]) {
    w.clock.now = t0 + t; w.rt.sandbox.W.runTimers();
  }
  equal(w.rt.api.chatAtlasRevealDiagnostics().revealReconcileScheduledProbes, 7, 'seven probes spent');
  // Mount only for the FINAL probe's second look.
  let asked = 0;
  const realQuery = w.root.querySelectorAll.bind(w.root);
  w.rt.sandbox.D.querySelectorAll = (sel) => {
    if (String(sel).includes('conversation-turn-')) { asked += 1; if (asked === 2) w.mountTarget(); }
    return realQuery(sel);
  };
  w.clock.now = t0 + 30000; w.rt.sandbox.W.runTimers();
  const d = w.rt.api.chatAtlasRevealDiagnostics();
  equal(d.revealState, 'target-mounted', 'the final live measurement admits it');
  equal(d.revealRestoreState, 'restored', 'and restoration ran');
});

await fixture('self-closing: a scroll wakeup reconciles early without spending the budget', () => {
  const w = scrolledWorld();
  w.mountTarget();
  const before = w.rt.api.chatAtlasRevealDiagnostics().revealReconcileScheduledProbes;
  w.sc.fire('scroll', { isTrusted: true });
  const d = w.rt.api.chatAtlasRevealDiagnostics();
  equal(d.revealUserSuperseded, false, 'the scroll does not supersede');
  equal(d.revealReconcileScrollWakeups >= 1, true, 'it is counted as a scroll wakeup');
  equal(d.revealReconcileScheduledProbes, before, 'and spends none of the scheduled budget');
  equal(d.revealState, 'target-mounted', 'measurement completed early');
  equal(d.revealRestoreState, 'restored', 'with restoration');
  equal(w.rt.sandbox.W.pendingTimers(), 0, 'and the pending timer was cancelled');
});

await fixture('self-closing: authority and timer cannot both terminate it', () => {
  const w = scrolledWorld();
  w.mountTarget();
  equal(w.rt.api.chatAtlasRevealReconcileTick('authority').state, 'target-mounted', 'authority wins');
  const d1 = w.rt.api.chatAtlasRevealDiagnostics();
  w.sc.scrollTop = 4321;
  w.clock.now += 30000; w.rt.sandbox.W.runTimers();     // stale timer fires late
  const d2 = w.rt.api.chatAtlasRevealDiagnostics();
  equal(d2.revealState, d1.revealState, 'the terminal state does not change');
  equal(w.sc.scrollTop, 4321, 'and nothing is restored a second time');
  equal(d2.revealAttempts, 1, 'still one scroll attempt');
});

await fixture('self-closing: genuine intent cancels the scheduler and blocks restore', () => {
  const w = scrolledWorld();
  equal(w.rt.sandbox.W.pendingTimers(), 1, 'a reconciliation timer is pending');
  w.sc.fire('wheel', { isTrusted: true });
  w.sc.scrollTop = 1234;
  const d = w.rt.api.chatAtlasRevealDiagnostics();
  equal(d.revealUserSuperseded, true, 'the user supersedes');
  equal(w.rt.sandbox.W.pendingTimers(), 0, 'the scheduler is cancelled');
  equal(d.revealRestoreState !== 'restored', true, 'restoration does not overwrite the user');
  equal(w.sc.scrollTop, 1234, 'the user keeps their position');
});

await fixture('self-closing: the forbidden end states are unreachable after the deadline', () => {
  const w = scrolledWorld();
  const t0 = w.clock.now;
  for (const t of [100, 500, 1500, 3000, 6000, 12000, 20000, 30000]) {
    w.clock.now = t0 + t;
    if (w.rt.sandbox.W.pendingTimers()) w.rt.sandbox.W.runTimers();
  }
  const d = w.rt.api.chatAtlasRevealDiagnostics();
  const stuck = d.revealState === 'awaiting-mount'
    || (d.revealTopScrollExecuted && d.revealRestoreState === 'idle' && !d.revealUserSuperseded)
    || (d.revealReconcileRetryPending === false && d.revealState === 'awaiting-mount');
  equal(stuck, false, 'none of the forbidden combinations survive the deadline');
  ok(d.revealReconcileTerminalElapsedMs > 0, 'the reconciliation window is closed and frozen');
  const frozen = d.revealReconcileTerminalElapsedMs;
  w.clock.now += 60000;
  equal(w.rt.api.chatAtlasRevealDiagnostics().revealReconcileTerminalElapsedMs, frozen,
    'and its elapsed time does not keep growing');
});

await fixture('self-closing: the reconcile scheduler guards are individually enforced', () => {
  const w = scrolledWorld();
  const api = w.rt.api;
  const st = api.chatAtlasRevealState;
  equal(w.rt.sandbox.W.pendingTimers(), 1, 'one timer from the inline tick');
  equal(api.chatAtlasRevealScheduleReconcileRetry(), false, 'a pending retry blocks another');
  equal(w.rt.sandbox.W.pendingTimers(), 1, 'so no second timer is created');
  api.chatAtlasRevealCancelReconcileRetry();
  equal(w.rt.sandbox.W.pendingTimers(), 0, 'cancel removes it');
  equal(api.chatAtlasRevealScheduleReconcileRetry(), true, 'and it can be rescheduled');
  equal(w.rt.sandbox.W.pendingTimers(), 1, 'exactly one again');
  // Budget guard.
  api.chatAtlasRevealCancelReconcileRetry();
  st.reconcileScheduledProbes = 8;
  equal(api.chatAtlasRevealScheduleReconcileRetry(), false, 'the scheduled cap blocks it');
  equal(w.rt.sandbox.W.pendingTimers(), 0, 'creating no timer');
  // Deadline guard.
  st.reconcileScheduledProbes = 1;
  w.clock.now = Number(st.reconcileStartedAtNavigationMs) + 30001;
  equal(api.chatAtlasRevealScheduleReconcileRetry(), false, 'the deadline blocks it');
  // State guard.
  w.clock.now = Number(st.reconcileStartedAtNavigationMs) + 100;
  st.transactionState = 'target-mounted';
  equal(api.chatAtlasRevealScheduleReconcileRetry(), false, 'a finished transaction schedules nothing');
});

await fixture('self-closing: the stale-callback guards are present', () => {
  // Redundant with the tick's own awaiting-mount guard, so no behavioural
  // fixture can isolate them; pinned so defence-in-depth is not thinned.
  const sched = extractFunction(CORE_SOURCE, 'chatAtlasRevealScheduleReconcileRetry');
  ok(sched.includes('if (Number(st.reconcileRetryGeneration || 0) !== generation) return;'),
    'the fired callback checks its own generation');
  ok(sched.includes("if (st.transactionState !== 'awaiting-mount') return;"),
    'and that the transaction is still awaiting mount');
  ok(sched.includes("if (st.transactionState !== 'awaiting-mount') return false;"),
    'scheduling itself is gated on the same state');
  const tick = extractFunction(CORE_SOURCE, 'chatAtlasRevealReconcileTick');
  ok(tick.includes("if (chatAtlasRevealState.transactionState !== 'awaiting-mount') {"),
    'and the tick refuses outside that state');
});

// ── Truthful states and verified restoration (Stage 2C-2ah1) ──────────────
// Live: the exact qId AND its assistant were mounted, yet the terminal state
// claimed "target-still-unmounted"; and canonical restoration missed the
// captured position by 998 px.
await fixture('truthful: each measurement outcome has its own exact state', () => {
  const mk = (mode) => {
    const w = budgetWorld();
    const sc = scroller({ testId: 'conv', clientHeight: 1148, scrollHeight: 31104 });
    sc.scrollTop = 29737;
    w.root.appendChild(sc);
    turn(30, 'q30', 'a30', 29700, false, sc);
    if (mode !== 'absent') {
      const sec = turn(2, TQ, mode === 'no-answer' ? null : TA, 0, false, sc);
      if (mode === 'full') pager(sec, '1/2', TA);
      if (mode === 'dup-pager') { pager(sec, '1/2', TA); pager(sec, '1/2', TA); }
    }
    w.rt.api.chatAtlasRevealRunOneShot(TARGET);
    drainReconcile(w.rt);
    return w.rt.api.chatAtlasRevealDiagnostics();
  };
  equal(mk('absent').revealState, 'target-still-unmounted', 'question absent');
  const noAnswer = mk('no-answer');
  equal(noAnswer.revealState, 'target-answer-unavailable', 'question mounted, assistant absent');
  equal(noAnswer.revealMountedQId, TQ, 'the question identity is preserved');
  const noPager = mk('no-pager');
  equal(noPager.revealState, 'target-mounted-pager-unavailable', 'both mounted, pager absent');
  equal([noPager.revealMountedQId, noPager.revealMountedAId], [TQ, TA], 'both identities preserved');
  equal(noPager.revealPagerPresent, false, 'pager honestly absent');
  equal(mk('full').revealState, 'target-mounted', 'question, assistant and pager all proven');
  equal(mk('dup-pager').revealState, 'target-mounted-ambiguous', 'two owning pagers is ambiguity');
});

// A container whose bookmarked anchor can be displaced after the reveal.
function restoreWorld(opts = {}) {
  const w = budgetWorld();
  const sc = scroller({ testId: 'conv', clientHeight: 1148, scrollHeight: 40000 });
  sc.scrollTop = 29737;
  w.root.appendChild(sc);
  // The bookmark anchor: a user message inside its section, below the top.
  const anchorSec = turn(30, 'q30', 'a30', 30000, false, sc);
  const anchorMsg = anchorSec.querySelector('[data-message-author-role="user"]');
  const captured = sc.scrollTop;
  w.rt.api.chatAtlasRevealRunOneShot(TARGET);
  if (opts.mountTarget !== false) {
    const sec = turn(2, TQ, TA, 0, false, sc);
    pager(sec, '1/2', TA);
  }
  // Drive the lifecycle to its terminal state so restoration actually runs.
  drainReconcile(w.rt);
  return { ...w, sc, captured, anchorSec, anchorMsg };
}

await fixture('restore: capture and restore measure the SAME element', () => {
  // The live 998 px miss: capture measured the turn section, restore measured
  // the inner user-message element. The section sits 1000 px above it here.
  const w = restoreWorld();
  const d = w.rt.api.chatAtlasRevealDiagnostics();
  equal(d.revealBookmarkKind, 'canonical-turn', 'a canonical bookmark was captured');
  equal(d.revealBookmarkTurnId, 'q30', 'anchored on the visible question');
  equal(Math.abs(d.revealRestoreOffsetError) <= d.revealRestoreTolerancePx, true,
    `offset error within tolerance (${d.revealRestoreOffsetError})`);
  equal(d.revealRestoreState, 'restored', 'and it reports restored');
  const capture = extractFunction(CORE_SOURCE, 'chatAtlasRevealCaptureBookmark');
  ok(capture.includes('qEl.getBoundingClientRect'), 'capture measures the message element');
  ok(!capture.includes('section.getBoundingClientRect'), 'and no longer the section');
});

await fixture('restore: an anchor displaced by ~1000 px is corrected once', () => {
  const w = restoreWorld();
  const d = w.rt.api.chatAtlasRevealDiagnostics();
  equal(d.revealRestoreState, 'restored', 'restoration succeeded');
  equal(d.revealRestoreCorrectionAttempts <= 1, true, 'at most one correction');
  equal(Math.abs(d.revealRestoreOffsetError) <= 2, true, 'final offset error within tolerance');
  ok(d.revealRestoreRequestedScrollTop >= 0, 'the requested position is recorded');
  ok(typeof d.revealRestoreMeasuredOffset === 'number', 'and the measured offset');
});

await fixture('restore: scroll anchoring displacing the first write is corrected once', () => {
  // The browser moves the first programmatic scroll by 1000 px, exactly the
  // class of error that produced the live 998 px miss.
  const w = budgetWorld();
  const sc = scroller({ testId: 'conv', clientHeight: 1148, scrollHeight: 40000 });
  sc.scrollTop = 29737;
  w.root.appendChild(sc);
  turn(30, 'q30', 'a30', 30000, false, sc);
  const captured = sc.scrollTop;
  w.rt.api.chatAtlasRevealRunOneShot(TARGET);
  const sec = turn(2, TQ, TA, 0, false, sc);
  pager(sec, '1/2', TA);
  sc.anchorBias = 1000;                       // the next write lands 1000 px off
  drainReconcile(w.rt);
  const d = w.rt.api.chatAtlasRevealDiagnostics();
  equal(d.revealRestoreCorrectionAttempts, 1, 'exactly one compensating correction');
  equal(d.revealRestoreCorrectionReason, 'offset-error-corrected', 'named exactly');
  equal(Math.abs(d.revealRestoreOffsetError) <= 2, true,
    `final offset error within tolerance (${d.revealRestoreOffsetError})`);
  equal(d.revealRestoreState, 'restored', 'and only then is it reported restored');
  equal(sc.scrollTop, captured, 'the viewport is exactly back');
  ok(d.revealRestoreFirstMeasuredScrollTop !== d.revealRestoreFinalScrollTop,
    'the first attempt and the corrected result genuinely differ');
});

await fixture('restore: a displaced scrollTop fallback is corrected and verified', () => {
  const w = budgetWorld();
  const sc = scroller({ testId: 'conv', clientHeight: 1148, scrollHeight: 40000 });
  sc.scrollTop = 12345;
  w.root.appendChild(sc);
  turn(30, 'q30', 'a30', -5000, false, sc);    // no canonical anchor visible
  w.rt.api.chatAtlasRevealRunOneShot(TARGET);
  sc.anchorBias = 750;
  drainReconcile(w.rt);
  const d = w.rt.api.chatAtlasRevealDiagnostics();
  equal(d.revealRestoreMethod, 'scroll-top', 'the fallback was used');
  equal(d.revealRestoreCorrectionAttempts, 1, 'one correction');
  equal(d.revealRestoreCorrectionReason, 'scroll-top-error-corrected', 'named exactly');
  equal(d.revealRestoreOffsetError, 0, 'verified to zero error');
  equal(sc.scrollTop, 12345, 'exactly the captured position');
});

await fixture('restore: a persistent displacement fails closed rather than lying', () => {
  const w = budgetWorld();
  const sc = scroller({ testId: 'conv', clientHeight: 1148, scrollHeight: 40000 });
  sc.scrollTop = 29737;
  w.root.appendChild(sc);
  turn(30, 'q30', 'a30', 30000, false, sc);
  w.rt.api.chatAtlasRevealRunOneShot(TARGET);
  const sec = turn(2, TQ, TA, 0, false, sc);
  pager(sec, '1/2', TA);
  // Every write is displaced, so one correction cannot fix it.
  Object.defineProperty(sc, 'scrollTop', {
    get() { return this._scrollTop; },
    set(v) { this._scrollTop = (Number(v) || 0) + 500; },
    configurable: true,
  });
  drainReconcile(w.rt);
  const d = w.rt.api.chatAtlasRevealDiagnostics();
  equal(d.revealRestoreCorrectionAttempts, 1, 'the correction cap holds at one');
  equal(d.revealRestoreState, 'failed', 'and it reports failed rather than restored');
  equal(d.revealRestoreReason, 'reveal-restore-failed', 'with an exact reason');
  ok(Math.abs(d.revealRestoreOffsetError) > 2, 'the residual error is reported honestly');
});

await fixture('restore: a verified restore needs no correction', () => {
  const w = restoreWorld();
  const d = w.rt.api.chatAtlasRevealDiagnostics();
  equal(d.revealRestoreCorrectionAttempts, 0, 'an exact first restore corrects nothing');
  equal(d.revealRestoreOffsetError, 0, 'with zero offset error');
  equal(w.sc.scrollTop, w.captured, 'and the container is exactly back');
});

await fixture('restore: a missing canonical anchor falls back to a VERIFIED scrollTop', () => {
  const w = budgetWorld();
  const sc = scroller({ testId: 'conv', clientHeight: 1148, scrollHeight: 40000 });
  sc.scrollTop = 12345;
  w.root.appendChild(sc);
  turn(30, 'q30', 'a30', -5000, false, sc);        // above the fold: no canonical bookmark
  w.rt.api.chatAtlasRevealRunOneShot(TARGET);
  drainReconcile(w.rt);
  const d = w.rt.api.chatAtlasRevealDiagnostics();
  equal(d.revealBookmarkKind, 'scroll-top', 'the fallback bookmark was captured');
  equal(d.revealRestoreMethod, 'scroll-top', 'and used for restoration');
  equal(d.revealRestoreState, 'restored', 'reported restored');
  equal(d.revealRestoreOffsetError, 0, 'with a verified zero error');
  equal(sc.scrollTop, 12345, 'exactly the captured position');
});

await fixture('restore: the correction never supersedes or activates anything', () => {
  const w = restoreWorld();
  const d = w.rt.api.chatAtlasRevealDiagnostics();
  equal(d.revealUserSuperseded, false, 'the internal correction is not user intent');
  equal(w.rt.state.manualOverrideActive, undefined === w.rt.state.manualOverrideActive
    ? undefined : false, 'no manual override is marked');
  const restore = extractFunction(CORE_SOURCE, 'chatAtlasRevealRestore');
  ok(restore.includes('chatAtlasRevealInternal'), 'the whole restore runs as internal movement');
  for (const forbidden of ['setActiveTurnId', 'flashAnswer', 'centerOn', 'click(',
    'chatAtlasMarkManualBranchOverride', 'chatAtlasRunNativeConvergence']) {
    ok(!restore.includes(forbidden), `restoration does not use ${forbidden}`);
  }
  ok(restore.includes('chatAtlasRevealState.restoreCorrectionAttempts = 1;'), 'the correction is capped at one');
  ok(!/for\s*\(|while\s*\(/.test(restore), 'and there is no correction loop');
});

await fixture('restore: genuine user intent prevents any correction', () => {
  const w = budgetWorld();
  const sc = scroller({ testId: 'conv', clientHeight: 1148, scrollHeight: 40000 });
  sc.scrollTop = 29737;
  w.root.appendChild(sc);
  turn(30, 'q30', 'a30', 30000, false, sc);
  w.rt.api.chatAtlasRevealRunOneShot(TARGET);
  w.sc = sc;
  sc.fire('wheel', { isTrusted: true });
  sc.scrollTop = 777;
  drainReconcile(w.rt);
  const d = w.rt.api.chatAtlasRevealDiagnostics();
  equal(d.revealUserSuperseded, true, 'the user superseded');
  equal(d.revealRestoreCorrectionAttempts, 0, 'no correction was attempted');
  equal(sc.scrollTop, 777, 'and the user keeps their position');
});

// ── Refined pager audit (Stage 2C-2ah4) ───────────────────────────────────
// Anchored on the exact indicator: generic toolbar buttons that merely share a
// distant ancestor with a number must never be classified as pager controls.
function btn(host, opts = {}) {
  const b = new El('BUTTON');
  if (opts.label) b.setAttribute('aria-label', opts.label);
  if (opts.title) b.setAttribute('title', opts.title);
  if (opts.testId) b.setAttribute('data-testid', opts.testId);
  if (opts.svg) b.appendChild(new El('SVG'));
  host.appendChild(b);
  return b;
}
function toolbar(host) {
  for (const label of ['Copy response', 'Share', 'Switch model', 'More actions']) {
    btn(host, { label, testId: `tb-${label}`, title: `Tooltip ${label}` });
  }
  btn(host, {});                    // the unlabelled sixth control
  return host;
}
function indicatorGroup(host, prevOpts, nextOpts) {
  const group = new El('DIV');
  if (prevOpts) btn(group, prevOpts);
  const sp = new El('SPAN'); sp.textContent = '1/2'; group.appendChild(sp);
  if (nextOpts) btn(group, nextOpts);
  host.appendChild(group);
  return group;
}

function auditWorld(shape) {
  const w = budgetWorld();
  const sc = scroller({ testId: 'conv', clientHeight: 1148, scrollHeight: 40000 });
  sc.scrollTop = 29737;
  w.root.appendChild(sc);
  turn(30, 'q30', 'a30', 30000, false, sc);
  const answerSec = turn(2, TQ, TA, 0, false, sc);
  const sibling = new El('DIV');
  sibling.setAttribute('data-testid', 'conversation-turn-2-actions');
  sc.appendChild(sibling);
  const P = { label: 'Previous response' };
  const N = { label: 'Next response' };
  if (shape === 'ideal') indicatorGroup(answerSec, P, N);
  if (shape === 'toolbar-only') toolbar(answerSec);
  if (shape === 'toolbar-plus-distant-indicator') {
    toolbar(answerSec);
    // A number seven hops away, nested well outside any control group.
    let deep = answerSec;
    for (let i = 0; i < 6; i += 1) { const d = new El('DIV'); deep.appendChild(d); deep = d; }
    const sp = new El('SPAN'); sp.textContent = '1/2'; deep.appendChild(sp);
  }
  if (shape === 'unlabeled') indicatorGroup(answerSec, { svg: true }, { svg: true });
  if (shape === 'relabelled') indicatorGroup(answerSec, { label: 'Previous message' }, { label: 'Next message' });
  if (shape === 'sibling') indicatorGroup(sibling, P, N);
  if (shape === 'owner-mismatch') {
    const other = new El('DIV');
    other.setAttribute('data-message-author-role', 'assistant');
    other.setAttribute('data-message-id', 'a-someone-else');
    answerSec.appendChild(other);
    indicatorGroup(answerSec, P, N);
  }
  if (shape === 'toolbar-and-pager') { toolbar(answerSec); indicatorGroup(answerSec, P, N); }
  const row = { mountedQId: TQ, mountedAId: TA, answerSection: answerSec, section: answerSec };
  return { ...w, sc, answerSec, sibling, row };
}
const auditOf = (shape) => {
  const w = auditWorld(shape);
  return { w, a: w.rt.api.chatAtlasRevealAuditPager(w.row) };
};

await fixture('audit: generic toolbar buttons are NOT a pager label mismatch', () => {
  const { a } = auditOf('toolbar-only');
  equal(a.failureClass, 'pager-indicator-absent', 'with no indicator, the class is indicator-absent');
  ok(a.totals.uniqueButtonCount >= 5, 'the toolbar buttons are all captured');
  equal(a.totals.adjacentControlCount, 0, 'but none is adjacent to any indicator');
  ok(a.failureClass !== 'pager-label-contract-mismatch', 'and they are never called a label mismatch');
});

await fixture('audit: a distant indicator does not make toolbar buttons adjacent', () => {
  const { a } = auditOf('toolbar-plus-distant-indicator');
  equal(a.totals.indicatorCount, 1, 'the indicator is found');
  equal(a.totals.adjacentControlCount, 0, 'but nothing is adjacent to it');
  equal(a.failureClass, 'pager-controls-absent', 'classified as controls absent, not label mismatch');
});

await fixture('audit: indicator with unlabelled icon controls is classified as unlabeled', () => {
  const { a } = auditOf('unlabeled');
  equal(a.totals.indicatorCount, 1, 'the indicator is found');
  equal(a.totals.adjacentControlCount, 2, 'both adjacent controls are seen');
  equal(a.totals.adjacentLabelledCount, 0, 'neither exposes any label signal');
  equal(a.failureClass, 'pager-controls-unlabeled', 'classified as unlabeled controls');
  ok(a.adjacent.every((x) => x.svgChild === true), 'their icon children are recorded');
  ok(a.adjacent.some((x) => x.position === 'before-indicator')
    && a.adjacent.some((x) => x.position === 'after-indicator'), 'with positions relative to the indicator');
});

await fixture('audit: indicator with relabelled controls is a genuine label mismatch', () => {
  const { a } = auditOf('relabelled');
  equal(a.failureClass, 'pager-label-contract-mismatch', 'classified as a label mismatch');
  equal(a.totals.adjacentLabelledCount, 2, 'the adjacent controls DO expose labels');
  equal(a.totals.adjacentContractCount, 0, 'but none matches the existing contract');
  ok(a.adjacent.every((x) => x.resolverRecognized === false), 'and the resolver recognizes neither');
});

await fixture('audit: exact contract labels let the unchanged resolver succeed', () => {
  const { w, a } = auditOf('ideal');
  equal(a.totals.resolverOwnedCount, 1, 'the unchanged resolver returns one owned pager');
  equal(a.failureClass, 'pager-resolver-should-have-succeeded', 'classified accordingly');
  equal(a.totals.adjacentContractCount, 2, 'both adjacent controls match the contract');
  equal(w.rt.api.chatAtlasRevealMeasureTarget(TQ).state, 'target-mounted', 'and measurement agrees');
});

await fixture('audit: the unlabelled sixth control is represented, never dropped', () => {
  const { a } = auditOf('toolbar-and-pager');
  const unlabelled = a.controls.filter((c) => !c.ariaLabelPresent && !c.titlePresent && !c.testIdPresent);
  equal(unlabelled.length, 1, 'the control with no label, title or test id is captured');
  equal(unlabelled[0].tag, 'button', 'as a button');
  ok(typeof unlabelled[0].ordinal === 'number', 'with a stable ordinal');
  equal(a.totals.uniqueButtonCount, 7, 'seven unique controls: five toolbar plus two pager');
  equal(a.totals.uniqueCandidateCount, 7, 'and all seven are recorded');
});

await fixture('audit: overlapping regions duplicate occurrences but not unique controls', () => {
  const { a } = auditOf('ideal');
  ok(a.totals.rawButtonOccurrences > a.totals.uniqueButtonCount,
    `occurrences (${a.totals.rawButtonOccurrences}) exceed unique (${a.totals.uniqueButtonCount})`);
  equal(a.totals.duplicateOccurrenceCount,
    a.totals.rawButtonOccurrences - a.totals.uniqueButtonCount, 'duplicates are reported explicitly');
  equal(a.totals.uniqueButtonCount, 2, 'the same two controls count once');
  const multi = a.controls.filter((c) => c.regions.length > 1);
  ok(multi.length >= 1, 'and a control present in several regions lists them all');
});

await fixture('audit: indicator and owner aggregates agree with the records', () => {
  for (const shape of ['ideal', 'relabelled', 'unlabeled', 'toolbar-and-pager']) {
    const { a } = auditOf(shape);
    equal(a.totals.indicatorCount, a.indicators.length, `${shape}: indicatorCount matches records`);
    equal(a.totals.ownerMatchCount,
      a.controls.filter((c) => c.ownerMatch === 'target-answer').length,
      `${shape}: ownerMatchCount counts RAW target-answer matches`);
    if (shape !== 'unlabeled') {
      ok(a.totals.ownerMatchCount > 0, `${shape}: raw owner matches are not zeroed by label rejection`);
    }
    equal(a.totals.adjacentControlCount, a.adjacent.length, `${shape}: adjacent count matches records`);
  }
});

await fixture('audit: indicator topology is fully described', () => {
  const { a } = auditOf('ideal');
  equal(a.indicators.length, 1, 'one indicator');
  const i = a.indicators[0];
  equal(i.region, 'answer-section', 'in the answer section');
  equal(i.tag, 'span', 'its tag');
  equal(i.parentTag, 'div', 'and its parent tag');
  equal(i.exactPattern, true, 'matching the exact pattern');
  equal(i.groupButtonCount, 2, 'its group holds both controls');
  equal(i.parentButtonCount, 2, 'as does its immediate parent');
  ok(i.previousButtonOrdinal >= 0 && i.nextButtonOrdinal >= 0, 'the flanking controls are identified');
  ok(i.resolverHops >= 0, 'and the hop at which the resolver finds it is recorded');
});

await fixture('audit: a sibling action row classifies as outside the resolver root', () => {
  const { a } = auditOf('sibling');
  equal(a.failureClass, 'pager-outside-answer-section', 'classified as outside the search root');
  equal(a.totals.resolverOwnedCount, 0, 'the unchanged resolver finds nothing');
  ok(a.totals.adjacentControlCount >= 2, 'yet the audit sees the adjacent controls');
  ok(a.adjacent.every((x) => x.region !== 'answer-section'), 'all outside the answer section');
});

await fixture('audit: ownership rejection is distinguished from label rejection', () => {
  const { a } = auditOf('owner-mismatch');
  equal(a.totals.adjacentContractCount, 2, 'the labels DO match the contract');
  equal(a.adjacent.filter((x) => x.ownerMatch === 'target-answer').length, 0,
    'but none resolves to the target answer');
  equal(a.failureClass, 'pager-ownership-contract-mismatch', 'classified as an ownership mismatch');
});

await fixture('audit: the summary survives the target being removed', () => {
  const { w, a } = auditOf('relabelled');
  const before = JSON.stringify(a);
  w.sc.children.length = 0;
  const d = w.rt.api.chatAtlasRevealDiagnostics();
  equal(d.pagerAuditState, 'captured', 'the captured state survives');
  equal(d.pagerAuditLikelyFailureClass, 'pager-label-contract-mismatch', 'so does the classification');
  ok(d.pagerAuditUniqueButtonCount >= 2, 'and the unique counts');
  equal(JSON.stringify(w.rt.api.chatAtlasRevealState.pagerAudit), before, 'unchanged after the DOM is gone');
});

await fixture('audit: nothing raw is ever exposed', () => {
  const { a } = auditOf('toolbar-and-pager');
  const blob = JSON.stringify(a);
  for (const raw of ['Previous response', 'Next response', 'Copy response', 'Share',
    'Switch model', 'More actions', 'tb-Share', TQ, TA, '1/2']) {
    ok(!blob.includes(raw), `raw value ${raw.slice(0, 16)} is absent`);
  }
  for (const raw of ['Tooltip Share', 'Tooltip Copy response']) {
    ok(!blob.includes(raw), `raw title ${raw} is absent`);
  }
  const labelled = a.controls.find((c) => c.ariaLabelPresent);
  ok(String(labelled.ariaLabelHash).startsWith('djb2:'), 'aria-label is hashed');
  ok(String(labelled.testIdHash).startsWith('djb2:'), 'data-testid is hashed');
  const titled = a.controls.find((c) => c.titlePresent);
  ok(titled, 'a control with a title is captured');
  ok(String(titled.titleHash).startsWith('djb2:'), 'and its title is hashed');
});

await fixture('audit: it activates nothing at all', () => {
  const w = auditWorld('toolbar-and-pager');
  const buttons = w.answerSec.querySelectorAll('button');
  w.rt.api.chatAtlasRevealAuditPager(w.row);
  equal(buttons.reduce((n, b) => n + b.clicks, 0), 0, 'no control was clicked');
  equal(w.sc.scrollTop, 29737, 'the viewport did not move');
  for (const name of ['chatAtlasRevealAuditPager', 'chatAtlasPagerAuditControl', 'chatAtlasPagerAuditRegions']) {
    const body = extractFunction(CORE_SOURCE, name);
    ok(!/\.click\(/.test(body), `${name} never clicks`);
    ok(!/\.scrollTop\s*=[^=]|scrollIntoView|scrollTo\(/.test(body), `${name} never scrolls`);
    for (const forbidden of ['manualOverrideActive', 'chatAtlasRunNativeConvergence', 'setActiveTurnId', 'dispatchEvent']) {
      ok(!body.includes(forbidden), `${name} never uses ${forbidden}`);
    }
  }
  const audit = extractFunction(CORE_SOURCE, 'chatAtlasRevealAuditPager');
  ok(!audit.includes('D.querySelectorAll') && !audit.includes('document.'), 'and never scans the document');
});


// ── Container-wide pager locator (Stage 2C-2ah5) ──────────────────────────
// The section-scoped audit found no indicator at all. These fixtures widen the
// search to the proven conversation container plus bounded overlay roots, and
// pin the six-value conclusion enum to real structural evidence.
const CHEVRON = { viewBox: '0 0 24 24', d: 'M15 18l-6-6 6-6' };
const OTHER_ICON = { viewBox: '0 0 20', d: 'M4 4h12' };

function icon(host, opts = {}) {
  const b = new El('BUTTON');
  if (opts.label) b.setAttribute('aria-label', opts.label);
  if (opts.title) b.setAttribute('title', opts.title);
  if (opts.testId) b.setAttribute('data-testid', opts.testId);
  if (opts.shape) {
    const svg = new El('SVG');
    svg.setAttribute('viewBox', opts.shape.viewBox);
    const path = new El('PATH');
    path.setAttribute('d', opts.shape.d);
    svg.appendChild(path);
    b.appendChild(svg);
  }
  // Layout tops are absolute in this harness; inherit the host's so distance
  // from the target is a real measurement, not an artefact of an unset field.
  b._width = 28; b._height = 28; b._top = opts.top ?? host._top ?? 0;
  host.appendChild(b);
  return b;
}
function numberGroup(host, prev, next, text = '1/2') {
  const group = new El('DIV');
  group._top = host._top || 0;
  if (prev) icon(group, prev);
  const sp = new El('SPAN'); sp.textContent = text; sp._top = group._top; group.appendChild(sp);
  if (next) icon(group, next);
  host.appendChild(group);
  return group;
}

// A genuine, resolver-accepted regeneration pager on some OTHER mounted turn.
function calibrationPager(section, shape = CHEVRON) {
  return numberGroup(section,
    { label: 'Previous response', shape },
    { label: 'Next response', shape });
}

function locatorWorld(shape) {
  const clock = { now: 1000 };
  const root = new El('MAIN');
  const rt = runtime(root, { clock });
  const sc = scroller({ testId: 'conv', clientHeight: 1148, scrollHeight: 40000 });
  sc.scrollTop = 0;
  sc._top = 0; sc._height = 1148; sc._width = 900;
  root.appendChild(sc);

  // The exact Turn-2 target, mounted inside a wrapper so "outside the answer
  // root but still inside the container" is expressible.
  const wrapper = new El('DIV');
  wrapper.setAttribute('data-testid', 'conversation-turn-2');
  wrapper._top = 0;
  sc.appendChild(wrapper);
  const answerSec = new El('DIV');
  answerSec.setAttribute('data-testid', 'conversation-turn-2-a');
  answerSec._top = 0; answerSec._height = 400; answerSec._width = 700;
  wrapper.appendChild(answerSec);
  const q = new El('DIV');
  q.setAttribute('data-message-author-role', 'user');
  q.setAttribute('data-message-id', TQ); q._top = 0;
  answerSec.appendChild(q);
  const a = new El('DIV');
  a.setAttribute('data-message-author-role', 'assistant');
  a.setAttribute('data-message-id', TA);
  a._top = 0; a._height = 400; a._width = 700;
  answerSec.appendChild(a);

  // A second mounted turn, far below.
  const other = turn(30, 'q30', 'a30', 30000, false, sc);

  // The five labelled action buttons plus one unlabelled icon control that the
  // live 2C-2ah4 capture actually observed on the target.
  const target = {};
  if (shape !== 'bare') {
    for (const label of ['Copy response', 'Share', 'Switch model', 'More actions', 'Read aloud']) {
      icon(answerSec, { label, testId: `tb-${label}`, title: `Tooltip ${label}` });
    }
    target.unlabelled = icon(answerSec, { shape: shape === 'signature-match' ? CHEVRON : OTHER_ICON });
  }

  if (shape === 'calibration-only' || shape === 'signature-match' || shape === 'dom-absent') {
    calibrationPager(other);
  }
  if (shape === 'outside-root') {
    calibrationPager(other);
    // Owned by the target (the wrapper holds its assistant) but outside the
    // answer root the section-scoped resolver searches.
    numberGroup(wrapper, { label: 'Previous response' }, { label: 'Next response' });
  }
  if (shape === 'misowned-inside-root') {
    calibrationPager(other);
    const foreign = new El('DIV');
    foreign.setAttribute('data-message-author-role', 'assistant');
    foreign.setAttribute('data-message-id', 'a-someone-else');
    answerSec.appendChild(foreign);
    numberGroup(foreign, { label: 'Previous response' }, { label: 'Next response' });
  }
  if (shape === 'overlay') {
    const layer = new El('DIV');
    layer.position = 'fixed';
    layer._top = 40; layer._height = 60; layer._width = 200;
    numberGroup(layer, { label: 'Previous response' }, { label: 'Next response' });
    root.appendChild(layer);           // sibling of the container, not inside it
  }
  if (shape === 'overlay-far') {
    const layer = new El('DIV');
    layer.position = 'fixed';
    layer._top = 5000; layer._height = 60; layer._width = 200;
    numberGroup(layer, { label: 'Previous response' }, { label: 'Next response' });
    root.appendChild(layer);
  }
  if (shape === 'indicator-only') {
    // A bare n/m with no contract labels and no resolver-accepted pager: real
    // evidence exists, but none of it proves anything about the target.
    const group = new El('DIV');
    group._top = other._top;
    const sp = new El('SPAN'); sp.textContent = '1/2'; sp._top = other._top;
    group.appendChild(sp); other.appendChild(group);
  }
  if (shape === 'direction-words') {
    icon(answerSec, { label: 'Go to previous variant' });
  }
  const row = { mountedQId: TQ, mountedAId: TA, answerSection: answerSec, section: answerSec };
  return { rt, root, sc, wrapper, answerSec, other, row, target, clock };
}
const locate = (shape) => {
  const w = locatorWorld(shape);
  return { w, l: w.rt.api.chatAtlasPagerLocatorCapture(w.row) };
};

await fixture('locator: the container-wide census deduplicates by DOM node', () => {
  const { l } = locate('calibration-only');
  equal(l.state, 'captured', 'the census runs');
  // 6 target controls + 2 calibration pager buttons, each counted once — even
  // though the resolver pass re-offers those same two nodes to the census.
  equal(l.totals.uniqueButtonCount, 8, 'every button-like node appears exactly once');
  equal(l.controls.length, 8, 'and each has exactly one record');
  equal(new Set(l.controls.map((c) => c.ordinal)).size, 8, 'ordinals are unique');
  equal(l.totals.resolverButtonOccurrences, 2, 'the resolver contributes its own pager buttons');
  equal(l.totals.rawButtonOccurrences, 10, 'so raw occurrences exceed the unique node count');
  ok(l.totals.rawButtonOccurrences > l.totals.uniqueButtonCount, 'and dedupe is what collapses them');
});

await fixture('locator: evidence that proves nothing about the target claims nothing', () => {
  const { l } = locate('indicator-only');
  equal(l.totals.containerIndicatorCount, 1, 'an exact indicator does exist in the container');
  equal(l.totals.knownPagerCount, 0, 'but no resolver-accepted pager calibrates it');
  equal(l.totals.containerExactLabelCount, 0, 'and no contract label appears anywhere');
  equal(l.conclusion, 'insufficient-live-evidence', 'so the locator refuses to conclude');
  ok(l.conclusion !== 'pager-dom-absent-for-target', 'absence of proof is never proof of absence');
});

await fixture('locator: exact indicators anywhere in the container are found', () => {
  const { l } = locate('calibration-only');
  equal(l.totals.containerIndicatorCount, 1, 'the only n/m in the container is the calibration pager');
  equal(l.indicators[0].region, 'conversation-container', 'and it is outside the answer section');
  equal(l.indicators[0].ownerMatch, 'other-answer', 'owned by the other mounted answer');
  ok(l.indicators[0].distanceFromTargetPx > 0, 'its distance from the target is measured');
});

await fixture('locator: exact-label and direction-concept buttons are separated', () => {
  const { l } = locate('direction-words');
  equal(l.totals.containerExactLabelCount, 0, 'no exact contract label exists');
  equal(l.totals.containerDirectionalCount, 1, 'but one direction-concept button does');
  const d = l.controls.find((c) => c.directionWords.length);
  ok(d.directionWords.includes('previous'), 'and the concept is recorded, not the text');
  equal(d.ariaLabelPresent, true, 'its label presence is recorded');
  ok(String(d.ariaLabelHash).startsWith('djb2:'), 'the label itself is only ever hashed');
});

await fixture('locator: unlabelled SVG buttons are recorded, never dropped', () => {
  const { l } = locate('calibration-only');
  const u = l.controls.filter((c) => !c.ariaLabelPresent && !c.titlePresent && !c.testIdPresent && c.svg.svgCount > 0);
  equal(u.length, 1, 'the unlabelled sixth control survives the census');
  equal(l.totals.containerUnlabelledSvgCount, 1, 'and the aggregate agrees with the records');
  equal(u[0].ownerMatch, 'target-answer', 'it is owned by the target answer');
  equal(u[0].svg.pathCount, 1, 'its icon geometry is captured structurally');
});

await fixture('locator: a genuine pager elsewhere calibrates the icon signature', () => {
  const { l } = locate('calibration-only');
  equal(l.totals.knownPagerCount, 1, 'one genuine resolver-accepted pager exists');
  equal(l.totals.knownPagerSignatureCount, 1, 'and one signature is captured from it');
  ok(l.knownPagerSignatures[0].signatureKey, 'the signature key is derived from the icon');
  equal(l.knownPagerSignatures[0].ownerIsTarget, false, 'it belongs to another answer');
  ok(l.totals.nearestKnownSignatureDistancePx > 0, 'its distance from the target is known');
});

await fixture('locator: the unlabelled control matching a proven pager icon is a contract mismatch', () => {
  const { l } = locate('signature-match');
  equal(l.totals.unlabelledTargetSignatureMatch, true, 'its geometry matches a proven pager');
  ok(l.totals.targetSignatureMatches >= 1, 'the match is counted');
  equal(l.conclusion, 'pager-contract-signature-mismatch', 'so the label contract, not the DOM, is the gap');
});

await fixture('locator: an SVG alone never promotes the unlabelled control to a pager', () => {
  const { l } = locate('calibration-only');
  equal(l.totals.containerUnlabelledSvgCount, 1, 'the unlabelled SVG control is present');
  equal(l.totals.unlabelledTargetSignatureMatch, false, 'but its geometry matches no proven pager');
  ok(l.conclusion !== 'pager-contract-signature-mismatch', 'so it is never called a pager');
  equal(l.conclusion, 'pager-dom-absent-for-target', 'the target simply has no pager in the DOM');
});

await fixture('locator: a target-owned pager outside the answer root is located', () => {
  const { l } = locate('outside-root');
  const outside = l.controls.filter((c) => c.exactContractLabel && c.ownerMatch === 'target-answer');
  ok(outside.length >= 2, 'the exact pager controls are owned by the target');
  ok(outside.every((c) => c.region === 'conversation-container'), 'yet none is inside the answer root');
  equal(l.conclusion, 'pager-found-outside-target-root', 'which is exactly the located failure');
});

await fixture('locator: a pager inside the answer root owned by another message is an owner mismatch', () => {
  const { l } = locate('misowned-inside-root');
  const inside = l.controls.filter((c) => c.exactContractLabel && c.region === 'answer-section');
  ok(inside.length >= 2, 'the pager sits inside the answer root');
  ok(inside.every((c) => c.ownerMatch === 'other-answer'), 'but resolves to a different owner');
  equal(l.conclusion, 'pager-owner-resolution-mismatch', 'so ownership, not location, is the gap');
});

await fixture('locator: calibration present and nothing for the target means the DOM lacks it', () => {
  const { l } = locate('dom-absent');
  ok(l.totals.knownPagerCount > 0, 'a genuine pager proves the contract still exists');
  equal(l.totals.containerExactLabelCount, 2, 'but only on the other turn');
  equal(l.conclusion, 'pager-dom-absent-for-target', 'the target has no pager anywhere');
});

await fixture('locator: with no pager and no indicator anywhere, calibration is unavailable', () => {
  const { l } = locate('bare');
  equal(l.totals.knownPagerCount, 0, 'no genuine pager is mounted');
  equal(l.totals.containerIndicatorCount, 0, 'and no exact indicator exists');
  equal(l.conclusion, 'no-native-pager-calibration-available', 'so no conclusion about the target is claimed');
});

await fixture('locator: overlay roots are bounded and only near-target candidates count', () => {
  const near = locate('overlay').l;
  equal(near.totals.overlayCandidateCount, 1, 'the sibling overlay layer is seen');
  equal(near.overlayCandidates[0].root, 'container-sibling', 'and its bounded root is named');
  equal(near.overlayCandidates[0].proximity, 'near-target', 'it sits beside the target');
  equal(near.conclusion, 'pager-found-outside-target-root', 'so the pager is located, off-root');
  const far = locate('overlay-far').l;
  equal(far.overlayCandidates[0].proximity, 'far', 'a distant layer is not near the target');
  ok(far.conclusion !== 'pager-found-outside-target-root', 'and never satisfies the located verdict');
});

await fixture('locator: visibility signals are read, never synthesized', () => {
  const { w, l } = locate('calibration-only');
  equal(l.visibility.intersectsViewport, true, 'the mounted target intersects the container viewport');
  equal(l.visibility.visiblePercent, 100, 'and is fully visible');
  equal(l.visibility.hovered, false, 'hover is reported as observed, not induced');
  equal(l.visibility.focusWithin, false, 'focus-within likewise');
  equal(w.answerSec.clicks, 0, 'and nothing was clicked to learn any of it');
  const body = extractFunction(CORE_SOURCE, 'chatAtlasPagerLocatorCapture');
  for (const forbidden of ['.click(', '.focus(', 'dispatchEvent', 'scrollIntoView', 'mouseover']) {
    ok(!body.includes(forbidden), `the locator never uses ${forbidden}`);
  }
});

await fixture('locator: the frozen summary survives the target being removed', () => {
  const { w, l } = locate('calibration-only');
  const before = l.conclusion;
  w.sc.children.length = 0;
  const d = w.rt.api.chatAtlasRevealDiagnostics();
  equal(d.pagerLocatorConclusion, before, 'the published conclusion is unchanged by restoration');
  equal(d.pagerLocatorState, 'captured', 'and the state stays truthful');
  equal(Object.isFrozen(l), true, 'the summary is frozen');
});

await fixture('locator: the scope is the proven container, and unavailable scope is admitted', () => {
  const { l } = locate('calibration-only');
  ok(l.controls.every((c) => c.region === 'answer-section' || c.region === 'conversation-container'),
    'every record names a bounded region');
  const w = locatorWorld('calibration-only');
  const bad = w.rt.api.chatAtlasPagerLocatorCapture({ mountedQId: TQ, mountedAId: '', answerSection: null });
  equal(bad.state, 'skipped', 'an unresolvable target is skipped');
  equal(bad.reason, 'locator-scope-unavailable', 'with the reason stated');
  equal(bad.conclusion, 'insufficient-live-evidence', 'and no verdict is invented');
});

await fixture('locator: nothing raw is ever exposed', () => {
  const { w } = locate('signature-match');
  const d = w.rt.api.chatAtlasRevealDiagnostics();
  const locator = Object.fromEntries(Object.entries(d).filter(([k]) => k.startsWith('pagerLocator')));
  equal(Object.keys(locator).length, 22, 'the locator publishes its full diagnostic surface');
  const text = JSON.stringify(locator);
  ok(!/authorization|token|rawPayload|mapping|messageText|attachment|toolOutput/i.test(text), 'no forbidden key appears');
  for (const raw of ['Previous response', 'Next response', 'Copy response', TQ, TA, CHEVRON.d, CHEVRON.viewBox]) {
    ok(!text.includes(raw), `the raw value ${raw.slice(0, 12)} never appears`);
  }
  ok(text.includes('djb2:'), 'labels and geometry appear only as hashes');
});

await fixture('locator: it activates nothing at all', () => {
  const names = ['chatAtlasPagerLocatorCapture', 'chatAtlasPagerLocatorControl', 'chatAtlasPagerLocatorOwner',
    'chatAtlasPagerLocatorSvgSignature', 'chatAtlasPagerLocatorRect'];
  for (const name of names) {
    const body = extractFunction(CORE_SOURCE, name);
    ok(!/\.click\(/.test(body), `${name} never clicks`);
    ok(!/\.scrollTop\s*=[^=]|scrollIntoView|scrollTo\(/.test(body), `${name} never scrolls`);
    for (const forbidden of ['manualOverrideActive', 'chatAtlasRunNativeConvergence', 'setActiveTurnId', 'dispatchEvent']) {
      ok(!body.includes(forbidden), `${name} never uses ${forbidden}`);
    }
  }
  const resolver = extractFunction(CORE_SOURCE, 'chatAtlasNativeVariantPagers');
  ok(resolver.includes("label !== 'previous response' && label !== 'next response'"),
    'the native pager resolver itself is unchanged by this stage');
});


// ── Turn-2 graph eligibility audit (Stage 2C-2ah7) ────────────────────────
// Graph-bearing fixtures: every case is an identity-graph shape, never a DOM
// approximation. The sibling question is decided on edges, not on a shared row.
const TD = '37ab747d-7fe1-4c25-ad63-6e9aee8e887f';

function gnode(id, opts = {}) {
  return {
    nodeId: id,
    parentId: opts.parent || null,
    childIds: [],
    role: opts.role || null,
    messageId: opts.messageId === undefined ? id : opts.messageId,
    productUser: opts.productUser === true,
    productAnswer: opts.productAnswer === true,
    branchShellAlias: opts.alias === true,
    stopped: opts.stopped === true,
    createTime: opts.createTime === undefined ? 100 : opts.createTime,
  };
}
function graphOf(nodes, currentNode = null) {
  const byId = new Map(nodes.map((n) => [n.nodeId, n]));
  for (const n of nodes) n.childIds = [];
  for (const n of nodes) {
    const parent = n.parentId ? byId.get(n.parentId) : null;
    if (parent) parent.childIds.push(n.nodeId);
  }
  return { chatId: 'c', currentNode, nodeCount: nodes.length, capturedAt: 1, nodes };
}
const U = (id, parent, t) => gnode(id, { parent, role: 'user', productUser: true, createTime: t });
const A = (id, parent, t, extra = {}) => gnode(id, {
  parent, role: 'assistant', productAnswer: extra.stopped !== true && extra.alias !== true,
  createTime: t, ...extra,
});

// root → u1 → a1 → TQ(u2) → …  Turn 2 is the target throughout.
function baseSpine() {
  return [
    gnode('zzROOT', { role: 'system' }),
    U('zzU1', 'zzROOT', 10),
    A('zzA1', 'zzU1', 20),
    gnode('zzU2', { parent: 'zzA1', role: 'user', productUser: true, messageId: TQ, createTime: 30 }),
  ];
}
function graphWorld(nodes, opts = {}) {
  const root = new El('MAIN');
  const rt = runtime(root, {
    identityGraph: graphOf(nodes, opts.currentNode || null),
    effectiveTurns: opts.effectiveTurns || [{ order: 2, qId: TQ, primaryAId: TA }],
  });
  return { rt, root };
}
const graphAuditOf = (nodes, opts = {}) => {
  const w = graphWorld(nodes, opts);
  return { w, g: w.rt.api.chatAtlasCaptureTurn2GraphAudit() };
};

// Two real assistant answer roots directly under the target question.
const genuineSiblings = () => baseSpine().concat([
  gnode('zzCUR', { parent: 'zzU2', role: 'assistant', productAnswer: true, messageId: TA, createTime: 100 }),
  gnode('zzDEF', { parent: 'zzU2', role: 'assistant', productAnswer: true, messageId: TD, createTime: 200 }),
]);

await fixture('graph audit 1: two direct assistant roots are genuine eligible siblings', () => {
  const { g } = graphAuditOf(genuineSiblings(), { currentNode: 'zzDEF' });
  equal(g.state, 'captured', 'the audit reaches a terminal captured state');
  equal(g.question.unique, true, 'the target question resolves uniquely');
  equal(g.question.answerRootCount, 2, 'it carries two answer-variant roots');
  equal(g.question.answerRootCountGreaterThanOne, true, 'which is more than one');
  equal(g.current.answerRootOrdinal, 0, 'the current assistant is the first root');
  equal(g.defaultAnswer.answerRootOrdinal, 1, 'the default assistant is the second');
  equal(g.turn2Point.found, true, 'the branch vector carries a Turn-2 point');
  equal(g.turn2Point.kind, 'assistant-regeneration', 'and it is a regeneration point');
  equal(g.turn2Point.containsBoth, true, 'both identities are in the same variant set');
  equal(g.defaultEligibility.nativeSibling, true, 'so the native sibling relation is proven');
  equal(g.defaultEligibility.presentation, true, 'and the target is presentation-eligible');
  equal(g.defaultEligibility.exclusionReason, 'none', 'with nothing excluding it');
  equal(g.conclusion, 'genuine-eligible-answer-siblings', 'conclusion 1');
  equal(g.policyRecommendation, 'default-target-valid', 'and the policy needs no change');
});

await fixture('graph audit 2: a branch-shell alias target is a sibling but not selectable', () => {
  const nodes = baseSpine().concat([
    gnode('zzCUR', { parent: 'zzU2', role: 'assistant', productAnswer: true, messageId: TA, createTime: 300 }),
    gnode('zzDEF', { parent: 'zzU2', role: 'assistant', alias: true, messageId: TD, createTime: 200 }),
  ]);
  const { g } = graphAuditOf(nodes, { currentNode: 'zzCUR' });
  equal(g.turn2Point.containsBoth, true, 'both roots are in the same variant set');
  equal(g.defaultEligibility.nativeSibling, true, 'so siblinghood is proven');
  equal(g.defaultAnswer.branchShellAlias, true, 'but the target is hidden from the conversation');
  equal(g.defaultEligibility.archive, true, 'the archive may still retain it');
  equal(g.defaultEligibility.presentation, false, 'while presentation must not select it');
  equal(g.defaultEligibility.exclusionReason, 'branch-shell-alias', 'named exactly');
  equal(g.conclusion, 'sibling-target-not-presentation-eligible', 'conclusion 2');
  equal(g.policyRecommendation, 'exclude-branch-shell-alias', 'and the policy fix is named');
});

await fixture('graph audit 3: a stopped target is a sibling but not selectable', () => {
  const nodes = baseSpine().concat([
    gnode('zzCUR', { parent: 'zzU2', role: 'assistant', productAnswer: true, messageId: TA, createTime: 300 }),
    gnode('zzDEF', { parent: 'zzU2', role: 'assistant', stopped: true, messageId: TD, createTime: 200 }),
  ]);
  const { g } = graphAuditOf(nodes, { currentNode: 'zzCUR' });
  equal(g.question.answerRootCount, 2, 'a stopped answer is still an answer-variant root');
  equal(g.turn2Point.containsBoth, true, 'and still appears in the variant set');
  equal(g.defaultEligibility.nativeSibling, true, 'so siblinghood holds');
  equal(g.defaultAnswer.stopped, true, 'but the answer was stopped');
  equal(g.defaultAnswer.productAnswer, false, 'so it is not a product answer');
  equal(g.defaultEligibility.presentation, false, 'and must not be selected');
  equal(g.defaultEligibility.exclusionReason, 'stopped', 'named exactly');
  equal(g.conclusion, 'sibling-target-not-presentation-eligible', 'conclusion 2');
  equal(g.policyRecommendation, 'exclude-stopped-answer', 'and the policy fix is named');
});

await fixture('graph audit 4: an intermediate wrapper is not a sibling relationship', () => {
  const nodes = baseSpine().concat([
    gnode('zzW', { parent: 'zzU2', role: 'system' }),
    gnode('zzCUR', { parent: 'zzW', role: 'assistant', productAnswer: true, messageId: TA, createTime: 100 }),
    gnode('zzDEF', { parent: 'zzW', role: 'assistant', productAnswer: true, messageId: TD, createTime: 200 }),
  ]);
  const { g } = graphAuditOf(nodes, { currentNode: 'zzDEF' });
  equal(g.question.answerRootCount, 1, 'the question has exactly ONE native answer root');
  equal(g.question.answerRootCountGreaterThanOne, false, 'one root is never more than one');
  equal(g.current.answerRootOrdinal, 0, 'both identities resolve through it');
  equal(g.defaultAnswer.answerRootOrdinal, 0, 'the same single root');
  equal(g.defaultAnswer.intermediateNodeBetweenQuestionAndIdentity, true, 'via an intermediate node');
  equal(g.turn2Point.found, false, 'so no regeneration point exists at all');
  equal(g.defaultEligibility.nativeSibling, false, 'and no sibling relation is proven');
  equal(g.conclusion, 'not-genuine-answer-siblings', 'conclusion 3');
  equal(g.policyRecommendation, 'require-direct-answer-sibling', 'the policy must demand a real sibling');
});

await fixture('graph audit 5: a question-edit branch never claims assistant siblings', () => {
  const nodes = baseSpine().concat([
    gnode('zzCUR', { parent: 'zzU2', role: 'assistant', productAnswer: true, messageId: TA, createTime: 100 }),
    gnode('zzU2B', { parent: 'zzA1', role: 'user', productUser: true, messageId: 'zzQEDIT', createTime: 40 }),
    gnode('zzDEF', { parent: 'zzU2B', role: 'assistant', productAnswer: true, messageId: TD, createTime: 200 }),
  ]);
  const { g } = graphAuditOf(nodes, { currentNode: 'zzDEF' });
  equal(g.question.questionVariantCount, 2, 'the real branch here is a question edit');
  equal(g.question.answerRootCount, 1, 'the target question has one answer root');
  equal(g.question.answerRootCountGreaterThanOne, false, 'so no answer branch exists here');
  equal(g.turn2Point.kind, 'none', 'so there is no assistant-regeneration point');
  equal(g.defaultAnswer.parentIsTargetQuestion, false, 'the default answer hangs off the other variant');
  equal(g.conclusion, 'not-genuine-answer-siblings', 'and the same-row observation is refused');
});

await fixture('graph audit 6: a default answer under another question is not a sibling', () => {
  const nodes = baseSpine().concat([
    gnode('zzCUR', { parent: 'zzU2', role: 'assistant', productAnswer: true, messageId: TA, createTime: 100 }),
    gnode('zzDEF', { parent: 'zzU1', role: 'assistant', productAnswer: true, messageId: TD, createTime: 200 }),
  ]);
  const { g } = graphAuditOf(nodes, { currentNode: 'zzCUR' });
  equal(g.defaultAnswer.found, true, 'the node exists');
  equal(g.defaultAnswer.parentIsTargetQuestion, false, 'but its parent is a different question');
  equal(g.defaultAnswer.reachableFromAnswerRoot, false, 'and no answer root of the target reaches it');
  equal(g.defaultAnswer.graphPathContainsTargetQuestion, false, 'its chain never passes the target question');
  equal(g.defaultEligibility.exclusionReason, 'parent-mismatch', 'named exactly');
  equal(g.conclusion, 'not-genuine-answer-siblings', 'conclusion 3');
});

await fixture('graph audit 7: plausible records without shared variant membership fail closed', () => {
  // Two real roots under the target, but the newest-created terminal lives on
  // a different question variant, so the default chain never visits Turn 2.
  const nodes = baseSpine().concat([
    gnode('zzCUR', { parent: 'zzU2', role: 'assistant', productAnswer: true, messageId: TA, createTime: 100 }),
    gnode('zzDEF', { parent: 'zzU2', role: 'assistant', productAnswer: true, messageId: TD, createTime: 200 }),
    gnode('zzU2B', { parent: 'zzA1', role: 'user', productUser: true, messageId: 'zzQEDIT', createTime: 40 }),
    gnode('zzOTHER', { parent: 'zzU2B', role: 'assistant', productAnswer: true, messageId: 'zzAOTHER', createTime: 900 }),
  ]);
  const { g } = graphAuditOf(nodes, { currentNode: 'zzOTHER' });
  equal(g.question.answerRootCountGreaterThanOne, true, 'the direct records look plausible');
  equal(g.current.reachableFromAnswerRoot, true, 'both identities resolve from answer roots');
  equal(g.defaultAnswer.reachableFromAnswerRoot, true, 'structurally');
  equal(g.turn2Point.found, false, 'yet no Turn-2 point is present in the default branch vector');
  equal(g.turn2Point.containsBoth, false, 'so shared membership is unproven');
  equal(g.defaultEligibility.exclusionReason, 'not-resolved-from-answer-root',
    'and the missing membership is the stated exclusion');
  equal(g.defaultEligibility.nativeSibling, false, 'and the audit refuses to claim siblinghood');
  equal(g.conclusion, 'not-genuine-answer-siblings', 'failing closed');
  equal(g.policyRecommendation, 'require-branch-vector-membership', 'naming the missing proof');
});

await fixture('graph audit 8: a duplicated graph identity is an ambiguity, not a verdict', () => {
  const nodes = genuineSiblings().concat([
    gnode('zzDUP', { parent: 'zzU2', role: 'assistant', productAnswer: true, messageId: TD, createTime: 250 }),
  ]);
  const { g } = graphAuditOf(nodes, { currentNode: 'zzDEF' });
  equal(g.conclusion, 'graph-identity-ambiguous', 'conclusion 4');
  equal(g.defaultEligibility.exclusionReason, 'ambiguous-root', 'named exactly');
  equal(g.policyRecommendation, 'graph-ambiguous', 'and no policy claim is made');
});

await fixture('graph audit 9: current-graph agreement is proven through the chain', () => {
  // The pointer is a node BELOW the current assistant: equality with the
  // assistant id would be false, chain membership is what proves agreement.
  const nodes = genuineSiblings().concat([
    gnode('zzTAIL', { parent: 'zzCUR', role: 'tool', messageId: 'zzTOOL', createTime: 400 }),
  ]);
  const { g } = graphAuditOf(nodes, { currentNode: 'zzTAIL' });
  equal(g.pointer.present, true, 'the host pointer is captured');
  equal(g.pointer.belongsToGraph, true, 'and belongs to this graph');
  equal(g.pointer.chainContainsQuestion, true, 'its chain passes the target question');
  equal(g.pointer.chainContainsCurrent, true, 'and contains the current assistant');
  equal(g.pointer.chainContainsDefault, false, 'but not the default assistant');
  equal(g.pointer.agreesWithEffective, true, 'so the graph agrees with the effective row');
  const off = graphAuditOf(genuineSiblings(), { currentNode: 'zzDEF' }).g;
  equal(off.pointer.chainContainsCurrent, false, 'a chain through the other variant excludes it');
  equal(off.pointer.agreesWithEffective, false, 'and agreement is correctly denied');
});

await fixture('graph audit 10: the summary carries no raw node or variant identifiers', () => {
  const { w } = graphAuditOf(genuineSiblings(), { currentNode: 'zzDEF' });
  const d = w.rt.api.chatAtlasRevealDiagnostics();
  const audit = Object.fromEntries(Object.entries(d).filter(([k]) => k.startsWith('turn2')));
  equal(Object.keys(audit).length, 40, 'the audit publishes its full diagnostic surface');
  const text = JSON.stringify(audit);
  ok(!/authorization|token|rawPayload|mapping|messageText|attachment|toolOutput/i.test(text), 'no forbidden key');
  for (const raw of [TQ, TA, TD, 'zzROOT', 'zzU1', 'zzA1', 'zzU2', 'zzCUR', 'zzDEF', 'zzTAIL']) {
    ok(!text.includes(raw), `the raw identifier ${raw} never appears`);
  }
  ok(text.includes('genuine-eligible-answer-siblings'), 'only enums, counts and booleans are published');
});

await fixture('graph audit 11: the frozen summary survives a graph refresh', () => {
  const { w, g } = graphAuditOf(genuineSiblings(), { currentNode: 'zzDEF' });
  equal(Object.isFrozen(g), true, 'the summary is frozen');
  w.rt.sandbox.selectedPathAcquisitionState.graph = null;
  const d = w.rt.api.chatAtlasRevealDiagnostics();
  equal(d.turn2GraphAuditState, 'captured', 'the state survives the graph going away');
  equal(d.turn2GraphAuditConclusion, 'genuine-eligible-answer-siblings', 'and so does the conclusion');
  equal(d.turn2AnswerRootCount, 2, 'and the evidence behind it');
});

await fixture('graph audit 12: it acts on nothing and mutates no production policy', () => {
  const names = ['chatAtlasCaptureTurn2GraphAudit', 'chatAtlasTurn2AuditAssistant',
    'chatAtlasTurn2AuditMatchCount', 'chatAtlasTurn2AuditNodeByMessageId', 'chatAtlasTurn2AuditRole'];
  for (const name of names) {
    const body = extractFunction(CORE_SOURCE, name);
    ok(!/\.click\(/.test(body), `${name} never clicks`);
    ok(!/\.scrollTop\s*=[^=]|scrollIntoView|scrollTo\(/.test(body), `${name} never scrolls`);
    for (const forbidden of ['manualOverrideActive', 'chatAtlasRunNativeConvergence', 'setActiveTurnId', 'dispatchEvent']) {
      ok(!body.includes(forbidden), `${name} never uses ${forbidden}`);
    }
  }
  const audit = extractFunction(CORE_SOURCE, 'chatAtlasCaptureTurn2GraphAudit');
  ok(!/chatAtlasDefaultOverlayState\.\w+\s*=[^=]/.test(audit), 'it never writes to the default overlay state');
  ok(!/completeTurnIndexAuthorityState\.\w+\s*=[^=]/.test(audit), 'nor to the authority state');
  ok(!/function chatAtlas(SelectLatestCreatedTerminal|BranchVectorForChain|TurnsFromChain)/.test(audit),
    'and it redefines none of the protected traversal helpers');
  const { w } = graphAuditOf(genuineSiblings(), { currentNode: 'zzDEF' });
  equal(w.rt.sandbox.chatAtlasDefaultOverlayState.manualOverrideActive, undefined,
    'no manual override is ever set');
});


// ── Graph-proven divergence (Stage 2C-2ah8) ───────────────────────────────
// The native control kind must come from a real branch edge. A shared
// presentation qId is an observation and may never select a control type.
function divergenceWorld(nodes, opts = {}) {
  const root = new El('MAIN');
  const rt = runtime(root, {
    identityGraph: graphOf(nodes, opts.currentNode || null),
    effectiveTurns: opts.effectiveTurns || [{ order: 2, qId: TQ, primaryAId: TA }],
  });
  return { rt, root };
}
const divergeOf = (nodes, opts = {}) => {
  const w = divergenceWorld(nodes, opts);
  return { w, d: w.rt.api.chatAtlasGraphDivergence() };
};

// THE LIVE SHAPE: one presentation row, two question variants beneath one
// assistant owner. Each variant owns exactly ONE answer.
function liveQuestionEditShape() {
  return [
    gnode('zzROOT', { role: 'system' }),
    gnode('zzU1', { parent: 'zzROOT', role: 'user', productUser: true, createTime: 10 }),
    gnode('zzOWNER', { parent: 'zzU1', role: 'assistant', productAnswer: true, createTime: 20 }),
    gnode('zzQA', { parent: 'zzOWNER', role: 'user', productUser: true, messageId: TQ, createTime: 30 }),
    gnode('zzACUR', { parent: 'zzQA', role: 'assistant', productAnswer: true, messageId: TA, createTime: 40 }),
    gnode('zzQB', { parent: 'zzOWNER', role: 'user', productUser: true, messageId: 'zzQEDIT', createTime: 50 }),
    gnode('zzADEF', { parent: 'zzQB', role: 'assistant', productAnswer: true, messageId: TD, createTime: 900 }),
  ];
}
function genuineAnswerSiblingShape() {
  return [
    gnode('zzROOT', { role: 'system' }),
    gnode('zzU1', { parent: 'zzROOT', role: 'user', productUser: true, createTime: 10 }),
    gnode('zzOWNER', { parent: 'zzU1', role: 'assistant', productAnswer: true, createTime: 20 }),
    gnode('zzQA', { parent: 'zzOWNER', role: 'user', productUser: true, messageId: TQ, createTime: 30 }),
    gnode('zzACUR', { parent: 'zzQA', role: 'assistant', productAnswer: true, messageId: TA, createTime: 40 }),
    gnode('zzADEF', { parent: 'zzQA', role: 'assistant', productAnswer: true, messageId: TD, createTime: 900 }),
  ];
}

await fixture('divergence 1: the live Turn-2 shape resolves to a graph-proven question edit', () => {
  const { d } = divergeOf(liveQuestionEditShape(), { currentNode: 'zzACUR' });
  equal(d.state, 'proven', 'the divergence is proven from the graph');
  equal(d.kind, 'question-edit', 'and it is a question edit, not a regeneration');
  equal(d.directAnswerSiblingProof, false, 'no direct answer-sibling relation exists');
  equal(d.questionVariantProof, true, 'the two roots are genuine question variants');
  equal(d.variantCount, 2, 'the variant set holds both questions');
  equal(d.currentIndex, 0, 'the current variant index is known');
  equal(d.defaultIndex, 1, 'and so is the target');
  equal(d.requiredDirection, 'next', 'so the direction is derived, not guessed');
  equal(d.branchVectorAgreement, true, 'both chains agree about the branch point');
});

await fixture('divergence 2: two direct answer roots are a graph-proven regeneration', () => {
  const { d } = divergeOf(genuineAnswerSiblingShape(), { currentNode: 'zzACUR' });
  equal(d.state, 'proven', 'the divergence is proven');
  equal(d.kind, 'assistant-regeneration', 'and it is a regeneration');
  equal(d.directAnswerSiblingProof, true, 'because the sibling relation is graph-proven');
  equal(d.questionVariantProof, false, 'no question variants are involved');
  equal(d.variantCount, 2, 'the answer-variant set holds both answers');
  equal(d.ownerMessageId, TQ, 'and the owner is the exact question node');
});

await fixture('divergence 3: a deeper downstream answer difference is never a regeneration', () => {
  const nodes = [
    gnode('zzROOT', { role: 'system' }),
    gnode('zzQA', { parent: 'zzROOT', role: 'user', productUser: true, messageId: TQ, createTime: 30 }),
    gnode('zzW', { parent: 'zzQA', role: 'system', createTime: 35 }),
    gnode('zzACUR', { parent: 'zzW', role: 'assistant', productAnswer: true, messageId: TA, createTime: 40 }),
    gnode('zzADEF', { parent: 'zzW', role: 'assistant', productAnswer: true, messageId: TD, createTime: 900 }),
  ];
  const { d } = divergeOf(nodes, { currentNode: 'zzACUR' });
  ok(d.kind !== 'assistant-regeneration', 'the shared qId never earns a regeneration verdict');
  equal(d.state, 'fail-closed', 'it fails closed instead');
  equal(d.directAnswerSiblingProof, false, 'with no sibling proof');
});

await fixture('divergence 3b: a stopped answer variant never becomes the default terminal', () => {
  // Both roots are direct answer children, so a naive reading would call this
  // a regeneration divergence. The newest-created policy declines the stopped
  // root outright, so the two chains never diverge in the first place.
  const nodes = [
    gnode('zzROOT', { role: 'system' }),
    gnode('zzQA', { parent: 'zzROOT', role: 'user', productUser: true, messageId: TQ, createTime: 30 }),
    gnode('zzACUR', { parent: 'zzQA', role: 'assistant', productAnswer: true, messageId: TA, createTime: 40 }),
    gnode('zzADEF', { parent: 'zzQA', role: 'assistant', stopped: true, messageId: TD, createTime: 900 }),
  ];
  const { d } = divergeOf(nodes, { currentNode: 'zzACUR' });
  equal(d.state, 'identical', 'the default route is the current route');
  equal(d.reason, 'chains-identical', 'because the stopped variant is not an eligible terminal');
  equal(d.kind, null, 'so no divergence kind is claimed at all');
  equal(d.directAnswerSiblingProof, false, 'and no sibling proof is asserted');
});

await fixture('divergence 4: the exact graph owner is kept, never the presentation qId', () => {
  const { d } = divergeOf(liveQuestionEditShape(), { currentNode: 'zzACUR' });
  ok(d.ownerMessageId !== TQ, 'the branch owner is NOT the presentation question');
  equal(d.ownerMessageId, 'zzOWNER', 'it is the assistant the variants hang from');
  equal(d.ownerRole, 'assistant', 'and its role is recorded');
  equal(d.currentRootMessageId, TQ, 'the current variant is the mounted question');
  equal(d.defaultRootMessageId, 'zzQEDIT', 'the target variant is the edited one');
});

await fixture('divergence 5: an absent branch-vector point fails closed with no fallback', () => {
  const nodes = [
    gnode('zzROOT', { role: 'system' }),
    gnode('zzQA', { parent: 'zzROOT', role: 'user', productUser: true, messageId: TQ, createTime: 30 }),
    gnode('zzW', { parent: 'zzQA', role: 'system', createTime: 35 }),
    gnode('zzACUR', { parent: 'zzW', role: 'assistant', productAnswer: true, messageId: TA, createTime: 40 }),
    gnode('zzADEF', { parent: 'zzW', role: 'assistant', productAnswer: true, messageId: TD, createTime: 900 }),
  ];
  const { d } = divergeOf(nodes, { currentNode: 'zzACUR' });
  equal(d.reason, 'branch-vector-point-absent', 'the exact reason is stated');
  equal(d.kind, null, 'and no kind is invented');
  equal(d.variantCount, 0, 'no variant evidence is fabricated');
});

await fixture('divergence 6: membership in one variant set is required, not assumed', () => {
  const { w } = divergeOf(liveQuestionEditShape(), { currentNode: 'zzACUR' });
  const pointFor = w.rt.api.chatAtlasGraphDivergencePointFor;
  const vector = [{ kind: 'question-edit', variantIds: ['zzQA', 'zzQB'], variantCount: 2 }];
  ok(pointFor(vector, 'zzQA'), 'a root inside the variant set resolves its point');
  equal(pointFor(vector, 'zzSTRANGER'), null, 'a root outside it resolves nothing');
  equal(pointFor(vector, ''), null, 'and an absent root is never matched');
  equal(pointFor([], 'zzQA'), null, 'an empty vector proves nothing');
});

await fixture('divergence 7: an ambiguous newest-created terminal fails closed', () => {
  const nodes = liveQuestionEditShape().concat([
    gnode('zzTIE', { parent: 'zzQB', role: 'assistant', productAnswer: true, messageId: 'zzTIEMSG', createTime: 900 }),
  ]);
  const { d } = divergeOf(nodes, { currentNode: 'zzACUR' });
  equal(d.state, 'fail-closed', 'ambiguity is a refusal');
  ok(d.reason && d.reason.length > 0, 'with a stated reason');
  equal(d.kind, null, 'and no divergence kind is claimed');
});

// A mounted question-edit pager for the CURRENT variant, and nothing else.
function questionEditDom(root, { indicator = '1/2', mounted = true } = {}) {
  if (!mounted) return null;
  const sc = scroller({ testId: 'conv', clientHeight: 800, scrollHeight: 4000 });
  root.appendChild(sc);
  const sec = new El('DIV');
  sec.setAttribute('data-testid', 'conversation-turn-2');
  sc.appendChild(sec);
  const u = new El('DIV');
  u.setAttribute('data-message-author-role', 'user');
  u.setAttribute('data-message-id', TQ);
  sec.appendChild(u);
  const p = pager(sec, indicator, TQ);
  return { sc, sec, p };
}

await fixture('divergence 8: the question-edit plan is proven without touching anything', () => {
  const w = divergenceWorld(liveQuestionEditShape(), { currentNode: 'zzACUR' });
  const dom = questionEditDom(w.root);
  const d = w.rt.api.chatAtlasGraphDivergence();
  const plan = w.rt.api.chatAtlasBuildQuestionEditPlan(d);
  equal(plan.state, 'ready', 'the plan is proven');
  equal(plan.plan.kind, 'question-edit', 'as a question edit');
  equal(plan.plan.ownerMessageId, 'zzOWNER', 'against the exact graph owner');
  equal(plan.plan.currentIndex, 0, 'with the current index proven');
  equal(plan.plan.targetIndex, 1, 'and the target index proven');
  equal(plan.plan.requiredDirection, 'next', 'the direction is derived');
  equal(plan.plan.pagerOwnerProven, true, 'the native pager owner is proven');
  equal(plan.plan.previousAvailable, true, 'both controls are described');
  equal(plan.plan.nextAvailable, true, 'both controls are described');
  equal(plan.plan.activationPermitted, false, 'and activation is refused at this stage');
  equal(dom.p.clicks(), 0, 'nothing was clicked');
});

await fixture('divergence 9: an unmounted owner fails precisely, never via the answer pager', () => {
  const w = divergenceWorld(liveQuestionEditShape(), { currentNode: 'zzACUR' });
  const d = w.rt.api.chatAtlasGraphDivergence();
  const plan = w.rt.api.chatAtlasBuildQuestionEditPlan(d);
  equal(plan.state, 'fail-closed', 'it fails closed');
  equal(plan.reason, 'question-edit-control-unavailable', 'with the exact ownership/mount reason');
  const body = extractFunction(CORE_SOURCE, 'chatAtlasBuildQuestionEditPlan');
  ok(!body.includes('chatAtlasNativeRegenerationControls'), 'it never reaches for the answer pager');
  ok(!body.includes('chatAtlasConvergeDefaultNativeAnswers'), 'nor for the answer converger');
  ok(!body.includes('chatAtlasRevealRunOneShot'), 'nor for the old answer reveal');
});

await fixture('divergence 10: the genuine answer-regeneration route keeps its prerequisites', () => {
  const { d } = divergeOf(genuineAnswerSiblingShape(), { currentNode: 'zzACUR' });
  equal(d.kind, 'assistant-regeneration', 'the answer route stays reachable');
  equal(d.directAnswerSiblingProof, true, 'but only behind the stronger proof');
  const publisher = extractFunction(CORE_SOURCE, 'chatAtlasPublishDefaultLatestCreatedPath');
  ok(/graphDivergence\.kind === 'assistant-regeneration'\s*\n?\s*&& graphDivergence\.directAnswerSiblingProof === true/.test(publisher),
    'the publisher demands the sibling proof before naming a regeneration');
});

await fixture('divergence 11: a graph-proven question edit never reaches the answer converger', () => {
  const publisher = extractFunction(CORE_SOURCE, 'chatAtlasPublishDefaultLatestCreatedPath');
  const gate = publisher.indexOf("observedDivergenceKind === 'assistant-regeneration'\n      && graphDivergence.state === 'proven'");
  const converge = publisher.indexOf('chatAtlasConvergeDefaultNativeAnswers');
  ok(gate > 0, 'the question-edit route exists');
  ok(converge > gate, 'and it is decided BEFORE the answer converger is reachable');
  const branch = publisher.slice(gate, converge);
  ok(branch.includes('answerConvergenceSuppressed = true'), 'answer convergence is suppressed');
  ok(/\breturn\b/.test(branch), 'and the route returns without falling through');
  ok(branch.includes("'graph-proven-question-edit-plan-ready'"), 'reaching the proof-ready terminal state');
  ok(!branch.includes('chatAtlasRevealRunOneShot'), 'no answer-pager reveal is started');
});

await fixture('divergence 12: nothing is activated and no policy is mutated', () => {
  for (const name of ['chatAtlasComputeGraphDivergence', 'chatAtlasGraphDivergence',
    'chatAtlasBuildQuestionEditPlan', 'chatAtlasQuestionEditSectionFor', 'chatAtlasGraphDivergencePointFor']) {
    const body = extractFunction(CORE_SOURCE, name);
    ok(!/\.click\(/.test(body), `${name} never clicks`);
    ok(!/\.scrollTop\s*=[^=]|scrollIntoView|scrollTo\(/.test(body), `${name} never scrolls`);
    for (const forbidden of ['manualOverrideActive', 'chatAtlasRunNativeConvergence', 'dispatchEvent', '.focus(']) {
      ok(!body.includes(forbidden), `${name} never uses ${forbidden}`);
    }
  }
  const w = divergenceWorld(liveQuestionEditShape(), { currentNode: 'zzACUR' });
  const dom = questionEditDom(w.root);
  w.rt.api.chatAtlasBuildQuestionEditPlan(w.rt.api.chatAtlasGraphDivergence());
  equal(dom.p.clicks(), 0, 'no control is activated');
  const d = w.rt.api.chatAtlasRevealDiagnostics();
  equal(d.defaultQuestionEditActivationCount, 0, 'the activation count stays zero');
  equal(d.defaultQuestionEditActivationPermitted, false, 'and activation is never permitted here');
  equal(w.rt.sandbox.chatAtlasDefaultOverlayState.manualOverrideActive, undefined, 'no manual override');
  const plan = extractFunction(CORE_SOURCE, 'chatAtlasBuildQuestionEditPlan');
  ok(plan.includes('activationPermitted: false'), 'the plan states activation is not permitted');
});


// ── Selected-chain / canonical pairing parity (Stage 2C-2ai1) ─────────────
// One graph chain must project to ONE row set. Branch ROOT stays the first
// answer root (branch authority); DISPLAY is the last eligible product answer
// in the turn window (presentation), mirroring 0D3a.
function pairingWorld(nodes, opts = {}) {
  const root = new El('MAIN');
  const rt = runtime(root, {
    identityGraph: graphOf(nodes, opts.currentNode || null),
    effectiveTurns: opts.effectiveTurns || [],
  });
  return { rt, root };
}
const projectOf = (nodes, opts = {}) => {
  const w = pairingWorld(nodes, opts);
  const collect = [];
  const byId = new Map(w.rt.sandbox.selectedPathAcquisitionState.graph.identityGraph.nodes.map((n) => [n.nodeId, n]));
  const chainTail = byId.get(opts.currentNode);
  const chain = w.rt.api.chatAtlasChainToRoot(byId, chainTail);
  const turns = w.rt.api.chatAtlasTurnsFromChain(chain, byId, collect);
  return { w, turns, collect, byId };
};

// The exact live Turn-2 shape: one question, one direct answer root, a later
// eligible product answer beneath it, no intervening product-user node.
function liveTurn2Shape() {
  return [
    gnode('zzROOT', { role: 'system' }),
    gnode('zzU1', { parent: 'zzROOT', role: 'user', productUser: true, messageId: 'zzQ1', createTime: 10 }),
    gnode('zzA1', { parent: 'zzU1', role: 'assistant', productAnswer: true, messageId: 'zzA1M', createTime: 20 }),
    gnode('zzQ2', { parent: 'zzA1', role: 'user', productUser: true, messageId: TQ, createTime: 30 }),
    gnode('zzROOTANS', { parent: 'zzQ2', role: 'assistant', productAnswer: true, messageId: TD, createTime: 40 }),
    gnode('zzLATER', { parent: 'zzROOTANS', role: 'assistant', productAnswer: true, messageId: TA, createTime: 50 }),
  ];
}

await fixture('pairing 1: the live Turn-2 shape displays the LAST answer, root stays the FIRST', () => {
  const { turns, collect } = projectOf(liveTurn2Shape(), { currentNode: 'zzLATER' });
  equal(turns.length, 2, 'the chain projects to two turns');
  equal(turns[1].qId, TQ, 'turn 2 is the target question');
  equal(turns[1].primaryAId, TA, 'and displays the LAST eligible product answer');
  const record = collect.find((r) => r.qId === TQ);
  equal(record.branchRootAId, TD, 'while the branch ROOT remains the first answer root');
  equal(record.branchRootIsPrimary, false, 'the two identities legitimately differ');
  equal(record.displayResolvedFromBranchRoot, true, 'and the display resolves from that root');
  equal(turns[1].noAnswer, false, 'the turn has an answer');
});

await fixture('pairing 2: several eligible assistants in one turn — last wins, root unchanged', () => {
  const nodes = liveTurn2Shape().concat([
    gnode('zzLAST', { parent: 'zzLATER', role: 'assistant', productAnswer: true, messageId: 'zzLASTM', createTime: 60 }),
  ]);
  const { turns, collect } = projectOf(nodes, { currentNode: 'zzLAST' });
  equal(turns[1].primaryAId, 'zzLASTM', 'presentation takes the last eligible answer');
  equal(collect.find((r) => r.qId === TQ).branchRootAId, TD, 'branch authority still names the first root');
});

await fixture('pairing 3: an answer past the next product-user boundary is never paired backward', () => {
  const nodes = liveTurn2Shape().concat([
    gnode('zzQ3', { parent: 'zzLATER', role: 'user', productUser: true, messageId: 'zzQ3M', createTime: 60 }),
    gnode('zzA3', { parent: 'zzQ3', role: 'assistant', productAnswer: true, messageId: 'zzA3M', createTime: 70 }),
  ]);
  const { turns } = projectOf(nodes, { currentNode: 'zzA3' });
  equal(turns.length, 3, 'three turns');
  equal(turns[1].primaryAId, TA, 'turn 2 stops at its own window boundary');
  equal(turns[2].primaryAId, 'zzA3M', 'and turn 3 owns the answer below it');
});

await fixture('pairing 4: genuine two-root regeneration keeps root-based branch authority', () => {
  const nodes = [
    gnode('zzROOT', { role: 'system' }),
    gnode('zzQ2', { parent: 'zzROOT', role: 'user', productUser: true, messageId: TQ, createTime: 30 }),
    gnode('zzR1', { parent: 'zzQ2', role: 'assistant', productAnswer: true, messageId: 'zzR1M', createTime: 40 }),
    gnode('zzR2', { parent: 'zzQ2', role: 'assistant', productAnswer: true, messageId: TD, createTime: 50 }),
    gnode('zzR2TAIL', { parent: 'zzR2', role: 'assistant', productAnswer: true, messageId: TA, createTime: 60 }),
  ];
  const { w, turns, collect } = projectOf(nodes, { currentNode: 'zzR2TAIL' });
  equal(turns[0].primaryAId, TA, 'the chosen root resolves to ITS last eligible answer');
  equal(collect[0].branchRootAId, TD, 'and the chosen branch root is recorded');
  const computed = w.rt.api.chatAtlasComputeDefaultLatestCreatedPath();
  const regen = computed.branchVector.find((point) => point.kind === 'assistant-regeneration');
  equal(regen.variantCount, 2, 'the branch vector still sees two answer roots');
  equal(regen.selectedIndex, 1, 'and the selected index is still root-based');
});

await fixture('pairing 5: anchor ownership passes without ID equality', () => {
  const nodes = [
    gnode('zzROOT', { role: 'system' }),
    gnode('zzQ2', { parent: 'zzROOT', role: 'user', productUser: true, messageId: TQ, createTime: 30 }),
    gnode('zzR1', { parent: 'zzQ2', role: 'assistant', productAnswer: true, messageId: 'zzR1M', createTime: 40 }),
    gnode('zzR2', { parent: 'zzQ2', role: 'assistant', productAnswer: true, messageId: TD, createTime: 50 }),
    gnode('zzR2TAIL', { parent: 'zzR2', role: 'assistant', productAnswer: true, messageId: TA, createTime: 60 }),
  ];
  const w = pairingWorld(nodes, { currentNode: 'zzR2TAIL' });
  const computed = w.rt.api.chatAtlasComputeDefaultLatestCreatedPath();
  equal(computed.turns[0].primaryAId, TA, 'the displayed answer is NOT a variant-root id');
  const proof = w.rt.api.chatAtlasProveAnchorBranchOwnership(computed, 0);
  equal(proof.ok, true, 'yet anchor ownership is proven');
  equal(proof.branchRootAId, TD, 'through the selected branch root');
  equal(proof.branchRootIsPrimary, false, 'which is not the displayed answer');
  equal(proof.rootCount, 2, 'and the owner really has two roots');
});

await fixture('pairing 6: a displayed answer not reachable from the selected root fails closed', () => {
  const w = pairingWorld(liveTurn2Shape(), { currentNode: 'zzLATER' });
  const computed = w.rt.api.chatAtlasComputeDefaultLatestCreatedPath();
  // Same rows, but the recorded branch root is replaced by a foreign identity.
  const forged = Object.assign({}, computed, {
    branchRoots: computed.branchRoots.map((r) => (
      r.qId === TQ ? Object.assign({}, r, { branchRootAId: 'zzFOREIGN' }) : r
    )),
  });
  const proof = w.rt.api.chatAtlasProveAnchorBranchOwnership(forged, 1);
  equal(proof.ok, false, 'ownership is refused');
  equal(proof.reason, 'anchor-branch-root-not-a-variant', 'with the exact reason');
});

await fixture('pairing 7: a SYSTEM branch-shell alias is displayed, an assistant alias is not', () => {
  const systemAlias = [
    gnode('zzROOT', { role: 'system' }),
    gnode('zzQ2', { parent: 'zzROOT', role: 'user', productUser: true, messageId: TQ, createTime: 30 }),
    gnode('zzSH', { parent: 'zzQ2', role: 'system', alias: true, messageId: 'zzSHM', createTime: 40 }),
    gnode('zzUNDER', { parent: 'zzSH', role: 'assistant', productAnswer: true, messageId: TA, createTime: 50 }),
  ];
  const a = projectOf(systemAlias, { currentNode: 'zzUNDER' });
  equal(a.turns[0].primaryAId, 'zzSHM', 'a SYSTEM alias root is the displayed identity, as canonical promotes it');
  const assistantAlias = [
    gnode('zzROOT', { role: 'system' }),
    gnode('zzQ2', { parent: 'zzROOT', role: 'user', productUser: true, messageId: TQ, createTime: 30 }),
    gnode('zzSH', { parent: 'zzQ2', role: 'assistant', alias: true, messageId: 'zzSHM', createTime: 40 }),
    gnode('zzUNDER', { parent: 'zzSH', role: 'assistant', productAnswer: true, messageId: TA, createTime: 50 }),
  ];
  const b = projectOf(assistantAlias, { currentNode: 'zzUNDER' });
  equal(b.turns[0].primaryAId, TA, 'an ASSISTANT alias is preserved as root, never displayed');
  equal(b.collect[0].branchRootAId, 'zzSHM', 'while remaining the branch root');
});

await fixture('pairing 8: stopped answers keep canonical exclusion semantics', () => {
  const nodes = [
    gnode('zzROOT', { role: 'system' }),
    gnode('zzQ2', { parent: 'zzROOT', role: 'user', productUser: true, messageId: TQ, createTime: 30 }),
    gnode('zzGOOD', { parent: 'zzQ2', role: 'assistant', productAnswer: true, messageId: TD, createTime: 40 }),
    gnode('zzSTOP', { parent: 'zzGOOD', role: 'assistant', stopped: true, messageId: 'zzSTOPM', createTime: 50 }),
  ];
  const { turns } = projectOf(nodes, { currentNode: 'zzSTOP' });
  equal(turns[0].primaryAId, TD, 'a stopped assistant is never the displayed answer');
  equal(turns[0].stopped, true, 'but the turn inherits stopped from the window');
});

await fixture('pairing 9: a genuine NO ANSWER turn keeps its numbering', () => {
  const nodes = [
    gnode('zzROOT', { role: 'system' }),
    gnode('zzQ1', { parent: 'zzROOT', role: 'user', productUser: true, messageId: 'zzQ1M', createTime: 10 }),
    gnode('zzA1', { parent: 'zzQ1', role: 'assistant', productAnswer: true, messageId: 'zzA1M', createTime: 20 }),
    gnode('zzQ2', { parent: 'zzA1', role: 'user', productUser: true, messageId: TQ, createTime: 30 }),
  ];
  const { turns, collect } = projectOf(nodes, { currentNode: 'zzQ2' });
  equal(turns.length, 2, 'both turns exist');
  equal(turns[1].noAnswer, true, 'the trailing question has no answer');
  equal(turns[1].primaryAId, null, 'and no answer identity is invented');
  equal(turns[1].order, 2, 'the ordinal is unaffected');
  equal(collect[1].branchRootAId, null, 'with no branch root either');
});

await fixture('pairing 12: one chain yields one path identity across both projections', () => {
  const nodes = liveTurn2Shape();
  const w = pairingWorld(nodes, { currentNode: 'zzLATER' });
  const computed = w.rt.api.chatAtlasComputeDefaultLatestCreatedPath();
  // The canonical projection of the SAME chain: last eligible product answer
  // per window, which is what 0D3a produces.
  const canonicalRows = [
    { order: 1, qId: 'zzQ1', primaryAId: 'zzA1M' },
    { order: 2, qId: TQ, primaryAId: TA },
  ];
  equal(
    w.rt.api.chatAtlasPathIdentityKey(computed.turns),
    w.rt.api.chatAtlasPathIdentityKey(canonicalRows),
    'order/qId/primaryAId agree row for row',
  );
  equal(w.rt.api.chatAtlasFirstPathIdentityDifference(computed.turns, canonicalRows), null,
    'so there is no first difference at all');
});

await fixture('pairing 13: a genuine graph divergence still routes through Stage 2C-2ah8', () => {
  const { d } = divergeOf(genuineAnswerSiblingShape(), { currentNode: 'zzACUR' });
  equal(d.state, 'proven', 'the divergence machinery is untouched');
  equal(d.kind, 'assistant-regeneration', 'and still proves genuine regenerations');
  equal(d.directAnswerSiblingProof, true, 'behind the same sibling proof');
});

await fixture('pairing 14: the identical-chain shape starts nothing at all', () => {
  const w = pairingWorld(liveTurn2Shape(), { currentNode: 'zzLATER' });
  const d = w.rt.api.chatAtlasGraphDivergence();
  equal(d.state, 'identical', 'current and default chains are one chain');
  equal(d.reason, 'chains-identical', 'stated exactly');
  equal(d.kind, null, 'so no native control kind is claimed');
  const diagnostics = w.rt.api.chatAtlasRevealDiagnostics();
  equal(diagnostics.selectedChainPairingRule, 'canonical-last-product-answer', 'the pairing rule is published');
  equal(diagnostics.defaultQuestionEditPlanState, 'idle', 'no question-edit plan starts');
  equal(diagnostics.defaultQuestionEditActivationCount, 0, 'no activation occurs');
  equal(diagnostics.revealState, 'idle', 'and no reveal transaction starts');
  const turns = extractFunction(CORE_SOURCE, 'chatAtlasTurnsFromChain');
  ok(!/\.click\(/.test(turns), 'the projection never clicks');
  ok(!/scrollIntoView|scrollTo\(/.test(turns), 'and never scrolls');
});


await fixture('pairing 6b: a wrapper root is matched through its resolved answer identity', () => {
  // The branch ROOT recorded on the row is the first product answer, which
  // sits BELOW the variant root when the host wraps the branch. Membership
  // must then be proven through chatAtlasAnswerIdentityForRoot, not by
  // comparing the wrapper's own message id.
  const nodes = [
    gnode('zzROOT', { role: 'system' }),
    gnode('zzQ2', { parent: 'zzROOT', role: 'user', productUser: true, messageId: TQ, createTime: 30 }),
    gnode('zzWRAP', { parent: 'zzQ2', role: 'system', messageId: 'zzWRAPM', createTime: 35 }),
    gnode('zzFIRST', { parent: 'zzWRAP', role: 'assistant', productAnswer: true, messageId: TD, createTime: 40 }),
    gnode('zzLAST', { parent: 'zzFIRST', role: 'assistant', productAnswer: true, messageId: TA, createTime: 50 }),
  ];
  const w = pairingWorld(nodes, { currentNode: 'zzLAST' });
  const computed = w.rt.api.chatAtlasComputeDefaultLatestCreatedPath();
  equal(computed.turns[0].primaryAId, TA, 'the display is the last eligible answer');
  equal(computed.branchRoots[0].branchRootAId, TD, 'the branch root is the first answer, below the wrapper');
  const byId = new Map(nodes.map((n) => [n.nodeId, n]));
  const roots = w.rt.api.chatAtlasConvergenceAnswerVariantRoots(byId.get('zzQ2'), byId);
  equal(roots.length, 1, 'the only variant root is the wrapper');
  ok(roots[0].messageId !== TD, 'whose own message id is NOT the recorded branch root');
  equal(w.rt.api.chatAtlasAnswerIdentityForRoot(roots[0], byId), TD, 'but resolves to it');
  const proof = w.rt.api.chatAtlasProveAnchorBranchOwnership(computed, 0);
  equal(proof.ok, true, 'so ownership is proven through the resolved identity');
  equal(proof.branchRootAId, TD, 'naming the recorded root');
});

await fixture('pairing 13b: a chain repeating one question identity is not a path', () => {
  const nodes = [
    gnode('zzROOT', { role: 'system' }),
    gnode('zzQA', { parent: 'zzROOT', role: 'user', productUser: true, messageId: TQ, createTime: 10 }),
    gnode('zzA', { parent: 'zzQA', role: 'assistant', productAnswer: true, messageId: 'zzAM', createTime: 20 }),
    // A SECOND node carrying the SAME question identity further down the chain.
    gnode('zzQB', { parent: 'zzA', role: 'user', productUser: true, messageId: TQ, createTime: 30 }),
    gnode('zzB', { parent: 'zzQB', role: 'assistant', productAnswer: true, messageId: 'zzBM', createTime: 40 }),
  ];
  const w = pairingWorld(nodes, { currentNode: 'zzB' });
  const byId = new Map(nodes.map((n) => [n.nodeId, n]));
  const chain = w.rt.api.chatAtlasChainToRoot(byId, byId.get('zzB'));
  equal(w.rt.api.chatAtlasTurnsFromChain(chain, byId, []), null, 'the projection refuses a duplicated question');
  equal(w.rt.api.chatAtlasComputeDefaultLatestCreatedPath().ok, false, 'and the default path fails closed');
});

await fixture('pairing 14b: only a proven host-payload index may be canonical authority', () => {
  const w = pairingWorld(liveTurn2Shape(), { currentNode: 'zzLATER' });
  const rows = Object.freeze([Object.freeze({ order: 1, qId: 'zzQ1', primaryAId: 'zzA1M' })]);
  const good = Object.freeze({ complete: true, proof: 'host-payload-full-graph', turns: rows });
  w.rt.sandbox.completeTurnIndexAuthorityState.index = good;
  equal(w.rt.api.chatAtlasCanonicalPresentationIndex(), good, 'a proven host-payload index is authority');
  for (const bad of [
    Object.freeze({ complete: true, proof: 'hybrid-count', turns: rows }),
    Object.freeze({ complete: false, proof: 'host-payload-full-graph', turns: rows }),
    Object.freeze({ complete: true, proof: 'host-payload-full-graph', turns: [{ order: 1 }] }),
  ]) {
    w.rt.sandbox.completeTurnIndexAuthorityState.index = bad;
    equal(w.rt.api.chatAtlasCanonicalPresentationIndex(), null,
      `an index with proof ${String(bad.proof)} / complete ${String(bad.complete)} is refused`);
  }
  w.rt.sandbox.completeTurnIndexAuthorityState.index = null;
});

const failures = fixtures.filter((f) => !f.ok);
for (const f of fixtures) {
  console.log(`${f.ok ? 'PASS' : 'FAIL'} ${f.name}`);
  if (!f.ok) console.error(f.error);
}
console.log(`Fixtures: ${fixtures.length - failures.length}/${fixtures.length}`);
console.log(`Assertions: ${assertions}`);
if (failures.length) { console.error(`CV-3.34 reveal safety failed: ${failures.length}`); process.exit(1); }
console.log('CV-3.34 reveal safety framework passed');
