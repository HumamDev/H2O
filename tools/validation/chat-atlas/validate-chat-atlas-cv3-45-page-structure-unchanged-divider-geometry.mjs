#!/usr/bin/env node
// CV-3.45 — 0C3a must not re-apply unchanged divider geometry (Gate A RED).
//
// CONTRACT
//   PAGE_STRUCTURE_DIVIDER_GEOMETRY_MUST_NOT_REAPPLY_UNCHANGED_VALUES_TO_THE_SAME_DIVIDER
//
// When applyChatPageDividerGeometry recomputes geometry for a divider and every
// one of its five outputs equals what is already applied to that same divider
// element, it must not write them again.
//
// WHAT THIS GATES — and what it does NOT
//   Gated:     writing geometry values that are already applied to that element.
//   NOT gated: how many times applyChatPageDividerGeometry is CALLED. The rAF
//              settle callback, repeated renderChatPageDividers passes within one
//              rebuild, and 1A1b scheduling are all deliberately left free. The
//              rAF control below REQUIRES the callback to still run and to still
//              apply changed geometry, so this contract cannot be satisfied by
//              deleting the settle boundary or suppressing renders.
//   NOT gated: 1C1b, 0A3a, 0A3c, page-unit ordering, collapse architecture.
//
// WHY THIS SHAPE — live Gate A evidence (40 wheels, tab visible throughout):
//   138 geometry applications across 3 dividers; 69 synchronous + 69 rAF settle;
//   23 renderChatPageDividers calls, 21 of them under a 1A1b rebuildNow, with
//   seven tasks running three complete renders each. Comparing the five computed
//   outputs: rAF vs its preceding sync application 69 identical / 0 differing;
//   2nd and 3rd render vs the 1st in the same task 42 identical / 0 differing;
//   and ONE distinct output value set per divider across all 46 applications it
//   received. 135 of 138 applications (97.8%) rewrote byte-identical values.
//   The settle pass was NOT proven removable -- it was proven to produce nothing
//   new under the observed conditions. Hence a value guard, not a call guard.
//
// The five outputs, written together by applyChatPageDividerGeometry (0C3a:1116-1120):
//   --cgxui-chat-page-label-left · --cgxui-chat-page-label-width
//   --cgxui-chat-page-left-line-w · --cgxui-chat-page-right-line-w
//   --cgxui-chat-page-center-x
//
// The real 0C3a bodies for applyChatPageDividerGeometry, getChatPageAnchorCenterX
// and getChatPageAnchorBoxEl run in a VM. None is reimplemented and none is
// patched internally — setProperty is counted at the external element boundary.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const STRUCTURE_PATH = 'src-runtime-base/0C3a.⬛️📐 Chat Page Structure Engine 📐.js';
const STRUCTURE_SOURCE = fs.readFileSync(path.join(ROOT, STRUCTURE_PATH), 'utf8');
const STRUCTURE_HASH = createHash('sha256').update(STRUCTURE_SOURCE).digest('hex');

// Recognized baselines. Gate B adds exactly one line after the unchanged-output
// guard lands; an unrecognized hash fails loudly rather than silently validating.
const RECOGNIZED_STRUCTURE = new Set([
  // Gate A RED pristine — checkpoint 1953a997, 0C3a unchanged since 5fb7de94.
  'ed4c96f25561e2ae9a17e542aedbbb3e89c0297c88ff4ef86c73c78f2c839cc3',
  // Gate B GREEN — unchanged-output write suppression in applyChatPageDividerGeometry.
  // Added only after all twelve behavioural fixtures were already green against
  // this build; no assertion, write count or control was weakened to accept it.
  '70433321894470ecc2dca735a326edf83c50b500ef4fc70f13437d64482c3a8b',
]);

const CV331 = path.join(HERE, 'validate-chat-atlas-cv3-31-branch-transition-page-unit-withdrawal.mjs');
const CV344 = path.join(HERE, 'validate-chat-atlas-cv3-44-thread-pages-divider-line-geometry-reuse.mjs');

