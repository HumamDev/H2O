#!/usr/bin/env node
// CV-3.48 — 9A1b Chat List Decorator: unchanged row-colour must not mutate.
//
// PHASE 1 SCOPE: WRITE SUPPRESSION ONLY.
//
// Gate A (2026-08-16) measured the authoritative Title 9A1b (blob f2da772a) and proved that
// re-decorating a row whose colour-class set already equals exactly its desired colour still
// performs TWO real class-set mutations:
//
//   rowEl.classList.remove("ho-row-gold","ho-row-red","ho-row-blue","ho-row-green")
//        -> the desired class is genuinely removed          == real mutation #1
//   link.classList.remove(...same four...)                  == normally no state change
//   rowEl.classList.add(desiredClass)                       == real mutation #2 (puts it back)
//
// Net colour state change: zero. Observed cost: 54 unchanged rows produced 486 classList
// calls, 108 real mutations and 54 remove-then-readd pairs, identically on every repeated
// pass. Those mutations are what feed the broad cross-module MutationObservers.
//
// DELIBERATELY NOT IN SCOPE — geometry. Gate A measured collectSortableMainRows at 55 gBCR
// for 54 rows and 201 for 200 rows, every element read exactly once (repeat rate 0%), because
// `seen.has(row)` dedupes BEFORE the read. Same-pass geometry retention would reclaim nothing,
// so this gate asserts NOTHING about getBoundingClientRect counts and must never be extended
// to do so without new independent evidence. applyColorPrioritySort, collectSortableMainRows,
// findSortableRowUnit and scheduleColorPrioritySort are out of scope here.
//
// The REAL production applyRowByIndex is extracted by name and executed. Extraction failure is
// a hard error: this gate must never silently fall back to a re-implementation.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.H2O_SRC_DIR
  ? path.resolve(process.env.H2O_SRC_DIR)
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const DECORATOR_PATH = 'src-runtime-base/9A1b.🟫🖥️ Chat List Decorator 🎨🖥️.js';
const SOURCE = fs.readFileSync(path.join(ROOT, DECORATOR_PATH), 'utf8');

const fixtures = [];
let assertions = 0;
const eq = (a, b, m) => { assertions += 1; assert.deepEqual(a, b, m); };
const ok = (v, m) => { assertions += 1; assert.ok(v, m); };
const atLeast = (a, b, m) => { assertions += 1; assert.ok(a >= b, `${m} (got ${a}, required >= ${b})`); };
function fixture(name, run) {
  try { run(); fixtures.push({ name, ok: true }); }
  catch (e) { fixtures.push({ name, ok: false, error: String(e?.stack || e) }); }
}

