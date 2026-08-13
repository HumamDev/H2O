#!/usr/bin/env node
// CV-3.36 — Question Timestamp geometry batching contract (Gate A).
//
// Proven live (paired A/B, 37-turn fixed workload): 2Z1a Question Timestamp
// cost 3012.795 ms total, of which 3006.964 ms (99.8%) was
// getBoundingClientRect. The cause is not measurement VOLUME but ORDERING:
// DOM_QT_ensureTimestamp performs layout-invalidating writes immediately
// before its two rect reads, inside a per-turn loop, so every mounted turn
// forces its own synchronous layout flush.
//
// This validator pins the SAFE contract only:
//
//     WRITES*  ->  GEOMETRY_READS*  ->  POSITION_WRITES*
//
// i.e. at most ONE write->read transition across a full reconciliation, with
// the geometry reads forming one contiguous phase — while the rect call count
// stays EXACTLY 2 per eligible turn, proving a future fix batches measurement
// rather than skipping it.
//
// Deliberately NOT required here: rect caching, selective measurement of
// unchanged turns, suppression of the full-document querySelectorAll passes,
// scheduling changes, or idempotent-write elimination. Those are separate
// decisions and must not be smuggled in through this gate.
//
// The real 2Z1a functions are extracted by name and executed against an
// instrumented DOM. No production source is modified.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const QT_PATH = 'src-runtime-base/2Z1a.🟡🕛 Question Timestamp 🕛.js';
const QT_SOURCE = fs.readFileSync(path.join(ROOT, QT_PATH), 'utf8');

const fixtures = [];
let assertions = 0;
function equal(actual, expected, message) {
  assertions += 1;
  assert.deepEqual(actual, expected, message);
}
function ok(value, message) {
  assertions += 1;
  assert.ok(value, message);
}
function fixture(name, run) {
  try { run(); fixtures.push({ name, ok: true }); }
  catch (error) { fixtures.push({ name, ok: false, error: String(error?.stack || error) }); }
}

// ── Source extraction (established convention) ────────────────────────────
function extractFunction(source, name) {
  const anchor = `  function ${name}(`;
  const start = source.indexOf(anchor);
  if (start < 0 || source.indexOf(anchor, start + anchor.length) >= 0) {
    throw new Error(`function-anchor-invalid:${name}`);
  }
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
// Registries and small helpers are `const X = ...;` at module indent.
function extractBinding(source, name) {
  const anchor = `\n  const ${name} = `;
  const found = source.indexOf(anchor);
  if (found < 0 || source.indexOf(anchor, found + anchor.length) >= 0) {
    throw new Error(`binding-anchor-invalid:${name}`);
  }
  const start = found + 1;
  let d = 0, q = '', esc = false, lc = false, bc = false;
  for (let i = found + anchor.length; i < source.length; i += 1) {
    const c = source[i], n = source[i + 1];
    if (lc) { if (c === '\n') lc = false; continue; }
    if (bc) { if (c === '*' && n === '/') { bc = false; i += 1; } continue; }
    if (q) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === q) q = ''; continue; }
    if (c === '/' && n === '/') { lc = true; i += 1; continue; }
    if (c === '/' && n === '*') { bc = true; i += 1; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if (c === '{' || c === '(' || c === '[') d += 1;
    else if (c === '}' || c === ')' || c === ']') d -= 1;
    else if (c === ';' && d === 0) return source.slice(start, i + 1);
    if (d < 0) throw new Error(`binding-boundary-invalid:${name}`);
  }
  throw new Error(`binding-boundary-invalid:${name}`);
}

