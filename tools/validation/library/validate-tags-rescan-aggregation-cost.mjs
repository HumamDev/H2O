#!/usr/bin/env node
// Tags rescan aggregation-cost contract (Gate A).
//
// Proven live across four sealed profiles: 0F5a Tags cost 1887–4235 ms, of which
// the readTurnTexts / readNodeText path carried 1757–3969 ms and `get innerText`
// accounted for 99.3–99.5% of that path wherever V8 attributed it separately
// (in the newest profile the getter is inlined into the arrow and the flush is
// charged to readNodeText self-time). String work is NOT the problem —
// normalizeTextBlob is ~10 ms and text-node lookup 66–137 ms.
//
// The dominant, removable multiplier is aggregation complexity:
//
//   evt:h2o:core:index:updated
//     -> onIndexUpdated -> setTimeout(220)
//        -> rescanVisibleTitleBars()          listTurns() -> B turns
//           -> attachTurnUi() x B
//              -> refreshChatSummaryAndProject()
//                 -> aggregateChat()          listTurns() -> N turns
//                    -> readTurnTexts() x N
//                       -> node.innerText x2  (answer + question)
//
// So ONE rescan performs B full-route aggregations, i.e. O(B x N) rendered-text
// reads to recompute pill labels that have not changed. In the default MANUAL
// chat mode the per-turn read is unavoidable inside aggregateChat: row.auto.keywords
// is only populated in AUTO/SUGGESTION mode, and the source states the
// extractKeywordsFromText fallback is "ALWAYS run" otherwise.
//
// This validator pins ONE safe contract:
//
//   one multi-turn rescan  ->  at most ONE full-route aggregation
//
// while aggregation must still happen, and standalone attachTurnUi callers must
// keep their current behaviour. Deliberately NOT required here: innerText ->
// textContent substitution, turn-text caching, dirty-turn hashes, any change to
// the 220 ms timer or debouncing, Tags semantics, the MANUAL-mode keyword
// fallback, or route/branch logic. Those are separate decisions.
//
// The REAL 0F5a module is executed in full as a self-booting IIFE. Only genuinely
// EXTERNAL modules are doubled (H2O.LibraryCore, H2O.turnRuntime, the turn
// title-bar API) — no Tags logic is re-implemented, and every counter is taken at
// a real external boundary rather than by patching Tags internals.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const TAGS_PATH = 'src-runtime-base/0F5a.⬛️🗂️ Tags 🗂️.js';
const SOURCE = fs.readFileSync(path.join(ROOT, TAGS_PATH), 'utf8');

// Entry points this gate depends on. If the module is refactored so these no
// longer exist, the harness is no longer faithful and must fail loudly.
for (const required of [
  'function rescanVisibleTitleBars(',
  'function attachTurnUi(',
  'function refreshChatSummaryAndProject(',
  'function aggregateChat(',
  'function readTurnTexts(',
  'function listTurns(',
  'function getTurnRuntime(',
  'function getTitleApi(',
]) {
  if (!SOURCE.includes(required)) throw new Error(`TEST_HARNESS_BLOCKED:required-entry-point-missing:${required}`);
}

const fixtures = [];
let assertions = 0;
const eq = (a, b, m) => { assertions += 1; assert.deepEqual(a, b, m); };
const ok = (v, m) => { assertions += 1; assert.ok(v, m); };
const atMost = (a, b, m) => { assertions += 1; assert.ok(a <= b, `${m} (got ${a}, allowed <= ${b})`); };
const atLeast = (a, b, m) => { assertions += 1; assert.ok(a >= b, `${m} (got ${a}, required >= ${b})`); };
function fixture(name, run) {
  try { run(); fixtures.push({ name, ok: true }); }
  catch (e) { fixtures.push({ name, ok: false, error: String(e?.stack || e) }); }
}

