#!/usr/bin/env node
/* Backend rate-limit governor — behavioural proof.

   This validator does not re-implement the governor. It slices the real source
   out of 9B0a and runs it in a sandbox that supplies only ambient dependencies
   (clock, string normaliser, delay, window, localStorage). If the source is
   reshaped so the slice markers no longer resolve, extraction fails loudly
   rather than silently proving nothing about code that is no longer there.

   The property that matters most is the last one: a cooldown recorded by one
   page instance must still be in force for the next, because every guard that
   lived only in memory was reset by the reload that a rate-limited user
   naturally reaches for. */

import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const SOURCE_REL = "src-runtime-base/9B0a.🟤🏷️ Chat Title State 🏷️.js";
/* Overridable so the suite can be mutation-tested against a deliberately
   broken copy, proving these assertions can actually fail. Unset in normal
   runs, where the real owner is the subject. */
const SOURCE_PATH = process.env.H2O_GOVERNOR_SOURCE || path.join(ROOT, SOURCE_REL);
const SOURCE = fs.readFileSync(SOURCE_PATH, "utf8");

function slice(startMarker, endMarker, label) {
  const start = SOURCE.indexOf(startMarker);
  assert.notStrictEqual(start, -1, `extraction failed: ${label} start marker absent (${startMarker})`);
  const end = SOURCE.indexOf(endMarker, start);
  assert.notStrictEqual(end, -1, `extraction failed: ${label} end marker absent (${endMarker})`);
  const text = SOURCE.slice(start, end);
  assert.ok(text.length > 200, `extraction failed: ${label} slice implausibly small`);
  return text;
}

const GOVERNOR_SRC = slice("const BACKEND_COOLDOWN_KEY", "function nativeConversationHeaders(", "governor");
const CLASSIFIER_SRC = slice("function isRateLimitedFailure(", "function delay(ms)", "classifiers");

/* Extraction sanity: the slices must actually contain the machinery under
   test, so a future refactor that moves a piece elsewhere fails here. */
for (const needle of [
  "function governedFetch(",
  "function noteBackendRateLimited(",
  "function backendCooldownRemainingMs(",
  "function parseRetryAfterMs(",
  "function readChatGptAccessToken(",
  "localStorage.setItem(BACKEND_COOLDOWN_KEY",
]) {
  assert.ok(GOVERNOR_SRC.includes(needle), `governor slice is missing ${needle}`);
}
assert.ok(CLASSIFIER_SRC.includes("function isTransientNativeFailure("), "classifier slice incomplete");

function makeResponse({ status = 200, body = {}, headers = {} } = {}) {
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v)]));
  const res = {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (name) => (name.toLowerCase() in lower ? lower[name.toLowerCase()] : null) },
    json: async () => body,
  };
  res.clone = () => res;
  return res;
}

/* One sandbox == one page instance. Passing the same store to a second
   sandbox is how a reload is modelled. */
function makeInstance(store, script) {
  let clock = 1_700_000_000_000;
  const calls = [];
  let inFlight = 0;
  let maxInFlight = 0;
  let responder = () => makeResponse({ body: { title: "ok" } });

  const localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };

  const W = {
    fetch: async (url, init) => {
      calls.push({ url, method: init?.method || "GET", at: clock });
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      try {
        return responder(url, init, calls.length);
      } finally {
        inFlight -= 1;
      }
    },
    setTimeout: (fn, ms) => { clock += Number(ms) || 0; return setTimeout(fn, 0); },
  };

  const sandbox = {
    W,
    localStorage,
    // Math's methods are non-enumerable, so a spread would silently produce an
    // object with nothing on it. Derive from the real Math and override only
    // random, keeping the jitter deterministic.
    Math: Object.assign(Object.create(Math), { random: () => 0.5 }),
    JSON,
    Number,
    String,
    Date,
    Promise,
    now: () => clock,
    norm: (v) => String(v || "").replace(/[\s ]+/g, " ").trim(),
    delay: (ms) => new Promise((r) => { clock += Number(ms) || 0; setTimeout(r, 0); }),
    __exports: {},
  };
  vm.createContext(sandbox);
  new vm.Script(`${script}\n Object.assign(__exports, {
    governedFetch, backendCooldownRemainingMs, readChatGptAccessToken,
    noteBackendSuccess, noteBackendRateLimited, backendRateLimitedResult, parseRetryAfterMs,
    isTransientNativeFailure, isRateLimitedFailure, readBackendCooldownRecord });`).runInContext(sandbox);

  return {
    api: sandbox.__exports,
    calls,
    setResponder: (fn) => { responder = fn; },
    advance: (ms) => { clock += ms; },
    clockNow: () => clock,
    maxInFlight: () => maxInFlight,
  };
}