// ── Instrumented DOM ──────────────────────────────────────────────────────
// Ordered operation log. A write is recorded ONLY when it targets a connected
// node, because a write to a detached element cannot invalidate document
// layout and must not be counted against the batching contract.
function createDom() {
  const ops = [];
  const log = (kind, op, el) => ops.push({ kind, op, id: el?.__id ?? null });

  let seq = 0;
  const unescape = (s) => s.replace(/\\(.)/g, '$1');

  function parseCompound(sel) {
    const out = { tag: null, classes: [], attrs: [] };
    let i = 0;
    const tagMatch = /^[a-zA-Z][a-zA-Z0-9]*/.exec(sel);
    if (tagMatch) { out.tag = tagMatch[0].toLowerCase(); i = tagMatch[0].length; }
    while (i < sel.length) {
      if (sel[i] === '.') {
        let j = i + 1, buf = '';
        while (j < sel.length && !'.['.includes(sel[j])) {
          if (sel[j] === '\\') { buf += sel[j + 1]; j += 2; continue; }
          buf += sel[j]; j += 1;
        }
        out.classes.push(buf); i = j;
      } else if (sel[i] === '[') {
        const end = sel.indexOf(']', i);
        const body = sel.slice(i + 1, end);
        const m = /^([^~*=\]]+)(?:([~*]?)=)?"?([^"]*)"?$/.exec(body);
        out.attrs.push({ name: m[1].trim(), mode: m[2] || (m[3] ? '' : null), value: unescape(m[3] || '') });
        i = end + 1;
      } else i += 1;
    }
    return out;
  }
  const selCache = new Map();
  const parseSelector = (sel) => {
    if (selCache.has(sel)) return selCache.get(sel);
    const parsed = String(sel).split(',').map((s) => parseCompound(s.trim())).filter(Boolean);
    selCache.set(sel, parsed);
    return parsed;
  };

  class ClassList {
    constructor(el) { this.el = el; }
    get _list() { return String(this.el.attributes.get('class') || '').split(/\s+/).filter(Boolean); }
    contains(c) { return this._list.includes(c); }
    add(...cs) { const l = new Set(this._list); cs.forEach((c) => l.add(c)); this.el.setAttribute('class', [...l].join(' ')); }
    remove(...cs) { const l = new Set(this._list); cs.forEach((c) => l.delete(c)); this.el.setAttribute('class', [...l].join(' ')); }
  }

  class El {
    constructor(tag) {
      this.tagName = String(tag).toUpperCase();
      this.attributes = new Map();
      this.children = [];
      this.parentElement = null;
      this.listeners = [];
      this._text = '';
      this.__id = ++seq;
      this.__rect = { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
      this.classList = new ClassList(this);
      const el = this;
      this.style = {
        props: new Map(),
        setProperty(k, v) { el.style.props.set(k, v); if (el.isConnected) log('W', 'style.setProperty', el); },
        getPropertyValue(k) { return el.style.props.get(k) ?? ''; },
      };
    }
    get isConnected() { let n = this; while (n.parentElement) n = n.parentElement; return n.__isRoot === true; }
    get firstChild() { return this.children[0] || null; }
    getAttribute(n) { return this.attributes.has(n) ? this.attributes.get(n) : null; }
    setAttribute(n, v) { this.attributes.set(n, String(v)); if (this.isConnected) log('W', `setAttribute:${n}`, this); }
    removeAttribute(n) { this.attributes.delete(n); if (this.isConnected) log('W', `removeAttribute:${n}`, this); }
    get textContent() { return this.children.length ? this.children.map((c) => c.textContent).join('') : this._text; }
    set textContent(v) { this._text = String(v); this.children = []; if (this.isConnected) log('W', 'textContent', this); }
    appendChild(c) { c.parentElement = this; this.children.push(c); if (this.isConnected) log('W', 'appendChild', this); return c; }
    insertBefore(c, ref) {
      c.parentElement = this;
      const idx = ref ? this.children.indexOf(ref) : -1;
      if (idx >= 0) this.children.splice(idx, 0, c); else this.children.push(c);
      if (this.isConnected) log('W', 'insertBefore', this);
      return c;
    }
    removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) { this.children.splice(i, 1); c.parentElement = null; if (this.isConnected) log('W', 'removeChild', this); } return c; }
    remove() { if (this.parentElement) this.parentElement.removeChild(this); }
    addEventListener(t, fn) { this.listeners.push({ t, fn }); }
    removeEventListener(t, fn) { this.listeners = this.listeners.filter((l) => !(l.t === t && l.fn === fn)); }
    getBoundingClientRect() { log('R', 'getBoundingClientRect', this); return { ...this.__rect }; }
    matchesCompound(c) {
      if (c.tag && this.tagName.toLowerCase() !== c.tag) return false;
      for (const cls of c.classes) if (!this.classList.contains(cls)) return false;
      for (const a of c.attrs) {
        const v = this.getAttribute(a.name);
        if (v === null) return false;
        if (a.mode === null) continue;
        if (a.mode === '') { if (v !== a.value) return false; }
        else if (a.mode === '~') { if (!v.split(/\s+/).includes(a.value)) return false; }
        else if (a.mode === '*') { if (!v.includes(a.value)) return false; }
      }
      return true;
    }
    matches(sel) { return parseSelector(sel).some((c) => this.matchesCompound(c)); }
    closest(sel) { let n = this; while (n) { if (n.matches && n.matches(sel)) return n; n = n.parentElement; } return null; }
    _descendants(out) { for (const c of this.children) { out.push(c); c._descendants(out); } return out; }
    querySelectorAll(sel) {
      const parsed = parseSelector(sel);
      const seen = new Set(); const res = [];
      for (const d of this._descendants([])) {
        if (seen.has(d)) continue;
        if (parsed.some((c) => d.matchesCompound(c))) { seen.add(d); res.push(d); }
      }
      return res;
    }
    querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  }

  const documentEl = new El('html');
  documentEl.__isRoot = true;
  const doc = {
    __root: documentEl,
    createElement: (t) => new El(t),
    querySelector: (s) => documentEl.querySelector(s),
    querySelectorAll: (s) => documentEl.querySelectorAll(s),
    getElementById: () => null,
    body: documentEl,
    head: documentEl,
  };
  return { doc, documentEl, ops, El };
}

