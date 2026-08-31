#!/usr/bin/env node
// CV-3.50 — 1A1g Native Prompt TOC Rail durability.
//
// This validator executes the real self-booting production module in a small,
// instrumented DOM.  The DOM deliberately implements only structural selector
// operations used by the functional core.  Layout/style reads, writes, broad
// document queries, observer admission, interval calls, repair calls and rAF
// queue state are deterministic and observable.  No timing/performance proxy is
// asserted.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.H2O_SRC_DIR ? path.resolve(process.env.H2O_SRC_DIR) : path.resolve(HERE, '../../..');
const REL = 'src-runtime-base/1A1g.🟥🧭 Native Prompt TOC Rail 🧭.js';
const SOURCE = fs.readFileSync(path.join(ROOT, REL), 'utf8');

const results = [];
let assertions = 0;
const eq = (a, b, m) => { assertions += 1; assert.deepEqual(a, b, m); };
const ok = (v, m) => { assertions += 1; assert.ok(v, m); };
const atMost = (a, b, m) => { assertions += 1; assert.ok(a <= b, `${m} (got ${a}, allowed <= ${b})`); };
const geometryTuple = (r) => r ? ['left', 'right', 'top', 'bottom', 'width', 'height'].map((key) => Number(r[key])) : null;
function fixture(group, name, fn) {
  try { fn(); results.push({ group, name, ok: true }); }
  catch (error) { results.push({ group, name, ok: false, error: String(error?.message || error) }); }
}

function instrument(source) {
  let out = source;
  for (const [name, counter] of [
    ['repairViewer', 'repair'],
    ['applyRailPosition', 'railApply'],
    ['collectViewerCandidates', 'viewerDiscovery'],
    ['resolveRailContainer', 'railResolve'],
    ['selectSidebarBoundary', 'sidebarResolve'],
    ['collectChatSurfaceCandidates', 'chatSurfaceDiscovery'],
  ]) {
    const anchor = `  function ${name}(`;
    const start = out.indexOf(anchor);
    if (start < 0) throw new Error(`TEST_HARNESS_BLOCKED:function-missing:${name}`);
    const lineEnd = out.indexOf('\n', start);
    const brace = out.lastIndexOf('{', lineEnd);
    if (brace < start) throw new Error(`TEST_HARNESS_BLOCKED:function-body-missing:${name}`);
    const callback = counter === 'repair' ? ' TOPW.__cv350Trace.onRepair?.();' : '';
    out = `${out.slice(0, brace + 1)}\n    TOPW.__cv350Trace.${counter} += 1;${callback}${out.slice(brace + 1)}`;
  }
  const expose = '  const api = {';
  if (!out.includes(expose)) throw new Error('TEST_HARNESS_BLOCKED:api-anchor-missing');
  out = out.replace(expose, `  TOPW.__cv350Hooks = {
    state, apply, repairViewer, startViewerLoop, scheduleApply, ensureObservers,
    classifyMutationRecords: typeof classifyMutationRecords === 'function' ? classifyMutationRecords : null,
    handleMutations: typeof handleMutations === 'function' ? handleMutations : null,
    requestRepair: typeof requestRepair === 'function' ? requestRepair : null,
    writeOwnedAttribute: typeof writeOwnedAttribute === 'function' ? writeOwnedAttribute : null,
    writeOwnedStyle: typeof writeOwnedStyle === 'function' ? writeOwnedStyle : null,
  };\n\n${expose}`);
  return out;
}

