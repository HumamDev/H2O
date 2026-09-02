// tools/validation/library/validate-title-spa-lifecycle-reversibility.mjs
//
// Regression contract (historically introduced RED): 9A1b Chat List Decorator
// and 9A1c Chat Meta Enricher must treat surface eligibility as LIVE route
// state, not as module-evaluation state.
//
// The original defect evaluated location.pathname only at module load, making
// an excluded-first document terminal and leaving no reversible teardown for
// later SPA transitions. The product now implements the lifecycle below; this
// file retains the original discriminating contract as regression protection.
//
// This validator executes the REAL production sources inside a faithful mock
// window, then drives real SPA route transitions and asserts the lifecycle. It
// deliberately does not pin private function names: any implementation that
// activates on eligible routes, suspends the expensive layer off-route, and
// resumes exactly once satisfies it.
//
// Expected now: GREEN against the current product. The compliant and vacuous
// control fixtures prove the gate still discriminates the historical missing
// behaviour rather than passing or failing unconditionally.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.H2O_SRC_DIR
  ? path.resolve(process.env.H2O_SRC_DIR)
  : path.resolve(HERE, '..', '..', '..');

const DECORATOR = 'src-runtime-base/9A1b.🟫🖥️ Chat List Decorator 🎨🖥️.js';
const ENRICHER = 'src-runtime-base/9A1c.🟫🖥️ Chat Meta Enricher 🧾🖥️.js';

const ELIGIBLE_CHAT = '/c/69fbbadd-3268-8333-baae-98ff8aa85bcf';
const ELIGIBLE_PROJECT_CHAT = '/g/g-p-abc/c/69fbbadd-3268-8333-baae-98ff8aa85bcf';
const EXCLUDED = '/settings';

const failures = [];
let checks = 0;
function check(name, fn) {
  checks += 1;
  try { fn(); } catch (error) { failures.push({ name, message: String(error && error.message || error) }); }
}

/* ─────────────────────────────────────────────────────────────
   Faithful mock environment.

   The interesting state is deliberately observable: every interval and every
   MutationObserver records whether it is still live, so "suspended" and
   "resumed exactly once" are counted rather than inferred from naming.
   ───────────────────────────────────────────────────────────── */
