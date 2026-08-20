#!/usr/bin/env node
// CV-3.44 — 1C1b divider-line geometry reuse within one resolution call (Gate B RED).
//
// CONTRACT
//   DIVIDER_LINE_RESOLUTION_MUST_NOT_MEASURE_THE_SAME_ELEMENT_MORE_THAN_ONCE_PER_CALL
//
// One synchronous getDividerLineEls() invocation must not call
// getBoundingClientRect twice on the same element. Within a single invocation the
// function performs no DOM or style writes at all, so a repeat measurement of the
// same node is provably redundant: same element, same layout, same synchronous
// task, therefore the same rect.
//
// PROVEN PRISTINE SHAPE (source, and confirmed live in the Gate-A runtime probe)
//   Per invocation on a normal 2-line divider: 7 getBoundingClientRect calls.
//     1  divider root      — needed
//     2  isDividerLineCandidate, one per line, and the rect is DISCARDED
//     4  classify, because `candidates.map(classify)` is executed TWICE:
//          const leftItems  = candidates.map(classify).filter(...)
//          const rightItems = candidates.map(classify).filter(...)
//   Minimum required: 3 (one divider rect + one rect per line). 4 of 7 are waste.
//   The live probe measured exactly 7.00 reads per invocation and the per-element
//   sequence cand > classify > classify, all at an identical write sequence.
//
// WHAT THIS GATES — and what it does NOT
//   Gated:     per-INVOCATION multiplicity of geometry reads on one element.
//   NOT gated: how many times getDividerLineEls is invoked. 0C3a invocation
//              multiplicity (sync + rAF double application) and 1A1b rebuild
//              frequency are separate, later optimizations and are deliberately
//              left free here. The post-rAF control below proves this validator
//              REQUIRES a second invocation to measure again, so Gate B cannot be
//              satisfied by caching geometry across calls or frames.
//   NOT gated: writes performed by applyDividerVisualsToRoot BEFORE it calls
//              getDividerLineEls. Those legitimately invalidate layout, which is
//              why the contract is scoped to the inside of one call, where the
//              write delta is provably zero.
//
// The real 1C1b bodies for isDividerLineCandidate and getDividerLineEls are
// executed in a VM. Neither is reimplemented, and neither is patched internally —
// getBoundingClientRect is counted at the external element boundary.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const PAGES_PATH = 'src-runtime-base/1C1b.🔴📑 Thread Pages Controller 📑.js';
const PAGES_SOURCE = fs.readFileSync(path.join(ROOT, PAGES_PATH), 'utf8');
const PAGES_HASH = createHash('sha256').update(PAGES_SOURCE).digest('hex');

// Recognized baselines. Gate B adds exactly one line after the reuse change lands.
const RECOGNIZED_PAGES = new Set([
  // Gate B RED pristine — main 13b333a2.
  'bdbdabe3b911c5bcb054dfe3980d2af7e7ca180b8fc41653e60e8047267cc939',
  // Gate B GREEN — same-invocation candidate-rect reuse, single classification
  // pass. Added only after every behavioural assertion above was already green
  // against this build; no assertion was weakened to accept it.
  '695e00856de4d891db0acc0118ac8258f0c89255a13b08c049d90b13e3b21f8b',
  // Option A ordered Chat -> MiniMap propagation (MECHANISMS_RULES sec.9A).
  // Adds the per-page Chat revision owner, ordered push metadata and the
  // shell-ready recovery binding. Registered only after every behavioural
  // fixture above was already green against this build and after the
  // refresh-time revision prune was removed; no geometry assertion was
  // weakened, reordered or relaxed to accept it.
  '299e0a4584f3f1f4b595ddba32e7a90db57a5c6ff36c2006501c416781946169',
]);

const CV331 = path.join(HERE, 'validate-chat-atlas-cv3-31-branch-transition-page-unit-withdrawal.mjs');

