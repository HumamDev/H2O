// tools/validation/library/validate-title-chat-list-idle-scan-cost.mjs
//
// RED contract: 9A1b Chat List Decorator must not perform unconditional
// expensive full reconciliation passes while the chat list is stable.
//
// Today every trigger calls scanSidebar() directly and a permanent
// setInterval(scanSidebar, 1200) runs regardless of whether anything changed.
// Phase-1 measurement on the published runtime attributed ~6.87 ms of
// synchronous main-thread work to each pass (11 querySelectorAll, 414
// querySelector, 222 getBoundingClientRect, 179 getComputedStyle over ~41
// anchors) at ~0.8 passes/second on a completely idle page. CV-3.48 already
// reduced the WRITE cost to zero, so what remains is pure wasted read/layout
// work.
//
// This gate executes the REAL production module inside a faithful mock window
// driven by a deterministic fake clock, and counts genuine scanSidebar passes
// via the selector that is unique to it. It deliberately does not assert any
// particular interval value: a dirty-flag scheduler, a coalescing queue, or a
// slow bounded recovery watchdog all satisfy it.
//
// Expected: RED against current product. Compliant control GREEN.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.H2O_SRC_DIR ? path.resolve(process.env.H2O_SRC_DIR) : path.resolve(HERE, '..', '..', '..');
const DECORATOR = 'src-runtime-base/9A1b.🟫🖥️ Chat List Decorator 🎨🖥️.js';

const ELIGIBLE = '/c/69fbbadd-3268-8333-baae-98ff8aa85bcf';
const EXCLUDED = '/settings';

/* The cadence the current product uses. The contract is expressed in units of
   this period so it stays meaningful if the implementation changes shape. */
const OLD_WATCHDOG_MS = 1200;
const IDLE_PERIODS = 10;          // how long we sit still, in old watchdog periods
const IDLE_PASS_BUDGET = 2;       // a slow bounded recovery pass or two is allowed

const failures = [];
let checks = 0;
function check(name, fn) {
  checks += 1;
  try { fn(); } catch (error) { failures.push({ name, message: String((error && error.message) || error) }); }
}

/* ─────────────────────────────────────────────────────────────
   Deterministic environment. No wall-clock anywhere: time only moves when
   advance() is called, so the gate cannot be flaky.
   ───────────────────────────────────────────────────────────── */