// Build one eligible turn matching the real ChatGPT shape 2Z1a targets.
function buildTurn(dom, { index, createTime, barLeft, anchorLeft, withCopyBtn = true, withCreateTime = true }) {
  const { doc } = dom;
  const turnRoot = doc.createElement('div');
  turnRoot.setAttribute('class', 'group/turn-messages');

  const userMsg = doc.createElement('div');
  userMsg.setAttribute('data-message-author-role', 'user');
  if (withCreateTime) {
    userMsg[`__reactProps$fixture${index}`] = { message: { create_time: createTime } };
  }
  const anchor = doc.createElement('div');
  anchor.setAttribute('class', 'whitespace-pre-wrap');
  anchor.textContent = `Question ${index}`;
  anchor.__rect = { left: anchorLeft, top: 0, right: anchorLeft + 180, bottom: 20, width: 180, height: 20 };
  userMsg.appendChild(anchor);
  turnRoot.appendChild(userMsg);

  const outerBar = doc.createElement('div');
  outerBar.setAttribute('class', 'z-0 flex justify-end');
  outerBar.__rect = { left: barLeft, top: 30, right: barLeft + 400, bottom: 60, width: 400, height: 30 };
  const innerRow = doc.createElement('div');
  innerRow.setAttribute('class', 'flex flex-wrap items-center');
  if (withCopyBtn) {
    const copyBtn = doc.createElement('button');
    copyBtn.setAttribute('data-testid', 'copy-turn-action-button');
    innerRow.appendChild(copyBtn);
  }
  outerBar.appendChild(innerRow);
  turnRoot.appendChild(outerBar);

  return { turnRoot, userMsg, anchor, outerBar, innerRow };
}

