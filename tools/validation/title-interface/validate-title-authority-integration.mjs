#!/usr/bin/env node
/* Title <-> Backend Request Authority integration proof.
 *
 * Loads BOTH real modules into one sandboxed DOM, in loader order, and drives
 * the Title public API. Validators that check each module alone cannot show
 * that the rewire actually works, nor that Title stops when the authority is
 * absent instead of falling back to its own transport.
 *
 * NO LIVE NETWORK.
 */

import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const AUTHORITY = path.join(ROOT, "src-runtime-base/0A4a.⬛️🌐 Backend Request Authority 🌐.js");
const TITLE = path.join(ROOT, "src-runtime-base/9B0a.🟤🏷️ Chat Title State 🏷️.js");
const CHAT = "6a7f4a7c-ba2c-83eb-b0d1-acac9198b501";

function makeElement(tag = "div") {
  return {
    tagName: String(tag).toUpperCase(), nodeType: 1, children: [], childNodes: [],
    parentElement: null, style: {}, dataset: {}, attributes: {},
    classList: { add() {}, remove() {}, contains: () => false, toggle() {} },
    textContent: "", innerHTML: "", className: "", id: "", isConnected: true,
    getAttribute(n) { return n in this.attributes ? this.attributes[n] : null; },
    setAttribute(n, v) { this.attributes[n] = String(v); },
    removeAttribute(n) { delete this.attributes[n]; }, hasAttribute(n) { return n in this.attributes; },
    appendChild(c) { this.children.push(c); this.childNodes.push(c); c.parentElement = this; return c; },
    insertBefore(c) { return this.appendChild(c); }, removeChild(c) { return c; }, remove() {},
    querySelector: () => null, querySelectorAll: () => [], closest: () => null,
    matches: () => false, contains: () => false,
    addEventListener() {}, removeEventListener() {}, dispatchEvent: () => true,
    getBoundingClientRect: () => ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }),
    focus() {}, click() {}, scrollIntoView() {},
  };
}

function makeLocks() {
  const queues = new Map();
  const stats = { maxHeld: 0, held: 0 };
  return { stats, async request(name, options, cb) {
    if (typeof options === "function") { cb = options; options = {}; }
    const q = queues.get(name) || Promise.resolve();
    let release; const held = new Promise((r) => { release = r; });
    queues.set(name, q.then(() => held));
    await q.catch(() => null);
    stats.held += 1; stats.maxHeld = Math.max(stats.maxHeld, stats.held);
    try { return await cb({ name }); } finally { stats.held -= 1; release(); }
  } };
}

function makeRes({ status = 200, body = {}, headers = {} } = {}) {
  const lo = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v)]));
  const r = { status, ok: status >= 200 && status < 300,
    headers: { get: (n) => (n.toLowerCase() in lo ? lo[n.toLowerCase()] : null) }, json: async () => body };
  r.clone = () => r; return r;
}