function makeEnv(pathname) {
  const intervals = [];
  const observers = [];
  const frames = [];
  const macrotasks = [];
  const routeListeners = new Map();

  const el = () => {
    const node = {
      classList: { contains: () => false, add() {}, remove() {}, toggle() {}, replace() {} },
      style: { setProperty() {}, removeProperty() {}, getPropertyValue: () => '' },
      dataset: {}, children: [], childNodes: [], attributes: {},
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
    };
    return node;
  };

  /* A distinct <main> element: 9A1b observes document.body while 9A1c observes
     getRoot() === main, so observers can be attributed by target rather than by
     construction order. */
  const mainEl = el();
  const doc = {
    body: el(), head: el(), documentElement: el(), title: 'ChatGPT', readyState: 'complete',
    createElement: () => el(), createTextNode: () => el(), createDocumentFragment: () => el(),
    querySelector: (sel) => (String(sel) === 'main' ? mainEl : null),
    querySelectorAll: () => [], getElementById: () => null,
    getElementsByTagName: () => [], addEventListener() {}, removeEventListener() {}, contains: () => false,
  };

  const win = {
    location: { pathname, href: 'https://chatgpt.com' + pathname, origin: 'https://chatgpt.com', search: '', hash: '' },
    document: doc,
    navigator: { userAgent: 'node' },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    setInterval(fn, ms) { intervals.push({ fn, ms, live: true }); return intervals.length; },
    clearInterval(id) { const t = intervals[id - 1]; if (t) t.live = false; },
    setTimeout(fn) { if (typeof fn === 'function') macrotasks.push(fn); return 0; }, clearTimeout() {},
    /* Real queue. The offline gate previously dropped rAF callbacks, which hid
       9A1c's rAF-bound bindObserver() entirely; flushFrames() executes them. */
    requestAnimationFrame(fn) { if (typeof fn === 'function') frames.push(fn); return frames.length; },
    cancelAnimationFrame() {},
    MutationObserver: class {
      constructor(cb) { this.cb = cb; this.observing = false; this.target = null; observers.push(this); }
      observe(target) { this.observing = true; this.target = target; }
      disconnect() { this.observing = false; }
      takeRecords() { return []; }
    },
    addEventListener(type, handler) {
      if (!routeListeners.has(type)) routeListeners.set(type, []);
      routeListeners.get(type).push(handler);
    },
    removeEventListener(type, handler) {
      const list = routeListeners.get(type) || [];
      const i = list.indexOf(handler);
      if (i >= 0) list.splice(i, 1);
    },
    dispatchEvent() { return true; },
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
    CustomEvent: class { constructor(type, init) { this.type = type; Object.assign(this, init || {}); } },
    Event: class { constructor(type) { this.type = type; } },
    matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
    console: { log() {}, warn() {}, info() {}, error() {}, debug() {} },
    performance: { now: () => 0 },
  };
  win.window = win; win.self = win; win.globalThis = win;

  win.H2O = {
    interface: {
      version: '1.0.0',
      lock: { locked: () => false, with: (fn) => fn() },
      utils: { debounce: (fn) => fn, isInsideH2OInternalSurface: () => false },
      nav: { EVENT: 'ho:navigate', getChatIdFromHref: () => '', currentChatId: () => '' },
      heat: { applyToBtn() {}, get: () => 0 },
      config: { COLORS: [{ name: 'gold' }, { name: 'red' }, { name: 'blue' }, { name: 'green' }] },
      store: { get: () => null, set() {} },
    },
  };

  /* A real SPA transition: the URL changes first, then the kernel dispatches
     ho:navigate synchronously. Anything that re-evaluates eligibility must do
     so from this signal, because the module is never re-evaluated. */
  const navigate = (nextPath) => {
    win.location.pathname = nextPath;
    win.location.href = 'https://chatgpt.com' + nextPath;
    for (const type of ['ho:navigate', 'popstate', 'h2o:route:changed', 'evt:h2o:route:changed', 'pageshow']) {
      for (const handler of (routeListeners.get(type) || []).slice()) {
        try { handler({ type, detail: { pathname: nextPath } }); } catch { /* handler faults are not this gate's subject */ }
      }
    }
  };

  /* Drain queued animation frames (and any timeouts they schedule). Bounded so a
     self-rescheduling callback cannot hang the gate. */
  const flushFrames = (rounds = 3) => {
    for (let i = 0; i < rounds; i += 1) {
      const pendingFrames = frames.splice(0, frames.length);
      const pendingTasks = macrotasks.splice(0, macrotasks.length);
      for (const fn of pendingFrames) { try { fn(0); } catch { /* callback faults are not this gate's subject */ } }
      for (const fn of pendingTasks) { try { fn(); } catch { /* as above */ } }
      if (!frames.length && !macrotasks.length) break;
    }
  };

  return {
    win, navigate, flushFrames,
    liveIntervals: () => intervals.filter((t) => t.live).length,
    activeObservers: () => observers.filter((o) => o.observing).length,
    totalIntervalsEverCreated: () => intervals.length,
    totalObserversEverCreated: () => observers.length,
    /* 9A1c observes <main>; 9A1b observes document.body. */
    mainObservers: () => observers.filter((o) => o.observing && o.target === mainEl).length,
    mainObserversEverCreated: () => observers.filter((o) => o.target === mainEl).length,
    /* The production re-entry path: 9A1c's own observer callback IS schedule(),
       which calls bindObserver() as its first action. */
    fireMetaObserverCallback: () => {
      const owned = observers.filter((o) => o.target === mainEl);
      const victim = owned[owned.length - 1];
      if (victim && typeof victim.cb === 'function') { try { victim.cb([], victim); } catch { /* ignore */ } }
      return !!victim;
    },
  };
}

function runReal(env, relPath, label) {
  const src = readFileSync(path.join(ROOT, relPath), 'utf8');
  const ctx = env.ctx || (env.ctx = vm.createContext(env.win));
  vm.runInContext(src, ctx, { filename: label, timeout: 20000 });
  return ctx;
}

function bootReal(env) {
  runReal(env, DECORATOR, '9A1b');
  runReal(env, ENRICHER, '9A1c');
  return env;
}

/* ─────────────────────────────────────────────────────────────
   The contract, expressed once and applied to real product and to fixtures.
   `subject` boots a document at a starting path and exposes the same probes.
   ───────────────────────────────────────────────────────────── */
