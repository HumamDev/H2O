// Onboarding URL fix validation.
// Verifies the full URL resolution chain: bridge relay → chrome.runtime.getURL.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const IDENTITY_SCRIPT = path.join(REPO_ROOT, 'scripts', '0D4a.⬛️🔐 Identity Core 🔐.js');
const LOADER_SCRIPT   = path.join(REPO_ROOT, 'tools', 'product', 'extension', 'chrome-live-loader.mjs');
const BG_SCRIPT       = path.join(REPO_ROOT, 'tools', 'product', 'extension', 'chrome-live-background.mjs');

function assert(condition, message) {
  if (!condition) throw new Error(`FAIL: ${message}`);
}

const identitySrc = fs.readFileSync(IDENTITY_SCRIPT, 'utf8');
const loaderSrc   = fs.readFileSync(LOADER_SCRIPT, 'utf8');
const bgSrc       = fs.readFileSync(BG_SCRIPT, 'utf8');

// ── Suite A: static source checks ────────────────────────────────────────────
console.log('\n── Suite A: static source checks ────────────────────────────────');

// A1: resolveOnboardingUrl is now async
assert(identitySrc.includes('async function resolveOnboardingUrl()'), 'A1: resolveOnboardingUrl is async');
console.log('  resolveOnboardingUrl is async ✓');

// A2: openOnboarding is now async
assert(identitySrc.includes('async function openOnboarding('), 'A2: openOnboarding is async');
console.log('  openOnboarding is async ✓');

// A3: resolveOnboardingUrl uses bridge as fallback
assert(identitySrc.includes("sendBridge('identity:get-onboarding-url')"), 'A3: uses bridge for URL');
console.log('  calls sendBridge(identity:get-onboarding-url) ✓');

// A4: validates chrome-extension:// prefix before using bridge response
assert(identitySrc.includes("res.url.startsWith('chrome-extension://')"), 'A4: validates chrome-extension:// prefix on bridge response');
console.log('  validates chrome-extension:// prefix ✓');

// A5: returns null (not relative URL) when both paths fail
assert(!identitySrc.includes("return '/surfaces/identity/identity.html'"), 'A5: no relative URL fallback remaining');
assert(identitySrc.includes('return null;'), 'A5: returns null when URL cannot be resolved');
console.log('  no relative URL fallback — returns null on failure ✓');

// A6: openOnboarding guards against null URL (never calls window.open with null)
assert(identitySrc.includes('if (!url) {'), 'A6: openOnboarding guards null URL');
console.log('  openOnboarding refuses to open if url is null ✓');

// A7: background handler for identity:get-onboarding-url
assert(bgSrc.includes('action === "identity:get-onboarding-url"'), 'A7: background handles identity:get-onboarding-url');
assert(bgSrc.includes('chrome.runtime.getURL("surfaces/identity/identity.html")'), 'A7: background uses chrome.runtime.getURL');
console.log('  background handler for identity:get-onboarding-url ✓');

// A8: loader ALLOW_ACTIONS includes identity:get-onboarding-url
assert(loaderSrc.includes('"identity:get-onboarding-url"'), 'A8: loader ALLOW_ACTIONS includes identity:get-onboarding-url');
console.log('  loader ALLOW_ACTIONS includes identity:get-onboarding-url ✓');

// A9: Control Hub action checks return value
const chubScript = path.join(REPO_ROOT, 'scripts', '0Z1a.⬛️🕹️ Control Hub 🕹️.js');
const chubSrc = fs.readFileSync(chubScript, 'utf8');
const chubAccountScript = path.join(REPO_ROOT, 'scripts', '0Z1e.⚫️🔐 Account Tab (Control Hub 🔌 Plugin) 🔐.js');
const chubAccountSrc = fs.readFileSync(chubAccountScript, 'utf8');
const chubAccountSurface = `${chubSrc}\n${chubAccountSrc}`;
assert(chubAccountSurface.includes("? { message: 'Onboarding page opened.' }"), 'A9: Control Hub Account surface checks win truthy');
assert(chubAccountSurface.includes("Could not open onboarding"), 'A9: Control Hub Account surface shows failure message');
console.log('  Control Hub reports failure correctly ✓');

console.log('Suite A PASSED ✓');

// ── Suite B: functional test — page context bridge relay ─────────────────────
console.log('\n── Suite B: functional test — page context URL resolution ────────');

