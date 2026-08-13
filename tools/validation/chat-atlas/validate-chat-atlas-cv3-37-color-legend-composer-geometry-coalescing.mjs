#!/usr/bin/env node
// CV-3.37 — Color Legend same-frame composer geometry coalescing contract (Gate A).
//
// Proven live (paired A/B, 37-turn fixed workload, batched-Timestamp treatment):
// 1D1a Color Legend cost 3785.434 ms total, of which ~3753 ms (99.1%) was
// getBoundingClientRect beneath pickBestComposerSurface(). The live composer
// surface count is 1, so this is NOT a per-item batching problem — there is
// nothing to batch. The pathology is REDUNDANT_REMEASUREMENT enabled by an
// unfiltered, unthrottled MutationObserver on documentElement:
//
//     MutationObserver(documentElement, {childList:true, subtree:true})
//       -> syncLegendVisibility() -> mountButtonOnce() -> syncButtonMirrorGap()
//       -> followPanel()                                -> syncButtonMirrorGap()
//
// i.e. TWO full composer-geometry reconciliations per DOM mutation batch,
// including batches produced by native ChatGPT virtualization and by other H2O
// modules. Each reconciliation is the first reader after somebody else's
// pending layout invalidation, so it forces a synchronous full-document layout.
// Profile evidence for that: within ONE callback the first pass cost
// 3751.691 ms and the second, identical pass cost 0.131 ms (layout was already
// clean). In the profiled run the work produced no DOM change at all —
// btn.dataset.h2oLgShiftX was undefined and btn.style.transform was "".
//
// This validator pins the SAFE contract only:
//
//     MANY geometry requests within ONE animation frame
//       -> AT MOST ONE composer-gap reconciliation for that frame
//
// A later frame carrying another request may measure again, so geometry stays
// fresh at paint-frame granularity and no invalidation model is required.
//
// Deliberately NOT required here: MutationObserver filtering, rect caching,
// elimination of geometry, CSS/placement redesign, composer selector changes,
// the +/-120 clamp, the <1px no-op guard, visibility semantics, panel
// behaviour, or any global scroll change. Those are separate decisions and
// must not be smuggled in through this gate.
//
// The REAL 1D1a module is executed in full, as a self-booting IIFE, against an
// instrumented mini-DOM. It exports nothing, so every fixture drives it
// black-box through real production entry points only (DOM mutations, window
// events, the Control-Hub event, and a click on its own button).
// No production source is modified.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const LEGEND_PATH = 'src-runtime-base/1D1a.🟥🧭 Color Legend 🧭.js';
const LEGEND_SOURCE = fs.readFileSync(path.join(ROOT, LEGEND_PATH), 'utf8');

// Entry points this gate depends on. If the module is refactored so these no
// longer exist, the harness is no longer faithful and must fail loudly rather
// than silently proving nothing.
for (const required of [
  'function syncButtonMirrorGap(',
  'function getComposerRect(',
  'function pickBestComposerSurface(',
  'function mountButtonOnce(',
  'function syncLegendVisibility(',
  'function hideLegendUi(',
  'new MutationObserver(',
]) {
  if (!LEGEND_SOURCE.includes(required)) {
    throw new Error(`TEST_HARNESS_BLOCKED:required-entry-point-missing:${required}`);
  }
}

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
function atMost(actual, bound, message) {
  assertions += 1;
  assert.ok(actual <= bound, `${message} (got ${actual}, allowed <= ${bound})`);
}
function atLeast(actual, bound, message) {
  assertions += 1;
  assert.ok(actual >= bound, `${message} (got ${actual}, required >= ${bound})`);
}
function fixture(name, run) {
  try { run(); fixtures.push({ name, ok: true }); }
  catch (error) { fixtures.push({ name, ok: false, error: String(error?.stack || error) }); }
}

// ── Selector engine ───────────────────────────────────────────────────────
// Supports exactly what 1D1a uses: comma groups, descendant combinators, tag,
// #id, .class (with backslash escapes, e.g. form.group\/composer), [attr],
// [attr="v"], [attr*="v"], and the case-insensitive [attr*="v" i] flag.
const unescape = (s) => s.replace(/\\(.)/g, '$1');