// Load the real 2Z1a functions against the instrumented DOM.
function loadModule(dom) {
  const MOD = { diag: {}, state: {}, api: {} };
  const sandbox = {
    console, Object, String, Number, Math, Array, JSON, Set, Map, Date, isFinite,
    setTimeout: () => 0, clearTimeout: () => {},
    document: dom.doc,
    W: { H2O: {} },
    MOD,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);

  const BINDINGS = ['SkID', 'SEL_QTIMESTAMP_', 'ATTR_QTIMESTAMP_', 'CSS_QTIMESTAMP_', 'CFG_QTIMESTAMP_', 'UTIL_QTIMESTAMP_pad2'];
  // Discovered, not hardcoded: this validator asserts BEHAVIOUR, so it must
  // tolerate any helper decomposition of the reconciliation path.
  const FUNCTIONS = [...QT_SOURCE.matchAll(/^ {2}function ((?:DOM_QT|UTIL_QTIMESTAMP)_[A-Za-z0-9_]+)\(/gm)]
    .map((m) => m[1]);
  for (const required of ['DOM_QT_scan', 'DOM_QT_ensureTimestamp', 'UTIL_QTIMESTAMP_formatTimestamp']) {
    if (!FUNCTIONS.includes(required)) throw new Error(`required-entry-point-missing:${required}`);
  }
  const code = BINDINGS.map((n) => extractBinding(QT_SOURCE, n))
    .concat(FUNCTIONS.map((n) => extractFunction(QT_SOURCE, n)))
    .join('\n')
    + `\nglobalThis.__qt = { ${FUNCTIONS.join(', ')} };`;
  new vm.Script(code, { filename: QT_PATH }).runInContext(sandbox);
  return { api: sandbox.__qt, MOD, sandbox };
}

const INLINE_SEL = 'div[data-cgxui-qts-inline="1"]';
const N = 10;

function buildWorld(count = N, opts = {}) {
  const dom = createDom();
  const mod = loadModule(dom);
  const turns = [];
  for (let i = 0; i < count; i += 1) {
    const t = buildTurn(dom, {
      index: i,
      createTime: 1700000000 + i * 60,
      barLeft: 100,
      anchorLeft: 100 + (i * 20),
      ...(opts.turnOverride ? opts.turnOverride(i) : {}),
    });
    dom.documentEl.appendChild(t.turnRoot);
    turns.push(t);
  }
  dom.ops.length = 0;          // ignore fixture construction
  return { dom, mod, turns };
}

function phaseShape(ops) {
  const kinds = ops.filter((o) => o.kind === 'W' || o.kind === 'R');
  let transitions = 0;
  for (let i = 1; i < kinds.length; i += 1) {
    if (kinds[i - 1].kind === 'W' && kinds[i].kind === 'R') transitions += 1;
  }
  const readIdx = kinds.map((o, i) => (o.kind === 'R' ? i : -1)).filter((i) => i >= 0);
  const contiguous = readIdx.length === 0
    || (readIdx[readIdx.length - 1] - readIdx[0] + 1) === readIdx.length;
  // Once the positional write phase begins, no further geometry may be read.
  // Equivalent to: no write sits between the first and last geometry read.
  const firstRead = readIdx.length ? readIdx[0] : -1;
  const lastRead = readIdx.length ? readIdx[readIdx.length - 1] : -1;
  let writesInsideReadPhase = 0;
  for (let i = firstRead; i >= 0 && i <= lastRead; i += 1) {
    if (kinds[i].kind === 'W') writesInsideReadPhase += 1;
  }
  return {
    transitions,
    contiguous,
    rectCount: readIdx.length,
    firstRead,
    lastRead,
    writesInsideReadPhase,
    totalOps: kinds.length,
  };
}

// ══════════════════════════════════════════════════════════════════════════
// GATE A — the batching contract (expected RED against current product)
// ══════════════════════════════════════════════════════════════════════════
fixture('TIMESTAMP_RECONCILE_MUST_NOT_INTERLEAVE_LAYOUT_INVALIDATING_WRITES_WITH_PER_TURN_GEOMETRY_READS', () => {
  const { dom, mod } = buildWorld(N);
  mod.api.DOM_QT_scan(null);
  const shape = phaseShape(dom.ops);

  // Measurement volume must be preserved: the fix must BATCH, never SKIP.
  equal(shape.rectCount, 2 * N, `exactly 2 getBoundingClientRect per eligible turn (${2 * N})`);

  // The contract: WRITES* -> GEOMETRY_READS* -> POSITION_WRITES*
  ok(
    shape.transitions <= 1,
    `at most ONE write->read transition across a full reconciliation `
    + `(observed ${shape.transitions} for ${N} turns — per-turn forced layout)`,
  );
  ok(shape.contiguous, 'geometry reads form one contiguous measurement phase');
});

// ══════════════════════════════════════════════════════════════════════════
// POSITIVE CONTROLS — must hold now and after the fix
// ══════════════════════════════════════════════════════════════════════════
fixture('control A: new mount binds exactly one timestamp with the correct left', () => {
  const { dom, mod, turns } = buildWorld(N);
  mod.api.DOM_QT_scan(null);
  for (let i = 0; i < N; i += 1) {
    const inlines = turns[i].outerBar.querySelectorAll(INLINE_SEL);
    equal(inlines.length, 1, `turn ${i} has exactly one timestamp node`);
    equal(inlines[0].style.getPropertyValue('--cgxui-qts-left'), `${i * 20}px`, `turn ${i} left is anchorLeft-barLeft`);
  }
  equal(dom.ops.filter((o) => o.kind === 'R').length, 2 * N, 'measurement count unchanged');
});

fixture('control B: geometry stays live — moving the anchor rewrites left', () => {
  const { mod, turns } = buildWorld(N);
  mod.api.DOM_QT_scan(null);
  const t = turns[3];
  equal(t.outerBar.querySelector(INLINE_SEL).style.getPropertyValue('--cgxui-qts-left'), '60px', 'initial left');
  t.anchor.__rect = { ...t.anchor.__rect, left: 100 + 250 };
  mod.api.DOM_QT_scan(null);
  equal(
    t.outerBar.querySelector(INLINE_SEL).style.getPropertyValue('--cgxui-qts-left'),
    '250px',
    'a moved anchor is re-measured and repositioned (no caching)',
  );
});

fixture('control C: remounted turn rebinds and positions correctly', () => {
  const { dom, mod, turns } = buildWorld(N);
  mod.api.DOM_QT_scan(null);
  const victim = turns[5];
  victim.turnRoot.remove();
  const fresh = buildTurn(dom, { index: 5, createTime: 1700000300, barLeft: 100, anchorLeft: 100 + 140 });
  dom.documentEl.appendChild(fresh.turnRoot);
  mod.api.DOM_QT_scan(null);
  const inlines = fresh.outerBar.querySelectorAll(INLINE_SEL);
  equal(inlines.length, 1, 'remounted turn has exactly one timestamp');
  equal(inlines[0].style.getPropertyValue('--cgxui-qts-left'), '140px', 'remounted turn positioned correctly');
});

fixture('control D: repeated reconciliation creates no duplicate timestamp nodes', () => {
  const { mod, turns } = buildWorld(N);
  mod.api.DOM_QT_scan(null);
  mod.api.DOM_QT_scan(null);
  mod.api.DOM_QT_scan(null);
  for (let i = 0; i < N; i += 1) {
    equal(turns[i].outerBar.querySelectorAll(INLINE_SEL).length, 1, `turn ${i} still has exactly one timestamp`);
  }
});

fixture('control E: timestamp text semantics are unchanged', () => {
  const { mod, turns } = buildWorld(N);
  mod.api.DOM_QT_scan(null);
  for (let i = 0; i < N; i += 1) {
    const expected = mod.api.UTIL_QTIMESTAMP_formatTimestamp(1700000000 + i * 60);
    equal(turns[i].outerBar.querySelector(INLINE_SEL).textContent, expected, `turn ${i} renders the module's own format`);
  }
});

fixture('control F: ineligible turns are skipped exactly as today', () => {
  const dom = createDom();
  const mod = loadModule(dom);
  const noCopy = buildTurn(dom, { index: 0, createTime: 1700000000, barLeft: 100, anchorLeft: 220, withCopyBtn: false });
  const noTime = buildTurn(dom, { index: 1, createTime: 1700000060, barLeft: 100, anchorLeft: 240, withCreateTime: false });
  const good = buildTurn(dom, { index: 2, createTime: 1700000120, barLeft: 100, anchorLeft: 260 });
  [noCopy, noTime, good].forEach((t) => dom.documentEl.appendChild(t.turnRoot));
  dom.ops.length = 0;
  mod.api.DOM_QT_scan(null);
  equal(noCopy.outerBar.querySelectorAll(INLINE_SEL).length, 0, 'turn without a copy button is skipped');
  equal(noTime.outerBar.querySelectorAll(INLINE_SEL).length, 0, 'turn without a resolvable create-time is skipped');
  equal(good.outerBar.querySelectorAll(INLINE_SEL).length, 1, 'the eligible turn still binds');
  equal(dom.ops.filter((o) => o.kind === 'R').length, 2, 'only the eligible turn is measured');
});

// ── Report ────────────────────────────────────────────────────────────────
const failed = fixtures.filter((f) => !f.ok);
for (const f of failed) console.error(`FAIL ${f.name}\n${f.error}\n`);
for (const f of fixtures.filter((x) => x.ok)) console.log(`PASS ${f.name}`);

// Diagnostic snapshot of the current phase shape (always printed).
try {
  const { dom, mod } = buildWorld(N);
  mod.api.DOM_QT_scan(null);
  const shape = phaseShape(dom.ops);
  console.log(`\nphase shape @ N=${N}: rectCount=${shape.rectCount} writeToReadTransitions=${shape.transitions} `
    + `contiguousReads=${shape.contiguous} writesInsideReadPhase=${shape.writesInsideReadPhase} totalLoggedOps=${shape.totalOps}`);
} catch (e) { console.log('\nphase shape: unavailable —', String(e?.message || e)); }

console.log(`\nFixtures: ${fixtures.length - failed.length}/${fixtures.length}`);
console.log(`Assertions: ${assertions}`);
if (failed.length) {
  console.log('CV-3.36 question-timestamp geometry batching failed: ' + failed.length + ' fixture(s)');
  process.exit(1);
}
console.log('CV-3.36 question-timestamp geometry batching passed');