const SCRIPT = `${GOVERNOR_SRC}\n${CLASSIFIER_SRC}\n`;
const results = [];
const check = async (name, fn) => {
  await fn();
  results.push(name);
};

/* 1 — 429 is not a transient failure. This single misclassification is what
   authorised every retry layer above it. */
await check("429 is not classified transient", async () => {
  const store = {};
  const { api } = makeInstance(store, SCRIPT);
  assert.strictEqual(api.isTransientNativeFailure({ statusCode: 429 }), false, "429 must not be transient");
  assert.strictEqual(api.isTransientNativeFailure({ status: "rate-limited-cooldown" }), false, "cooldown must not be transient");
  assert.strictEqual(api.isTransientNativeFailure({ rateLimited: true }), false, "rateLimited flag must not be transient");
  // Genuinely transient conditions must still retry, or the fix would have
  // traded a retry storm for a runtime that gives up on a dropped connection.
  assert.strictEqual(api.isTransientNativeFailure({ status: "network-error" }), true, "network errors stay transient");
  assert.strictEqual(api.isTransientNativeFailure({ statusCode: 503 }), true, "5xx stays transient");
  assert.strictEqual(api.isRateLimitedFailure({ statusCode: 429 }), true, "429 is rate limited");
});

/* 2 — a 429 opens a cooldown, and while it is open no request is issued. */
await check("cooldown suppresses all network traffic", async () => {
  const store = {};
  const inst = makeInstance(store, SCRIPT);
  inst.setResponder(() => makeResponse({ status: 429 }));

  const first = await inst.api.governedFetch("/backend-api/conversation/abc", { method: "GET" });
  assert.strictEqual(first.rateLimited, true, "429 must report rateLimited");
  assert.strictEqual(inst.calls.length, 1, "the first request does reach the network");
  assert.ok(inst.api.backendCooldownRemainingMs() > 0, "a cooldown must be open after a 429");

  for (let i = 0; i < 25; i += 1) {
    const outcome = await inst.api.governedFetch("/backend-api/conversation/abc", { method: "GET" });
    assert.strictEqual(outcome.rateLimited, true, "calls during cooldown must report rate limited");
    assert.strictEqual(outcome.res, null, "no response exists when no request was sent");
  }
  assert.strictEqual(inst.calls.length, 1, `cooldown leaked ${inst.calls.length - 1} requests`);
});

/* 3 — THE recurrence fix: the cooldown outlives the page. */
await check("cooldown survives a reload", async () => {
  const store = {};
  const first = makeInstance(store, SCRIPT);
  first.setResponder(() => makeResponse({ status: 429 }));
  await first.api.governedFetch("/backend-api/conversation/abc", { method: "GET" });
  assert.strictEqual(first.calls.length, 1);

  // A fresh sandbox is a fresh page: new closures, new in-memory guards, same
  // browser storage. Before this fix every guard was in memory, so a reload
  // resumed at full rate.
  const reloaded = makeInstance(store, SCRIPT);
  reloaded.setResponder(() => makeResponse({ status: 429 }));
  assert.ok(reloaded.api.backendCooldownRemainingMs() > 0, "reload must inherit the cooldown");
  for (let i = 0; i < 10; i += 1) {
    await reloaded.api.governedFetch("/backend-api/conversation/abc", { method: "GET" });
  }
  assert.strictEqual(reloaded.calls.length, 0, "a reloaded page must issue no requests during cooldown");
});