function splitTop(sel, sep) {
  const out = [];
  let depth = 0, quote = '', buf = '';
  for (let i = 0; i < sel.length; i += 1) {
    const c = sel[i];
    if (quote) { buf += c; if (c === quote) quote = ''; continue; }
    if (c === '"' || c === "'") { quote = c; buf += c; continue; }
    if (c === '[') depth += 1;
    if (c === ']') depth -= 1;
    if (depth === 0 && ((sep === ',' && c === ',') || (sep === ' ' && /\s/.test(c)))) {
      if (buf.trim()) out.push(buf.trim());
      buf = '';
      continue;
    }
    buf += c;
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

function parseCompound(sel) {
  const out = { tag: null, id: null, classes: [], attrs: [] };
  let i = 0;
  const tagMatch = /^[a-zA-Z][a-zA-Z0-9-]*/.exec(sel);
  if (tagMatch) { out.tag = tagMatch[0].toLowerCase(); i = tagMatch[0].length; }
  while (i < sel.length) {
    const c = sel[i];
    if (c === '#' || c === '.') {
      let j = i + 1, buf = '';
      while (j < sel.length) {
        if (sel[j] === '\\') { buf += sel[j] + sel[j + 1]; j += 2; continue; }
        if (sel[j] === '.' || sel[j] === '#' || sel[j] === '[') break;
        buf += sel[j]; j += 1;
      }
      if (c === '#') out.id = unescape(buf); else out.classes.push(unescape(buf));
      i = j;
      continue;
    }
    if (c === '[') {
      const end = sel.indexOf(']', i);
      if (end < 0) throw new Error(`selector-unterminated-attr:${sel}`);
      const body = sel.slice(i + 1, end);
      const m = /^([a-zA-Z0-9_:-]+)(?:([*^$|~]?=)\s*"([^"]*)"|([*^$|~]?=)\s*'([^']*)')?\s*(i)?$/.exec(body.trim());
      if (!m) throw new Error(`selector-attr-unsupported:${body}`);
      const op = m[2] || m[4] || null;
      const value = m[3] !== undefined ? m[3] : m[5];
      out.attrs.push({ name: m[1], op, value, ci: !!m[6] });
      i = end + 1;
      continue;
    }
    throw new Error(`selector-token-unsupported:${sel.slice(i)}`);
  }
  return out;
}

const selectorCache = new Map();
function parseSelector(sel) {
  if (selectorCache.has(sel)) return selectorCache.get(sel);
  const groups = splitTop(sel, ',').map((g) => splitTop(g, ' ').map(parseCompound));
  selectorCache.set(sel, groups);
  return groups;
}

function matchesCompound(el, c) {
  if (c.tag && el.tagName.toLowerCase() !== c.tag) return false;
  if (c.id !== null && el.getAttribute('id') !== c.id) return false;
  if (c.classes.length) {
    const list = String(el.getAttribute('class') || '').split(/\s+/).filter(Boolean);
    for (const cls of c.classes) if (!list.includes(cls)) return false;
  }
  for (const a of c.attrs) {
    const raw = el.getAttribute(a.name);
    if (raw === null) return false;
    if (a.op === null) continue;
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
  for (const chain of parseSelector(sel)) {
    if (!matchesCompound(el, chain[chain.length - 1])) continue;
    let ok2 = true, node = el.parentElement;
    for (let k = chain.length - 2; k >= 0; k -= 1) {
      let found = null;
      while (node) { if (matchesCompound(node, chain[k])) { found = node; break; } node = node.parentElement; }
      if (!found) { ok2 = false; break; }
      node = found.parentElement;
    }
    if (ok2) return true;
  }
  return false;
}

// ── Instrumented mini-DOM ─────────────────────────────────────────────────
function createEnv() {
  const state = {
    rectCalls: [],          // connected-node getBoundingClientRect calls, in order
    writes: [],             // layout-invalidating writes on connected nodes
    observers: [],
    microtasks: [],
    raf: [],
    timers: new Map(),
    timerSeq: 0,
    now: 0,
    seq: 0,
  };

  class MStyle {
    setProperty(k, v) { this[k] = String(v); }
    getPropertyValue(k) { return this[k] === undefined ? '' : this[k]; }
    removeProperty(k) { delete this[k]; }
  }

  const parseTranslateX = (t) => {
    const m = /translateX\((-?[\d.]+)px\)/.exec(String(t || ''));
    return m ? Number(m[1]) : 0;
  };

  class MEl {
    constructor(tag) {
      this.tagName = String(tag).toUpperCase();
      this.__id = (state.seq += 1);
      this.__mark = null;
      this.__attrs = new Map();
      this.__listeners = new Map();
      this.__baseRect = null;
      this.childNodes = [];
      this.parentNode = null;
      this.style = new MStyle();
      this.dataset = {};
      this.__text = '';
      this.value = '';
    }
    get parentElement() { return this.parentNode; }
    get children() { return this.childNodes.filter((n) => n instanceof MEl); }
    get isConnected() {
      let n = this;
      while (n) { if (n === documentElement) return true; n = n.parentNode; }
      return false;
    }
    get id() { return this.getAttribute('id') || ''; }
    set id(v) { this.setAttribute('id', String(v)); }
    get className() { return this.getAttribute('class') || ''; }
    set className(v) { this.setAttribute('class', String(v)); }
    get textContent() { return this.__text; }
    set textContent(v) { this.__text = String(v); this.__clearChildren(); }
    get innerHTML() { return ''; }
    set innerHTML(v) { if (!String(v)) this.__clearChildren(); }

    __clearChildren() {
      for (const c of this.childNodes.slice()) c.parentNode = null;
      if (this.childNodes.length) recordMutation(this, [], this.childNodes.slice());
      this.childNodes = [];
    }
    setAttribute(name, value) {
      this.__attrs.set(String(name), String(value));
      if (this.isConnected) state.writes.push({ op: 'setAttribute', id: this.__id, mark: this.__mark, name });
    }
    getAttribute(name) { const v = this.__attrs.get(String(name)); return v === undefined ? null : v; }
    hasAttribute(name) { return this.__attrs.has(String(name)); }
    removeAttribute(name) { this.__attrs.delete(String(name)); }
    appendChild(node) {
      if (node.parentNode) node.parentNode.__detach(node);
      node.parentNode = this;
      this.childNodes.push(node);
      if (this.isConnected) state.writes.push({ op: 'appendChild', id: node.__id, mark: node.__mark });
      recordMutation(this, [node], []);
      return node;
    }
    append(...nodes) { for (const n of nodes) this.appendChild(n); }
    __detach(node) {
      const i = this.childNodes.indexOf(node);
      if (i >= 0) this.childNodes.splice(i, 1);
    }
    removeChild(node) {
      const connected = this.isConnected;
      this.__detach(node);
      node.parentNode = null;
      if (connected) state.writes.push({ op: 'removeChild', id: node.__id, mark: node.__mark });
      recordMutation(this, [], [node]);
      return node;
    }
    remove() { if (this.parentNode) this.parentNode.removeChild(this); }
    contains(other) { let n = other; while (n) { if (n === this) return true; n = n.parentNode; } return false; }
    matches(sel) { return matchesSelector(this, sel); }
    closest(sel) { let n = this; while (n) { if (n instanceof MEl && matchesSelector(n, sel)) return n; n = n.parentNode; } return null; }
    __descendants(out = []) {
      for (const c of this.childNodes) { if (c instanceof MEl) { out.push(c); c.__descendants(out); } }
      return out;
    }
    querySelector(sel) { for (const el of this.__descendants()) if (matchesSelector(el, sel)) return el; return null; }
    querySelectorAll(sel) { return this.__descendants().filter((el) => matchesSelector(el, sel)); }
    addEventListener(type, fn, opts) {
      const capture = opts === true || (opts && opts.capture === true);
      if (!this.__listeners.has(type)) this.__listeners.set(type, []);
      this.__listeners.get(type).push({ fn, capture });
    }
    removeEventListener(type, fn) {
      const l = this.__listeners.get(type);
      if (!l) return;
      const i = l.findIndex((e) => e.fn === fn);
      if (i >= 0) l.splice(i, 1);
    }
    dispatchEvent(evt) { return dispatchOn(this, evt); }
    focus() {}
    getBoundingClientRect() {
      const b = this.__baseRect || { left: 0, top: 0, width: 0, height: 0 };
      if (this.isConnected) {
        state.rectCalls.push({ id: this.__id, mark: this.__mark, tag: this.tagName });
      }
      const tx = parseTranslateX(this.style.transform);
      return {
        left: b.left + tx, right: b.left + b.width + tx,
        top: b.top, bottom: b.top + b.height,
        width: b.width, height: b.height,
      };
    }
    get offsetWidth() { return (this.__baseRect || {}).width || 0; }
    get offsetHeight() { return (this.__baseRect || {}).height || 0; }
  }

  function recordMutation(target, added, removed) {
    for (const entry of state.observers) {
      if (!entry.opts.childList) continue;
      const inScope = entry.node === target || (entry.opts.subtree && entry.node.contains(target));
      if (!inScope) continue;
      entry.obs.__records.push({ type: 'childList', target, addedNodes: added, removedNodes: removed });
      if (!entry.obs.__queued) {
        entry.obs.__queued = true;
        state.microtasks.push(() => {
          entry.obs.__queued = false;
          const recs = entry.obs.__records.splice(0);
          if (recs.length) entry.obs.__cb(recs, entry.obs);
        });
      }
    }
  }

  function dispatchOn(target, evt) {
    evt.target = target;
    let stopped = false;
    evt.stopPropagation = () => { stopped = true; };
    evt.preventDefault = () => { evt.defaultPrevented = true; };
    const pathNodes = [];
    let n = target;
    while (n) { pathNodes.push(n); n = n.parentNode; }
    if (target !== windowObj) pathNodes.push(documentObj, windowObj);
    for (let i = pathNodes.length - 1; i >= 0 && !stopped; i -= 1) {
      const l = pathNodes[i].__listeners?.get(evt.type) || [];
      for (const e of l.slice()) if (e.capture || pathNodes[i] === target) e.fn.call(pathNodes[i], evt);
    }
    for (let i = 0; i < pathNodes.length && !stopped; i += 1) {
      const l = pathNodes[i].__listeners?.get(evt.type) || [];
      for (const e of l.slice()) if (!e.capture && pathNodes[i] !== target) e.fn.call(pathNodes[i], evt);
    }
    return !evt.defaultPrevented;
  }

  class MMutationObserver {
    constructor(cb) { this.__cb = cb; this.__records = []; this.__queued = false; }
    observe(node, opts) { state.observers.push({ obs: this, node, opts: opts || {} }); }
    disconnect() { for (let i = state.observers.length - 1; i >= 0; i -= 1) if (state.observers[i].obs === this) state.observers.splice(i, 1); }
    takeRecords() { return this.__records.splice(0); }
  }

  const documentElement = new MEl('html');
  const head = new MEl('head');
  const body = new MEl('body');
  documentElement.appendChild(head);
  documentElement.appendChild(body);

  const documentObj = {
    __listeners: new Map(),
    documentElement, head, body,
    createElement: (tag) => new MEl(tag),
    createTextNode: (t) => { const e = new MEl('#text'); e.__text = String(t); return e; },
    getElementById: (id) => documentElement.__descendants().find((e) => e.getAttribute('id') === id) || null,
    querySelector: (s) => documentElement.querySelector(s),
    querySelectorAll: (s) => documentElement.querySelectorAll(s),
    addEventListener: MEl.prototype.addEventListener,
    removeEventListener: MEl.prototype.removeEventListener,
    dispatchEvent(evt) { return dispatchOn(this, evt); },
    contains: (n) => documentElement.contains(n),
  };

  const storage = new Map();
  const localStorage = {
    getItem: (k) => (storage.has(String(k)) ? storage.get(String(k)) : null),
    setItem: (k, v) => storage.set(String(k), String(v)),
    removeItem: (k) => storage.delete(String(k)),
  };

  const windowObj = {
    __listeners: new Map(),
    innerWidth: 1440,
    innerHeight: 900,
    // visualViewport intentionally absent: 1D1a guards on `if (W.visualViewport)`.
    addEventListener: MEl.prototype.addEventListener,
    removeEventListener: MEl.prototype.removeEventListener,
    dispatchEvent(evt) { return dispatchOn(this, evt); },
    setTimeout: (fn, ms) => { const id = (state.timerSeq += 1); state.timers.set(id, { fn, at: state.now + (ms || 0), repeat: 0 }); return id; },
    clearTimeout: (id) => state.timers.delete(id),
    setInterval: (fn, ms) => { const id = (state.timerSeq += 1); state.timers.set(id, { fn, at: state.now + (ms || 0), repeat: ms || 1 }); return id; },
    clearInterval: (id) => state.timers.delete(id),
    localStorage,
  };

  const sandbox = {
    window: windowObj,
    document: documentObj,
    localStorage,
    location: { pathname: '/c/11111111-2222-3333-4444-555555555555', href: 'https://chatgpt.com/c/x' },
    performance: { now: () => state.now },
    MutationObserver: MMutationObserver,
    requestAnimationFrame: (fn) => { state.raf.push(fn); return state.raf.length; },
    cancelAnimationFrame: () => {},
    setTimeout: windowObj.setTimeout,
    clearTimeout: windowObj.clearTimeout,
    setInterval: windowObj.setInterval,
    clearInterval: windowObj.clearInterval,
    console,
    JSON, Math, Number, String, Object, Array, Boolean, Date, RegExp, Error, isNaN, parseInt, parseFloat,
  };
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;

  const api = {
    state, sandbox, documentObj, windowObj, documentElement, body, head, localStorage, MEl,
    el(tag, { cls, attrs, mark, rect, text } = {}) {
      const e = new MEl(tag);
      if (cls) e.className = cls;
      if (attrs) for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
      if (mark) e.__mark = mark;
      if (rect) e.__baseRect = rect;
      if (text !== undefined) e.__text = text;
      return e;
    },
    setRect(elm, rect) { elm.__baseRect = rect; },
    boot() { vm.runInNewContext(LEGEND_SOURCE, sandbox, { filename: LEGEND_PATH }); },
    flushMicrotasks(limit = 200) {
      let n = 0;
      while (state.microtasks.length && n < limit) { state.microtasks.shift()(); n += 1; }
    },
    flushFrame() {
      const queue = state.raf.splice(0);
      for (const fn of queue) fn(state.now);
    },
    advance(ms) {
      state.now += ms;
      for (const [id, t] of [...state.timers.entries()]) {
        if (t.at <= state.now) {
          if (t.repeat) t.at = state.now + t.repeat; else state.timers.delete(id);
          t.fn();
        }
      }
    },
    fire(target, type, props = {}) {
      const evt = { type, defaultPrevented: false, ...props };
      return dispatchOn(target, evt);
    },
    reset() { state.rectCalls.length = 0; state.writes.length = 0; },
    rectCalls: () => state.rectCalls.length,
    marked: (mark) => state.rectCalls.filter((r) => r.mark === mark).length,
    // A completed syncButtonMirrorGap geometry pass is uniquely identified by a
    // rect read of the LEFT nav button (1D1a:755 is its only call site).
    reconciliations: () => state.rectCalls.filter((r) => r.mark === 'nav-left-btn').length,
    writes: () => state.writes.length,
  };
  return api;
}

// ── Fixture scene ─────────────────────────────────────────────────────────
// Deterministic layout. Numbers chosen so the mirror-gap math yields exact,
// distinct, non-zero shifts across frames, including one that exercises the
// +/-120 clamp:
//
//   targetGap    = composer.left  - navLeftBtn.right
//   baseLeft     = legendBtn.left - activeShift          (transform-aware)
//   baseGap      = baseLeft       - composer.right
//   desiredShift = clamp(round(targetGap - baseGap), -120, 120)
const COMPOSER_BASE = { left: 336, top: 800, width: 768, height: 52 }; // right 1104
const NAV_LEFT_BTN = { left: 160, top: 820, width: 40, height: 46 };   // right 200
const LEGEND_BTN = { left: 1200, top: 820, width: 7, height: 46 };

function buildScene(env, { navRightSlot = true, legendEnabled = true } = {}) {
  const { el, body } = env;

  // Control Hub state — the real gate read by isLegendEnabledFromControlHub().
  env.localStorage.setItem(
    'h2o:prm:cgx:cntrlhb:state:hub:v1',
    JSON.stringify({ minimap: { mmLegend: legendEnabled } }),
  );

  // Representative composer ancestry: form.group/composer > div > surface > input.
  const main = el('main');
  const form = el('form', { cls: 'group/composer w-full', attrs: { 'data-type': 'unified-composer' } });
  const rel = el('div', { cls: 'relative' });
  const surface = el('div', {
    cls: 'bg-(--composer-surface-primary) cursor-text',
    attrs: { 'data-composer-surface': 'true' },
    mark: 'composer-surface',
    rect: { ...COMPOSER_BASE },
  });
  const input = el('div', { attrs: { id: 'prompt-textarea', contenteditable: 'true' }, mark: 'composer-input', rect: { ...COMPOSER_BASE } });
  surface.appendChild(input);
  rel.appendChild(surface);
  form.appendChild(rel);
  main.appendChild(form);
  body.appendChild(main);

  // Transcript container — the target for unrelated mutations.
  const transcript = el('div', { cls: 'group/thread', mark: 'transcript' });
  main.appendChild(transcript);

  // Nav slots (owned by 1A2b in production; here only their contract matters).
  const navLeft = el('div', {
    cls: 'cgxui-nav-box-left',
    attrs: { 'data-cgxui-owner': 'nvcn', 'data-cgxui': 'nvcn-nav-box-left' },
    mark: 'nav-left-slot',
  });
  const navLeftBtn = el('button', { cls: 'cgxui-nav-btn', mark: 'nav-left-btn', rect: { ...NAV_LEFT_BTN } });
  navLeft.appendChild(navLeftBtn);
  body.appendChild(navLeft);

  let navRight = null;
  if (navRightSlot) navRight = attachNavRight(env);

  return { main, form, surface, input, transcript, navLeft, navLeftBtn, navRight };
}

function attachNavRight(env) {
  const navRight = env.el('div', {
    cls: 'cgxui-nav-box-right',
    attrs: { 'data-cgxui-owner': 'nvcn', 'data-cgxui': 'nvcn-nav-box-right' },
    mark: 'nav-right-slot',
  });
  env.body.appendChild(navRight);
  return navRight;
}

// The legend button is created by the module itself; tag it so rect reads on
// it are attributable, and give it a deterministic layout box.
function adoptLegendButton(env) {
  const btn = env.documentElement.querySelector('.h2o-lg-fbtn');
  if (btn && !btn.__mark) { btn.__mark = 'legend-btn'; btn.__baseRect = { ...LEGEND_BTN }; }
  return btn;
}

function bootScene(env, opts) {
  const scene = buildScene(env, opts);
  env.boot();
  env.flushMicrotasks();
  env.flushFrame();
  scene.btn = adoptLegendButton(env);
  return scene;
}

// Drive the module to a settled state: measured, written, and stable, so that
// further passes are pure waste — exactly the live condition in which
// btn.dataset.h2oLgShiftX stops changing.
function settle(env, scene, rounds = 4) {
  for (let i = 0; i < rounds; i += 1) {
    mutateUnrelated(env, scene);
    env.flushFrame();
  }
}

let mutationSeq = 0;
function mutateUnrelated(env, scene) {
  mutationSeq += 1;
  const node = env.el('div', { cls: `turn-${mutationSeq}`, mark: 'unrelated' });
  scene.transcript.appendChild(node);
  env.flushMicrotasks();
  return node;
}

const expectedShift = (composerRect, btnLeftMeasured, activeShift) => {
  const targetGap = composerRect.left - (NAV_LEFT_BTN.left + NAV_LEFT_BTN.width);
  const baseLeft = btnLeftMeasured - activeShift;
  const baseGap = baseLeft - (composerRect.left + composerRect.width);
  return Math.max(-120, Math.min(120, Math.round(targetGap - baseGap)));
};

// ══ PRIMARY GATE ══════════════════════════════════════════════════════════
const K_MUTATIONS = 20;
// One completed reconciliation reads exactly four connected rects:
//   1. candidate composer surface  (pickBestComposerSurface:679)
//   2. selected composer surface   (getComposerRect:638)
//   3. left nav button             (syncButtonMirrorGap:755)
//   4. legend button               (syncButtonMirrorGap:756)
const RECTS_PER_PASS = 4;

const gate = { reconciliations: null, rectCalls: null, writes: null, breakdown: null };

fixture('COLOR_LEGEND_MUST_NOT_MEASURE_COMPOSER_GEOMETRY_ONCE_PER_UNRELATED_DOM_MUTATION_BATCH', () => {
  const env = createEnv();
  const scene = bootScene(env);
  ok(scene.btn && scene.btn.isConnected, 'precondition: legend button mounted in nav-right slot');
  settle(env, scene);

  env.reset();
  // K unrelated childList mutation notifications, all before the next frame.
  // They touch neither the composer surface, nor nav-left, nor nav-right, they
  // do not remove the legend button, and they change no Color Legend setting.
  for (let i = 0; i < K_MUTATIONS; i += 1) mutateUnrelated(env, scene);
  env.flushFrame(); // exactly ONE animation frame

  gate.reconciliations = env.reconciliations();
  gate.rectCalls = env.rectCalls();
  gate.writes = env.state.writes.filter((w) => w.mark === 'legend-btn').length;
  gate.breakdown = env.state.rectCalls.reduce((acc, r) => {
    acc[r.mark || '(untagged)'] = (acc[r.mark || '(untagged)'] || 0) + 1;
    return acc;
  }, {});

  atMost(
    gate.reconciliations, 1,
    `${K_MUTATIONS} unrelated same-frame mutation batches must coalesce into at most ONE composer-gap geometry reconciliation`,
  );
  atMost(
    gate.rectCalls, RECTS_PER_PASS,
    `same-frame burst must cost at most one normal geometry pass (${RECTS_PER_PASS} connected getBoundingClientRect calls)`,
  );
});

// ══ CONTROL H / anti-degeneracy: cross-frame measurement stays live ═══════
fixture('control H: a genuine geometry request on a later frame must measure again', () => {
  const env = createEnv();
  const scene = bootScene(env);
  settle(env, scene);

  const frames = [
    { left: 336, expect: 40 },   // targetGap 136, baseGap  96 -> +40
    { left: 300, expect: -32 },  // targetGap 100, baseGap 132 -> -32
    { left: 400, expect: 120 },  // targetGap 200, baseGap  32 -> +168, clamped to +120
  ];

  let activeShift = Number(scene.btn.dataset.h2oLgShiftX || '0');
  frames.forEach((f, idx) => {
    env.setRect(scene.surface, { ...COMPOSER_BASE, left: f.left });
    env.setRect(scene.input, { ...COMPOSER_BASE, left: f.left });
    env.reset();

    mutateUnrelated(env, scene);
    env.flushFrame();

    atLeast(env.reconciliations(), 1, `frame ${idx + 1}: geometry must still be measured (no cache, no one-shot suppression)`);
    const want = expectedShift({ ...COMPOSER_BASE, left: f.left }, LEGEND_BTN.left + activeShift, activeShift);
    equal(want, f.expect, `frame ${idx + 1}: fixture arithmetic self-check`);
    equal(scene.btn.style.transform, `translateX(${f.expect}px)`, `frame ${idx + 1}: exact shift applied`);
    equal(scene.btn.dataset.h2oLgShiftX, String(f.expect), `frame ${idx + 1}: shift recorded`);
    activeShift = f.expect;
  });
});

// ══ CONTROL A: resize ═════════════════════════════════════════════════════
fixture('control A: resize measures geometry on the next frame and yields the correct shift', () => {
  const env = createEnv();
  const scene = bootScene(env);
  settle(env, scene);

  const activeShift = Number(scene.btn.dataset.h2oLgShiftX || '0');
  env.setRect(scene.surface, { ...COMPOSER_BASE, left: 300 });
  env.setRect(scene.input, { ...COMPOSER_BASE, left: 300 });
  env.reset();

  env.fire(env.windowObj, 'resize');
  env.flushMicrotasks();
  env.flushFrame();

  atLeast(env.reconciliations(), 1, 'resize must produce a geometry reconciliation');
  const want = expectedShift({ ...COMPOSER_BASE, left: 300 }, LEGEND_BTN.left + activeShift, activeShift);
  equal(scene.btn.style.transform, `translateX(${want}px)`, 'resize yields the correct shift');
});

// ══ CONTROL B: real composer geometry change ══════════════════════════════
fixture('control B: a real composer geometry change produces the new exact translateX', () => {
  const env = createEnv();
  const scene = bootScene(env);
  settle(env, scene);

  const activeShift = Number(scene.btn.dataset.h2oLgShiftX || '0');
  const moved = { ...COMPOSER_BASE, left: 260, width: 820 };
  env.setRect(scene.surface, moved);
  env.setRect(scene.input, moved);
  env.reset();

  mutateUnrelated(env, scene);
  env.flushFrame();

  const want = expectedShift(moved, LEGEND_BTN.left + activeShift, activeShift);
  atLeast(env.reconciliations(), 1, 'a real geometry change must be measured');
  equal(scene.btn.style.transform, `translateX(${want}px)`, 'new exact translateX applied');
  ok(Math.abs(want) <= 120, 'clamp respected');
});

// ══ CONTROL C: external button removal ════════════════════════════════════
fixture('control C: external removal of the legend button remounts exactly one, positioned', () => {
  const env = createEnv();
  const scene = bootScene(env);
  settle(env, scene);

  scene.btn.remove();
  ok(!scene.btn.isConnected, 'precondition: button detached');
  env.flushMicrotasks();
  env.reset();

  mutateUnrelated(env, scene);
  env.flushFrame();

  const found = env.documentElement.querySelectorAll('.h2o-lg-fbtn');
  equal(found.length, 1, 'exactly one legend button after remount');
  ok(found[0].isConnected, 'remounted button is connected');
  equal(found[0].parentElement, scene.navRight, 'remounted into the nav-right slot');
  atLeast(env.reconciliations(), 1, 'remount is followed by a positioning pass within one frame');
});

// ══ CONTROL D: late nav-right slot ════════════════════════════════════════
fixture('control D: a nav-right slot appearing after boot still mounts the legend', () => {
  const env = createEnv();
  const scene = bootScene(env, { navRightSlot: false });
  equal(env.documentElement.querySelectorAll('.h2o-lg-fbtn').length, 0, 'no button while the slot is absent');

  scene.navRight = attachNavRight(env);
  env.flushMicrotasks();
  env.flushFrame();
  const btn = adoptLegendButton(env);

  ok(btn && btn.isConnected, 'legend button mounts once the slot appears');
  equal(btn.parentElement, scene.navRight, 'mounted into the late nav-right slot');
  equal(env.documentElement.querySelectorAll('.h2o-lg-fbtn').length, 1, 'exactly one button');
});

// ══ CONTROL E: visibility must stay prompt ════════════════════════════════
fixture('control E: disabling via the Control Hub hides the legend promptly, not on a later frame', () => {
  const env = createEnv();
  const scene = bootScene(env);
  settle(env, scene);
  ok(scene.btn.isConnected, 'precondition: legend visible');

  env.localStorage.setItem(
    'h2o:prm:cgx:cntrlhb:state:hub:v1',
    JSON.stringify({ minimap: { mmLegend: false } }),
  );
  env.fire(env.windowObj, 'h2o.ev:prm:cgx:cntrlhb:changed:v1', { detail: { featureKey: 'minimap', optKey: 'mmLegend' } });

  // Asserted BEFORE any frame flush: a future geometry scheduler must not
  // defer semantic visibility state behind a frame.
  equal(env.documentElement.querySelectorAll('.h2o-lg-fbtn').length, 0, 'legend hidden synchronously on the control event');
  equal(env.documentElement.querySelectorAll('.h2o-lg-dd').length, 0, 'no orphaned dropdown left behind');
});

// ══ CONTROL F: panel placement still gets current composer geometry ═══════
fixture('control F: opening the panel still obtains current composer geometry', () => {
  const env = createEnv();
  const scene = bootScene(env);
  settle(env, scene);
  env.reset();

  env.fire(scene.btn, 'click', { clientY: LEGEND_BTN.top + 4, button: 0 });
  env.flushMicrotasks();
  env.flushFrame();

  const panels = env.body.children.filter((c) => c !== scene.main && String(c.className || '').includes('h2o-lg'));
  ok(panels.length >= 1, 'panel mounted on click');
  atLeast(env.marked('composer-surface'), 1, 'panel placement measured current composer geometry (overlap avoidance)');
  atLeast(env.reconciliations(), 1, 'panel placement performed a mirror-gap reconciliation');
});

// ══ CONTROL G: no duplicate UI under repeated bursts ══════════════════════
fixture('control G: repeated mutation bursts create exactly one legend UI structure', () => {
  const env = createEnv();
  const scene = bootScene(env);
  settle(env, scene);

  for (let burst = 0; burst < 5; burst += 1) {
    for (let i = 0; i < 8; i += 1) mutateUnrelated(env, scene);
    env.flushFrame();
  }

  equal(env.documentElement.querySelectorAll('.h2o-lg-fbtn').length, 1, 'exactly one legend button');
  equal(env.documentElement.querySelectorAll('.h2o-lg-dd').length, 0, 'no dropdown created by mutation activity');
  equal(env.documentElement.querySelectorAll('#h2o-legend-style').length, 1, 'style element mounted exactly once');
});

// ── Report ────────────────────────────────────────────────────────────────
const failed = fixtures.filter((f) => !f.ok);
for (const f of fixtures) {
  console.log(`${f.ok ? 'PASS' : 'FAIL'} ${f.name}`);
  if (!f.ok) console.log(f.error.split('\n').slice(0, 6).map((l) => `       ${l}`).join('\n'));
}
console.log('');
console.log(`Gate observation @ K=${K_MUTATIONS} unrelated same-frame mutation batches:`);
console.log(`  geometry reconciliations = ${gate.reconciliations}  (contract: <= 1)`);
console.log(`  connected rect calls     = ${gate.rectCalls}  (contract: <= ${RECTS_PER_PASS})`);
console.log(`  legend-button writes     = ${gate.writes}  (live profile showed the equivalent work produced none)`);
console.log(`  measured elements        = ${JSON.stringify(gate.breakdown)}`);
console.log('');
console.log(`Fixtures: ${fixtures.length - failed.length}/${fixtures.length}`);
console.log(`Assertions: ${assertions}`);
if (failed.length) {
  console.log('CV-3.37 color legend composer geometry coalescing FAILED');
  process.exit(1);
}
console.log('CV-3.37 color legend composer geometry coalescing passed');