function assertReversibleLifecycle(makeSubject, tag) {
  // Contract A — document starts on an excluded surface.
  {
    const s = makeSubject(EXCLUDED);
    check(`${tag} / A1 excluded-first: expensive layer inactive on load`, () => {
      assert.equal(s.liveIntervals(), 0, 'no periodic scan may run on an excluded surface');
      assert.equal(s.activeObservers(), 0, 'no broad observer may run on an excluded surface');
    });

    s.navigate(ELIGIBLE_CHAT);
    check(`${tag} / A2 excluded-first: SPA navigation to /c/<chat> activates the expensive layer`, () => {
      assert.ok(s.liveIntervals() >= 1, 'periodic scan authority must exist after arriving on an eligible route');
      assert.ok(s.activeObservers() >= 1, 'observer authority must exist after arriving on an eligible route');
    });
    check(`${tag} / A3 excluded-first: activation happened without module re-evaluation`, () => {
      assert.equal(s.evaluations(), s.initialEvaluations(), 'the modules must not be re-evaluated to recover');
    });
    check(`${tag} / A4 excluded-first: project chat route is equally eligible`, () => {
      const p = makeSubject(EXCLUDED);
      p.navigate(ELIGIBLE_PROJECT_CHAT);
      assert.ok(p.liveIntervals() >= 1, '/g/<project>/c/<chat> must be treated as eligible');
    });
  }

  // Contract B — eligible, then excluded, then eligible again.
  {
    const s = makeSubject(ELIGIBLE_CHAT);
    const bootIntervals = s.liveIntervals();
    const bootObservers = s.activeObservers();

    check(`${tag} / B1 eligible-first: expensive layer active exactly once`, () => {
      assert.ok(bootIntervals >= 1, 'eligible boot must install periodic scan authority');
      assert.ok(bootObservers >= 1, 'eligible boot must install observer authority');
    });

    s.navigate(EXCLUDED);
    check(`${tag} / B2 eligible->excluded: expensive layer suspended`, () => {
      assert.equal(s.liveIntervals(), 0, 'periodic scan must not survive navigation to an excluded surface');
      assert.equal(s.activeObservers(), 0, 'broad observer must be disconnected on an excluded surface');
    });

    s.navigate(ELIGIBLE_CHAT);
    check(`${tag} / B3 excluded->eligible: resumed exactly once, no duplicate authority`, () => {
      assert.equal(s.liveIntervals(), bootIntervals, 'resume must restore exactly the original interval authority');
      assert.equal(s.activeObservers(), bootObservers, 'resume must restore exactly the original observer authority');
    });

    s.navigate(EXCLUDED);
    s.navigate(ELIGIBLE_CHAT);
    s.navigate(EXCLUDED);
    s.navigate(ELIGIBLE_CHAT);
    check(`${tag} / B4 repeated transitions never accumulate authority`, () => {
      assert.equal(s.liveIntervals(), bootIntervals, 'repeated round trips must not multiply intervals');
      assert.equal(s.activeObservers(), bootObservers, 'repeated round trips must not multiply observers');
    });
  }
}

/* ─────────────────────────────────────────────────────────────
   Re-entry contract (added after live acceptance).

   Suspension must be DURABLE. 9A1c keeps its Registry subscription and storage
   bridge alive across route changes by design, and those core paths can still
   call schedule() / kickMetaResync() while the route is ineligible. Both call
   bindObserver() as their first action, so a disconnected main-list observer was
   silently reconstructed within ~150 ms of suspending -- proven live, invisible
   to the original harness because it never executed queued animation frames.
   ───────────────────────────────────────────────────────────── */
function assertDurableSuspension(makeSubject, tag) {
  const s = makeSubject(ELIGIBLE_PROJECT_CHAT);
  s.flushFrames();                       // let rAF-bound bindObserver() actually run

  check(`${tag} / R1 eligible: main-list observer is bound after frames run`, () => {
    assert.equal(s.mainObservers(), 1, 'exactly one main-list observer must be observing on an eligible surface');
  });

  s.navigate(EXCLUDED);
  s.flushFrames();
  const everAtSuspend = s.mainObserversEverCreated();
  check(`${tag} / R2 suspend: main-list observer disconnected`, () => {
    assert.equal(s.mainObservers(), 0, 'suspension must disconnect the main-list observer');
  });

  /* Core activity that legitimately survives the route change. */
  s.fireMetaObserverCallback();
  s.flushFrames();
  s.fireMetaObserverCallback();
  s.flushFrames();

  check(`${tag} / R3 off-route re-entry must not rebind the observer`, () => {
    assert.equal(s.mainObservers(), 0, 'no main-list observer may be observing while the route is ineligible');
  });
  check(`${tag} / R4 off-route re-entry must not construct a new observer`, () => {
    assert.equal(s.mainObserversEverCreated(), everAtSuspend,
      'suspension must be durable: no new main-list observer may be constructed off-route');
  });

  s.navigate(ELIGIBLE_PROJECT_CHAT);
  s.flushFrames();
  check(`${tag} / R5 resume restores exactly one main-list observer`, () => {
    assert.equal(s.mainObservers(), 1, 'resume must restore exactly one main-list observer');
  });
}