// ── Real-source extraction ────────────────────────────────────────────────
// 9A1b is a large self-booting module owning storage, sidebar UI, palettes and sorting.
// Executing it whole would need a materially fake environment for systems unrelated to this
// contract, so the one function on the write path is extracted by name and run for real.
function extractFunction(name) {
  const anchor = `\nfunction ${name}(`;
  const start = SOURCE.indexOf(anchor);
  if (start < 0) throw new Error(`TEST_HARNESS_BLOCKED:function-missing:${name}`);
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

const REAL_FN = 'applyRowByIndex';
const PROGRAM = extractFunction(REAL_FN);

// ── Source binding ────────────────────────────────────────────────────────
// The extracted text must be the real write path, not an unrelated same-named helper. These
// anchors describe WHAT the function must still be about, without pinning HOW it decides —
// a correct fix may add a guard, reorder, or early-return, and must not be broken by this gate.
const COLOURS = ['gold', 'red', 'blue', 'green'];
const COLOUR_CLASSES = COLOURS.map((c) => `ho-row-${c}`);
const BINDING = {
  mentionsEveryColourClass: COLOUR_CLASSES.every((c) => PROGRAM.includes(c)),
  usesClassList: /classList\.(add|remove)/.test(PROGRAM),
  usesColorsConfig: /I\.config\.COLORS/.test(PROGRAM),
  resolvesRowContainer: /closest\("\.ho-main-row"\)/.test(PROGRAM),
  hasOwnershipStamp: /dataset\.hoRowColorOwner/.test(PROGRAM),
};

// ── Value-aware instrumented mini-DOM ─────────────────────────────────────
// The contract is about ACTUAL class-set transitions, never about classList call counts.
// Every element records callCount and stateChangeCount separately, with before/after sets.
let SEQ = 0;
function makeEnv() {
  const M = { calls: 0, stateChanges: 0, ops: [] };

  class El {
    constructor(tag = 'div') {
      this.tagName = String(tag).toUpperCase();
      this.__id = ++SEQ;
      this.__cls = new Set();
      this.__attrs = new Map();
      this.childNodes = [];
      this.parentNode = null;
      this.callCount = 0;
      this.stateChangeCount = 0;
      this.__ds = {};
      this.dataset = new Proxy(this.__ds, {
        set: (t, k, v) => { t[k] = String(v); return true; },
        get: (t, k) => t[k],
      });
    }
    get parentElement() { return this.parentNode; }
    __record(op, cls, before, after) {
      this.callCount += 1; M.calls += 1;
      const changed = before !== after;
      if (changed) { this.stateChangeCount += 1; M.stateChanges += 1; }
      M.ops.push({ el: this.__id, op, cls, before, after, changed });
      return changed;
    }
    get classList() {
      const self = this;
      return {
        add: (...cs) => { for (const c of cs) {
          const before = self.__cls.has(c); self.__cls.add(c); self.__record('add', c, before, self.__cls.has(c)); } },
        remove: (...cs) => { for (const c of cs) {
          const before = self.__cls.has(c); self.__cls.delete(c); self.__record('remove', c, before, self.__cls.has(c)); } },
        toggle: (c, f) => { const before = self.__cls.has(c); const want = f === undefined ? !before : !!f;
          want ? self.__cls.add(c) : self.__cls.delete(c); self.__record('toggle', c, before, self.__cls.has(c)); return want; },
        contains: (c) => self.__cls.has(c),
      };
    }
    get className() { return [...this.__cls].join(' '); }
    colourSet() { return COLOUR_CLASSES.filter((c) => this.__cls.has(c)); }
    nonColourSet() { return [...this.__cls].filter((c) => !COLOUR_CLASSES.includes(c)).sort(); }
    setAttribute(n, v) { this.__attrs.set(String(n), String(v)); }
    getAttribute(n) { const v = this.__attrs.get(String(n)); return v === undefined ? null : v; }
    appendChild(n) { n.parentNode = this; this.childNodes.push(n); return n; }
    matches(sel) { return matchSel(this, sel); }
    closest(sel) { let n = this; while (n) { if (n instanceof El && matchSel(n, sel)) return n; n = n.parentNode; } return null; }
    contains(o) { let n = o; while (n) { if (n === this) return true; n = n.parentNode; } return false; }
  }
  class Anchor extends El { constructor() { super('a'); } }

  // Only the selector forms the extracted production code actually uses.
  const unsupported = new Set();
  function matchSel(el, sel) {
    return String(sel).split(',').map((s) => s.trim()).filter(Boolean).some((s) => {
      if (s.startsWith('.')) return el.__cls.has(s.slice(1));
      if (s === 'a[href]') return el.tagName === 'A' && el.__attrs.has('href');
      if (s === 'nav' || s === 'aside') return el.tagName === 'NAV' || el.tagName === 'ASIDE';
      if (s === 'main') return el.tagName === 'MAIN';
      unsupported.add(s);
      return false;
    });
  }

  const sandbox = {
    I: { config: { COLORS: COLOURS.map((name) => ({ name })) } },
    HTMLElement: El,
    console: { log() {}, warn() {}, error() {} },
    Map, Set, Array, Object, String, Number, Boolean, Math, JSON,
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(PROGRAM, sandbox, { filename: DECORATOR_PATH });
  if (typeof sandbox[REAL_FN] !== 'function') throw new Error(`TEST_HARNESS_BLOCKED:not-loaded:${REAL_FN}`);

  return { M, sandbox, El, Anchor, unsupported, apply: sandbox[REAL_FN] };
}

// ── Scene builders ────────────────────────────────────────────────────────
// Rows carry non-colour presentation classes so the Title presentation boundary is observable.
const PRESENTATION = ['ho-has-colorbtn', 'ho-colorbtn', 'ho-heat-hot', 'ho-emoji-title'];

function makeRow(env, { colours = [], separateContainer = true, inNav = false, presentation = true } = {}) {
  const { El, Anchor } = env;
  const scope = new El(inNav ? 'nav' : 'main');
  let rowEl, link;
  if (separateContainer) {
    rowEl = new El('div'); rowEl.classList.add('ho-main-row');
    link = new Anchor(); link.setAttribute('href', '/c/chat-1');
    rowEl.appendChild(link); scope.appendChild(rowEl);
  } else {
    link = new Anchor(); link.setAttribute('href', '/c/chat-1');
    scope.appendChild(link); rowEl = link;           // sidebar shape: rowEl === link
  }
  if (presentation) for (const c of PRESENTATION) link.classList.add(c);
  for (const c of colours) rowEl.classList.add(c);
  // reset counters so only the measured decoration pass is attributed
  for (const el of new Set([rowEl, link])) { el.callCount = 0; el.stateChangeCount = 0; }
  env.M.calls = 0; env.M.stateChanges = 0; env.M.ops = [];
  return { rowEl, link, scope };
}

const idxOf = (name) => COLOURS.indexOf(name);
const transitions = (r) => (r.rowEl === r.link ? r.rowEl.stateChangeCount : r.rowEl.stateChangeCount + r.link.stateChangeCount);
const obs = {};

// ══ PRIMARY RED CONTRACT ═════════════════════════════════════════════════
// 9A1B_UNCHANGED_ROW_COLOUR_MUST_NOT_MUTATE
// A row whose colour-class set already equals EXACTLY the desired single colour class must
// undergo ZERO actual colour-state transitions on rowEl and on link during re-decoration.
for (const colour of COLOURS) {
  fixture(`RED unchanged ${colour}: re-decoration must cause zero colour-state transitions`, () => {
    const env = makeEnv();
    const r = makeRow(env, { colours: [`ho-row-${colour}`] });
    env.apply(r.link, idxOf(colour));
    obs[`unchanged_${colour}`] = { calls: env.M.calls, transitions: transitions(r) };
    eq(r.rowEl.colourSet(), [`ho-row-${colour}`], 'precondition/postcondition: final colour set is exactly the desired class');
    eq(transitions(r), 0,
      `unchanged ${colour} row must perform ZERO actual colour-state transitions (calls may be >0)`);
  });
}

fixture('RED many unchanged rows: 54 already-correct rows must cause zero transitions', () => {
  const env = makeEnv();
  let total = 0;
  const rows = [];
  for (let i = 0; i < 54; i += 1) {
    const r = makeRow(env, { colours: ['ho-row-gold'] });
    env.apply(r.link, idxOf('gold'));
    total += transitions(r);
    rows.push(r);
  }
  obs.many_unchanged = { rows: 54, transitions: total };
  ok(rows.every((r) => r.rowEl.colourSet().join() === 'ho-row-gold'), 'every row still holds exactly the desired class');
  eq(total, 0, '54 already-correct rows must perform ZERO actual colour-state transitions in total');
});

fixture('RED repeated passes: a stable correct row must stay at zero transitions', () => {
  const env = makeEnv();
  const r = makeRow(env, { colours: ['ho-row-blue'] });
  const per = [];
  for (let p = 0; p < 3; p += 1) {
    r.rowEl.stateChangeCount = 0; r.link.stateChangeCount = 0;
    env.apply(r.link, idxOf('blue'));
    per.push(transitions(r));
  }
  obs.repeated_passes = per;
  eq(r.rowEl.colourSet(), ['ho-row-blue'], 'final state stable across passes');
  eq(per, [0, 0, 0], 'three consecutive passes over an unchanged row must each perform zero transitions');
});

fixture('RED one changed row among unchanged rows: only the changed row may transition', () => {
  const env = makeEnv();
  let unchangedTotal = 0;
  for (let i = 0; i < 10; i += 1) {
    const r = makeRow(env, { colours: ['ho-row-red'] });
    env.apply(r.link, idxOf('red'));
    unchangedTotal += transitions(r);
  }
  const changed = makeRow(env, { colours: ['ho-row-red'] });
  env.apply(changed.link, idxOf('green'));
  obs.mixed = { unchangedTotal, changedTransitions: transitions(changed) };
  eq(changed.rowEl.colourSet(), ['ho-row-green'], 'the genuinely changed row ends in exactly the new colour');
  atLeast(transitions(changed), 1, 'the genuinely changed row MUST still transition');
  eq(unchangedTotal, 0, 'the ten unchanged rows must perform zero transitions');
});

// ══ NEGATIVE CONTROLS — must pass on current product ═════════════════════
// These prove the gate cannot be satisfied by disabling decoration.
fixture('control A: genuine colour change A -> B ends in exactly B', () => {
  const env = makeEnv();
  const r = makeRow(env, { colours: ['ho-row-gold'] });
  env.apply(r.link, idxOf('blue'));
  eq(r.rowEl.colourSet(), ['ho-row-blue'], 'A -> B leaves exactly the new colour');
  atLeast(transitions(r), 1, 'a genuine change must actually mutate');
});

fixture('control B: a row with no colour gains exactly the desired colour', () => {
  const env = makeEnv();
  const r = makeRow(env, { colours: [] });
  env.apply(r.link, idxOf('green'));
  eq(r.rowEl.colourSet(), ['ho-row-green'], 'first colour is applied');
  atLeast(transitions(r), 1, 'gaining a colour must actually mutate');
});

fixture('control C: stale extra colour class is normalized to exactly the desired one', () => {
  const env = makeEnv();
  const r = makeRow(env, { colours: ['ho-row-red', 'ho-row-blue'] });   // stale A + desired B
  eq(r.rowEl.colourSet().length, 2, 'precondition: the row really carries two colour classes');
  env.apply(r.link, idxOf('blue'));
  eq(r.rowEl.colourSet(), ['ho-row-blue'], 'a stale second colour class MUST be removed');
  atLeast(transitions(r), 1, 'normalizing a malformed row must actually mutate');
});

fixture('control D: an invalid index removes the colour state', () => {
  const env = makeEnv();
  const r = makeRow(env, { colours: ['ho-row-gold'] });
  env.apply(r.link, -1);
  eq(r.rowEl.colourSet(), [], 'an out-of-range index clears the colour state');
  atLeast(transitions(r), 1, 'losing a colour must actually mutate');
});

fixture('control E: rows added / removed / reordered still decorate correctly', () => {
  const env = makeEnv();
  const added = makeRow(env, { colours: [] });
  env.apply(added.link, idxOf('gold'));
  eq(added.rowEl.colourSet(), ['ho-row-gold'], 'a newly added row receives its colour');
  const removed = makeRow(env, { colours: ['ho-row-gold'] });
  removed.rowEl.parentNode = null;                              // detached
  env.apply(removed.link, idxOf('gold'));
  eq(removed.rowEl.colourSet(), ['ho-row-gold'], 'a detached row keeps a coherent final state');
  const reordered = [makeRow(env, { colours: ['ho-row-blue'] }), makeRow(env, { colours: ['ho-row-red'] })].reverse();
  reordered.forEach((r, i) => env.apply(r.link, idxOf(i === 0 ? 'red' : 'blue')));
  ok(reordered.every((r) => r.rowEl.colourSet().length === 1), 'reordering leaves exactly one colour per row');
});

fixture('control F: empty/no-row state performs no invalid mutation', () => {
  const env = makeEnv();
  const { El, Anchor } = env;
  const scope = new El('main');
  const lone = new Anchor(); lone.setAttribute('href', '/c/none'); scope.appendChild(lone);
  lone.callCount = 0; lone.stateChangeCount = 0;
  env.apply(lone, -1);
  eq(lone.colourSet(), [], 'a colourless lone link stays colourless');
  eq(lone.stateChangeCount, 0, 'no spurious mutation on an already-empty colour state');
});

// ══ TITLE PRESENTATION BOUNDARY ══════════════════════════════════════════
// These assert the final-state contract Title's +99 lines depend on. They do not execute the
// heat/emoji subsystems; they prove row-colour work neither disturbs their classes nor breaks
// the final ho-row-* class those selectors match on.
fixture('control G: heat presentation classes are untouched by row-colour work', () => {
  const env = makeEnv();
  const r = makeRow(env, { colours: ['ho-row-gold'] });
  const before = r.link.nonColourSet();
  env.apply(r.link, idxOf('gold'));
  eq(r.link.nonColourSet(), before, 'ho-colorbtn / ho-heat-hot classes survive re-decoration unchanged');
  ok(before.includes('ho-heat-hot') && before.includes('ho-colorbtn'),
    'precondition: the heat presentation classes were actually present');
});

fixture('control H: emoji presentation classes are untouched by row-colour work', () => {
  const env = makeEnv();
  const r = makeRow(env, { colours: ['ho-row-red'] });
  env.apply(r.link, idxOf('red'));
  ok(r.link.nonColourSet().includes('ho-emoji-title'), 'emoji presentation class survives re-decoration');
});

fixture('control I: row-green presentation selector still matches after decoration', () => {
  const env = makeEnv();
  const r = makeRow(env, { colours: ['ho-row-green'], separateContainer: false });
  env.apply(r.link, idxOf('green'));
  ok(r.link.matches('.ho-has-colorbtn') && r.link.classList.contains('ho-row-green'),
    'a.ho-has-colorbtn.ho-row-green still matches on the final class state');
});

fixture('control J: meta-mirror-triggered re-decoration keeps the same contract', () => {
  const env = makeEnv();
  const stable = makeRow(env, { colours: ['ho-row-blue'] });
  env.apply(stable.link, idxOf('blue'));                    // simulates the meta-mirror re-decoration path
  obs.meta_mirror_unchanged = transitions(stable);
  eq(transitions(stable), 0, 'a meta-mirror re-decoration of an unchanged row must perform zero transitions');
  const drifted = makeRow(env, { colours: ['ho-row-blue'] });
  env.apply(drifted.link, idxOf('gold'));
  eq(drifted.rowEl.colourSet(), ['ho-row-gold'], 'a meta-mirror re-decoration of a drifted row still corrects it');
});

// ══ OWNERSHIP STAMP — must survive any colour suppression ════════════════
fixture('control K: nav/aside ownership dataset stamp is preserved when colour work is skipped', () => {
  const env = makeEnv();
  const r = makeRow(env, { colours: ['ho-row-gold'], inNav: true, separateContainer: false });
  ok(r.link.closest('nav') && !r.link.closest('main'), 'precondition: the ownership-stamp branch applies');
  env.apply(r.link, idxOf('gold'));
  obs.ownership = { owner: r.link.dataset.hoRowColorOwner, transitions: transitions(r) };
  eq(r.link.dataset.hoRowColorOwner, '9A1b',
    'the ownership stamp MUST still be established even when colour mutation is suppressed');
  eq(r.rowEl.colourSet(), ['ho-row-gold'], 'final colour state unchanged and correct');
});

fixture('control L: rowEl === link (sidebar shape) obeys the unchanged contract', () => {
  const env = makeEnv();
  const r = makeRow(env, { colours: ['ho-row-green'], separateContainer: false });
  ok(r.rowEl === r.link, 'precondition: this shape really has rowEl === link');
  env.apply(r.link, idxOf('green'));
  obs.rowel_equals_link = transitions(r);
  eq(r.rowEl.colourSet(), ['ho-row-green'], 'final colour state correct when rowEl === link');
  eq(transitions(r), 0, 'unchanged row must perform zero transitions even when rowEl === link');
});

// ══ SOURCE BINDING / ANTI-VACUITY ════════════════════════════════════════
fixture('binding: the executed function is the real 9A1b row-colour write path', () => {
  ok(BINDING.mentionsEveryColourClass, 'extracted source names all four ho-row-* colour classes');
  ok(BINDING.usesClassList, 'extracted source performs classList writes');
  ok(BINDING.usesColorsConfig, 'extracted source resolves the colour from I.config.COLORS');
  ok(BINDING.resolvesRowContainer, 'extracted source resolves the .ho-main-row container');
  ok(BINDING.hasOwnershipStamp, 'extracted source carries the hoRowColorOwner ownership stamp');
});

fixture('anti-vacuity: the harness really drives decoration and really records transitions', () => {
  // Version-agnostic differential control: on an input BOTH the current and any fixed product
  // must mutate, the identical harness must observe real transitions and a correct final state.
  const env = makeEnv();
  const r = makeRow(env, { colours: [] });
  env.apply(r.link, idxOf('gold'));
  atLeast(env.M.calls, 1, 'the harness observed real classList calls');
  atLeast(env.M.stateChanges, 1, 'the harness observed real class-set state changes');
  eq(r.rowEl.colourSet(), ['ho-row-gold'], 'and the decoration actually took effect');
  ok(env.M.ops.some((o) => o.op === 'add' && o.changed), 'a genuine add was recorded with before/after evidence');
  eq(env.unsupported.size, 0, `every selector used by the product was understood: ${[...env.unsupported].join(' | ')}`);
});


// ══════════════════════════════════════════════════════════════════════════
// PHASE 2 — SCAN ADMISSION AND INTRA-PASS READ/WRITE ORDER
//
// Two further contracts on the same module, both about work spent without
// changing anything. Neither touches the Phase-1 write-suppression contract
// above, the 15-second recovery interval, or the coalescing architecture.
//
// B. SCAN ADMISSION
//    hoScanObserver is wired as `new MutationObserver(() => hoRequestScan('dom'))`
//    on document.body {childList,subtree}: the records are discarded, so every
//    body mutation anywhere marks the list dirty and schedules a full pass. A
//    mutation outside the chat-list/sidebar domain must request nothing.
//
// D. INTRA-PASS READ/WRITE ORDER
//    collectSortableMainRows reads a rect and a computed style per row and then
//    writes dataset.hoColorPriorityOrder on the row's sortable unit, so the next
//    row is measured against a tree the previous write just dirtied. Every read
//    the pass needs must happen before any write the pass owns; the returned
//    grouping and ordering must be identical.

const ADMISSION_FN = 'hoMutationsAffectChatList';   // absent on the base revision
const admissionPresent = SOURCE.includes(`\nfunction ${ADMISSION_FN}(`);

// ── Rows / admission environment ──────────────────────────────────────────
// A second sandbox, independent of the Phase-1 one: it executes the REAL
// collectSortableMainRows, findSortableRowUnit and scan wiring against an
// instrumented DOM that records every forced read and every dataset write in
// one ordered log.
function makeRowsEnv() {
  const log = [];
  const counts = { rect: 0, style: 0, dsWrites: 0, domRequests: 0, otherRequests: 0 };
  let SEQ2 = 0;

  class RowEl {
    constructor(tag = 'div') {
      this.tagName = String(tag).toUpperCase();
      this.nodeType = 1;
      this.__id = ++SEQ2;
      this.__attrs = new Map();
      this.__cls = new Set();
      this.children = [];
      this.parentNode = null;
      this.__rect = { top: 500, left: 0, width: 240, height: 40 };
      this.__display = 'block';
      const self = this;
      this.__ds = {};
      this.dataset = new Proxy(this.__ds, {
        set: (t, k, v) => { counts.dsWrites += 1; log.push({ kind: 'write', what: `dataset.${String(k)}`, id: self.__id }); t[k] = String(v); return true; },
        get: (t, k) => t[k],
      });
    }
    get parentElement() { return this.parentNode; }
    appendChild(n) { n.parentNode = this; this.children.push(n); return n; }
    get classList() { const self = this; return { add: (c) => self.__cls.add(c), remove: (c) => self.__cls.delete(c), contains: (c) => self.__cls.has(c) }; }
    setAttribute(n, v) { this.__attrs.set(String(n), String(v)); }
    getAttribute(n) { const v = this.__attrs.get(String(n)); return v === undefined ? null : v; }
    __desc(out = []) { for (const c of this.children) { out.push(c); c.__desc(out); } return out; }
    matches(sel) { return matchRowSel(this, sel); }
    closest(sel) { let n = this; while (n) { if (n instanceof RowEl && matchRowSel(n, sel)) return n; n = n.parentNode; } return null; }
    contains(o) { let n = o; while (n) { if (n === this) return true; n = n.parentNode; } return false; }
    querySelector(sel) { return this.__desc().find((e) => matchRowSel(e, sel)) || null; }
    querySelectorAll(sel) { return this.__desc().filter((e) => matchRowSel(e, sel)); }
    getBoundingClientRect() {
      counts.rect += 1; log.push({ kind: 'read', what: 'rect', id: this.__id });
      const r = this.__rect;
      return { top: r.top, left: r.left, width: r.width, height: r.height, bottom: r.top + r.height, right: r.left + r.width };
    }
  }
  class RowAnchor extends RowEl { constructor() { super('a'); } }

  const rowUnsupported = new Set();
  function matchRowSel(el, sel) {
    return String(sel).split(',').map((x) => x.trim()).filter(Boolean).some((s) => {
      if (s === 'main') return el.tagName === 'MAIN';
      if (s === 'nav') return el.tagName === 'NAV';
      if (s === 'aside') return el.tagName === 'ASIDE';
      if (s.startsWith('.')) return el.__cls.has(s.slice(1));
      if (s === 'main a[href*="/c/"]') return el.tagName === 'A' && String(el.getAttribute('href') || '').includes('/c/') && !!el.closest('main');
      if (s === 'main a[href*="/chat/"]') return el.tagName === 'A' && String(el.getAttribute('href') || '').includes('/chat/') && !!el.closest('main');
      if (s === 'a[href]') return el.tagName === 'A' && el.__attrs.has('href');
      if (s === 'a[href*="/c/"]') return el.tagName === 'A' && String(el.getAttribute('href') || '').includes('/c/');
      if (s === 'a[href*="/chat/"]') return el.tagName === 'A' && String(el.getAttribute('href') || '').includes('/chat/');
      rowUnsupported.add(s);
      return false;
    });
  }

  const documentElement = new RowEl('html');
  const body = new RowEl('body');
  documentElement.appendChild(body);

  const doc = {
    documentElement, body,
    querySelector: (s) => documentElement.querySelector(s),
    querySelectorAll: (s) => documentElement.querySelectorAll(s),
  };

  const observers = [];
  const timers = [];
  const sandbox = {
    document: doc,
    window: { getComputedStyle: (el) => { counts.style += 1; log.push({ kind: 'read', what: 'style', id: el?.__id }); return { display: el?.__display || 'block' }; } },
    HTMLElement: RowEl, HTMLAnchorElement: RowAnchor,
    I: { nav: { getChatIdFromHref: (h) => (String(h).match(/\/(?:c|chat)\/([\w-]+)/) || [])[1] || '' }, utils: {} },
    // Not needed by these scenes: the host is provided explicitly, so this must
    // never be reached. It records the call so a silent fallback cannot hide.
    findProjectTabsHost: () => { counts.hostFallback = (counts.hostFallback || 0) + 1; return null; },
    // Not a read source in these scenes; the unit resolves at <main>.
    childContainsSortableChat: () => false,
    hoColorPriorityOrderCounter: 0,
    // Scan wiring state and the admission counter.
    hoScanActive: false, hoScanObserver: null, hoScanRecoveryId: 0, hoScanSettleIds: [],
    HO_SCAN_RECOVERY_MS: 15000,
    HO_WORK_CHAT_LIST_RECONCILE: 1, HO_WORK_CONTROL_HOST_RECOVERY: 2, HO_WORK_COLOR_SORT: 4, HO_WORK_ALL: 7,
    hoRequestScan: (reason) => { if (reason === 'dom') counts.domRequests += 1; else counts.otherRequests += 1; },
    setInterval: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    clearInterval: () => {}, setTimeout: (fn) => { timers.push({ fn, ms: 0 }); return timers.length; }, clearTimeout: () => {},
    MutationObserver: class { constructor(cb) { this.cb = cb; this.on = false; observers.push(this); } observe() { this.on = true; } disconnect() { this.on = false; } takeRecords() { return []; } },
    console: { log() {}, warn() {}, error() {}, debug() {}, info() {} },
    Map, Set, Array, Object, String, Number, Boolean, Math, JSON, Proxy, Infinity, isNaN, parseInt,
  };
  sandbox.globalThis = sandbox;

  const wanted = ['findSortableRowUnit', 'collectSortableMainRows', 'hoActivateScanLayer'];
  if (admissionPresent) wanted.push(ADMISSION_FN);
  if (SOURCE.includes('\nfunction hoClassifyAdmittedScanWork(')) wanted.push('hoClassifyAdmittedScanWork');
  const program = wanted.map((n) => extractFunction(n)).join('\n\n');
  vm.runInNewContext(program, sandbox, { filename: DECORATOR_PATH });
  for (const n of wanted) {
    if (typeof sandbox[n] !== 'function') throw new Error(`TEST_HARNESS_BLOCKED:not-loaded:${n}`);
  }

  return {
    sandbox, log, counts, doc, body, observers, RowEl, rowUnsupported,
    el(tag, { cls, attrs, rect, display } = {}) {
      const e = tag === 'a' ? new RowAnchor() : new RowEl(tag);
      if (cls) for (const c of String(cls).split(/\s+/).filter(Boolean)) e.__cls.add(c);
      if (attrs) for (const [k, v] of Object.entries(attrs)) e.__attrs.set(k, String(v));
      if (rect) e.__rect = { ...e.__rect, ...rect };
      if (display) e.__display = display;
      return e;
    },
    reset() { log.length = 0; for (const k of Object.keys(counts)) counts[k] = 0; },
    deliver(records) { for (const o of observers) if (o.on) o.cb(records, o); },
    rec(target, { added = [], removed = [] } = {}) { return { type: 'childList', target, addedNodes: added, removedNodes: removed }; },
    readsAfterFirstWrite() {
      const w = log.findIndex((e) => e.kind === 'write');
      return w < 0 ? 0 : log.slice(w).filter((e) => e.kind === 'read').length;
    },
  };
}

// A main chat list: the project-tabs host plus N rows, each holding a chat link.
function buildChatList(env, { rows = 8 } = {}) {
  const main = env.el('main');
  const host = env.el('div', { cls: 'ho-project-tabs-host', rect: { top: 0, left: 0, width: 600, height: 40 } });
  main.appendChild(host);
  const built = [];
  for (let i = 0; i < rows; i += 1) {
    const row = env.el('div', { cls: 'ho-main-row', rect: { top: 100 + i * 44, left: 0, width: 600, height: 40 } });
    const link = env.el('a', { attrs: { href: `/c/chat-${i}` } });
    row.appendChild(link);
    main.appendChild(row);
    built.push({ row, link });
  }
  env.body.appendChild(main);
  return { main, host, rows: built };
}

function buildSidebarFor(env) {
  const nav = env.el('nav');
  env.body.appendChild(nav);
  return nav;
}

function activateScan(env) {
  env.sandbox.hoActivateScanLayer();
  env.reset();
}

// ══ RED B — scan admission ════════════════════════════════════════════════

fixture('RED B: a body mutation outside the chat-list domain must not request a scan', () => {
  const env = makeRowsEnv();
  buildChatList(env, { rows: 4 });
  buildSidebarFor(env);
  activateScan(env);

  const footer = env.el('footer');
  env.body.appendChild(footer);
  const node = env.el('div');
  footer.appendChild(node);
  env.deliver([env.rec(footer, { added: [node] })]);

  assertions += 1;
  assert.equal(env.counts.domRequests, 0, 'an irrelevant body mutation must request no scan');
});

fixture('RED B: many irrelevant body mutations stay free', () => {
  const env = makeRowsEnv();
  buildChatList(env, { rows: 4 });
  activateScan(env);
  const footer = env.el('footer');
  env.body.appendChild(footer);

  for (let i = 0; i < 25; i += 1) {
    const n = env.el('span');
    footer.appendChild(n);
    env.deliver([env.rec(footer, { added: [n] })]);
  }
  assertions += 1;
  assert.equal(env.counts.domRequests, 0, '25 irrelevant batches must request nothing');
});

fixture('control: a structural change inside main still requests a scan', () => {
  const env = makeRowsEnv();
  const scene = buildChatList(env, { rows: 4 });
  activateScan(env);

  const row = env.el('div', { cls: 'ho-main-row' });
  row.appendChild(env.el('a', { attrs: { href: '/c/new-one' } }));
  scene.main.appendChild(row);
  env.deliver([env.rec(scene.main, { added: [row] })]);

  assertions += 1;
  assert.ok(env.counts.domRequests >= 1, 'a new chat row is relevant');
});

fixture('control: a structural change inside the sidebar still requests a scan', () => {
  const env = makeRowsEnv();
  buildChatList(env, { rows: 4 });
  const nav = buildSidebarFor(env);
  activateScan(env);

  const item = env.el('div');
  nav.appendChild(item);
  env.deliver([env.rec(nav, { added: [item] })]);

  assertions += 1;
  assert.ok(env.counts.domRequests >= 1, 'a sidebar structural change is relevant');
});

fixture('control: removing a chat row still requests a scan', () => {
  const env = makeRowsEnv();
  const scene = buildChatList(env, { rows: 4 });
  activateScan(env);

  const victim = scene.rows[1].row;
  env.deliver([env.rec(scene.main, { removed: [victim] })]);

  assertions += 1;
  assert.ok(env.counts.domRequests >= 1, 'a removed chat row is relevant');
});

fixture('control: a mixed batch is relevant even when the relevant record is last', () => {
  const env = makeRowsEnv();
  const scene = buildChatList(env, { rows: 4 });
  activateScan(env);

  const footer = env.el('footer');
  env.body.appendChild(footer);
  const noise = env.el('div');
  footer.appendChild(noise);
  const row = env.el('div', { cls: 'ho-main-row' });
  row.appendChild(env.el('a', { attrs: { href: '/c/late' } }));
  scene.main.appendChild(row);

  env.deliver([env.rec(footer, { added: [noise] }), env.rec(scene.main, { added: [row] })]);
  assertions += 1;
  assert.ok(env.counts.domRequests >= 1, 'a batch stays relevant through its relevant record');
});

fixture('control: the 15-second recovery interval is untouched', () => {
  assertions += 1;
  assert.ok(/const HO_SCAN_RECOVERY_MS = 15000;/.test(SOURCE), 'the recovery interval value is unchanged');
  assertions += 1;
  assert.equal((SOURCE.match(/new MutationObserver\(/gu) || []).length, 1,
    '9A1b still owns exactly one MutationObserver');
});

// ══ RED D — reads before dataset writes ═══════════════════════════════════

fixture('RED D: every read of a collect pass happens before any write of that pass', () => {
  const env = makeRowsEnv();
  buildChatList(env, { rows: 8 });
  env.reset();

  const groups = env.sandbox.collectSortableMainRows();
  assertions += 1;
  assert.ok(groups.size >= 1, 'the pass really grouped rows');
  assertions += 1;
  assert.ok(env.counts.dsWrites >= 1, 'the pass really wrote order data');
  assertions += 1;
  assert.equal(env.readsAfterFirstWrite(), 0, 'no forced read may follow the first dataset write of the pass');
});

fixture('control: collect keeps its grouping, ordering and read-once property', () => {
  const env = makeRowsEnv();
  const scene = buildChatList(env, { rows: 6 });
  env.reset();
  const groups = env.sandbox.collectSortableMainRows();

  const entries = [...groups.values()].flat();
  assertions += 1;
  assert.equal(entries.length, 6, 'every eligible row is collected exactly once');
  assertions += 1;
  assert.deepEqual(entries.map((e) => e.row), scene.rows.map((r) => r.row), 'document order is preserved');
  const orders = entries.map((e) => Number(e.unit.dataset.hoColorPriorityOrder));
  assertions += 1;
  assert.deepEqual(orders, [...orders].sort((a, b) => a - b), 'order stamps ascend in document order');
  assertions += 1;
  assert.equal(env.counts.rect, 7, 'one host rect plus one rect per row - no row is measured twice');
});

fixture('control: an invisible row is still excluded', () => {
  const env = makeRowsEnv();
  const scene = buildChatList(env, { rows: 4 });
  scene.rows[2].row.__display = 'none';
  const groups = env.sandbox.collectSortableMainRows();
  const entries = [...groups.values()].flat();
  assertions += 1;
  assert.equal(entries.length, 3, 'a display:none row is filtered out as before');
});

fixture('control: a zero-size row is still excluded', () => {
  const env = makeRowsEnv();
  const scene = buildChatList(env, { rows: 4 });
  scene.rows[1].row.__rect = { top: 200, left: 0, width: 0, height: 0 };
  const groups = env.sandbox.collectSortableMainRows();
  const entries = [...groups.values()].flat();
  assertions += 1;
  assert.equal(entries.length, 3, 'a zero-size row is filtered out as before');
});

fixture('control: a row above the project-tabs host is still excluded', () => {
  const env = makeRowsEnv();
  const scene = buildChatList(env, { rows: 4 });
  scene.rows[0].row.__rect = { top: -50, left: 0, width: 600, height: 40 };
  const groups = env.sandbox.collectSortableMainRows();
  const entries = [...groups.values()].flat();
  assertions += 1;
  assert.equal(entries.length, 3, 'a row above the host bottom is filtered out as before');
});

fixture('control: nothing is retained across collect passes', () => {
  const env = makeRowsEnv();
  buildChatList(env, { rows: 5 });
  env.sandbox.collectSortableMainRows();
  env.reset();
  env.sandbox.collectSortableMainRows();
  assertions += 1;
  assert.equal(env.counts.rect, 6, 'the second pass re-measures the host and every row');
});

fixture('binding: the executed functions are the real 9A1b scan and collect paths', () => {
  const collect = extractFunction('collectSortableMainRows');
  assertions += 1;
  assert.ok(/hoColorPriorityOrder/.test(collect), 'collect still stamps the order dataset key');
  assertions += 1;
  assert.ok(/getBoundingClientRect|getComputedStyle/.test(collect), 'collect still performs the real reads');
  const activate = extractFunction('hoActivateScanLayer');
  assertions += 1;
  assert.ok(/new MutationObserver\(/.test(activate), 'the extracted wiring is the real body observer wiring');
  assertions += 1;
  assert.ok(/document\.body/.test(activate), 'and it still observes document.body');
});

fixture('anti-vacuity: the rows harness really drives what it measures', () => {
  const env = makeRowsEnv();
  buildChatList(env, { rows: 3 });
  env.reset();
  env.sandbox.collectSortableMainRows();
  assertions += 1;
  assert.ok(env.counts.rect >= 1 && env.counts.style >= 1, 'real reads were recorded');
  assertions += 1;
  assert.equal(env.counts.hostFallback || 0, 0, 'the explicit host was used, no silent fallback');
  assertions += 1;
  assert.equal(env.rowUnsupported.size, 0, `every selector used is supported: ${[...env.rowUnsupported].join(' | ')}`);
});

// ══════════════════════════════════════════════════════════════════════════
// RECURRENT PHASE — project-host/control discovery and scan→sort topology.
// Real production functions from updateColorPriorityControl through
// scheduleColorPrioritySort, plus scanSidebar and the scan queue, execute in a
// deterministic structural DOM. The harness counts broad discovery, control
// writes, exact-node reads and queue consumption; collectSortableMainRows is
// executed unchanged with an empty row set so its call/order boundary remains
// observable without duplicating the row fixtures above.

function makeRecurrentEnv({ control = true, stampedHost = true, twoCandidates = false } = {}) {
  let seq = 0;
  let rafSeq = 0;
  let timerSeq = 0;
  const frames = new Map();
  const timers = new Map();
  const M2 = {
    scan: 0, sort: 0, collect: 0, find: 0, ensure: 0, update: 0, create: 0, remove: 0,
    writeCalls: 0, stateChanges: 0, trace: [],
    rectById: new Map(), styleById: new Map(), textById: new Map(),
  };

  const write = (el, what, before, after) => {
    M2.writeCalls += 1;
    if (before !== after) M2.stateChanges += 1;
    M2.trace.push({ kind: 'write', what, id: el.__id, before, after });
  };

  class El {
    constructor(tag = 'div') {
      this.tagName = String(tag).toUpperCase();
      this.nodeType = 1;
      this.__id = ++seq;
      this.__cls = new Set();
      this.__attrs = new Map();
      this.__text = '';
      this.__title = '';
      this.__rect = { top: 0, left: 0, width: 300, height: 40 };
      this.children = [];
      this.parentNode = null;
      const self = this;
      this.__ds = {};
      this.dataset = new Proxy(this.__ds, {
        get: (t, k) => t[k],
        set: (t, k, v) => { const next = String(v); const before = t[k]; t[k] = next; write(self, `dataset.${String(k)}`, before, next); return true; },
      });
      this.__style = new Map();
      this.style = {
        setProperty(name, value) { const key = String(name); const next = String(value); const before = self.__style.get(key) || ''; self.__style.set(key, next); write(self, `style.${key}`, before, next); },
        removeProperty(name) { const key = String(name); const before = self.__style.get(key) || ''; self.__style.delete(key); write(self, `style.${key}`, before, ''); },
        getPropertyValue(name) { return self.__style.get(String(name)) || ''; },
      };
    }
    get parentElement() { return this.parentNode; }
    get isConnected() { let n = this; while (n) { if (n === documentElement) return true; n = n.parentNode; } return false; }
    get className() { return [...this.__cls].join(' '); }
    set className(value) { const before = this.className; this.__cls = new Set(String(value).split(/\s+/).filter(Boolean)); write(this, 'className', before, this.className); }
    get title() { return this.__title; }
    set title(value) { const next = String(value); const before = this.__title; this.__title = next; write(this, 'title', before, next); }
    get textContent() { return this.__text; }
    set textContent(value) { const next = String(value); const before = this.__text; this.__text = next; write(this, 'textContent', before, next); }
    get classList() {
      const self = this;
      return {
        contains: (c) => self.__cls.has(c),
        add: (...cs) => { for (const c of cs) { const before = self.__cls.has(c); self.__cls.add(c); write(self, `class.${c}`, before, true); } },
        remove: (...cs) => { for (const c of cs) { const before = self.__cls.has(c); self.__cls.delete(c); write(self, `class.${c}`, before, false); } },
        toggle: (c, force) => { const before = self.__cls.has(c); const next = force === undefined ? !before : !!force; next ? self.__cls.add(c) : self.__cls.delete(c); write(self, `class.${c}`, before, next); return next; },
      };
    }
    setAttribute(name, value) { const key = String(name); const next = String(value); const before = this.__attrs.get(key); this.__attrs.set(key, next); write(this, `attr.${key}`, before, next); }
    getAttribute(name) { const value = this.__attrs.get(String(name)); return value === undefined ? null : value; }
    hasAttribute(name) { return this.__attrs.has(String(name)); }
    appendChild(node) { if (node.parentNode) node.parentNode.removeChild(node); node.parentNode = this; this.children.push(node); write(this, 'appendChild', false, true); return node; }
    removeChild(node) { const i = this.children.indexOf(node); if (i >= 0) { this.children.splice(i, 1); node.parentNode = null; M2.remove += 1; write(this, 'removeChild', true, false); } return node; }
    remove() { this.parentNode?.removeChild(this); }
    insertBefore(node, before) { if (node.parentNode) node.parentNode.removeChild(node); const i = this.children.indexOf(before); node.parentNode = this; this.children.splice(i < 0 ? this.children.length : i, 0, node); write(this, 'insertBefore', false, true); return node; }
    addEventListener() {}
    removeEventListener() {}
    __desc(out = []) { for (const child of this.children) { out.push(child); child.__desc(out); } return out; }
    contains(node) { let cur = node; while (cur) { if (cur === this) return true; cur = cur.parentNode; } return false; }
    matches(selector) { return match(this, selector); }
    closest(selector) { let cur = this; while (cur) { if (match(cur, selector)) return cur; cur = cur.parentNode; } return null; }
    querySelector(selector) { return this.__desc().find((node) => match(node, selector)) || null; }
    querySelectorAll(selector) { return this.__desc().filter((node) => match(node, selector)); }
    getBoundingClientRect() {
      M2.rectById.set(this.__id, (M2.rectById.get(this.__id) || 0) + 1);
      M2.trace.push({ kind: 'read', what: 'rect', id: this.__id });
      const r = this.__rect;
      return { ...r, right: r.left + r.width, bottom: r.top + r.height };
    }
  }

  const split = (selector) => String(selector).split(',').map((part) => part.trim()).filter(Boolean);
  function match(el, selector) {
    return split(selector).some((s) => {
      if (s === 'main') return el.tagName === 'MAIN';
      if (s === 'div') return el.tagName === 'DIV';
      if (s === 'nav') return el.tagName === 'NAV';
      if (s === '[role="tablist"]') return el.getAttribute('role') === 'tablist';
      if (s.startsWith('.')) return el.__cls.has(s.slice(1));
      if (s === 'a[href]') return el.tagName === 'A' && el.hasAttribute('href');
      if (s === 'main a[href*="/c/"]') return el.tagName === 'A' && String(el.getAttribute('href') || '').includes('/c/') && !!el.closest('main');
      if (s === 'main a[href*="/chat/"]') return el.tagName === 'A' && String(el.getAttribute('href') || '').includes('/chat/') && !!el.closest('main');
      return false;
    });
  }

  const documentElement = new El('html');
  const body = new El('body');
  documentElement.appendChild(body);
  const main = new El('main');
  main.__rect = { top: 80, left: 0, width: 700, height: 800 };
  body.appendChild(main);
  const host = new El('div');
  host.__rect = { top: 100, left: 0, width: 690, height: 58 };
  host.__text = 'Chats Sources';
  if (stampedHost) host.__cls.add('ho-project-tabs-host');
  main.appendChild(host);
  if (twoCandidates) {
    const shared = new El('section');
    shared.__rect = { top: 170, left: 0, width: 660, height: 82 };
    main.appendChild(shared);
    for (let i = 0; i < 2; i += 1) {
      const candidate = new El('div');
      candidate.__rect = { top: 175 + i * 30, left: 4, width: 640, height: 28 };
      candidate.__text = 'Chats Sources';
      shared.appendChild(candidate);
    }
  }

  function buildControl(parent = host) {
    const root = new El('div'); root.__cls.add('ho-color-priority'); root.__attrs.set('data-ho-color-priority', '1'); root.__ds.color = 'all';
    const trigger = new El('button'); trigger.__cls.add('ho-color-priority-trigger'); trigger.__ds.active = 'false';
    trigger.__attrs.set('aria-haspopup', 'menu'); trigger.__attrs.set('aria-expanded', 'false');
    trigger.__attrs.set('aria-label', 'Choose a chat color to bring to the top'); trigger.__title = 'Bring chats with a selected color to the top';
    const swatch = new El('span'); swatch.__cls.add('ho-color-priority-swatch'); trigger.appendChild(swatch);
    const menu = new El('div'); menu.__cls.add('ho-color-priority-menu'); menu.__attrs.set('role', 'menu');
    for (const color of ['all', 'gold', 'red', 'blue', 'green']) {
      const option = new El('button'); option.__cls.add('ho-color-priority-option'); option.__ds.color = color; option.__ds.active = color === 'all' ? 'true' : 'false'; menu.appendChild(option);
    }
    root.appendChild(trigger); root.appendChild(menu); parent.appendChild(root); return root;
  }
  let controlNode = control ? buildControl() : null;

  const doc = {
    documentElement, body,
    querySelector: (selector) => match(documentElement, selector) ? documentElement : documentElement.querySelector(selector),
    querySelectorAll: (selector) => documentElement.querySelectorAll(selector),
    contains: (node) => documentElement.contains(node),
    createElement: (tag) => new El(tag),
    createTextNode: () => new El('#text'),
  };

  const sandbox = {
    document: doc,
    window: null,
    location: { pathname: '/c/recurrent', origin: 'https://chatgpt.com' },
    HTMLElement: El, HTMLAnchorElement: El,
    I: {
      config: { COLORS: ['gold', 'red', 'blue', 'green'].map((name) => ({ name, value: name })) },
      utils: { isInsideH2OInternalSurface: () => false },
      nav: { getChatIdFromHref: () => '' }, store: { getRow: () => -1 }, heat: { applyToBtn() {} },
      lock: { locked: () => false, with: (fn) => fn() },
    },
    COLOR_PRIORITY_NONE: 'all',
    hoSurfaceEligible: () => true,
    normalizePriorityColor: (value) => ['gold', 'red', 'blue', 'green'].includes(String(value)) ? String(value) : 'all',
    getPriorityColor: () => 'all',
    getPriorityColorDef: (name) => ({ name, value: name }),
    closeAllPalettes() {}, closeColorPriorityMenus() {}, setPriorityColor: (value) => value,
    hoOpenPalette: null,
    HO_WORK_CHAT_LIST_RECONCILE: 1, HO_WORK_CONTROL_HOST_RECOVERY: 2, HO_WORK_COLOR_SORT: 4, HO_WORK_ALL: 7,
    applyActivityStyle() {}, decorateLink() {}, markSidebarProjects() {}, markSeeControls() {}, markActiveSidebarLink() {},
    hoColorPriorityRAF: 0, hoColorPriorityTO: 0, hoColorPriorityOrderCounter: 0,
    hoColorPriorityRecoverySatisfied: false,
    hoColorPriorityControlWasValid: false,
    requestAnimationFrame(fn) { const id = ++rafSeq; frames.set(id, fn); return id; },
    cancelAnimationFrame(id) { frames.delete(id); },
    setTimeout(fn, ms) { const id = ++timerSeq; timers.set(id, { fn, ms }); return id; },
    clearTimeout(id) { timers.delete(id); },
    setInterval() { return 1; }, clearInterval() {},
    MutationObserver: class { constructor(cb) { this.cb = cb; } observe() {} disconnect() {} },
    M2,
    Map, Set, WeakMap, Array, Object, String, Number, Boolean, Math, JSON, Proxy, Infinity,
    console: { log() {}, warn() {}, error() {}, info() {}, debug() {} },
  };
  sandbox.window = {
    getComputedStyle: (el) => {
      M2.styleById.set(el.__id, (M2.styleById.get(el.__id) || 0) + 1);
      M2.trace.push({ kind: 'read', what: 'style', id: el.__id });
      return { display: 'block', visibility: 'visible', opacity: '1' };
    },
  };
  sandbox.compactText = (el) => {
    M2.textById.set(el.__id, (M2.textById.get(el.__id) || 0) + 1);
    M2.trace.push({ kind: 'read', what: 'text', id: el.__id });
    return String(el.__text || '').toLowerCase();
  };

  const rangeStart = SOURCE.indexOf('\nfunction updateColorPriorityControl(');
  const rangeEnd = SOURCE.indexOf('\n  /* ─────────────────────────────────────────\n     4) Palette toggle logic', rangeStart);
  if (rangeStart < 0 || rangeEnd <= rangeStart) throw new Error('TEST_HARNESS_BLOCKED:recurrent-range');
  const optionalHelpers = [
    'setColorPriorityDataset', 'setColorPriorityAttribute', 'setColorPriorityTitle', 'setColorPriorityStyle',
  ].filter((name) => SOURCE.includes(`\nfunction ${name}(`));
  let program = [
    extractFunction('isElementVisible'),
    ...optionalHelpers.map((name) => extractFunction(name)),
    SOURCE.slice(rangeStart + 1, rangeEnd),
  ].join('\n');
  program = program.replace(
    extractFunction('compactText'),
    `function compactText(el) {
      if (!el) return '';
      M2.textById.set(el.__id, (M2.textById.get(el.__id) || 0) + 1);
      M2.trace.push({ kind: 'read', what: 'text', id: el.__id });
      return String(el.__text || '').toLowerCase();
    }`,
  );
  program += `\n${extractFunction('scanSidebar')}`;
  const lifecycleStart = SOURCE.indexOf('\nlet hoScanActive = false;');
  const lifecycleEnd = SOURCE.indexOf('\nfunction hoActivateScanLayer()', lifecycleStart);
  if (lifecycleStart < 0 || lifecycleEnd <= lifecycleStart) throw new Error('TEST_HARNESS_BLOCKED:scan-lifecycle-range');
  program += `\n${SOURCE.slice(lifecycleStart + 1, lifecycleEnd)}`;
  for (const [name, key] of [
    ['updateColorPriorityControl', 'update'], ['createColorPriorityControl', 'create'],
    ['findProjectTabsHost', 'find'], ['ensureColorPriorityControl', 'ensure'],
    ['collectSortableMainRows', 'collect'], ['applyColorPrioritySort', 'sort'], ['scanSidebar', 'scan'],
  ]) {
    program = program.replace(new RegExp(`function ${name}\\(([^)]*)\\) \\{`, 'u'), `function ${name}($1) { M2.${key} += 1; M2.trace.push({kind:'call', what:'${name}'});`);
  }
  const context = vm.createContext(sandbox);
  vm.runInContext(program, context, { filename: `${DECORATOR_PATH}:recurrent` });
  vm.runInContext('hoScanActive = true;', context);

  const reset = () => {
    for (const key of ['scan', 'sort', 'collect', 'find', 'ensure', 'update', 'create', 'remove', 'writeCalls', 'stateChanges']) M2[key] = 0;
    M2.trace.length = 0; M2.rectById.clear(); M2.styleById.clear(); M2.textById.clear();
  };
  reset();
  return {
    sandbox, M: M2, main, host, El, get control() { return controlNode; },
    set control(value) { controlNode = value; }, buildControl, reset,
    requestRecovery() { sandbox.hoRequestScan('recovery'); },
    requestWork(reason, work) { sandbox.hoRequestScan(reason, work); },
    flushSort() {
      for (let turn = 0; turn < 12 && (frames.size || timers.size); turn += 1) {
        const pendingFrames = [...frames.values()]; frames.clear();
        for (const fn of pendingFrames) fn();
        const pendingTimers = [...timers.values()]; timers.clear();
        for (const item of pendingTimers) item.fn();
      }
    },
  };
}

fixture('RED recurrent A/E: stable scan→sort cycle avoids duplicate broad discovery and stable writes', () => {
  const env = makeRecurrentEnv();
  env.sandbox.scanSidebar();
  env.flushSort();
  eq({ scan: env.M.scan, sort: env.M.sort, collect: env.M.collect }, { scan: 1, sort: 1, collect: 1 },
    'one admitted scan produces one sort and one collect');
  eq(env.M.find, 0, 'valid stamps suppress both broad host discovery phases');
  eq(env.M.create, 0, 'stable control is not recreated');
  eq(env.M.remove, 0, 'stable control is not cleaned up');
  eq(env.M.writeCalls, 0, 'stable host/control cycle performs no participating writes');
  const firstCollect = env.M.trace.findIndex((entry) => entry.what === 'collectSortableMainRows');
  ok(firstCollect >= 0, 'ordered trace reaches collect');
  eq(env.M.trace.slice(0, firstCollect).filter((entry) => entry.what === 'findProjectTabsHost').length, 0,
    'no second broad read phase precedes collect');
});

fixture('CORRECTION RED F1: control stale between scan and sort recovers at consume time', () => {
  const env = makeRecurrentEnv();
  env.sandbox.scanSidebar();
  env.reset();
  env.control.remove();
  env.reset();
  env.flushSort();
  eq({
    sort: env.M.sort,
    ensure: env.M.ensure,
    find: env.M.find,
    collect: env.M.collect,
    liveControls: env.host.querySelectorAll('.ho-color-priority').length,
  }, {
    sort: 1,
    ensure: 1,
    find: 1,
    collect: 1,
    liveControls: 1,
  }, 'consume-time structural truth overrides the stale scan-time skip hint');
});

fixture('CORRECTION RED F1: host stale between scan and sort recovers current authority', () => {
  const env = makeRecurrentEnv();
  env.sandbox.scanSidebar();
  const replacement = new env.El('div');
  replacement.__rect = { top: 100, left: 0, width: 690, height: 58 };
  replacement.__text = 'Chats Sources';
  env.host.remove();
  env.main.appendChild(replacement);
  env.reset();
  env.flushSort();
  eq({
    sort: env.M.sort,
    ensure: env.M.ensure,
    find: env.M.find,
    collect: env.M.collect,
    replacementStamped: replacement.classList.contains('ho-project-tabs-host'),
    liveControls: replacement.querySelectorAll('.ho-color-priority').length,
  }, {
    sort: 1,
    ensure: 1,
    find: 1,
    collect: 1,
    replacementStamped: true,
    liveControls: 1,
  }, 'consume-time validation rejects a disconnected host and recovers the current host once');
});

fixture('RED recurrent E: stable host/control performs no semantically unchanged writes', () => {
  const env = makeRecurrentEnv();
  env.sandbox.scanSidebar();
  env.flushSort();
  eq(env.M.writeCalls, 0, `stable cycle emitted ${env.M.writeCalls} participating host/control writes`);
});

fixture('RED recurrent E: ordered stable trace reaches collect without broad-read/write amplification', () => {
  const env = makeRecurrentEnv();
  env.sandbox.scanSidebar();
  env.flushSort();
  const collectAt = env.M.trace.findIndex((entry) => entry.what === 'collectSortableMainRows');
  ok(collectAt >= 0, 'trace reaches collect');
  eq(env.M.trace.slice(0, collectAt).filter((entry) => entry.what === 'findProjectTabsHost').length, 0,
    'no broad host discovery precedes stable collect');
  eq(env.M.trace.slice(0, collectAt).filter((entry) => entry.kind === 'write').length, 0,
    'no stable host/control write precedes collect geometry');
});

fixture('RED recurrent B: stale host and missing control recover once, then sort reuses stamps', () => {
  const env = makeRecurrentEnv({ control: false, stampedHost: false });
  env.sandbox.scanSidebar();
  env.flushSort();
  ok(env.host.classList.contains('ho-project-tabs-host'), 'broad recovery stamps the live host');
  ok(env.host.querySelector('.ho-color-priority'), 'missing control is recreated');
  ok(env.M.find <= 1, `one coherent recovery performs at most one broad discovery, saw ${env.M.find}`);
  eq(env.M.sort, 1, 'sorting remains preserved after recovery');
});

fixture('RED recurrent B: disconnected stamped host is rejected and replacement recovers', () => {
  const env = makeRecurrentEnv();
  env.host.remove();
  const replacement = new env.El('div');
  replacement.__rect = { top: 100, left: 0, width: 690, height: 58 };
  replacement.__text = 'Chats Sources';
  env.main.appendChild(replacement);
  env.reset();
  env.sandbox.scanSidebar();
  env.flushSort();
  ok(replacement.classList.contains('ho-project-tabs-host'), 'replacement host is discovered and stamped');
  ok(replacement.querySelector('.ho-color-priority'), 'replacement host receives a structurally complete control');
  ok(env.M.find <= 1, `replacement recovery performs at most one broad discovery, saw ${env.M.find}`);
});

fixture('RED recurrent B: disconnected control recovers once and remains sortable', () => {
  const env = makeRecurrentEnv();
  env.control.remove();
  env.reset();
  env.sandbox.scanSidebar();
  env.flushSort();
  ok(env.host.querySelector('.ho-color-priority'), 'removed control is recreated under the valid host');
  ok(env.M.find <= 1, `control recovery performs at most one broad discovery, saw ${env.M.find}`);
  eq(env.M.sort, 1, 'sorting remains preserved after control recovery');
});

fixture('RED recurrent B: duplicate and wrong-context controls fail closed', () => {
  const env = makeRecurrentEnv();
  env.buildControl(env.host);
  const foreign = env.buildControl(env.main);
  env.reset();
  env.sandbox.scanSidebar();
  env.flushSort();
  eq(env.host.querySelectorAll('.ho-color-priority').length, 1, 'duplicate host controls converge to one');
  eq(foreign.isConnected, false, 'wrong-context control is removed');
  ok(env.M.find <= 1, `fail-closed cleanup performs at most one broad discovery, saw ${env.M.find}`);
});

fixture('RED recurrent direct sort: valid stamps require no broad discovery', () => {
  const env = makeRecurrentEnv();
  env.sandbox.scheduleColorPrioritySort();
  env.flushSort();
  eq(env.M.sort, 1, 'direct sort still executes');
  eq(env.M.find, 0, 'direct sort validates stamps structurally without broad discovery');
});

fixture('control recurrent direct sort: stale state tokens reconcile without broad discovery', () => {
  const env = makeRecurrentEnv();
  env.control.__ds.color = 'red';
  env.reset();
  env.sandbox.scheduleColorPrioritySort();
  env.flushSort();
  eq(env.M.sort, 1, 'direct sort still executes when a control-state token is stale');
  eq(env.M.find, 0, 'valid host/control structure avoids broad discovery during state reconciliation');
  eq(env.control.dataset.color, 'all', 'the stale control-state token is reconciled');
  ok(env.M.stateChanges >= 1, 'the required state reconciliation performs a real state change');
});

fixture('RED recurrent C: stable 15-second recovery cycle uses valid stamps without broad discovery', () => {
  const env = makeRecurrentEnv();
  env.requestRecovery();
  env.flushSort();
  eq({ scan: env.M.scan, sort: env.M.sort, find: env.M.find }, { scan: 1, sort: 1, find: 0 },
    'one stable recovery request drains one scan/sort cycle with zero broad discovery');
});

fixture('RED recurrent C: missing host/control recovery cycle discovers once total', () => {
  const env = makeRecurrentEnv({ control: false, stampedHost: false });
  env.requestRecovery();
  env.flushSort();
  eq({ scan: env.M.scan, sort: env.M.sort, find: env.M.find }, { scan: 1, sort: 1, find: 1 },
    'one invalid recovery request discovers once and the follow-on sort does not rediscover');
  ok(env.host.classList.contains('ho-project-tabs-host'), 'recovery stamps the live host');
  ok(env.host.querySelector('.ho-color-priority'), 'recovery creates the missing control');
});

fixture('RED recurrent domains: complete causes OR-accumulate before one queue consumption', () => {
  const env = makeRecurrentEnv({ control: false, stampedHost: false });
  env.requestWork('dom', 1 | 4);
  env.requestWork('recovery', 2);
  env.flushSort();
  eq({ scan: env.M.scan, sort: env.M.sort, find: env.M.find }, { scan: 1, sort: 1, find: 1 },
    'chat reconcile, control recovery and color sort accumulate into one bounded cycle');
  ok(env.host.querySelector('.ho-color-priority'), 'the accumulated recovery domain is not lost');
});

fixture('RED recurrent D: one broad host discovery reuses exact-node reads', () => {
  const env = makeRecurrentEnv({ control: false, stampedHost: false, twoCandidates: true });
  env.sandbox.findProjectTabsHost();
  const mainRect = env.M.rectById.get(env.main.__id) || 0;
  const candidateIds = [...env.M.textById.keys()];
  const max = (map, ids) => ids.reduce((value, id) => Math.max(value, map.get(id) || 0), 0);
  eq(mainRect, 1, 'main rect is read once per broad discovery call');
  ok(max(env.M.styleById, candidateIds) <= 1, 'each candidate style is read at most once');
  ok(max(env.M.rectById, candidateIds) <= 1, 'each candidate rect is read at most once');
  ok(max(env.M.textById, candidateIds) <= 1, 'each candidate text is traversed at most once');
  const ancestorIds = [...env.M.rectById.keys()].filter((id) => id !== env.main.__id && !candidateIds.includes(id));
  ok(max(env.M.rectById, ancestorIds) <= 1, 'each unique shared ancestor rect is read at most once');
});

fixture('binding recurrent: immutable observer/scheduler and collect authorities remain pinned', () => {
  eq((SOURCE.match(/new MutationObserver\(/gu) || []).length, 1, 'one private MutationObserver remains');
  ok(/const HO_SCAN_RECOVERY_MS = 15000;/.test(SOURCE), '15-second recovery authority remains');
  ok(/const HO_SCAN_COALESCE_MS = 50;/.test(SOURCE) && /const HO_SCAN_DOM_COALESCE_MS = 250;/.test(SOURCE),
    '50/250 ms scan deadlines remain');
  ok(!/ObserverHub|observerHub/u.test(SOURCE), 'no Observer Hub migration appears');
});

// ── Report ────────────────────────────────────────────────────────────────
const failed = fixtures.filter((f) => !f.ok);
for (const f of fixtures) {
  console.log(`${f.ok ? 'PASS' : 'FAIL'} ${f.name}`);
  if (!f.ok) console.log(f.error.split('\n').slice(0, 4).map((l) => `       ${l}`).join('\n'));
}
console.log('');
console.log(`Real production function executed: ${REAL_FN} (extracted from ${DECORATOR_PATH})`);
console.log('Phase 1 scope: WRITE SUPPRESSION ONLY — no geometry contract (Gate A rejected Fix B).');
console.log('');
console.log('Observed against the current product:');
for (const c of COLOURS) {
  const o = obs[`unchanged_${c}`];
  if (o) console.log(`  unchanged ${c.padEnd(6)} calls=${o.calls}  ACTUAL colour-state transitions=${o.transitions}  (contract: 0)`);
}
if (obs.many_unchanged) console.log(`  54 unchanged rows            transitions=${obs.many_unchanged.transitions}  (contract: 0)`);
if (obs.repeated_passes) console.log(`  repeated passes              transitions=[${obs.repeated_passes.join(', ')}]  (contract: [0, 0, 0])`);
if (obs.mixed) console.log(`  mixed list                   unchanged=${obs.mixed.unchangedTotal} (contract 0), changed=${obs.mixed.changedTransitions} (must be >= 1)`);
if (obs.meta_mirror_unchanged !== undefined) console.log(`  meta-mirror unchanged        transitions=${obs.meta_mirror_unchanged}  (contract: 0)`);
if (obs.rowel_equals_link !== undefined) console.log(`  rowEl === link unchanged     transitions=${obs.rowel_equals_link}  (contract: 0)`);
if (obs.ownership) console.log(`  ownership stamp              hoRowColorOwner=${obs.ownership.owner}  transitions=${obs.ownership.transitions}`);
console.log('');
console.log(`Fixtures: ${fixtures.length - failed.length}/${fixtures.length}`);
console.log(`Assertions: ${assertions}`);
if (failed.length) {
  console.log('CV-3.48 chat list decorator write cost FAILED');
  process.exit(1);
}
console.log('CV-3.48 chat list decorator write cost passed');