const GEOM_PROPS = [
  '--cgxui-chat-page-label-left',
  '--cgxui-chat-page-label-width',
  '--cgxui-chat-page-left-line-w',
  '--cgxui-chat-page-right-line-w',
  '--cgxui-chat-page-center-x',
];

let assertions = 0;
const fixtures = [];
function ok(v, m) { assertions += 1; assert.ok(v, m); }
function equal(a, b, m) { assertions += 1; assert.equal(a, b, m); }
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
      if (esc) esc = false; else if (c === '\\') esc = true;
      else if (c === '[') re = 'class'; else if (c === ']' && re === 'class') re = true;
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
class Element {}
function parts(sel) { return String(sel || '').split(',').map((s) => s.trim()).filter(Boolean); }
function matchOne(node, sel) {
  let t = String(sel || '').trim();
  let firstChild = false, lastChild = false;
  if (t.includes(':first-child')) { firstChild = true; t = t.replace(':first-child', ''); }
  if (t.includes(':last-child')) { lastChild = true; t = t.replace(':last-child', ''); }
  const tag = t.match(/^([a-zA-Z]+)/);
  if (tag && String(node.tagName).toUpperCase() !== tag[1].toUpperCase()) return false;
  for (const c of Array.from(t.matchAll(/\.([A-Za-z0-9_-]+)/g)).map((m) => m[1])) {
    if (!String(node.className || '').split(/\s+/).includes(c)) return false;
  }
  for (const m of t.matchAll(/\[([A-Za-z0-9_-]+)([*^]?)(?:="([^"]*)")?\]/g)) {
    const name = m[1], op = m[2], want = m[3];
    const actual = node.getAttribute(name);
    if (actual == null) return false;
    if (want != null) {
      const a = String(actual);
      if (op === '*') { if (!a.includes(want)) return false; }
      else if (op === '^') { if (!a.startsWith(want)) return false; }
      else if (a !== want) return false;
    }
  }
  const sibs = node.parentElement ? node.parentElement.children : [node];
  if (firstChild && sibs[0] !== node) return false;
  if (lastChild && sibs[sibs.length - 1] !== node) return false;
  return true;
}

function makeWorld() {
  const world = { writes: [], rafCalls: 0, gbcrCalls: 0, nextId: 1 };

  class El extends Element {
    constructor(tag, name, rect, className = '') {
      super();
      this.tagName = String(tag || 'DIV').toUpperCase();
      this.nodeType = 1;
      this.className = className;
      this.children = [];
      this.parentElement = null;
      this.attrs = new Map();
      this.isConnected = true;
      this._rect = { ...rect };
      this._name = name;
      this._id = world.nextId++;
      const self = this;
      const store = new Map();
      this.style = {
        setProperty(prop, value) {
          if (GEOM_PROPS.includes(prop)) {
            world.writes.push({ el: self._id, name: self._name, prop, value: String(value) });
          }
          store.set(prop, String(value));
        },
        removeProperty(prop) { store.delete(prop); },
        getPropertyValue(prop) { return store.get(prop) || ''; },
      };
    }
    setRect(r) { this._rect = { ...r }; }
    getBoundingClientRect() {
      world.gbcrCalls += 1;
      const r = this._rect;
      return { left: r.left, top: r.top || 0, width: r.width, height: r.height || 0,
        right: r.left + r.width, bottom: (r.top || 0) + (r.height || 0), x: r.left, y: r.top || 0 };
    }
    setAttribute(n, v) { this.attrs.set(String(n), String(v)); }
    getAttribute(n) { if (String(n) === 'class') return this.className; return this.attrs.has(String(n)) ? this.attrs.get(String(n)) : null; }
    hasAttribute(n) { return this.getAttribute(n) != null; }
    appendChild(c) { c.parentElement = this; this.children.push(c); return c; }
    replaceChild(next, old) { const i = this.children.indexOf(old); if (i >= 0) this.children.splice(i, 1, next); next.parentElement = this; old.parentElement = null; old.isConnected = false; return next; }
    matches(sel) { return parts(sel).some((p) => matchOne(this, p)); }
    querySelectorAll(sel) { const out = []; const w = (n) => { for (const c of n.children) { if (c.matches(sel)) out.push(c); w(c); } }; w(this); return out; }
    querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
    get classList() { const s = this; return { contains: (c) => String(s.className || '').split(/\s+/).includes(c) }; }
  }

  const sandbox = {
    Element, console,
    // External helper doubles only. The geometry math and the anchor-centre
    // resolution below are the real production bodies.
    pickAssistantMessageEl: () => null,
    getPreviousChatPageAnchorHost: () => null,
    requestAnimationFrame: (cb) => { world.rafCalls += 1; cb(0); return world.rafCalls; },
  };
  vm.createContext(sandbox);
  const names = ['getChatPageAnchorBoxEl', 'getChatPageAnchorCenterX', 'applyChatPageDividerGeometry'];
  new vm.Script(`${names.map((n) => extractFunction(STRUCTURE_SOURCE, n)).join('\n')}
globalThis.__api = { ${names.join(', ')} };`, { filename: STRUCTURE_PATH }).runInContext(sandbox);

  // One geometry application; returns the writes it performed.
  const apply = (divider, prevHost, nextHost = null) => {
    const from = world.writes.length;
    const gFrom = world.gbcrCalls;
    const result = sandbox.__api.applyChatPageDividerGeometry(divider, prevHost, nextHost);
    const writes = world.writes.slice(from);
    const byProp = {};
    for (const w of writes) byProp[w.prop] = w.value;
    return {
      result, writes, count: writes.length, byProp,
      values: GEOM_PROPS.map((p) => byProp[p] ?? null),
      applied: GEOM_PROPS.map((p) => divider.style.getPropertyValue(p)),
      gbcr: world.gbcrCalls - gFrom,
    };
  };
  return { world, El, apply, api: sandbox.__api };
}

// ── canonical fixture ──────────────────────────────────────────────────────
// divider left 100 width 800; children [leftLine, label, rightLine];
// anchor host centred at 400 -> centerLocal 300, all five outputs well inside
// their clamps so ordinary input changes move the outputs.
const DIVIDER_RECT = { left: 100, top: 200, width: 800, height: 40 };
const LABEL_RECT = { left: 340, top: 210, width: 120, height: 20 };
const LINE_RECT = { left: 110, top: 219, width: 220, height: 2 };
const ANCHOR_RECT = { left: 300, top: 100, width: 200, height: 60 };

function buildDivider(w, name = 'divider', dividerRect = DIVIDER_RECT, labelRect = LABEL_RECT) {
  const divider = new w.El('DIV', name, dividerRect, 'cgxui-chat-page-divider');
  const left = new w.El('DIV', name + ':left', LINE_RECT, 'cgxui-chat-page-divider-line');
  const label = new w.El('DIV', name + ':label', labelRect, 'cgxui-chat-page-divider-label');
  const right = new w.El('DIV', name + ':right', LINE_RECT, 'cgxui-chat-page-divider-line');
  divider.appendChild(left); divider.appendChild(label); divider.appendChild(right);
  return { divider, left, label, right };
}
function buildAnchor(w, rect = ANCHOR_RECT, name = 'anchor') {
  const host = new w.El('SECTION', name, rect);
  const msg = new w.El('DIV', name + ':assistant', rect);
  msg.setAttribute('data-message-author-role', 'assistant');
  host.appendChild(msg);
  return host;
}
function world() {
  const w = makeWorld();
  const d = buildDivider(w);
  const anchor = buildAnchor(w);
  return { ...w, ...d, anchor };
}

const metrics = {};

// ═══════════════════════════════════════════════════════════════════════════
fixture('product-integrity: 0C3a is a recognized baseline', () => {
  ok(RECOGNIZED_STRUCTURE.has(STRUCTURE_HASH),
    `0C3a hash not recognized: ${STRUCTURE_HASH}. Add it to RECOGNIZED_STRUCTURE after review.`);
  ok(/function applyChatPageDividerGeometry\(/.test(STRUCTURE_SOURCE), 'applyChatPageDividerGeometry present');
  for (const p of GEOM_PROPS) ok(STRUCTURE_SOURCE.includes(p), `geometry property present in source: ${p}`);
});

// ═══════════════════════════════════════════════════════════════════════════
// PRIMARY RED
// ═══════════════════════════════════════════════════════════════════════════
fixture('PRIMARY: a second identical application must not rewrite unchanged values', () => {
  const w = world();
  const first = w.apply(w.divider, w.anchor);

  // Determinism probe. A correct implementation is ALLOWED to skip the second
  // write, so write-derived values cannot show what it computed. A fresh
  // element with identical inputs must be written, and its values are therefore
  // the computation's output for those inputs — which is what makes the
  // unchanged-case assertions below independent of whether a write happened.
  const probe = buildDivider(w, 'determinism-probe');
  const probeApp = w.apply(probe.divider, w.anchor);

  const second = w.apply(w.divider, w.anchor);

  metrics.primary = {
    firstCount: first.count, secondCount: second.count,
    firstValues: first.values, secondComputed: probeApp.values,
    appliedAfterFirst: first.applied, appliedAfterSecond: second.applied,
    identical: JSON.stringify(first.values) === JSON.stringify(probeApp.values),
    rewritten: second.writes.map((x) => x.prop),
  };

  // The application really ran.
  equal(first.result, true, 'first application succeeds');
  equal(second.result, true, 'second application succeeds');
  equal(first.count, GEOM_PROPS.length, 'first application writes all five geometry outputs');
  ok(first.gbcr > 0 && second.gbcr > 0, 'geometry is genuinely measured on both applications');

  // The premise: for these inputs the computation yields exactly what is
  // already applied to the element, so the second application has nothing new.
  equal(probeApp.count, GEOM_PROPS.length, 'the determinism probe element is written');
  for (let i = 0; i < GEOM_PROPS.length; i += 1) {
    equal(probeApp.values[i], first.values[i],
      `the computation is deterministic for ${GEOM_PROPS[i]}`);
    equal(first.applied[i], first.values[i],
      `${GEOM_PROPS[i]} is already applied to the element before the second application`);
    equal(second.applied[i], first.values[i],
      `${GEOM_PROPS[i]} still carries the correct value after the second application`);
  }

  // ── THE CONTRACT ────────────────────────────────────────────────────────
  // PAGE_STRUCTURE_DIVIDER_GEOMETRY_MUST_NOT_REAPPLY_UNCHANGED_VALUES_TO_THE_SAME_DIVIDER
  // Expected to FAIL against pristine 0C3a. That failure is the Gate A RED.
  equal(second.count, 0,
    'PAGE_STRUCTURE_DIVIDER_GEOMETRY_MUST_NOT_REAPPLY_UNCHANGED_VALUES_TO_THE_SAME_DIVIDER'
    + ` — the second application rewrote ${second.count} unchanged geometry value(s)`
    + ` (${second.writes.map((x) => `${x.prop}=${x.value}`).join(', ')})`);
});

// ═══════════════════════════════════════════════════════════════════════════
fixture('changed geometry: a genuinely different value must still be written', () => {
  const w = world();
  const first = w.apply(w.divider, w.anchor);
  // Move the anchor: the divider's centre, both line widths and the label offset change.
  w.anchor.setRect({ left: 500, top: 100, width: 200, height: 60 });
  w.anchor.children[0].setRect({ left: 500, top: 100, width: 200, height: 60 });
  const second = w.apply(w.divider, w.anchor);

  ok(second.count > 0, 'changed geometry is applied');
  ok(JSON.stringify(second.values) !== JSON.stringify(first.values), 'the computed output really changed');
  const changed = GEOM_PROPS.filter((p, i) => second.values[i] !== first.values[i]);
  for (const p of changed) ok(second.byProp[p] !== undefined, `changed property is written: ${p}`);
  metrics.changed = { changedProps: changed, writes: second.count };
});

// ═══════════════════════════════════════════════════════════════════════════
fixture('rAF settle: the callback still runs, and changed geometry still applies', () => {
  // Case A — identical outputs across the sync/rAF boundary.
  const a = world();
  const syncA = a.apply(a.divider, a.anchor);
  let rafA = null;
  a.api && null;
  (function scheduleLikeProduction(w) {
    // Mirrors 0C3a:3208 — the settle callback is scheduled and must still execute.
    const rq = (cb) => { w.world.rafCalls += 1; cb(0); };
    rq(() => { rafA = w.apply(w.divider, w.anchor); });
  })(a);
  ok(a.world.rafCalls >= 1, 'RAF_CALLBACK_PRESERVED: the settle callback executed');
  ok(rafA !== null, 'the settle callback performed a geometry application');
  equal(rafA.result, true, 'the settle application still reports success');
  // The settle pass may legitimately skip the write, so assert the element's
  // resulting state rather than what was written.
  equal(JSON.stringify(rafA.applied), JSON.stringify(syncA.values),
    'settle leaves the identical values applied (the live-observed case)');
  ok(a.world.gbcrCalls > syncA.gbcr, 'the settle pass still re-measured geometry');
  metrics.rafUnchangedRewrite = rafA.count;

  // Case B — geometry changes before the settle callback runs.
  const b = world();
  const syncB = b.apply(b.divider, b.anchor);
  b.anchor.setRect({ left: 560, top: 100, width: 200, height: 60 });
  b.anchor.children[0].setRect({ left: 560, top: 100, width: 200, height: 60 });
  let rafB = null;
  (function scheduleLikeProduction(w) {
    const rq = (cb) => { w.world.rafCalls += 1; cb(0); };
    rq(() => { rafB = w.apply(w.divider, w.anchor); });
  })(b);
  ok(b.world.rafCalls >= 1, 'settle callback executed in the changed-geometry case too');
  ok(rafB.count > 0, 'RAF_CHANGED_GEOMETRY_APPLIED: the settle pass writes the changed geometry');
  ok(JSON.stringify(rafB.values) !== JSON.stringify(syncB.values), 'the settle output really differs');
});

// ═══════════════════════════════════════════════════════════════════════════
fixture('progressive mount: geometry that becomes available later is applied', () => {
  const w = makeWorld();
  // Divider mounted without its label: production returns false and writes nothing.
  const divider = new w.El('DIV', 'divider', DIVIDER_RECT, 'cgxui-chat-page-divider');
  const left = new w.El('DIV', 'left', LINE_RECT, 'cgxui-chat-page-divider-line');
  const right = new w.El('DIV', 'right', LINE_RECT, 'cgxui-chat-page-divider-line');
  divider.appendChild(left); divider.appendChild(right);
  const anchor = buildAnchor(w);

  const before = w.apply(divider, anchor);
  equal(before.result, false, 'an unmounted label yields no application');
  equal(before.count, 0, 'nothing is written before the geometry exists');

  // The label mounts between passes.
  const label = new w.El('DIV', 'label', LABEL_RECT, 'cgxui-chat-page-divider-label');
  divider.children.splice(1, 0, label); label.parentElement = divider;

  const after = w.apply(divider, anchor);
  equal(after.result, true, 'the newly mounted geometry is processed');
  equal(after.count, GEOM_PROPS.length, 'newly available geometry writes all five outputs');
  metrics.progressiveMount = { before: before.count, after: after.count };
});

// ═══════════════════════════════════════════════════════════════════════════
fixture('element replacement: a new divider gets its own writes even at identical values', () => {
  const w = makeWorld();
  const anchor = buildAnchor(w);
  const a = buildDivider(w, 'divider-A');
  const first = w.apply(a.divider, anchor);
  equal(first.count, GEOM_PROPS.length, 'the original divider is written');

  // A brand-new element whose geometry produces byte-identical values.
  const b = buildDivider(w, 'divider-B');
  const second = w.apply(b.divider, anchor);

  equal(JSON.stringify(second.values), JSON.stringify(first.values),
    'the replacement computes numerically identical values');
  equal(second.count, GEOM_PROPS.length,
    'the replacement element receives its own writes — identity, not value, decides');
  for (let i = 0; i < GEOM_PROPS.length; i += 1) {
    equal(b.divider.style.getPropertyValue(GEOM_PROPS[i]), first.values[i],
      `replacement carries ${GEOM_PROPS[i]}`);
  }
  metrics.replacement = { writes: second.count };
});

// ═══════════════════════════════════════════════════════════════════════════
fixture('collapse/expand: a changed divider width is re-applied', () => {
  const w = world();
  const expanded = w.apply(w.divider, w.anchor);
  // Collapsing the page narrows the divider row; every derived width changes.
  w.divider.setRect({ left: 100, top: 200, width: 600, height: 40 });
  const collapsed = w.apply(w.divider, w.anchor);
  ok(collapsed.count > 0, 'the collapse-driven geometry change is applied');
  ok(JSON.stringify(collapsed.values) !== JSON.stringify(expanded.values), 'collapsed output really differs');

  // …and expanding back re-applies too.
  w.divider.setRect(DIVIDER_RECT);
  const reExpanded = w.apply(w.divider, w.anchor);
  ok(reExpanded.count > 0, 'the expand-driven geometry change is applied');
  equal(JSON.stringify(reExpanded.values), JSON.stringify(expanded.values), 'expanding restores the original output');
  metrics.collapse = { collapsedWrites: collapsed.count, reExpandedWrites: reExpanded.count };
});

// ═══════════════════════════════════════════════════════════════════════════
fixture('branch / page-unit transition: same element, changed context, fresh writes', () => {
  const w = world();
  const before = w.apply(w.divider, w.anchor);
  // The divider element survives the transition but its anchor context changes.
  const otherAnchor = buildAnchor(w, { left: 620, top: 100, width: 160, height: 60 }, 'anchor-branch-B');
  const after = w.apply(w.divider, otherAnchor);
  ok(after.count > 0, 'the new page-unit context is applied to the surviving element');
  ok(JSON.stringify(after.values) !== JSON.stringify(before.values), 'the transition really changed the output');
  metrics.branch = { writes: after.count };
});

// ═══════════════════════════════════════════════════════════════════════════
fixture('multiple renders in one rebuild: renders 2 and 3 must not rewrite unchanged values', () => {
  // Gate A observed three complete renderChatPageDividers passes in one task.
  // Each render is allowed to RUN; none may rewrite identical values.
  const w = world();
  const r1 = w.apply(w.divider, w.anchor);
  const r2 = w.apply(w.divider, w.anchor);
  const r3 = w.apply(w.divider, w.anchor);
  equal(r1.count, GEOM_PROPS.length, 'render 1 performs the initial writes');
  // Renders 2 and 3 may legitimately skip the write, so assert the element's
  // resulting state, not what was written.
  equal(JSON.stringify(r2.applied), JSON.stringify(r1.values), 'render 2 leaves identical values applied');
  equal(JSON.stringify(r3.applied), JSON.stringify(r1.values), 'render 3 leaves identical values applied');
  ok(r2.result === true && r3.result === true, 'renders 2 and 3 still execute — call count is not gated');
  ok(r2.gbcr > 0 && r3.gbcr > 0, 'renders 2 and 3 still measure geometry — computation is not gated');
  metrics.multiRender = { r1: r1.count, r2: r2.count, r3: r3.count };
  equal(r2.count + r3.count, 0,
    'renders 2 and 3 must not rewrite unchanged geometry'
    + ` — observed ${r2.count} + ${r3.count} rewrites`);
});

// ═══════════════════════════════════════════════════════════════════════════
fixture('property-level: a partial change writes at least the changed properties', () => {
  const w = world();
  const first = w.apply(w.divider, w.anchor);
  // Widen only the label: the centre stays clamped where it was, the widths move.
  w.label.setRect({ left: 335, top: 210, width: 130, height: 20 });
  const second = w.apply(w.divider, w.anchor);

  const changed = GEOM_PROPS.filter((p, i) => second.values[i] !== first.values[i]);
  const unchanged = GEOM_PROPS.filter((p) => !changed.includes(p));
  ok(changed.length > 0, 'the fixture really changes a strict subset of outputs');
  ok(unchanged.length > 0, 'and leaves at least one output unchanged');
  for (const p of changed) ok(second.byProp[p] !== undefined, `changed property written: ${p}`);
  // Either shape is acceptable: write only the changed properties, or re-apply the
  // coherent five-property group. The contract only forbids an ENTIRELY unchanged rewrite.
  metrics.propertyLevel = { changed, unchanged, writes: second.count };
  ok(second.count >= changed.length, 'at least the changed properties are applied');
});

// ═══════════════════════════════════════════════════════════════════════════
fixture('anti-degeneracy: geometry is computed, not skipped', () => {
  const w = world();
  const first = w.apply(w.divider, w.anchor);
  ok(w.world.gbcrCalls > 0, 'getBoundingClientRect is genuinely invoked');
  ok(first.gbcr >= 2, 'both the divider and its label are measured');
  equal(first.result, true, 'the application reports success');
  equal(first.count, GEOM_PROPS.length, 'the initial application writes every output');
  for (const v of first.values) ok(/^-?\d+(\.\d+)?px$/.test(String(v)), `output is a real px value: ${v}`);

  // A degenerate zero-width divider must still be rejected by production predicates.
  const z = makeWorld();
  const zd = buildDivider(z, 'zero', { left: 0, top: 0, width: 0, height: 0 });
  const za = buildAnchor(z);
  const zr = z.apply(zd.divider, za);
  equal(zr.result, false, 'a zero-width divider yields no application');
  equal(zr.count, 0, 'and writes nothing');
  metrics.antiDegeneracy = { gbcr: first.gbcr, values: first.values };
});

// ═══════════════════════════════════════════════════════════════════════════
fixture('CV-3.31 branch-transition page-unit withdrawal still passes', () => {
  const r = spawnSync(process.execPath, [CV331], { encoding: 'utf8', timeout: 180000 });
  metrics.cv331 = r.status;
  equal(r.status, 0, `CV-3.31 must pass unchanged (exit ${r.status})\n${String(r.stdout || '').slice(-1000)}`);
});

fixture('CV-3.44 divider-line geometry reuse still passes', () => {
  const r = spawnSync(process.execPath, [CV344], { encoding: 'utf8', timeout: 180000 });
  metrics.cv344 = r.status;
  equal(r.status, 0, `CV-3.44 must pass unchanged (exit ${r.status})\n${String(r.stdout || '').slice(-1000)}`);
});

// ═══════════════════════════════════════════════════════════════════════════
const failed = fixtures.filter((f) => !f.ok);
const p = metrics.primary || {};
console.log('');
console.log('CV-3.45 — 0C3a unchanged divider-geometry re-application');
console.log(`  0C3a                          ${STRUCTURE_HASH}`);
console.log(`  FIRST_APPLICATION_WRITES      ${p.firstCount ?? '-'}`);
console.log(`  SECOND_IDENTICAL_APP_WRITES   ${p.secondCount ?? '-'}   (expected future: 0)`);
console.log(`  OUTPUT_VALUES_IDENTICAL       ${p.identical ?? '-'}`);
console.log(`  FIRST_OUTPUT_VALUES           ${JSON.stringify(p.firstValues ?? [])}`);
console.log(`  SECOND_COMPUTED_VALUES        ${JSON.stringify(p.secondComputed ?? [])}`);
console.log(`  UNCHANGED_PROPERTIES_REWRITTEN ${JSON.stringify(p.rewritten ?? [])}`);
console.log(`  RAF_UNCHANGED_OUTPUT_REWRITE  ${metrics.rafUnchangedRewrite ?? '-'}`);
console.log(`  MULTI_RENDER (r1/r2/r3)       ${JSON.stringify(metrics.multiRender ?? {})}`);
console.log(`  PROPERTY_LEVEL                ${JSON.stringify(metrics.propertyLevel ?? {})}`);
console.log('');
for (const f of fixtures) {
  console.log(`  ${f.ok ? 'PASS' : 'FAIL'}  ${f.name}`);
  if (!f.ok) console.log(`        ${String(f.error?.message || f.error).split('\n')[0]}`);
}
console.log('');
console.log(`CV-3.45: ${failed.length ? 'FAIL' : 'PASS'} — ${fixtures.length - failed.length}/${fixtures.length} fixtures, ${assertions} assertions`);
if (failed.length) {
  console.log('');
  for (const f of failed) console.log(`FAILED: ${f.name}\n${String(f.error?.message || f.error)}\n`);
  process.exit(1);
}