/* 4 — Retry-After is obeyed, in both permitted encodings. */
await check("Retry-After is honoured", async () => {
  const store = {};
  const inst = makeInstance(store, SCRIPT);
  inst.setResponder(() => makeResponse({ status: 429, headers: { "retry-after": "120" } }));
  await inst.api.governedFetch("/backend-api/conversation/abc", { method: "GET" });
  const remaining = inst.api.backendCooldownRemainingMs();
  assert.ok(remaining > 110000 && remaining <= 120000, `delta-seconds ignored (got ${remaining}ms)`);

  const dateStore = {};
  const dated = makeInstance(dateStore, SCRIPT);
  const httpDate = new Date(dated.clockNow() + 300000).toUTCString();
  dated.setResponder(() => makeResponse({ status: 429, headers: { "retry-after": httpDate } }));
  await dated.api.governedFetch("/backend-api/conversation/abc", { method: "GET" });
  const datedRemaining = dated.api.backendCooldownRemainingMs();
  assert.ok(datedRemaining > 290000 && datedRemaining <= 300000, `HTTP-date ignored (got ${datedRemaining}ms)`);
});

/* 5 — consecutive limits escalate, and escalation is not forgotten merely
   because a wait expired. */
await check("backoff escalates and escalation persists past expiry", async () => {
  const store = {};
  const inst = makeInstance(store, SCRIPT);
  inst.setResponder(() => makeResponse({ status: 429 }));

  await inst.api.governedFetch("/x", { method: "GET" });
  const firstWait = inst.api.backendCooldownRemainingMs();

  inst.advance(firstWait + 1);
  assert.strictEqual(inst.api.backendCooldownRemainingMs(), 0, "cooldown must expire on its own");
  await inst.api.governedFetch("/x", { method: "GET" });
  const secondWait = inst.api.backendCooldownRemainingMs();
  assert.ok(secondWait > firstWait, `second wait (${secondWait}) must exceed the first (${firstWait})`);

  inst.advance(secondWait + 1);
  await inst.api.governedFetch("/x", { method: "GET" });
  assert.ok(inst.api.backendCooldownRemainingMs() > secondWait, "third wait must continue escalating");
  assert.strictEqual(inst.api.readBackendCooldownRecord().consecutive, 3, "consecutive count must accumulate");
});

/* 6 — a success clears the cooldown, so recovery is immediate once the
   account is healthy again. */
await check("success clears the cooldown", async () => {
  const store = {};
  const inst = makeInstance(store, SCRIPT);
  inst.setResponder((url, init, n) => (n === 1 ? makeResponse({ status: 429 }) : makeResponse({ body: { title: "t" } })));
  await inst.api.governedFetch("/x", { method: "GET" });
  const wait = inst.api.backendCooldownRemainingMs();
  assert.ok(wait > 0);
  inst.advance(wait + 1);
  const ok = await inst.api.governedFetch("/x", { method: "GET" });
  assert.strictEqual(ok.rateLimited, false, "the probe after expiry must be allowed through");
  assert.strictEqual(inst.api.backendCooldownRemainingMs(), 0, "success must clear the cooldown");
  assert.strictEqual(inst.api.readBackendCooldownRecord(), null, "success must clear the escalation record too");
});

/* 7 — the access token is cached, removing the ×2 amplification where every
   conversation call first re-fetched the session. */
