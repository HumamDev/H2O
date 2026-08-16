#!/usr/bin/env node
// 9B2a Sidebar Title Renderer visibility-probe cost contract (Gate B RED).
//
// The shipped 9B2a IIFE is executed whole. The harness injects measurement
// wrappers into its lexical scope immediately before boot; production function
// bodies remain the module under test. Two deliberately narrow contracts:
//
//   1. reject a nonmatching route before visibility/layout boundaries;
//   2. evaluate one anchor's visibility at most once per syncSidebar pass.
//
// The validator is intentionally expected to exit 1 against pristine 9B2a.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const MODULE_REL = 'src-runtime-base/9B2a.🟤🏷️ Sidebar Title Renderer 🏷️.js';
const SOURCE = fs.readFileSync(path.join(ROOT, MODULE_REL), 'utf8');

const semantic = [];
const invalidation = [];
const integrity = [];
const contracts = [];
let assertions = 0;

const eq = (actual, expected, message) => { assertions += 1; assert.deepEqual(actual, expected, message); };
const ok = (value, message) => { assertions += 1; assert.ok(value, message); };
const atMost = (actual, limit, message) => {
  assertions += 1;
  assert.ok(actual <= limit, `${message} (got ${actual}, allowed <= ${limit})`);
};
const atLeast = (actual, limit, message) => {
  assertions += 1;
  assert.ok(actual >= limit, `${message} (got ${actual}, required >= ${limit})`);
};
function collect(bucket, name, callback) {
  try { callback(); bucket.push({ name, ok: true }); }
  catch (error) { bucket.push({ name, ok: false, error: String(error?.stack || error) }); }
}
const fixture = (name, callback) => collect(semantic, name, callback);
const control = (name, callback) => collect(invalidation, name, callback);
const mutation = (name, callback) => collect(integrity, name, callback);
function contract(id, callback) {
  try { callback(); contracts.push({ id, ok: true }); }
  catch (error) { contracts.push({ id, ok: false, error: String(error?.stack || error) }); }
}

// Fail closed if the real owner or cost path becomes ambiguous. This is not a
// source-pattern implementation test: the checks only guarantee that the real
// functions exercised below still exist once and remain connected.
const REQUIRED_FUNCTIONS = [
  'routeIdentityFromHref', 'liveRouteIdentity', 'isH2OOwnedSurface',
  'isVisibleAnchor', 'approvedContainers', 'candidateFor', 'ensureStyle',
  'releaseAdoption', 'adoptCandidate', 'adoptionStillValid',
  'releaseInvalidSynchronously', 'findCandidates', 'mutationOwnedByVisual',
  'ensureObserver', 'scheduleRetry', 'syncSidebar', 'scheduleSync',
  'acceptSnapshot',
];
for (const name of REQUIRED_FUNCTIONS) {
  const hits = [...SOURCE.matchAll(new RegExp(`\\bfunction ${name}\\(`, 'gu'))];
  if (hits.length !== 1) throw new Error(`TEST_HARNESS_BLOCKED:function-anchor:${name}:${hits.length}`);
}
for (const [needle, label] of [
  ['isVisibleAnchor(anchor)', 'candidate-visibility-call'],
  ['routeIdentityFromHref(anchor.getAttribute(\'href\'))', 'route-identity-call'],
  ['adoptionStillValid(record, acceptedSnapshot)', 'release-revalidation-call'],
  ['releaseInvalidSynchronously();', 'sync-release-call'],
  ['findCandidates(acceptedSnapshot, containers)', 'sync-discovery-call'],
]) {
  if (!SOURCE.includes(needle)) throw new Error(`TEST_HARNESS_BLOCKED:cost-path:${label}`);
}

const BOOT_MARKER = '  recoverStaleDom();\n  publicApi = Object.freeze({ version: 1, diagnose, destroy });';
if (SOURCE.split(BOOT_MARKER).length !== 2) throw new Error('TEST_HARNESS_BLOCKED:boot-marker');

