#!/usr/bin/env node
// CV-3.49 — 8A1b Themes Panel: tiny-rail admission and sidebar-guard read cost.
//
// Two independent contracts on the same module, both about work that is spent
// without changing anything.
//
// A. TINY-RAIL ADMISSION
//    STATE.moTinyRail observes documentElement {childList,subtree} and is wired
//    as `new MutationObserver(TIME_TP_scheduleEnsureTinyRail)` — the scheduler
//    IS the callback, so the MutationRecords are discarded and every batch in
//    the document schedules UI_TP_ensureTinyRailButton, which then pays a rail
//    rect and a template sizing rect. A mutation that cannot affect the tiny
//    rail must schedule nothing.
//
// B. SIDEBAR-GUARD INTRA-PASS COST
//    DOM_TP_updateSidebarMoreGuard iterates the guarded rows and, per row,
//    recomputes DOM_TP_sidebarTopGuardBottom — which itself takes a sidebar
//    rect and then a rect plus a visibility probe for every fixed-label
//    candidate in the sidebar. The per-row attribute write lands between those
//    reads, so each write re-dirties the tree the next row reads from. Cost
//    scales as N x M rather than N + M for N rows and M candidates.
//
//    The contract is: the guard invariant is computed ONCE per coherent pass,
//    every read the pass needs happens before any write the pass owns, and the
//    functional result is bit-identical to today's.
//
// Deliberately NOT in scope: trigger frequency (capture-phase document scroll,
// resize and visualViewport scroll all remain valid triggers), any throttle or
// debounce, any cross-pass cache, the panel, settings, or theme apply paths.
//
// The REAL 8A1b functions are extracted by name and executed. 8A1b is a large
// self-booting IIFE owning storage, panel UI and theme application; executing
// it whole would need a materially fake environment for systems unrelated to
// these two contracts. Extraction failure is a hard error — this gate must
// never silently fall back to a re-implementation.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.H2O_SRC_DIR ? path.resolve(process.env.H2O_SRC_DIR) : path.resolve(HERE, '../../..');
const THEMES_PATH = 'src-runtime-base/8A1b.🟪🎨 Themes Panel 🎨.js';
const SOURCE = fs.readFileSync(path.join(ROOT, THEMES_PATH), 'utf8');

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

// ── Real-source extraction ────────────────────────────────────────────────
// 8A1b declares its functions at two-space indent inside its IIFE. Brace
// balancing runs from the body brace to the matching close, skipping strings,
// template literals, comments and regex-looking slashes conservatively.
function extractFunction(name, { optional = false } = {}) {
  const anchor = `\n  function ${name}(`;
  const start = SOURCE.indexOf(anchor);
  if (start < 0) {
    if (optional) return null;
    throw new Error(`TEST_HARNESS_BLOCKED:function-missing:${name}`);
  }
  if (SOURCE.indexOf(anchor, start + anchor.length) >= 0) {
    throw new Error(`TEST_HARNESS_BLOCKED:function-ambiguous:${name}`);
  }
  const bodyStart = SOURCE.indexOf('{', SOURCE.indexOf(')', start));
  let d = 0, q = '', esc = false, lc = false, bc = false;
  for (let i = bodyStart; i < SOURCE.length; i += 1) {
    const c = SOURCE[i], n = SOURCE[i + 1];
    if (lc) { if (c === '\n') lc = false; continue; }
    if (bc) { if (c === '*' && n === '/') { bc = false; i += 1; } continue; }
    if (q) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === q) q = ''; continue; }
    if (c === '/' && n === '/') { lc = true; i += 1; continue; }
    if (c === '/' && n === '*') { bc = true; i += 1; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if (c === '{') d += 1;
    else if (c === '}' && --d === 0) return SOURCE.slice(start + 1, i + 1);
  }
  throw new Error(`TEST_HARNESS_BLOCKED:function-boundary-invalid:${name}`);
}

// Required entry points. If the module is refactored so these no longer exist,
// the harness is no longer faithful and must fail loudly rather than pass.
const REQUIRED = [
  'DOM_TP_isEl',
  'DOM_TP_getAttr',
  'DOM_TP_isVisible',
  'DOM_TP_sidebarTopGuardBottom',
  'DOM_TP_updateSidebarMoreGuard',
  'TIME_TP_scheduleEnsureTinyRail',
  'UI_TP_wireTinyRailEnsure',
];
// Present only once the admission repair exists; absent on the base revision.
const OPTIONAL = [
  'DOM_TP_ownedAdditionsOnly',
  'DOM_TP_inTinyRailDomain',
  'DOM_TP_carriesTinyRailCandidate',
  'DOM_TP_tinyRailInvalidated',
];

const parts = [];
for (const name of REQUIRED) parts.push(extractFunction(name));
const present = new Set();
for (const name of OPTIONAL) {
  const src = extractFunction(name, { optional: true });
  if (src) { parts.push(src); present.add(name); }
}
const PROGRAM = parts.join('\n\n');