function boot({ responder, withAuthority = true, store = {} }) {
  let clock = 1_700_000_000_000;
  const calls = [];
  let disposed = false;
  let budget = 3000;
  const locks = makeLocks();

  const localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
  const D = {
    title: "Plain Title", readyState: "complete", body: makeElement("body"),
    documentElement: makeElement("html"), head: makeElement("head"),
    // Model the loader's explicit authorized fixture; denial has its own
    // profile-gate validator and must not vacuously replace Title coverage.
    currentScript: { getAttribute: (name) => (
      name === "data-h2o-backend-authority-profile-v1" ? "true" : null
    ) },
    createElement: (t) => makeElement(t), createTextNode: (t) => ({ nodeType: 3, textContent: String(t) }),
    querySelector: () => null, querySelectorAll: () => [], getElementById: () => null,
    addEventListener() {}, removeEventListener() {}, dispatchEvent: () => true,
    contains: () => false, hidden: false, visibilityState: "visible",
  };
  const guard = (fn) => () => { if (!disposed) { try { fn(); } catch {} } };
  const RealDate = Date;
  const ClockDate = new Proxy(RealDate, {
    get(t, p) { return p === "now" ? () => clock : Reflect.get(t, p); },
    construct(t, a) { return a.length ? new t(...a) : new t(clock); },
  });

  const W = {
    location: { origin: "https://chatgpt.com", pathname: `/c/${CHAT}`, href: `https://chatgpt.com/c/${CHAT}`, search: "", hash: "" },
    history: { pushState() {}, replaceState() {}, state: null, length: 1 },
    document: D, localStorage, sessionStorage: localStorage,
    navigator: withAuthority ? { locks, userAgent: "harness" } : { userAgent: "harness" },
    performance: { now: () => clock },
    addEventListener() {}, removeEventListener() {}, dispatchEvent: () => true,
    setTimeout: (fn, ms) => { const raw = Number(ms) || 0; if (budget-- > 0) return setTimeout(guard(fn), raw >= 10000 ? raw : Math.min(raw, 3)); return 0; },
    clearTimeout: (t) => clearTimeout(t),
    setInterval: () => 0, clearInterval: () => {},
    requestAnimationFrame: (fn) => { if (budget-- > 0) setTimeout(guard(fn), 0); return 0; },
    cancelAnimationFrame: () => {}, queueMicrotask: (fn) => queueMicrotask(guard(fn)),
    fetch: async (url, init) => {
      if (disposed) throw new Error("disposed");
      const e = { url: String(url), method: (init?.method || "GET").toUpperCase(), body: init?.body ?? null };
      calls.push(e);
      const spec = responder(e, calls);
      if (spec?.throw) throw Object.assign(new Error(spec.throw), { name: "AbortError" });
      return typeof spec?.headers?.get === "function" ? spec : makeRes(spec);
    },
    CustomEvent: class { constructor(t, i) { this.type = t; this.detail = i?.detail; } },
    Event: class { constructor(t) { this.type = t; } },
    PopStateEvent: class { constructor(t, i) { this.type = t; this.state = i?.state; } },
    MutationObserver: class { constructor(cb) { this.cb = cb; } observe() {} disconnect() {} takeRecords() { return []; } },
  };
  W.window = W; W.self = W; W.top = W;

  const sandbox = {
    window: W, document: D, localStorage, sessionStorage: localStorage,
    location: W.location, history: W.history, navigator: W.navigator, performance: W.performance,
    setTimeout: W.setTimeout, clearTimeout: W.clearTimeout, setInterval: W.setInterval,
    clearInterval: W.clearInterval, requestAnimationFrame: W.requestAnimationFrame,
    cancelAnimationFrame: W.cancelAnimationFrame, queueMicrotask: W.queueMicrotask, fetch: W.fetch,
    MutationObserver: W.MutationObserver, CustomEvent: W.CustomEvent, Event: W.Event,
    PopStateEvent: W.PopStateEvent, Intl, AbortController,
    Date: ClockDate, Math: Object.assign(Object.create(Math), { random: () => 0.5 }),
    JSON, Number, String, Boolean, Array, Object, Promise, Map, Set, WeakMap, WeakSet,
    RegExp, Error, TypeError, Symbol, Proxy, Reflect, isNaN, parseInt, parseFloat,
    encodeURIComponent, decodeURIComponent, structuredClone,
    console: { log() {}, warn() {}, error() {}, info() {}, debug() {} },
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);

  // Loader order: the authority must be present before Title boots.
  if (withAuthority) new vm.Script(fs.readFileSync(AUTHORITY, "utf8"), { filename: "0A4a.js" }).runInContext(sandbox);
  new vm.Script(fs.readFileSync(TITLE, "utf8"), { filename: "9B0a.js" }).runInContext(sandbox);

  return {
    title: W.H2O?.ChatTitle || null,
    authority: W.H2O?.BackendAuthority || null,
    calls, store, locks,
    reset: () => { calls.length = 0; },
    advance: (ms) => { clock += ms; },
    dispose: () => { disposed = true; },
  };
}

const settle = async (h, turns = 10) => {
  let last = -1, quiet = 0;
  for (let i = 0; i < 300 && quiet < turns; i += 1) {
    await new Promise((r) => setTimeout(r, 20));
    if (h.calls.length === last) quiet += 1; else { quiet = 0; last = h.calls.length; }
  }
};