// ── Selector engine (tag, #id, .class, [attr], [attr="v"], [attr*="v"], groups, descendant) ──
const unesc = (s) => s.replace(/\\(.)/g, '$1');
function splitTop(sel, sep) {
  const out = []; let d = 0, q = '', buf = '';
  for (const c of sel) {
    if (q) { buf += c; if (c === q) q = ''; continue; }
    if (c === '"' || c === "'") { q = c; buf += c; continue; }
    if (c === '[') d += 1; if (c === ']') d -= 1;
    if (d === 0 && ((sep === ',' && c === ',') || (sep === ' ' && /\s/.test(c)))) { if (buf.trim()) out.push(buf.trim()); buf = ''; continue; }
    buf += c;
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}
function parseCompound(sel) {
  const out = { tag: null, id: null, classes: [], attrs: [] };
  let i = 0;
  const t = /^[a-zA-Z][a-zA-Z0-9-]*/.exec(sel);
  if (t) { out.tag = t[0].toLowerCase(); i = t[0].length; }
  while (i < sel.length) {
    const c = sel[i];
    if (c === '#' || c === '.') {
      let j = i + 1, buf = '';
      while (j < sel.length) { if (sel[j] === '\\') { buf += sel[j] + sel[j + 1]; j += 2; continue; } if ('.#['.includes(sel[j])) break; buf += sel[j]; j += 1; }
      if (c === '#') out.id = unesc(buf); else out.classes.push(unesc(buf));
      i = j; continue;
    }
    if (c === '[') {
      const end = sel.indexOf(']', i);
      if (end < 0) throw new Error('unsupported');
      const m = /^([a-zA-Z0-9_:-]+)(?:([*^$|~]?=)\s*"([^"]*)"|([*^$|~]?=)\s*'([^']*)'|([*^$|~]?=)\s*([^\]]*))?\s*(i)?$/.exec(sel.slice(i + 1, end).trim());
      if (!m) throw new Error('unsupported');
      out.attrs.push({ name: m[1], op: m[2] || m[4] || m[6] || null, value: m[3] !== undefined ? m[3] : (m[5] !== undefined ? m[5] : m[7]), ci: !!m[8] });
      i = end + 1; continue;
    }
    throw new Error('unsupported');
  }
  return out;
}
const selCache = new Map(); const unsupported = new Set();
function parseSelector(sel) {
  if (selCache.has(sel)) return selCache.get(sel);
  let p = null;
  try { p = splitTop(sel, ',').map((g) => splitTop(g, ' ').map(parseCompound)); }
  catch { unsupported.add(sel); }
  selCache.set(sel, p); return p;
}
function matchesCompound(el, c) {
  if (c.tag && el.tagName.toLowerCase() !== c.tag) return false;
  if (c.id !== null && el.getAttribute('id') !== c.id) return false;
  for (const cls of c.classes) if (!String(el.getAttribute('class') || '').split(/\s+/).filter(Boolean).includes(cls)) return false;
  for (const a of c.attrs) {
    const raw = el.getAttribute(a.name);
    if (raw === null) return false;
    if (!a.op) continue;
    const hay = a.ci ? String(raw).toLowerCase() : String(raw);
    const needle = a.ci ? String(a.value).toLowerCase() : String(a.value);
    if (a.op === '=' && hay !== needle) return false;
    if (a.op === '*=' && !hay.includes(needle)) return false;
    if (a.op === '^=' && !hay.startsWith(needle)) return false;
    if (a.op === '$=' && !hay.endsWith(needle)) return false;
  }
  return true;
}
function matchesSelector(el, sel) {
  const groups = parseSelector(sel);
  if (!groups) return false;
  for (const chain of groups) {
    if (!matchesCompound(el, chain[chain.length - 1])) continue;
    let good = true, node = el.parentElement;
    for (let k = chain.length - 2; k >= 0; k -= 1) {
      let found = null;
      while (node) { if (matchesCompound(node, chain[k])) { found = node; break; } node = node.parentElement; }
      if (!found) { good = false; break; }
      node = found.parentElement;
    }
    if (good) return true;
  }
  return false;
}

// ── Environment ───────────────────────────────────────────────────────────
const N_TURNS = 12;

