#!/usr/bin/env node
/* Backend Request Authority — behavioural proof.
 *
 * Loads the REAL 0A4a module into a sandbox and drives it through its public
 * API. Only the network, the clock, storage and the Web Locks manager are
 * synthetic, so the properties below describe code that actually runs.
 *
 * The Web Locks shim is spec-faithful: exclusive mode, FIFO queue, a queued
 * request may be aborted via signal, and the lock releases when the callback's
 * promise settles. Aborting has NO effect once the callback is running — which
 * is exactly why the fetch must consume cancellation separately.
 *
 * NO LIVE NETWORK.
 */

import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const AUTHORITY_REL = "src-runtime-base/0A4a.⬛️🌐 Backend Request Authority 🌐.js";
const PUMP_REL = "src-runtime-base/9D1a.🟤📱 Auto Emoji Title 📱.js";
const AUTHORITY_PATH = process.env.H2O_AUTHORITY_SOURCE || path.join(ROOT, AUTHORITY_REL);
const AUTHORITY_SOURCE = fs.readFileSync(AUTHORITY_PATH, "utf8");
const PUMP_SOURCE = fs.readFileSync(process.env.H2O_PUMP_SOURCE || path.join(ROOT, PUMP_REL), "utf8");

const SUPPORTED_ORIGIN = "https://chatgpt.com";
const CONV = { resource: "conversation", chatId: "abc" };

/* ── spec-faithful Web Locks shim ─────────────────────────────────────── */
function makeLockManager() {
  const queues = new Map();
  const stats = { maxHeld: 0, held: 0, acquisitions: 0 };
  return {
    stats,
    async request(name, options, callback) {
      if (typeof options === "function") { callback = options; options = {}; }
      const signal = options?.signal;
      if (signal?.aborted) throw Object.assign(new Error("aborted"), { name: "AbortError" });
      const queue = queues.get(name) || Promise.resolve();
      let release;
      const held = new Promise((r) => { release = r; });
      queues.set(name, queue.then(() => held));
      let onAbort;
      try {
        await new Promise((resolve, reject) => {
          queue.then(resolve, resolve);
          if (signal) {
            onAbort = () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
            signal.addEventListener("abort", onAbort, { once: true });
          }
        });
      } catch (err) {
        release();
        throw err;
      } finally {
        if (signal && onAbort) signal.removeEventListener("abort", onAbort);
      }
      stats.acquisitions += 1;
      stats.held += 1;
      stats.maxHeld = Math.max(stats.maxHeld, stats.held);
      try {
        return await callback({ name, mode: "exclusive" });
      } finally {
        stats.held -= 1;
        release();
      }
    },
  };
}

/* A manager that never serialises — used only to prove the cooldown merge
   holds even if the lock were absent (defence in depth). */
function makeUnserialisedLockManager() {
  return { stats: { maxHeld: 0 }, async request(name, options, callback) {
    if (typeof options === "function") { callback = options; }
    return callback({ name, mode: "exclusive" });
  } };
}

function makeResponse({ status = 200, body = {}, headers = {} } = {}) {
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v)]));
  const res = {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (n) => (n.toLowerCase() in lower ? lower[n.toLowerCase()] : null) },
    json: async () => body,
  };
  res.clone = () => res;
  return res;
}

/* One sandbox == one tab. Passing the same store to another models a second
   tab in the same profile; passing the same lock manager models the shared
   serialization domain. */