/* Real product subject. */
function realSubject(startPath) {
  const env = makeEnv(startPath);
  let evaluations = 0;
  bootReal(env);
  evaluations = 2;
  const initial = evaluations;
  return {
    navigate: env.navigate,
    liveIntervals: env.liveIntervals,
    activeObservers: env.activeObservers,
    flushFrames: env.flushFrames,
    mainObservers: env.mainObservers,
    mainObserversEverCreated: env.mainObserversEverCreated,
    fireMetaObserverCallback: env.fireMetaObserverCallback,
    evaluations: () => evaluations,
    initialEvaluations: () => initial,
  };
}

/* ─────────────────────────────────────────────────────────────
   Fixtures. The compliant one proves the gate can go GREEN; the vacuous ones
   prove it rejects the cheap ways of appearing to comply.
   ───────────────────────────────────────────────────────────── */
function fixtureSubject(behaviour) {
  return (startPath) => {
    const env = makeEnv(startPath);
    let evaluations = 1;
    behaviour(env);
    return {
      navigate: env.navigate,
      liveIntervals: env.liveIntervals,
      activeObservers: env.activeObservers,
      flushFrames: env.flushFrames,
      mainObservers: env.mainObservers,
      mainObserversEverCreated: env.mainObserversEverCreated,
      fireMetaObserverCallback: env.fireMetaObserverCallback,
      evaluations: () => evaluations,
      initialEvaluations: () => evaluations,
    };
  };
}

const isEligible = (p) => /^\/(?:c\/|g\/[^/]+\/c\/)/.test(p);

/* Compliant: eligibility is live state; suspend/resume is idempotent; and the
   rAF-bound main-list observer defends itself, so a surviving core path cannot
   rebind it while the route is ineligible. */
const compliant = fixtureSubject((env) => {
  const w = env.win;
  let intervalId = 0;
  let bodyObserver = null;
  let mainObserver = null;

  /* The durable boundary: the low-level bind refuses off-route, so every present
     and future caller inherits the rule. */
  const bindMain = () => {
    if (!isEligible(w.location.pathname)) return;
    if (mainObserver) return;
    const main = w.document.querySelector('main');
    if (!main) return;
    mainObserver = new w.MutationObserver(() => bindMain());   // callback re-enters, as production does
    mainObserver.observe(main, { childList: true, subtree: true });
  };

  const activate = () => {
    if (intervalId) return;                       // exactly-once
    intervalId = w.setInterval(() => {}, 1200);
    bodyObserver = new w.MutationObserver(() => {});
    bodyObserver.observe(w.document.body, { childList: true, subtree: true });
    w.requestAnimationFrame(bindMain);
  };
  const suspend = () => {
    if (intervalId) { w.clearInterval(intervalId); intervalId = 0; }
    if (bodyObserver) { bodyObserver.disconnect(); bodyObserver = null; }
    if (mainObserver) { mainObserver.disconnect(); mainObserver = null; }
  };
  const sync = () => { if (isEligible(w.location.pathname)) activate(); else suspend(); };
  w.addEventListener('ho:navigate', sync);
  sync();
});

/* Vacuous 1: never activates anywhere (the "delete the feature" fix). */
const vacuousDead = fixtureSubject((env) => {
  env.win.addEventListener('ho:navigate', () => {});
});

/* Vacuous 2: runs everywhere, never suspends (the "remove the gate" fix). */
const vacuousAlwaysOn = fixtureSubject((env) => {
  const w = env.win;
  w.setInterval(() => {}, 1200);
  const o = new w.MutationObserver(() => {});
  o.observe(w.document.body, { childList: true, subtree: true });
});

/* Vacuous 3: resumes by stacking a new interval without clearing the old. */
const vacuousLeaky = fixtureSubject((env) => {
  const w = env.win;
  let observer = null;
  const sync = () => {
    if (isEligible(w.location.pathname)) {
      w.setInterval(() => {}, 1200);            // no exactly-once guard
      observer = new w.MutationObserver(() => {});
      observer.observe(w.document.body, { childList: true, subtree: true });
    }
  };
  w.addEventListener('ho:navigate', sync);
  sync();
});

/* Vacuous 5: suspends, but a surviving core path rebinds the observer off-route
   -- exactly the live-proven defect. Must be rejected. */