// Reuse the global shim from phase 2.6 validation pattern
function makeGlobal(opts = {}) {
  const ls = {};
  const listeners = {};
  const g = {
    H2O: undefined,
    dispatchEvent(ev) {
      const fns = listeners[ev.type] || [];
      for (const fn of fns) try { fn(ev); } catch (_) {}
    },
    addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
    removeEventListener(type, fn) {
      listeners[type] = (listeners[type] || []).filter(f => f !== fn);
    },
    postMessage(data, _target) {
      const ev = Object.assign(new g.CustomEvent('message'), { source: g, data });
      setTimeout(() => g.dispatchEvent(ev), 0);
    },
    CustomEvent: class CustomEvent {
      constructor(type, init) { this.type = type; this.detail = init?.detail; }
    },
    location: opts.location || { protocol: 'https:', origin: 'https://chatgpt.com' },
    open: opts.open || (() => ({ _mockWindow: true })),
    console,
    localStorage: {
      _store: ls,
      getItem: k => Object.prototype.hasOwnProperty.call(ls, k) ? ls[k] : null,
      setItem: (k, v) => { ls[k] = String(v); },
      removeItem: k => { delete ls[k]; },
    },
    setTimeout, clearTimeout, Date, JSON, Object, Array, Math, Promise, Error, Set, Map,
  };
  if (opts.chrome) g.chrome = opts.chrome;
  return g;
}

function bootIdentity(g) {
  const src = fs.readFileSync(IDENTITY_SCRIPT, 'utf8');
  const fn = new Function('unsafeWindow', src + '\n//# sourceURL=0D4a-identity.js');
  fn.call(g, g);
  return g.H2O.Identity;
}

async function flushTimers(ms = 200) {
  await new Promise(r => setTimeout(r, ms));
}

const FAKE_EXT_URL = 'chrome-extension://abcdef1234567890/surfaces/identity/identity.html';
const MSG_NS  = 'h2o-ext-identity:v1';
const MSG_REQ = 'h2o-ext-identity:v1:req';
const MSG_RES = 'h2o-ext-identity:v1:res';

// ── B1: page context — URL resolved via relay ─────────────────────────────────
{
  const g = makeGlobal({ location: { protocol: 'https:', origin: 'https://chatgpt.com' } });
  let openedUrl = null;
  g.open = (url) => { openedUrl = url; return { _mockWindow: true }; };

  // Simulate loader relay: intercepts identity:get-onboarding-url, returns fake ext URL
  g.addEventListener('message', (ev) => {
    if (ev.source !== g) return;
    const d = ev.data;
    if (!d || d.type !== MSG_REQ) return;
    if (d.req?.action === 'identity:get-onboarding-url') {
      setTimeout(() => {
        g.dispatchEvent(Object.assign(new g.CustomEvent('message'), {
          source: g,
          data: { type: MSG_RES, id: d.id, ok: true, url: FAKE_EXT_URL }
        }));
      }, 5);
    }
    // Other actions (get-snapshot) → let them time out naturally for this test
  });

  const id = bootIdentity(g);
  await flushTimers(300); // allow hydration attempt to settle

  const win = await id.openOnboarding();

  assert(win !== null, 'B1: openOnboarding returns non-null window ref');
  assert(openedUrl === FAKE_EXT_URL, `B1: opened correct chrome-extension:// URL (got: ${openedUrl})`);
  assert(!String(openedUrl).includes('chatgpt.com'), 'B1: does not open chatgpt.com URL');
  console.log('  page context opens chrome-extension:// via relay ✓');
}

// ── B2: page context — relay returns wrong-origin URL → rejected ──────────────
{
  const g = makeGlobal({ location: { protocol: 'https:', origin: 'https://chatgpt.com' } });
  let openedUrl = null;
  g.open = (url) => { openedUrl = url; return { _mockWindow: true }; };

  // Relay returns a wrong URL (https:// not chrome-extension://)
  g.addEventListener('message', (ev) => {
    if (ev.source !== g) return;
    const d = ev.data;
    if (!d || d.type !== MSG_REQ || d.req?.action !== 'identity:get-onboarding-url') return;
    setTimeout(() => {
      g.dispatchEvent(Object.assign(new g.CustomEvent('message'), {
        source: g,
        data: { type: MSG_RES, id: d.id, ok: true, url: 'https://chatgpt.com/surfaces/identity/identity.html' }
      }));
    }, 5);
  });

  const id = bootIdentity(g);
  await flushTimers(300);
  const win = await id.openOnboarding();

  assert(win === null, 'B2: openOnboarding returns null when bridge returns non-extension URL');
  assert(openedUrl === null, 'B2: window.open NOT called when bridge returns wrong origin');
  console.log('  rejects non-chrome-extension:// URL from bridge ✓');
}

