#!/usr/bin/env node
// Validator for Prompt Manager (7A1a) slot-preserving reordering — Phase 1.
//
// Exercises the PRODUCTION helper ENGINE_PM_reorderVisible via the flag-gated
// test hook. The algorithm is not reimplemented here.
//
// The defect this guards against: the old reorder sorted the full prompt array
// by `newOrder.indexOf(id)`, which scores every filtered-out prompt -1. Any
// drag or ▲▼ press while a search or category filter was active silently
// relocated every hidden prompt to the front of the list and persisted it.
//
//   Global  [A, B, C, D, E]
//   Visible [B, D]
//   Move D up
//   old (broken) → [A, C, E, D, B]   every hidden record moved
//   new (correct) → [A, D, C, B, E]  only slots 1 and 3 exchanged
//
// Contract: returns a NEW array on success, or null for "no change". null must
// be treated as a no-op by callers — never as an empty list.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..', '..', '..');
const MODULE_REL = 'src-runtime-base/7A1a.⬜️✍️ Prompt Manager ✍️.js';

const PASS = [];
const FAIL = [];
function check(label, fn) {
  try { fn(); PASS.push(label); console.log(`  ✓ ${label}`); }
  catch (e) {
    const m = e && e.message ? e.message : String(e);
    FAIL.push({ label, m });
    console.log(`  ✗ ${label}`);
    console.log(`      ${m}`);
  }
}

function makeSandbox() {
  const noopEl = () => ({
    style: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    setAttribute() {}, removeAttribute() {}, getAttribute() { return null; },
    appendChild() {}, remove() {}, focus() {},
    addEventListener() {}, removeEventListener() {},
    querySelector() { return null; }, querySelectorAll() { return []; },
    closest() { return null; }, contains() { return false; },
    getBoundingClientRect() { return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }; },
    children: [], textContent: '', innerHTML: '',
  });

  const store = new Map();
  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
  };

  const sandbox = {
    console,
    localStorage,
    performance: { now: () => 0 },
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
    Event: class { constructor(type) { this.type = type; } },
    MutationObserver: class { observe() {} disconnect() {} },
    ResizeObserver: class { observe() {} disconnect() {} },
    CSS: { escape: (s) => String(s) },
    document: {
      readyState: 'loading', // park boot; only the pure helper is under test
      documentElement: { ...noopEl(), classList: { contains: () => false } },
      body: null,
      title: '',
      activeElement: null,
      createElement: () => noopEl(),
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener() {}, removeEventListener() {},
      contains() { return false; },
    },
    window: {
      __H2O_PM_TEST__: true,
      location: { pathname: '/c/test', href: 'https://chatgpt.com/c/test' },
      localStorage,
      crypto: { randomUUID: (() => { let n = 0; return () => `id-${++n}`; })() },
      setTimeout: () => 0, clearTimeout: () => {},
      setInterval: () => 0, clearInterval: () => {},
      requestAnimationFrame: () => 0, cancelAnimationFrame: () => {},
      getComputedStyle: () => ({ display: 'none', visibility: 'hidden', opacity: '0' }),
      innerWidth: 1280, innerHeight: 900,
      addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
    },
  };
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  return sandbox;
}

function loadReorder() {
  const sandbox = makeSandbox();
  const src = fs.readFileSync(path.join(REPO_ROOT, MODULE_REL), 'utf8');
  vm.runInContext(src, sandbox, { filename: MODULE_REL });
  const t = sandbox.window.H2O?.PM?.prmptmngr?.__test;
  if (!t) throw new Error('test hook missing — is __H2O_PM_TEST__ honoured?');
  if (typeof t.reorderVisible !== 'function') throw new Error('reorderVisible not exposed');
  return t.reorderVisible;
}

const reorder = loadReorder();

// Convenience: build records from id letters, and read ids back out.
const recs = (...ids) => ids.map(id => ({ id, title: id, body: `body-${id}`, type: 'prompt' }));
const idsOf = (list) => list.map(p => p.id).join(',');