let assertions = 0;
const fixtures = [];
function ok(value, message) { assertions += 1; assert.ok(value, message); }
function equal(actual, expected, message) { assertions += 1; assert.equal(actual, expected, message); }
function fixture(name, fn) {
  try { fn(); fixtures.push({ name, ok: true }); }
  catch (error) { fixtures.push({ name, ok: false, error }); }
}

// ── source extraction (regex-literal aware) ────────────────────────────────
const REGEX_PRECEDER = new Set(['(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '~', '^', '<', '>', '\n']);
function extractFunction(source, name) {
  const anchor = `  function ${name}(`;
  const start = source.indexOf(anchor);
  if (start < 0) throw new Error(`function-anchor-missing:${name}`);
  if (source.indexOf(anchor, start + anchor.length) >= 0) throw new Error(`function-anchor-ambiguous:${name}`);
  const bodyStart = source.indexOf('{', source.indexOf(')', start));
  let depth = 0, quote = '', esc = false, lineC = false, blockC = false, re = false, prev = '';
  for (let i = bodyStart; i < source.length; i += 1) {
    const c = source[i], n = source[i + 1];
    if (lineC) { if (c === '\n') lineC = false; continue; }
    if (blockC) { if (c === '*' && n === '/') { blockC = false; i += 1; } continue; }
    if (re) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '[') re = 'class';
      else if (c === ']' && re === 'class') re = true;
      else if (c === '/' && re !== 'class') re = false;
      continue;
    }
    if (quote) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === quote) quote = ''; continue; }
    if (c === '/' && n === '/') { lineC = true; i += 1; continue; }
    if (c === '/' && n === '*') { blockC = true; i += 1; continue; }
    if (c === '/' && REGEX_PRECEDER.has(prev)) { re = true; continue; }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === '{') depth += 1;
    else if (c === '}' && --depth === 0) return source.slice(start, i + 1);
    if (!/\s/.test(c)) prev = c; else if (c === '\n') prev = '\n';
  }
  throw new Error(`function-boundary-invalid:${name}`);
}