function makeEnv(pathname) {
  let now = 0;
  const intervals = [];      // { fn, ms, live, last }
  const timeouts = [];       // { fn, at, done }
  const frames = [];
  const observers = [];
  const listeners = new Map();
  let scanPasses = 0;

  const el = () => ({
    classList: { contains: () => false, add() {}, remove() {}, toggle() {}, replace() {} },
    style: { setProperty() {}, removeProperty() {}, getPropertyValue: () => '' },
    dataset: {}, children: [], attributes: {},
    setAttribute(k, v) { this.attributes[k] = v; },
    getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attributes, k) ? this.attributes[k] : null; },
    removeAttribute(k) { delete this.attributes[k]; },
    hasAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attributes, k); },
    appendChild(c) { this.children.push(c); return c; },
    removeChild() {}, remove() {}, insertBefore() {}, cloneNode() { return el(); },
    querySelector: () => null, querySelectorAll: () => [], closest: () => null, matches: () => false,
    addEventListener() {}, removeEventListener() {}, contains: () => false, focus() {}, click() {},
    getBoundingClientRect: () => ({ top: 0, left: 0, width: 0, height: 0, bottom: 0, right: 0 }),
    getClientRects: () => [],
    get textContent() { return ''; }, set textContent(_v) {},
    get innerHTML() { return ''; }, set innerHTML(_v) {},
    get firstChild() { return null; }, get parentElement() { return null; },
    get parentNode() { return null; }, get nextSibling() { return null; },
    get offsetParent() { return null; },
  });

  const SCAN_SELECTOR = 'nav a[href], aside a[href], main a[href]';
  const doc = {
    body: el(), head: el(), documentElement: el(), title: 'ChatGPT', readyState: 'complete',
    createElement: () => el(), createTextNode: () => el(), createDocumentFragment: () => el(),
    querySelector: () => null,
    /* The one selector unique to a full decorator pass. */
    querySelectorAll: (sel) => { if (String(sel) === SCAN_SELECTOR) scanPasses += 1; return []; },
    getElementById: () => null, getElementsByTagName: () => [],
    addEventListener() {}, removeEventListener() {}, contains: () => false,
  };

  const win = {
    location: { pathname, href: 'https://chatgpt.com' + pathname, origin: 'https://chatgpt.com', search: '', hash: '' },
    document: doc, navigator: { userAgent: 'node' },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    setInterval(fn, ms) { intervals.push({ fn, ms: Math.max(1, ms | 0), live: true, last: now }); return intervals.length; },
    clearInterval(id) { const t = intervals[id - 1]; if (t) t.live = false; },
    setTimeout(fn, ms) { timeouts.push({ fn, at: now + Math.max(0, ms | 0), done: false }); return timeouts.length; },
    clearTimeout(id) { const t = timeouts[id - 1]; if (t) t.done = true; },
    requestAnimationFrame(fn) { frames.push(fn); return frames.length; },
    cancelAnimationFrame() {},
    MutationObserver: class {
      constructor(cb) { this.cb = cb; this.observing = false; observers.push(this); }
      observe() { this.observing = true; }
      disconnect() { this.observing = false; }
      takeRecords() { return []; }
    },
    addEventListener(type, handler) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(handler); },
    removeEventListener() {},
    dispatchEvent() { return true; },
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
    CustomEvent: class { constructor(t, i) { this.type = t; Object.assign(this, i || {}); } },
    Event: class { constructor(t) { this.type = t; } },
    matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
    console: { log() {}, warn() {}, info() {}, error() {}, debug() {} },
    performance: { now: () => now },
    Date: { now: () => now },
  };
  win.window = win; win.self = win; win.globalThis = win;

  /* A REAL debounce driven by the fake clock. Mocking this as identity would
     hide the very coalescing the contract is about. */
  const debounce = (fn, wait = 0) => {
    let pending = null;
    return (...args) => {
      if (pending !== null) win.clearTimeout(pending);
      pending = win.setTimeout(() => { pending = null; fn(...args); }, wait);
    };
  };

  win.H2O = {
    interface: {
      version: '1.0.0',
      lock: { locked: () => false, with: (fn) => fn() },
      utils: { debounce, isInsideH2OInternalSurface: () => false },
      nav: { EVENT: 'ho:navigate', getChatIdFromHref: () => '', currentChatId: () => '' },
      heat: { applyToBtn() {}, get: () => 0 },
      config: { COLORS: [{ name: 'gold' }, { name: 'red' }, { name: 'blue' }, { name: 'green' }] },
      store: { get: () => null, set() {} },
    },
  };

  const runFrames = () => { const q = frames.splice(0, frames.length); for (const f of q) { try { f(0); } catch {} } };
  const runDueTimeouts = () => {
    for (const t of timeouts) {
      if (t.done || t.at > now) continue;
      t.done = true;
      try { t.fn(); } catch {}
    }
  };
  /* Advance the fake clock in small steps so intervals fire at their real rate. */
  const advance = (ms, step = 50) => {
    let remaining = ms;
    while (remaining > 0) {
      const delta = Math.min(step, remaining);
      now += delta; remaining -= delta;
      for (const t of intervals) {
        if (!t.live) continue;
        while (now - t.last >= t.ms) { t.last += t.ms; try { t.fn(); } catch {} }
      }
      runDueTimeouts();
      runFrames();
    }
  };

  const navigate = (next) => {
    win.location.pathname = next;
    win.location.href = 'https://chatgpt.com' + next;
    for (const type of ['ho:navigate', 'popstate', 'h2o:route:changed', 'pageshow']) {
      for (const h of (listeners.get(type) || []).slice()) { try { h({ type }); } catch {} }
    }
  };

  /* One relevant DOM change, delivered the way production sees it. */
  const emitDomChange = (n = 1) => {
    for (let i = 0; i < n; i += 1) {
      for (const o of observers) { if (o.observing && typeof o.cb === 'function') { try { o.cb([{ type: 'childList' }], o); } catch {} } }
    }
  };

  return {
    win, navigate, advance, emitDomChange, runFrames,
    passes: () => scanPasses,
    resetPasses: () => { scanPasses = 0; },
    liveIntervals: () => intervals.filter((t) => t.live).length,
    fastestLiveIntervalMs: () => intervals.filter((t) => t.live).reduce((m, t) => Math.min(m, t.ms), Infinity),
  };
}

function realSubject(startPath) {
  const env = makeEnv(startPath);
  const src = readFileSync(path.join(ROOT, DECORATOR), 'utf8');
  vm.runInContext(src, vm.createContext(env.win), { filename: '9A1b', timeout: 20000 });
  env.runFrames();
  return env;
}

/* ─────────────────────────────────────────────────────────────
   The contract.
   ───────────────────────────────────────────────────────────── */