function createRuntime({ rail = false, viewer = false, position = 'auto' } = {}) {
  const trace = {
    repair: 0, railApply: 0, viewerDiscovery: 0, railResolve: 0,
    sidebarResolve: 0, chatSurfaceDiscovery: 0,
    reads: [], writes: [], queries: [], order: [], intervalCalls: 0,
  };
  let seq = 0;
  let now = 1_000;
  const frames = [];
  const observers = [];
  const intervals = [];
  const listeners = new Map();

  function rect(input = {}) {
    const left = Number(input.left || 0), top = Number(input.top || 0);
    const width = Number(input.width || 0), height = Number(input.height || 0);
    return { left, top, width, height, right: left + width, bottom: top + height };
  }

  class Style {
    constructor(owner) { this.owner = owner; this.map = new Map(); this.priority = new Map(); }
    get cssText() { return Array.from(this.map, ([k, v]) => `${k}: ${v}${this.priority.get(k) ? ' !important' : ''};`).join(' '); }
    set cssText(value) { this.map.clear(); this.priority.clear(); if (value) this.map.set('__cssText', String(value)); }
    getPropertyValue(k) { return this.map.get(String(k)) || ''; }
    getPropertyPriority(k) { return this.priority.get(String(k)) || ''; }
    setProperty(k, v, p = '') {
      const property = String(k), value = String(v);
      const event = `style:${this.owner.id}:${property}`;
      trace.writes.push(event); trace.order.push({ kind: 'write', event });
      this.map.set(property, value); this.priority.set(property, String(p));
      if ((property === 'left' || property === 'top') && /^-?\d+(?:\.\d+)?px$/.test(value)) {
        const pixel = Number.parseFloat(value);
        if (property === 'left') this.owner.box = { ...this.owner.box, left: pixel, right: pixel + this.owner.box.width };
        else this.owner.box = { ...this.owner.box, top: pixel, bottom: pixel + this.owner.box.height };
      }
    }
    removeProperty(k) { const event = `style-remove:${this.owner.id}:${k}`; trace.writes.push(event); trace.order.push({ kind: 'write', event }); const old = this.getPropertyValue(k); this.map.delete(String(k)); this.priority.delete(String(k)); return old; }
    get left() { return this.getPropertyValue('left'); }
    get top() { return this.getPropertyValue('top'); }
  }

  class El {
    constructor(tag = 'div', attrs = {}, box = {}) {
      this.nodeType = 1;
      this.tagName = String(tag).toUpperCase();
      this.id = `e${++seq}`;
      this.attrs = new Map(Object.entries(attrs).map(([k, v]) => [k, String(v)]));
      this.children = [];
      this.parentElement = null;
      this.style = new Style(this);
      this.box = rect(box);
      this.hidden = false;
      this.scrollHeight = this.box.height;
      this.clientHeight = this.box.height;
      this.handlers = new Map();
    }
    get className() { return this.getAttribute('class') || ''; }
    get childElementCount() { return this.children.length; }
    get isConnected() { let n = this; while (n) { if (n === documentElement) return true; n = n.parentElement; } return false; }
    appendChild(child) { child.parentElement = this; this.children.push(child); return child; }
    remove() { if (!this.parentElement) return; const p = this.parentElement; p.children = p.children.filter((x) => x !== this); this.parentElement = null; }
    contains(other) { let n = other; while (n) { if (n === this) return true; n = n.parentElement; } return false; }
    getAttribute(name) { return this.attrs.has(String(name)) ? this.attrs.get(String(name)) : null; }
    hasAttribute(name) { return this.attrs.has(String(name)); }
    setAttribute(name, value) { const event = `attr:${this.id}:${name}`; trace.writes.push(event); trace.order.push({ kind: 'write', event }); this.attrs.set(String(name), String(value)); }
    removeAttribute(name) { const event = `attr-remove:${this.id}:${name}`; trace.writes.push(event); trace.order.push({ kind: 'write', event }); this.attrs.delete(String(name)); }
    getBoundingClientRect() { const event = `rect:${this.id}`; trace.reads.push(event); trace.order.push({ kind: 'read', event }); return { ...this.box }; }
    getClientRects() { return this.box.width > 0 && this.box.height > 0 ? [this.box] : []; }
    addEventListener(type, fn) { if (!this.handlers.has(type)) this.handlers.set(type, []); this.handlers.get(type).push(fn); }
    removeEventListener(type, fn) { this.handlers.set(type, (this.handlers.get(type) || []).filter((x) => x !== fn)); }
    dispatch(type) { for (const fn of this.handlers.get(type) || []) fn({ type, target: this }); }
    descendants() { return this.children.flatMap((c) => [c, ...c.descendants()]); }
    matches(selector) { return matchesAny(this, selector); }
    closest(selector) { let n = this; while (n) { if (n.matches?.(selector)) return n; n = n.parentElement; } return null; }
    querySelectorAll(selector) { return this.descendants().filter((e) => matchesAny(e, selector)); }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  }

  function splitTop(text, separator) {
    const out = []; let quote = ''; let brackets = 0; let start = 0;
    for (let i = 0; i < text.length; i += 1) {
      const c = text[i];
      if (quote) { if (c === quote && text[i - 1] !== '\\') quote = ''; continue; }
      if (c === '"' || c === "'") { quote = c; continue; }
      if (c === '[') brackets += 1; else if (c === ']') brackets -= 1;
      if (!brackets && c === separator) { out.push(text.slice(start, i)); start = i + 1; }
    }
    out.push(text.slice(start)); return out;
  }
  function matchSimple(el, raw) {
    let s = raw.trim();
    if (!s) return false;
    const tag = /^([a-z][\w-]*)/i.exec(s);
    if (tag && el.tagName.toLowerCase() !== tag[1].toLowerCase()) return false;
    const id = /#([\w-]+)/.exec(s);
    if (id && (el.getAttribute('id') || el.id) !== id[1]) return false;
    for (const m of s.matchAll(/\.([\w-]+)/g)) if (!el.className.split(/\s+/).includes(m[1])) return false;
    for (const m of s.matchAll(/\[([\w:-]+)(?:([*^$]?=)["']?([^\]"']*)["']?)?(?:\s+i)?\]/g)) {
      const value = el.getAttribute(m[1]);
      if (value == null) return false;
      if (!m[2]) continue;
      const wanted = m[3];
      if (m[2] === '=' && value !== wanted) return false;
      if (m[2] === '*=' && !value.toLowerCase().includes(wanted.toLowerCase())) return false;
      if (m[2] === '^=' && !value.startsWith(wanted)) return false;
      if (m[2] === '$=' && !value.endsWith(wanted)) return false;
    }
    return true;
  }
  function matchesOne(el, raw) {
    const childParts = splitTop(raw, '>').map((x) => x.trim());
    if (childParts.length === 2) return matchSimple(el, childParts[1]) && !!el.parentElement && matchSimple(el.parentElement, childParts[0]);
    const parts = raw.trim().split(/\s+/);
    if (parts.length > 1) {
      const last = parts.pop();
      if (!matchSimple(el, last)) return false;
      let n = el.parentElement;
      const ancestor = parts.join(' ');
      while (n && !matchSimple(n, ancestor)) n = n.parentElement;
      return !!n;
    }
    return matchSimple(el, raw);
  }
  function matchesAny(el, selector) { return splitTop(String(selector), ',').some((s) => matchesOne(el, s)); }

  const documentElement = new El('html', {}, { width: 1200, height: 900 });
  const body = new El('body', {}, { width: 1200, height: 900 });
  documentElement.appendChild(body);
  const D = {
    documentElement, body, scrollingElement: documentElement,
    querySelector(selector) { const event = String(selector); trace.queries.push(event); trace.order.push({ kind: 'query', event }); return documentElement.querySelector(selector); },
    querySelectorAll(selector) { const event = String(selector); trace.queries.push(event); trace.order.push({ kind: 'query', event }); return documentElement.querySelectorAll(selector); },
    elementFromPoint() { return null; },
  };
  class MO { constructor(cb) { this.cb = cb; observers.push(this); } observe(target, opts) { this.target = target; this.opts = opts; } }
  const storage = { length: 0, key() { return null; }, getItem() { return null; } };
  const W = {
    top: null, H2O: {}, innerWidth: 1200, innerHeight: 900, localStorage: storage,
    getComputedStyle(el) { const event = `style:${el?.id || '?'}`; trace.reads.push(event); trace.order.push({ kind: 'read', event }); return { position: el?.__position || 'static', display: 'block', visibility: 'visible', opacity: '1', overflowY: 'visible', transform: 'none', perspective: 'none', filter: 'none', backdropFilter: 'none', contain: '', willChange: '' }; },
    requestAnimationFrame(fn) { frames.push(fn); return frames.length; },
    addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(fn); },
    setInterval(fn, ms) { intervals.push({ fn, ms }); return intervals.length; },
  };
  W.top = W;
  W.H2O_MM_NativeRailSettings = { getSettings: () => ({ railPosition: position, gapPx: 4 }) };
  W.__cv350Trace = trace;
  const sandbox = { window: W, unsafeWindow: W, document: D, MutationObserver: MO, console, Date: { now: () => now }, Math, Number, String, Object, Array, Boolean, Set, Map, WeakMap, JSON, Infinity, NaN, parseFloat };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(instrument(SOURCE), sandbox, { filename: REL, timeout: 4_000 });

  const hooks = W.__cv350Hooks;
  function reset() {
    for (const key of ['repair', 'railApply', 'viewerDiscovery', 'railResolve', 'sidebarResolve', 'chatSurfaceDiscovery', 'intervalCalls']) trace[key] = 0;
    trace.reads.length = 0; trace.writes.length = 0; trace.queries.length = 0; trace.order.length = 0;
  }
  function flushOne() { const batch = frames.splice(0); for (const fn of batch) fn(); return batch.length; }
  while (frames.length) flushOne();

  let railEl = null, viewerCard = null;
  if (rail) {
    railEl = new El('div', { class: 'fixed top-1/2 inset-e-4' }, { left: 1120, top: 250, width: 36, height: 360 });
    railEl.__position = 'fixed';
    const inner = new El('div', { class: 'max-h-[50lvh] w-9 flex-col overflow-y-auto no-scrollbar' }, { left: 1120, top: 250, width: 36, height: 360 });
    const button = new El('button', { 'aria-label': 'Prompt 1', 'data-toc-active': 'true' }, { left: 1120, top: 260, width: 30, height: 30 });
    inner.appendChild(button); railEl.appendChild(inner); body.appendChild(railEl);
    hooks.state.railContainer = railEl; hooks.state.railInner = inner;
  }
  if (viewer) {
    viewerCard = new El('div', { class: 'z-50 max-w-xs rounded-2xl popover' }, { left: 800, top: 300, width: 260, height: 240 });
    const list = new El('ul', { role: 'menu' }, { left: 800, top: 300, width: 260, height: 240 });
    for (let i = 0; i < 3; i += 1) list.appendChild(new El('li', { role: 'menuitem' }, { left: 800, top: 310 + i * 40, width: 240, height: 32 }));
    viewerCard.appendChild(list); body.appendChild(viewerCard);
  }
  reset();
  return {
    trace, hooks, observers, intervals, listeners, frames, body, documentElement, railEl, viewerCard, El,
    flushOne, flushAll(limit = 20) { let n = 0; while (frames.length && n < limit) { flushOne(); n += 1; } return n; },
    deliver(records) { observers[0].cb(records, observers[0]); },
    emit(type) { for (const fn of listeners.get(type) || []) fn({ type, target: W }); },
    tick() { trace.intervalCalls += 1; intervals[0].fn(); },
    advance(ms) { now += Number(ms || 0); },
    child(target, addedNodes = [], removedNodes = []) { return { type: 'childList', target, addedNodes, removedNodes }; },
    attr(target, attributeName, oldValue = null) { return { type: 'attributes', target, attributeName, oldValue }; },
    reset,
  };
}

