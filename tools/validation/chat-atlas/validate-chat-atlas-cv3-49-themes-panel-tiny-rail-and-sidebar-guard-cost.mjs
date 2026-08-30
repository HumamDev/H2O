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
  if (!f.ok) console.log(f.error.split('\n').slice(0, 6).map((l) => `       ${l}`).join('\n'));
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