// ── mini-DOM ───────────────────────────────────────────────────────────────
class HTMLElement {}
function parts(sel) { return String(sel || '').split(',').map((s) => s.trim()).filter(Boolean); }
function matchOne(node, sel) {
  const t = String(sel || '').trim();
  if (t === '*') return true;
  const tag = t.match(/^([a-zA-Z]+)/);
  if (tag && String(node.tagName).toUpperCase() !== tag[1].toUpperCase()) return false;
  for (const c of Array.from(t.matchAll(/\.([A-Za-z0-9_-]+)/g)).map((m) => m[1])) {
    if (!String(node.className || '').split(/\s+/).includes(c)) return false;
  }
  // [attr] · [attr="v"] · [attr*="v"] · [attr^="v"]
  for (const m of t.matchAll(/\[([A-Za-z0-9_-]+)([*^]?)(?:="([^"]*)")?\]/g)) {
    const name = m[1]; const op = m[2]; const want = m[3];
    const actual = node.getAttribute(name);
    if (actual == null) return false;
    if (want != null) {
      const a = String(actual);
      if (op === '*') { if (!a.includes(want)) return false; }
      else if (op === '^') { if (!a.startsWith(want)) return false; }
      else if (a !== want) return false;
    }
  }
  return true;
}

function makeWorld() {
  const world = {
    writeSeq: 0,
    callNo: 0,
    reads: [],              // { el, name, writeSeq, call }
    names: new Map(),
  };
  const bumpWrite = () => { world.writeSeq += 1; };

  class El extends HTMLElement {
    constructor(tag, name, rect, className = '') {
      super();
      this.tagName = String(tag || 'DIV').toUpperCase();
      this.nodeType = 1;
      this.className = className;
      this.textContent = '';
      this.children = [];
      this.parentElement = null;
      this.attrs = new Map();
      this._rect = rect ? { ...rect } : { left: 0, top: 0, width: 0, height: 0 };
      this._name = name;
      world.names.set(this, name);
      const self = this;
      this.style = {
        setProperty() { bumpWrite(); },
        removeProperty() { bumpWrite(); },
      };
      void self;
    }
    setRect(rect) { this._rect = { ...rect }; bumpWrite(); }
    getBoundingClientRect() {
      world.reads.push({ el: this, name: this._name, writeSeq: world.writeSeq, call: world.callNo });
      const r = this._rect;
      return {
        left: r.left, top: r.top, width: r.width, height: r.height,
        right: r.left + r.width, bottom: r.top + r.height,
        x: r.left, y: r.top,
      };
    }
    setAttribute(n, v) { this.attrs.set(String(n), String(v)); bumpWrite(); }
    removeAttribute(n) { this.attrs.delete(String(n)); bumpWrite(); }
    getAttribute(n) {
      if (String(n) === 'class') return this.className;
      return this.attrs.has(String(n)) ? this.attrs.get(String(n)) : null;
    }
    hasAttribute(n) { return this.getAttribute(n) != null; }
    appendChild(c) { c.parentElement = this; this.children.push(c); bumpWrite(); return c; }
    removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); c.parentElement = null; bumpWrite(); return c; }
    replaceChild(next, old) { const i = this.children.indexOf(old); if (i >= 0) this.children.splice(i, 1, next); next.parentElement = this; old.parentElement = null; bumpWrite(); return next; }
    matches(sel) { return parts(sel).some((p) => matchOne(this, p)); }
    querySelectorAll(sel) {
      const out = []; const w = (n) => { for (const c of n.children) { if (c.matches(sel)) out.push(c); w(c); } }; w(this); return out;
    }
    querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  }

  const sandbox = { HTMLElement, console };
  vm.createContext(sandbox);
  const names = ['isDividerLineCandidate', 'getDividerLineEls'];
  new vm.Script(`${names.map((n) => extractFunction(PAGES_SOURCE, n)).join('\n')}
globalThis.__api = { ${names.join(', ')} };`, { filename: PAGES_PATH }).runInContext(sandbox);

  // Drive exactly one invocation and return that call's read slice.
  const invoke = (divider) => {
    world.callNo += 1;
    const from = world.reads.length;
    const writeBefore = world.writeSeq;
    const result = sandbox.__api.getDividerLineEls(divider);
    const entries = world.reads.slice(from);
    const perElement = new Map();
    for (const e of entries) perElement.set(e.el, (perElement.get(e.el) || 0) + 1);
    return {
      result, entries,
      total: entries.length,
      perElement,
      countFor: (el) => perElement.get(el) || 0,
      maxPerElement: perElement.size ? Math.max(...perElement.values()) : 0,
      repeatCount: [...perElement.values()].reduce((n, v) => n + (v - 1), 0),
      writeDelta: world.writeSeq - writeBefore,
      // Distinct write-sequence values seen while measuring one element: 1 means
      // no layout-affecting write occurred between that element's repeated reads.
      writeSeqSpanFor: (el) => new Set(entries.filter((e) => e.el === el).map((e) => e.writeSeq)).size,
      sequenceFor: (el) => entries.filter((e) => e.el === el).length,
    };
  };

  return { world, El, invoke, api: sandbox.__api };
}

// ── the canonical normal divider: root + one left line + one right line ────
// divider  left 100 width 800  -> right 900, centerX 500
// left     left 120 width 300  -> midX 270  (< 500)
// right    left 580 width 300  -> midX 730  (> 500)
// Both lines are 2px tall and sit inside the divider's vertical band, so
// isDividerLineCandidate accepts them on geometry.
const DIVIDER_RECT = { left: 100, top: 200, width: 800, height: 40 };
const LEFT_RECT = { left: 120, top: 218, width: 300, height: 2 };
const RIGHT_RECT = { left: 580, top: 218, width: 300, height: 2 };
const LINE_CLASS = 'cgxui-chat-page-divider-line';