// ── B3: page context — relay unavailable → null (not relative URL) ────────────
{
  const g = makeGlobal({ location: { protocol: 'https:', origin: 'https://chatgpt.com' } });
  let openedUrl = null;
  g.open = (url) => { openedUrl = url; return { _mockWindow: true }; };
  // No relay listener — sendBridgeRelay will time out (BRIDGE_TIMEOUT_MS = 1800ms)
  // We override it to time out fast by injecting a fast-timeout response.
  // We'll test with an explicit options.url = null call instead, which is faster.
  // Actually, let's just check that when bridge returns null, window.open is not called.

  // Simulate relay returning ok:false
  g.addEventListener('message', (ev) => {
    if (ev.source !== g) return;
    const d = ev.data;
    if (!d || d.type !== MSG_REQ || d.req?.action !== 'identity:get-onboarding-url') return;
    setTimeout(() => {
      g.dispatchEvent(Object.assign(new g.CustomEvent('message'), {
        source: g,
        data: { type: MSG_RES, id: d.id, ok: false, error: 'test' }
      }));
    }, 5);
  });

  const id = bootIdentity(g);
  await flushTimers(300);
  const win = await id.openOnboarding();

  assert(win === null, 'B3: returns null when bridge returns ok:false');
  assert(openedUrl === null, 'B3: window.open NOT called when bridge fails');
  assert(!String(openedUrl || '').includes('chatgpt.com'), 'B3: chatgpt.com URL never opened');
  console.log('  does not fall back to chatgpt.com when bridge fails ✓');
}

// ── B4: extension-page context — uses chrome.runtime.getURL directly ──────────
{
  const DIRECT_EXT_URL = 'chrome-extension://xyz999/surfaces/identity/identity.html';
  const g = makeGlobal({
    location: { protocol: 'chrome-extension:' },
    chrome: {
      runtime: {
        getURL: (path) => `chrome-extension://xyz999/${path}`,
        sendMessage: (_msg, cb) => setTimeout(() => cb({ ok: true, url: DIRECT_EXT_URL }), 5),
        lastError: undefined,
      },
    },
  });
  let openedUrl = null;
  g.open = (url) => { openedUrl = url; return { _mockWindow: true }; };

  const id = bootIdentity(g);
  await flushTimers(300);
  const win = await id.openOnboarding();

  assert(win !== null, 'B4: extension-page context opens successfully');
  assert(String(openedUrl).startsWith('chrome-extension://'), 'B4: opened chrome-extension:// URL directly');
  console.log('  extension-page context uses chrome.runtime.getURL directly ✓');
}

console.log('Suite B PASSED ✓');

// ── Suite C: built output checks ──────────────────────────────────────────────
console.log('\n── Suite C: built output checks ──────────────────────────────────');

const builtLoader = fs.readFileSync(
  path.join(REPO_ROOT, 'build', 'chrome-ext-dev-controls', 'loader.js'), 'utf8'
);
const builtBg = fs.readFileSync(
  path.join(REPO_ROOT, 'build', 'chrome-ext-dev-controls', 'bg.js'), 'utf8'
);

assert(builtLoader.includes('"identity:get-onboarding-url"'), 'C1: built loader ALLOW_ACTIONS has identity:get-onboarding-url');
console.log('  built loader includes identity:get-onboarding-url ✓');

assert(builtBg.includes('identity:get-onboarding-url'), 'C2: built bg.js handles identity:get-onboarding-url');
console.log('  built bg.js handles identity:get-onboarding-url ✓');

const manifest = JSON.parse(fs.readFileSync(
  path.join(REPO_ROOT, 'build', 'chrome-ext-dev-controls', 'manifest.json'), 'utf8'
));
const war = manifest.web_accessible_resources || [];
const hasIdentityWar = war.some(r =>
  Array.isArray(r.resources) && r.resources.includes('surfaces/identity/identity.html')
);
assert(hasIdentityWar, 'C3: manifest web_accessible_resources includes surfaces/identity/identity.html');
console.log('  manifest web_accessible_resources covers identity.html ✓');

console.log('Suite C PASSED ✓');

console.log('\n═══════════════════════════════════════════════════');
console.log('Onboarding URL fix validation PASSED — all checks ✓');
console.log('═══════════════════════════════════════════════════\n');
