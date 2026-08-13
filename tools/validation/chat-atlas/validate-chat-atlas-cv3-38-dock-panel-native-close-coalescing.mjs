#!/usr/bin/env node
// CV-3.38 — Dock Panel same-frame native-close discovery coalescing (Gate A).
//
// Proven live (matched paired A/B, 37-turn workload): 3A1a Dock Panel rose
// 405.659 -> 3545.514 ms once Color Legend stopped monopolising the main
// thread. The cost sits in one pathway:
//
//   CORE_DP_bindRailObserversOnce()
//     -> S.moRail MutationObserver(documentElement, {childList,subtree})
//        -> UI_DPANEL_scheduleRailEnsure()   [ALREADY rAF-coalesced]
//        -> UI_DP_nativeClose_sync()         [NOT coalesced]  <-- the defect
//             -> UI_DP_nativeClose_find()
//                  -> UI_DP_getLeftSidebar()          (cheap: ~0.6% of cost)
//                  -> close-sidebar-button query      (cheap: ~0.6% of cost)
//                  -> DOM_DP_isVisible(btn)           (~91% of cost)
//                       -> getComputedStyle(btn)      forced STYLE recalc
//                       -> offsetParent / getClientRects()  forced LAYOUT
//
// A passive live probe measured the full find() at 0.0070 ms with layout clean
// versus 0.2617 ms with layout dirty — 37x — and 40 consecutive discovery
// passes returned 0 nulls and exactly 1 distinct node. So the repeated scans
// re-derive an identical answer and, because of the identity guard at the tail
// of UI_DP_nativeClose_sync, rebind nothing. The document scans are NOT the
// problem; the forced style+layout visibility check is.
//
// This validator pins the SAFE contract only:
//
//     MANY mutation-driven native-close requests within ONE animation frame
//       -> AT MOST ONE native-close discovery/visibility pass that frame
//
// A request on a later frame discovers again, and the explicit Dock-open path
// stays prompt. Deliberately NOT required here: caching the close node,
// removing DOM_DP_isVisible or its layout reads, filtering the MutationObserver,
// moving code into S.railRAF specifically, or any Dock open/close semantic
// change. Those are separate decisions and must not be smuggled in.
//
// The REAL 3A1a module is executed in full as a self-booting IIFE against an
// instrumented mini-DOM and driven black-box through its own observer, its own
// events, and its own VAULT.api. No production function is extracted, stubbed,
// or re-implemented, and no production source is modified.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const DOCK_PATH = 'src-runtime-base/3A1a.🟧🎖️ Dock Panel 🎖️.js';
const DOCK_SOURCE = fs.readFileSync(path.join(ROOT, DOCK_PATH), 'utf8');