function createEnv() {
  const state = {
    listTurnsCalls: 0,        // real external boundary -> aggregation counter
    ensureBarCalls: 0,
    pillWrites: 0,            // one per attachTurnUi
    innerTextQuestion: 0,
    innerTextAnswer: 0,
    innerTextOther: 0,
    storageWrites: [],
    timers: [],
    now: 0,
    seq: 0,
  };

  class El {
    constructor(tag) {
      this.tagName = String(tag).toUpperCase();
      this.__id = (state.seq += 1);
      this.__kind = null;              // 'question' | 'answer' | 'pill' | null
      this.__a = new Map();
      this.childNodes = [];
      this.parentNode = null;
      this.__t = '';
      this.__l = new Map();
      this.style = {};
      this.dataset = {};
    }
    get parentElement() { return this.parentNode; }
    get children() { return this.childNodes.filter((n) => n instanceof El); }
    get isConnected() { let n = this; while (n) { if (n === docEl) return true; n = n.parentNode; } return false; }
    get className() { return this.getAttribute('class') || ''; }
    set className(v) { this.setAttribute('class', String(v)); }
    get textContent() { return this.childNodes.length ? this.childNodes.map((c) => c.textContent).join('') : this.__t; }
    set textContent(v) { this.childNodes = []; this.__t = String(v); if (this.__kind === 'pill') state.pillWrites += 1; }
    // THE instrumented accessor: innerText is rendered-text access and forces layout.
    get innerText() {
      if (this.__kind === 'question') state.innerTextQuestion += 1;
      else if (this.__kind === 'answer') state.innerTextAnswer += 1;
      else state.innerTextOther += 1;
      return this.textContent;
    }
    get innerHTML() { return ''; }
    set innerHTML(v) { if (!String(v)) this.childNodes = []; }
    setAttribute(n, v) { this.__a.set(String(n), String(v)); }
    getAttribute(n) { const v = this.__a.get(String(n)); return v === undefined ? null : v; }
    hasAttribute(n) { return this.__a.has(String(n)); }
    removeAttribute(n) { this.__a.delete(String(n)); }
    appendChild(c) { if (c.parentNode) c.parentNode.removeChild(c); c.parentNode = this; this.childNodes.push(c); return c; }
    append(...n) { n.forEach((x) => this.appendChild(x)); }
    prepend(...n) { [...n].reverse().forEach((x) => { if (x.parentNode) x.parentNode.removeChild(x); x.parentNode = this; this.childNodes.unshift(x); }); }
    insertBefore(node, ref) { if (node.parentNode) node.parentNode.removeChild(node); const i = ref ? this.childNodes.indexOf(ref) : -1; node.parentNode = this; if (i < 0) this.childNodes.push(node); else this.childNodes.splice(i, 0, node); return node; }
    removeChild(c) { const i = this.childNodes.indexOf(c); if (i >= 0) this.childNodes.splice(i, 1); c.parentNode = null; return c; }
    remove() { if (this.parentNode) this.parentNode.removeChild(this); }
    contains(o) { let n = o; while (n) { if (n === this) return true; n = n.parentNode; } return false; }
    matches(s) { return matchesSelector(this, s); }
    closest(s) { let n = this; while (n) { if (n instanceof El && matchesSelector(n, s)) return n; n = n.parentNode; } return null; }
    __desc(out = []) { for (const c of this.childNodes) if (c instanceof El) { out.push(c); c.__desc(out); } return out; }
    querySelector(s) { for (const e of this.__desc()) if (matchesSelector(e, s)) return e; return null; }
    querySelectorAll(s) { const a = this.__desc().filter((e) => matchesSelector(e, s)); a.forEach = Array.prototype.forEach.bind(a); return a; }
    cloneNode() { const c = new El(this.tagName); for (const [k, v] of this.__a) c.__a.set(k, v); c.__t = this.__t; return c; }
    addEventListener(t, f) { if (!this.__l.has(t)) this.__l.set(t, []); this.__l.get(t).push(f); }
    removeEventListener() {}
    dispatchEvent() { return true; }
    getBoundingClientRect() { return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }; }
    focus() {} blur() {} click() {} scrollIntoView() {}
  }

  const docEl = new El('html');
  const head = new El('head');
  const body = new El('body');
  docEl.appendChild(head); docEl.appendChild(body);

  const store = new Map();
  const localStorage = {
    getItem: (k) => (store.has(String(k)) ? store.get(String(k)) : null),
    setItem: (k, v) => { store.set(String(k), String(v)); state.storageWrites.push(String(k)); },
    removeItem: (k) => store.delete(String(k)),
    key: (i) => [...store.keys()][i] ?? null,
    get length() { return store.size; },
  };

  const winListeners = new Map();
  const W = {
    localStorage,
    addEventListener(t, f) { if (!winListeners.has(t)) winListeners.set(t, []); winListeners.get(t).push(f); },
    removeEventListener() {},
    dispatchEvent(e) { for (const f of (winListeners.get(e?.type) || []).slice()) { try { f(e); } catch (_) {} } return true; },
    setTimeout: (fn, ms) => { state.timers.push({ fn, ms: ms || 0 }); return state.timers.length; },
    clearTimeout: (id) => { if (state.timers[id - 1]) state.timers[id - 1] = null; },
    setInterval: () => 0, clearInterval: () => {},
    requestAnimationFrame: (fn) => { state.timers.push({ fn, ms: 0 }); return state.timers.length; },
    cancelAnimationFrame: () => {},
    location: { href: 'https://chatgpt.com/c/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', pathname: '/c/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', hash: '' },
    performance: { now: () => state.now },
    CSS: { escape: (s) => String(s).replace(/([^\w-])/g, '\\$1') },
  };

  // ── External module doubles (NOT Tags logic) ──
  let route = [];
  const bars = new Map();
  const titleApi = {
    ensureBar(answerId) {
      state.ensureBarCalls += 1;
      let bar = bars.get(answerId);
      if (!bar) { bar = new El('div'); bar.setAttribute('data-title-bar', answerId); body.appendChild(bar); bars.set(answerId, bar); }
      return { bar };
    },
    getBar(answerId) { return bars.get(answerId) || null; },
  };
  W.H2O = {
    LibraryCore: {
      registerOwner: () => {}, registerService: () => {}, registerRoute: () => {},
      getService: () => null, getOwner: () => null, getRoute: () => null, toFixed: (n) => n,
    },
    turnRuntime: {
      listTurns() { state.listTurnsCalls += 1; return route.slice(); },
    },
    AT: { tnswrttl: { api: { public: titleApi } } },
  };

  const D = {
    documentElement: docEl, head, body, readyState: 'complete',
    createElement: (t) => new El(t),
    createTextNode: (t) => { const e = new El('#text'); e.__t = String(t); return e; },
    createDocumentFragment: () => new El('#fragment'),
    querySelector: (s) => docEl.querySelector(s),
    querySelectorAll: (s) => docEl.querySelectorAll(s),
    getElementById: (id) => docEl.__desc().find((e) => e.getAttribute('id') === id) || null,
    addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
    contains: (n) => docEl.contains(n),
    createTreeWalker: () => ({ nextNode: () => null }),
  };

  const sandbox = {
    window: W, document: D, localStorage, HTMLElement: El, Element: El, Node: El,
    performance: W.performance, location: W.location, CSS: W.CSS,
    setTimeout: W.setTimeout, clearTimeout: W.clearTimeout, setInterval: W.setInterval, clearInterval: W.clearInterval,
    requestAnimationFrame: W.requestAnimationFrame, cancelAnimationFrame: W.cancelAnimationFrame,
    CustomEvent: class { constructor(t, o) { this.type = t; this.detail = o && o.detail; } },
    Event: class { constructor(t) { this.type = t; } },
    MutationObserver: class { observe() {} disconnect() {} takeRecords() { return []; } },
    console: { log() {}, warn() {}, error() {}, debug() {}, info() {} },
    crypto: { randomUUID: () => 'r-r-r-r-r', getRandomValues: (a) => a },
    navigator: { userAgent: 'node' },
    JSON, Math, Number, String, Object, Array, Boolean, Date, RegExp, Error, Set, Map, WeakMap, WeakSet,
    Promise, Symbol, isNaN, parseInt, parseFloat, encodeURIComponent, decodeURIComponent,
    structuredClone, Intl, TextEncoder, URL,
  };
  sandbox.globalThis = sandbox; sandbox.self = sandbox; W.self = sandbox;

  vm.runInNewContext(SOURCE, sandbox, { filename: TAGS_PATH });
  const Tags = sandbox.window.H2O.Tags;
  if (!Tags) throw new Error('TEST_HARNESS_BLOCKED:tags-module-did-not-boot');

  const api = {
    state, sandbox, Tags, El, body, docEl, store, titleApi, bars,
    chatId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    setRoute(turns) { route = turns; },
    getRoute() { return route; },
    makeTurn(i) {
      const answerId = `answer-${i}`;
      const turnRoot = new El('article');
      turnRoot.setAttribute('data-testid', `conversation-turn-${i}`);
      turnRoot.setAttribute('data-chat-id', api.chatId);
      const q = new El('div');
      q.setAttribute('data-message-author-role', 'user');
      q.setAttribute('data-message-id', `question-${i}`);
      q.__kind = 'question';
      q.__t = `question ${i} about deployment pipelines and rollback safety`;
      const a = new El('div');
      a.setAttribute('data-message-author-role', 'assistant');
      a.setAttribute('data-message-id', answerId);
      a.__kind = 'answer';
      a.__t = `answer ${i} describing deployment rollback verification and canary release checks`;
      turnRoot.appendChild(q); turnRoot.appendChild(a);
      body.appendChild(turnRoot);
      return { answerId, turnId: answerId, chatId: api.chatId, node: turnRoot, answerEl: a, questionEl: q, __q: q, __a: a };
    },
    flushTimers(rounds = 6) {
      for (let r = 0; r < rounds; r += 1) {
        const batch = state.timers.splice(0).filter(Boolean);
        if (!batch.length) return;
        for (const t of batch) { try { t.fn(); } catch (_) {} }
      }
    },
    reset() {
      state.listTurnsCalls = 0; state.ensureBarCalls = 0; state.pillWrites = 0;
      state.innerTextQuestion = 0; state.innerTextAnswer = 0; state.innerTextOther = 0;
      state.storageWrites.length = 0;
    },
    // aggregateChat calls listTurns(chatId) once; rescanVisibleTitleBars calls it once.
    aggregations() { return Math.max(0, state.listTurnsCalls - 1); },
    innerTextTotal() { return state.innerTextQuestion + state.innerTextAnswer; },
    pills() { return api.docEl.__desc().filter((e) => e.__kind === 'pill'); },
    // Drive the REAL trigger: the Core index event 0F5a binds at boot.
    fireIndexUpdated() {
      sandbox.window.dispatchEvent(new sandbox.CustomEvent('evt:h2o:core:index:updated', { detail: {} }));
      api.flushTimers();
    },
    summaryKeys() { return [...new Set(state.storageWrites)]; },
  };

  // Tag the pill nodes as they are created so pill writes are countable. The pill
  // is created by real Tags code inside the title bar; identify it structurally.
  api.markPills = () => {
    for (const bar of bars.values()) {
      for (const e of bar.__desc()) {
        if (!e.__kind && e.getAttribute('data-cgxui')) e.__kind = 'pill';
      }
    }
  };
  return api;
}

