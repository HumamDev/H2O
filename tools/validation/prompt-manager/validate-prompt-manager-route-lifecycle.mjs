#!/usr/bin/env node
/* Prompt Manager — route/lifecycle executable regression harness.
 *
 * WHY THIS EXISTS
 * ---------------
 * The Issue-3 Project-surface guard is pinned by source-text assertions in
 * validate-prompt-manager-source-invariants.mjs and was proven once by a live
 * browser acceptance. Neither is a repeatable behavioural gate: a refactor that
 * preserves the text shape but breaks the behaviour passes every existing suite,
 * and the live proof is not re-run on each change. The sibling storage-safety
 * harness says so in its own words — "Deliberately inert: no composer form is
 * discoverable, so the module mounts nothing" and "Boot itself is covered by the
 * live checks, not here."
 *
 * This harness closes that gap. It executes the REAL 7A1a bytes in a node:vm
 * sandbox against a bounded DOM/event/timer model and asserts externally
 * observable lifecycle behaviour: what mounts, what is visible, what is torn
 * down synchronously, and how many listeners/observers/timers survive.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 * --------------------------------
 * - It does not reimplement any Prompt Manager route logic. Every assertion is
 *   made against production bytes loaded from disk (or from Git, for the
 *   negative control).
 * - It does not execute 9A1a Interface Kernel. The route contract under test is
 *   PM's CONSUMPTION of it: set location.pathname, synchronously dispatch
 *   'ho:navigate', require teardown to be complete before dispatch returns.
 *   Interface Kernel's own production of that event is 9A1a-owned and is tested
 *   by 9A1a. If that contract ever changes, this file's boundary comment is the
 *   place to look.
 * - It does not add production counters. All instrumentation lives here.
 * - It uses no jsdom and no new dependency, matching repository convention.
 *
 * FIDELITY IS SELF-CHECKED
 * ------------------------
 * A stub DOM that is too permissive would pass everything and prove nothing.
 * The negative control runs the same scenarios against pre-Issue-3 bytes
 * (13b333a2) and REQUIRES them to fail. If the pre-fix module passes, this
 * harness is defective, not the module, and it reports itself invalid rather
 * than green.
 */

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..', '..', '..');
const MODULE_REL = 'src-runtime-base/7A1a.⬜️✍️ Prompt Manager ✍️.js';

/* Pre-Issue-3 authority. The negative control reads these bytes through Git
 * object storage rather than duplicating a 320 KB historical fixture. */
const PRE_FIX_COMMIT = '13b333a2e6249aed9f90f0ec16776147c2edd434';

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

function readCurrentSource() {
  return fs.readFileSync(path.join(REPO_ROOT, MODULE_REL), 'utf8');
}

/* execFileSync with an argv array on purpose. The module path contains emoji;
 * routing it through a shell splits and mangles it. */
function readPreFixSource() {
  return execFileSync('git', ['show', `${PRE_FIX_COMMIT}:${MODULE_REL}`], {
    cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
  });
}

/* ────────────────────────────── DOM MODEL ────────────────────────────────
 * Bounded on purpose: only what 7A1a's lifecycle and mount actually touch.
 * Not a browser. Every behaviour here is exercised by the negative control,
 * so leniency shows up as a false GREEN on pre-fix bytes and fails the run. */

const VOID_TAGS = new Set(['input', 'br', 'img', 'hr', 'meta', 'link', 'source']);
/* Real browsers give these display:none; PM's visibility probe must agree, or
 * the injected <style> would be counted as a visible owned control. */
const NEVER_VISIBLE_TAGS = new Set(['STYLE', 'SCRIPT', 'TEMPLATE', 'HEAD']);

class El {
  constructor(tag, env) {
    this.tagName = String(tag).toUpperCase();
    this.env = env;
    this.children = [];
    this.parentElement = null;
    this._attrs = new Map();
    this.style = {};
    this._text = '';
    this._listeners = new Map();
  }

  get classList() {
    const self = this;
    const read = () => new Set(String(self._attrs.get('class') || '').split(/\s+/).filter(Boolean));
    const write = (s) => { if (s.size) self._attrs.set('class', Array.from(s).join(' ')); else self._attrs.delete('class'); };
    return {
      add(...c) { const s = read(); c.forEach((x) => s.add(x)); write(s); },
      remove(...c) { const s = read(); c.forEach((x) => s.delete(x)); write(s); },
      contains(c) { return read().has(c); },
      toggle(c, force) {
        const s = read();
        const on = (force === undefined) ? !s.has(c) : !!force;
        if (on) s.add(c); else s.delete(c);
        write(s);
        return on;
      },
    };
  }

  get id() { return this._attrs.get('id') || ''; }
  set id(v) { this._attrs.set('id', String(v)); }

  setAttribute(n, v) { this._attrs.set(String(n), String(v)); }
  getAttribute(n) { return this._attrs.has(String(n)) ? this._attrs.get(String(n)) : null; }
  hasAttribute(n) { return this._attrs.has(String(n)); }
  removeAttribute(n) { this._attrs.delete(String(n)); }
  get attributes() { return Array.from(this._attrs, ([name, value]) => ({ name, value })); }