function loadAuthority(store, opts = {}) {
  let clock = opts.clock ?? 1_700_000_000_000;
  const calls = [];
  const locks = opts.locks || makeLockManager();
  let responder = opts.responder || (() => makeResponse({ body: { accessToken: "tok" } }));
  const timers = new Set();

  const localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { if (opts.storageThrows) throw new Error("denied"); store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };

  const RealDate = Date;
  const ClockDate = new Proxy(RealDate, {
    get(t, p) { return p === "now" ? () => clock : Reflect.get(t, p); },
    construct(t, a) { return a.length ? new t(...a) : new t(clock); },
  });

  const W = {
    location: { origin: opts.origin ?? SUPPORTED_ORIGIN, pathname: "/", href: `${opts.origin ?? SUPPORTED_ORIGIN}/` },
    navigator: opts.noLocks ? {} : { locks },
    fetch: opts.noFetch ? undefined : async (url, init) => {
      const entry = { url: String(url), method: (init?.method || "GET").toUpperCase(), body: init?.body ?? null, at: clock };
      calls.push(entry);
      const signal = init?.signal;
      const spec = responder(entry, calls);
      if (spec?.hang) {
        // Never settles on its own; only cancellation ends it.
        return new Promise((_, reject) => {
          if (signal?.aborted) return reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
          signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })), { once: true });
        });
      }
      if (spec?.throw) throw Object.assign(new Error(spec.throw), spec.throw === "aborted" ? { name: "AbortError" } : {});
      // An explicit gate makes completion ordering deterministic. Relying on
      // timer races instead let a test pass whether or not the behaviour under
      // test was present.
      if (spec?.gate) await spec.gate;
      if (spec?.delayMs) {
        await new Promise((resolve, reject) => {
          const t = setTimeout(resolve, 1);
          signal?.addEventListener("abort", () => { clearTimeout(t); reject(Object.assign(new Error("aborted"), { name: "AbortError" })); }, { once: true });
        });
      }
      /* Responders may return either a plain spec or an already-built
         response. Re-wrapping a built one would destructure its live headers
         object into nothing and silently drop Retry-After, so detect it. */
      return typeof spec?.headers?.get === "function" ? spec : makeResponse(spec);
    },
    /* Pacing waits are collapsed so tests stay fast, but long deadlines are
       left alone: clamping the 30s operation timeout too would fire it during
       every test and mislabel ordinary aborts as timeouts. */
    setTimeout: (fn, ms) => {
      const raw = Number(ms) || 0;
      const t = setTimeout(fn, raw >= 10000 ? raw : Math.min(raw, 5));
      timers.add(t);
      return t;
    },
    clearTimeout: (t) => { clearTimeout(t); timers.delete(t); },
  };
  W.H2O = {};

  const sandbox = {
    window: W, unsafeWindow: undefined, localStorage,
    Date: ClockDate, Math: Object.assign(Object.create(Math), { random: () => 0.5 }),
    JSON, Number, String, Boolean, Object, Array, Promise, Error, RegExp, Symbol, Reflect, Proxy,
    AbortController, isNaN, parseInt, parseFloat,
    setTimeout, clearTimeout,
    console: { log() {}, warn() {}, error() {} },
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(AUTHORITY_SOURCE, { filename: "0A4a.js" }).runInContext(sandbox);

  return {
    api: W.H2O.BackendAuthority || null,
    calls, store, locks,
    setResponder: (fn) => { responder = fn; },
    advance: (ms) => { clock += ms; },
    clockNow: () => clock,
    pendingTimers: () => timers.size,
    reset: () => { calls.length = 0; },
  };
}

const tallySession = (calls) => calls.filter((c) => c.url.includes("/api/auth/session")).length;
const tallyConv = (calls) => calls.filter((c) => c.url.includes("/backend-api/")).length;

const results = [];
const check = async (name, fn) => { await fn(); results.push(name); };

const okBackend = (e) => (e.url.includes("/api/auth/session")
  ? makeResponse({ body: { accessToken: "tok" } })
  : makeResponse({ body: { title: "t" } }));
const conv429 = (retryAfter) => (e) => (e.url.includes("/api/auth/session")
  ? makeResponse({ body: { accessToken: "tok" } })
  : makeResponse({ status: 429, headers: retryAfter != null ? { "retry-after": String(retryAfter) } : {} }));