function buildRoute(env, n = N_TURNS) {
  const turns = [];
  for (let i = 1; i <= n; i += 1) turns.push(env.makeTurn(i));
  env.setRoute(turns);
  return turns;
}

const gate = {};

// ══ PRIMARY GATE ══════════════════════════════════════════════════════════
fixture('TAGS_RESCAN_MUST_NOT_AGGREGATE_THE_FULL_ROUTE_ONCE_PER_TURN', () => {
  const env = createEnv();
  const turns = buildRoute(env);
  env.flushTimers();               // let boot settle
  env.reset();

  env.fireIndexUpdated();          // ONE real rescan via the real Core-event path
  env.markPills();

  gate.listTurnsCalls = env.state.listTurnsCalls;
  gate.aggregations = env.aggregations();
  gate.attach = env.state.ensureBarCalls;
  gate.q = env.state.innerTextQuestion;
  gate.a = env.state.innerTextAnswer;
  gate.total = env.innerTextTotal();
  gate.turns = turns.length;

  atLeast(env.state.listTurnsCalls, 1, 'precondition: the real rescan path executed');
  atMost(env.aggregations(), 1,
    `one rescan over ${turns.length} turns must trigger at most ONE full-route aggregation`);
  atMost(env.innerTextTotal(), 2 * turns.length,
    `one rescan must read rendered text at most twice per turn (<= ${2 * turns.length} innerText reads)`);
});