  appendChild(c) {
    if (!c) return c;
    if (c.parentElement) c.parentElement.removeChild(c);
    c.parentElement = this;
    this.children.push(c);
    return c;
  }
  insertBefore(c, ref) {
    if (!ref) return this.appendChild(c);
    if (c.parentElement) c.parentElement.removeChild(c);
    const i = this.children.indexOf(ref);
    c.parentElement = this;
    if (i < 0) this.children.push(c); else this.children.splice(i, 0, c);
    return c;
  }
  removeChild(c) {
    const i = this.children.indexOf(c);
    if (i >= 0) { this.children.splice(i, 1); c.parentElement = null; }
    return c;
  }
  remove() { if (this.parentElement) this.parentElement.removeChild(this); }
  get firstElementChild() { return this.children[0] || null; }
  get nextElementSibling() {
    const p = this.parentElement;
    if (!p) return null;
    return p.children[p.children.indexOf(this) + 1] || null;
  }

  contains(n) {
    for (let cur = n; cur; cur = cur.parentElement) if (cur === this) return true;
    return false;
  }
  closest(sel) {
    const chains = parseSelector(sel);
    for (let cur = this; cur; cur = cur.parentElement) {
      if (chains.some((ch) => ch.length === 1 && matchesSimple(cur, ch[0]))) return cur;
      if (chains.some((ch) => matchesChain(cur, ch))) return cur;
    }
    return null;
  }

  descendants(out = []) {
    for (const c of this.children) { out.push(c); c.descendants(out); }
    return out;
  }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  querySelectorAll(sel) {
    const chains = parseSelector(sel);
    const all = this.descendants();
    const hit = [];
    for (const el of all) if (chains.some((ch) => matchesChain(el, ch))) hit.push(el);
    return hit;
  }

  set innerHTML(html) {
    this.children.forEach((c) => { c.parentElement = null; });
    this.children = [];
    parseFragmentInto(this, String(html), this.env);
  }
  get innerHTML() { return this.children.map((c) => c.outerHTMLish()).join(''); }
  outerHTMLish() { return `<${this.tagName.toLowerCase()}>${this._text}${this.innerHTML}</${this.tagName.toLowerCase()}>`; }

  set textContent(v) {
    this.children.forEach((c) => { c.parentElement = null; });
    this.children = [];
    this._text = String(v);
  }
  get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); }

  getBoundingClientRect() {
    const vis = isRenderable(this);
    const w = vis ? 120 : 0;
    const h = vis ? 24 : 0;
    return { left: 0, top: 0, right: w, bottom: h, width: w, height: h, x: 0, y: 0 };
  }

  focus() { if (this.env) this.env.document.activeElement = this; }
  click() { this.dispatchEvent({ type: 'click', target: this }); }

  addEventListener(type, fn) {
    if (typeof fn !== 'function') return;
    if (!this._listeners.has(type)) this._listeners.set(type, []);
    this._listeners.get(type).push(fn);
  }
  removeEventListener(type, fn) {
    const a = this._listeners.get(type);
    if (!a) return;
    const i = a.indexOf(fn);
    if (i >= 0) a.splice(i, 1);
  }
  dispatchEvent(ev) {
    for (const fn of (this._listeners.get(ev?.type) || []).slice()) {
      try { fn(ev); } catch { /* a listener throwing must not abort the harness */ }
    }
    return true;
  }
  listenerCount(type) { return (this._listeners.get(type) || []).length; }
}

/* Connected to the document tree AND not display:none anywhere up the chain. */
function isRenderable(el) {
  if (NEVER_VISIBLE_TAGS.has(el.tagName)) return false;
  let cur = el;
  let rooted = false;
  while (cur) {
    if (NEVER_VISIBLE_TAGS.has(cur.tagName)) return false;
    if (cur.style && cur.style.display === 'none') return false;
    if (cur.tagName === 'HTML') rooted = true;
    cur = cur.parentElement;
  }
  return rooted;
}

/* ── HTML fragment parser ──────────────────────────────────────────────────
 * PM's panel template is static, well-formed and script-free: div/button/input/
 * label/textarea with double-quoted attributes. That is the entire grammar this
 * needs to accept. */
function parseFragmentInto(host, html, env) {
  const stack = [host];
  const re = /<\/\s*([a-zA-Z0-9-]+)\s*>|<([a-zA-Z0-9-]+)((?:\s+[^\s=>/]+(?:\s*=\s*"[^"]*")?)*)\s*(\/?)>|([^<]+)/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const [, closeTag, openTag, attrText, selfClose, text] = m;
    const top = stack[stack.length - 1];
    if (closeTag) {
      if (stack.length > 1 && stack[stack.length - 1].tagName === closeTag.toUpperCase()) stack.pop();
    } else if (openTag) {
      const el = new El(openTag, env);
      const ar = /([^\s=]+)(?:\s*=\s*"([^"]*)")?/g;
      let a;
      while ((a = ar.exec(attrText || '')) !== null) {
        if (!a[1]) continue;
        el.setAttribute(a[1], a[2] === undefined ? '' : a[2]);
      }
      top.appendChild(el);
      if (!selfClose && !VOID_TAGS.has(openTag.toLowerCase())) stack.push(el);
    } else if (text && text.trim()) {
      top._text += text;
    }
  }
}

/* ── selector engine ──────────────────────────────────────────────────────
 * PM's runtime vocabulary only: tag, #id, .class, [attr], [attr="v"],
 * [attr*="v" i], descendant combinator, comma lists. CSS escapes such as
 * `form.group\/composer` are unescaped rather than rejected. */