/* ══ 1–10: governor semantics, preserved through the extraction ══════════ */

await check("429 is not classified transient", async () => {
  const a = loadAuthority({});
  assert.strictEqual(a.api.isTransient({ statusCode: 429 }), false, "429 must not be transient");
  assert.strictEqual(a.api.isTransient({ status: "rate-limited-cooldown" }), false);
  assert.strictEqual(a.api.isTransient({ rateLimited: true }), false);
  assert.strictEqual(a.api.isTransient({ aborted: true }), false, "abort is not transient");
  assert.strictEqual(a.api.isTransient({ timedOut: true }), false, "timeout is not transient");
  // Genuinely transient conditions must still be retryable, or the fix would
  // have traded a retry storm for giving up on a dropped connection.
  assert.strictEqual(a.api.isTransient({ status: "network-error" }), true);
  assert.strictEqual(a.api.isTransient({ statusCode: 503 }), true);
  assert.strictEqual(a.api.isRateLimited({ statusCode: 429 }), true);
});

await check("cooldown suppresses all network traffic", async () => {
  const a = loadAuthority({});
  a.setResponder(conv429(null));
  const first = await a.api.request({ ...CONV });
  assert.strictEqual(first.status, "rate-limited-cooldown");
  assert.ok(a.api.cooldownRemainingMs() > 0, "a cooldown must open");
  const before = a.calls.length;
  for (let i = 0; i < 25; i += 1) {
    const r = await a.api.request({ ...CONV });
    assert.strictEqual(r.status, "rate-limited-cooldown");
  }
  assert.strictEqual(a.calls.length, before, `cooldown leaked ${a.calls.length - before} requests`);
});

await check("cooldown survives a reload", async () => {
  const store = {};
  const first = loadAuthority(store);
  first.setResponder(conv429(null));
  await first.api.request({ ...CONV });
  // A fresh sandbox is a fresh page: new closures, same browser storage.
  const reloaded = loadAuthority(store);
  reloaded.setResponder(conv429(null));
  assert.ok(reloaded.api.cooldownRemainingMs() > 0, "reload must inherit the cooldown");
  for (let i = 0; i < 10; i += 1) await reloaded.api.request({ ...CONV });
  assert.strictEqual(reloaded.calls.length, 0, "a reloaded page must issue nothing during cooldown");
});

await check("Retry-After is honoured", async () => {
  const a = loadAuthority({});
  a.setResponder(conv429(120));
  await a.api.request({ ...CONV });
  const remaining = a.api.cooldownRemainingMs();
  assert.ok(remaining > 110000 && remaining <= 120000, `delta-seconds ignored (${remaining}ms)`);

  const b = loadAuthority({});
  const httpDate = new Date(b.clockNow() + 300000).toUTCString();
  b.setResponder(conv429(httpDate));
  await b.api.request({ ...CONV });
  const bRemaining = b.api.cooldownRemainingMs();
  assert.ok(bRemaining > 290000 && bRemaining <= 300000, `HTTP-date ignored (${bRemaining}ms)`);
});

await check("backoff escalates and escalation persists past expiry", async () => {
  const a = loadAuthority({});
  a.setResponder(conv429(null));
  await a.api.request({ ...CONV });
  const first = a.api.cooldownRemainingMs();
  a.advance(first + 1);
  assert.strictEqual(a.api.cooldownRemainingMs(), 0, "cooldown must expire on its own");
  await a.api.request({ ...CONV });
  const second = a.api.cooldownRemainingMs();
  assert.ok(second > first, `second wait (${second}) must exceed the first (${first})`);
  a.advance(second + 1);
  await a.api.request({ ...CONV });
  assert.ok(a.api.cooldownRemainingMs() > second, "escalation must continue");
});