function assertIdleScanContract(makeSubject, tag) {
  // 1. Convergence: booting must actually decorate (guards "delete the feature").
  {
    const s = makeSubject(ELIGIBLE);
    s.advance(200);
    check(`${tag} / P1 boot performs an initial reconciliation pass`, () => {
      assert.ok(s.passes() >= 1, 'boot on an eligible surface must reconcile at least once');
    });
  }

  // 2. STABLE IDLE — the headline contract.
  {
    const s = makeSubject(ELIGIBLE);
    s.advance(2000);            // let boot settle
    s.resetPasses();
    s.advance(OLD_WATCHDOG_MS * IDLE_PERIODS);
    check(`${tag} / P2 stable idle does not keep re-scanning at the old cadence`, () => {
      assert.ok(s.passes() <= IDLE_PASS_BUDGET,
        `idle for ${IDLE_PERIODS} watchdog periods with no change must not run ${s.passes()} full passes (budget ${IDLE_PASS_BUDGET})`);
    });
  }

  // 3. BURST COALESCING.
  {
    const s = makeSubject(ELIGIBLE);
    s.advance(2000);
    s.resetPasses();
    s.emitDomChange(20);        // one render burst
    s.advance(100);             // past any short debounce, before the next old period
    check(`${tag} / P3 a burst of relevant mutations coalesces into at most one pass`, () => {
      assert.ok(s.passes() <= 1, `20 mutations in one burst produced ${s.passes()} passes; expected at most 1`);
    });
  }

  // 4. REAL CHANGE still reconciles (guards "stop scanning entirely").
  {
    const s = makeSubject(ELIGIBLE);
    s.advance(2000);
    s.resetPasses();
    s.emitDomChange(1);
    s.advance(500);
    check(`${tag} / P4 a genuine relevant change still triggers reconciliation`, () => {
      assert.ok(s.passes() >= 1, 'a real DOM change must still produce a decorator pass');
    });
  }

  // 5. ROUTE RESUME reconciles exactly once (bounded).
  {
    const s = makeSubject(ELIGIBLE);
    s.advance(2000);
    s.navigate(EXCLUDED);
    s.advance(500);
    s.resetPasses();
    s.navigate(ELIGIBLE);
    s.advance(500);
    check(`${tag} / P5 resuming an eligible route reconciles at least once`, () => {
      assert.ok(s.passes() >= 1, 'resume must reconcile the list once');
    });
    check(`${tag} / P6 resume does not stampede`, () => {
      assert.ok(s.passes() <= 4, `resume produced ${s.passes()} passes; expected a bounded reconciliation`);
    });
  }

  // 6. SUSPENDED surface performs no passes at all.
  {
    const s = makeSubject(ELIGIBLE);
    s.advance(2000);
    s.navigate(EXCLUDED);
    s.advance(500);
    s.resetPasses();
    s.advance(OLD_WATCHDOG_MS * IDLE_PERIODS);
    s.emitDomChange(10);
    s.advance(500);
    check(`${tag} / P7 an ineligible route performs zero passes`, () => {
      assert.equal(s.passes(), 0, 'no decorator pass may run while the route is ineligible');
    });
  }
}

/* ── Fixtures ─────────────────────────────────────────────────────────────── */
const isEligible = (p) => /^\/(?:c\/|g\/[^/]+\/c\/)/.test(p);

function fixtureSubject(install) {
  return (startPath) => { const env = makeEnv(startPath); install(env); env.runFrames(); return env; };
}

/* Compliant: dirty-flag coalescing + a slow bounded recovery watchdog. */
const compliant = fixtureSubject((env) => {
  const w = env.win;
  const scan = () => { w.document.querySelectorAll('nav a[href], aside a[href], main a[href]'); };
  let dirty = false, pending = 0, observer = null, watchdog = 0, active = false;
  const request = () => {
    if (!active) return;
    dirty = true;
    if (pending) return;
    pending = w.setTimeout(() => { pending = 0; if (!dirty || !active) return; dirty = false; scan(); }, 50);
  };
  const activate = () => {
    if (active) return;
    active = true;
    observer = new w.MutationObserver(request);
    observer.observe(w.document.body, { childList: true, subtree: true });
    /* Slow bounded recovery: only reconciles when something is actually dirty. */
    watchdog = w.setInterval(() => { if (dirty) { dirty = false; scan(); } }, 15000);
    scan();
  };
  const suspend = () => {
    if (!active) return;
    active = false; dirty = false;
    if (observer) { observer.disconnect(); observer = null; }
    if (watchdog) { w.clearInterval(watchdog); watchdog = 0; }
    if (pending) { w.clearTimeout(pending); pending = 0; }
  };
  const sync = () => { if (isEligible(w.location.pathname)) activate(); else suspend(); };
  w.addEventListener('ho:navigate', sync);
  sync();
});