function appendViewerFixture(runtime, box = {}) {
  const card = new runtime.El('div', { class: 'z-50 max-w-xs rounded-2xl popover' }, { left: 760, top: 280, width: 260, height: 240, ...box });
  const list = new runtime.El('ul', { role: 'menu' }, { left: card.box.left, top: card.box.top, width: 260, height: 240 });
  for (let i = 0; i < 3; i += 1) list.appendChild(new runtime.El('li', { role: 'menuitem' }, { left: card.box.left, top: card.box.top + 10 + i * 40, width: 240, height: 32 }));
  card.appendChild(list);
  runtime.body.appendChild(card);
  return card;
}

// RED A — mutation admission and preservation controls.
fixture('RED_A', 'unrelated child-list churn admits no repair', () => {
  const r = createRuntime({ rail: true }); const noise = new r.El('span'); r.body.appendChild(noise);
  r.deliver([r.child(r.body, [noise])]); r.flushAll(); eq(r.trace.repair, 0, 'foreign document churn must be free');
});
fixture('RED_A', 'unrelated class/style churn admits no repair', () => {
  const r = createRuntime({ rail: true }); const noise = new r.El('section'); r.body.appendChild(noise);
  r.deliver([r.attr(noise, 'class', ''), r.attr(noise, 'style', '')]); r.flushAll(); eq(r.trace.repair, 0, 'unrelated attributes must be free');
});
fixture('RED_A', 'exact owned rail-position transition is suppressed', () => {
  const r = createRuntime({ rail: true }); const old = r.railEl.getAttribute('data-h2o-native-prompt-rail-position');
  if (r.hooks.writeOwnedAttribute) r.hooks.writeOwnedAttribute(r.railEl, 'data-h2o-native-prompt-rail-position', 'right');
  else r.railEl.setAttribute('data-h2o-native-prompt-rail-position', 'right');
  r.reset(); r.deliver([r.attr(r.railEl, 'data-h2o-native-prompt-rail-position', old)]); r.flushAll(); eq(r.trace.repair, 0, 'proven exact own transition must not re-arm repair');
});
fixture('RED_A', 'exact owned style transition is suppressed but foreign rail style is admitted', () => {
  const r = createRuntime({ rail: true });
  const ownOld = r.railEl.getAttribute('style');
  if (r.hooks.writeOwnedStyle) r.hooks.writeOwnedStyle(r.railEl, 'left', '20px', 'important');
  else r.railEl.style.setProperty('left', '20px', 'important');
  r.reset(); r.deliver([r.attr(r.railEl, 'style', ownOld)]); r.flushAll(); eq(r.trace.repair, 0, 'exact owned style is suppressed');
  const foreignOld = r.railEl.getAttribute('style');
  r.railEl.style.setProperty('left', '30px', 'important');
  r.reset(); r.deliver([r.attr(r.railEl, 'style', foreignOld)]); r.flushAll(); eq(r.trace.repair, 1, 'foreign rail style is relevant');
});
fixture('RED_A', 'owned transition provenance expires after observer delivery', () => {
  const r = createRuntime({ rail: true });
  const old = r.railEl.getAttribute('data-h2o-native-prompt-rail-position');
  if (r.hooks.writeOwnedAttribute) r.hooks.writeOwnedAttribute(r.railEl, 'data-h2o-native-prompt-rail-position', 'right');
  else r.railEl.setAttribute('data-h2o-native-prompt-rail-position', 'right');
  r.reset(); r.deliver([r.attr(r.railEl, 'data-h2o-native-prompt-rail-position', old)]); r.flushAll(); eq(r.trace.repair, 0, 'own delivery is suppressed');
  r.railEl.setAttribute('data-h2o-native-prompt-rail-position', 'left');
  r.reset(); r.deliver([r.attr(r.railEl, 'data-h2o-native-prompt-rail-position', 'right')]); r.flushAll(); eq(r.trace.repair, 1, 'same-shaped later foreign transition is admitted');
});
fixture('CONTROL', 'relevant data-toc-active and host class/style changes admit once', () => {
  for (const attributeName of ['data-toc-active', 'class', 'style']) {
    const r = createRuntime({ rail: true });
    const target = attributeName === 'data-toc-active' ? r.railEl.children[0].children[0] : r.railEl;
    r.deliver([r.attr(target, attributeName, target.getAttribute(attributeName))]); r.flushAll(); eq(r.trace.repair, 1, `${attributeName} remains relevant in-domain`);
  }
});
fixture('CONTROL', 'rail addition/removal/replacement remain relevant and coalesced', () => {
  for (const kind of ['add', 'remove', 'replace']) {
    const r = createRuntime(); const a = new r.El('div', { class: 'fixed inset-e-4' }); const b = new r.El('div', { class: 'fixed inset-e-4' });
    r.deliver([r.child(r.body, kind === 'remove' ? [] : [b], kind === 'add' ? [] : [a])]); r.flushAll(); eq(r.trace.repair, 1, `${kind} must admit once`);
  }
});
fixture('CONTROL', 'mixed own/foreign order fails closed once', () => {
  for (const reverse of [false, true]) {
    const r = createRuntime({ rail: true }); const foreign = new r.El('div', { class: 'popover rounded-2xl' });
    const old = r.railEl.getAttribute('data-h2o-native-prompt-rail-position');
    if (r.hooks.writeOwnedAttribute) r.hooks.writeOwnedAttribute(r.railEl, 'data-h2o-native-prompt-rail-position', 'right');
    else r.railEl.setAttribute('data-h2o-native-prompt-rail-position', 'right');
    const own = r.attr(r.railEl, 'data-h2o-native-prompt-rail-position', old);
    const real = r.child(r.body, [foreign]); r.deliver(reverse ? [real, own] : [own, real]); r.flushAll(); eq(r.trace.repair, 1, 'mixed batch must admit once');
  }
});