const statefulBackend = (faults = {}) => {
  let stored = "Plain Title";
  return (e) => {
    if (e.url.includes("/api/auth/session")) return faults.session || { body: { accessToken: "tok" } };
    if (e.method === "PATCH") {
      if (faults.patch) return faults.patch;
      try { stored = JSON.parse(e.body || "{}").title || stored; } catch {}
      return { body: { title: stored } };
    }
    return faults.get || { body: { title: stored } };
  };
};

const results = [];
const check = async (name, fn) => { await fn(); results.push(name); };

await check("Title reaches the backend through the authority", async () => {
  const h = boot({ responder: statefulBackend() });
  assert.ok(h.authority, "authority must be published");
  assert.ok(h.title, "Title must be published");
  await settle(h); h.reset();
  const r = await h.title.setEmojiAndPersist(CHAT, "🚲", { chatId: CHAT, userInitiated: true, source: "user-picker" });
  await settle(h, 6);
  assert.strictEqual(r.status, "persisted-confirmed", `expected confirmation, got ${r.status}`);
  assert.ok(h.calls.some((c) => c.method === "PATCH"), "a rename must have been submitted");
  assert.strictEqual(h.locks.stats.maxHeld, 1, "all traffic must pass through one lock holder");
  h.dispose();
});

await check("every Title request is serialised by the authority lock", async () => {
  const h = boot({ responder: statefulBackend() });
  await settle(h); h.reset();
  await Promise.all([
    h.title.readNativeTitle ? h.title.readNativeTitle(CHAT) : Promise.resolve(),
    h.title.setEmojiAndPersist(CHAT, "🚲", { chatId: CHAT, userInitiated: true }),
    h.title.setEmojiAndPersist(CHAT, "🎯", { chatId: CHAT, userInitiated: true }),
  ]);
  await settle(h, 6);
  assert.strictEqual(h.locks.stats.maxHeld, 1, `saw ${h.locks.stats.maxHeld} concurrent lock holders`);
  h.dispose();
});

await check("a 429 stops Title and records a shared cooldown", async () => {
  const h = boot({ responder: statefulBackend({ get: { status: 429, headers: { "retry-after": "600" } }, patch: { status: 429, headers: { "retry-after": "600" } } }) });
  await settle(h); h.reset();
  const r = await h.title.setEmojiAndPersist(CHAT, "🚲", { chatId: CHAT, userInitiated: true });
  await settle(h, 6);
  assert.ok(["rate-limited-cooldown", "persistence-unconfirmed"].includes(r.status) || r.rateLimited,
    `expected a rate-limited outcome, got ${r.status}`);
  assert.ok(h.authority.cooldownRemainingMs() > 590000, "the server deadline must be recorded");
  const before = h.calls.length;
  await h.title.setEmojiAndPersist(CHAT, "🎯", { chatId: CHAT, userInitiated: true });
  await settle(h, 6);
  assert.strictEqual(h.calls.length, before, `cooldown leaked ${h.calls.length - before} requests`);
  assert.ok(h.store["h2o:backend-authority:cooldown:v1"], "cooldown must be persisted for other tabs");
  h.dispose();
});

/* The point of the extraction: with no authority, Title must stop rather than
   fall back to a private request that would leave the serialization domain. */
await check("Title fails closed when the authority is absent", async () => {
  const h = boot({ responder: statefulBackend(), withAuthority: false });
  assert.strictEqual(h.authority, null, "no authority should be published");
  await settle(h); h.reset();
  const r = await h.title.setEmojiAndPersist(CHAT, "🚲", { chatId: CHAT, userInitiated: true });
  await settle(h, 6);
  assert.strictEqual(h.calls.length, 0, `Title issued ${h.calls.length} ungoverned request(s)`);
  assert.ok(r.status !== "persisted-confirmed", "it must not report success");
  h.dispose();
});

await check("one session request serves a whole Title operation", async () => {
  const h = boot({ responder: statefulBackend() });
  await settle(h); h.reset();
  await h.title.setEmojiAndPersist(CHAT, "🚲", { chatId: CHAT, userInitiated: true });
  await settle(h, 6);
  const sessions = h.calls.filter((c) => c.url.includes("/api/auth/session")).length;
  assert.strictEqual(sessions, 0, `token was already cached at boot; saw ${sessions} extra session requests`);
  h.dispose();
});

console.log(`PASS validate-title-authority-integration (${results.length} properties)`);
for (const n of results) console.log(`  ✓ ${n}`);