await check("access token is cached across calls", async () => {
  const store = {};
  const inst = makeInstance(store, SCRIPT);
  inst.setResponder(() => makeResponse({ body: { accessToken: "tok-1" } }));
  const tokens = [];
  for (let i = 0; i < 8; i += 1) tokens.push(await inst.api.readChatGptAccessToken());
  assert.deepStrictEqual([...new Set(tokens)], ["tok-1"], "cached token must stay stable");
  const sessionCalls = inst.calls.filter((c) => c.url === "/api/auth/session").length;
  assert.strictEqual(sessionCalls, 1, `session endpoint hit ${sessionCalls}x for 8 reads; expected 1`);
});

await check("concurrent token reads share one request", async () => {
  const store = {};
  const inst = makeInstance(store, SCRIPT);
  inst.setResponder(() => makeResponse({ body: { accessToken: "tok-2" } }));
  const parallel = await Promise.all(Array.from({ length: 6 }, () => inst.api.readChatGptAccessToken()));
  assert.deepStrictEqual([...new Set(parallel)], ["tok-2"], "all concurrent readers get the same token");
  const sessionCalls = inst.calls.filter((c) => c.url === "/api/auth/session").length;
  assert.strictEqual(sessionCalls, 1, `in-flight dedupe failed: ${sessionCalls} session requests`);
});

/* 8 — requests are serialised, so a burst cannot stack against the endpoint. */
await check("requests are serialised", async () => {
  const store = {};
  const inst = makeInstance(store, SCRIPT);
  inst.setResponder(() => makeResponse({ body: { title: "t" } }));
  await Promise.all(Array.from({ length: 10 }, (_, i) => inst.api.governedFetch(`/x/${i}`, { method: "GET" })));
  assert.strictEqual(inst.maxInFlight(), 1, `expected at most 1 in-flight request, saw ${inst.maxInFlight()}`);
  assert.strictEqual(inst.calls.length, 10, "every queued request should still complete");
});

/* 9 — a burst that meets a limit mid-flight must not drain to the network. */
await check("queued requests abort once a limit opens mid-burst", async () => {
  const store = {};
  const inst = makeInstance(store, SCRIPT);
  inst.setResponder((url, init, n) => (n === 1 ? makeResponse({ status: 429 }) : makeResponse({ body: { title: "t" } })));
  const outcomes = await Promise.all(
    Array.from({ length: 12 }, (_, i) => inst.api.governedFetch(`/backend-api/conversation/${i}`, { method: "GET" })),
  );
  assert.strictEqual(inst.calls.length, 1, `queue drained ${inst.calls.length} requests after a 429`);
  assert.strictEqual(outcomes.filter((o) => o.rateLimited).length, 12, "every queued call must report rate limited");
});

/* ── Cooldown merge semantics ─────────────────────────────────────────
   Several tabs share one stored record. Storing a single merged deadline let
   a tab holding stale state replace a long server deadline with a short
   locally-computed one, so every write must merge rather than replace. */
/* Driven through noteBackendRateLimited directly, because that is what the
   race actually is: two tabs writing the shared record. Going through
   governedFetch could not express it — the second tab short-circuits on the
   cooldown the first one opened and never reaches the write, which would make
   this assertion pass without testing anything. */
const res429 = (retryAfter) => ({
  status: 429,
  headers: { get: (n) => (n.toLowerCase() === "retry-after" && retryAfter != null ? String(retryAfter) : null) },
});

await check("a later writer never shortens a server deadline", async () => {
  const store = {};
  const a = makeInstance(store, SCRIPT);
  const b = makeInstance(store, SCRIPT);            // second tab, same storage

  a.api.noteBackendRateLimited(res429(600));
  const afterServer = a.api.backendCooldownRemainingMs();
  assert.ok(afterServer > 590000, `server deadline not recorded (${afterServer}ms)`);

  b.api.noteBackendRateLimited(res429(null));       // stale tab, local fallback
  const afterFallback = a.api.backendCooldownRemainingMs();
  assert.ok(afterFallback >= afterServer, `a stale fallback writer shortened the cooldown to ${afterFallback}ms`);

  b.api.noteBackendRateLimited(res429(60));         // shorter server value
  const afterShorter = a.api.backendCooldownRemainingMs();
  assert.ok(afterShorter >= afterServer, `a shorter server value shortened the cooldown to ${afterShorter}ms`);
});