// Entry points this gate depends on. If the module is refactored so these no
// longer exist, the harness is no longer faithful and must fail loudly.
for (const required of [
  'function UI_DP_nativeClose_sync(',
  'function UI_DP_nativeClose_find(',
  'function UI_DP_nativeClose_applyState(',
  'function UI_DP_getLeftSidebar(',
  'function DOM_DP_isVisible(',
  'function CORE_DP_bindRailObserversOnce(',
  'S.moRail = new MutationObserver(',
]) {
  if (!DOCK_SOURCE.includes(required)) {
    throw new Error(`TEST_HARNESS_BLOCKED:required-entry-point-missing:${required}`);
  }
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

// ── Selector engine ───────────────────────────────────────────────────────
// Covers what 3A1a uses: comma groups, descendant combinators, tag, #id,
// .class (backslash escapes), [attr], [attr="v"], [attr*="v"]. Selector syntax
// outside that set is recorded and treated as no-match rather than throwing,
// so an unsupported selector can never silently masquerade as a real result.
const unsupportedSelectors = new Set();
const unesc = (s) => s.replace(/\\(.)/g, '$1');

function splitTop(sel, sep) {
  const out = []; let depth = 0, quote = '', buf = '';
  for (const c of sel) {
    if (quote) { buf += c; if (c === quote) quote = ''; continue; }
    if (c === '"' || c === "'") { quote = c; buf += c; continue; }
    if (c === '[' || c === '(') depth += 1;
    if (c === ']' || c === ')') depth -= 1;
    if (depth === 0 && ((sep === ',' && c === ',') || (sep === ' ' && /\s/.test(c)))) {
      if (buf.trim()) out.push(buf.trim());
      buf = ''; continue;
    }
    buf += c;
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

function parseCompound(sel) {
  const out = { tag: null, id: null, classes: [], attrs: [] };
  let i = 0;
  const tag = /^[a-zA-Z][a-zA-Z0-9-]*/.exec(sel);
  if (tag) { out.tag = tag[0].toLowerCase(); i = tag[0].length; }
  while (i < sel.length) {
    const c = sel[i];
    if (c === '#' || c === '.') {
      let j = i + 1, buf = '';
      while (j < sel.length) {
        if (sel[j] === '\\') { buf += sel[j] + sel[j + 1]; j += 2; continue; }
        if (sel[j] === '.' || sel[j] === '#' || sel[j] === '[') break;
        buf += sel[j]; j += 1;
      }
      if (c === '#') out.id = unesc(buf); else out.classes.push(unesc(buf));
      i = j; continue;
    }
    if (c === '[') {
      const end = sel.indexOf(']', i);
      if (end < 0) throw new Error('unsupported');
      const m = /^([a-zA-Z0-9_:-]+)(?:([*^$|~]?=)\s*"([^"]*)"|([*^$|~]?=)\s*'([^']*)')?\s*(i)?$/.exec(sel.slice(i + 1, end).trim());
      if (!m) throw new Error('unsupported');
      out.attrs.push({ name: m[1], op: m[2] || m[4] || null, value: m[3] !== undefined ? m[3] : m[5], ci: !!m[6] });
      i = end + 1; continue;
    }
    throw new Error('unsupported');
  }
  return out;
}

const selCache = new Map();
function parseSelector(sel) {
  if (selCache.has(sel)) return selCache.get(sel);
  let parsed = null;
  try { parsed = splitTop(sel, ',').map((g) => splitTop(g, ' ').map(parseCompound)); }
  catch { unsupportedSelectors.add(sel); parsed = null; }
  selCache.set(sel, parsed);
  return parsed;
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

// ── Instrumented mini-DOM ─────────────────────────────────────────────────
function createEnv() {
  const state = {
    // Black-box API counters, keyed by whether the target is the native close.
    cs: { close: 0, other: 0 },        // getComputedStyle
    op: { close: 0, other: 0 },        // offsetParent reads
    rects: { close: 0, other: 0 },     // getClientRects
    listenerOps: [],                   // {op:'add'|'remove', id, type, capture}
    nativeCloseAttrWrites: [],         // set/remove of data-h2o-native-close
    microtasks: [], raf: [], idle: [], timers: new Map(),
    timerSeq: 0, now: 0, seq: 0, observers: [],
  };

  class MStyle {
    setProperty(k, v) { this[k] = String(v); }
    getPropertyValue(k) { return this[k] === undefined ? '' : this[k]; }
    removeProperty(k) { delete this[k]; }
  }

  class MEl {
    constructor(tag) {
      this.tagName = String(tag).toUpperCase();
      this.__id = (state.seq += 1);
      this.__mark = null;
      this.__attrs = new Map();
      this.__listeners = new Map();
      this.__vis = { display: 'block', visibility: 'visible', opacity: '1' };
      this.__rect = { left: 0, top: 0, width: 100, height: 40 };
      this.childNodes = [];
      this.parentNode = null;
      this.style = new MStyle();
      this.dataset = {};
      this.__text = '';
    }
    get parentElement() { return this.parentNode; }
    get children() { return this.childNodes.filter((n) => n instanceof MEl); }
    get isConnected() { let n = this; while (n) { if (n === documentElement) return true; n = n.parentNode; } return false; }
    get id() { return this.getAttribute('id') || ''; }
    set id(v) { this.setAttribute('id', String(v)); }
    get className() { return this.getAttribute('class') || ''; }
    set className(v) { this.setAttribute('class', String(v)); }
    get textContent() {
      if (this.childNodes.length) return this.childNodes.map((c) => c.textContent).join('');
      return this.__text;
    }
    set textContent(v) { this.__clear(); this.__text = String(v); }
    get innerHTML() { return ''; }
    set innerHTML(v) { this.__clear(); for (const n of parseHTML(String(v))) this.appendChild(n); }

    __clear() { for (const c of this.childNodes) c.parentNode = null; this.childNodes = []; this.__text = ''; }
    setAttribute(n, v) {
      this.__attrs.set(String(n), String(v));
      if (String(n) === 'data-h2o-native-close') state.nativeCloseAttrWrites.push({ op: 'set', value: String(v) });
    }
    getAttribute(n) { const v = this.__attrs.get(String(n)); return v === undefined ? null : v; }
    hasAttribute(n) { return this.__attrs.has(String(n)); }
    removeAttribute(n) {
      this.__attrs.delete(String(n));
      if (String(n) === 'data-h2o-native-close') state.nativeCloseAttrWrites.push({ op: 'remove' });
    }
    appendChild(node) {
      if (node.parentNode) node.parentNode.__detach(node);
      node.parentNode = this; this.childNodes.push(node);
      recordMutation(this, [node], []); return node;
    }
    append(...n) { for (const x of n) this.appendChild(x); }
    prepend(...n) { for (const x of n.reverse()) { if (x.parentNode) x.parentNode.__detach(x); x.parentNode = this; this.childNodes.unshift(x); recordMutation(this, [x], []); } }
    insertBefore(node, ref) {
      if (node.parentNode) node.parentNode.__detach(node);
      const i = ref ? this.childNodes.indexOf(ref) : -1;
      node.parentNode = this;
      if (i < 0) this.childNodes.push(node); else this.childNodes.splice(i, 0, node);
      recordMutation(this, [node], []); return node;
    }
    __detach(node) { const i = this.childNodes.indexOf(node); if (i >= 0) this.childNodes.splice(i, 1); }
    removeChild(node) { this.__detach(node); node.parentNode = null; recordMutation(this, [], [node]); return node; }
    remove() { if (this.parentNode) this.parentNode.removeChild(this); }
    contains(o) { let n = o; while (n) { if (n === this) return true; n = n.parentNode; } return false; }
    matches(s) { return matchesSelector(this, s); }
    closest(s) { let n = this; while (n) { if (n instanceof MEl && matchesSelector(n, s)) return n; n = n.parentNode; } return null; }
    __desc(out = []) { for (const c of this.childNodes) if (c instanceof MEl) { out.push(c); c.__desc(out); } return out; }
    querySelector(s) { for (const e of this.__desc()) if (matchesSelector(e, s)) return e; return null; }
    querySelectorAll(s) { return this.__desc().filter((e) => matchesSelector(e, s)); }
    cloneNode() { const c = new MEl(this.tagName); for (const [k, v] of this.__attrs) c.__attrs.set(k, v); c.__text = this.__text; return c; }
    getRootNode() { let n = this; while (n.parentNode) n = n.parentNode; return n; }
    addEventListener(t, fn, o) {
      const capture = o === true || (o && o.capture === true);
      if (!this.__listeners.has(t)) this.__listeners.set(t, []);
      this.__listeners.get(t).push({ fn, capture, once: !!(o && o.once) });
      state.listenerOps.push({ op: 'add', id: this.__id, mark: this.__mark, type: t, capture });
    }
    removeEventListener(t, fn, o) {
      const capture = o === true || (o && o.capture === true);
      const l = this.__listeners.get(t); if (!l) return;
      const i = l.findIndex((e) => e.fn === fn);
      if (i >= 0) l.splice(i, 1);
      state.listenerOps.push({ op: 'remove', id: this.__id, mark: this.__mark, type: t, capture });
    }
    dispatchEvent(e) { return dispatchOn(this, e); }
    click() { return dispatchOn(this, { type: 'click' }); }
    focus() {} blur() {} scrollIntoView() {}

    // ── the three layout-dependent reads DOM_DP_isVisible uses ──
    get offsetParent() {
      const bucket = this.__mark === 'native-close' ? 'close' : 'other';
      state.op[bucket] += 1;
      return this.__isVisibleTruth() ? body : null;
    }
    getClientRects() {
      const bucket = this.__mark === 'native-close' ? 'close' : 'other';
      state.rects[bucket] += 1;
      return this.__isVisibleTruth() ? [this.getBoundingClientRect()] : [];
    }
    getBoundingClientRect() {
      const r = this.__rect;
      return { left: r.left, top: r.top, right: r.left + r.width, bottom: r.top + r.height, width: r.width, height: r.height };
    }
    // Ground truth: connected AND not hidden by style. Deliberately independent
    // of the module so control E can hide a node WITHOUT disconnecting it.
    __isVisibleTruth() {
      if (!this.isConnected) return false;
      const v = this.__vis;
      return !(v.display === 'none' || v.visibility === 'hidden' || v.opacity === '0');
    }
    get offsetWidth() { return this.__isVisibleTruth() ? this.__rect.width : 0; }
    get offsetHeight() { return this.__isVisibleTruth() ? this.__rect.height : 0; }
  }

  // Minimal HTML parser for innerHTML templates (tags, attrs, text, nesting).
  function parseHTML(html) {
    const out = []; const stack = [];
    const push = (n) => { (stack.length ? stack[stack.length - 1] : { childNodes: out, appendChild: (x) => out.push(x) }).appendChild ? (stack.length ? stack[stack.length - 1].appendChild(n) : out.push(n)) : out.push(n); };
    const re = /<\/?([a-zA-Z][a-zA-Z0-9-]*)((?:[^<>"']|"[^"]*"|'[^']*')*?)\/?>|([^<]+)/g;
    let m;
    while ((m = re.exec(html)) !== null) {
      if (m[3] !== undefined) {
        const text = m[3];
        if (text.trim() && stack.length) stack[stack.length - 1].__text += text.trim();
        continue;
      }
      const raw = m[0];
      const tag = m[1].toLowerCase();
      if (raw.startsWith('</')) { if (stack.length && stack[stack.length - 1].tagName.toLowerCase() === tag) stack.pop(); continue; }
      const el = new MEl(tag);
      const attrRe = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*"([^"]*)"/g;
      let a;
      while ((a = attrRe.exec(m[2] || '')) !== null) el.__attrs.set(a[1], a[2]);
      push(el);
      const selfClosing = raw.endsWith('/>') || ['br', 'hr', 'img', 'input', 'path', 'circle'].includes(tag);
      if (!selfClosing) stack.push(el);
    }
    return out;
  }

  function recordMutation(target, added, removed) {
    for (const e of state.observers) {
      if (!e.opts.childList) continue;
      if (!(e.node === target || (e.opts.subtree && e.node.contains(target)))) continue;
      e.obs.__records.push({ type: 'childList', target, addedNodes: added, removedNodes: removed });
      if (!e.obs.__queued) {
        e.obs.__queued = true;
        state.microtasks.push(() => {
          e.obs.__queued = false;
          const recs = e.obs.__records.splice(0);
          if (recs.length) e.obs.__cb(recs, e.obs);
        });
      }
    }
  }

  function dispatchOn(target, evt) {
    evt.target = evt.target || target;
    evt.preventDefault = evt.preventDefault || (() => { evt.defaultPrevented = true; });
    let stopped = false;
    evt.stopPropagation = () => { stopped = true; };
    const p = []; let n = target;
    while (n) { p.push(n); n = n.parentNode; }
    if (target !== windowObj) p.push(documentObj, windowObj);
    evt.composedPath = () => p.slice();
    for (let i = p.length - 1; i >= 0 && !stopped; i -= 1)
      for (const e of (p[i].__listeners?.get(evt.type) || []).slice()) if (e.capture || p[i] === target) e.fn.call(p[i], evt);
    for (let i = 0; i < p.length && !stopped; i += 1)
      for (const e of (p[i].__listeners?.get(evt.type) || []).slice()) if (!e.capture && p[i] !== target) e.fn.call(p[i], evt);
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
    documentElement, head, body, readyState: 'complete',
    createElement: (t) => new MEl(t),
    createElementNS: (_ns, t) => new MEl(t),
    createTextNode: (t) => { const e = new MEl('#text'); e.__text = String(t); return e; },
    getElementById: (id) => documentElement.__desc().find((e) => e.getAttribute('id') === id) || null,
    querySelector: (s) => documentElement.querySelector(s),
    querySelectorAll: (s) => documentElement.querySelectorAll(s),
    contains: (n) => documentElement.contains(n) || n === documentElement,
    addEventListener: MEl.prototype.addEventListener,
    removeEventListener: MEl.prototype.removeEventListener,
    dispatchEvent(e) { return dispatchOn(this, e); },
  };

  const storage = new Map();
  const localStorage = {
    getItem: (k) => (storage.has(String(k)) ? storage.get(String(k)) : null),
    setItem: (k, v) => storage.set(String(k), String(v)),
    removeItem: (k) => storage.delete(String(k)),
  };

  const windowObj = {
    __listeners: new Map(), innerWidth: 1440, innerHeight: 900, localStorage,
    addEventListener: MEl.prototype.addEventListener,
    removeEventListener: MEl.prototype.removeEventListener,
    dispatchEvent(e) { return dispatchOn(this, e); },
    setTimeout: (fn, ms) => { const id = (state.timerSeq += 1); state.timers.set(id, { fn, at: state.now + (ms || 0), repeat: 0 }); return id; },
    clearTimeout: (id) => state.timers.delete(id),
    setInterval: (fn, ms) => { const id = (state.timerSeq += 1); state.timers.set(id, { fn, at: state.now + (ms || 0), repeat: ms || 1 }); return id; },
    clearInterval: (id) => state.timers.delete(id),
    CSS: { escape: (s) => String(s).replace(/([^\w-])/g, '\\$1') },
  };

  const getComputedStyle = (el) => {
    const bucket = el && el.__mark === 'native-close' ? 'close' : 'other';
    state.cs[bucket] += 1;
    const v = (el && el.__vis) || { display: 'block', visibility: 'visible', opacity: '1' };
    return { ...v, getPropertyValue: (k) => v[k] || '' };
  };

  const sandbox = {
    window: windowObj, document: documentObj, localStorage, getComputedStyle,
    location: { pathname: '/c/11111111-2222-3333-4444-555555555555', href: 'https://chatgpt.com/c/x' },
    performance: { now: () => state.now },
    MutationObserver: MMutationObserver,
    requestAnimationFrame: (fn) => { state.raf.push(fn); return state.raf.length; },
    cancelAnimationFrame: () => {},
    requestIdleCallback: (fn) => { state.idle.push(fn); return state.idle.length; },
    Event: class { constructor(t) { this.type = t; } },
    CustomEvent: class { constructor(t, o) { this.type = t; this.detail = o && o.detail; } },
    CSS: windowObj.CSS,
    console: { log() {}, warn() {}, error() {}, debug() {}, info() {} },
    JSON, Math, Number, String, Object, Array, Boolean, Date, RegExp, Error, Set, Map,
    isNaN, parseInt, parseFloat, Promise, Symbol,
  };
  sandbox.setTimeout = windowObj.setTimeout; sandbox.clearTimeout = windowObj.clearTimeout;
  sandbox.setInterval = windowObj.setInterval; sandbox.clearInterval = windowObj.clearInterval;
  sandbox.globalThis = sandbox; sandbox.self = sandbox;

  const api = {
    state, sandbox, documentObj, windowObj, documentElement, body, head, localStorage, MEl,
    el(tag, { cls, attrs, mark, vis, text } = {}) {
      const e = new MEl(tag);
      if (cls) e.className = cls;
      if (attrs) for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
      if (mark) e.__mark = mark;
      if (vis) e.__vis = { ...e.__vis, ...vis };
      if (text !== undefined) e.__text = text;
      return e;
    },
    boot() { vm.runInNewContext(DOCK_SOURCE, sandbox, { filename: DOCK_PATH }); },
    flushMicrotasks(limit = 400) { let n = 0; while (state.microtasks.length && n < limit) { state.microtasks.shift()(); n += 1; } },
    flushFrame() { for (const fn of state.raf.splice(0)) fn(state.now); },
    flushIdle() { for (const fn of state.idle.splice(0)) fn({ timeRemaining: () => 5, didTimeout: false }); },
    advance(ms) {
      state.now += ms;
      for (const [id, t] of [...state.timers.entries()]) {
        if (t.at <= state.now) { if (t.repeat) t.at = state.now + t.repeat; else state.timers.delete(id); t.fn(); }
      }
    },
    fire(target, type, props = {}) { return dispatchOn(target, { type, defaultPrevented: false, ...props }); },
    // Resolve the module's own VAULT.api by walking the H2O global it registers.
    dockApi() {
      const H = windowObj.H2O;
      const seen = new Set(); const stack = [H];
      while (stack.length) {
        const o = stack.pop();
        if (!o || typeof o !== 'object' || seen.has(o)) continue;
        seen.add(o);
        if (o.api && typeof o.api.open === 'function' && typeof o.api.ensurePanel === 'function') return o.api;
        for (const k of Object.keys(o)) stack.push(o[k]);
      }
      return null;
    },
    reset() {
      state.cs.close = 0; state.cs.other = 0;
      state.op.close = 0; state.op.other = 0;
      state.rects.close = 0; state.rects.other = 0;
      state.listenerOps.length = 0; state.nativeCloseAttrWrites.length = 0;
    },
    // A discovery pass is uniquely identified by a visibility probe of the
    // native close node — DOM_DP_isVisible always reads getComputedStyle first.
    discoveryPasses: () => state.cs.close,
    counts: () => ({
      getComputedStyle: state.cs.close, offsetParent: state.op.close, getClientRects: state.rects.close,
    }),
    closeListenerOps: () => state.listenerOps.filter((o) => o.mark === 'native-close'),
    nativeCloseAttr: () => state.nativeCloseAttrWrites.slice(),
    panelEl: () => documentElement.querySelector('aside[data-cgxui="dpanel-panel"]')
      || documentElement.__desc().find((e) => e.tagName === 'ASIDE' && (e.getAttribute('data-cgxui') || '').includes('panel')) || null,
  };
  return api;
}

// ── Scene ─────────────────────────────────────────────────────────────────
// Uses 3A1a's REAL first-priority sidebar selector so UI_DP_getLeftSidebar()
// is exercised rather than bypassed.
function buildScene(env, { withNativeClose = true } = {}) {
  const { el, body } = env;
  const main = el('main');
  const transcript = el('div', { cls: 'group/thread', mark: 'transcript' });
  main.appendChild(transcript);
  body.appendChild(main);

  const sidebar = el('nav', { attrs: { 'aria-label': 'Chat history' }, mark: 'sidebar' });
  body.appendChild(sidebar);

  let nativeClose = null;
  if (withNativeClose) {
    nativeClose = el('button', { attrs: { 'data-testid': 'close-sidebar-button', 'aria-label': 'Close sidebar' }, mark: 'native-close' });
    sidebar.appendChild(nativeClose);
  }
  return { main, transcript, sidebar, nativeClose };
}

function addNativeClose(env, scene, mark = 'native-close') {
  const btn = env.el('button', { attrs: { 'data-testid': 'close-sidebar-button', 'aria-label': 'Close sidebar' }, mark });
  scene.sidebar.appendChild(btn);
  return btn;
}

function bootScene(env, opts) {
  const scene = buildScene(env, opts);
  env.boot();
  // Real boot path: whenUiSafe -> requestIdleCallback -> boot:ui:safe.
  env.flushIdle();
  env.flushMicrotasks();
  env.flushFrame();
  env.advance(500);
  env.flushMicrotasks();
  env.flushFrame();
  return scene;
}

// Boot alone never calls UI_DP_nativeClose_sync — only the rail observer and
// the Dock-open path do. Drive one real observer round so the module reaches
// its bound steady state before a fixture measures deltas from it.
function settleBinding(env, scene) {
  mutateUnrelated(env, scene);
  env.flushFrame();
  env.advance(50);
  env.flushMicrotasks();
  env.flushFrame();
}

let mutSeq = 0;
function mutateUnrelated(env, scene) {
  mutSeq += 1;
  const n = env.el('div', { cls: `turn-${mutSeq}`, mark: 'unrelated' });
  scene.transcript.appendChild(n);
  env.flushMicrotasks();   // deliver this observer batch, as production would
  return n;                // rAF deliberately NOT flushed here
}

// ══ PRIMARY GATE ══════════════════════════════════════════════════════════
const K_BATCHES = 20;
const gate = { passes: null, counts: null, attrWrites: null, listenerOps: null, identity: null };

fixture('DOCK_PANEL_MUST_COALESCE_NATIVE_CLOSE_DISCOVERY_WITHIN_ONE_FRAME', () => {
  const env = createEnv();
  const scene = bootScene(env);
  ok(env.dockApi(), 'precondition: Dock module booted and exposed its api');
  ok(scene.nativeClose.isConnected, 'precondition: native close connected');

  env.reset();
  // K unrelated childList mutation batches, all before the next frame. They do
  // not touch the native close, the sidebar, Dock state, visibility, or route.
  for (let i = 0; i < K_BATCHES; i += 1) mutateUnrelated(env, scene);
  env.flushFrame(); // the single animation frame

  gate.passes = env.discoveryPasses();
  gate.counts = env.counts();
  gate.attrWrites = env.nativeCloseAttr().length;
  gate.listenerOps = env.closeListenerOps().length;
  gate.identity = env.state.cs.close > 0 ? 'same node throughout' : 'n/a';

  atMost(gate.passes, 1,
    `${K_BATCHES} unrelated same-frame mutation batches must produce at most ONE native-close discovery/visibility pass`);
});

// ══ CONTROL G / anti-degeneracy: cross-frame discovery stays live ═════════
fixture('control G: a request on each later frame still discovers the native close', () => {
  const env = createEnv();
  const scene = bootScene(env);
  for (let frame = 1; frame <= 3; frame += 1) {
    env.reset();
    mutateUnrelated(env, scene);
    env.flushFrame();
    atLeast(env.discoveryPasses(), 1, `frame ${frame}: discovery must still run (no cache, no one-shot suppression)`);
  }
});

// ══ CONTROL A: native close replacement ═══════════════════════════════════
fixture('control A: replacing the native close rebinds to the new node without leaking', () => {
  const env = createEnv();
  const scene = bootScene(env);
  const oldBtn = scene.nativeClose;
  env.reset();

  oldBtn.remove();
  const newBtn = addNativeClose(env, scene, 'native-close');
  env.flushMicrotasks();
  env.flushFrame();
  env.advance(50);
  env.flushMicrotasks();

  ok(newBtn.isConnected, 'replacement is connected');
  ok(!oldBtn.isConnected, 'old node detached');
  atLeast(env.discoveryPasses(), 1, 'replacement triggers a fresh discovery');
  const ops = env.closeListenerOps();
  ok(ops.some((o) => o.op === 'add' && o.type === 'click'), 'new node received a click binding');
  eq(env.documentElement.querySelectorAll('[data-testid="close-sidebar-button"]').length, 1,
    'exactly one native close button present');
});

// ══ CONTROL B: Dock open stays prompt ═════════════════════════════════════
fixture('control B: the explicit Dock-open path discovers promptly, not on a later frame', () => {
  const env = createEnv();
  bootScene(env);
  const api = env.dockApi();
  ok(api, 'Dock api reachable');
  env.reset();

  api.open();   // real UI_DPANEL_openPanel() path

  // Asserted BEFORE any frame flush: Gate B must not defer this call site.
  atLeast(env.discoveryPasses(), 1, 'Dock open performs native-close discovery synchronously');
});

// ══ CONTROL C: native close absent ════════════════════════════════════════
fixture('control C: removing the native close clears Dock native-close state', () => {
  const env = createEnv();
  const scene = bootScene(env);
  env.reset();

  scene.nativeClose.remove();
  env.flushMicrotasks();
  env.flushFrame();
  env.advance(50);
  env.flushMicrotasks();

  eq(env.documentElement.querySelectorAll('[data-testid="close-sidebar-button"]').length, 0, 'native close gone');
  const panel = env.panelEl();
  ok(panel, 'Dock panel still present');
  eq(panel.getAttribute('data-h2o-native-close'), null,
    'data-h2o-native-close removed so the Dock keeps its own close control');
});

// ══ CONTROL D: native close appears later ═════════════════════════════════
fixture('control D: a native close appearing after boot is discovered and bound', () => {
  const env = createEnv();
  const scene = bootScene(env, { withNativeClose: false });
  const panel = env.panelEl();
  ok(panel, 'Dock panel present without a native close');
  eq(panel.getAttribute('data-h2o-native-close'), null, 'no native-close state while absent');
  env.reset();

  const btn = addNativeClose(env, scene);
  env.flushMicrotasks();
  env.flushFrame();
  env.advance(50);
  env.flushMicrotasks();

  atLeast(env.discoveryPasses(), 1, 'late native close is discovered');
  eq(panel.getAttribute('data-h2o-native-close'), '1', 'native-close state set');
  ok(env.closeListenerOps().some((o) => o.op === 'add' && o.type === 'click'), 'listener bound to the late node');
  eq(env.documentElement.querySelectorAll('[data-testid="close-sidebar-button"]').length, 1, 'no duplicate controls');
});

// ══ CONTROL E: connected but hidden ═══════════════════════════════════════
// A connected-node cache would be WRONG: the same node stays connected while
// becoming invisible (collapsed rail), and must be treated as unavailable.
fixture('control E: the same connected node going hidden is treated as unavailable, and visible again is rediscovered', () => {
  const env = createEnv();
  const scene = bootScene(env);
  settleBinding(env, scene);
  const panel = env.panelEl();
  const btn = scene.nativeClose;
  eq(panel.getAttribute('data-h2o-native-close'), '1', 'precondition: native close available');

  btn.__vis = { display: 'none', visibility: 'visible', opacity: '1' };
  ok(btn.isConnected, 'node is still CONNECTED while hidden');
  env.reset();
  mutateUnrelated(env, scene);
  env.flushFrame();
  env.advance(50);
  env.flushMicrotasks();
  eq(panel.getAttribute('data-h2o-native-close'), null, 'hidden-but-connected native close counts as unavailable');

  btn.__vis = { display: 'block', visibility: 'visible', opacity: '1' };
  env.reset();
  mutateUnrelated(env, scene);
  env.flushFrame();
  env.advance(50);
  env.flushMicrotasks();
  atLeast(env.discoveryPasses(), 1, 'visibility restored is re-evaluated on a later frame');
  eq(panel.getAttribute('data-h2o-native-close'), '1', 'native close available again');
});

// ══ CONTROL F: no duplicates / no listener leaks ══════════════════════════
fixture('control F: repeated bursts create no duplicate controls and no redundant rebinding', () => {
  const env = createEnv();
  const scene = bootScene(env);
  settleBinding(env, scene);   // establish the initial legitimate binding first
  env.reset();

  for (let burst = 0; burst < 5; burst += 1) {
    for (let i = 0; i < 8; i += 1) mutateUnrelated(env, scene);
    env.flushFrame();
  }

  eq(env.documentElement.querySelectorAll('[data-testid="close-sidebar-button"]').length, 1, 'exactly one native close');
  const panels = env.documentElement.__desc().filter((e) => e.tagName === 'ASIDE' && e.getAttribute('data-cgxui-owner'));
  eq(panels.length, 1, 'exactly one Dock panel');
  eq(env.closeListenerOps().filter((o) => o.op === 'add').length, 0,
    'identity unchanged across the bursts, so no rebinding occurs');
});

// ── Report ────────────────────────────────────────────────────────────────
const failed = fixtures.filter((f) => !f.ok);
for (const f of fixtures) {
  console.log(`${f.ok ? 'PASS' : 'FAIL'} ${f.name}`);
  if (!f.ok) console.log(f.error.split('\n').slice(0, 6).map((l) => `       ${l}`).join('\n'));
}
console.log('');
console.log(`Gate observation @ K=${K_BATCHES} unrelated same-frame mutation batches:`);
console.log(`  native-close discovery passes = ${gate.passes}  (contract: <= 1)`);
console.log(`  getComputedStyle(nativeClose)  = ${gate.counts?.getComputedStyle}`);
console.log(`  offsetParent reads            = ${gate.counts?.offsetParent}`);
console.log(`  getClientRects calls          = ${gate.counts?.getClientRects}`);
console.log(`  data-h2o-native-close writes  = ${gate.attrWrites}`);
console.log(`  native-close listener add/remove = ${gate.listenerOps}  (identity stable -> no rebinding)`);
if (unsupportedSelectors.size) {
  console.log(`  selectors treated as no-match: ${[...unsupportedSelectors].join(' | ')}`);
}
console.log('');
console.log(`Fixtures: ${fixtures.length - failed.length}/${fixtures.length}`);
console.log(`Assertions: ${assertions}`);
if (failed.length) {
  console.log('CV-3.38 dock panel native-close coalescing FAILED');
  process.exit(1);
}
console.log('CV-3.38 dock panel native-close coalescing passed');