await check("success clears the cooldown", async () => {
  const a = loadAuthority({});
  a.setResponder(conv429(30));
  await a.api.request({ ...CONV });
  const wait = a.api.cooldownRemainingMs();
  assert.ok(wait > 0);
  a.advance(wait + 1);
  a.setResponder(okBackend);
  const r = await a.api.request({ ...CONV });
  assert.strictEqual(r.ok, true, "the probe after expiry must be allowed through");
  assert.strictEqual(a.api.cooldownRemainingMs(), 0, "success must clear the cooldown");
});

await check("access token is cached across calls", async () => {
  const a = loadAuthority({});
  a.setResponder(okBackend);
  for (let i = 0; i < 8; i += 1) { await a.api.request({ ...CONV }); a.advance(400); }
  assert.strictEqual(tallySession(a.calls), 1, `session hit ${tallySession(a.calls)}x for 8 operations; expected 1`);
  assert.strictEqual(tallyConv(a.calls), 8, "every operation must still reach the backend");
});

await check("concurrent operations share one session request", async () => {
  const a = loadAuthority({});
  a.setResponder(okBackend);
  await Promise.all(Array.from({ length: 6 }, () => a.api.request({ ...CONV })));
  assert.strictEqual(tallySession(a.calls), 1, `in-flight dedupe failed: ${tallySession(a.calls)} session requests`);
});

await check("requests are serialised by the lock", async () => {
  const a = loadAuthority({});
  a.setResponder((e) => (e.url.includes("session") ? makeResponse({ body: { accessToken: "tok" } }) : makeResponse({ body: {}, delayMs: 1 })));
  await Promise.all(Array.from({ length: 10 }, () => a.api.request({ ...CONV })));
  assert.strictEqual(a.locks.stats.maxHeld, 1, `expected 1 lock holder, saw ${a.locks.stats.maxHeld}`);
});

await check("queued requests abort once a limit opens mid-burst", async () => {
  const a = loadAuthority({});
  let n = 0;
  a.setResponder((e) => {
    if (e.url.includes("session")) return makeResponse({ body: { accessToken: "tok" } });
    n += 1;
    return n === 1 ? makeResponse({ status: 429 }) : makeResponse({ body: {} });
  });
  const outcomes = await Promise.all(Array.from({ length: 12 }, () => a.api.request({ ...CONV })));
  assert.strictEqual(tallyConv(a.calls), 1, `queue drained ${tallyConv(a.calls)} backend requests after a 429`);
  assert.strictEqual(outcomes.filter((o) => o.status === "rate-limited-cooldown").length, 12);
});

/* ══ 11–14: cooldown merge + entitlement (defence in depth) ═════════════
   Driven through an unserialised lock manager so the merge is proven on its
   own. Under the real lock these writes cannot interleave, but the merge must
   not depend on that. */

/* Both tabs must be in flight together: with the cooldown gate, a sequential
   second caller short-circuits before it can write, which would make these
   assertions pass without exercising the merge at all. Firing concurrently
   through an unserialised manager reproduces the genuine interleaving — both
   read cooldown 0, both receive a 429, both write. */
await check("a later writer never shortens a server deadline", async () => {
  const store = {};
  const locks = makeUnserialisedLockManager();
  const a = loadAuthority(store, { locks });
  const b = loadAuthority(store, { locks });
  a.setResponder(conv429(600));         // server: wait 600s
  b.setResponder(conv429(null));        // stale tab: local fallback (~30s)
  await Promise.all([a.api.request({ ...CONV }), b.api.request({ ...CONV })]);
  const merged = a.api.cooldownRemainingMs();
  assert.ok(merged > 590000, `a fallback writer shortened the server deadline to ${merged}ms`);

  // And a shorter *server* value must not pull it in either.
  const store2 = {};
  const locks2 = makeUnserialisedLockManager();
  const c = loadAuthority(store2, { locks: locks2 });
  const d = loadAuthority(store2, { locks: locks2 });
  c.setResponder(conv429(900));
  d.setResponder(conv429(60));
  await Promise.all([c.api.request({ ...CONV }), d.api.request({ ...CONV })]);
  assert.ok(c.api.cooldownRemainingMs() > 890000,
    `a shorter server value shortened the cooldown to ${c.api.cooldownRemainingMs()}ms`);
});