// ══ ANTI-DEGENERACY ═══════════════════════════════════════════════════════
fixture('anti-degeneracy: aggregation must still run and still read turn text', () => {
  const env = createEnv();
  buildRoute(env);
  env.flushTimers();
  env.reset();
  env.fireIndexUpdated();

  atLeast(env.aggregations(), 1, 'aggregation must still happen — batching, not disabling');
  atLeast(env.innerTextTotal(), 1, 'MANUAL-mode route text extraction must still occur');
});

// ══ CONTROL A: pill output ════════════════════════════════════════════════
fixture('control A: every turn still attaches Tags UI with unchanged pill output', () => {
  const env = createEnv();
  const turns = buildRoute(env);
  env.flushTimers();
  env.fireIndexUpdated();
  env.markPills();

  const pills = env.pills();
  atLeast(pills.length, 1, 'Tags pills were created');
  eq(pills.length, turns.length, 'exactly one pill per turn');
  for (const p of pills) ok(/^#\d*$/.test(String(p.textContent)), `pill text has the documented '#'/'#N' shape (got ${p.textContent})`);
});

// ══ CONTROL B/E: chat + project aggregation outputs and side outputs ══════
fixture('control B/E: chat/project aggregation and side outputs are still produced', () => {
  const env = createEnv();
  buildRoute(env);
  env.flushTimers();
  env.reset();
  env.fireIndexUpdated();
  env.flushTimers();

  const keys = env.summaryKeys();
  atLeast(keys.length, 1, 'aggregation persisted at least one durable output');
  gate.outputKeys = keys.slice(0, 8);
});

// ══ CONTROL C: real text change ═══════════════════════════════════════════
fixture('control C: a real turn text change is picked up by a later rescan', () => {
  const env = createEnv();
  const turns = buildRoute(env);
  env.flushTimers();
  env.fireIndexUpdated();

  turns[3].__a.__t = 'answer 4 COMPLETELY REPLACED with kubernetes autoscaling guidance';
  env.reset();
  env.fireIndexUpdated();

  atLeast(env.aggregations(), 1, 'a later rescan still aggregates (no stale summary)');
  atLeast(env.innerTextTotal(), 1, 'changed turn text is re-read');
});

// ══ CONTROL D: standalone attachTurnUi keeps its aggregation ══════════════
fixture('control D: standalone attachTurnUi still performs its own aggregation', () => {
  const env = createEnv();
  const turns = buildRoute(env);
  env.flushTimers();
  env.fireIndexUpdated();
  env.reset();

  const t = turns[0];
  env.Tags.ui.attachTurnUi(t.node, t.answerId, { chatId: env.chatId, reason: 'manual-mutation' });

  atLeast(env.state.listTurnsCalls, 1,
    'a standalone attachTurnUi call must still aggregate — batching is scoped to the rescan loop only');
});

// ══ CONTROL F: no duplicate Tags UI ═══════════════════════════════════════
fixture('control F: repeated rescans create no duplicate Tags UI', () => {
  const env = createEnv();
  const turns = buildRoute(env);
  env.flushTimers();
  for (let i = 0; i < 4; i += 1) env.fireIndexUpdated();
  env.markPills();

  eq(env.pills().length, turns.length, 'still exactly one pill per turn after repeated rescans');
});

// ══ CONTROL G: route change ═══════════════════════════════════════════════
fixture('control G: a route change re-aggregates against the new route', () => {
  const env = createEnv();
  buildRoute(env);
  env.flushTimers();
  env.fireIndexUpdated();

  const fresh = [];
  for (let i = 100; i < 106; i += 1) fresh.push(env.makeTurn(i));
  env.setRoute(fresh);
  env.reset();
  env.fireIndexUpdated();
  env.markPills();

  atLeast(env.aggregations(), 1, 'route change triggers aggregation');
  atLeast(env.innerTextTotal(), 1, 'new-route turn text is read');
  ok(env.pills().length >= fresh.length, 'new route turns received Tags UI');
});

// ══ CONTROL H: MANUAL-mode fallback still active ══════════════════════════
fixture('control H: default MANUAL mode still runs the phase-4 text/keyword fallback', () => {
  const env = createEnv();
  buildRoute(env);
  env.flushTimers();
  env.reset();
  env.fireIndexUpdated();

  // The MANUAL-mode fallback is what makes readTurnTexts run inside aggregateChat.
  atLeast(env.innerTextTotal(), 1,
    'MANUAL-mode keyword fallback must still extract turn text — the optimization must not pass by skipping it');
  gate.manualModeReads = env.innerTextTotal();
});

// ══ OPTIONAL OBSERVATION (not part of the gate) ═══════════════════════════
let timerObservation = 'not measured';
try {
  const env = createEnv();
  buildRoute(env);
  env.flushTimers();
  const before = env.state.timers.length;
  for (let i = 0; i < 5; i += 1) {
    env.sandbox.window.dispatchEvent(new env.sandbox.CustomEvent('evt:h2o:core:index:updated', { detail: {} }));
  }
  timerObservation = `5 consecutive index events created ${env.state.timers.length - before} pending timers (no cancellation observed)`;
} catch (e) { timerObservation = `unavailable: ${String(e?.message || e).slice(0, 80)}`; }

// ── Report ────────────────────────────────────────────────────────────────
const failed = fixtures.filter((f) => !f.ok);
for (const f of fixtures) {
  console.log(`${f.ok ? 'PASS' : 'FAIL'} ${f.name}`);
  if (!f.ok) console.log(f.error.split('\n').slice(0, 5).map((l) => `       ${l}`).join('\n'));
}
console.log('');
console.log(`Gate observation @ N=${gate.turns ?? N_TURNS} turns, ONE rescan via evt:h2o:core:index:updated:`);
console.log(`  turnRuntime.listTurns() calls  = ${gate.listTurnsCalls}   (1 rescan + 1 per aggregateChat)`);
console.log(`  FULL-ROUTE AGGREGATIONS       = ${gate.aggregations}   (contract: <= 1)`);
console.log(`  title-bar ensureBar calls     = ${gate.attach}`);
console.log(`  question innerText reads      = ${gate.q}`);
console.log(`  answer   innerText reads      = ${gate.a}`);
console.log(`  TOTAL innerText reads         = ${gate.total}   (contract: <= ${2 * (gate.turns ?? N_TURNS)})`);
console.log(`  MANUAL-mode fallback reads    = ${gate.manualModeReads ?? 'n/a'}`);
console.log(`  durable output keys written   = ${JSON.stringify(gate.outputKeys ?? [])}`);
console.log(`  timer observation (not gated) = ${timerObservation}`);
if (unsupported.size) console.log(`  selectors treated as no-match: ${[...unsupported].slice(0, 6).join(' | ')}`);
console.log('');
console.log(`Fixtures: ${fixtures.length - failed.length}/${fixtures.length}`);
console.log(`Assertions: ${assertions}`);
if (failed.length) { console.log('Tags rescan aggregation cost FAILED'); process.exit(1); }
console.log('Tags rescan aggregation cost passed');