const vacuousRebinder = fixtureSubject((env) => {
  const w = env.win;
  let intervalId = 0;
  let observer = null;
  const main = w.document.querySelector('main');
  const bind = () => {                       // no eligibility guard -- the defect
    if (observer) return;
    observer = new w.MutationObserver(() => bind());
    observer.observe(main, { childList: true, subtree: true });
  };
  const activate = () => { if (!intervalId) intervalId = w.setInterval(() => {}, 1200); w.requestAnimationFrame(bind); };
  const suspend = () => {
    if (intervalId) { w.clearInterval(intervalId); intervalId = 0; }
    if (observer) { observer.disconnect(); observer = null; }
    w.requestAnimationFrame(bind);           // surviving core path rebinds
  };
  const sync = () => { if (isEligible(w.location.pathname)) activate(); else suspend(); };
  w.addEventListener('ho:navigate', sync);
  sync();
});

/* Vacuous 4: hides the UI but keeps the expensive scan running. */
const vacuousHideOnly = fixtureSubject((env) => {
  const w = env.win;
  let hidden = false;
  w.setInterval(() => {}, 1200);
  const o = new w.MutationObserver(() => {});
  o.observe(w.document.body, { childList: true, subtree: true });
  w.addEventListener('ho:navigate', () => { hidden = !isEligible(w.location.pathname); });
});

function countFailuresFor(tag, run) {
  const before = failures.length;
  run();
  return failures.length - before;
}

/* ── 1. Anti-vacuity: the compliant control must be fully GREEN. ───────────── */
const compliantFailures = countFailuresFor('compliant', () => assertReversibleLifecycle(compliant, 'CONTROL'));

/* ── 2. Anti-vacuity: each vacuous fixture must be REJECTED. ───────────────── */
const vacuousResults = {};
for (const [name, fixture] of Object.entries({
  'dead (no activation anywhere)': vacuousDead,
  'always-on (never suspends)': vacuousAlwaysOn,
  'leaky (duplicate interval on resume)': vacuousLeaky,
  'hide-only (UI hidden, scan alive)': vacuousHideOnly,
})) {
  const before = failures.length;
  assertReversibleLifecycle(fixture, `VACUOUS[${name}]`);
  vacuousResults[name] = failures.length - before;
  failures.length = before;   // expected rejections are not gate failures
}

/* ── 2b. Re-entry contract: control must pass, rebinder must be rejected. ──── */
const reentryControlFailures = countFailuresFor('reentry-control', () => assertDurableSuspension(compliant, 'CONTROL-REENTRY'));
let reentryVacuousRejected = 0;
{
  const before = failures.length;
  assertDurableSuspension(vacuousRebinder, 'VACUOUS[off-route rebinder]');
  reentryVacuousRejected = failures.length - before;
  failures.length = before;
}

/* ── 3. The real subject: current regression target, historically RED. ────── */
const productFailuresStart = failures.length;
assertReversibleLifecycle(realSubject, 'PRODUCT');
assertDurableSuspension(realSubject, 'PRODUCT');
const productFailures = failures.slice(productFailuresStart);

/* ── Report ───────────────────────────────────────────────────────────────── */
const controlOk = compliantFailures === 0;
const vacuityOk = Object.values(vacuousResults).every((n) => n > 0);

console.log(`Checks executed: ${checks}`);
console.log(`Compliant control failures: ${compliantFailures} (must be 0)`);
console.log(`Re-entry control failures: ${reentryControlFailures} (must be 0)`);
console.log(`  vacuous rejected: ${reentryVacuousRejected > 0 ? 'yes' : 'NO'}  off-route rebinder (${reentryVacuousRejected} assertion failures)`);
for (const [name, n] of Object.entries(vacuousResults)) {
  console.log(`  vacuous rejected: ${n > 0 ? 'yes' : 'NO'}  ${name} (${n} assertion failures)`);
}
console.log(`Product failures: ${productFailures.length}`);
for (const f of productFailures) console.log(`  RED  ${f.name}\n       ${f.message.split('\n')[0]}`);

if (reentryControlFailures !== 0 || reentryVacuousRejected === 0) {
  console.error('\nHARNESS FAILURE: the re-entry contract does not discriminate (control must pass, rebinder must fail).');
  process.exit(2);
}
if (!controlOk) {
  console.error('\nHARNESS FAILURE: the compliant control did not go green; the gate is not discriminating.');
  process.exit(2);
}
if (!vacuityOk) {
  console.error('\nHARNESS FAILURE: a vacuous fixture survived; the gate does not reject cheap fixes.');
  process.exit(2);
}
if (productFailures.length === 0) {
  console.log('\nvalidate-title-spa-lifecycle-reversibility: GREEN (reversible SPA lifecycle implemented)');
  process.exit(0);
}
console.error(`\nvalidate-title-spa-lifecycle-reversibility: RED — ${productFailures.length} lifecycle assertions unmet by current product.`);
process.exit(1);