await check("server and local cooldowns are tracked separately", async () => {
  const store = {};
  const locks = makeUnserialisedLockManager();
  const a = loadAuthority(store, { locks });
  const b = loadAuthority(store, { locks });
  a.setResponder(conv429(600));         // records serverUntil
  b.setResponder(conv429(null));        // records localUntil
  await Promise.all([a.api.request({ ...CONV }), b.api.request({ ...CONV })]);
  const rec = JSON.parse(store["h2o:backend-authority:cooldown:v1"]);
  assert.ok(rec.serverUntil > 0 && rec.localUntil > 0,
    `both deadlines must be retained (got ${JSON.stringify(rec)})`);
  assert.ok(rec.serverUntil > rec.localUntil, "effective deadline must be the later one");
});

/* The gate is the first line of defence: while a cooldown is active a second
   caller must not reach the network at all, so the merge above is depth, not
   the only protection. */
await check("the cooldown gate blocks a second writer outright", async () => {
  const store = {};
  const locks = makeUnserialisedLockManager();
  const a = loadAuthority(store, { locks });
  const b = loadAuthority(store, { locks });
  a.setResponder(conv429(600));
  b.setResponder(conv429(null));
  await a.api.request({ ...CONV });
  const before = a.api.cooldownRemainingMs();
  const r = await b.api.request({ ...CONV });
  assert.strictEqual(r.status, "rate-limited-cooldown", "the second tab must be gated");
  assert.strictEqual(b.calls.length, 0, "the gated tab must issue nothing");
  assert.ok(a.api.cooldownRemainingMs() >= before - 5, "and must not disturb the deadline");
});

await check("large valid Retry-After is preserved uncapped", async () => {
  const a = loadAuthority({});
  a.setResponder(conv429(86400));
  await a.api.request({ ...CONV });
  assert.ok(a.api.cooldownRemainingMs() > 86_000_000, `24h server deadline was clamped to ${a.api.cooldownRemainingMs()}ms`);
});

await check("an unentitled success cannot clear an active cooldown", async () => {
  const store = {};
  const locks = makeUnserialisedLockManager();
  const a = loadAuthority(store, { locks });
  const b = loadAuthority(store, { locks });
  /* Ordering must be forced, not raced: b's request has to still be in flight
     when a records the limit, and must land afterwards. Without the gate this
     passed whether or not entitlement was implemented. */
  let release;
  const gate = new Promise((r) => { release = r; });
  b.setResponder((e) => (e.url.includes("session")
    ? { body: { accessToken: "tok" } }
    : { body: {}, gate }));
  const inflight = b.api.request({ ...CONV });
  await new Promise((r) => setTimeout(r, 5));      // let b reach its fetch

  a.setResponder(conv429(600));
  await a.api.request({ ...CONV });
  const before = a.api.cooldownRemainingMs();
  assert.ok(before > 590000, "the server deadline must be recorded first");

  release();                                        // b's success lands now
  await inflight;
  assert.ok(a.api.cooldownRemainingMs() >= before - 50,
    `an in-flight success cleared an active cooldown (${before} -> ${a.api.cooldownRemainingMs()})`);
});

/* ══ 15–16: auth recovery ══════════════════════════════════════════════ */

