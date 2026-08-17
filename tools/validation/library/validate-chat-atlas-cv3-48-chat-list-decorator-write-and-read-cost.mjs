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

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
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