// RED B/C — one local frame authority and interval submission only.
fixture('RED_B', 'same-frame async causes coalesce to one repair', () => {
  const r = createRuntime(); const relevant = new r.El('div', { class: 'fixed inset-e-4' });
  r.deliver([r.child(r.body, [relevant])]); r.emit('resize'); r.hooks.startViewerLoop(); r.tick();
  r.flushOne(); atMost(r.trace.repair, 1, 'one frame may execute at most one repair');
});
fixture('RED_B', 'cause arriving during a pass schedules exactly one later frame', () => {
  const r = createRuntime();
  r.trace.onRepair = () => { r.trace.onRepair = null; (r.hooks.requestRepair || r.hooks.scheduleApply)('during-pass', { discoverViewer: false }); };
  (r.hooks.requestRepair || r.hooks.scheduleApply)('first', { discoverViewer: false });
  r.flushOne(); eq(r.trace.repair, 1, 'first frame has one repair'); eq(r.frames.length, 1, 'one later frame remains');
  r.flushOne(); eq(r.trace.repair, 2, 'later frame has exactly one repair'); eq(r.frames.length, 0, 'dirty state drains');
});
fixture('RED_C', 'interval callback performs no preliminary rail work', () => {
  const r = createRuntime(); r.tick(); eq(r.trace.railApply, 0, 'interval must only submit recovery'); r.flushOne(); atMost(r.trace.repair, 1, 'interval recovery is one coherent pass'); eq(r.intervals[0].ms, 1500, 'recovery cadence stays 1500 ms');
});

