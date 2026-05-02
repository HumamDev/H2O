// Phase 2.6 validation — hard failures only (no console.assert).
// Simulates both extension-page context and page-relay context.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT  = path.resolve(SCRIPT_DIR, '..', '..', '..', '..');
const IDENTITY_SCRIPT = path.join(
  REPO_ROOT, 'scripts', '0D4a.⬛️🔐 Identity Core 🔐.js'
);

function assert(condition, message) {
  if (!condition) throw new Error(`FAIL: ${message}`);
}

// ── Minimal chrome.storage.local mock ────────────────────────────────────────
function makeMockStorage() {
  const store = {};
  return {
    _store: store,
    get(keys, cb) {
      const result = {};
      const ks = Array.isArray(keys) ? keys : (keys ? [keys] : Object.keys(store));
      for (const k of ks) result[k] = store[k];
      setTimeout(() => cb(result), 0);
    },
    set(obj, cb) {
      Object.assign(store, obj);
      setTimeout(() => (cb && cb()), 0);
    },
    remove(keys, cb) {
      const ks = Array.isArray(keys) ? keys : [keys];
      for (const k of ks) delete store[k];
      setTimeout(() => (cb && cb()), 0);
    },
  };
}

// ── Minimal window/global shim ────────────────────────────────────────────────
function makeGlobal(opts = {}) {
  const ls = {};
  const listeners = {};
  const g = {
    H2O: undefined,
    dispatchEvent(ev) {
      const fns = listeners[ev.type] || [];
      for (const fn of fns) try { fn(ev); } catch (_) {}
    },
    addEventListener(type, fn) {
      (listeners[type] = listeners[type] || []).push(fn);
    },
    removeEventListener(type, fn) {
      listeners[type] = (listeners[type] || []).filter(f => f !== fn);
    },
    // Simulate window.postMessage: deliver a message event back to this window
    // with source === this (mirrors browser same-window postMessage semantics).
    postMessage(data, _target) {
      const ev = Object.assign(new g.CustomEvent('message'), { source: g, data });
      setTimeout(() => g.dispatchEvent(ev), 0);
    },
    CustomEvent: class CustomEvent {
      constructor(type, init) { this.type = type; this.detail = init?.detail; }
    },
    location: opts.location || { protocol: 'https:' },
    console,
    localStorage: {
      _store: ls,
      getItem: k => Object.prototype.hasOwnProperty.call(ls, k) ? ls[k] : null,
      setItem: (k, v) => { ls[k] = String(v); },
      removeItem: k => { delete ls[k]; },
    },
    setTimeout,
    clearTimeout,
    Date,
    JSON,
    Object,
    Array,
    Math,
    Promise,
    Error,
    Set,
    Map,
  };
  if (opts.chrome) g.chrome = opts.chrome;
  return g;
}

// ── Boot Identity Core into a given global ────────────────────────────────────
function bootIdentity(g) {
  const src = fs.readFileSync(IDENTITY_SCRIPT, 'utf8');
  // Strip the @UserScript metadata block and the outer IIFE wrapper so we
  // can inject `global` as our shim.  We extract the function body and eval it.
  const fn = new Function('unsafeWindow', src + '\n//# sourceURL=0D4a-identity.js');
  fn.call(g, g);
  return g.H2O.Identity;
}

// ── Flush all pending micro/macro tasks ──────────────────────────────────────
async function flushTimers(ms = 200) {
  await new Promise(r => setTimeout(r, ms));
}