await check("401 recovers with exactly one refresh and one retry", async () => {
  const a = loadAuthority({});
  let issued = 0;
  a.setResponder((e) => {
    if (e.url.includes("/api/auth/session")) { issued += 1; return makeResponse({ body: { accessToken: `tok-${issued}` } }); }
    const auth = e.body === null ? null : null;
    return issued <= 1 ? makeResponse({ status: 401 }) : makeResponse({ body: { title: "t" } });
  });
  const r = await a.api.request({ ...CONV });
  assert.strictEqual(r.ok, true, `401 did not recover (${r.status})`);
  assert.strictEqual(tallySession(a.calls), 2, `expected 1 refresh, saw ${tallySession(a.calls) - 1}`);
  assert.strictEqual(tallyConv(a.calls), 2, "exactly one retry");
});

await check("persistent 401 fails closed; 403 never refreshes", async () => {
  const a = loadAuthority({});
  a.setResponder((e) => (e.url.includes("session") ? makeResponse({ body: { accessToken: "t" } }) : makeResponse({ status: 401 })));
  const r = await a.api.request({ ...CONV });
  assert.strictEqual(r.status, "unauthorized-failed-closed", "persistent 401 must fail closed");
  assert.strictEqual(tallyConv(a.calls), 2, `401 must not loop (saw ${tallyConv(a.calls)} attempts)`);

  const b = loadAuthority({});
  b.setResponder((e) => (e.url.includes("session") ? makeResponse({ body: { accessToken: "t" } }) : makeResponse({ status: 403 })));
  const rb = await b.api.request({ ...CONV });
  assert.strictEqual(rb.status, "forbidden-failed-closed");
  assert.strictEqual(tallySession(b.calls), 1, "403 must not trigger a token refresh");
  assert.strictEqual(tallyConv(b.calls), 1, "403 must not retry");
});

/* ══ 17–23: cancellation, timeout, fail-closed, origin ═════════════════ */

await check("abort while waiting for the lock issues nothing", async () => {
  const a = loadAuthority({});
  a.setResponder((e) => (e.url.includes("session") ? makeResponse({ body: { accessToken: "t" } }) : makeResponse({ body: {}, delayMs: 1 })));
  const holder = a.api.request({ ...CONV });
  const ctrl = new AbortController();
  const waiter = a.api.request({ ...CONV, signal: ctrl.signal });
  ctrl.abort();
  const [, w] = await Promise.all([holder, waiter]);
  assert.strictEqual(w.status, "aborted", "aborted waiter must report abort");
  assert.strictEqual(w.beforeAcquire, true, "must never have entered the critical section");
  assert.strictEqual(tallyConv(a.calls), 1, "only the holder may reach the network");
});

await check("abort during the fetch releases the lock and opens no cooldown", async () => {
  const a = loadAuthority({});
  a.setResponder((e) => (e.url.includes("session") ? makeResponse({ body: { accessToken: "t" } }) : { hang: true }));
  const ctrl = new AbortController();
  const p = a.api.request({ ...CONV, signal: ctrl.signal });
  await new Promise((r) => setTimeout(r, 15));
  ctrl.abort();
  const r = await p;
  assert.strictEqual(r.status, "aborted");
  assert.strictEqual(a.api.cooldownRemainingMs(), 0, "abort must not open a cooldown");
  assert.strictEqual(a.locks.stats.held, 0, "the lock must be released");
});

await check("abort during the pacing wait issues nothing", async () => {
  const store = {};
  const a = loadAuthority(store);
  a.setResponder(okBackend);
  await a.api.request({ ...CONV });      // establishes lastRequestAt
  a.reset();
  const ctrl = new AbortController();
  const p = a.api.request({ ...CONV, background: true, signal: ctrl.signal });
  ctrl.abort();
  const r = await p;
  assert.ok(r.status === "aborted", `expected abort, got ${r.status}`);
  assert.strictEqual(tallyConv(a.calls), 0, "no backend request may be issued");
});

await check("next holder acquires after an aborted holder exits", async () => {
  const a = loadAuthority({});
  a.setResponder((e) => (e.url.includes("session") ? makeResponse({ body: { accessToken: "t" } }) : { hang: true }));
  const ctrl = new AbortController();
  const aborting = a.api.request({ ...CONV, signal: ctrl.signal });
  await new Promise((r) => setTimeout(r, 10));
  ctrl.abort();
  await aborting;
  a.setResponder(okBackend);
  a.advance(5000);
  const next = await a.api.request({ ...CONV });
  assert.strictEqual(next.ok, true, "a later holder must proceed");
});

