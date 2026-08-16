#!/usr/bin/env node
// Folders native-menu discovery cost contract (Gate A).
//
// Proven live (matched post-Dock run, 37-turn workload): 0F3a Folders cost
// 2611.077 ms, of which ENGINE_tryInjectNativeChatMenu accounted for 2509.419 ms
// and `get innerText` alone for 2497.199 ms — 95.6% of the whole module. No
// getBoundingClientRect / getComputedStyle / getClientRects / offsetParent
// appears anywhere in that subtree: innerText is the only layout-dependent API
// on the path, and it is layout-dependent precisely because it is defined in
// terms of RENDERED text.
//
// The structural waste behind that number:
//
//   MutationObserver(document.body, {childList, subtree})
//     for each ADDED NODE:
//       menus = DOM_collectNativeMenuCandidates(node)
//       if (!menus.length) menus = DOM_collectNativeMenuCandidates(document.body).slice(0, 8)
//       for (menu of menus) ENGINE_scheduleNativeChatMenuInjection(menu, 'mutation')
//
// SEL.radixMenu ends in `[data-state="open"]`, which matches ordinary open
// Radix disclosures — so a transcript turn mounting during scroll drags up to
// eight NON-menu containers through the full evaluation. And each evaluation
// reads innerText TWICE from the same element:
//
//   const txt = UTIL_normText(menu.innerText || ...)   // read #1 -> diagnostic only
//   STATE.menuDiag.lastSignatureSample = txt.slice(0, 120);
//   if (DOM_nativeChatMenuSignatureScore(menu) < 2)    // read #2 -> re-reads the same text
//
// This validator pins two SAFE contracts only:
//
//   1. candidates cheaply provable to be non-menus must not pay innerText
//   2. a genuine menu evaluation must not read the same rendered text twice
//
// Deliberately NOT required here: which structural predicate runs first,
// [role="menuitem"] specifically, changes to SEL.radixMenu or the observer
// scope, removal of the body fallback, frame coalescing, menu caching,
// menu-open state gating, textContent substitution, or any change to the
// signature threshold or injection semantics. Those are separate decisions and
// must not be smuggled in through this gate.
//
// The REAL production implementations are extracted by name and executed
// against an instrumented DOM. No production source is modified.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const FOLDERS_PATH = 'src-runtime-base/0F3a.⬛️🗂️ Folders 🗂️.js';
const SOURCE = fs.readFileSync(path.join(ROOT, FOLDERS_PATH), 'utf8');

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

// ── Real-source extraction ────────────────────────────────────────────────
// 0F3a is a 320KB self-booting IIFE owning storage, routing, providers and UI.
// Executing it whole would require a materially fake environment for systems
// unrelated to this contract, so the REAL implementations on the cost path are
// extracted by name and run together in one VM scope. Every function named in
// the hot path is real production code; nothing on the path is re-implemented.
function extractFunction(name) {
  const anchor = `  function ${name}(`;
  const start = SOURCE.indexOf(anchor);
  if (start < 0 || SOURCE.indexOf(anchor, start + anchor.length) >= 0) {
    throw new Error(`TEST_HARNESS_BLOCKED:function-anchor-invalid:${name}`);
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
    else if (c === '}' && --d === 0) return SOURCE.slice(start, i + 1);
  }
  throw new Error(`TEST_HARNESS_BLOCKED:function-boundary-invalid:${name}`);
}

function extractStatement(anchorText, endToken) {
  const start = SOURCE.indexOf(anchorText);
  if (start < 0) throw new Error(`TEST_HARNESS_BLOCKED:statement-anchor-missing:${anchorText.slice(0, 40)}`);
  const end = SOURCE.indexOf(endToken, start);
  if (end < 0) throw new Error(`TEST_HARNESS_BLOCKED:statement-end-missing:${anchorText.slice(0, 40)}`);
  return SOURCE.slice(start, end + endToken.length);
}

const HOT_PATH_FUNCTIONS = [
  'DOM_collectNativeMenuCandidates',
  'DOM_nativeChatMenuSignatureScore',
  'ENGINE_tryInjectNativeChatMenu',
  'ENGINE_scheduleNativeChatMenuInjection',
  'DOM_ensureMenuContext',
  'ENGINE_injectAddToFolder',
  'ENGINE_injectAddToLibrary',
  'DOM_findMenuAnchorItem',
  'DOM_findMenuItemByText',
  'DOM_setMenuItemLabel',
];

// Helpers a fix may or may not introduce. Loaded from real source when
// present; their absence is not an error, so this gate never mandates a
// particular decomposition — it only tests behaviour.
const OPTIONAL_FUNCTIONS = ['DOM_isLikelyNativeChatMenu', 'DOM_isNativeChatMenuRoute'];
const OPTIONAL_STATEMENTS = [
  ['  const SEL_NATIVE_MENU_STRONG = ', ';'],
  ['  const NATIVE_CHAT_MENU_ROUTE_RE = ', ';'],
];
const optionalFn = (n) => (SOURCE.includes(`  function ${n}(`) ? extractFunction(n) : '');
const optionalStmt = ([a, e]) => (SOURCE.includes(a) ? extractStatement(a, e) : '');
const LOADED_OPTIONAL = OPTIONAL_FUNCTIONS.filter((n) => SOURCE.includes(`  function ${n}(`));

const REAL_PROGRAM = [
  extractStatement('  const SkID = ', ';'),
  extractStatement('  const ATTR_CGXUI       = ', ';'),
  extractStatement('  const ATTR_CGXUI_OWNER = ', ';'),
  extractStatement('  const UTIL_normText = ', ';'),
  extractStatement('  const SEL = {', '\n  };'),
  extractStatement('  STATE.menuDiag = Object.assign({', 'STATE.menuDiag || {});'),
  ...OPTIONAL_STATEMENTS.map(optionalStmt),
  ...OPTIONAL_FUNCTIONS.map(optionalFn),
  ...HOT_PATH_FUNCTIONS.map(extractFunction),
].filter(Boolean).join('\n\n');

// ── Instrumented DOM ──────────────────────────────────────────────────────
// innerText is counted PER ELEMENT, directly on the getter — never inferred.
// The production SEL.radixMenu value, read straight from the table in source so
// the enumeration counter recognises the real sweep selector rather than a copy
// that could drift away from it.
const SEL_RADIX_MENU_FROM_SOURCE = (() => {
  const m = SOURCE.match(/\n\s*radixMenu:\s*'([^']+)'/);
  if (!m) throw new Error('TEST_HARNESS_BLOCKED:sel-radix-menu-unreadable');
  return m[1];
})();