// ─────────────────────────────────────────────────────────────────────────────
// SUITE A — Extension-page context (direct chrome.runtime.sendMessage)
// ─────────────────────────────────────────────────────────────────────────────
async function suiteA() {
  console.log('\n── Suite A: extension-page bridge ──────────────────────────────');
  const storage = makeMockStorage();
  const STORAGE_KEY = 'h2oIdentityMockSnapshotV1';
  const MSG_NS = 'h2o-ext-identity:v1';

  // Simulate the background message handler from chrome-live-background.mjs
  function bgHandleMessage(msg, _sender, sendResponse) {
    if (!msg || msg.type !== MSG_NS) return false;
    const { action, snapshot } = msg.req || {};
    if (action === 'identity:get-snapshot') {
      storage.get([STORAGE_KEY], (result) => {
        const snap = result[STORAGE_KEY];
        sendResponse({ ok: true, snapshot: snap || null });
      });
      return true; // async
    }
    if (action === 'identity:set-snapshot') {
      storage.set({ [STORAGE_KEY]: snapshot }, () => sendResponse({ ok: true }));
      return true;
    }
    if (action === 'identity:clear-snapshot') {
      storage.remove([STORAGE_KEY], () => sendResponse({ ok: true }));
      return true;
    }
    return false;
  }

  function makeChromeRuntime() {
    return {
      sendMessage(msg, cb) {
        bgHandleMessage(msg, {}, (resp) => setTimeout(() => cb(resp), 5));
        return undefined;
      },
      lastError: undefined,
    };
  }

  // ── A1: Instance 1 — onboarding to profile_ready ──────────────────────────
  const g1 = makeGlobal({
    location: { protocol: 'chrome-extension:' },
    chrome: { runtime: makeChromeRuntime(), storage: { local: storage } },
  });
  const id1 = bootIdentity(g1);
  await flushTimers(300); // let tryHydrateFromBridge settle

  assert(id1.selfCheck().ok, 'A1: selfCheck passes on instance 1');
  assert(id1.getState() === 'anonymous_local', 'A1: starts anonymous_local');

  await id1.signInWithEmail('alice@example.com');
  assert(id1.getState() === 'email_pending', 'A1: after signInWithEmail → email_pending');

  await id1.verifyEmailCode({ code: '123456' });
  assert(id1.getState() === 'verified_no_profile', 'A1: after verifyEmailCode → verified_no_profile');

  await id1.createInitialWorkspace({ displayName: 'Alice' });
  assert(id1.getState() === 'profile_ready', 'A1: after createInitialWorkspace → profile_ready');
  assert(id1.getProfile()?.displayName === 'Alice', 'A1: profile displayName is Alice');

  // Wait for debounced bridge write (80ms)
  await flushTimers(250);

  const bridgeAfterOnboarding = storage._store[STORAGE_KEY];
  assert(
    bridgeAfterOnboarding && typeof bridgeAfterOnboarding === 'object',
    'A2: snapshot written to chrome.storage.local'
  );
  assert(
    bridgeAfterOnboarding.status === 'profile_ready',
    `A2: bridge snapshot status is profile_ready (got: ${bridgeAfterOnboarding?.status})`
  );
  console.log('  bridge after onboarding: profile_ready ✓');

  // ── A3: Instance 2 — fresh boot, empty localStorage, hydrates from bridge ─
  const g2 = makeGlobal({
    location: { protocol: 'chrome-extension:' },
    chrome: { runtime: makeChromeRuntime(), storage: { local: storage } },
  });
  // g2 localStorage is empty — shared chrome storage still has the snapshot
  const id2 = bootIdentity(g2);
  await flushTimers(300); // let tryHydrateFromBridge resolve

  assert(
    id2.getState() === 'profile_ready',
    `A3: instance 2 hydrated from bridge to profile_ready (got: ${id2.getState()})`
  );
  assert(
    id2.getProfile()?.displayName === 'Alice',
    `A3: hydrated profile displayName is Alice (got: ${id2.getProfile()?.displayName})`
  );
  console.log('  after hydration: profile_ready ✓');
  console.log('  hydrated displayName: Alice ✓');

  // ── A4: signOut clears bridge ──────────────────────────────────────────────
  await id1.signOut();
  await flushTimers(150);

  const bridgeAfterSignOut = storage._store[STORAGE_KEY];
  assert(
    bridgeAfterSignOut === undefined,
    `A4: bridge cleared after signOut (got: ${JSON.stringify(bridgeAfterSignOut)})`
  );
  console.log('  bridge after signOut: (cleared) ✓');

  // ── A5: No token-like field in snapshot ───────────────────────────────────
  // Re-onboard briefly to get a snapshot to inspect
  await id1.signInWithEmail('alice@example.com');
  await id1.verifyEmailCode({ code: '123456' });
  await id1.createInitialWorkspace({ displayName: 'Alice' });
  await flushTimers(250);

  const snapToInspect = storage._store[STORAGE_KEY];
  const TOKEN_PATTERNS = /token|secret|password|credential|bearer|jwt|refresh/i;
  const snapKeys = Object.keys(snapToInspect || {});
  const dangerousKeys = snapKeys.filter(k => TOKEN_PATTERNS.test(k));
  assert(dangerousKeys.length === 0, `A5: no token-like keys in snapshot (found: ${dangerousKeys.join(', ')})`);
  const snapValues = JSON.stringify(snapToInspect || '');
  // Heuristic: no field whose value looks like a JWT (three base64url segments)
  assert(
    !/eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}/.test(snapValues),
    'A5: no JWT-shaped value in snapshot'
  );
  console.log('  no token-like field in snapshot ✓');

  // ── A6: selfCheck on both instances ──────────────────────────────────────
  assert(id1.selfCheck().ok, 'A6: selfCheck still passes on instance 1');
  assert(id2.selfCheck().ok, 'A6: selfCheck still passes on instance 2 (hydrated)');
  console.log('  selfCheck both instances ✓');

  console.log('Suite A PASSED ✓');
}