await check("a hung request times out, releases the lock, and is not a 429", async () => {
  const a = loadAuthority({});
  a.setResponder((e) => (e.url.includes("session") ? makeResponse({ body: { accessToken: "t" } }) : { hang: true }));
  const r = await a.api.request({ ...CONV, timeoutMs: 20 });
  assert.strictEqual(r.status, "timeout", `expected timeout, got ${r.status}`);
  assert.strictEqual(r.timedOut, true);
  assert.strictEqual(a.api.cooldownRemainingMs(), 0, "a timeout must not open a cooldown");
  assert.strictEqual(a.api.isRateLimited(r), false, "a timeout is not a rate limit");
  assert.strictEqual(a.api.isTransient(r), false, "a timeout must not be retried as transient");
  assert.strictEqual(a.locks.stats.held, 0, "the lock must be released after a timeout");

  a.setResponder(okBackend);
  a.advance(5000);
  const next = await a.api.request({ ...CONV });
  assert.strictEqual(next.ok, true, "a queued tab must proceed after a timeout");
  assert.strictEqual(a.pendingTimers(), 0, "operation timers must not leak");
});

await check("fails closed when a correctness dependency is missing", async () => {
  for (const [label, opts] of [
    ["web locks unavailable", { noLocks: true }],
    ["storage unavailable", { storageThrows: true }],
    ["fetch unavailable", { noFetch: true }],
  ]) {
    const a = loadAuthority({}, opts);
    const r = await a.api.request({ ...CONV });
    assert.strictEqual(r.status, "authority-unavailable", `${label}: expected fail-closed, got ${r.status}`);
    assert.strictEqual(a.calls.length, 0, `${label}: no request may be issued`);
    assert.strictEqual(a.api.status().available, false, `${label}: status must report unavailable`);
  }
});

await check("fails closed outside the supported origin", async () => {
  for (const origin of ["https://chat.openai.com", "https://evil.example", "https://sub.chatgpt.com"]) {
    const a = loadAuthority({}, { origin });
    const r = await a.api.request({ ...CONV });
    assert.strictEqual(r.status, "authority-unavailable", `${origin} must fail closed`);
    assert.strictEqual(r.reason, "unsupported-origin");
    assert.strictEqual(a.calls.length, 0, `${origin}: no request may be issued`);
  }
  const good = loadAuthority({}, { origin: SUPPORTED_ORIGIN });
  assert.strictEqual(good.api.status().available, true, "the supported origin must work");
  assert.strictEqual(good.api.status().lockName, "h2o.backend-authority.chatgpt.v1");
});

/* ══ 24: cross-tab serialization through one shared lock ═══════════════ */

await check("separate tabs share one serialization domain", async () => {
  const store = {};
  const locks = makeLockManager();          // one lock manager == one profile
  const tabs = [loadAuthority(store, { locks }), loadAuthority(store, { locks }), loadAuthority(store, { locks })];
  for (const t of tabs) {
    t.setResponder((e) => (e.url.includes("session") ? makeResponse({ body: { accessToken: "t" } }) : makeResponse({ body: {}, delayMs: 1 })));
  }
  await Promise.all(tabs.flatMap((t) => [t.api.request({ ...CONV }), t.api.request({ ...CONV })]));
  assert.strictEqual(locks.stats.maxHeld, 1, `three tabs produced ${locks.stats.maxHeld} concurrent holders`);
  assert.ok(locks.stats.acquisitions >= 6, "every request must pass through the lock");
});