const unesc = (s) => s.replace(/\\(.)/g, '$1');
function splitTop(sel, sep) {
  const out = []; let depth = 0, quote = '', buf = '';
  for (const c of sel) {
    if (quote) { buf += c; if (c === quote) quote = ''; continue; }
    if (c === '"' || c === "'") { quote = c; buf += c; continue; }
    if (c === '[') depth += 1;
    if (c === ']') depth -= 1;
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
        if ('.#['.includes(sel[j])) break;
        buf += sel[j]; j += 1;
      }
      if (c === '#') out.id = unesc(buf); else out.classes.push(unesc(buf));
      i = j; continue;
    }
    if (c === '[') {
      const end = sel.indexOf(']', i);
      if (end < 0) throw new Error('unsupported-selector');
      const m = /^([a-zA-Z0-9_:-]+)(?:([*^$|~]?=)\s*"([^"]*)"|([*^$|~]?=)\s*'([^']*)')?\s*(i)?$/
        .exec(sel.slice(i + 1, end).trim());
      if (!m) throw new Error('unsupported-selector');
      out.attrs.push({ name: m[1], op: m[2] || m[4] || null, value: m[3] !== undefined ? m[3] : m[5], ci: !!m[6] });
      i = end + 1; continue;
    }
    throw new Error('unsupported-selector');
  }
  return out;
}
const selCache = new Map();
const unsupported = new Set();
function parseSelector(sel) {
  if (selCache.has(sel)) return selCache.get(sel);
  let parsed = null;
  try { parsed = splitTop(sel, ',').map((g) => splitTop(g, ' ').map(parseCompound)); }
  catch { unsupported.add(sel); }
  selCache.set(sel, parsed);
  return parsed;
}
function matchesCompound(el, c) {
  if (c.tag && el.tagName.toLowerCase() !== c.tag) return false;
  if (c.id !== null && el.getAttribute('id') !== c.id) return false;
  for (const cls of c.classes) {
    if (!String(el.getAttribute('class') || '').split(/\s+/).filter(Boolean).includes(cls)) return false;
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

function createEnv() {
  // `cost` counts the four expensive discovery primitives at their REAL external
  // boundaries — the DOM accessors themselves and the one production-to-
  // production call edge — never by inspecting module internals.
  const state = {
    raf: [], timers: [], seq: 0, stubCalls: [],
    cost: { queryAll: 0, radixEnumerations: 0, querySel: 0, geometry: 0, signatureCalls: 0 },
  };
  const resetCost = () => {
    state.cost.queryAll = 0; state.cost.radixEnumerations = 0;
    state.cost.querySel = 0; state.cost.geometry = 0; state.cost.signatureCalls = 0;
  };
  // Filled from the real SEL table once the program is evaluated, so the
  // enumeration counter recognises the production selector rather than a copy.
  let RADIX_MENU_SELECTOR = ' none';

  class MEl {
    constructor(tag) {
      this.tagName = String(tag).toUpperCase();
      this.__id = (state.seq += 1);
      this.__label = null;
      this.__attrs = new Map();
      this.__listeners = new Map();
      this.childNodes = [];
      this.parentNode = null;
      this.__text = '';
      this.innerTextReads = 0;
      this.textContentReads = 0;
    }
    get parentElement() { return this.parentNode; }
    get children() { return this.childNodes.filter((n) => n instanceof MEl); }
    get isConnected() { let n = this; while (n) { if (n === documentElement) return true; n = n.parentNode; } return false; }
    get className() { return this.getAttribute('class') || ''; }
    set className(v) { this.setAttribute('class', String(v)); }

    __rendered() {
      if (this.childNodes.length) return this.childNodes.map((c) => c.__rendered()).filter(Boolean).join(' ');
      return this.__text;
    }
    // THE instrumented accessor. innerText is layout-dependent rendered text;
    // every read is counted against the element it was read from.
    get innerText() { this.innerTextReads += 1; return this.__rendered(); }
    get textContent() { this.textContentReads += 1; return this.__rendered(); }
    set textContent(v) { for (const c of this.childNodes) c.parentNode = null; this.childNodes = []; this.__text = String(v); }

    setAttribute(n, v) { this.__attrs.set(String(n), String(v)); }
    getAttribute(n) { const v = this.__attrs.get(String(n)); return v === undefined ? null : v; }
    hasAttribute(n) { return this.__attrs.has(String(n)); }
    removeAttribute(n) { this.__attrs.delete(String(n)); }
    appendChild(node) { if (node.parentNode) node.parentNode.__detach(node); node.parentNode = this; this.childNodes.push(node); return node; }
    append(...n) { for (const x of n) this.appendChild(x); }
    __detach(node) { const i = this.childNodes.indexOf(node); if (i >= 0) this.childNodes.splice(i, 1); }
    insertBefore(node, ref) {
      if (node.parentNode) node.parentNode.__detach(node);
      const i = ref ? this.childNodes.indexOf(ref) : -1;
      node.parentNode = this;
      if (i < 0) this.childNodes.push(node); else this.childNodes.splice(i, 0, node);
      return node;
    }
    removeChild(node) { this.__detach(node); node.parentNode = null; return node; }
    remove() { if (this.parentNode) this.parentNode.removeChild(this); }
    get nextSibling() {
      if (!this.parentNode) return null;
      const i = this.parentNode.childNodes.indexOf(this);
      return this.parentNode.childNodes[i + 1] || null;
    }
    contains(o) { let n = o; while (n) { if (n === this) return true; n = n.parentNode; } return false; }
    matches(s) { return matchesSelector(this, s); }
    closest(s) { let n = this; while (n) { if (n instanceof MEl && matchesSelector(n, s)) return n; n = n.parentNode; } return null; }
    __desc(out = []) { for (const c of this.childNodes) if (c instanceof MEl) { out.push(c); c.__desc(out); } return out; }
    querySelector(s) {
      state.cost.querySel += 1;
      for (const e of this.__desc()) if (matchesSelector(e, s)) return e;
      return null;
    }
    querySelectorAll(s) {
      state.cost.queryAll += 1;
      if (String(s) === RADIX_MENU_SELECTOR) state.cost.radixEnumerations += 1;
      const list = this.__desc().filter((e) => matchesSelector(e, s));
      list.forEach = Array.prototype.forEach.bind(list);
      return list;
    }
    cloneNode(deep) {
      const c = new MEl(this.tagName);
      for (const [k, v] of this.__attrs) c.__attrs.set(k, v);
      c.__text = this.__text;
      c.__label = this.__label;
      if (deep) for (const ch of this.childNodes) c.appendChild(ch.cloneNode(true));
      return c;
    }
    addEventListener(t, fn, o) {
      if (!this.__listeners.has(t)) this.__listeners.set(t, []);
      this.__listeners.get(t).push({ fn, capture: o === true || (o && o.capture === true) });
    }
    removeEventListener() {}
    getBoundingClientRect() {
      state.cost.geometry += 1;
      return { left: 0, top: 0, right: 100, bottom: 30, width: 100, height: 30 };
    }
  }

  const documentElement = new MEl('html');
  const body = new MEl('body');
  documentElement.appendChild(body);

  const D = {
    documentElement, body,
    createElement: (t) => new MEl(t),
    querySelector: (s) => documentElement.querySelector(s),
    querySelectorAll: (s) => documentElement.querySelectorAll(s),
    contains: (n) => documentElement.contains(n),
    createTreeWalker: () => ({ nextNode: () => null }),
  };
  // A chat route is the default because every pre-existing fixture models a
  // conversation menu, which only ever appears on one. Route-scope fixtures set
  // it explicitly.
  const location = { pathname: '/c/11111111-2222-3333-4444-555555555555' };
  // Registered listeners are recorded so the contract can assert that the
  // subsystem adds none. Nothing in the extracted program is expected to
  // register anything; the ledger exists to prove that, and to let a fixture
  // dispatch ho:navigate and show the transition needs no subscriber.
  const winListeners = [];
  const W = {
    location,
    setTimeout: (fn, ms) => { state.timers.push({ fn, ms }); return state.timers.length; },
    clearTimeout: () => {},
    requestAnimationFrame: (fn) => { state.raf.push(fn); return state.raf.length; },
    addEventListener: (type, fn) => { winListeners.push({ type, fn }); },
    removeEventListener: (type, fn) => {
      const i = winListeners.findIndex((l) => l.type === type && l.fn === fn);
      if (i >= 0) winListeners.splice(i, 1);
    },
    dispatchEvent: (evt) => {
      for (const l of winListeners.slice()) if (l.type === evt?.type) l.fn(evt);
      return true;
    },
  };

  const STATE = { lastChatHrefForMenu: '', lastChatMenuContext: null };
  const MOD = { state: STATE };
  const stub = (name) => (...args) => { state.stubCalls.push(name); return undefined; };

  const sandbox = {
    D, W, STATE, MOD, document: D, window: W,
    // Production guards every candidate with `instanceof HTMLElement`; in this
    // harness MEl IS the element class, so the real guard is exercised.
    HTMLElement: MEl,
    requestAnimationFrame: W.requestAnimationFrame,
    setTimeout: W.setTimeout, clearTimeout: W.clearTimeout,
    NodeFilter: { SHOW_TEXT: 4 },
    // Referenced only inside injected click listeners, or on the
    // context-resolution branch this fixture deliberately does not enter.
    // Any call is recorded and asserted against.
    UI_openAssignMenu: stub('UI_openAssignMenu'),
    handleAddToLibraryClick: stub('handleAddToLibraryClick'),
    UI_showLibraryToast: stub('UI_showLibraryToast'),
    DOM_resolveMenuContextFromMenu: stub('DOM_resolveMenuContextFromMenu'),
    DOM_captureMenuContext: stub('DOM_captureMenuContext'),
    console: { log() {}, warn() {}, error() {} },
    JSON, Math, Number, String, Object, Array, Boolean, Date, RegExp, Error, Set, Map, Symbol,
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(REAL_PROGRAM, sandbox, { filename: FOLDERS_PATH });

  for (const fn of HOT_PATH_FUNCTIONS) {
    if (typeof sandbox[fn] !== 'function') throw new Error(`TEST_HARNESS_BLOCKED:not-loaded:${fn}`);
  }
  // `const SEL` is lexical inside the VM program, so it is not reachable as a
  // context global. The production value is read from the source table instead,
  // which is the same authority the program itself compiles from.
  RADIX_MENU_SELECTOR = SEL_RADIX_MENU_FROM_SOURCE;

  // Count the real production-to-production call edge. The delegate IS the
  // extracted implementation; only the edge is observed.
  const realScore = sandbox.DOM_nativeChatMenuSignatureScore;
  sandbox.DOM_nativeChatMenuSignatureScore = (...args) => {
    state.cost.signatureCalls += 1;
    return realScore(...args);
  };

  return {
    state, sandbox, D, W, STATE, MEl, body, documentElement,
    cost: state.cost,
    resetCost,
    winListeners,
    radixSelector: () => RADIX_MENU_SELECTOR,
    setPath(p) { location.pathname = String(p); },
    // Rendered-text reads are counted per element, so a post-navigation window
    // has to clear every element in the tree, not just the menu.
    resetText() { for (const e of body.__desc()) { e.innerTextReads = 0; e.textContentReads = 0; } },
    // 9A1a publishes a bare Event for pushState/replaceState/popstate with
    // location.pathname already updated before listeners run, so the harness
    // orders it the same way: path first, then dispatch.
    navigate(p) { this.setPath(p); W.dispatchEvent({ type: 'ho:navigate' }); },
    el(tag, { attrs, text, cls } = {}) {
      const e = new MEl(tag);
      if (cls) e.className = cls;
      if (attrs) for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
      if (text !== undefined) e.__text = text;
      return e;
    },
    menuItem(label) {
      const it = this.el('div', { attrs: { role: 'menuitem' } });
      const trunc = this.el('div', { cls: 'truncate', text: label });
      it.appendChild(trunc);
      it.__label = label;
      return it;
    },
    flushFrame() { for (const fn of state.raf.splice(0)) fn(); },
    flushTimers() { for (const t of state.timers.splice(0)) t.fn(); },
    // Verbatim replication of the two dispatch lines inside 0F3a's menu
    // MutationObserver body (0F3a:6245-6256). Only the dispatch is replicated;
    // every function it calls is the REAL extracted production implementation,
    // and the entire measured cost lives inside those. The surrounding observer
    // setup also installs pointerdown/contextmenu/keydown capture listeners via
    // TIME_addListener and CLEAN.observers, which are unrelated to this contract
    // and would require faking 0F3a's lifecycle subsystem to instantiate.
    dispatchAddedNode(node) {
      const S = this.sandbox;
      const menus = S.DOM_collectNativeMenuCandidates(node);
      if (!menus.length) menus.push(...S.DOM_collectNativeMenuCandidates(this.D.body).slice(0, 8));
      if (!menus.length) return [];
      for (const menu of menus) S.ENGINE_scheduleNativeChatMenuInjection(menu, 'mutation');
      return menus;
    },
    injectedCount(menu, kind) {
      return menu.__desc().filter((e) => e.getAttribute('data-cgxui') === `flsc-${kind}`).length;
    },
  };
}

// ── Scene ─────────────────────────────────────────────────────────────────
const NON_MENU_COUNT = 8;

function buildScene(env, { menuInsideAddedNode = false, menuLabels = null, ownedSurface = false } = {}) {
  const { el } = env;
  // Real precondition for injection: a chat row menu was opened, so the module
  // already holds the chat href. This keeps DOM_ensureMenuContext on its real
  // early-return path instead of the context-resolution branch.
  env.STATE.lastChatHrefForMenu = '/c/11111111-2222-3333-4444-555555555555';
  env.STATE.lastChatMenuContext = null;

  // A. Eight NON-menu open containers. They match SEL.radixMenu only via its
  //    final `[data-state="open"]` term, have no [role="menuitem"] descendants,
  //    and are structurally provable non-menus.
  const nonMenus = [];
  for (let i = 0; i < NON_MENU_COUNT; i += 1) {
    const c = el('div', { attrs: { 'data-state': 'open' }, cls: 'sidebar-expando-section' });
    for (let k = 0; k < 6; k += 1) {
      c.appendChild(el('div', { text: `Project section ${i} row ${k} — some conversation title text` }));
    }
    env.body.appendChild(c);
    nonMenus.push(c);
  }

  // B. One genuine chat menu.
  const labels = menuLabels || ['Share', 'Rename', 'Move to project', 'Archive', 'Delete'];
  const menu = el('div', { attrs: { role: 'menu', 'data-state': 'open' } });
  for (const l of labels) menu.appendChild(env.menuItem(l));

  // C. Transcript container; the added node drives the observer dispatch.
  const transcript = el('div', { cls: 'group/thread' });
  env.body.appendChild(transcript);
  const addedNode = el('article', { attrs: { 'data-testid': 'conversation-turn-42' } });
  addedNode.appendChild(el('div', { text: 'an ordinary transcript turn with no menu in it' }));

  if (menuInsideAddedNode) addedNode.appendChild(menu);
  else env.body.appendChild(menu);

  // D. H2O-owned surface containing a menu-like structure (control G).
  let ownedMenu = null;
  if (ownedSurface) {
    const owned = el('div', { attrs: { 'data-cgxui-owner': 'flsc' } });
    ownedMenu = el('div', { attrs: { role: 'menu', 'data-state': 'open' } });
    for (const l of ['Share', 'Rename', 'Archive', 'Delete']) ownedMenu.appendChild(env.menuItem(l));
    owned.appendChild(ownedMenu);
    env.body.appendChild(owned);
  }

  return { nonMenus, menu, transcript, addedNode, ownedMenu };
}

function drive(env, scene) {
  scene.transcript.appendChild(scene.addedNode);
  const menus = env.dispatchAddedNode(scene.addedNode);
  env.flushFrame();
  env.flushTimers();
  return menus;
}

const gate = {};

// ══ PRIMARY GATE ══════════════════════════════════════════════════════════
fixture('FOLDERS_MUST_NOT_READ_INNERTEXT_FOR_CANDIDATES_REJECTABLE_BY_CHEAP_METADATA', () => {
  const env = createEnv();
  const scene = buildScene(env);
  drive(env, scene);

  const perNonMenu = scene.nonMenus.map((c) => c.innerTextReads);
  gate.nonMenuReads = perNonMenu.reduce((a, b) => a + b, 0);
  gate.perNonMenu = perNonMenu;
  gate.menuReads = scene.menu.innerTextReads;
  gate.score = env.sandbox.DOM_nativeChatMenuSignatureScore(scene.menu);
  gate.stubCalls = env.state.stubCalls.slice();

  for (const c of scene.nonMenus) {
    ok(!c.querySelector('[role="menuitem"]'), 'precondition: non-menu container has no menu items');
    eq(env.injectedCount(c, 'add-to-folder'), 0, 'non-menu container never receives Folders injection');
  }
  eq(
    gate.nonMenuReads, 0,
    `${NON_MENU_COUNT} structurally rejectable non-menu candidates must not pay any innerText read`,
  );
});

// ══ SECONDARY GATE ════════════════════════════════════════════════════════
fixture('FOLDERS_NATIVE_MENU_SIGNATURE_MUST_REUSE_THE_ALREADY_COMPUTED_TEXT_SAMPLE', () => {
  const env = createEnv();
  const scene = buildScene(env);
  env.sandbox.STATE.menuDiag.menuCandidatesSeen = 0;
  scene.menu.innerTextReads = 0;

  // Exactly ONE evaluation of the genuine menu.
  env.sandbox.ENGINE_tryInjectNativeChatMenu(scene.menu, 'gate');
  const evaluations = env.sandbox.STATE.menuDiag.menuCandidatesSeen;
  gate.readsPerEvaluation = scene.menu.innerTextReads / Math.max(1, evaluations);
  gate.singleEvalReads = scene.menu.innerTextReads;
  gate.evaluations = evaluations;

  eq(evaluations, 1, 'fixture drove exactly one evaluation');
  atMost(
    scene.menu.innerTextReads, 1,
    'one genuine-menu evaluation must read the rendered text at most once (diagnostic sample and signature scoring must share it)',
  );
});

// ══ CONTROL A: genuine menu injection ═════════════════════════════════════
// NOTE for the injection controls: in the primary-gate scene the eight
// non-menu containers precede the genuine menu in document order, so the real
// `DOM_collectNativeMenuCandidates(D.body).slice(0, 8)` fallback truncates the
// genuine menu away entirely. That is real production behaviour (junk
// candidates can starve a real menu) but it is not what Gate A asserts, so the
// injection controls use the direct path — which is also how a chat menu
// actually appears: the user opens it and it arrives as an added node.
fixture('control A: a genuine chat menu still receives Save to Folder and Add to Library', () => {
  const env = createEnv();
  const scene = buildScene(env, { menuInsideAddedNode: true });
  drive(env, scene);

  atLeast(env.sandbox.DOM_nativeChatMenuSignatureScore(scene.menu), 2, 'genuine menu scores at or above threshold');
  eq(env.injectedCount(scene.menu, 'add-to-folder'), 1, 'exactly one Save to Folder item');
  eq(env.injectedCount(scene.menu, 'add-to-library'), 1, 'exactly one Add to Library item');
  const items = scene.menu.querySelectorAll('[role="menuitem"]');
  const libIdx = items.findIndex((e) => e.getAttribute('data-cgxui') === 'flsc-add-to-library');
  const folIdx = items.findIndex((e) => e.getAttribute('data-cgxui') === 'flsc-add-to-folder');
  ok(libIdx >= 0 && folIdx >= 0, 'both injected items are menu items');
  ok(libIdx < folIdx, 'documented order preserved: Add to Library sits above Save to Folder');
  eq(env.state.stubCalls.filter((s) => s.startsWith('DOM_')).length, 0,
    'menu-context resolution stayed on the real early-return path');
  const md = env.sandbox.STATE.menuDiag;
  gate.totals = {
    menuCandidatesSeen: md.menuCandidatesSeen,
    signatureEvaluations: md.signatureHits + md.signatureMisses,
    signatureHits: md.signatureHits, signatureMisses: md.signatureMisses,
    saveToFolderInjected: md.saveToFolderInjected, addToLibraryInjected: md.addToLibraryInjected,
    lastSkipReason: md.lastSkipReason,
  };
  gate.saveToFolder = env.injectedCount(scene.menu, 'add-to-folder');
  gate.addToLibrary = env.injectedCount(scene.menu, 'add-to-library');
});

// ══ CONTROL B: structurally valid menu below the signature threshold ══════
fixture('control B: a structurally valid menu below the signature threshold is still evaluated and rejected', () => {
  const env = createEnv();
  const scene = buildScene(env, { menuLabels: ['Copy link', 'Open in new tab'], menuInsideAddedNode: true });
  drive(env, scene);

  const score = env.sandbox.DOM_nativeChatMenuSignatureScore(scene.menu);
  gate.belowThresholdReads = scene.menu.innerTextReads;
  gate.belowThresholdScore = score;
  ok(score < 2, `below-threshold menu scores under the threshold (got ${score})`);
  atLeast(scene.menu.innerTextReads, 1, 'the rendered-text signature evaluation still happened for a structurally valid menu');
  eq(env.injectedCount(scene.menu, 'add-to-folder'), 0, 'no Save to Folder injected below threshold');
  eq(env.injectedCount(scene.menu, 'add-to-library'), 0, 'no Add to Library injected below threshold');
  atLeast(env.sandbox.STATE.menuDiag.signatureMisses, 1, 'signatureMisses counter advanced');
});

// ══ CONTROL C: remount ════════════════════════════════════════════════════
fixture('control C: a remounted menu is rediscovered, rescored and injected once', () => {
  const env = createEnv();
  const scene = buildScene(env, { menuInsideAddedNode: true });
  drive(env, scene);
  eq(env.injectedCount(scene.menu, 'add-to-folder'), 1, 'precondition: first menu injected');

  scene.menu.remove();
  const fresh = env.el('div', { attrs: { role: 'menu', 'data-state': 'open' } });
  for (const l of ['Share', 'Rename', 'Move to project', 'Archive', 'Delete']) fresh.appendChild(env.menuItem(l));

  const node2 = env.el('article', { attrs: { 'data-testid': 'conversation-turn-43' } });
  node2.appendChild(fresh);
  scene.transcript.appendChild(node2);
  env.dispatchAddedNode(node2);
  env.flushFrame();
  env.flushTimers();

  eq(env.injectedCount(fresh, 'add-to-folder'), 1, 'remounted menu injected exactly once');
  eq(env.injectedCount(fresh, 'add-to-library'), 1, 'remounted menu received Add to Library once');
  ok(!scene.menu.isConnected, 'old menu detached — no stale reference kept it alive');
});

// ══ CONTROL D: repeated triggers ══════════════════════════════════════════
fixture('control D: repeated triggers create no duplicate injected items', () => {
  const env = createEnv();
  const scene = buildScene(env, { menuInsideAddedNode: true });
  drive(env, scene);

  for (let i = 0; i < 5; i += 1) {
    const n = env.el('article', { attrs: { 'data-testid': `conversation-turn-${50 + i}` } });
    scene.transcript.appendChild(n);
    env.sandbox.ENGINE_scheduleNativeChatMenuInjection(scene.menu, 'rescan');
    env.dispatchAddedNode(n);
    env.flushFrame();
    env.flushTimers();
  }

  eq(env.injectedCount(scene.menu, 'add-to-folder'), 1, 'still exactly one Save to Folder');
  eq(env.injectedCount(scene.menu, 'add-to-library'), 1, 'still exactly one Add to Library');
});

// ══ CONTROL E: menuDiag preserved ═════════════════════════════════════════
fixture('control E: menuDiag counters and lastSignatureSample stay alive for the genuine menu', () => {
  const env = createEnv();
  const scene = buildScene(env, { menuInsideAddedNode: true });
  drive(env, scene);
  const md = env.sandbox.STATE.menuDiag;

  atLeast(md.menuCandidatesSeen, 1, 'menuCandidatesSeen advanced');
  atLeast(md.signatureHits, 1, 'signatureHits advanced');
  atLeast(md.saveToFolderInjected, 1, 'saveToFolderInjected advanced');
  atLeast(md.addToLibraryInjected, 1, 'addToLibraryInjected advanced');
  ok(typeof md.lastSignatureSample === 'string' && md.lastSignatureSample.length > 0,
    'lastSignatureSample remains populated — the diagnostic must survive, only the duplicate read disappears');
  atMost(md.lastSignatureSample.length, 120, 'lastSignatureSample keeps its 120-char truncation');
  ok(/rename/i.test(md.lastSignatureSample),
    'lastSignatureSample reflects the genuine menu normalized text');
  ok(!/\s{2,}/.test(md.lastSignatureSample), 'lastSignatureSample keeps UTIL_normText whitespace collapsing');
});

// ══ CONTROL F: menu inside the mutated node (no body fallback) ════════════
fixture('control F: a menu inside the added node is found directly, without the body fallback', () => {
  const env = createEnv();
  const scene = buildScene(env, { menuInsideAddedNode: true });
  scene.transcript.appendChild(scene.addedNode);

  const direct = env.sandbox.DOM_collectNativeMenuCandidates(scene.addedNode);
  ok(direct.includes(scene.menu), 'candidate collection finds the menu inside the added node');
  ok(direct.length > 0, 'body fallback is not required for a directly-mounted menu');

  for (const m of direct) env.sandbox.ENGINE_scheduleNativeChatMenuInjection(m, 'mutation');
  env.flushFrame();
  env.flushTimers();
  eq(env.injectedCount(scene.menu, 'add-to-folder'), 1, 'directly-discovered menu still injected');
});

// ══ CONTROL G: H2O-owned surface excluded ═════════════════════════════════
fixture('control G: menu-like structure inside an H2O-owned surface is never injected', () => {
  const env = createEnv();
  const scene = buildScene(env, { ownedSurface: true });
  drive(env, scene);

  const collected = env.sandbox.DOM_collectNativeMenuCandidates(env.D.body);
  ok(!collected.includes(scene.ownedMenu), 'owned-surface menu excluded from candidates');
  eq(env.injectedCount(scene.ownedMenu, 'add-to-folder'), 0, 'no Save to Folder in an H2O-owned surface');
  eq(env.injectedCount(scene.ownedMenu, 'add-to-library'), 0, 'no Add to Library in an H2O-owned surface');
  eq(scene.ownedMenu.innerTextReads, 0, 'owned-surface menu never even evaluated');
});

// ══ CONTROL H: partial mount ══════════════════════════════════════════════
// The cheap prefilter's principal correctness risk: a genuine menu container
// that arrives before its children must not be permanently written off.
fixture('control H: a genuine menu mounting before its items is not permanently classified as junk', () => {
  const env = createEnv();
  const scene = buildScene(env);

  // Strong native marker present, zero children yet.
  const shell = env.el('div', { attrs: { role: 'menu', 'data-state': 'open' } });
  const node1 = env.el('article', { attrs: { 'data-testid': 'conversation-turn-60' } });
  node1.appendChild(shell);
  scene.transcript.appendChild(node1);
  env.dispatchAddedNode(node1);
  env.flushFrame();
  env.flushTimers();

  ok(!shell.querySelector('[role="menuitem"]'), 'precondition: shell has no menu items yet');
  atLeast(shell.innerTextReads, 1,
    'a strong-marker container is still text-evaluated while mid-mount — the prefilter must not reject it');
  eq(env.injectedCount(shell, 'add-to-folder'), 0, 'nothing injected while the menu is empty');

  // Items arrive on a later mutation.
  for (const l of ['Share', 'Rename', 'Move to project', 'Archive', 'Delete']) shell.appendChild(env.menuItem(l));
  const node2 = env.el('article', { attrs: { 'data-testid': 'conversation-turn-61' } });
  node2.appendChild(shell);
  scene.transcript.appendChild(node2);
  env.dispatchAddedNode(node2);
  env.flushFrame();
  env.flushTimers();

  atLeast(env.sandbox.DOM_nativeChatMenuSignatureScore(shell), 2, 'now scores at or above threshold');
  eq(env.injectedCount(shell, 'add-to-folder'), 1, 'menu injected once its items arrive');
  eq(env.injectedCount(shell, 'add-to-library'), 1, 'Add to Library injected once its items arrive');
});

// ══════════════════════════════════════════════════════════════════════════
// GATE B — OFF-CHAT ROUTE SCOPE
// ══════════════════════════════════════════════════════════════════════════
// Gate A above makes legitimate chat discovery cheaper. It does not make it
// ABSENT where a conversation menu cannot exist. A bounded Project reload
// measured ENGINE_tryInjectNativeChatMenu at ~8,388 ms of self time with
// ~1,261 ms in querySelectorAll and ~660 ms in getBoundingClientRect, against
// zero authenticated backend requests — entirely local discovery cost, spent on
// a surface that renders project cards and sidebar disclosures rather than chat
// menus. Those disclosures carry the same `[data-state="open"]` marker
// SEL.radixMenu ends in, which is exactly why they are swept up.
//
// The contract below is behavioural, measured at four real external boundaries:
//
//   candidate enumeration -> querySelectorAll(SEL.radixMenu) call count
//   signature scoring     -> the real call edge into DOM_nativeChatMenuSignatureScore
//   rendered-text scan    -> innerText / textContent getters, per element
//   geometry              -> getBoundingClientRect call count
//
// Two production boundaries carry the gate, because expensive discovery has two
// disjoint entries: the observer reaches DOM_collectNativeMenuCandidates without
// ever calling ENGINE_tryInjectNativeChatMenu, and the rAF/timeout retries reach
// ENGINE_tryInjectNativeChatMenu without ever calling the collector. Both are
// real extracted functions, so both gates are executed here rather than read.

const ROUTE_CHAT = '/c/11111111-2222-3333-4444-555555555555';
const ROUTE_PROJECT_CHAT = '/g/project-123/c/11111111-2222-3333-4444-555555555555';
const ROUTE_PROJECT_LIST = '/g/project-123/project';
const ROUTE_PROJECT_ROOT = '/g/project-123';
const ROUTE_HOME = '/';

const route = {};
const totalInnerText = (env) =>
  env.body.__desc().reduce((n, e) => n + e.innerTextReads + e.textContentReads, 0);

// Every off-chat assertion is the same four zeros, so they are stated once.
function expectZeroDiscovery(env, label) {
  eq(env.cost.radixEnumerations, 0, `${label}: zero SEL.radixMenu candidate enumerations`);
  eq(env.cost.queryAll, 0, `${label}: zero querySelectorAll of any kind on the discovery path`);
  eq(env.cost.signatureCalls, 0, `${label}: zero signature-score evaluations`);
  eq(totalInnerText(env), 0, `${label}: zero rendered-text reads`);
  eq(env.cost.geometry, 0, `${label}: zero getBoundingClientRect reads`);
}

// ── Positive: the two eligible chat shapes ────────────────────────────────
fixture('route I: /c/<chatId> still permits native chat-menu discovery and injection', () => {
  const env = createEnv();
  const scene = buildScene(env, { menuInsideAddedNode: true });
  env.setPath(ROUTE_CHAT);
  env.resetCost();
  drive(env, scene);

  route.chatEnumerations = env.cost.radixEnumerations;
  route.chatInnerText = totalInnerText(env);
  atLeast(env.cost.radixEnumerations, 1, '/c/<id>: candidate enumeration runs');
  atLeast(env.cost.signatureCalls, 1, '/c/<id>: signature scoring runs');
  eq(env.injectedCount(scene.menu, 'add-to-folder'), 1, '/c/<id>: Save to Folder injected');
  eq(env.injectedCount(scene.menu, 'add-to-library'), 1, '/c/<id>: Add to Library injected');
});

fixture('route J: /g/<project>/c/<chatId> still permits native chat-menu discovery and injection', () => {
  const env = createEnv();
  const scene = buildScene(env, { menuInsideAddedNode: true });
  env.setPath(ROUTE_PROJECT_CHAT);
  env.resetCost();
  drive(env, scene);

  route.projectChatEnumerations = env.cost.radixEnumerations;
  atLeast(env.cost.radixEnumerations, 1, '/g/<p>/c/<id>: candidate enumeration runs');
  atLeast(env.cost.signatureCalls, 1, '/g/<p>/c/<id>: signature scoring runs');
  eq(env.injectedCount(scene.menu, 'add-to-folder'), 1, '/g/<p>/c/<id>: Save to Folder injected');
  eq(env.injectedCount(scene.menu, 'add-to-library'), 1, '/g/<p>/c/<id>: Add to Library injected');
});

// ── PRIMARY GATE B: the Project-list route the evidence was captured on ───
fixture('route K: /g/<project>/project performs zero native chat-menu discovery work', () => {
  const env = createEnv();
  const scene = buildScene(env, { menuInsideAddedNode: true });
  env.setPath(ROUTE_PROJECT_LIST);
  env.resetCost();
  drive(env, scene);

  expectZeroDiscovery(env, '/g/<p>/project');
  eq(env.injectedCount(scene.menu, 'add-to-folder'), 0, '/g/<p>/project: nothing injected');
  eq(env.injectedCount(scene.menu, 'add-to-library'), 0, '/g/<p>/project: nothing injected');
  route.projectList = { ...env.cost, innerText: totalInnerText(env) };
});

fixture('route L: / and /g/<project> perform zero native chat-menu discovery work', () => {
  for (const p of [ROUTE_HOME, ROUTE_PROJECT_ROOT]) {
    const env = createEnv();
    const scene = buildScene(env, { menuInsideAddedNode: true });
    env.setPath(p);
    env.resetCost();
    drive(env, scene);
    expectZeroDiscovery(env, p);
    if (p === ROUTE_HOME) route.homeEnumerations = env.cost.radixEnumerations;
  }
});

// ── Anti-degeneracy: the zeros above must come from the route, not a dead
//    harness. The IDENTICAL scene and drive on a chat route must be expensive.
fixture('route M: differential control — the same scene and drive is expensive on a chat route', () => {
  const cheap = createEnv();
  const cheapScene = buildScene(cheap, { menuInsideAddedNode: true });
  cheap.setPath(ROUTE_PROJECT_LIST);
  cheap.resetCost();
  drive(cheap, cheapScene);

  const costly = createEnv();
  const costlyScene = buildScene(costly, { menuInsideAddedNode: true });
  costly.setPath(ROUTE_CHAT);
  costly.resetCost();
  drive(costly, costlyScene);

  route.differential = {
    project: { qsa: cheap.cost.queryAll, text: totalInnerText(cheap) },
    chat: { qsa: costly.cost.queryAll, text: totalInnerText(costly) },
  };
  atLeast(costly.cost.queryAll, 1, 'the identical harness really does enumerate on a chat route');
  atLeast(totalInnerText(costly), 1, 'the identical harness really does read rendered text on a chat route');
  atLeast(costly.cost.signatureCalls, 1, 'the identical harness really does score signatures on a chat route');
  eq(cheap.cost.queryAll, 0, 'and performs none of it on the Project route');
  // Geometry is deliberately NOT asserted as a difference. getBoundingClientRect
  // sits inside the injected item's click handler, which no discovery drive
  // fires, so it reads 0 on BOTH routes here. The off-chat fixtures still
  // require 0 — a requirement this control cannot claim to discriminate.
  eq(costly.cost.geometry, 0, 'geometry is not on the discovery path in either direction');
});

// ── Project DOM churn ─────────────────────────────────────────────────────
fixture('route N: sustained Project DOM churn drives zero native chat-menu discovery', () => {
  const env = createEnv();
  const scene = buildScene(env, { menuInsideAddedNode: true });
  env.setPath(ROUTE_PROJECT_LIST);
  env.resetCost();

  const CHURN = 40;
  for (let i = 0; i < CHURN; i += 1) {
    const n = env.el('div', { attrs: { 'data-testid': `project-card-${i}`, 'data-state': 'open' } });
    for (let k = 0; k < 6; k += 1) n.appendChild(env.el('div', { text: `project card ${i} row ${k}` }));
    scene.transcript.appendChild(n);
    env.dispatchAddedNode(n);
    env.flushFrame();
    env.flushTimers();
  }

  route.churnDispatches = CHURN;
  expectZeroDiscovery(env, `Project churn x${CHURN}`);
});

// ── Pending retries armed on a chat route, fired on a Project route ───────
// The load-bearing one. ENGINE_scheduleNativeChatMenuInjection arms a rAF and
// an 80 ms timeout that call ENGINE_tryInjectNativeChatMenu DIRECTLY, so they
// never cross the enumeration gate. Nothing cancels them.
fixture('route O: retries armed on a chat route are harmless once the route becomes a Project', () => {
  const env = createEnv();
  const scene = buildScene(env, { menuInsideAddedNode: true });
  env.setPath(ROUTE_CHAT);

  // Arm — but do not flush. This is the real scheduler, on a real menu.
  scene.transcript.appendChild(scene.addedNode);
  env.sandbox.ENGINE_scheduleNativeChatMenuInjection(scene.menu, 'pending');
  const armedRaf = env.state.raf.length;
  const armedTimers = env.state.timers.length;
  atLeast(armedRaf, 1, 'precondition: a rAF retry is actually pending');
  atLeast(armedTimers, 1, 'precondition: an 80 ms timeout retry is actually pending');
  eq(env.state.timers[0].ms, 80, 'precondition: the pending timeout is the production 80 ms retry');

  // User reaches a Project. Nothing is cancelled; the callbacks stay armed.
  env.navigate(ROUTE_PROJECT_LIST);
  env.resetCost();
  env.resetText();

  env.flushFrame();
  route.pendingRafCost = { ...env.cost, innerText: totalInnerText(env) };
  expectZeroDiscovery(env, 'pending rAF after chat -> Project');

  env.flushTimers();
  route.pendingTimeoutCost = { ...env.cost, innerText: totalInnerText(env) };
  expectZeroDiscovery(env, 'pending rAF + timeout after chat -> Project');

  eq(env.injectedCount(scene.menu, 'add-to-folder'), 0, 'the stale retries injected nothing');
  ok(
    String(env.sandbox.STATE.menuDiag.lastSkipReason || '').startsWith('route-miss:'),
    'the stale retries were rejected at the route gate, and say so',
  );
});

// ── chat -> Project ───────────────────────────────────────────────────────
fixture('route P: chat -> Project makes the subsystem cheap immediately, with no cleanup needed', () => {
  const env = createEnv();
  const scene = buildScene(env, { menuInsideAddedNode: true });
  env.setPath(ROUTE_CHAT);
  drive(env, scene);
  eq(env.injectedCount(scene.menu, 'add-to-folder'), 1, 'precondition: injected while on the chat route');

  // The host owns the injected node's lifetime: the item is inserted INTO the
  // native Radix menu, so when the host unmounts the menu it leaves with it.
  // The transition is proven without relying on that, by leaving the menu in
  // place and requiring the next attempt to be free anyway.
  env.navigate(ROUTE_PROJECT_LIST);
  env.resetCost();
  env.resetText();

  const n = env.el('article', { attrs: { 'data-testid': 'conversation-turn-99' } });
  scene.transcript.appendChild(n);
  env.dispatchAddedNode(n);
  env.sandbox.ENGINE_scheduleNativeChatMenuInjection(scene.menu, 'post-nav');
  env.flushFrame();
  env.flushTimers();

  expectZeroDiscovery(env, 'chat -> Project');
  route.chatToProject = 'cheap-immediately-no-cleanup-required';

  // Host lifecycle removal is the real teardown; assert it leaves nothing of
  // ours behind anywhere else in the document.
  scene.menu.remove();
  eq(
    env.body.__desc().filter((e) => String(e.getAttribute('data-cgxui') || '').startsWith('flsc-add-to-')).length,
    0,
    'once the host unmounts the menu, no injected native-menu contribution survives outside it',
  );
});

// ── Project -> chat ───────────────────────────────────────────────────────
fixture('route Q: Project -> chat restores discovery with no reload', () => {
  const env = createEnv();
  const scene = buildScene(env, { menuInsideAddedNode: true });
  env.setPath(ROUTE_PROJECT_LIST);
  env.resetCost();
  drive(env, scene);
  expectZeroDiscovery(env, 'precondition: Project route is silent');

  // SPA transition into a legitimate chat. The menu the user opens there is a
  // fresh host mount, which is what actually happens.
  env.navigate(ROUTE_PROJECT_CHAT);
  env.resetCost();

  const fresh = env.el('div', { attrs: { role: 'menu', 'data-state': 'open' } });
  for (const l of ['Share', 'Rename', 'Move to project', 'Archive', 'Delete']) fresh.appendChild(env.menuItem(l));
  const node2 = env.el('article', { attrs: { 'data-testid': 'conversation-turn-1' } });
  node2.appendChild(fresh);
  scene.transcript.appendChild(node2);
  env.dispatchAddedNode(node2);
  env.flushFrame();
  env.flushTimers();

  atLeast(env.cost.radixEnumerations, 1, 'Project -> chat: enumeration is available again');
  atLeast(env.cost.signatureCalls, 1, 'Project -> chat: signature scoring is available again');
  eq(env.injectedCount(fresh, 'add-to-folder'), 1, 'Project -> chat: Save to Folder injected again');
  eq(env.injectedCount(fresh, 'add-to-library'), 1, 'Project -> chat: Add to Library injected again');
  route.projectToChat = 'restored-without-reload';
});

// ── No new listener, no new machinery ─────────────────────────────────────
fixture('route R: the route scope adds no listener, no observer, no polling and no History patch', () => {
  const env = createEnv();
  const scene = buildScene(env, { menuInsideAddedNode: true });
  env.setPath(ROUTE_CHAT);
  drive(env, scene);

  // Behavioural: the extracted subsystem registered nothing on window, and a
  // dispatched ho:navigate is therefore consumed by no one — the transition in
  // fixtures O/P/Q worked on the live predicate alone.
  eq(env.winListeners.length, 0, 'the native-menu subsystem registers no window listener at all');
  env.navigate(ROUTE_PROJECT_LIST);
  eq(env.winListeners.length, 0, 'and still none after a navigation');
  route.listeners = env.winListeners.length;

  // Source: the gate is one predicate used at exactly two boundaries.
  const refs = SOURCE.split('DOM_isNativeChatMenuRoute').length - 1;
  eq(refs, 3, 'DOM_isNativeChatMenuRoute appears exactly three times: one definition, two call sites');
  const collector = extractFunction('DOM_collectNativeMenuCandidates');
  const evaluator = extractFunction('ENGINE_tryInjectNativeChatMenu');
  eq(collector.split('DOM_isNativeChatMenuRoute').length - 1, 1,
    'the enumeration boundary carries exactly one route check');
  eq(evaluator.split('DOM_isNativeChatMenuRoute').length - 1, 1,
    'the evaluation boundary carries exactly one route check');

  // Source: the predicate itself is a single pathname test and nothing else.
  const predicate = extractFunction('DOM_isNativeChatMenuRoute');
  for (const banned of [
    'setInterval', 'setTimeout', 'requestAnimationFrame', 'MutationObserver',
    'addEventListener', 'history.', 'getBoundingClientRect', 'innerText', 'querySelector',
  ]) {
    ok(!predicate.includes(banned), `route predicate contains no ${banned}`);
  }
  ok(/location\?\.pathname/.test(predicate), 'route predicate reads location.pathname');

  // Neither gated boundary grew any scheduling machinery of its own.
  for (const [name, body] of [['collector', collector], ['evaluator', evaluator]]) {
    for (const banned of ['setInterval', 'MutationObserver', 'addEventListener', 'history.']) {
      ok(!body.includes(banned), `${name} boundary contains no ${banned}`);
    }
  }
  // Counts verified against the committed base blob af573348: 0F3a already owned
  // one interval and two MutationObservers (0F3a:6063 sidebar, 0F3a:6302 menu),
  // and zero ho:navigate listeners. Pinning them proves the route scope added
  // none of the three, without pretending the module never used any.
  eq(SOURCE.split('setInterval(').length - 1, 1, 'still exactly one pre-existing interval in 0F3a');
  route.observers = SOURCE.split('new MutationObserver(').length - 1;
  eq(route.observers, 2, 'still exactly two pre-existing MutationObservers — the route scope added none');
  eq(SOURCE.split("addEventListener('ho:navigate'").length - 1, 0,
    'the route scope subscribes to no navigation event: the predicate is read live');
  route.newObservers = 0;
  route.predicateSource = extractStatement('  const NATIVE_CHAT_MENU_ROUTE_RE = ', ';').trim();
});

// ── Gate A survives Gate B ────────────────────────────────────────────────
fixture('route S: the candidate-cost optimization is intact alongside the route scope', () => {
  const strong = extractStatement('  const SEL_NATIVE_MENU_STRONG = ', ';');
  ok(SOURCE.includes('  function DOM_isLikelyNativeChatMenu('), 'DOM_isLikelyNativeChatMenu still present');
  ok(!strong.includes('data-state'),
    'the loose [data-state="open"] term is still absent from the strong native-menu selector');
  ok(SEL_RADIX_MENU_FROM_SOURCE.includes('data-state="open"'),
    'and SEL.radixMenu itself is unchanged — the optimization narrows the prefilter, not the sweep selector');

  const evaluator = extractFunction('ENGINE_tryInjectNativeChatMenu');
  const gateIdx = evaluator.indexOf('DOM_isNativeChatMenuRoute');
  const prefilterIdx = evaluator.indexOf('DOM_isLikelyNativeChatMenu');
  const textIdx = evaluator.indexOf('menu.innerText');
  const scoreIdx = evaluator.indexOf('DOM_nativeChatMenuSignatureScore');
  ok(gateIdx >= 0 && prefilterIdx >= 0 && textIdx >= 0 && scoreIdx >= 0, 'all four stages present');
  ok(gateIdx < prefilterIdx, 'route gate runs before the structural prefilter');
  ok(prefilterIdx < textIdx, 'structural prefilter runs before any rendered-text read');
  ok(textIdx < scoreIdx, 'the single rendered-text read precedes signature scoring');
  eq(evaluator.split('.innerText').length - 1, 1, 'exactly one innerText read site per evaluation');
  route.ordering = 'route -> structure -> single innerText -> signature';
});

// ── Report ────────────────────────────────────────────────────────────────
const failed = fixtures.filter((f) => !f.ok);
for (const f of fixtures) {
  console.log(`${f.ok ? 'PASS' : 'FAIL'} ${f.name}`);
  if (!f.ok) console.log(f.error.split('\n').slice(0, 5).map((l) => `       ${l}`).join('\n'));
}
console.log('');
console.log(`Real production functions executed: ${HOT_PATH_FUNCTIONS.join(', ')}`);
console.log(`Optional real helpers loaded from source: ${LOADED_OPTIONAL.length ? LOADED_OPTIONAL.join(', ') : '(none)'}`);
console.log('');
console.log('Gate observation:');
console.log(`  non-menu [data-state="open"] candidates    = ${NON_MENU_COUNT}`);
console.log(`  innerText reads on those candidates        = ${gate.nonMenuReads}   (contract: 0)`);
console.log(`    per-candidate                            = [${(gate.perNonMenu || []).join(', ')}]`);
console.log(`  genuine menu innerText reads (full drive)  = ${gate.menuReads}`);
console.log(`  genuine menu reads per single evaluation   = ${gate.singleEvalReads} over ${gate.evaluations} evaluation  (contract: <= 1)`);
console.log(`  genuine menu signature score              = ${gate.score}`);
console.log(`  below-threshold real menu reads          = ${gate.belowThresholdReads} (score ${gate.belowThresholdScore}) — text evaluation preserved`);
console.log(`  context-resolution stubs called           = ${JSON.stringify(gate.stubCalls)}`);
console.log(`  control-A totals                         = ${JSON.stringify(gate.totals)}`);
console.log(`  control-A injected                        = SaveToFolder ${gate.saveToFolder}, AddToLibrary ${gate.addToLibrary}`);
if (unsupported.size) console.log(`  selectors treated as no-match: ${[...unsupported].join(' | ')}`);
console.log('');
console.log('Route-scope observation (Gate B):');
console.log(`  predicate                                = ${route.predicateSource}`);
console.log(`  evaluation order                         = ${route.ordering}`);
console.log(`  /c/<id> enumerations                     = ${route.chatEnumerations}`);
console.log(`  /g/<p>/c/<id> enumerations               = ${route.projectChatEnumerations}`);
console.log(`  /g/<p>/project                           = ${JSON.stringify(route.projectList)}   (contract: all 0)`);
console.log(`  / enumerations                           = ${route.homeEnumerations}   (contract: 0)`);
console.log(`  Project churn x${route.churnDispatches} dispatches          = 0 expensive discovery`);
console.log(`  pending rAF after chat -> Project        = ${JSON.stringify(route.pendingRafCost)}`);
console.log(`  pending rAF+timeout after chat -> Project= ${JSON.stringify(route.pendingTimeoutCost)}`);
console.log(`  differential (same scene, both routes)   = ${JSON.stringify(route.differential)}`);
console.log(`  chat -> Project                          = ${route.chatToProject}`);
console.log(`  Project -> chat                          = ${route.projectToChat}`);
console.log(`  window listeners registered by subsystem = ${route.listeners}   (contract: 0)`);
console.log(`  MutationObservers in 0F3a                = ${route.observers}   (pre-existing; added ${route.newObservers})`);
console.log('');
console.log(`Fixtures: ${fixtures.length - failed.length}/${fixtures.length}`);
console.log(`Assertions: ${assertions}`);
if (failed.length) {
  console.log('Folders native-menu discovery cost FAILED');
  process.exit(1);
}
console.log('Folders native-menu discovery cost passed');