// ─────────────────────────────────────────────────────────────────────────────
// SUITE B — Page context (postMessage relay, no chrome.runtime)
// ─────────────────────────────────────────────────────────────────────────────
async function suiteB() {
  console.log('\n── Suite B: page-context relay ──────────────────────────────────');
  const MSG_NS     = 'h2o-ext-identity:v1';
  const MSG_REQ    = 'h2o-ext-identity:v1:req';
  const MSG_RES    = 'h2o-ext-identity:v1:res';
  const STORAGE_KEY = 'h2oIdentityMockSnapshotV1';

  // ── B1: boots without chrome.runtime ─────────────────────────────────────
  const g = makeGlobal({ location: { protocol: 'https:' } }); // no chrome
  // Intercept postMessage calls for inspection; do NOT dispatch them back so
  // the relay times out naturally (no loader listener in this test).
  const postMessageCalls = [];
  g.postMessage = (data, target) => { postMessageCalls.push({ data, target }); };

  const id = bootIdentity(g);
  await flushTimers(50);

  assert(id.selfCheck().ok, 'B1: selfCheck passes without chrome.runtime');
  assert(id.getState() === 'anonymous_local', 'B1: starts anonymous_local without chrome.runtime');
  console.log('  boots without chrome.runtime ✓');

  // ── B2: attempts postMessage relay on bridge call ─────────────────────────
  // tryHydrateFromBridge fires at boot; with no relay listener it times out.
  // Verify the relay postMessage was attempted synchronously.
  const relayAttempt = postMessageCalls.find(c => c.data?.type === MSG_REQ);
  assert(
    relayAttempt !== undefined,
    `B2: postMessage relay attempted for bridge (calls: ${JSON.stringify(postMessageCalls.map(c => c.data?.type))})`
  );
  assert(
    relayAttempt.data.req?.action === 'identity:get-snapshot',
    `B2: relay action is identity:get-snapshot (got: ${relayAttempt.data.req?.action})`
  );
  console.log('  postMessage relay attempted ✓');

  // ── B3: local fallback works when relay unavailable ───────────────────────
  // The timeout (1800ms) will silently resolve to null; meanwhile localStorage
  // is the authoritative store. Verify state changes still persist locally.
  await id.signInWithEmail('bob@example.com');
  assert(id.getState() === 'email_pending', 'B3: signInWithEmail still works (localStorage fallback)');
  const stored = g.localStorage.getItem('h2o:prm:cgx:identity:v1:snapshot');
  assert(stored !== null, 'B3: state persisted to localStorage');
  const parsed = JSON.parse(stored);
  assert(parsed.status === 'email_pending', `B3: localStorage has email_pending (got: ${parsed.status})`);
  console.log('  local fallback still works ✓');

  // ── B4: loader relay simulation ───────────────────────────────────────────
  // Simulate what chrome-live-loader.mjs does: listen for MSG_REQ, forward to
  // a mock bg handler, post MSG_RES back to the page.
  const storage = makeMockStorage();
  const existingSnapshot = { status: 'profile_ready', displayName: 'Charlie', updatedAt: '2099-01-01T00:00:00.000Z' };
  storage._store[STORAGE_KEY] = existingSnapshot;

  const g2 = makeGlobal({ location: { protocol: 'https:' } });
  let postMsg2Calls = [];

  // Install a simulated loader relay on g2
  const relayListener = (ev) => {
    if (ev.source !== g2) return;
    const d = ev.data;
    if (!d || d.type !== MSG_REQ) return;
    const { action } = d.req || {};
    const respond = (payload) => {
      g2.dispatchEvent(Object.assign(new g2.CustomEvent('message'), {
        source: g2,
        data: { type: MSG_RES, id: d.id, ok: true, ...payload }
      }));
    };
    if (action === 'identity:get-snapshot') {
      storage.get([STORAGE_KEY], (r) => respond({ snapshot: r[STORAGE_KEY] || null }));
    }
  };
  g2.addEventListener('message', relayListener);

  const id2 = bootIdentity(g2);
  await flushTimers(300);

  assert(
    id2.getState() === 'profile_ready',
    `B4: relay hydration works — got ${id2.getState()}`
  );
  console.log('  relay hydration from loader simulation ✓');

  console.log('Suite B PASSED ✓');
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  try {
    await suiteA();
    await suiteB();
    console.log('\n═══════════════════════════════════════');
    console.log('Phase 2.6 validation PASSED — all checks ✓');
    console.log('═══════════════════════════════════════\n');
  } catch (err) {
    console.error('\n═══════════════════════════════════════');
    console.error('Phase 2.6 validation FAILED');
    console.error(err.message);
    console.error('═══════════════════════════════════════\n');
    process.exitCode = 1;
  }
}

main();