// The wiring must still be the real observer wiring this gate is about.
const WIRING = {
  observesDocumentElement: /STATE\.moTinyRail\.observe\(\s*D\.documentElement/.test(SOURCE),
  singleTinyRailObserver: (SOURCE.match(/STATE\.moTinyRail = new MutationObserver\(/gu) || []).length === 1,
  observerCount: (SOURCE.match(/new MutationObserver\(/gu) || []).length,
  recoveryIntervalUntouched: /const HO_SCAN_RECOVERY_MS/.test(SOURCE) === false, // 9A1b concern, not 8A1b
};

// ── Instrumented mini-DOM ─────────────────────────────────────────────────
// Every layout/style-forcing read and every attribute write is recorded in one
// ordered log, so "all reads before any write" is a property of the log rather
// than of counters that could be satisfied by accident.
function createEnv() {
  const log = [];          // {kind:'read'|'write', what, id}
  const counts = { rectSidebar: 0, rectRow: 0, rectOther: 0, style: 0, writes: 0, ensure: 0, raf: 0 };
  let SEQ = 0;

  class El {
    constructor(tag = 'div') {
      this.tagName = String(tag).toUpperCase();
      this.nodeType = 1;                 // production guards element-ness the standard way
      this.__id = ++SEQ;
      this.__attrs = new Map();
      this.childNodes = [];
      this.parentNode = null;
      this.__rect = { top: 0, left: 0, width: 200, height: 40 };
      this.__style = { display: 'block', visibility: 'visible' };
      this.__mark = '';
    }
    get parentElement() { return this.parentNode; }
    appendChild(n) { n.parentNode = this; this.childNodes.push(n); return n; }
    removeChild(n) { const i = this.childNodes.indexOf(n); if (i >= 0) { this.childNodes.splice(i, 1); n.parentNode = null; } return n; }
    remove() { if (this.parentNode) this.parentNode.removeChild(this); }
    get isConnected() { let n = this; while (n) { if (n === documentElement) return true; n = n.parentNode; } return false; }
    setAttribute(n, v) { counts.writes += 1; log.push({ kind: 'write', what: `set:${n}`, id: this.__id }); this.__attrs.set(String(n), String(v)); }
    removeAttribute(n) { counts.writes += 1; log.push({ kind: 'write', what: `remove:${n}`, id: this.__id }); this.__attrs.delete(String(n)); }
    getAttribute(n) { const v = this.__attrs.get(String(n)); return v === undefined ? null : v; }
    hasAttribute(n) { return this.__attrs.has(String(n)); }
    get textContent() { return this.__attrs.get('__text') || ''; }
    __desc(out = []) { for (const c of this.childNodes) { out.push(c); c.__desc(out); } return out; }
    matches(sel) { return matchSel(this, sel); }
    closest(sel) { let n = this; while (n) { if (n instanceof El && matchSel(n, sel)) return n; n = n.parentNode; } return null; }
    contains(o) { let n = o; while (n) { if (n === this) return true; n = n.parentNode; } return false; }
    querySelector(sel) { return this.__desc().find((e) => matchSel(e, sel)) || null; }
    querySelectorAll(sel) { return this.__desc().filter((e) => matchSel(e, sel)); }
    getBoundingClientRect() {
      const bucket = this.__mark === 'sidebar' ? 'rectSidebar' : (this.__mark === 'row' ? 'rectRow' : 'rectOther');
      counts[bucket] += 1;
      log.push({ kind: 'read', what: `rect:${this.__mark || this.tagName.toLowerCase()}`, id: this.__id });
      const r = this.__rect;
      return { top: r.top, left: r.left, width: r.width, height: r.height, bottom: r.top + r.height, right: r.left + r.width };
    }
    getClientRects() { return this.getBoundingClientRect().width > 0 ? [1] : []; }
  }

  // Only the selector forms 8A1b actually uses on these paths.
  const unsupported = new Set();
  function matchOne(el, s) {
    let rest = s;
    const tag = /^[a-zA-Z][a-zA-Z0-9-]*/.exec(rest);
    if (tag) { if (el.tagName.toLowerCase() !== tag[0].toLowerCase()) return false; rest = rest.slice(tag[0].length); }
    if (rest.startsWith('#')) {
      const m = /^#([A-Za-z0-9_-]+)/.exec(rest);
      if (!m) { unsupported.add(s); return false; }
      if (el.getAttribute('id') !== m[1]) return false;
      rest = rest.slice(m[0].length);
    }
    while (rest.startsWith('[')) {
      const m = /^\[([A-Za-z0-9_:-]+)(?:="([^"]*)")?\]/.exec(rest);
      if (!m) { unsupported.add(s); return false; }
      const v = el.getAttribute(m[1]);
      if (v === null) return false;
      if (m[2] !== undefined && v !== m[2]) return false;
      rest = rest.slice(m[0].length);
    }
    if (rest.trim()) { unsupported.add(s); return false; }
    return true;
  }
  function matchSel(el, sel) {
    return String(sel).split(',').map((x) => x.trim()).filter(Boolean).some((s) => matchOne(el, s));
  }

  const documentElement = new El('html');
  const body = new El('body');
  documentElement.appendChild(body);

  const D = {
    documentElement, body,
    querySelector: (s) => documentElement.querySelector(s),
    querySelectorAll: (s) => documentElement.querySelectorAll(s),
    createElement: (t) => new El(t),
    getElementById: (id) => documentElement.__desc().find((e) => e.getAttribute('id') === id) || null,
  };

  const observers = [];
  const frames = [];
  const listeners = new Map();
  const W = {
    getComputedStyle: (el) => { counts.style += 1; log.push({ kind: 'read', what: 'style', id: el?.__id }); return { ...(el?.__style || {}) }; },
    requestAnimationFrame: (fn) => { counts.raf += 1; frames.push(fn); return frames.length; },
    cancelAnimationFrame: () => {},
    addEventListener: (t, fn) => { if (!listeners.has(t)) listeners.set(t, []); listeners.get(t).push(fn); },
    removeEventListener: () => {},
    innerHeight: 900,
  };

  class MO {
    constructor(cb) { this.cb = cb; this.on = false; observers.push(this); }
    observe() { this.on = true; }
    disconnect() { this.on = false; }
    takeRecords() { return []; }
  }

  const STATE = { disposed: false, moTinyRail: null, rafTinyRail: 0, tinyRailWrap: null, onResize: null, onPop: null, sidebarMoreGuardRaf: 0 };

  const sandbox = {
    D, W, STATE, MutationObserver: MO,
    document: D, window: W,
    // Constants the extracted functions close over in the real module.
    SkID: 'thpn',
    ATTR_CGXUI_OWNER: 'data-cgxui-owner',
    ATTR_HO_SIDEBAR_TOP_MORE: 'data-ho-sidebar-top-more',
    ATTR_HO_SIDEBAR_MORE_HIDDEN: 'data-ho-sidebar-more-hidden',
    ATTR_HO_CHATGPT_SIDEBAR: 'data-ho-chatgpt-sidebar',
    SEL_CHATGPT_SIDEBAR: 'nav[aria-label="Sidebar"], nav[aria-label="Chat history"]',
    SEL_TINY_RAIL: '#stage-sidebar-tiny-bar',
    EV_WIN_RESIZE: 'resize', EV_WIN_POP: 'popstate', EV_LEGACY_NAVIGATE: 'ho:navigate',
    // The expensive tiny-rail feature pass. Counted, not re-implemented: this
    // gate is about whether it is ADMITTED, never about what it does inside.
    UI_TP_ensureTinyRailButton: () => { counts.ensure += 1; },
    // Ownership is not this gate's subject; a faithful ancestor-stamp test is
    // enough for the guard paths, and never reads layout.
    DOM_TP_isH2OOwned: (node) => { let n = node; while (n) { if (n.getAttribute?.('data-cgxui-owner')) return true; n = n.parentNode; } return false; },
    console: { log() {}, warn() {}, error() {}, debug() {}, info() {} },
    Math, Number, String, Object, Array, Boolean, Set, Map, JSON, Infinity, NaN, isNaN,
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(PROGRAM, sandbox, { filename: THEMES_PATH });
  for (const name of REQUIRED) {
    if (typeof sandbox[name] !== 'function') throw new Error(`TEST_HARNESS_BLOCKED:not-loaded:${name}`);
  }

  return {
    El, D, W, STATE, sandbox, log, counts, unsupported, documentElement, body, observers,
    el(tag, { attrs, rect, mark, style } = {}) {
      const e = new El(tag);
      if (attrs) for (const [k, v] of Object.entries(attrs)) e.__attrs.set(k, String(v));
      if (rect) e.__rect = { ...e.__rect, ...rect };
      if (style) e.__style = { ...e.__style, ...style };
      if (mark) e.__mark = mark;
      return e;
    },
    flushFrames() { for (const fn of frames.splice(0)) fn(); },
    reset() {
      log.length = 0;
      for (const k of Object.keys(counts)) counts[k] = 0;
    },
    // Deliver one childList batch to the tiny-rail observer, exactly as a real
    // MutationObserver would: the callback receives records and the observer.
    deliver(records) {
      for (const o of observers) if (o.on) o.cb(records, o);
    },
    rec(target, { added = [], removed = [] } = {}) {
      return { type: 'childList', target, addedNodes: added, removedNodes: removed };
    },
    firstWriteIndex() { return log.findIndex((e) => e.kind === 'write'); },
    readsAfterFirstWrite() {
      const w = log.findIndex((e) => e.kind === 'write');
      return w < 0 ? 0 : log.slice(w).filter((e) => e.kind === 'read').length;
    },
  };
}

// ── Scenes ────────────────────────────────────────────────────────────────
// The real sidebar shape 8A1b resolves: a nav ChatGPT owns, M fixed-label
// candidates near the top, and N guarded rows below them.
function buildSidebar(env, { rows = 6, candidates = 4 } = {}) {
  const sidebar = env.el('nav', { attrs: { 'aria-label': 'Chat history', 'data-ho-chatgpt-sidebar': 'true' }, mark: 'sidebar', rect: { top: 0, left: 0, width: 260, height: 900 } });
  const labels = ['Library', 'New chat', 'Search chats', 'Codex'];
  for (let i = 0; i < candidates; i += 1) {
    const a = env.el('a', { attrs: { 'aria-label': labels[i % labels.length], 'data-sidebar-item': 'true' }, mark: 'candidate', rect: { top: 40 + i * 36, left: 0, width: 240, height: 32 } });
    sidebar.appendChild(a);
  }
  const rowEls = [];
  for (let i = 0; i < rows; i += 1) {
    const row = env.el('div', { attrs: { 'data-ho-sidebar-top-more': 'true' }, mark: 'row', rect: { top: 100 + i * 40, left: 0, width: 240, height: 36 } });
    sidebar.appendChild(row);
    rowEls.push(row);
  }
  env.body.appendChild(sidebar);
  return { sidebar, rows: rowEls };
}

function addTinyRail(env) {
  const rail = env.el('div', { attrs: { id: 'stage-sidebar-tiny-bar' }, mark: 'rail', rect: { top: 0, left: 0, width: 56, height: 600 } });
  env.body.appendChild(rail);
  return rail;
}

function wireRail(env) {
  env.sandbox.UI_TP_wireTinyRailEnsure();
  env.flushFrames();          // the bind-time scheduling call is ungated by design
  env.reset();
}

// ══ RED A — tiny-rail admission ═══════════════════════════════════════════

fixture('RED A: an irrelevant document mutation must not schedule the tiny-rail pass', () => {
  const env = createEnv();
  buildSidebar(env);
  addTinyRail(env);
  wireRail(env);

  // A transcript node appearing under <main>: nowhere near the sidebar or rail.
  const main = env.el('main');
  env.body.appendChild(main);
  const turn = env.el('article', { attrs: { 'data-testid': 'conversation-turn-9' } });
  main.appendChild(turn);
  env.deliver([env.rec(main, { added: [turn] })]);
  env.flushFrames();

  eq(env.counts.ensure, 0, 'an irrelevant batch must schedule no tiny-rail feature pass');
});

fixture('RED A: many irrelevant batches across many frames stay free', () => {
  const env = createEnv();
  buildSidebar(env);
  addTinyRail(env);
  wireRail(env);
  const main = env.el('main');
  env.body.appendChild(main);

  for (let i = 0; i < 20; i += 1) {
    const turn = env.el('div', { attrs: { 'data-turn': String(i) } });
    main.appendChild(turn);
    env.deliver([env.rec(main, { added: [turn] })]);
    env.flushFrames();
  }
  eq(env.counts.ensure, 0, '20 irrelevant batches must remain entirely free');
});

fixture('control: a mutation inside the tiny rail still schedules', () => {
  const env = createEnv();
  buildSidebar(env);
  const rail = addTinyRail(env);
  wireRail(env);

  const foreign = env.el('div', { attrs: { 'data-state': 'closed' } });
  rail.appendChild(foreign);
  env.deliver([env.rec(rail, { added: [foreign] })]);
  env.flushFrames();
  atLeast(env.counts.ensure, 1, 'a foreign in-rail insertion is relevant');
});

fixture('control: a mutation inside the sidebar still schedules', () => {
  const env = createEnv();
  const { sidebar } = buildSidebar(env);
  addTinyRail(env);
  wireRail(env);

  const node = env.el('div');
  sidebar.appendChild(node);
  env.deliver([env.rec(sidebar, { added: [node] })]);
  env.flushFrames();
  atLeast(env.counts.ensure, 1, 'a sidebar structural change is relevant');
});

fixture('control: the tiny rail appearing late is admitted', () => {
  const env = createEnv();
  buildSidebar(env);
  wireRail(env);                       // no rail in the page yet

  const rail = addTinyRail(env);
  env.deliver([env.rec(env.body, { added: [rail] })]);
  env.flushFrames();
  atLeast(env.counts.ensure, 1, 'first rail appearance must be admitted');
});

fixture('control: the tiny rail being replaced is admitted', () => {
  const env = createEnv();
  buildSidebar(env);
  const oldRail = addTinyRail(env);
  wireRail(env);

  oldRail.remove();
  const newRail = addTinyRail(env);
  env.deliver([env.rec(env.body, { added: [newRail], removed: [oldRail] })]);
  env.flushFrames();
  atLeast(env.counts.ensure, 1, 'rail replacement must be admitted');
});

fixture('control: the tiny rail being removed is admitted', () => {
  const env = createEnv();
  buildSidebar(env);
  const rail = addTinyRail(env);
  wireRail(env);

  rail.remove();
  env.deliver([env.rec(env.body, { removed: [rail] })]);
  env.flushFrames();
  atLeast(env.counts.ensure, 1, 'rail removal must be admitted so the rail can self-heal');
});

fixture('control: a mixed batch stays relevant even when the foreign record is last', () => {
  const env = createEnv();
  const { sidebar } = buildSidebar(env);
  addTinyRail(env);
  wireRail(env);

  const main = env.el('main');
  env.body.appendChild(main);
  const noise = env.el('div');
  main.appendChild(noise);
  const real = env.el('div');
  sidebar.appendChild(real);
  env.deliver([env.rec(main, { added: [noise] }), env.rec(sidebar, { added: [real] })]);
  env.flushFrames();
  atLeast(env.counts.ensure, 1, 'a batch is relevant through whichever record is relevant');
});

fixture('control: our own stamped rail wrapper does not re-arm us', () => {
  const env = createEnv();
  buildSidebar(env);
  const rail = addTinyRail(env);
  wireRail(env);

  const owned = env.el('div', { attrs: { 'data-state': 'closed', 'data-cgxui-owner': 'thpn' } });
  rail.appendChild(owned);
  env.deliver([env.rec(rail, { added: [owned] })]);
  env.flushFrames();
  eq(env.counts.ensure, 0, 'the module’s own stamped addition invalidates nothing');
});

// ══ RED C — sidebar-guard intra-pass cost ═════════════════════════════════

fixture('RED C: the guard invariant is computed once per pass, not once per row', () => {
  const env = createEnv();
  buildSidebar(env, { rows: 6, candidates: 4 });
  env.reset();

  env.sandbox.DOM_TP_updateSidebarMoreGuard();

  // The sidebar rect is taken exactly once inside DOM_TP_sidebarTopGuardBottom,
  // so its count IS the number of guard-bottom computations in the pass.
  eq(env.counts.rectSidebar, 1, 'guard bottom must be computed once for the pass');
  eq(env.counts.rectRow, 6, 'each guarded row is measured exactly once');
});

fixture('RED C: total forced reads scale as N + M, not N x M', () => {
  const env = createEnv();
  buildSidebar(env, { rows: 8, candidates: 4 });
  env.reset();
  env.sandbox.DOM_TP_updateSidebarMoreGuard();
  const total = env.counts.rectSidebar + env.counts.rectRow + env.counts.rectOther + env.counts.style;

  // N rows + M candidates + 1 sidebar, with one style probe per candidate.
  // Generous ceiling: the contract is the SHAPE, not an exact figure.
  atMost(total, 8 + (4 * 2) + 1 + 4,
    'reads must scale with rows plus candidates, not with their product');
});

fixture('RED C: every read of a pass happens before any write of that pass', () => {
  const env = createEnv();
  buildSidebar(env, { rows: 6, candidates: 4 });
  env.reset();
  env.sandbox.DOM_TP_updateSidebarMoreGuard();

  atLeast(env.counts.writes, 1, 'the pass really does write');
  eq(env.readsAfterFirstWrite(), 0, 'no forced read may follow the first write of the pass');
});

fixture('control: the guard result is unchanged - rows above the guard hide, rows below do not', () => {
  const env = createEnv();
  const { rows } = buildSidebar(env, { rows: 4, candidates: 4 });
  // Candidates end at top 40+3*36+32 = 180, so guard bottom is max(280, 188) = 280.
  rows[0].__rect = { top: 10, left: 0, width: 240, height: 36 };    // above -> hidden
  rows[1].__rect = { top: 120, left: 0, width: 240, height: 36 };   // above -> hidden
  rows[2].__rect = { top: 400, left: 0, width: 240, height: 36 };   // below -> not hidden
  rows[3].__rect = { top: 500, left: 0, width: 240, height: 36 };   // below -> not hidden

  env.sandbox.DOM_TP_updateSidebarMoreGuard();

  eq(rows[0].getAttribute('data-ho-sidebar-more-hidden'), 'true', 'row above the guard is hidden');
  eq(rows[1].getAttribute('data-ho-sidebar-more-hidden'), 'true', 'second row above the guard is hidden');
  eq(rows[2].getAttribute('data-ho-sidebar-more-hidden'), null, 'row below the guard is not hidden');
  eq(rows[3].getAttribute('data-ho-sidebar-more-hidden'), null, 'second row below the guard is not hidden');
});

fixture('control: a previously hidden row that moves below the guard is un-hidden', () => {
  const env = createEnv();
  const { rows } = buildSidebar(env, { rows: 2, candidates: 4 });
  rows[0].__rect = { top: 10, left: 0, width: 240, height: 36 };
  env.sandbox.DOM_TP_updateSidebarMoreGuard();
  eq(rows[0].getAttribute('data-ho-sidebar-more-hidden'), 'true', 'precondition: hidden');

  rows[0].__rect = { top: 600, left: 0, width: 240, height: 36 };
  env.sandbox.DOM_TP_updateSidebarMoreGuard();
  eq(rows[0].getAttribute('data-ho-sidebar-more-hidden'), null, 'moving below the guard clears the attribute');
});

fixture('control: no guarded rows performs no read and no write', () => {
  const env = createEnv();
  buildSidebar(env, { rows: 0, candidates: 4 });
  env.reset();
  env.sandbox.DOM_TP_updateSidebarMoreGuard();
  eq(env.counts.writes, 0, 'nothing to write');
  eq(env.counts.rectSidebar, 0, 'and no guard bottom is computed for an empty pass');
});

fixture('control: nothing is cached across passes - a second pass measures again', () => {
  const env = createEnv();
  buildSidebar(env, { rows: 4, candidates: 4 });
  env.sandbox.DOM_TP_updateSidebarMoreGuard();
  env.reset();
  env.sandbox.DOM_TP_updateSidebarMoreGuard();
  // Deliberately not pinned to 1 here - that is RED C's job. This control must
  // be interpretable on BOTH sides of the repair, so it asserts only that the
  // second pass really re-measures rather than replaying a retained result.
  atLeast(env.counts.rectSidebar, 1, 'the next pass recomputes the guard bottom');
  eq(env.counts.rectRow, 4, 'and re-measures every row');
});

// ══ STRUCTURE ═════════════════════════════════════════════════════════════

// Real ensure-path mini DOM. It models the browser's whitespace Text nodes and
// one childList record per innerHTML replacement, while counting only writes
// made by the extracted production function.
function createRendererEnv() {
  const counts = { ensure: 0, innerHTML: 0, childRemovals: 0, childAdditions: 0, recreatedElements: 0, attrWrites: 0, styleWrites: 0, raf: 0 };
  const records = [], frames = [];
  let seq = 0;

  class TextNode {
    constructor(text = '') { this.nodeType = 3; this.textContent = String(text); this.parentNode = null; }
    get parentElement() { return this.parentNode; }
    cloneNode() { return new TextNode(this.textContent); }
    contains(node) { return node === this; }
  }
  const rawAttach = (parent, child) => { child.parentNode = parent; parent.childNodes.push(child); return child; };
  const elementCount = (node) => node?.nodeType === 1 ? 1 + node.childNodes.reduce((n, child) => n + elementCount(child), 0) : 0;
  const classHas = (node, name) => String(node.getAttribute('class') || '').split(/\s+/u).includes(name);

  class El {
    constructor(tag = 'div') {
      this.tagName = String(tag).toUpperCase(); this.nodeType = 1; this.__id = ++seq;
      this.__attrs = new Map(); this.__styles = new Map(); this.childNodes = []; this.parentNode = null;
      this.__rect = { top: 0, left: 0, width: 24, height: 24 };
      const self = this;
      this.style = new Proxy({
        setProperty(name, value) { counts.styleWrites += 1; self.__styles.set(String(name), String(value)); },
        removeProperty(name) { counts.styleWrites += 1; self.__styles.delete(String(name)); },
        getPropertyValue(name) { return self.__styles.get(String(name)) || ''; },
      }, {
        get(target, key) { return key in target ? target[key] : (self.__styles.get(String(key)) || ''); },
        set(_target, key, value) { counts.styleWrites += 1; self.__styles.set(String(key), String(value)); return true; },
      });
    }
    get parentElement() { return this.parentNode?.nodeType === 1 ? this.parentNode : null; }
    get children() { return this.childNodes.filter((node) => node.nodeType === 1); }
    get nextSibling() { const siblings = this.parentNode?.childNodes || []; return siblings[siblings.indexOf(this) + 1] || null; }
    get isConnected() { let node = this; while (node) { if (node === documentElement) return true; node = node.parentNode; } return false; }
    get className() { return this.getAttribute('class') || ''; }
    get classList() { return { contains: (name) => classHas(this, String(name)) }; }
    setAttribute(name, value) { counts.attrWrites += 1; this.__attrs.set(String(name), String(value)); }
    removeAttribute(name) { counts.attrWrites += 1; this.__attrs.delete(String(name)); }
    getAttribute(name) { const value = this.__attrs.get(String(name)); return value === undefined ? null : value; }
    hasAttribute(name) { return this.__attrs.has(String(name)); }
    addEventListener() {} removeEventListener() {}
    appendChild(node) { if (node.parentNode) node.parentNode.removeChild(node); rawAttach(this, node); counts.childAdditions += 1; records.push({ type: 'childList', target: this, addedNodes: [node], removedNodes: [] }); return node; }
    removeChild(node) { const i = this.childNodes.indexOf(node); if (i >= 0) { this.childNodes.splice(i, 1); node.parentNode = null; counts.childRemovals += 1; records.push({ type: 'childList', target: this, addedNodes: [], removedNodes: [node] }); } return node; }
    remove() { this.parentNode?.removeChild(this); }
    insertBefore(node, before) { if (node.parentNode) node.parentNode.removeChild(node); const i = this.childNodes.indexOf(before); node.parentNode = this; this.childNodes.splice(i < 0 ? this.childNodes.length : i, 0, node); counts.childAdditions += 1; records.push({ type: 'childList', target: this, addedNodes: [node], removedNodes: [] }); return node; }
    get textContent() { return this.childNodes.map((node) => node.textContent || '').join(''); }
    set textContent(value) { this.__replace(String(value) ? [new TextNode(value)] : []); }
    get innerHTML() { return ''; }
    set innerHTML(markup) {
      counts.innerHTML += 1;
      const width = /--cgxui-rail-btn-w:(\d+)px/u.exec(String(markup))?.[1] || '24';
      const height = /--cgxui-rail-btn-h:(\d+)px/u.exec(String(markup))?.[1] || '24';
      const added = canonicalNodes(width, height);
      counts.recreatedElements += added.reduce((n, node) => n + elementCount(node), 0);
      this.__replace(added);
    }
    __replace(added) { const removed = this.childNodes.slice(); for (const node of removed) node.parentNode = null; this.childNodes.length = 0; for (const node of added) rawAttach(this, node); counts.childRemovals += removed.length; counts.childAdditions += added.length; if (removed.length || added.length) records.push({ type: 'childList', target: this, addedNodes: added, removedNodes: removed }); }
    __desc(out = []) { for (const child of this.childNodes) { if (child.nodeType !== 1) continue; out.push(child); child.__desc(out); } return out; }
    contains(node) { let cur = node; while (cur) { if (cur === this) return true; cur = cur.parentNode; } return false; }
    matches(selector) { return matches(this, selector); }
    closest(selector) { let cur = this; while (cur) { if (cur.nodeType === 1 && matches(cur, selector)) return cur; cur = cur.parentNode; } return null; }
    querySelector(selector) { return this.__desc().find((node) => matches(node, selector)) || null; }
    querySelectorAll(selector) { return this.__desc().filter((node) => matches(node, selector)); }
    getBoundingClientRect() { const r = this.__rect; return { ...r, right: r.left + r.width, bottom: r.top + r.height }; }
    cloneNode(deep = false) { const clone = new El(this.tagName); clone.__attrs = new Map(this.__attrs); clone.__styles = new Map(this.__styles); clone.__rect = { ...this.__rect }; if (deep) for (const child of this.childNodes) rawAttach(clone, child.cloneNode(true)); return clone; }
  }

  function matches(node, selector) {
    return String(selector).split(',').map((s) => s.trim()).filter(Boolean).some((part) => {
      let source = part;
      const not = /:not\(\[([\w:-]+)(?:="([^"]*)")?\]\)$/u.exec(source);
      if (not) {
        const value = node.getAttribute(not[1]);
        if (value !== null && (not[2] === undefined || value === not[2])) return false;
        source = source.slice(0, not.index);
      }
      const tag = /^[a-z]+/iu.exec(source); if (tag && node.tagName !== tag[0].toUpperCase()) return false;
      const id = /#([\w-]+)/u.exec(source); if (id && node.getAttribute('id') !== id[1]) return false;
      for (const match of source.matchAll(/\.([\w-]+)/gu)) if (!classHas(node, match[1])) return false;
      for (const match of source.matchAll(/\[([\w:-]+)(?:="([^"]*)")?\]/gu)) { const value = node.getAttribute(match[1]); if (value === null || (match[2] !== undefined && value !== match[2])) return false; }
      return true;
    });
  }
  function rawEl(tag, attrs = {}, styles = {}) { const node = new El(tag); for (const [k, v] of Object.entries(attrs)) node.__attrs.set(k, String(v)); for (const [k, v] of Object.entries(styles)) node.__styles.set(k, String(v)); return node; }
  function canonicalNodes(width = '24', height = '24') {
    const outer = rawEl('span', { class: 'cgxui-dcpn-rail-nav-btn', 'aria-hidden': 'true' }, { '--cgxui-btn-bg': '#6b7280', '--cgxui-rail-btn-w': `${width}px`, '--cgxui-rail-btn-h': `${height}px` });
    const inner = rawEl('span', { class: 'cgxui-dcpn-rail-nav-txt', 'aria-hidden': 'true' });
    const svg = rawEl('svg', { xmlns: 'http://www.w3.org/2000/svg', width: '14', height: '14', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.9', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' });
    rawAttach(svg, new TextNode('\n  ')); rawAttach(svg, rawEl('path', { d: 'M12 22a10 10 0 1 1 10-10c0 2.2-1.8 4-4 4h-1.5a2.5 2.5 0 0 0 0 5H12z' }));
    for (const attrs of [{ cx: '7.5', cy: '10.5', r: '1' }, { cx: '12', cy: '8', r: '1' }, { cx: '16.5', cy: '10.5', r: '1' }, { cx: '9', cy: '15', r: '1' }]) { rawAttach(svg, new TextNode('\n  ')); rawAttach(svg, rawEl('circle', attrs)); }
    rawAttach(svg, new TextNode('\n')); rawAttach(inner, new TextNode(' ')); rawAttach(inner, svg); rawAttach(inner, new TextNode(' ')); rawAttach(outer, new TextNode('\n ')); rawAttach(outer, inner); rawAttach(outer, new TextNode('\n'));
    return [new TextNode('\n      '), outer, new TextNode('\n    ')];
  }

  const documentElement = rawEl('html'), body = rawEl('body'), nav = rawEl('nav', { 'aria-label': 'Chat history' });
  rawAttach(documentElement, body); rawAttach(body, nav);
  const STATE = { rafTinyRail: 0, tinyRailWrap: null, _tinyRailPosWired: true };
  let scene = null;
  const addRail = ({ owned = true } = {}) => {
    const rail = rawEl('div', { id: 'stage-sidebar-tiny-bar' }); rail.__rect = { top: 0, left: 0, width: 56, height: 600 }; rawAttach(nav, rail);
    const templateWrap = rawEl('div', { 'data-state': 'closed' }), templateBtn = rawEl('a', { class: '__menu-item', 'data-sidebar-item': 'true' }), templateIcon = rawEl('span', { class: 'icon' }); templateIcon.__rect = { top: 20, left: 12, width: 24, height: 24 }; rawAttach(templateBtn, templateIcon); rawAttach(templateWrap, templateBtn); rawAttach(rail, templateWrap);
    const result = { rail, templateWrap, templateBtn, templateIcon };
    if (owned) {
      const wrap = rawEl('div', { 'data-state': 'closed', 'data-cgxui-owner': 'thpn', 'data-h2o-rail-view': 'themes' }, { position: '', zIndex: '', pointerEvents: '', width: '', height: '', left: '', top: '' });
      const btn = rawEl('a', { role: 'button', tabindex: '0', 'data-sidebar-item': 'true', 'aria-label': 'Themes', title: 'Palette / Themes', 'data-cgxui': 'thpn-tinyrailbtn', 'data-cgxui-owner': 'thpn', 'data-owner': 'thpn', 'data-h2o-rail-view': 'themes' }, { cursor: 'pointer' });
      const iconHost = rawEl('span', { class: 'icon' }, { display: 'flex', alignItems: 'center', justifyContent: 'center' }); for (const node of canonicalNodes()) rawAttach(iconHost, node); rawAttach(btn, iconHost); rawAttach(wrap, btn); rawAttach(rail, wrap); STATE.tinyRailWrap = wrap; Object.assign(result, { wrap, btn, iconHost });
    }
    return result;
  };
  scene = addRail();
  const D = { documentElement, body, createElement: (tag) => new El(tag), getElementById: (id) => id === 'stage-sidebar-tiny-bar' ? scene.rail : null, querySelector: (selector) => selector === '#stage-sidebar-tiny-bar' ? scene.rail : (String(selector).includes('nav[') ? nav : null) };
  const W = { requestAnimationFrame(fn) { counts.raf += 1; frames.push(fn); return frames.length; }, cancelAnimationFrame() {}, addEventListener() {}, removeEventListener() {}, visualViewport: { addEventListener() {} } };
  const helpers = ['DOM_TP_tinyRailIconParts', 'DOM_TP_setAttrIfChanged', 'DOM_TP_setStyleIfChanged'].map((name) => extractFunction(name, { optional: true })).filter(Boolean);
  let program = [...helpers, extractFunction('UI_TP_ensureTinyRailButton'), extractFunction('TIME_TP_scheduleEnsureTinyRail'), extractFunction('DOM_TP_ownedAdditionsOnly'), extractFunction('DOM_TP_inTinyRailDomain'), extractFunction('DOM_TP_carriesTinyRailCandidate'), extractFunction('DOM_TP_tinyRailInvalidated')].join('\n');
  program = program.replace(/function UI_TP_ensureTinyRailButton\(\) \{/u, 'function UI_TP_ensureTinyRailButton() { __counts.ensure += 1;');
  const sandbox = { D, W, STATE, document: D, window: W, __counts: counts, requestAnimationFrame: W.requestAnimationFrame.bind(W), UI_TP_activateRailThemesSurface() {}, UI_TP_findTinyRailEl: () => scene.rail, UI_TP_findTinyRailAvatarWrap: () => null, UI_TP_findTinyRailStack: () => scene.rail, DOM_selScoped: () => '[data-cgxui="thpn-tinyrailbtn"][data-cgxui-owner="thpn"]', SkID: 'thpn', ATTR_CGXUI: 'data-cgxui', ATTR_CGXUI_OWNER: 'data-cgxui-owner', ATTR_OWNER: 'data-owner', ATTR_TITLE: 'title', UI_TPANEL_TINY_RAIL: 'thpn-tinyrailbtn', SEL_TINY_RAIL: '#stage-sidebar-tiny-bar', SEL_CHATGPT_SIDEBAR: 'nav[aria-label="Chat history"]', SEL_TINY_RAIL_IMG: 'img', SEL_TINY_RAIL_ICON_HOST: '.icon, .icon-lg', SEL_TINY_RAIL_TEMPLATE_A: 'a[data-sidebar-item="true"]', ATTR_TINY_RAIL_VIEW: 'data-h2o-rail-view', TINY_RAIL_VIEW_THEMES: 'themes', CLS_DOCK_RAIL_NAV_BTN: 'cgxui-dcpn-rail-nav-btn', CLS_DOCK_RAIL_NAV_TXT: 'cgxui-dcpn-rail-nav-txt', CFG_TINY_RAIL_TTL: 'Palette / Themes', CFG_TINY_RAIL_MIN_W: 30, CFG_TINY_RAIL_MIN_H: 200, CFG_TINY_BTN_W: 24, CFG_TINY_BTN_H: 24, UI_TPANEL_SVG_ICON: '<svg></svg>', Array, Object, String, Number, Math, Boolean, Set, Map, JSON, Infinity };
  vm.runInNewContext(program, sandbox, { filename: `${THEMES_PATH}:renderer` });

  const reset = ({ keepFrames = false } = {}) => { for (const key of Object.keys(counts)) counts[key] = 0; records.length = 0; if (!keepFrames) frames.length = 0; };
  const iconOuter = () => scene.iconHost?.children[0] || null;
  const isCanonical = () => { const outer = iconOuter(), inner = outer?.children[0], svg = inner?.children[0]; return !!(outer && outer.className === 'cgxui-dcpn-rail-nav-btn' && inner?.className === 'cgxui-dcpn-rail-nav-txt' && svg?.tagName === 'SVG' && svg.children.length === 5 && svg.children[0]?.getAttribute('d') === 'M12 22a10 10 0 1 1 10-10c0 2.2-1.8 4-4 4h-1.5a2.5 2.5 0 0 0 0 5H12z'); };
  reset();
  return { counts, STATE, get scene() { return scene; }, reset, iconOuter, isCanonical, ensure: () => sandbox.UI_TP_ensureTinyRailButton(), takeRecords: () => records.splice(0), relevant: (batch) => sandbox.DOM_TP_tinyRailInvalidated(batch), schedule: () => sandbox.TIME_TP_scheduleEnsureTinyRail(), flushOneFrame() { frames.shift()?.(); }, flushFrames(limit = 8) { for (let i = 0; i < limit && frames.length; i += 1) this.flushOneFrame(); }, rawClear(node) { for (const child of node.childNodes) child.parentNode = null; node.childNodes.length = 0; }, rawRemove(node) { const parent = node?.parentNode, i = parent?.childNodes.indexOf(node) ?? -1; if (i >= 0) parent.childNodes.splice(i, 1); if (node) node.parentNode = null; }, rawAttr(node, name, value) { node.__attrs.set(String(name), String(value)); }, rawStyle(node, name, value) { node.__styles.set(String(name), String(value)); }, replaceRail() { scene.rail.parentNode?.removeChild(scene.rail); records.length = 0; scene = addRail({ owned: false }); return scene; }, disconnectOwned() { scene.wrap?.parentNode?.removeChild(scene.wrap); records.length = 0; } };
}

fixture('RED renderer A: stable canonical ensure performs no destructive or scalar writes', () => {
  const env = createRendererEnv();
  env.ensure();
  eq({ innerHTML: env.counts.innerHTML, childRemovals: env.counts.childRemovals, childAdditions: env.counts.childAdditions, recreatedElements: env.counts.recreatedElements, attrWrites: env.counts.attrWrites, styleWrites: env.counts.styleWrites },
    { innerHTML: 0, childRemovals: 0, childAdditions: 0, recreatedElements: 0, attrWrites: 0, styleWrites: 0 },
    'canonical connected output is write-free');
});

fixture('RED renderer B: stable ensure emits no observer re-entry cause', () => {
  const env = createRendererEnv();
  env.ensure();
  const output = env.takeRecords();
  const admitted = output.length ? env.relevant(output) : false;
  if (admitted) env.schedule();
  env.flushFrames();
  eq({ childList: output.length, admitted, raf: env.counts.raf, ensures: env.counts.ensure },
    { childList: 0, admitted: false, raf: 0, ensures: 1 },
    'stable output cannot re-arm the existing frame path');
});

fixture('control renderer C1: missing icon children repair once to canonical', () => {
  const env = createRendererEnv(); env.rawClear(env.scene.iconHost); env.reset(); env.ensure();
  eq(env.counts.innerHTML, 1, 'missing icon performs one repair');
  ok(env.isCanonical(), 'missing icon repair is canonical');
});

fixture('control renderer C2: incomplete SVG repairs once to canonical', () => {
  const env = createRendererEnv();
  const svg = env.iconOuter().children[0].children[0]; env.rawRemove(svg.children[4]); env.reset(); env.ensure();
  eq(env.counts.innerHTML, 1, 'incomplete SVG performs one repair');
  ok(env.isCanonical(), 'incomplete SVG repair restores every child');
});

fixture('control renderer C3: stale palette path repairs once to canonical', () => {
  const env = createRendererEnv(); env.iconOuter().children[0].children[0].children[0].__attrs.set('d', 'stale'); env.reset(); env.ensure();
  eq(env.counts.innerHTML, 1, 'stale path performs one repair');
  ok(env.isCanonical(), 'stale path is restored');
});

fixture('control renderer C4: disconnected rail replacement recovers output', () => {
  const env = createRendererEnv(); const replacement = env.replaceRail(); env.reset(); env.ensure();
  ok(env.STATE.tinyRailWrap?.isConnected, 'replacement rail receives a connected wrapper');
  ok(replacement.rail.contains(env.STATE.tinyRailWrap), 'wrapper belongs to current rail');
  const btn = env.STATE.tinyRailWrap.querySelector('[data-cgxui="thpn-tinyrailbtn"][data-cgxui-owner="thpn"]');
  ok(btn?.querySelector('.cgxui-dcpn-rail-nav-btn'), 'replacement rail receives owned canonical button output');
});

fixture('control renderer C5: disconnected wrapper/button recover under live rail', () => {
  const env = createRendererEnv(); env.disconnectOwned(); env.reset(); env.ensure();
  ok(env.STATE.tinyRailWrap?.isConnected, 'wrapper is recreated');
  ok(env.STATE.tinyRailWrap.querySelector('[data-cgxui="thpn-tinyrailbtn"][data-cgxui-owner="thpn"]'), 'button is recreated');
});

fixture('RED renderer B: one repair has one write-free follow-up and drains', () => {
  const env = createRendererEnv(); env.rawClear(env.scene.iconHost); env.reset(); env.ensure();
  const repairRecords = env.takeRecords(); if (env.relevant(repairRecords)) env.schedule();
  env.reset({ keepFrames: true }); env.flushOneFrame();
  const followRecords = env.takeRecords(); const followRelevant = followRecords.length ? env.relevant(followRecords) : false;
  if (followRelevant) env.schedule();
  eq({ followupEnsures: env.counts.ensure, followupInnerHTML: env.counts.innerHTML, followupStructuralWrites: env.counts.childRemovals + env.counts.childAdditions, furtherFrames: env.counts.raf },
    { followupEnsures: 1, followupInnerHTML: 0, followupStructuralWrites: 0, furtherFrames: 0 },
    'repair converges after one write-free observer follow-up');
});

fixture('RED renderer D: width-only change writes only the width variable', () => {
  const env = createRendererEnv(); env.scene.templateIcon.__rect.width = 31; env.reset(); env.ensure();
  eq({ innerHTML: env.counts.innerHTML, childChurn: env.counts.childRemovals + env.counts.childAdditions, attrWrites: env.counts.attrWrites, styleWrites: env.counts.styleWrites, width: env.iconOuter().style.getPropertyValue('--cgxui-rail-btn-w'), height: env.iconOuter().style.getPropertyValue('--cgxui-rail-btn-h') },
    { innerHTML: 0, childChurn: 0, attrWrites: 0, styleWrites: 1, width: '31px', height: '24px' },
    'dimension-only update preserves icon identity');
});

for (const scalar of [
  { name: 'wrapper view', kind: 'attr', node: (env) => env.scene.wrap, key: 'data-h2o-rail-view' },
  { name: 'button view', kind: 'attr', node: (env) => env.scene.btn, key: 'data-h2o-rail-view' },
  { name: 'title', kind: 'attr', node: (env) => env.scene.btn, key: 'title' },
  { name: 'aria-label', kind: 'attr', node: (env) => env.scene.btn, key: 'aria-label' },
  { name: 'cursor', kind: 'style', node: (env) => env.scene.btn, key: 'cursor' },
  { name: 'width variable', kind: 'style', node: (env) => env.iconOuter(), key: '--cgxui-rail-btn-w' },
]) {
  fixture(`RED renderer E: only stale ${scalar.name} is rewritten`, () => {
    const env = createRendererEnv(), node = scalar.node(env);
    if (scalar.kind === 'attr') env.rawAttr(node, scalar.key, 'stale'); else env.rawStyle(node, scalar.key, '99px');
    env.reset(); env.ensure();
    eq({ innerHTML: env.counts.innerHTML, childChurn: env.counts.childRemovals + env.counts.childAdditions, attrWrites: env.counts.attrWrites, styleWrites: env.counts.styleWrites },
      { innerHTML: 0, childChurn: 0, attrWrites: scalar.kind === 'attr' ? 1 : 0, styleWrites: scalar.kind === 'style' ? 1 : 0 },
      `only stale ${scalar.name} is normalized`);
  });
}

fixture('correlation: stable 8A1b output creates no downstream sidebar childList cause', () => {
  const env = createRendererEnv(); env.ensure(); eq(env.takeRecords().length, 0, 'stable ensure produces no childList output under nav');
});

fixture('structure: one tiny-rail observer, records consumed, no new authority', () => {
  ok(WIRING.observesDocumentElement, 'STATE.moTinyRail still observes D.documentElement');
  ok(WIRING.singleTinyRailObserver, 'exactly one tiny-rail MutationObserver is constructed');
  eq(WIRING.observerCount, 2, '8A1b still owns exactly its two observers (tiny rail + native sync)');
  ok(/STATE\.moTinyRail = new MutationObserver\(\s*\(/u.test(SOURCE),
    'the tiny-rail observer callback must take its MutationRecords rather than discard them');
  ok(!/setInterval\s*\(\s*[^)]*EnsureTinyRail/u.test(SOURCE), 'no polling was introduced');
  ok(!/__tinyRail(Rect|Geom)Cache|_guardBottomCache/u.test(SOURCE), 'no cross-pass geometry cache');
  // The guard invariant must not be recomputed inside the row loop.
  const guard = extractFunction('DOM_TP_updateSidebarMoreGuard');
  const calls = (guard.match(/DOM_TP_sidebarTopGuardBottom\(/gu) || []).length;
  atMost(calls, 1, 'the guard bottom is referenced at exactly one site in the pass');
});

fixture('binding: the executed functions are the real 8A1b paths', () => {
  ok(PROGRAM.includes('ATTR_HO_SIDEBAR_MORE_HIDDEN'), 'the extracted guard writes the real attribute');
  ok(PROGRAM.includes('DOM_TP_sidebarTopGuardBottom'), 'the extracted guard uses the real invariant');
  ok(PROGRAM.includes('STATE.moTinyRail'), 'the extracted wiring is the real observer wiring');
  ok(PROGRAM.includes('UI_TP_ensureTinyRailButton'), 'the extracted scheduler targets the real feature pass');
});

fixture('anti-vacuity: the harness really drives the paths it measures', () => {
  const env = createEnv();
  buildSidebar(env, { rows: 3, candidates: 4 });
  env.reset();
  env.sandbox.DOM_TP_updateSidebarMoreGuard();
  atLeast(env.counts.rectRow, 1, 'rows really are measured');
  atLeast(env.counts.writes, 1, 'writes really are recorded');
  eq(env.unsupported.size, 0, `every selector used is supported: ${[...env.unsupported].join(' | ')}`);
});

// ── Report ────────────────────────────────────────────────────────────────
const failed = fixtures.filter((f) => !f.ok);
for (const f of fixtures) {
  console.log(`${f.ok ? 'PASS' : 'FAIL'} ${f.name}`);
  if (!f.ok) console.log(f.error.split('\n').slice(0, 14).map((l) => `       ${l}`).join('\n'));
}
console.log('');
console.log(`Admission predicate present: ${[...present].join(', ') || '(none - base revision)'}`);
console.log(`Fixtures: ${fixtures.length - failed.length}/${fixtures.length}`);
console.log(`Assertions: ${assertions}`);
if (failed.length) {
  console.log('CV-3.49 themes panel tiny-rail and sidebar guard cost FAILED');
  process.exit(1);
}
console.log('CV-3.49 themes panel tiny-rail and sidebar guard cost passed');
