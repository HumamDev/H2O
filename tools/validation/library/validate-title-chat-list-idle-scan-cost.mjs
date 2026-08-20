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

  /* A semantic trigger (activity-style), which must not be delayed behind the
     broad DOM-churn coalescing window. */
  const emitSemantic = () => {
    for (const h of (listeners.get('h2o:interface:activity-style') || []).slice()) { try { h({ type: 'h2o:interface:activity-style', detail: {} }); } catch {} }
  };

  return {
    win, navigate, advance, emitDomChange, emitSemantic, runFrames,
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

/* ─────────────────────────────────────────────────────────────
   Phase-2b: bounded coalescing of broad native DOM-mutation churn.

   Live measurement showed ChatGPT emits ~720 mutation records per 10 s even
   with H2O suspended, arriving roughly every 120 ms. With a 50 ms window every
   callback became its own pass (274 passes for 274 callbacks), so the coalescer
   collapsed nothing. A wider window for DOM churn bounds that -- but it must
   NOT be a resetting debounce, or continuous traffic would postpone the scan
   forever.
   ───────────────────────────────────────────────────────────── */
const DOM_WINDOW_MS = 250;
const STREAM_MS = 3000;
const STREAM_SPACING_MS = 120;

function assertBoundedMutationCoalescing(makeSubject, tag) {
  // C1 — continuous churn must be bounded, and must not starve.
  {
    const s = makeSubject(ELIGIBLE);
    s.advance(2000);
    s.resetPasses();
    for (let t = 0; t < STREAM_MS; t += STREAM_SPACING_MS) { s.emitDomChange(1); s.advance(STREAM_SPACING_MS); }
    s.advance(DOM_WINDOW_MS * 2);
    const passes = s.passes();
    const uncoalesced = Math.floor(STREAM_MS / STREAM_SPACING_MS);       // ~25
    const ideal = Math.floor(STREAM_MS / DOM_WINDOW_MS);                 // ~12
    check(`${tag} / C1 continuous mutation traffic is bounded, not 1:1`, () => {
      assert.ok(passes <= ideal + 2, `continuous churn produced ${passes} passes; a ${DOM_WINDOW_MS} ms window should bound it near ${ideal}`);
    });
    check(`${tag} / C2 continuous mutation traffic is not starved to zero`, () => {
      assert.ok(passes >= 2, `continuous churn produced only ${passes} passes; a resetting debounce would starve reconciliation`);
      assert.ok(passes < uncoalesced, 'coalescing must actually reduce below the uncoalesced rate');
    });
  }

  // C3 — a tight burst still collapses to one pass.
  {
    const s = makeSubject(ELIGIBLE);
    s.advance(2000); s.resetPasses();
    s.emitDomChange(20);
    s.advance(DOM_WINDOW_MS * 2);
    check(`${tag} / C3 a 20-mutation burst yields exactly one pass`, () => {
      assert.equal(s.passes(), 1, `expected exactly 1 pass for one burst, saw ${s.passes()}`);
    });
  }

  // C4 — a semantic trigger must not be held behind the DOM window.
  {
    const s = makeSubject(ELIGIBLE);
    s.advance(2000); s.resetPasses();
    s.emitDomChange(1);            // arms the slow DOM window
    s.advance(20);
    s.emitSemantic();              // semantic trigger arrives inside it
    s.advance(80);                 // well under DOM_WINDOW_MS
    check(`${tag} / C4 a semantic trigger is not delayed behind DOM coalescing`, () => {
      assert.ok(s.passes() >= 1, 'a semantic trigger must reconcile on the short deadline, not wait for the DOM window');
    });
  }

  // C5 — one pending scheduler and one watchdog, across suspend/resume.
  {
    const s = makeSubject(ELIGIBLE);
    s.advance(2000);
    s.emitDomChange(5);
    s.navigate(EXCLUDED);          // suspend with work pending
    s.resetPasses();
    s.advance(DOM_WINDOW_MS * 4);
    check(`${tag} / C5 suspension cancels pending mutation work`, () => {
      assert.equal(s.passes(), 0, 'a pending coalesced scan must not flush after suspension');
    });
    s.navigate(ELIGIBLE);
    s.advance(500);
    for (let i = 0; i < 3; i += 1) { s.navigate(EXCLUDED); s.advance(300); s.navigate(ELIGIBLE); s.advance(500); }
    check(`${tag} / C6 repeated cycles leave exactly one watchdog authority`, () => {
      assert.equal(s.liveIntervals(), 1, `expected exactly one live interval, saw ${s.liveIntervals()}`);
      assert.equal(s.fastestLiveIntervalMs(), 15000, 'the only live interval must remain the 15 s recovery watchdog');
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
  let dirty = false, pending = 0, pendingFast = false, observer = null, watchdog = 0, active = false;
  /* Broad DOM churn coalesces on a wider window; semantic triggers keep the
     short deadline. The pending handle is never reset by later requests -- only
     escalated to the shorter deadline -- so continuous traffic cannot starve. */
  const request = (reason) => {
    if (!active) return;
    dirty = true;
    const fast = reason !== 'dom';
    if (pending) {
      if (fast && !pendingFast) {
        w.clearTimeout(pending); pendingFast = true;
        pending = w.setTimeout(flush, 50);
      }
      return;
    }
    pendingFast = fast;
    pending = w.setTimeout(flush, fast ? 50 : 250);
  };
  function flush() { pending = 0; pendingFast = false; if (!dirty || !active) { dirty = false; return; } dirty = false; scan(); }
  const activate = () => {
    if (active) return;
    active = true;
    observer = new w.MutationObserver(() => request('dom'));
    observer.observe(w.document.body, { childList: true, subtree: true });
    watchdog = w.setInterval(() => request('recovery'), 15000);
    request('activate');
  };
  const suspend = () => {
    if (!active) return;
    active = false; dirty = false;
    if (observer) { observer.disconnect(); observer = null; }
    if (watchdog) { w.clearInterval(watchdog); watchdog = 0; }
    if (pending) { w.clearTimeout(pending); pending = 0; pendingFast = false; }
  };
  const sync = () => { if (isEligible(w.location.pathname)) activate(); else suspend(); };
  w.addEventListener('ho:navigate', sync);
  w.addEventListener('h2o:interface:activity-style', () => request('activity-style'));
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

const reentryControlFailures = (() => {
  const before = failures.length;
  assertBoundedMutationCoalescing(compliant, 'CONTROL-COALESCE');
  return failures.length - before;
})();

const productStart = failures.length;
assertIdleScanContract(realSubject, 'PRODUCT');
assertBoundedMutationCoalescing(realSubject, 'PRODUCT');
const productFailures = failures.slice(productStart);

console.log(`Checks executed: ${checks}`);
console.log(`Compliant control failures: ${controlFailures} (must be 0)`);
console.log(`Coalescing control failures: ${reentryControlFailures} (must be 0)`);
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