// ── Selector engine ───────────────────────────────────────────────────────
const unescapeSelector = (value) => value.replace(/\\(.)/gu, '$1');
function splitTop(selector, separator) {
  const out = [];
  let depth = 0, quote = '', buffer = '';
  for (const char of String(selector || '')) {
    if (quote) { buffer += char; if (char === quote) quote = ''; continue; }
    if (char === '"' || char === "'") { quote = char; buffer += char; continue; }
    if (char === '[') depth += 1;
    if (char === ']') depth -= 1;
    if (depth === 0 && ((separator === ',' && char === ',') || (separator === ' ' && /\s/u.test(char)))) {
      if (buffer.trim()) out.push(buffer.trim());
      buffer = '';
      continue;
    }
    buffer += char;
  }
  if (buffer.trim()) out.push(buffer.trim());
  return out;
}
function parseCompound(selector) {
  const out = { tag: null, id: null, classes: [], attrs: [] };
  let index = 0;
  const tag = /^[a-zA-Z][a-zA-Z0-9-]*/u.exec(selector);
  if (tag) { out.tag = tag[0].toLowerCase(); index = tag[0].length; }
  while (index < selector.length) {
    const char = selector[index];
    if (char === '#' || char === '.') {
      let end = index + 1, buffer = '';
      while (end < selector.length) {
        if (selector[end] === '\\') { buffer += selector[end] + selector[end + 1]; end += 2; continue; }
        if ('.#['.includes(selector[end])) break;
        buffer += selector[end]; end += 1;
      }
      if (char === '#') out.id = unescapeSelector(buffer);
      else out.classes.push(unescapeSelector(buffer));
      index = end;
      continue;
    }
    if (char === '[') {
      const end = selector.indexOf(']', index);
      if (end < 0) throw new Error('unsupported-selector');
      const match = /^([a-zA-Z0-9_:-]+)(?:([*^$|~]?=)\s*"([^"]*)"|([*^$|~]?=)\s*'([^']*)')?\s*(i)?$/u
        .exec(selector.slice(index + 1, end).trim());
      if (!match) throw new Error('unsupported-selector');
      out.attrs.push({
        name: match[1], op: match[2] || match[4] || null,
        value: match[3] !== undefined ? match[3] : match[5], ci: !!match[6],
      });
      index = end + 1;
      continue;
    }
    throw new Error(`unsupported-selector:${selector}`);
  }
  return out;
}
const selectorCache = new Map();
const unsupportedSelectors = new Set();
function parseSelector(selector) {
  if (selectorCache.has(selector)) return selectorCache.get(selector);
  let parsed = null;
  try { parsed = splitTop(selector, ',').map((group) => splitTop(group, ' ').map(parseCompound)); }
  catch { unsupportedSelectors.add(selector); }
  selectorCache.set(selector, parsed);
  return parsed;
}
function matchesCompound(element, compound) {
  if (compound.tag && element.tagName.toLowerCase() !== compound.tag) return false;
  if (compound.id !== null && element.getAttribute('id') !== compound.id) return false;
  for (const className of compound.classes) {
    if (!String(element.getAttribute('class') || '').split(/\s+/u).filter(Boolean).includes(className)) return false;
  }
  for (const attr of compound.attrs) {
    const raw = element.getAttribute(attr.name);
    if (raw === null) return false;
    if (!attr.op) continue;
    const haystack = attr.ci ? String(raw).toLowerCase() : String(raw);
    const needle = attr.ci ? String(attr.value).toLowerCase() : String(attr.value);
    if (attr.op === '=' && haystack !== needle) return false;
    if (attr.op === '*=' && !haystack.includes(needle)) return false;
    if (attr.op === '^=' && !haystack.startsWith(needle)) return false;
    if (attr.op === '$=' && !haystack.endsWith(needle)) return false;
    if (attr.op === '~=' && !haystack.split(/\s+/u).includes(needle)) return false;
    if (attr.op === '|=' && haystack !== needle && !haystack.startsWith(`${needle}-`)) return false;
  }
  return true;
}
function matchesGroup(element, group) {
  if (!matchesCompound(element, group[group.length - 1])) return false;
  let node = element.parentElement;
  let index = group.length - 2;
  while (index >= 0) {
    if (!node) return false;
    if (matchesCompound(node, group[index])) index -= 1;
    node = node.parentElement;
  }
  return true;
}
function elementMatches(element, selector) {
  const parsed = parseSelector(selector);
  return !!parsed && parsed.some((group) => matchesGroup(element, group));
}

// ── Instrumented mini-DOM ─────────────────────────────────────────────────
const createCountMap = () => new Map();
const increment = (map, key, amount = 1) => map.set(key, Number(map.get(key) || 0) + amount);
function newMetrics() {
  return {
    getComputedStyle: 0, getClientRects: 0, closest: 0, getAttribute: 0,
    gcsByAnchor: createCountMap(), rectsByAnchor: createCountMap(),
    closestByAnchor: createCountMap(), attrByAnchor: createCountMap(),
    visibility: [], syncPasses: 0, scheduleSyncCalls: 0,
    observerCallbacks: 0, observerVisibility: 0,
    anchorsVisited: 0, uniqueAnchorsVisited: new Set(),
    writes: 0, rafScheduled: 0, rafExecuted: 0,
  };
}
function resetCostMetrics(metrics) {
  for (const key of ['getComputedStyle', 'getClientRects', 'closest', 'getAttribute',
    'syncPasses', 'scheduleSyncCalls', 'observerCallbacks', 'observerVisibility',
    'anchorsVisited', 'writes', 'rafScheduled', 'rafExecuted']) metrics[key] = 0;
  metrics.gcsByAnchor.clear(); metrics.rectsByAnchor.clear();
  metrics.closestByAnchor.clear(); metrics.attrByAnchor.clear();
  metrics.uniqueAnchorsVisited.clear(); metrics.visibility.length = 0;
}