function main() {
  console.log('── Prompt Manager 7A1a slot-preserving reorder (Phase 1) ─');

  // The headline case from the defect report.
  check('[A,B,C,D,E] visible [B,D], move D up → [A,D,C,B,E]', () => {
    const list = recs('A', 'B', 'C', 'D', 'E');
    const next = reorder(list, ['B', 'D'], 'D', 'up');
    assert.ok(next, 'expected a reordered array, got null');
    assert.equal(idsOf(next), 'A,D,C,B,E', 'hidden records must keep their absolute index');
    assert.equal(idsOf(list), 'A,B,C,D,E', 'the input array must not be mutated');
    assert.notEqual(next, list, 'a new array must be returned');
  });

  check('the reverse movement restores the original order', () => {
    const list = recs('A', 'D', 'C', 'B', 'E');
    // With that array, the same filter renders the visible pair as [D, B].
    const next = reorder(list, ['D', 'B'], 'D', 'down');
    assert.ok(next, 'expected a reordered array, got null');
    assert.equal(idsOf(next), 'A,B,C,D,E', 'moving back must restore the original order');
  });

  check('round trip over the pair is stable', () => {
    const start = recs('A', 'B', 'C', 'D', 'E');
    const up = reorder(start, ['B', 'D'], 'D', 'up');
    const back = reorder(up, ['D', 'B'], 'D', 'down');
    assert.equal(idsOf(back), 'A,B,C,D,E', 'up-then-down must be identity');
  });

  check('unfiltered upward movement is an ordinary adjacent swap', () => {
    const list = recs('A', 'B', 'C', 'D', 'E');
    const next = reorder(list, ['A', 'B', 'C', 'D', 'E'], 'C', 'up');
    assert.equal(idsOf(next), 'A,C,B,D,E');
  });

  check('unfiltered downward movement is an ordinary adjacent swap', () => {
    const list = recs('A', 'B', 'C', 'D', 'E');
    const next = reorder(list, ['A', 'B', 'C', 'D', 'E'], 'C', 'down');
    assert.equal(idsOf(next), 'A,B,D,C,E');
  });

  check('first-visible upward is a no-op (null)', () => {
    const list = recs('A', 'B', 'C', 'D', 'E');
    assert.equal(reorder(list, ['B', 'D'], 'B', 'up'), null, 'filtered first-visible must not move');
    assert.equal(reorder(list, ['A', 'B', 'C', 'D', 'E'], 'A', 'up'), null, 'unfiltered first must not move');
  });

  check('last-visible downward is a no-op (null)', () => {
    const list = recs('A', 'B', 'C', 'D', 'E');
    assert.equal(reorder(list, ['B', 'D'], 'D', 'down'), null, 'filtered last-visible must not move');
    assert.equal(reorder(list, ['A', 'B', 'C', 'D', 'E'], 'E', 'down'), null, 'unfiltered last must not move');
  });

  check('a single visible item is a no-op in both directions', () => {
    const list = recs('A', 'B', 'C');
    assert.equal(reorder(list, ['B'], 'B', 'up'), null);
    assert.equal(reorder(list, ['B'], 'B', 'down'), null);
  });

  check('unknown or non-visible id is a no-op', () => {
    const list = recs('A', 'B', 'C', 'D', 'E');
    assert.equal(reorder(list, ['B', 'D'], 'ZZZ', 'up'), null, 'id absent from the list');
    assert.equal(reorder(list, ['B', 'D'], 'C', 'up'), null, 'id present but not visible');
    assert.equal(reorder(list, ['B', 'D'], '', 'up'), null, 'empty id');
    assert.equal(reorder(list, ['B', 'D'], null, 'up'), null, 'null id');
  });

  check('duplicate visible ids are rejected rather than applied', () => {
    const list = recs('A', 'B', 'C', 'D', 'E');
    assert.equal(reorder(list, ['B', 'B', 'D'], 'D', 'up'), null, 'duplicates must be rejected');
    assert.equal(idsOf(list), 'A,B,C,D,E', 'order must be untouched');
  });

  check('malformed visible entries are rejected rather than applied', () => {
    const list = recs('A', 'B', 'C', 'D', 'E');
    for (const bad of [[null, 'D'], ['', 'D'], [42, 'D'], [{}, 'D'], [undefined, 'D']]) {
      assert.equal(reorder(list, bad, 'D', 'up'), null, `malformed entry ${JSON.stringify(bad)} must be rejected`);
    }
    assert.equal(reorder(list, 'not-an-array', 'D', 'up'), null, 'non-array visible list must be rejected');
    assert.equal(reorder('not-an-array', ['B', 'D'], 'D', 'up'), null, 'non-array list must be rejected');
    assert.equal(idsOf(list), 'A,B,C,D,E', 'order must be untouched');
  });

  check('a stale visible id (not in the list) is rejected', () => {
    const list = recs('A', 'B', 'C', 'D', 'E');
    assert.equal(reorder(list, ['B', 'GONE', 'D'], 'D', 'up'), null, 'stale render must not rewrite slots');
    assert.equal(idsOf(list), 'A,B,C,D,E');
  });

  check('an invalid direction is a no-op', () => {
    const list = recs('A', 'B', 'C', 'D', 'E');
    assert.equal(reorder(list, ['B', 'D'], 'D', 'sideways'), null);
    assert.equal(reorder(list, ['B', 'D'], 'D', ''), null);
    assert.equal(reorder(list, ['B', 'D'], 'D', undefined), null);
  });

  check('non-adjacent visible items exchange only their own slots', () => {
    // Visible [A, E] with B, C, D hidden between them.
    const list = recs('A', 'B', 'C', 'D', 'E');
    const next = reorder(list, ['A', 'E'], 'E', 'up');
    assert.equal(idsOf(next), 'E,B,C,D,A', 'only slots 0 and 4 may change');
  });

  check('record identity is preserved (same objects, new array)', () => {
    const list = recs('A', 'B', 'C', 'D', 'E');
    const byId = new Map(list.map(p => [p.id, p]));
    const next = reorder(list, ['B', 'D'], 'D', 'up');
    for (const p of next) {
      assert.equal(p, byId.get(p.id), `record ${p.id} must be the same object, not a copy`);
    }
    assert.equal(next.length, list.length, 'length must be preserved');
  });

  check('every original id survives exactly once', () => {
    const list = recs('A', 'B', 'C', 'D', 'E');
    const next = reorder(list, ['B', 'D'], 'D', 'up');
    const seen = next.map(p => p.id).sort().join(',');
    assert.equal(seen, 'A,B,C,D,E', 'no record may be dropped or duplicated');
  });

  console.log('');
  console.log(`PASS ${PASS.length}`);
  if (FAIL.length) {
    console.log(`FAIL ${FAIL.length}`);
    for (const f of FAIL) console.log(`- ${f.label}: ${f.m}`);
    process.exitCode = 1;
  }
}

main();