// RED D / correction RED — stable success gets exactly one verification and then drains.
fixture('RED_D', 'viewer follow has no independent perpetual frame authority', () => {
  ok(!/function startViewerLoop\([\s\S]*?requestAnimationFrame\(step\)[\s\S]*?requestAnimationFrame\(step\)/u.test(SOURCE), 'viewer loop must cooperate with the single scheduler');
});
fixture('CORRECTION_RED', 'post-placement B is the transient baseline, never pre-write A', () => {
  const r = createRuntime({ rail: true, viewer: true });
  const beforeA = geometryTuple(r.viewerCard.box);
  r.hooks.startViewerLoop({ type: 'pointerover', target: r.railEl });
  r.flushOne();
  const afterB = geometryTuple(r.viewerCard.box);
  ok(beforeA.some((value, index) => value !== afterB[index]), 'fixture must observe production placement A to B');
  eq(geometryTuple(r.hooks.state.viewerFollowSnapshot?.viewer), afterB, 'post-placement baseline must be authoritative B');
  eq(r.frames.length, 1, 'initial placement arms exactly one verification frame');
});
fixture('CORRECTION_RED', 'stable A-to-B placement drains after the authorized verification frame', () => {
  const r = createRuntime({ rail: true, viewer: true });
  r.hooks.startViewerLoop({ type: 'pointerover', target: r.railEl });
  r.flushOne();
  eq(r.frames.length, 1, 'one verification frame is armed');
  r.flushOne();
  eq(r.frames.length, 0, 'own placement A-to-B must not arm a third frame');
  eq(r.hooks.state.viewerLoopActive, false, 'stable verification terminates the loop');
  eq(r.hooks.state.viewerFollowSnapshot, null, 'stable verification clears transient geometry');
});
fixture('RED_D', 'moving viewer is followed until one stable verification', () => {
  const r = createRuntime({ rail: true, viewer: true });
  r.hooks.startViewerLoop({ type: 'focusin', target: r.railEl });
  r.flushOne(); eq(r.frames.length, 1, 'first placement arms one verification');
  const baselineB = geometryTuple(r.viewerCard.box);
  eq(geometryTuple(r.hooks.state.viewerFollowSnapshot?.viewer), baselineB, 'moving control starts from authoritative B');
  r.viewerCard.box = { ...r.viewerCard.box, left: r.viewerCard.box.left + 12, right: r.viewerCard.box.right + 12 };
  const movedC = geometryTuple(r.viewerCard.box);
  r.flushOne(); eq(r.frames.length, 1, 'geometry change keeps one bounded follow frame');
  eq(geometryTuple(r.hooks.state.viewerFollowSnapshot?.viewer), movedC, 'genuine B-to-C movement becomes the next bounded baseline');
  r.flushAll(4); eq(r.frames.length, 0, 'stable geometry drains follow work');
});
fixture('RED_D', 'missing viewer recovery is bounded and disconnected managed state is cleaned', () => {
  const missing = createRuntime({ rail: true });
  missing.hooks.startViewerLoop({ type: 'pointerover', target: missing.railEl }); missing.flushOne(); eq(missing.frames.length, 1, 'missing viewer keeps bounded recovery work');
  missing.advance(501); missing.flushOne(); eq(missing.frames.length, 0, 'miss deadline drains the queue'); eq(missing.hooks.state.viewerLoopActive, false, 'miss loop deactivates');

  const removed = createRuntime({ rail: true, viewer: true });
  removed.hooks.apply({ settings: { railPosition: 'right', gapPx: 4 }, reason: 'explicit' });
  removed.flushAll();
  ok(removed.hooks.state.managed.has(removed.viewerCard), 'viewer is managed before removal');
  removed.viewerCard.remove(); removed.deliver([removed.child(removed.body, [], [removed.viewerCard])]); removed.flushAll();
  eq(removed.hooks.state.managed.has(removed.viewerCard), false, 'disconnected viewer is removed from managed state');
  eq(removed.viewerCard.getAttribute('data-h2o-native-toc-viewer-managed'), null, 'disconnected viewer stamps are cleared');
});
fixture('CORRECTION_RED', 'transient snapshot clears on viewer disconnection and terminal miss', () => {
  const r = createRuntime({ rail: true, viewer: true });
  r.hooks.startViewerLoop({ type: 'pointerover', target: r.railEl });
  r.flushOne();
  ok(r.hooks.state.viewerFollowSnapshot, 'active sequence owns transient geometry');
  r.viewerCard.remove();
  r.deliver([r.child(r.body, [], [r.viewerCard])]);
  r.flushOne();
  eq(r.hooks.state.viewerFollowSnapshot, null, 'viewer loss clears transient geometry immediately');
  r.advance(501); r.flushAll(4);
  eq(r.hooks.state.viewerLoopActive, false, 'terminal miss terminates the sequence');
  eq(r.hooks.state.viewerFollowSnapshot, null, 'terminal miss retains no transient geometry');
});
fixture('CORRECTION_RED', 'viewer replacement retires the old identity baseline', () => {
  const r = createRuntime({ rail: true, viewer: true });
  r.hooks.startViewerLoop({ type: 'pointerover', target: r.railEl });
  r.flushOne();
  const oldViewer = r.viewerCard;
  oldViewer.remove();
  const replacement = appendViewerFixture(r, { left: 720, top: 260 });
  r.deliver([r.child(r.body, [replacement], [oldViewer])]);
  r.flushOne();
  eq(r.hooks.state.viewerFollowSnapshot?.viewerNode, replacement, 'replacement owns the new transient baseline');
  ok(r.hooks.state.viewerFollowSnapshot?.viewerNode !== oldViewer, 'old viewer identity is retired');
});
fixture('CORRECTION_RED', 'hidden and off terminate viewer-follow transient state', () => {
  for (const position of ['hidden', 'off']) {
    const r = createRuntime({ rail: true, viewer: true });
    r.hooks.startViewerLoop({ type: 'pointerover', target: r.railEl });
    r.flushOne();
    ok(r.hooks.state.viewerFollowSnapshot, `${position} control starts with transient geometry`);
    r.hooks.apply({ settings: { railPosition: position, gapPx: 4 }, reason: 'explicit' });
    eq(r.hooks.state.viewerLoopActive, false, `${position} terminates viewer follow`);
    eq(r.hooks.state.viewerVerificationPending, false, `${position} clears verification state`);
    eq(r.hooks.state.viewerFollowSnapshot, null, `${position} clears transient geometry`);
  }
});
fixture('CORRECTION_RED', 'fresh interaction generation replaces incompatible transient baseline', () => {
  const r = createRuntime({ rail: true, viewer: true });
  r.hooks.startViewerLoop({ type: 'pointerover', target: r.railEl });
  r.flushOne();
  const firstGeneration = r.hooks.state.viewerInteractionGeneration;
  r.hooks.startViewerLoop({ type: 'focusin', target: r.railEl });
  const secondGeneration = r.hooks.state.viewerInteractionGeneration;
  ok(secondGeneration > firstGeneration, 'fixture advances interaction generation');
  r.flushOne();
  eq(r.hooks.state.viewerFollowSnapshot?.generation, secondGeneration, 'new generation owns the transient baseline');
});

// RED E — the real discovery function issues one union sweep.
fixture('RED_E', 'admitted viewer discovery uses one broad document query', () => {
  const r = createRuntime({ rail: true }); r.hooks.repairViewer('validator-discovery', { discoverViewer: true });
  const viewerQueries = r.trace.queries.filter((q) => /popover|rounded-2xl|menuitem|listbox|max-h-\[50lvh\]/.test(q));
  atMost(viewerQueries.length, 1, 'viewer selectors must be unioned into one broad sweep');
});
fixture('RED_E', 'rail-only scroll without viewer evidence skips discovery', () => {
  const r = createRuntime({ rail: true }); r.emit('scroll'); r.flushAll(); eq(r.trace.viewerDiscovery, 0, 'rail-only scroll must not discover viewers');
});
fixture('RED_E', 'rail-only resize skips discovery while recovery may rediscover', () => {
  const r = createRuntime({ rail: true }); r.emit('resize'); r.flushAll(); eq(r.trace.viewerDiscovery, 0, 'rail-only resize skips viewer sweep');
  r.reset(); r.tick(); r.flushAll(); eq(r.trace.viewerDiscovery, 1, '1500 ms recovery retains rediscovery authority');
});

// RED F — coherent pass trace: no discovery/read after the first governed write.
fixture('RED_F', 'coherent left placement reads before governed writes', () => {
  const r = createRuntime({ rail: true, viewer: true, position: 'left' }); r.hooks.apply({ settings: { railPosition: 'left', gapPx: 4 }, reason: 'explicit' });
  const firstWrite = r.trace.order.findIndex((event) => event.kind === 'write');
  ok(firstWrite >= 0, 'fixture must exercise governed writes');
  ok(r.trace.railResolve <= 1, `rail resolution must be pass-local (got ${r.trace.railResolve})`);
  ok(r.trace.sidebarResolve <= 1, `sidebar resolution must be pass-local (got ${r.trace.sidebarResolve})`);
  ok(r.trace.chatSurfaceDiscovery <= 1, `chat-surface discovery must be pass-local (got ${r.trace.chatSurfaceDiscovery})`);
  const afterWrite = r.trace.order.slice(firstWrite + 1);
  eq(afterWrite.filter((event) => event.kind === 'query').length, 0, 'candidate discovery cannot restart after writes');
  atMost(afterWrite.filter((event) => event.kind === 'read' && event.event.startsWith('rect:')).length, 1, 'only one post-write geometry verification is allowed');
  ok(/function buildRepairPlan\(/.test(SOURCE) && /function applyRepairPlan\(/.test(SOURCE), 'real source must expose explicit read/plan and write phases');
});

// Source-authority prohibitions and public/boot contract.
fixture('CONTROL', 'one observer, one interval, one frame authority', () => {
  eq((SOURCE.match(/new MutationObserver\(/gu) || []).length, 1, 'exactly one observer');
  eq((SOURCE.match(/setInterval\(/gu) || []).length, 1, 'exactly one interval');
  ok(/setInterval\([^,]+,\s*1500\)/u.test(SOURCE), 'interval value is exactly 1500');
  eq((SOURCE.match(/setTimeout\(/gu) || []).length, 0, 'no timer added');
});
fixture('RED_B', 'one module-local rAF call site serves every asynchronous cause', () => {
  eq((SOURCE.match(/requestAnimationFrame\(/gu) || []).length, 1, 'one module-local rAF call site');
});
fixture('RED_B', 'explicit apply has no immediate-plus-trailing duplicate', () => {
  for (const position of ['auto', 'right', 'left', 'hidden', 'off']) {
    const r = createRuntime({ rail: true, position }); r.hooks.apply({ settings: { railPosition: position, gapPx: 4 }, reason: 'explicit' });
    eq(r.trace.repair, 1, `${position} explicit apply performs one coherent repair`);
    eq(r.frames.length, 0, `${position} explicit apply leaves no duplicate trailing frame`);
  }
});
fixture('CONTROL', 'auto/right/left/hidden/off preserve an immediate functional application', () => {
  for (const position of ['auto', 'right', 'left', 'hidden', 'off']) {
    const r = createRuntime({ rail: true, position }); r.hooks.apply({ settings: { railPosition: position, gapPx: 4 }, reason: 'explicit' });
    ok(r.trace.railApply + r.trace.repair >= 1, `${position} applies without waiting for unrelated evidence`);
    if (position === 'hidden') eq(r.railEl.getAttribute('data-h2o-native-prompt-rail-position'), 'hidden', 'hidden state is applied');
    if (position === 'off') eq(r.railEl.getAttribute('data-h2o-native-prompt-rail-position'), null, 'off clears managed position');
  }
});
fixture('CONTROL', 'viewer side and viewport clamping remain functional', () => {
  const right = createRuntime({ rail: true, viewer: true, position: 'right' });
  right.hooks.apply({ settings: { railPosition: 'right', gapPx: 4 }, reason: 'explicit' });
  right.flushAll();
  eq(right.viewerCard.getAttribute('data-h2o-native-toc-viewer-side'), 'left', 'right rail viewer opens left');
  ok(Number(right.viewerCard.getAttribute('data-h2o-native-toc-viewer-final-left')) >= 8, 'viewer is clamped inside left viewport margin');
  const left = createRuntime({ rail: true, viewer: true, position: 'left' });
  left.hooks.apply({ settings: { railPosition: 'left', gapPx: 4 }, reason: 'explicit' });
  left.flushAll();
  eq(left.viewerCard.getAttribute('data-h2o-native-toc-viewer-side'), 'right', 'left rail viewer opens right');
  ok(Number(left.viewerCard.getAttribute('data-h2o-native-toc-viewer-final-right')) <= 1192, 'viewer is clamped inside right viewport margin');
});

const failed = results.filter((x) => !x.ok);
for (const row of results) console.log(`${row.ok ? 'PASS' : 'FAIL'} [${row.group}] ${row.name}${row.error ? ` — ${row.error}` : ''}`);
console.log(`CV3_50_RESULT=${failed.length ? 'FAIL' : 'PASS'} fixtures=${results.length} assertions=${assertions} failed=${failed.length}`);
if (failed.length) process.exitCode = 1;