function buildScene(spec) {
  const metrics = newMetrics();
  const all = [];
  let documentElement = null;
  const observers = [];
  const rafQueue = [];
  const timers = new Map();
  let nextTimer = 1;

  class HTMLElement {
    constructor(tagName = 'div', id = '') {
      this.nodeType = 1;
      this.tagName = String(tagName).toUpperCase();
      this.__attrs = new Map();
      this.__children = [];
      this.__connected = true;
      this.__css = { display: 'block', visibility: 'visible', opacity: '1' };
      this.parentElement = null;
      this.__text = '';
      if (id) this.__attrs.set('id', id);
      all.push(this);
    }
    get id() { return this.__attrs.get('id') || ''; }
    set id(value) { if (value) this.__attrs.set('id', String(value)); else this.__attrs.delete('id'); }
    get className() { return this.__attrs.get('class') || ''; }
    set className(value) { this.__attrs.set('class', String(value)); }
    get textContent() { return this.__text; }
    set textContent(value) { this.__text = String(value ?? ''); metrics.writes += 1; }
    get hidden() { return this.__attrs.has('hidden'); }
    set hidden(value) { if (value) this.__attrs.set('hidden', ''); else this.__attrs.delete('hidden'); }
    get isConnected() {
      if (!this.__connected) return false;
      let node = this;
      while (node) { if (node === documentElement) return true; node = node.parentElement; }
      return false;
    }
    get children() { return this.__children.slice(); }
    get firstElementChild() { return this.__children[0] || null; }
    get nextSibling() {
      if (!this.parentElement) return null;
      const index = this.parentElement.__children.indexOf(this);
      return index >= 0 ? this.parentElement.__children[index + 1] || null : null;
    }
    getAttribute(name) {
      if (this.tagName === 'A') {
        metrics.getAttribute += 1; increment(metrics.attrByAnchor, this.id || '?');
      }
      return this.__attrs.has(name) ? this.__attrs.get(name) : null;
    }
    hasAttribute(name) { return this.__attrs.has(name); }
    setAttribute(name, value) { this.__attrs.set(name, String(value)); metrics.writes += 1; }
    removeAttribute(name) { this.__attrs.delete(name); metrics.writes += 1; }
    appendChild(child) { child.parentElement = this; child.__connected = true; this.__children.push(child); return child; }
    insertBefore(child, before) {
      child.parentElement = this; child.__connected = true;
      const index = before ? this.__children.indexOf(before) : -1;
      if (index < 0) this.__children.push(child); else this.__children.splice(index, 0, child);
      return child;
    }
    insertAdjacentElement(position, child) {
      if (position !== 'afterend' || !this.parentElement) return null;
      this.parentElement.insertBefore(child, this.nextSibling);
      return child;
    }
    remove() {
      if (this.parentElement) {
        const index = this.parentElement.__children.indexOf(this);
        if (index >= 0) this.parentElement.__children.splice(index, 1);
      }
      this.parentElement = null; this.__connected = false; metrics.writes += 1;
    }
    contains(other) { let node = other; while (node) { if (node === this) return true; node = node.parentElement; } return false; }
    matches(selector) { return elementMatches(this, selector); }
    closest(selector) {
      if (this.tagName === 'A') { metrics.closest += 1; increment(metrics.closestByAnchor, this.id || '?'); }
      let node = this;
      while (node) { if (elementMatches(node, selector)) return node; node = node.parentElement; }
      return null;
    }
    querySelectorAll(selector) {
      const result = descendants(this).filter((element) => elementMatches(element, selector));
      if (selector === 'a[href]') {
        metrics.anchorsVisited += result.length;
        for (const anchor of result) metrics.uniqueAnchorsVisited.add(anchor.id || '?');
      }
      return result;
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    getClientRects() {
      if (this.tagName === 'A') {
        metrics.getClientRects += 1; increment(metrics.rectsByAnchor, this.id || '?');
      }
      if (!this.isConnected) return [];
      let node = this;
      while (node) {
        if (node.hidden || node.getAttribute?.('aria-hidden') === 'true' ||
            node.__css.display === 'none' || node.__css.visibility === 'hidden' || Number(node.__css.opacity) === 0) return [];
        node = node.parentElement;
      }
      return [{}];
    }
  }

  function descendants(root) {
    const out = [];
    const visit = (node) => { for (const child of node.__children) { out.push(child); visit(child); } };
    visit(root); return out;
  }

  documentElement = new HTMLElement('html', 'html');
  const head = new HTMLElement('head', 'head');
  const body = new HTMLElement('body', 'body');
  documentElement.appendChild(head); documentElement.appendChild(body);
  const D = {
    documentElement, head, body,
    createElement: (tag) => new HTMLElement(tag),
    getElementById: (id) => descendants(documentElement).find((element) => element.id === id) || null,
    querySelectorAll: (selector) => descendants(documentElement).filter((element) => elementMatches(element, selector)),
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; },
  };
  class MutationObserver {
    constructor(callback) { this.callback = callback; this.targets = []; this.connected = true; observers.push(this); }
    observe(target, options) { this.targets.push({ target, options }); }
    disconnect() { this.connected = false; this.targets = []; }
    emit(records) { if (this.connected) { metrics.observerCallbacks += 1; this.callback(records); } }
  }
  const location = {
    origin: 'https://chatgpt.com',
    href: new URL(spec.route || '/c/chat-main', 'https://chatgpt.com').href,
    get pathname() { return new URL(this.href).pathname; },
  };
  const H2O = {
    ChatTitle: {
      subscribe(callback) { scene.subscription = callback; return () => { scene.subscription = null; }; },
    },
  };
  const W = {
    H2O, location, MutationObserver,
    getComputedStyle(element) {
      if (element?.tagName === 'A') {
        metrics.getComputedStyle += 1; increment(metrics.gcsByAnchor, element.id || '?');
      }
      return { ...element.__css };
    },
    requestAnimationFrame(callback) { metrics.rafScheduled += 1; rafQueue.push(callback); return rafQueue.length; },
    cancelAnimationFrame(id) { if (id > 0 && rafQueue[id - 1]) rafQueue[id - 1] = null; },
    setTimeout(callback, ms) { const id = nextTimer++; timers.set(id, { callback, ms }); return id; },
    clearTimeout(id) { timers.delete(id); },
  };
  const byId = new Map();
  const containers = {};
  for (const kind of spec.containers || ['nav']) {
    const container = new HTMLElement(kind, `${kind}-container`);
    body.appendChild(container); containers[kind] = container; byId.set(container.id, container);
  }

  function createAnchor(definition) {
    const anchor = new HTMLElement('a', definition.id);
    anchor.setAttribute('href', definition.href || '/c/foreign');
    if (definition.hidden) anchor.hidden = true;
    if (definition.ariaHidden) anchor.setAttribute('aria-hidden', 'true');
    Object.assign(anchor.__css, definition.css || {});
    const container = containers[definition.container || 'nav'] || containers.nav || containers.aside;
    let parent = container;
    if (definition.wrapper) {
      const wrapper = new HTMLElement('div', `${definition.id}-wrapper`);
      if (definition.wrapper === 'aria') wrapper.setAttribute('aria-hidden', 'true');
      if (definition.wrapper === 'hidden') wrapper.hidden = true;
      if (definition.wrapper === 'display-none') wrapper.__css.display = 'none';
      if (definition.wrapper === 'owner') wrapper.setAttribute('data-h2o-owner', 'foreign-owner');
      container.appendChild(wrapper); parent = wrapper; byId.set(wrapper.id, wrapper);
    }
    parent.appendChild(anchor);
    if (definition.connected === false) anchor.__connected = false;
    if (definition.source !== false) {
      const source = new HTMLElement('span', `${definition.id}-source`);
      source.className = 'truncate'; source.textContent = definition.title || `Native ${definition.id}`;
      anchor.appendChild(source); byId.set(source.id, source);
    }
    byId.set(anchor.id, anchor);
    return anchor;
  }
  for (const definition of spec.anchors || []) createAnchor(definition);

  const scene = {
    metrics, D, W, H2O, HTMLElement, MutationObserver, body, head, documentElement,
    byId, containers, observers, subscription: null, createAnchor,
    setRoute(route) { location.href = new URL(route, location.origin).href; },
    flushRaf() {
      const batch = rafQueue.splice(0, rafQueue.length);
      for (const callback of batch) if (typeof callback === 'function') { metrics.rafExecuted += 1; callback(); }
    },
    emitMutation(records = [{ target: containers.nav || containers.aside, addedNodes: [], removedNodes: [] }]) {
      const active = observers.find((entry) => entry.connected);
      if (!active) throw new Error('TEST_HARNESS_BLOCKED:observer-missing');
      active.emit(records);
    },
    resetCosts() { resetCostMetrics(metrics); },
    replaceSource(anchorId, text = 'Replacement title') {
      const anchor = byId.get(anchorId);
      const old = anchor?.querySelector('.truncate,[class*="truncate"]');
      old?.remove?.();
      const source = new HTMLElement('span', `${anchorId}-source-v2`);
      source.className = 'truncate'; source.textContent = text; anchor.appendChild(source); byId.set(source.id, source);
      return source;
    },
  };
  return scene;
}