await check("pacing state is shared across tabs, not per tab", async () => {
  const store = {};
  const locks = makeLockManager();
  const a = loadAuthority(store, { locks });
  const b = loadAuthority(store, { locks });
  a.setResponder(okBackend); b.setResponder(okBackend);
  await a.api.request({ ...CONV });
  const recorded = JSON.parse(store["h2o:backend-authority:pacing:v1"] || "{}").lastRequestAt;
  assert.ok(recorded > 0, "pacing state must be persisted, not held in a module variable");
  await b.api.request({ ...CONV });
  const updated = JSON.parse(store["h2o:backend-authority:pacing:v1"]).lastRequestAt;
  assert.ok(updated >= recorded, "the second tab must observe and update shared pacing state");
});

/* ══ 25–26: the Auto Emoji pump still yields under rate limiting ═══════ */

await check("Auto Emoji pump pauses under rate limiting", async () => {
  const start = PUMP_SOURCE.indexOf("let backendPauseUntil");
  assert.notStrictEqual(start, -1, "pump pause state absent from 9D1a");
  const end = PUMP_SOURCE.indexOf("function applyNativeAutoEmoji(", start);
  assert.notStrictEqual(end, -1, "pump pause helpers not adjacent to applyNativeAutoEmoji");
  const pumpSrc = PUMP_SOURCE.slice(start, end);
  for (const needle of ["function isBackendRateLimited(", "function noteBackendPause(", "function backendPauseActive("]) {
    assert.ok(pumpSrc.includes(needle), `pump slice missing ${needle}`);
  }
  const sandbox = { Date, Number, Math, __exports: {} };
  vm.createContext(sandbox);
  new vm.Script(`${pumpSrc}\n Object.assign(__exports, { isBackendRateLimited, noteBackendPause, backendPauseActive,
    pauseUntil: () => backendPauseUntil });`).runInContext(sandbox);
  const pump = sandbox.__exports;
  assert.strictEqual(pump.backendPauseActive(), false);
  assert.strictEqual(pump.isBackendRateLimited({ status: "rate-limited-cooldown" }), true);
  assert.strictEqual(pump.isBackendRateLimited({ status: "backend-500" }), false, "a 5xx is not a rate limit");
  pump.noteBackendPause({ rateLimited: true, retryAfterMs: 45000 });
  const deadline = pump.pauseUntil();
  assert.ok(deadline > Date.now() + 40000);
  pump.noteBackendPause({ rateLimited: true, retryAfterMs: 1000 });
  assert.strictEqual(pump.pauseUntil(), deadline, "a shorter retry-after must not cut the pause short");
  pump.noteBackendPause({ rateLimited: true, retryAfterMs: 300000 });
  assert.ok(pump.pauseUntil() > deadline, "a longer retry-after must extend the pause");
});

await check("pump gates automatic renames but not user actions", async () => {
  const guard = "if (backendPauseActive() && options.userInitiated !== true) return false;";
  assert.ok(PUMP_SOURCE.includes(guard), "applyNativeAutoEmoji must consult the pause");
  const guardAt = PUMP_SOURCE.indexOf(guard);
  assert.ok(guardAt > PUMP_SOURCE.indexOf("function applyNativeAutoEmoji("), "guard must sit inside the function");
  const rateBranch = PUMP_SOURCE.indexOf("if (isBackendRateLimited(result)) {");
  const counterBump = PUMP_SOURCE.indexOf("runtimeNativeRenameAttempts[chatId] = (runtimeNativeRenameAttempts[chatId] || 0) + 1;", rateBranch);
  assert.ok(rateBranch !== -1 && counterBump > rateBranch, "rate-limit branch must precede the attempt counter");
  assert.ok(PUMP_SOURCE.slice(rateBranch, counterBump).includes("return;"),
    "rate-limit branch must return before spending the rename budget");
});

console.log(`PASS validate-backend-rate-limit-governor (${results.length} properties)`);
for (const name of results) console.log(`  ✓ ${name}`);