function normalWorld() {
  const w = makeWorld();
  const divider = new w.El('DIV', 'divider', DIVIDER_RECT, 'cgxui-chat-page-divider');
  const left = new w.El('DIV', 'left', LEFT_RECT, LINE_CLASS);
  const right = new w.El('DIV', 'right', RIGHT_RECT, LINE_CLASS);
  divider.appendChild(left);
  divider.appendChild(right);
  return { ...w, divider, left, right };
}

const metrics = {};

// ═══════════════════════════════════════════════════════════════════════════
fixture('product-integrity: 1C1b is a recognized baseline', () => {
  ok(RECOGNIZED_PAGES.has(PAGES_HASH),
    `1C1b hash not recognized: ${PAGES_HASH}. Add it to RECOGNIZED_PAGES after review.`);
  ok(/function getDividerLineEls\(/.test(PAGES_SOURCE), 'getDividerLineEls present');
  ok(/function isDividerLineCandidate\(/.test(PAGES_SOURCE), 'isDividerLineCandidate present');
});

// ═══════════════════════════════════════════════════════════════════════════
// PRIMARY RED
// ═══════════════════════════════════════════════════════════════════════════
fixture('PRIMARY: one invocation must not measure one element twice', () => {
  const w = normalWorld();
  const call = w.invoke(w.divider);

  metrics.primary = {
    calls: 1,
    dividerGbcr: call.countFor(w.divider),
    leftGbcr: call.countFor(w.left),
    rightGbcr: call.countFor(w.right),
    total: call.total,
    maxPerElement: call.maxPerElement,
    repeatCount: call.repeatCount,
    writeDelta: call.writeDelta,
    perElementWriteSeqSpan: {
      divider: call.writeSeqSpanFor(w.divider),
      left: call.writeSeqSpanFor(w.left),
      right: call.writeSeqSpanFor(w.right),
    },
  };

  // The invocation really ran the real function through the real chain.
  ok(call.total > 0, 'anti-degeneracy: geometry was actually read');
  ok(call.result.left === w.left, 'left line resolved before the contract is asserted');
  ok(call.result.right === w.right, 'right line resolved before the contract is asserted');

  // No write occurred anywhere inside the call, so every repeat is same-phase.
  equal(call.writeDelta, 0, 'no layout-affecting write occurs inside getDividerLineEls');

  // ── THE CONTRACT ────────────────────────────────────────────────────────
  // DIVIDER_LINE_RESOLUTION_MUST_NOT_MEASURE_THE_SAME_ELEMENT_MORE_THAN_ONCE_PER_CALL
  // Expected to FAIL against pristine 1C1b. That failure is the Gate B RED.
  equal(call.maxPerElement, 1,
    'DIVIDER_LINE_RESOLUTION_MUST_NOT_MEASURE_THE_SAME_ELEMENT_MORE_THAN_ONCE_PER_CALL'
    + ` — one element was measured ${call.maxPerElement} times in a single invocation`
    + ` (divider ${call.countFor(w.divider)}, left ${call.countFor(w.left)}, right ${call.countFor(w.right)},`
    + ` total ${call.total}, expected total 3, layout writes between reads ${call.writeDelta})`);
});

// ═══════════════════════════════════════════════════════════════════════════
fixture('same-phase control: repeated reads of one element share one write sequence', () => {
  const w = normalWorld();
  const call = w.invoke(w.divider);

  // Each element that is measured more than once must show exactly ONE distinct
  // write-sequence value across its reads — i.e. nothing invalidated layout
  // between them. This is what makes the RED same-phase redundancy rather than
  // legitimate stale-after-write remeasurement.
  for (const el of [w.divider, w.left, w.right]) {
    if (call.countFor(el) < 2) continue;
    equal(call.writeSeqSpanFor(el), 1,
      `repeated reads of ${w.world.names.get(el)} occur at one unchanged write sequence`);
  }
  equal(call.writeDelta, 0, 'INTERVENING_LAYOUT_WRITES is zero for the whole invocation');
  metrics.samePhase = { writeDelta: call.writeDelta, repeats: call.repeatCount };
});

// ═══════════════════════════════════════════════════════════════════════════
fixture('return identity: left and right are the exact pristine element objects', () => {
  const w = normalWorld();
  const call = w.invoke(w.divider);
  ok(call.result.left === w.left, 'left is the identical element object, not a lookalike');
  ok(call.result.right === w.right, 'right is the identical element object, not a lookalike');
  ok(call.result.left !== call.result.right, 'left and right are distinct elements');
  metrics.identity = { left: 'exact', right: 'exact' };
});

// ═══════════════════════════════════════════════════════════════════════════
fixture('classification: side selection follows midpoint vs divider centre', () => {
  const w = normalWorld();
  const call = w.invoke(w.divider);
  const centerX = DIVIDER_RECT.left + (DIVIDER_RECT.width / 2);
  const midOf = (r) => r.left + (r.width / 2);
  ok(midOf(LEFT_RECT) < centerX, 'fixture left line really is left of centre');
  ok(midOf(RIGHT_RECT) > centerX, 'fixture right line really is right of centre');
  ok(call.result.left === w.left, 'left-of-centre element is selected as left');
  ok(call.result.right === w.right, 'right-of-centre element is selected as right');

  // Deterministic widest-wins case: two candidates on the left, the wider must win.
  const w2 = makeWorld();
  const divider = new w2.El('DIV', 'divider', DIVIDER_RECT, 'cgxui-chat-page-divider');
  const narrow = new w2.El('DIV', 'narrow-left', { left: 130, top: 218, width: 120, height: 2 }, LINE_CLASS);
  const wide = new w2.El('DIV', 'wide-left', { left: 120, top: 218, width: 300, height: 2 }, LINE_CLASS);
  const right = new w2.El('DIV', 'right', RIGHT_RECT, LINE_CLASS);
  divider.appendChild(narrow); divider.appendChild(wide); divider.appendChild(right);
  const call2 = w2.invoke(divider);
  ok(call2.result.left === wide, 'the widest left candidate wins, matching pristine sort order');
  ok(call2.result.right === right, 'right selection is unaffected by extra left candidates');
});

// ═══════════════════════════════════════════════════════════════════════════
fixture('post-rAF control: a later invocation MUST measure again', () => {
  const w = normalWorld();
  const call1 = w.invoke(w.divider);

  // A separate later phase, exactly as the rAF settle pass does: geometry moved.
  w.left.setRect({ left: 560, top: 218, width: 300, height: 2 });   // now right of centre
  w.right.setRect({ left: 140, top: 218, width: 300, height: 2 });  // now left of centre

  const call2 = w.invoke(w.divider);

  // Each invocation must do its own reading. Cross-call caching would show zero.
  ok(call2.total > 0, 'the second invocation performs its own geometry reads');
  ok(call2.countFor(w.divider) >= 1, 'the divider root is measured again in call 2');
  ok(call2.countFor(w.left) >= 1, 'the first line element is measured again in call 2');
  ok(call2.countFor(w.right) >= 1, 'the second line element is measured again in call 2');
  equal(call2.total, call1.total, 'per-invocation cost is identical — the contract is per call, not cumulative');

  // The moved geometry must be reflected: the sides swap.
  ok(call2.result.left === w.right, 'call 2 reflects the NEW geometry (sides swapped)');
  ok(call2.result.right === w.left, 'call 2 reflects the NEW geometry (sides swapped)');
  metrics.postRaf = { call1: call1.total, call2: call2.total };
});

// ═══════════════════════════════════════════════════════════════════════════
fixture('element replacement: a new node is freshly measured and returned', () => {
  const w = normalWorld();
  const call1 = w.invoke(w.divider);
  ok(call1.result.right === w.right, 'call 1 returns the original right element');

  const replacement = new w.El('DIV', 'right-replacement', RIGHT_RECT, LINE_CLASS);
  w.divider.replaceChild(replacement, w.right);

  const call2 = w.invoke(w.divider);
  ok(call2.countFor(replacement) >= 1, 'the replacement element is measured in call 2');
  ok(call2.result.right === replacement, 'call 2 returns the replacement element');
  ok(call2.result.right !== w.right, 'the retired element is not returned — no cross-call element cache');
  equal(call2.countFor(w.right), 0, 'the detached element is not measured at all');
  metrics.replacement = { measured: call2.countFor(replacement) };
});

// ═══════════════════════════════════════════════════════════════════════════
fixture('fallback discovery: lines matching no preferred selector are still found', () => {
  const w = makeWorld();
  const divider = new w.El('DIV', 'divider', DIVIDER_RECT, 'cgxui-chat-page-divider');
  // Class matches NONE of the seven preferred selectors, so resolution must fall
  // through to the querySelectorAll('*') subtree scan.
  const left = new w.El('DIV', 'fallback-left', LEFT_RECT, 'hairline');
  const right = new w.El('DIV', 'fallback-right', RIGHT_RECT, 'hairline');
  const dot = new w.El('DIV', 'dot', { left: 495, top: 215, width: 8, height: 8 }, 'cgxui-chat-page-divider-dot');
  divider.appendChild(left); divider.appendChild(dot); divider.appendChild(right);

  const call = w.invoke(divider);
  for (const sel of ['.cgxui-chat-page-divider-line', '.cgxui-pgnw-page-divider-line',
    '[data-cgxui-chat-page-divider-line]', '[data-cgxui-page-divider-line]',
    '[class*="divider-line"]', '[class*="page-divider-line"]', '[class*="divider-rule"]']) {
    equal(divider.querySelectorAll(sel).length, 0, `fixture really matches no preferred selector: ${sel}`);
  }
  ok(call.result.left === left, 'fallback discovery still finds the left line');
  ok(call.result.right === right, 'fallback discovery still finds the right line');
  ok(call.result.left !== dot && call.result.right !== dot, 'the divider dot is excluded from line candidates');
  metrics.fallback = { total: call.total, found: !!(call.result.left && call.result.right) };
});

// ═══════════════════════════════════════════════════════════════════════════
// Diagnostic only — NOT part of the primary RED.
// ═══════════════════════════════════════════════════════════════════════════
fixture('DIAGNOSTIC: a rejected element matching several selectors is re-measured', () => {
  const w = makeWorld();
  const divider = new w.El('DIV', 'divider', DIVIDER_RECT, 'cgxui-chat-page-divider');
  const left = new w.El('DIV', 'left', LEFT_RECT, LINE_CLASS);
  const right = new w.El('DIV', 'right', RIGHT_RECT, LINE_CLASS);
  // Rejected on height (20 > 8) but matches selectors 2, 5 and 6. Because `seen`
  // is only populated AFTER acceptance, each matching selector re-measures it.
  const rejected = new w.El('DIV', 'rejected-overlap',
    { left: 300, top: 205, width: 200, height: 20 }, 'cgxui-pgnw-page-divider-line');
  divider.appendChild(left); divider.appendChild(rejected); divider.appendChild(right);

  const call = w.invoke(divider);
  const rejectedReads = call.countFor(rejected);
  metrics.rejectedOverlap = {
    reads: rejectedReads,
    matchingSelectors: ['.cgxui-pgnw-page-divider-line', '[class*="divider-line"]', '[class*="page-divider-line"]']
      .filter((s) => divider.querySelectorAll(s).includes(rejected)).length,
  };
  // Recorded as evidence. Enforcing the primary contract ("<=1 geometry read per
  // element per call") would naturally cover this too, but that is Gate B's call
  // to make, so nothing here is asserted as a failure.
  ok(rejectedReads >= 1, 'the rejected element is measured at least once (diagnostic only)');
  ok(call.result.left === left && call.result.right === right,
    'a rejected overlapping element does not corrupt left/right selection');
});

// ═══════════════════════════════════════════════════════════════════════════
fixture('anti-degeneracy: geometry is genuinely used, not skipped', () => {
  const w = normalWorld();
  const call = w.invoke(w.divider);
  ok(call.total > 0, 'getBoundingClientRect is actually called');
  ok(call.countFor(w.divider) >= 1, 'the divider root is measured');
  ok(call.result.left, 'left line resolves');
  ok(call.result.right, 'right line resolves');

  // Candidate geometry must genuinely drive the outcome: a line that fails the
  // height predicate must be rejected, proving rects are read and applied.
  const w2 = makeWorld();
  const divider = new w2.El('DIV', 'divider', DIVIDER_RECT, 'cgxui-chat-page-divider');
  const tooTall = new w2.El('DIV', 'too-tall', { left: 120, top: 210, width: 300, height: 30 }, LINE_CLASS);
  const right = new w2.El('DIV', 'right', RIGHT_RECT, LINE_CLASS);
  divider.appendChild(tooTall); divider.appendChild(right);
  const call2 = w2.invoke(divider);
  equal(call2.result.left, null, 'a candidate failing the geometry predicate is rejected');
  ok(call2.result.right === right, 'the valid candidate is still selected');
  metrics.antiDegeneracy = { reads: call.total };
});

// ═══════════════════════════════════════════════════════════════════════════
fixture('CV-3.31 branch-transition page-unit withdrawal still passes', () => {
  const run = spawnSync(process.execPath, [CV331], { encoding: 'utf8', timeout: 180000 });
  metrics.cv331 = { status: run.status };
  equal(run.status, 0, `CV-3.31 must pass unchanged (exit ${run.status})\n${String(run.stdout || '').slice(-1200)}`);
});

// ═══════════════════════════════════════════════════════════════════════════
const failed = fixtures.filter((f) => !f.ok);
const p = metrics.primary || {};
console.log('');
console.log('CV-3.44 — 1C1b divider-line geometry reuse within one call');
console.log(`  1C1b                        ${PAGES_HASH}`);
console.log(`  GET_DIVIDER_LINE_CALLS      ${p.calls ?? '-'}`);
console.log(`  DIVIDER_GBCR                ${p.dividerGbcr ?? '-'}`);
console.log(`  LEFT_LINE_GBCR              ${p.leftGbcr ?? '-'}`);
console.log(`  RIGHT_LINE_GBCR             ${p.rightGbcr ?? '-'}`);
console.log(`  TOTAL_GBCR                  ${p.total ?? '-'}   (expected future: 3)`);
console.log(`  SAME_ELEMENT_REPEAT_COUNT   ${p.repeatCount ?? '-'}`);
console.log(`  MAX_READS_FOR_ONE_ELEMENT   ${p.maxPerElement ?? '-'}`);
console.log(`  INTERVENING_LAYOUT_WRITES   ${p.writeDelta ?? '-'}`);
console.log(`  WRITE_SEQ_SPAN_PER_ELEMENT  ${JSON.stringify(p.perElementWriteSeqSpan ?? {})}`);
console.log(`  POST_RAF (call1/call2)      ${JSON.stringify(metrics.postRaf ?? {})}`);
console.log(`  REJECTED_OVERLAP_GBCR_COUNT ${JSON.stringify(metrics.rejectedOverlap ?? {})}`);
console.log('');
for (const f of fixtures) {
  console.log(`  ${f.ok ? 'PASS' : 'FAIL'}  ${f.name}`);
  if (!f.ok) console.log(`        ${String(f.error?.message || f.error).split('\n')[0]}`);
}
console.log('');
console.log(`CV-3.44: ${failed.length ? 'FAIL' : 'PASS'} — ${fixtures.length - failed.length}/${fixtures.length} fixtures, ${assertions} assertions`);
if (failed.length) {
  console.log('');
  for (const f of failed) console.log(`FAILED: ${f.name}\n${String(f.error?.message || f.error)}\n`);
  process.exit(1);
}