await check("server and local cooldowns are tracked separately", async () => {
  const store = {};
  const inst = makeInstance(store, SCRIPT);
  inst.api.noteBackendRateLimited(res429(null));    // local fallback
  inst.api.noteBackendRateLimited(res429(600));     // server deadline
  const rec = inst.api.readBackendCooldownRecord();
  assert.ok(rec.serverUntil > 0 && rec.localUntil > 0, "both deadlines must be retained");
  assert.ok(rec.serverUntil > rec.localUntil, "effective deadline must be the later one");
});

/* A valid server deadline is preserved verbatim — the local exponential
   fallback has a cap, but capping a server instruction would mean retrying
   earlier than we were told to. */
await check("large valid Retry-After is preserved uncapped", async () => {
  const store = {};
  const inst = makeInstance(store, SCRIPT);
  inst.setResponder(() => makeResponse({ status: 429, headers: { "retry-after": "86400" } }));
  await inst.api.governedFetch("/x", { method: "GET" });
  const remaining = inst.api.backendCooldownRemainingMs();
  assert.ok(remaining > 86_000_000, `24h server deadline was clamped to ${remaining}ms`);
});

/* ── Success entitlement ──────────────────────────────────────────────
   A success only proves the limit is over if its request was issued after the
   deadline. Without this, one tab's in-flight success wiped a server-mandated
   cooldown for every tab sharing the profile. */
await check("an unentitled success cannot clear an active cooldown", async () => {
  const store = {};
  const inst = makeInstance(store, SCRIPT);
  inst.setResponder(() => makeResponse({ status: 429, headers: { "retry-after": "600" } }));
  await inst.api.governedFetch("/x", { method: "GET" });
  const before = inst.api.backendCooldownRemainingMs();
  inst.api.noteBackendSuccess(inst.clockNow() - 5000);   // issued before the limit
  assert.strictEqual(inst.api.backendCooldownRemainingMs(), before, "an in-flight success cleared an active cooldown");
});

await check("an entitled probe success clears the cooldown", async () => {
  const store = {};
  const inst = makeInstance(store, SCRIPT);
  inst.setResponder(() => makeResponse({ status: 429, headers: { "retry-after": "30" } }));
  await inst.api.governedFetch("/x", { method: "GET" });
  inst.advance(31000);                                   // wait it out
  inst.api.noteBackendSuccess(inst.clockNow());          // probe issued after the deadline
  assert.strictEqual(inst.api.backendCooldownRemainingMs(), 0, "recovery must be possible");
  assert.strictEqual(inst.api.readBackendCooldownRecord(), null, "escalation must clear too");
});

/* ── Auth recovery shape ──────────────────────────────────────────────
   401 may be a stale token and earns exactly one refresh-and-retry, made
   terminal by a flag rather than a counter. 403 means authenticated but not
   permitted, so a new token cannot help and none is fetched. */
await check("401 earns one bounded retry; 403 earns none", async () => {
  assert.ok(SOURCE.includes("function invalidateAccessToken()"), "token invalidation must exist");
  const retries = SOURCE.match(/if \(code === 401 && options\?\.allowAuthRetry !== false\)/g) || [];
  assert.strictEqual(retries.length, 2, `both conversation calls must handle 401 (found ${retries.length})`);
  const terminal = SOURCE.match(/allowAuthRetry: false/g) || [];
  assert.strictEqual(terminal.length, 2, "each retry must be made terminal");
  assert.ok(!/code === 403[\s\S]{0,120}invalidateAccessToken/.test(SOURCE), "403 must not trigger a token refresh");
  // The retry must invalidate first, or it would re-send the same stale token.
  for (const m of SOURCE.matchAll(/if \(code === 401 && options\?\.allowAuthRetry !== false\) \{([\s\S]{0,200}?)\}/g)) {
    assert.ok(m[1].includes("invalidateAccessToken()"), "401 retry must invalidate the cached token first");
  }
});