// ── Production instrumentation injection ─────────────────────────────────
const VARIANTS = Object.freeze({
  natural: { order: 'natural', memo: 'none' },
  guardBoth: { order: 'route-first', memo: 'pass' },
  injectOrder: { order: 'visibility-first', memo: 'pass' },
  injectRepeat: { order: 'route-first', memo: 'pass', repeat: true },
  injectBoth: { order: 'visibility-first', memo: 'pass', repeat: true },
  stale: { order: 'route-first', memo: 'stale' },
  wrongSelected: { order: 'route-first', memo: 'pass', reverse: true },
  truncate: { order: 'route-first', memo: 'pass', truncate: true },
});
function instrumentedProgram(variant) {
  const config = VARIANTS[variant] || VARIANTS.natural;
  const injection = String.raw`
  const __testConfig = ${JSON.stringify(config)};
  const __realVisible = isVisibleAnchor;
  const __realCandidate = candidateFor;
  const __realFind = findCandidates;
  const __realReleaseInvalid = releaseInvalidSynchronously;
  const __realSync = syncSidebar;
  const __realSchedule = scheduleSync;
  let __testPhase = 'outside', __testPass = 0, __testPassMemo = null;
  const __testStaleMemo = new Map();
  function __testRecordVisible(anchor, bypass) {
    const memo = __testConfig.memo === 'stale' ? __testStaleMemo : __testPassMemo;
    if (!bypass && memo && memo.has(anchor)) return memo.get(anchor);
    __M.recordVisibility(anchor, __testPhase, __testPass);
    const value = __realVisible(anchor);
    if (!bypass && memo) memo.set(anchor, value);
    return value;
  }
  isVisibleAnchor = function (anchor) { return __testRecordVisible(anchor, false); };
  candidateFor = function (anchor, snapshot) {
    const identity = routeIdentityFromHref(anchor?.getAttribute?.('href'));
    const matchesRoute = !!identity && identity.key === snapshot?.routeIdentity?.key;
    if (__testConfig.order === 'route-first' && !matchesRoute) return null;
    if (__testConfig.order === 'visibility-first' && !isVisibleAnchor(anchor)) return null;
    if (__testConfig.repeat && matchesRoute) __testRecordVisible(anchor, true);
    return __realCandidate(anchor, snapshot);
  };
  findCandidates = function (snapshot, containers) {
    let value = __realFind(snapshot, containers);
    if (__testConfig.reverse) value = [...value].reverse();
    if (__testConfig.truncate) value = value.slice(0, 1);
    return value;
  };
  releaseInvalidSynchronously = function () {
    const prior = __testPhase;
    if (prior === 'outside') __testPhase = 'observer';
    try { return __realReleaseInvalid(); }
    finally { __testPhase = prior; }
  };
  syncSidebar = function () {
    const priorPhase = __testPhase, priorMemo = __testPassMemo;
    __testPhase = 'sync'; __testPass += 1; __M.syncPasses += 1;
    __testPassMemo = __testConfig.memo === 'pass' ? new Map() : null;
    try { return __realSync(); }
    finally { __testPhase = priorPhase; __testPassMemo = priorMemo; }
  };
  scheduleSync = function () { __M.scheduleSyncCalls += 1; return __realSchedule(); };
  globalThis.__B2_TEST = {
    accept: acceptSnapshot,
    schedule: scheduleSync,
    sync: syncSidebar,
    release: releaseInvalidSynchronously,
    diagnose,
    destroy,
    adoptions: () => [...adoptions.keys()].map((anchor) => anchor.id),
    visuals: () => [...adoptions].map(([anchor, record]) => ({ anchor: anchor.id, text: record.visual?.textContent || '', source: record.source?.id || '' })),
    observer: () => observer,
    snapshot: () => acceptedSnapshot,
  };
`;
  return SOURCE.replace(BOOT_MARKER, `${injection}\n${BOOT_MARKER}`);
}