/* Vacuous 1: decorator deleted — never scans at all. */
const vacuousDead = fixtureSubject((env) => { env.win.addEventListener('ho:navigate', () => {}); });

/* Vacuous 2: mutations no longer reconcile (observer removed, idle quiet). */
const vacuousNoReconcile = fixtureSubject((env) => {
  const w = env.win;
  const scan = () => { w.document.querySelectorAll('nav a[href], aside a[href], main a[href]'); };
  const sync = () => { if (isEligible(w.location.pathname)) scan(); };
  w.addEventListener('ho:navigate', sync);
  sync();
});

/* Vacuous 3: every event gets its own independent pass (no coalescing). */
const vacuousNoCoalesce = fixtureSubject((env) => {
  const w = env.win;
  const scan = () => { w.document.querySelectorAll('nav a[href], aside a[href], main a[href]'); };
  let observer = null, active = false;
  const activate = () => { if (active) return; active = true;
    observer = new w.MutationObserver(() => scan());       // one pass per mutation
    observer.observe(w.document.body, { childList: true, subtree: true }); scan(); };
  const suspend = () => { active = false; if (observer) { observer.disconnect(); observer = null; } };
  const sync = () => { if (isEligible(w.location.pathname)) activate(); else suspend(); };
  w.addEventListener('ho:navigate', sync); sync();
});

/* Vacuous 4: high-frequency polling retained (the current shape). */
const vacuousStillPolling = fixtureSubject((env) => {
  const w = env.win;
  const scan = () => { w.document.querySelectorAll('nav a[href], aside a[href], main a[href]'); };
  let timer = 0, observer = null, active = false;
  const activate = () => { if (active) return; active = true;
    timer = w.setInterval(scan, 1200);
    observer = new w.MutationObserver(w.H2O.interface.utils.debounce(scan, 50));
    observer.observe(w.document.body, { childList: true, subtree: true }); scan(); };
  const suspend = () => { active = false; if (timer) { w.clearInterval(timer); timer = 0; }
    if (observer) { observer.disconnect(); observer = null; } };
  const sync = () => { if (isEligible(w.location.pathname)) activate(); else suspend(); };
  w.addEventListener('ho:navigate', sync); sync();
});

/* ── Run ──────────────────────────────────────────────────────────────────── */
function runIsolated(subject, tag) {
  const before = failures.length;
  assertIdleScanContract(subject, tag);
  const n = failures.length - before;
  failures.length = before;
  return n;
}

const controlFailures = (() => {
  const before = failures.length;
  assertIdleScanContract(compliant, 'CONTROL');
  return failures.length - before;
})();

const vacuous = {
  'dead (never scans)': runIsolated(vacuousDead, 'VACUOUS[dead]'),
  'no-reconcile (mutations ignored)': runIsolated(vacuousNoReconcile, 'VACUOUS[no-reconcile]'),
  'no-coalescing (one pass per event)': runIsolated(vacuousNoCoalesce, 'VACUOUS[no-coalesce]'),
  'still-polling (1.2 s watchdog kept)': runIsolated(vacuousStillPolling, 'VACUOUS[still-polling]'),
};

const productStart = failures.length;
assertIdleScanContract(realSubject, 'PRODUCT');
const productFailures = failures.slice(productStart);

console.log(`Checks executed: ${checks}`);
console.log(`Compliant control failures: ${controlFailures} (must be 0)`);
for (const [name, n] of Object.entries(vacuous)) {
  console.log(`  vacuous rejected: ${n > 0 ? 'yes' : 'NO'}  ${name} (${n} assertion failures)`);
}
console.log(`Product failures: ${productFailures.length}`);
for (const f of productFailures) console.log(`  RED  ${f.name}\n       ${f.message.split('\n')[0]}`);

if (controlFailures !== 0) {
  console.error('\nHARNESS FAILURE: the compliant control did not go green; the gate is not discriminating.');
  process.exit(2);
}
if (Object.values(vacuous).some((n) => n === 0)) {
  console.error('\nHARNESS FAILURE: a vacuous fixture survived; the gate does not reject cheap fixes.');
  process.exit(2);
}
if (productFailures.length === 0) {
  console.log('\nvalidate-title-chat-list-idle-scan-cost: GREEN (idle scan cost bounded)');
  process.exit(0);
}
console.error(`\nvalidate-title-chat-list-idle-scan-cost: RED — ${productFailures.length} idle-scan assertions unmet by current product.`);
process.exit(1);