/* 10 — the Auto Emoji pump must pause rather than spin. 9B0a refuses these
   requests for free, but 9D1a re-enters roughly every 120ms, and a rate limit
   must not spend a chat's rename budget: the attempt never reached the server,
   so counting it would abandon the chat for the session over a condition that
   clears by itself. */
const PUMP_REL = "src-runtime-base/9D1a.🟤📱 Auto Emoji Title 📱.js";
const PUMP_SOURCE = fs.readFileSync(process.env.H2O_PUMP_SOURCE || path.join(ROOT, PUMP_REL), "utf8");

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

  assert.strictEqual(pump.backendPauseActive(), false, "no pause before any limit");
  assert.strictEqual(pump.isBackendRateLimited({ status: "rate-limited-cooldown" }), true);
  assert.strictEqual(pump.isBackendRateLimited({ statusCode: 429 }), true);
  assert.strictEqual(pump.isBackendRateLimited({ status: "backend-500" }), false, "a 5xx is not a rate limit");

  pump.noteBackendPause({ rateLimited: true, retryAfterMs: 45000 });
  assert.strictEqual(pump.backendPauseActive(), true, "a reported limit must pause the pump");
  const deadline = pump.pauseUntil();
  assert.ok(deadline > Date.now() + 40000, "the pause must honour the reported retry-after");

  /* A shorter follow-up must never pull the deadline in. Checking only that a
     pause is still "active" would not catch this: a one-second pause is also
     active, and would have the pump spinning again almost immediately. */
  pump.noteBackendPause({ rateLimited: true, retryAfterMs: 1000 });
  assert.strictEqual(pump.pauseUntil(), deadline, "a shorter retry-after must not cut the pause short");

  // A longer one must extend it.
  pump.noteBackendPause({ rateLimited: true, retryAfterMs: 300000 });
  assert.ok(pump.pauseUntil() > deadline, "a longer retry-after must extend the pause");
});

/* 11 — the pump must consult the pause before starting an automatic rename,
   and must still let an explicit user action through. */
await check("pump gates automatic renames but not user actions", async () => {
  const guard = "if (backendPauseActive() && options.userInitiated !== true) return false;";
  assert.ok(PUMP_SOURCE.includes(guard), "applyNativeAutoEmoji must consult the pause");
  const guardAt = PUMP_SOURCE.indexOf(guard);
  const bodyAt = PUMP_SOURCE.indexOf("function applyNativeAutoEmoji(");
  assert.ok(guardAt > bodyAt, "the pause guard must sit inside applyNativeAutoEmoji");
  const pendingAt = PUMP_SOURCE.indexOf("runtimeNativeRenamePending[chatId] && options.userInitiated !== true", guardAt);
  assert.ok(pendingAt > guardAt, "the pause guard must precede the pending-rename short circuit");

  // The rate-limited branch must return before the attempt counter increments.
  const rateBranch = PUMP_SOURCE.indexOf("if (isBackendRateLimited(result)) {");
  const counterBump = PUMP_SOURCE.indexOf("runtimeNativeRenameAttempts[chatId] = (runtimeNativeRenameAttempts[chatId] || 0) + 1;", rateBranch);
  assert.ok(rateBranch !== -1 && counterBump > rateBranch, "rate-limit branch must precede the attempt counter");
  const between = PUMP_SOURCE.slice(rateBranch, counterBump);
  assert.ok(between.includes("return;"), "rate-limit branch must return before spending the rename budget");
});

console.log(`PASS validate-backend-rate-limit-governor (${results.length} properties)`);
for (const name of results) console.log(`  ✓ ${name}`);