function runScene(spec, variant = 'natural') {
  const scene = buildScene(spec);
  scene.metrics.recordVisibility = (anchor, phase, pass) => {
    const id = anchor?.id || '?';
    scene.metrics.visibility.push({ id, phase, pass });
    if (phase === 'observer') scene.metrics.observerVisibility += 1;
  };
  const sandbox = {
    window: scene.W, document: scene.D, HTMLElement: scene.HTMLElement,
    URL, decodeURIComponent, Math, Object, Array, Map, Set, WeakMap,
    String, Number, Boolean, RegExp, Error, Date, JSON, console,
    __M: scene.metrics,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(instrumentedProgram(variant), sandbox, { filename: `${MODULE_REL}:cost-harness` });
  const api = sandbox.__B2_TEST;
  if (!api) throw new Error('TEST_HARNESS_BLOCKED:api-missing');
  return {
    scene, api, metrics: scene.metrics,
    accept(snapshot) { api.accept(snapshot); scene.flushRaf(); },
    sync() { api.schedule(); scene.flushRaf(); },
    emit(records) { scene.emitMutation(records); },
    flush() { scene.flushRaf(); },
    adoptions() { return Array.from(api.adoptions()); },
    visuals() { return Array.from(api.visuals(), (entry) => ({ ...entry })); },
  };
}

// ── Independent fixture declarations ──────────────────────────────────────
const MAIN_CHAT = 'chat-main';
const route = (chatId = MAIN_CHAT, projectId = '') => projectId ? `/g/${projectId}/c/${chatId}` : `/c/${chatId}`;
const anchor = (id, href, extras = {}) => ({ id, href, ...extras });
const snapshot = (chatId = MAIN_CHAT, overrides = {}) => ({
  routeKind: 'chat', chatId, routeToken: 1, baseTitle: `Title ${chatId}`,
  emoji: '🧪', displayTitle: `🧪 Title ${chatId}`,
  convergence: { enabled: true, mode: 'canonical' },
  ...overrides,
});
const spec = (anchors, overrides = {}) => ({ route: route(MAIN_CHAT), containers: ['nav', 'aside'], anchors, ...overrides });
const ids = (prefix, count, hrefFactory) => Array.from({ length: count }, (_, index) =>
  anchor(`${prefix}-${index + 1}`, hrefFactory(index)));
const visibleMatches = (count) => ids('match', count, () => route(MAIN_CHAT));
const visibleMisses = (count) => ids('miss', count, (index) => route(`foreign-${index + 1}`));
const expectedFirstSix = (count) => Array.from({ length: Math.min(6, count) }, (_, index) => `match-${index + 1}`);

function settle(sceneSpec, variant = 'natural', snap = snapshot()) {
  const result = runScene(sceneSpec, variant); result.accept(snap); return result;
}
function visibilitySummary(metrics, phase = 'sync') {
  const list = metrics.visibility.filter((entry) => entry.phase === phase);
  const byPass = new Map();
  for (const entry of list) {
    const pass = byPass.get(entry.pass) || new Map(); increment(pass, entry.id); byPass.set(entry.pass, pass);
  }
  const repeated = [];
  for (const [pass, counts] of byPass) for (const [id, count] of counts) if (count > 1) repeated.push({ pass, id, count });
  return { total: list.length, unique: new Set(list.map((entry) => entry.id)).size, repeated, byPass };
}
function routeFilterMeasurement(variant = 'natural') {
  const sceneSpec = spec([...visibleMisses(39), anchor('current', route(MAIN_CHAT))]);
  const result = settle(sceneSpec, variant);
  const nonmatching = visibleMisses(39).map((entry) => entry.id);
  const sum = (map) => nonmatching.reduce((total, id) => total + Number(map.get(id) || 0), 0);
  return {
    result, nonmatching,
    nonmatchGcs: sum(result.metrics.gcsByAnchor),
    nonmatchRects: sum(result.metrics.rectsByAnchor),
    nonmatchClosest: sum(result.metrics.closestByAnchor),
    nonmatchVisibility: result.metrics.visibility.filter((entry) => nonmatching.includes(entry.id)).length,
  };
}
function repeatMeasurement(variant = 'natural') {
  const result = settle(spec([...visibleMatches(6), ...visibleMisses(34)]), variant);
  result.scene.resetCosts(); result.sync();
  return { result, summary: visibilitySummary(result.metrics) };
}
function contractStates(variant) {
  const order = routeFilterMeasurement(variant);
  const repeat = repeatMeasurement(variant);
  return {
    c1: order.nonmatchGcs > 0 || order.nonmatchRects > 0 || order.nonmatchVisibility > 0,
    c2: repeat.summary.repeated.length > 0,
    order, repeat,
  };
}

// ── Semantic fixtures (independent expected values) ───────────────────────
fixture('1. one visible matching anchor is adopted', () => {
  eq(settle(spec([anchor('current', route())])).adoptions(), ['current'], 'exact match adopted');
});
fixture('2. many visible nonmatching anchors do not change the selected row', () => {
  eq(settle(spec([...visibleMisses(39), anchor('current', route())])).adoptions(), ['current'], 'only exact route adopted');
});
fixture('3. hidden matching anchor is rejected', () => {
  eq(settle(spec([anchor('current', route(), { hidden: true })])).adoptions(), [], 'hidden rejected');
});
fixture('4. aria-hidden ancestor rejects a matching anchor', () => {
  eq(settle(spec([anchor('current', route(), { wrapper: 'aria' })])).adoptions(), [], 'aria-hidden ancestor rejected');
});
fixture('5. display-none ancestor rejects a matching anchor', () => {
  eq(settle(spec([anchor('current', route(), { wrapper: 'display-none' })])).adoptions(), [], 'display-none ancestor rejected');
});
fixture('6. H2O-owned surface rejects a matching anchor', () => {
  eq(settle(spec([anchor('current', route(), { wrapper: 'owner' })])).adoptions(), [], 'owned surface rejected');
});
fixture('7. disconnected adopted anchor is released', () => {
  const result = settle(spec([anchor('current', route())]));
  result.scene.byId.get('current').__connected = false; result.sync();
  eq(result.adoptions(), [], 'disconnected adoption released');
});
fixture('8. valid already-adopted anchor remains adopted', () => {
  const result = settle(spec([anchor('current', route())])); result.sync();
  eq(result.adoptions(), ['current'], 'valid adoption retained');
  eq(result.api.diagnose().releases, 0, 'no release');
});
fixture('9. adoption is capped deterministically at six rows', () => {
  const result = settle(spec(visibleMatches(8)));
  eq(result.adoptions(), expectedFirstSix(8), 'first six adopted in DOM order');
  eq(result.api.diagnose().overflowCandidates, 2, 'two overflow candidates');
});
fixture('10. duplicate route anchors retain deterministic DOM order', () => {
  eq(settle(spec(visibleMatches(2))).adoptions(), ['match-1', 'match-2'], 'duplicates use DOM order');
});
fixture('11. nav and aside discovery both participate', () => {
  const result = settle(spec([
    anchor('nav-match', route(), { container: 'nav' }),
    anchor('aside-match', route(), { container: 'aside' }),
  ]));
  eq(result.adoptions(), ['nav-match', 'aside-match'], 'nav then aside discovery order');
});
fixture('12. route change releases A and adopts B', () => {
  const result = settle(spec([anchor('a', route('chat-main')), anchor('b', route('chat-b'))]));
  result.scene.setRoute(route('chat-b')); result.accept(snapshot('chat-b', { routeToken: 2 }));
  eq(result.adoptions(), ['b'], 'new exact route adopted');
});
fixture('13. snapshot change updates the existing visual without changing selection', () => {
  const result = settle(spec([anchor('current', route())]));
  result.accept(snapshot(MAIN_CHAT, { routeToken: 1, baseTitle: 'Updated title', displayTitle: '🧪 Updated title' }));
  eq(result.adoptions(), ['current'], 'same row retained');
  // Atlas/main lineage renders snapshot.displayTitle; the baseTitle lineage
  // renders the title remainder. Same fixture data, lineage-correct oracle.
  eq(result.visuals()[0].text, '🧪 Updated title', 'visual follows snapshot');
});
fixture('14. native title node replacement releases and re-adopts', () => {
  const result = settle(spec([anchor('current', route())]));
  result.scene.replaceSource('current'); result.sync();
  eq(result.adoptions(), ['current'], 'row re-adopted');
  eq(result.visuals()[0].source, 'current-source-v2', 'replacement source owns adoption');
});
fixture('15. collapse then expand releases and re-adopts', () => {
  const result = settle(spec([anchor('current', route())]));
  result.scene.containers.nav.hidden = true; result.sync(); eq(result.adoptions(), [], 'collapsed release');
  result.scene.containers.nav.hidden = false; result.sync(); eq(result.adoptions(), ['current'], 'expanded re-adoption');
});
fixture('16. expand then collapse releases the row', () => {
  const result = settle(spec([anchor('current', route())]));
  eq(result.adoptions(), ['current'], 'expanded adoption');
  result.scene.byId.get('current').setAttribute('aria-hidden', 'true'); result.sync();
  eq(result.adoptions(), [], 'collapsed/hidden release');
});
fixture('17. dynamically hydrated matching anchor is adopted later', () => {
  const result = settle(spec(visibleMisses(4)));
  eq(result.adoptions(), [], 'nothing initially');
  result.scene.createAnchor(anchor('hydrated', route())); result.sync();
  eq(result.adoptions(), ['hydrated'], 'hydrated row adopted');
});
fixture('18. no matching route produces no adoption', () => {
  eq(settle(spec(visibleMisses(40))).adoptions(), [], 'no false adoption');
});

// ── Cross-pass invalidation controls for a pass-scoped correction ─────────
control('route changes force a fresh visibility evaluation', () => {
  const result = settle(spec([anchor('a', route()), anchor('b', route('chat-b'))]), 'guardBoth');
  result.scene.resetCosts(); result.scene.setRoute(route('chat-b')); result.accept(snapshot('chat-b', { routeToken: 2 }));
  eq(result.adoptions(), ['b'], 'new route'); atLeast(result.metrics.visibility.length, 1, 'fresh evaluation');
});
control('snapshot changes force a fresh later-pass evaluation', () => {
  const result = settle(spec([anchor('current', route())]), 'guardBoth'); result.scene.resetCosts();
  result.accept(snapshot(MAIN_CHAT, { baseTitle: 'Next' }));
  atLeast(result.metrics.visibility.length, 1, 'fresh snapshot pass');
});
control('DOM replacement forces fresh source and visibility evaluation', () => {
  const result = settle(spec([anchor('current', route())]), 'guardBoth'); result.scene.resetCosts();
  result.scene.replaceSource('current'); result.sync();
  eq(result.visuals()[0].source, 'current-source-v2', 'replacement adopted'); atLeast(result.metrics.visibility.length, 1, 'fresh evaluation');
});
control('connection-state changes invalidate the prior result', () => {
  const result = settle(spec([anchor('current', route())]), 'guardBoth'); result.scene.resetCosts();
  result.scene.byId.get('current').__connected = false; result.sync(); eq(result.adoptions(), [], 'disconnected release');
});
control('hidden and aria-hidden changes invalidate prior visibility', () => {
  const result = settle(spec([anchor('current', route())]), 'guardBoth');
  result.scene.byId.get('current').setAttribute('aria-hidden', 'true'); result.sync(); eq(result.adoptions(), [], 'hidden release');
  result.scene.byId.get('current').removeAttribute('aria-hidden'); result.sync(); eq(result.adoptions(), ['current'], 'visible again');
});
control('collapse and expand each run a new pass', () => {
  const result = settle(spec([anchor('current', route())]), 'guardBoth'); result.scene.resetCosts();
  result.scene.containers.nav.hidden = true; result.sync(); result.scene.containers.nav.hidden = false; result.sync();
  eq(result.adoptions(), ['current'], 're-adopted'); atLeast(result.metrics.syncPasses, 2, 'two later passes');
});
control('dynamic hydration is visible to a later pass', () => {
  const result = settle(spec(visibleMisses(3)), 'guardBoth'); result.scene.resetCosts();
  result.scene.createAnchor(anchor('hydrated', route())); result.sync(); eq(result.adoptions(), ['hydrated'], 'hydrated adoption');
});
control('unchanged later sync still creates a fresh pass-scoped evaluation', () => {
  const result = settle(spec([anchor('current', route())]), 'guardBoth'); result.scene.resetCosts();
  result.sync(); result.sync();
  eq(result.adoptions(), ['current'], 'semantics stable'); eq(result.metrics.syncPasses, 2, 'two passes');
  eq(visibilitySummary(result.metrics).total, 2, 'one fresh evaluation in each pass');
});

// ── Natural RED targets ───────────────────────────────────────────────────
const routeTarget = routeFilterMeasurement('natural');
const repeatTarget = repeatMeasurement('natural');

contract('SIDEBAR_TITLE_ROUTE_FILTER_MUST_PRECEDE_EXPENSIVE_VISIBILITY_PROBES', () => {
  eq(routeTarget.result.adoptions(), ['current'], 'semantic oracle remains exact');
  eq(routeTarget.nonmatchVisibility, 0, 'nonmatching anchors must not begin visibility evaluation');
  eq(routeTarget.nonmatchGcs, 0, 'nonmatching anchors must not call getComputedStyle');
  eq(routeTarget.nonmatchRects, 0, 'nonmatching anchors must not call getClientRects');
});
contract('SIDEBAR_TITLE_VISIBILITY_MUST_RUN_AT_MOST_ONCE_PER_ANCHOR_PER_SYNC_PASS', () => {
  eq(repeatTarget.result.adoptions(), expectedFirstSix(6), 'semantic adoption set remains exact');
  for (const repeated of repeatTarget.summary.repeated) {
    atMost(repeated.count, 1, `pass ${repeated.pass} anchor ${repeated.id} visibility evaluation`);
  }
});

// Observer boundary: pristine synchronous release plus the coalesced rAF pass.
const observerTarget = settle(spec([...visibleMatches(6), ...visibleMisses(34)]), 'natural');
observerTarget.scene.resetCosts();
observerTarget.emit([{ target: observerTarget.scene.containers.nav, addedNodes: [], removedNodes: [] }]);
const observerBeforeRaf = observerTarget.metrics.visibility.length;
observerTarget.flush();
const observerAfterRaf = observerTarget.metrics.visibility.length;
const observerCycleCounts = new Map();
for (const entry of observerTarget.metrics.visibility) increment(observerCycleCounts, entry.id);
const observerCycleRepeated = [...observerCycleCounts].filter(([, count]) => count > 1);

// ── Version-agnostic injected-defect matrix ───────────────────────────────
const MATRIX = [];
const recordMatrix = (id, state) => MATRIX.push({
  id, c1: state.c1 ? 'RED' : 'GREEN', c2: state.c2 ? 'RED' : 'GREEN',
  nonmatchVisibility: state.order.nonmatchVisibility,
  repeated: state.repeat.summary.repeated.length,
});
mutation('A. visibility-before-route injection isolates Contract 1', () => {
  const state = contractStates('injectOrder'); recordMatrix('A injectOrder', state);
  eq(state.c1, true, 'Contract 1 RED'); eq(state.c2, false, 'Contract 2 GREEN');
});
mutation('B. duplicate same-anchor injection isolates Contract 2', () => {
  const state = contractStates('injectRepeat'); recordMatrix('B injectRepeat', state);
  eq(state.c1, false, 'Contract 1 GREEN'); eq(state.c2, true, 'Contract 2 RED');
});
mutation('C. both injected defects turn both contracts RED', () => {
  const state = contractStates('injectBoth'); recordMatrix('C injectBoth', state);
  eq(state.c1, true, 'Contract 1 RED'); eq(state.c2, true, 'Contract 2 RED');
});
mutation('D. cross-pass stale visibility reuse fails invalidation', () => {
  const fresh = settle(spec([anchor('current', route())]), 'guardBoth');
  fresh.scene.byId.get('current').setAttribute('aria-hidden', 'true'); fresh.sync(); eq(fresh.adoptions(), [], 'fresh pass sees hidden');
  const stale = settle(spec([anchor('current', route())]), 'stale');
  stale.scene.byId.get('current').setAttribute('aria-hidden', 'true'); stale.sync();
  ok(stale.adoptions().includes('current'), 'stale cross-pass result incorrectly preserves adoption and is rejected');
});
mutation('E. wrong deterministic selection with cheap counters fails semantic oracle', () => {
  const result = settle(spec(visibleMatches(8)), 'wrongSelected');
  ok(JSON.stringify(result.adoptions()) !== JSON.stringify(expectedFirstSix(8)), 'wrong six-row selection rejected');
});
mutation('F. truncated adoption set fails semantic oracle', () => {
  const result = settle(spec(visibleMatches(6)), 'truncate');
  eq(result.adoptions().length, 1, 'fault injected');
  ok(JSON.stringify(result.adoptions()) !== JSON.stringify(expectedFirstSix(6)), 'truncated set rejected');
});
mutation('G. cost counters alone cannot generate PASS', () => {
  const state = contractStates('guardBoth');
  eq(state.c1, false, 'Contract 1 counter green'); eq(state.c2, false, 'Contract 2 counter green');
  const wrong = settle(spec(visibleMatches(8)), 'wrongSelected');
  ok(JSON.stringify(wrong.adoptions()) !== JSON.stringify(expectedFirstSix(8)), 'semantic oracle still rejects cheap wrong output');
});

// ── Report / exit contract ────────────────────────────────────────────────
const failedContracts = contracts.filter((entry) => !entry.ok);
const failedSemantic = semantic.filter((entry) => !entry.ok);
const failedInvalidation = invalidation.filter((entry) => !entry.ok);
const failedIntegrity = integrity.filter((entry) => !entry.ok);

console.log('Sidebar Title Renderer visibility-probe cost (9B2a) — Gate B');
console.log('');
console.log(`Module under test: ${MODULE_REL}`);
console.log(`Unsupported selectors: ${unsupportedSelectors.size ? [...unsupportedSelectors].join(' | ') : 'none'}`);
console.log('');
console.log('Route-filter target (39 visible nonmatches + one exact match):');
console.log(`  anchors visited / unique                 = ${routeTarget.result.metrics.anchorsVisited} / ${routeTarget.result.metrics.uniqueAnchorsVisited.size}`);
console.log(`  nonmatching visibility evaluations       = ${routeTarget.nonmatchVisibility}`);
console.log(`  nonmatching getComputedStyle             = ${routeTarget.nonmatchGcs}`);
console.log(`  nonmatching getClientRects               = ${routeTarget.nonmatchRects}`);
console.log(`  nonmatching closest walks                = ${routeTarget.nonmatchClosest}`);
console.log(`  selected / adoptions                     = ${routeTarget.result.adoptions()[0] || 'none'} / ${JSON.stringify(routeTarget.result.adoptions())}`);
console.log('');
console.log('Same-pass target (six adopted exact-route rows + 34 nonmatches):');
console.log(`  visibility evaluations / unique          = ${repeatTarget.summary.total} / ${repeatTarget.summary.unique}`);
console.log(`  repeated anchors                         = ${JSON.stringify(repeatTarget.summary.repeated)}`);
console.log(`  sync passes                              = ${repeatTarget.result.metrics.syncPasses}`);
console.log(`  adoptions                                = ${JSON.stringify(repeatTarget.result.adoptions())}`);
console.log('');
console.log('Observer mutation-to-sync cycle:');
console.log(`  synchronous observer visibility          = ${observerBeforeRaf}`);
console.log(`  rAF sync visibility                      = ${observerAfterRaf - observerBeforeRaf}`);
console.log(`  cycle total / repeated anchors           = ${observerAfterRaf} / ${JSON.stringify(observerCycleRepeated)}`);
console.log(`  scheduleSync calls / sync passes         = ${observerTarget.metrics.scheduleSyncCalls} / ${observerTarget.metrics.syncPasses}`);
console.log('');
console.log('Injected-fault matrix:');
for (const row of MATRIX) console.log(`  ${row.id.padEnd(16)} C1 ${row.c1.padEnd(5)} C2 ${row.c2.padEnd(5)} nonmatch ${row.nonmatchVisibility} repeated ${row.repeated}`);
console.log('');
console.log('Cost contracts:');
for (const entry of contracts) {
  console.log(`  ${entry.ok ? 'GREEN' : 'RED  '} ${entry.id}`);
  if (!entry.ok) console.log(`        ${String(entry.error).split('\n')[0]}`);
}
const reportBucket = (label, list) => {
  const failed = list.filter((entry) => !entry.ok);
  console.log(`${label}: ${list.length - failed.length}/${list.length}`);
  for (const entry of failed) console.log(`  FAIL ${entry.name}\n       ${String(entry.error).split('\n')[0]}`);
};
reportBucket('Semantic fixtures', semantic);
reportBucket('Invalidation controls', invalidation);
reportBucket('Integrity mutations', integrity);
console.log(`Assertions: ${assertions}`);
console.log(`RED_CONTRACT_FAILURE_COUNT: ${failedContracts.length}`);
console.log(`OTHER_FAILURE_COUNT: ${failedSemantic.length + failedInvalidation.length + failedIntegrity.length}`);

if (unsupportedSelectors.size || failedSemantic.length || failedInvalidation.length || failedIntegrity.length) {
  console.log('Sidebar Title Renderer visibility-probe cost: HARNESS OR SEMANTIC FAILURE');
  process.exit(2);
}
if (failedContracts.length) {
  console.log('Sidebar Title Renderer visibility-probe cost: RED (expected until 9B2a is corrected)');
  process.exit(1);
}
console.log('Sidebar Title Renderer visibility-probe cost passed');