const SEL_CACHE = new Map();
function parseSelector(sel) {
  const key = String(sel);
  if (SEL_CACHE.has(key)) return SEL_CACHE.get(key);
  const chains = [];
  for (const part of splitTopLevel(key, ',')) {
    const chain = splitTopLevel(part.trim(), ' ').filter(Boolean).map(parseSimple);
    if (chain.length) chains.push(chain);
  }
  SEL_CACHE.set(key, chains);
  return chains;
}
/* Comma/space splitting that ignores separators inside [...] or "..." . */
function splitTopLevel(s, sep) {
  const out = [];
  let buf = '';
  let depth = 0;
  let quote = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quote) { buf += c; if (c === quote && s[i - 1] !== '\\') quote = null; continue; }
    if (c === '"' || c === "'") { quote = c; buf += c; continue; }
    if (c === '[') depth++;
    if (c === ']') depth--;
    if (c === sep && depth === 0) { out.push(buf); buf = ''; continue; }
    buf += c;
  }
  out.push(buf);
  return out.map((x) => x.trim()).filter((x) => x.length);
}
function parseSimple(tok) {
  const simple = { tag: null, id: null, classes: [], attrs: [] };
  let rest = tok;
  rest = rest.replace(/\[([^\]]*)\]/g, (_all, body) => {
    const m = body.match(/^\s*([^\s~^$*|=]+)\s*(?:([~^$*|]?=)\s*"([^"]*)"\s*(i)?)?\s*$/);
    if (m) simple.attrs.push({ name: m[1], op: m[2] || null, value: m[3] ?? null, ci: !!m[4] });
    return '';
  });
  // strip pseudo-classes/elements: PM never queries by them at runtime
  rest = rest.replace(/::?[a-zA-Z-]+(\([^)]*\))?/g, '');
  const idm = rest.match(/#([A-Za-z0-9_-]+)/);
  if (idm) { simple.id = idm[1]; rest = rest.replace(idm[0], ''); }
  rest = rest.replace(/\.((?:\\.|[^.\s#[])+)/g, (_all, cls) => {
    simple.classes.push(cls.replace(/\\(.)/g, '$1'));
    return '';
  });
  const t = rest.trim();
  if (t && t !== '*') simple.tag = t.toUpperCase();
  return simple;
}
function matchesSimple(el, s) {
  if (!el || !el.tagName) return false;
  if (s.tag && el.tagName !== s.tag) return false;
  if (s.id && el.getAttribute('id') !== s.id) return false;
  for (const c of s.classes) if (!el.classList.contains(c)) return false;
  for (const a of s.attrs) {
    const v = el.getAttribute(a.name);
    if (v === null) return false;
    if (!a.op) continue;
    const hay = a.ci ? v.toLowerCase() : v;
    const needle = a.ci ? String(a.value).toLowerCase() : String(a.value);
    if (a.op === '=' && hay !== needle) return false;
    if (a.op === '*=' && !hay.includes(needle)) return false;
    if (a.op === '^=' && !hay.startsWith(needle)) return false;
    if (a.op === '$=' && !hay.endsWith(needle)) return false;
  }
  return true;
}
function matchesChain(el, chain) {
  if (!matchesSimple(el, chain[chain.length - 1])) return false;
  let i = chain.length - 2;
  let cur = el.parentElement;
  while (i >= 0) {
    if (!cur) return false;
    if (matchesSimple(cur, chain[i])) i--;
    cur = cur.parentElement;
  }
  return true;
}

/* ────────────────────────── SANDBOX / ENVIRONMENT ───────────────────────── */

function makeEnv(source, opts = {}) {
  const pathname = opts.pathname || '/c/chat-1';
  const env = {
    now: 0,
    timers: new Map(),
    nextTimerId: 1,
    frames: [],
    observers: [],
    dock: { ready: 0, register: 0, unregister: 0, registered: new Set() },
    winListeners: new Map(),
    threw: null,
  };

  const documentElement = new El('html', env);
  const head = new El('head', env);
  const body = new El('body', env);
  documentElement.appendChild(head);
  documentElement.appendChild(body);

  const store = new Map();
  const localStorage = {
    getItem: (k) => (store.has(String(k)) ? store.get(String(k)) : null),
    setItem: (k, v) => { store.set(String(k), String(v)); },
    removeItem: (k) => { store.delete(String(k)); },
    clear: () => store.clear(),
    key: (i) => Array.from(store.keys())[i] ?? null,
    get length() { return store.size; },
  };

  const documentStub = {
    /* 'complete' on purpose: the module's bootstrap takes the immediate
     * CORE_PM_boot() branch instead of parking on DOMContentLoaded, and a real
     * body means the self-heal observer installs immediately. Both are required
     * for this harness to exercise the lifecycle at all. */
    readyState: 'complete',
    documentElement,
    head,
    body,
    title: '',
    activeElement: null,
    createElement: (t) => new El(t, env),
    getElementById(id) {
      return documentElement.descendants().find((e) => e.getAttribute('id') === id) || null;
    },
    querySelector: (s) => documentElement.querySelector(s),
    querySelectorAll: (s) => documentElement.querySelectorAll(s),
    contains: (el) => !!el && (el === documentElement || documentElement.contains(el)),
    addEventListener: (t, f) => documentElement.addEventListener(t, f),
    removeEventListener: (t, f) => documentElement.removeEventListener(t, f),
    dispatchEvent: (ev) => documentElement.dispatchEvent(ev),
  };

  const windowStub = {
    __H2O_PM_TEST__: true,
    location: { pathname, href: `https://chatgpt.com${pathname}`, origin: 'https://chatgpt.com' },
    localStorage,
    crypto: { randomUUID: (() => { let n = 0; return () => `id-${++n}`; })() },
    innerWidth: 1280,
    innerHeight: 900,
    H2O: {},

    setTimeout(fn, ms) {
      const id = env.nextTimerId++;
      env.timers.set(id, { id, at: env.now + (Number(ms) || 0), fn, kind: 'timeout' });
      return id;
    },
    clearTimeout(id) { env.timers.delete(id); },
    setInterval(fn, ms) {
      const id = env.nextTimerId++;
      const every = Math.max(1, Number(ms) || 1);
      env.timers.set(id, { id, at: env.now + every, fn, kind: 'interval', every });
      return id;
    },
    clearInterval(id) { env.timers.delete(id); },
    requestAnimationFrame(fn) { const id = env.nextTimerId++; env.frames.push({ id, fn }); return id; },
    cancelAnimationFrame(id) { env.frames = env.frames.filter((f) => f.id !== id); },

    getComputedStyle(el) {
      const vis = el ? isRenderable(el) : false;
      return {
        display: (el && el.style && el.style.display) ? el.style.display : (vis ? 'block' : 'none'),
        visibility: 'visible',
        opacity: '1',
        position: (el && el.style && el.style.position) || 'static',
      };
    },

    addEventListener(type, fn) {
      if (typeof fn !== 'function') return;
      if (!env.winListeners.has(type)) env.winListeners.set(type, []);
      env.winListeners.get(type).push(fn);
    },
    removeEventListener(type, fn) {
      const a = env.winListeners.get(type);
      if (!a) return;
      const i = a.indexOf(fn);
      if (i >= 0) a.splice(i, 1);
    },
    /* Synchronous, exactly as a real window is. This is what allows the
     * Issue-3 assertion "teardown is complete before dispatch returns". */
    dispatchEvent(ev) {
      for (const fn of (env.winListeners.get(ev?.type) || []).slice()) {
        try { fn(ev); } catch { /* keep dispatching */ }
      }
      return true;
    },
  };

  /* InputDock stub — the contract PM consumes via W.H2O.InputDock.api. */
  windowStub.H2O.InputDock = {
    api: {
      ready() { env.dock.ready++; return true; },
      register(spec) {
        env.dock.register++;
        if (spec && spec.id) env.dock.registered.add(spec.id);
        return true;
      },
      unregister(id) {
        env.dock.unregister++;
        env.dock.registered.delete(id);
        return true;
      },
    },
  };

  const sandbox = {
    console: { log() {}, info() {}, warn() {}, error() {}, debug() {} },
    window: windowStub,
    document: documentStub,
    localStorage,
    performance: { now: () => env.now },
    navigator: { userAgent: 'h2o-pm-route-lifecycle-harness' },
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
    Event: class { constructor(type) { this.type = type; } },
    MutationObserver: class {
      constructor(cb) { this.cb = cb; this.targets = []; this.live = true; env.observers.push(this); }
      observe(t, o) { this.targets.push({ t, o }); }
      disconnect() { this.live = false; }
      takeRecords() { return []; }
    },
    ResizeObserver: class { observe() {} disconnect() {} },
    CSS: { escape: (s) => String(s) },
    TextEncoder,
    URL,
    Blob: class { constructor(p) { this.parts = p; } },
    setTimeout: windowStub.setTimeout,
    clearTimeout: windowStub.clearTimeout,
    setInterval: windowStub.setInterval,
    clearInterval: windowStub.clearInterval,
    requestAnimationFrame: windowStub.requestAnimationFrame,
    cancelAnimationFrame: windowStub.cancelAnimationFrame,
    getComputedStyle: windowStub.getComputedStyle,
  };
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  vm.createContext(sandbox);

  env.sandbox = sandbox;
  env.window = windowStub;
  env.document = documentStub;
  env.body = body;

  if (opts.composer !== false) addComposer(env);

  try {
    vm.runInContext(source, sandbox, { filename: MODULE_REL });
  } catch (e) {
    env.threw = e;
  }
  return env;
}

/* ── deterministic scheduling controls ─────────────────────────────────── */
function flushFrames(env, rounds = 3) {
  for (let r = 0; r < rounds; r++) {
    const q = env.frames;
    env.frames = [];
    for (const f of q) { try { f.fn(env.now); } catch { /* ignore */ } }
  }
}
function advance(env, ms) {
  const target = env.now + ms;
  let guard = 0;
  for (;;) {
    if (++guard > 5000) break; // runaway backstop; intervals self-terminate in PM
    let due = null;
    for (const t of env.timers.values()) if (t.at <= target && (!due || t.at < due.at)) due = t;
    if (!due) break;
    env.now = due.at;
    if (due.kind === 'interval') due.at = env.now + due.every;
    else env.timers.delete(due.id);
    try { due.fn(); } catch { /* ignore */ }
    flushFrames(env, 1);
  }
  env.now = target;
  flushFrames(env, 2);
}
/* Settle the module: let boot, self-heal debounce and the dock warm interval
 * run to completion. 25s of virtual time covers the 250ms x 80 warm loop. */
function settle(env) { flushFrames(env, 3); advance(env, 25000); }

/* ── DOM fixtures ─────────────────────────────────────────────────────── */
function addComposer(env) {
  const form = new El('form', env);
  form.setAttribute('data-testid', 'composer');
  const ta = new El('div', env);
  ta.setAttribute('id', 'prompt-textarea');
  ta.setAttribute('contenteditable', 'true');
  form.appendChild(ta);
  const btn = new El('button', env);
  btn.setAttribute('data-testid', 'send-button');
  form.appendChild(btn);
  env.body.appendChild(form);
  return form;
}
function removeComposer(env) {
  for (const f of env.document.querySelectorAll('form[data-testid="composer"]')) f.remove();
}

/* ── probes (all externally observable) ───────────────────────────────── */
const SEL_ROOT = '[data-cgxui="prmn-wrap"]';
const SEL_OWNED = '[data-cgxui-owner="prmn"]';
const SEL_PANEL = '[data-cgxui="prmn-panel"]';

const roots = (env) => env.document.querySelectorAll(SEL_ROOT);
const rootCount = (env) => roots(env).length;
const panel = (env) => env.document.querySelector(SEL_PANEL);
const visibleOwned = (env) => env.document.querySelectorAll(SEL_OWNED).filter((e) => {
  const r = e.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
});
const visibleCount = (env) => visibleOwned(env).length;
const navListeners = (env) => (env.winListeners.get('ho:navigate') || []).length;
const liveObservers = (env) => env.observers.filter((o) => o.live).length;
const liveTimers = (env) => env.timers.size;
const modObj = (env) => env.sandbox.window.H2O?.PM?.prmptmngr || null;
const apiCount = (env) => Object.keys(env.sandbox.window.H2O?.PromptManager || {}).length;
const pmState = (env) => modObj(env)?.__test?.state || null;

/* The route contract under test. Interface Kernel is NOT executed: this is the
 * consumed half of the contract only. */
function navigate(env, pathname) {
  env.window.location.pathname = pathname;
  env.window.location.href = `https://chatgpt.com${pathname}`;
  env.window.dispatchEvent(new env.sandbox.Event('ho:navigate'));
}
/* Fire the self-heal MutationObserver the way a real DOM mutation would. */
function deliverMutations(env) {
  for (const o of env.observers) {
    if (!o.live) continue;
    try { o.cb([{ type: 'childList' }], o); } catch { /* ignore */ }
  }
}

function bootAt(source, pathname, opts = {}) {
  const env = makeEnv(source, { pathname, ...opts });
  settle(env);
  return env;
}

/* ══════════════════════════════ SCENARIOS ══════════════════════════════ */

function runLivenessGate(SRC) {
  console.log('── Harness liveness (must pass before any suppression counts) ──');
  const env = bootAt(SRC, '/c/chat-1');
  let live = true;
  const gate = (label, fn) => { const before = FAIL.length; check(label, fn); if (FAIL.length > before) live = false; };

  gate('L0 real module executed without throwing', () => {
    assert.equal(env.threw, null, `module threw: ${env.threw && env.threw.stack}`);
  });
  gate('L1 H2O.PM.prmptmngr exists', () => assert.ok(modObj(env), 'module object absent'));
  gate('L2 lifecycle entry points are functions', () => {
    const core = modObj(env)?.core || {};
    assert.equal(typeof core.boot, 'function', 'core.boot missing');
    assert.equal(typeof core.dispose, 'function', 'core.dispose missing');
    assert.equal(typeof core.invalidateRoute, 'function', 'core.invalidateRoute missing');
  });
  gate('L3 exactly six public API methods', () => {
    assert.equal(apiCount(env), 6, `expected 6 API methods, got ${apiCount(env)}`);
  });
  gate('L4 window-owned route sentinel is set', () => {
    assert.equal(env.sandbox.window.__H2O_PM_ROUTE_WIRED__, true, 'route sentinel not set');
  });
  gate('L5 exactly one ho:navigate listener', () => {
    assert.equal(navListeners(env), 1, `expected 1 ho:navigate listener, got ${navListeners(env)}`);
  });
  gate('L6 POSITIVE CONTROL: chat route mounts exactly one root with visible controls', () => {
    assert.equal(rootCount(env), 1, `expected 1 PM root on /c/chat-1, got ${rootCount(env)}`);
    assert.ok(visibleCount(env) > 1,
      `expected visible PM controls on a chat route, got ${visibleCount(env)} — harness cannot mount PM, so suppression results are meaningless`);
  });

  console.log(live ? '  HARNESS_LIVENESS_PASS' : '  HARNESS_LIVENESS_FAIL');
  return { live, env };
}

function runScenarios(SRC) {
  console.log('── A. chat boot ──');
  {
    const env = bootAt(SRC, '/c/chat-1');
    check('A1 core booted on a chat route', () => assert.equal(pmState(env)?.booted, true));
    check('A2 six-method API available', () => assert.equal(apiCount(env), 6));
    check('A3 exactly one PM root mounted', () => assert.equal(rootCount(env), 1));
    check('A4 chat controls are visible', () => assert.ok(visibleCount(env) > 1, `visible=${visibleCount(env)}`));
    check('A5 panel starts closed and inert', () => {
      const p = panel(env);
      assert.ok(p, 'panel node missing — DOM/template parse failed');
      assert.equal(p.hasAttribute('inert'), true, 'panel should be inert when closed');
      assert.equal(p.getAttribute('aria-hidden'), 'true');
    });
  }

  console.log('── B. Project boot with a chat-like composer ──');
  {
    const env = bootAt(SRC, '/g/project-1/project');
    check('B1 PM core still boots off a chat route', () => assert.equal(pmState(env)?.booted, true));
    check('B2 six-method API still available', () => assert.equal(apiCount(env), 6));
    check('B3 a usable composer IS present (suppression must be route-based)', () => {
      assert.ok(env.document.getElementById('prompt-textarea'), 'composer fixture missing');
      assert.ok(env.document.querySelector('form[data-testid="composer"]'), 'composer form missing');
    });
    check('B4 zero PM roots mounted', () => assert.equal(rootCount(env), 0, `root mounted on Project: ${rootCount(env)}`));
    check('B5 zero visible chat-only controls', () => assert.equal(visibleCount(env), 0, `visible=${visibleCount(env)}`));
    check('B6 no boot-retry storm (boot stays latched, no pending timer)', () => {
      assert.equal(pmState(env)?.booted, true, 'boot un-latched off a chat route — retry storm');
      /* A settled lifecycle owns no pending timer: the boot retry is a one-shot
       * and the dock warm interval self-terminates. A retry storm is precisely a
       * perpetually re-armed 260 ms timer, so the exact settled contract is zero.
       * An absolute ceiling here would tolerate the very leak it should catch. */
      assert.equal(liveTimers(env), 0,
        `settled Project boot must hold no pending timer; found ${liveTimers(env)} (boot-retry storm)`);
    });
  }

  console.log('── C. root / non-chat ──');
  {
    const env = bootAt(SRC, '/');
    check('C1 core/API preserved on /', () => {
      assert.equal(pmState(env)?.booted, true);
      assert.equal(apiCount(env), 6);
    });
    check('C2 chat-only UI absent on /', () => {
      assert.equal(rootCount(env), 0);
      assert.equal(visibleCount(env), 0);
    });
    check('C3 route sentinel still installed', () => assert.equal(env.sandbox.window.__H2O_PM_ROUTE_WIRED__, true));
  }

  console.log('── D. chat -> Project synchronous invalidation (primary Issue-3 regression) ──');
  {
    const env = bootAt(SRC, '/c/chat-1');
    const before = visibleCount(env);
    const dockBefore = env.dock.unregister;
    /* Captured INSIDE the same synchronous task, before dispatch returns. */
    env.window.location.pathname = '/g/project-1/project';
    env.window.location.href = 'https://chatgpt.com/g/project-1/project';
    env.window.dispatchEvent(new env.sandbox.Event('ho:navigate'));
    const afterSync = visibleCount(env);
    const p = panel(env);

    check('D1 controls were visible before navigation', () => assert.ok(before > 1, `before=${before}`));
    check('D2 SYNCHRONOUS suppression: zero visible controls when dispatch returns', () => {
      assert.equal(afterSync, 0,
        `visible ${before} -> ${afterSync} in the same task; a non-zero value is the Issue-3 leak`);
    });
    check('D3 composer still present (route-based, not form-based)', () => {
      assert.ok(env.document.getElementById('prompt-textarea'), 'composer vanished — test invalid');
    });
    check('D4 root hidden rather than destroyed', () => {
      const r = roots(env)[0];
      assert.ok(r, 'root should remain in the DOM, hidden');
      assert.equal(r.style.display, 'none');
    });
    check('D5 panel closed and inert', () => {
      assert.ok(p, 'panel missing');
      assert.equal(p.hasAttribute('inert'), true);
      assert.equal(p.getAttribute('aria-hidden'), 'true');
    });
    check('D6 dock registration released where dock was engaged', () => {
      assert.ok(env.dock.unregister >= dockBefore, 'unregister count regressed');
      assert.equal(env.dock.registered.size, 0, 'dock registration survived route exit');
    });
  }

  console.log('── E. Project -> chat remount ──');
  {
    const env = bootAt(SRC, '/c/chat-1');
    /* A mounted chat route legitimately owns TWO observers: the module-scope
     * self-heal observer plus the boot-installed theme observer. "Not
     * duplicated" therefore means the count must not GROW across a navigation
     * cycle — an absolute ceiling would encode the wrong contract. */
    const obsAfterBoot = liveObservers(env);
    navigate(env, '/g/project-1/project');
    settle(env);
    navigate(env, '/c/chat-2');
    settle(env);
    check('E1 remounted on the new chat route', () => assert.ok(visibleCount(env) > 1, `visible=${visibleCount(env)}`));
    check('E2 exactly one root after remount', () => assert.equal(rootCount(env), 1));
    check('E3 still exactly one ho:navigate listener', () => assert.equal(navListeners(env), 1));
    check('E4 observers not duplicated across the navigation cycle', () => {
      assert.ok(obsAfterBoot > 0, 'baseline observer count should be non-zero after a mounted boot');
      assert.ok(liveObservers(env) <= obsAfterBoot,
        `observer count grew ${obsAfterBoot} -> ${liveObservers(env)} across chat->Project->chat`);
    });
    check('E5 API identity stable', () => assert.equal(apiCount(env), 6));
  }

  console.log('── F. Project -> Project ──');
  {
    const env = bootAt(SRC, '/g/project-1/project');
    navigate(env, '/g/project-2/project');
    settle(env);
    check('F1 chat UI still absent across Project routes', () => {
      assert.equal(rootCount(env), 0);
      assert.equal(visibleCount(env), 0);
    });
    check('F2 core/API still alive', () => assert.equal(apiCount(env), 6));
  }

  console.log('── G. repeated navigation ──');
  {
    const env = bootAt(SRC, '/c/chat-1');
    const obsStart = liveObservers(env);
    const timersStart = liveTimers(env);
    for (let i = 0; i < 3; i++) {
      navigate(env, `/g/project-${i}/project`);
      settle(env);
      navigate(env, `/c/chat-${i}`);
      settle(env);
    }
    check('G1 root count never exceeds one', () => assert.equal(rootCount(env), 1, `roots=${rootCount(env)}`));
    check('G2 ho:navigate listener count stays exactly one', () => assert.equal(navListeners(env), 1));
    check('G3 observer count stable across three full cycles', () => {
      assert.ok(liveObservers(env) <= obsStart,
        `observer count grew ${obsStart} -> ${liveObservers(env)} across 3 chat->Project->chat cycles`);
    });
    check('G4 timer count does not grow across three full cycles', () => {
      assert.ok(liveTimers(env) <= timersStart,
        `timer count grew ${timersStart} -> ${liveTimers(env)} across 3 chat->Project->chat cycles`);
    });
    check('G5 API still exactly six methods', () => assert.equal(apiCount(env), 6));
  }

  console.log('── H. MutationObserver remount defence ──');
  {
    const env = bootAt(SRC, '/g/project-1/project');
    for (let i = 0; i < 5; i++) {
      removeComposer(env);
      addComposer(env);
      deliverMutations(env);
      settle(env);
    }
    check('H1 repeated composer churn cannot mount chat UI on Project', () => assert.equal(rootCount(env), 0));
    check('H2 still zero visible controls', () => assert.equal(visibleCount(env), 0));
    check('H3 observers did not multiply under churn', () => assert.ok(liveObservers(env) <= 1, `observers=${liveObservers(env)}`));
    check('H4 core survived the churn', () => assert.equal(apiCount(env), 6));
  }

  console.log('── I. self-heal ──');
  {
    const chat = bootAt(SRC, '/c/chat-1');
    for (const r of roots(chat)) r.remove();
    deliverMutations(chat);
    settle(chat);
    check('I1 chat route recovers a removed root', () => assert.equal(rootCount(chat), 1, `roots=${rootCount(chat)}`));
    check('I2 recovery does not duplicate the route listener', () => assert.equal(navListeners(chat), 1));

    const proj = bootAt(SRC, '/g/project-1/project');
    /* Settled baseline captured BEFORE the self-heal churn, so the assertion
     * measures what the churn added rather than an arbitrary ceiling. */
    const projTimersStart = liveTimers(proj);
    for (let i = 0; i < 3; i++) { deliverMutations(proj); settle(proj); }
    check('I3 Project self-heal cannot create chat UI', () => assert.equal(rootCount(proj), 0));
    check('I4 Project self-heal does not un-latch boot', () => assert.equal(pmState(proj)?.booted, true));
    check('I5 Project self-heal does not accumulate timers', () => {
      assert.ok(liveTimers(proj) <= projTimersStart,
        `timer count grew ${projTimersStart} -> ${liveTimers(proj)} across repeated Project self-heal`);
    });
  }

  console.log('── J. Search visibility vs route eligibility ──');
  {
    const env = bootAt(SRC, '/c/chat-1');
    const dialog = new El('div', env);
    dialog.setAttribute('role', 'dialog');
    const input = new El('input', env);
    input.setAttribute('placeholder', 'Search chats');
    dialog.appendChild(input);
    env.body.appendChild(dialog);
    deliverMutations(env);
    settle(env);
    check('J1 core stays booted while Search is open', () => assert.equal(pmState(env)?.booted, true));
    check('J2 six API methods remain available while Search is open', () => assert.equal(apiCount(env), 6));
    check('J3 Search does not become route eligibility (root survives, hidden by policy)', () => {
      assert.equal(rootCount(env), 1, 'Search must not un-mount PM; it is a visibility policy only');
      assert.equal(visibleCount(env), 0, 'controls should be hidden while Search is open');
    });
    dialog.remove();
    deliverMutations(env);
    settle(env);
    check('J4 closing Search restores controls without a second core boot', () => {
      assert.ok(visibleCount(env) > 1, `visible after Search close=${visibleCount(env)}`);
      assert.equal(rootCount(env), 1);
    });
  }

  console.log('── K. non-chat capture contract (Issue-3 architecture) ──');
  {
    const env = bootAt(SRC, '/g/project-1/project');
    const form = env.document.querySelector('form[data-testid="composer"]');
    check('K1 PM core alive on a non-chat surface', () => assert.equal(pmState(env)?.booted, true));
    check('K2 six-method API alive on a non-chat surface', () => assert.equal(apiCount(env), 6));
    check('K3 capture is bound to the host composer off a chat route', () => {
      assert.ok(form, 'composer fixture missing');
      const bound = form.listenerCount('submit') + form.listenerCount('keydown') + form.listenerCount('click');
      assert.ok(bound > 0, 'no capture listeners bound to the host composer on a non-chat route');
    });
    check('K4 chat-only UI still absent while capture is bound', () => assert.equal(rootCount(env), 0));
  }

  console.log('── L. dispose / re-evaluation / sentinel ──');
  {
    const env = bootAt(SRC, '/c/chat-1');
    modObj(env).core.dispose();
    settle(env);
    check('L7 dispose does not remove the window route sentinel', () => {
      assert.equal(env.sandbox.window.__H2O_PM_ROUTE_WIRED__, true, 'sentinel cleared by dispose');
    });
    check('L8 dispose does not remove the ho:navigate listener', () => {
      assert.equal(navListeners(env), 1, `listeners after dispose=${navListeners(env)}`);
    });
    modObj(env).core.boot();
    settle(env);
    check('L9 lifecycle is recoverable after dispose', () => assert.equal(rootCount(env), 1));

    /* Re-evaluate the same module source in the same realm: models the loader
     * recovery path where a script body can run twice. */
    try { vm.runInContext(readCurrentSourceCached(), env.sandbox, { filename: MODULE_REL }); } catch { /* ignore */ }
    settle(env);
    check('L10 re-evaluation does not duplicate the ho:navigate listener', () => {
      assert.equal(navListeners(env), 1, `duplicate listener after re-evaluation: ${navListeners(env)}`);
    });
    check('L11 re-evaluation does not create a second root', () => assert.equal(rootCount(env), 1, `roots=${rootCount(env)}`));
  }
}

let _srcCache = null;
function readCurrentSourceCached() {
  if (_srcCache == null) _srcCache = readCurrentSource();
  return _srcCache;
}

/* ═══════════════════════ NEGATIVE CONTROL (fidelity gate) ═══════════════ */
function runNegativeControl(preSrc) {
  console.log('── Negative control: pre-Issue-3 bytes MUST fail ──');
  const failures = [];

  const projEnv = bootAt(preSrc, '/g/project-1/project');
  const projMounted = rootCount(projEnv);
  const projVisible = visibleCount(projEnv);
  if (projMounted > 0 || projVisible > 0) {
    failures.push(`direct Project mount leaked (roots=${projMounted}, visible=${projVisible})`);
  }

  const navEnv = bootAt(preSrc, '/c/chat-1');
  const before = visibleCount(navEnv);
  navEnv.window.location.pathname = '/g/project-1/project';
  navEnv.window.dispatchEvent(new navEnv.sandbox.Event('ho:navigate'));
  const afterSync = visibleCount(navEnv);
  if (before > 0 && afterSync === before) {
    failures.push(`synchronous suppression absent (visible ${before} -> ${afterSync} on ho:navigate)`);
  }
  const preSentinel = navEnv.sandbox.window.__H2O_PM_ROUTE_WIRED__ === true;
  const preNavListeners = (navEnv.winListeners.get('ho:navigate') || []).length;
  if (!preSentinel) failures.push('no window route sentinel (expected: pre-fix has none)');
  if (preNavListeners === 0) failures.push('no ho:navigate listener (expected: pre-fix has none)');

  for (const f of failures) console.log(`  ✓ pre-fix defect reproduced: ${f}`);
  return { failures, projMounted, projVisible, before, afterSync };
}

/* ══════════════════════════════ MAIN ══════════════════════════════════ */
function main() {
  const t0 = Date.now();
  console.log('── Prompt Manager 7A1a route/lifecycle harness ─────────');

  const SRC = readCurrentSourceCached();
  console.log(`  module: ${MODULE_REL}`);
  console.log(`  sha256: ${crypto.createHash('sha256').update(SRC).digest('hex')}`);

  const { live } = runLivenessGate(SRC);
  if (!live) {
    console.log('');
    console.log('HARNESS INVALID — liveness gate failed; suppression results are not credible.');
    console.log(`PASS ${PASS.length}`);
    console.log(`FAIL ${FAIL.length}`);
    for (const f of FAIL) console.log(`- ${f.label}: ${f.m}`);
    process.exitCode = 1;
    return;
  }

  runScenarios(SRC);

  /* Fidelity gate. A harness that cannot see the original defect is not
   * evidence of anything, so this is an assertion, not a diagnostic. */
  let neg = null;
  let negErr = null;
  try { neg = runNegativeControl(readPreFixSource()); }
  catch (e) { negErr = e; }

  check('N1 negative control obtained pre-fix bytes from Git object authority', () => {
    assert.equal(negErr, null, `could not read ${PRE_FIX_COMMIT}: ${negErr && negErr.message}`);
    assert.ok(neg, 'negative control did not run');
  });
  check('N2 pre-fix bytes FAIL at least one route/lifecycle contract', () => {
    assert.ok(neg && neg.failures.length > 0,
      'pre-Issue-3 module passed every route scenario — the DOM/event model is not faithfully detecting the defect, so this harness is INVALID');
  });
  check('N3 pre-fix leak is the expected Issue-3 shape', () => {
    assert.ok(neg && (neg.projMounted > 0 || neg.afterSync === neg.before),
      `unexpected pre-fix behaviour: projRoots=${neg?.projMounted} visible ${neg?.before}->${neg?.afterSync}`);
  });
  check('N4 current bytes PASS what pre-fix bytes fail', () => {
    const env = bootAt(readCurrentSourceCached(), '/g/project-1/project');
    assert.equal(rootCount(env), 0, 'current module leaked on Project — differential is broken');
  });

  const ms = Date.now() - t0;
  console.log('');
  console.log(`PASS ${PASS.length}`);
  if (FAIL.length) {
    console.log(`FAIL ${FAIL.length}`);
    for (const f of FAIL) console.log(`- ${f.label}: ${f.m}`);
    process.exitCode = 1;
  }
  console.log(`runtime ${ms}ms`);
}

main();
