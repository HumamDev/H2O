#!/usr/bin/env node
// Validator for Studio Reader & Notes MVP-A2a.3:
// loader/pack inert exposure for the read-only anchor resolver modules.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..', '..', '..');

const STUDIO_HTML_REL = 'src-surfaces-base/studio/studio.html';
const PACK_REL = 'tools/product/studio/pack-studio.mjs';
const CORE_REL = 'src-surfaces-base/studio/reader-notes/anchor-resolver.studio.js';
const DOM_REL = 'src-surfaces-base/studio/reader-notes/anchor-resolver-dom.studio.js';
const CONSUMER_REL = 'src-surfaces-base/studio/reader-notes/highlight-resolution-consumer.studio.js';
const UI_REL = 'src-surfaces-base/studio/reader-notes/highlight-resolution-ui.studio.js';
const A1_LIBRARY_REL = 'src-surfaces-base/studio/reader-notes/library-item-view.studio.js';
const A1_ANNOTATION_REL = 'src-surfaces-base/studio/reader-notes/annotation-facade.studio.js';
const CHROME_EVIDENCE_REL = 'release-evidence/2026-06-30/reader-notes-a2a2-real-dom-smoke.md';
const WEBKIT_EVIDENCE_REL = 'release-evidence/2026-06-30/reader-notes-a2a2c-tauri-webkit-smoke.md';
const FLAGS_EVIDENCE_REL = 'release-evidence/2026-06-30/reader-notes-a2a2d-flags-read-purity.md';
const A2A3_EVIDENCE_REL = 'release-evidence/2026-06-30/reader-notes-a2a3-loader-pack-inert-exposure.md';

const A2A2D_VALIDATOR_REL = 'tools/validation/reader-notes/validate-reader-notes-mvp-a2a_2d-flags-read-purity.mjs';
const A2A2C_VALIDATOR_REL = 'tools/validation/reader-notes/validate-reader-notes-mvp-a2a_2_tauri-webkit-smoke.mjs';
const A2A2_VALIDATOR_REL = 'tools/validation/reader-notes/validate-reader-notes-mvp-a2a_2.mjs';
const A2A_VALIDATOR_REL = 'tools/validation/reader-notes/validate-reader-notes-mvp-a2a.mjs';
const A1_3_VALIDATOR_REL = 'tools/validation/reader-notes/validate-reader-notes-mvp-a1_3.mjs';
const A1_2_VALIDATOR_REL = 'tools/validation/reader-notes/validate-reader-notes-mvp-a1_2.mjs';
const A1_1_VALIDATOR_REL = 'tools/validation/reader-notes/validate-reader-notes-mvp-a1_1.mjs';
const A0_VALIDATOR_REL = 'tools/validation/reader-notes/validate-reader-notes-architecture-contract-v1_2.mjs';

const ORDER = [
  'reader-notes/library-item-view.studio.js',
  'reader-notes/annotation-facade.studio.js',
  'reader-notes/anchor-resolver.studio.js',
  'reader-notes/anchor-resolver-dom.studio.js',
  'reader-notes/highlight-resolution-consumer.studio.js',
  'reader-notes/highlight-resolution-ui.studio.js',
];
const FLAG_KEY = 'studio.readerNotes.anchorResolver.enabled';
const CONSUMER_FLAG_KEY = 'studio.readerNotes.highlightResolutionConsumer.enabled';
const UI_FLAG_KEY = 'studio.readerNotes.highlightResolutionUi.enabled';
const UI_OPT_IN_KEY = 'h2o.readerNotes.highlightResolutionUi.operatorOptIn';
const CONSUMER_TOKENS = [
  'H2O.Studio.readerNotes.anchorResolver',
  'H2O.Studio.readerNotes.anchorResolverDom',
  'H2O.Studio.readerNotes.highlightResolutionConsumer',
  'H2O.Studio.readerNotes.highlightResolutionUi',
  'highlightResolutionUi',
  'resolveHighlight',
  'resolveInText',
  'flattenRoot',
  'spanToRange',
  'resolveForItem',
];
const ALLOWED_CONSUMER_RELS = new Set([
  CORE_REL,
  DOM_REL,
  CONSUMER_REL,
  UI_REL,
  STUDIO_HTML_REL,
]);
const FORBIDDEN_DIRS = [
  'src-surfaces-base/studio/sync',
  'src-surfaces-base/studio/ingestion',
  'apps/studio/desktop/src-tauri',
  'src-runtime-base',
];

const pass = [];
const fail = [];

function read(rel) {
  const full = path.join(REPO_ROOT, rel);
  assert.ok(fs.existsSync(full), `${rel} must exist`);
  return fs.readFileSync(full, 'utf8');
}

function readIfExists(rel) {
  const full = path.join(REPO_ROOT, rel);
  return fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : null;
}

function check(label, fn) {
  try {
    fn();
    pass.push(label);
    console.log(`[ok] ${label}`);
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    fail.push({ label, message });
    console.log(`[fail] ${label}`);
    console.log(`       ${message}`);
  }
}

function has(text, needle, label) {
  assert.ok(text.includes(needle), `${label}: missing "${needle}"`);
}

function hasNot(text, needle, label) {
  assert.ok(!text.includes(needle), `${label}: must NOT contain "${needle}"`);
}

function assertNoConflictMarkers(rel, text) {
  for (const marker of ['<<<<<<<', '=======', '>>>>>>>']) {
    assert.ok(!text.includes(marker), `${rel} contains conflict marker ${marker}`);
  }
}

function indexOrder(text, tokens, label) {
  let last = -1;
  for (const token of tokens) {
    const idx = text.indexOf(token);
    assert.ok(idx >= 0, `${label}: missing ${token}`);
    assert.ok(idx > last, `${label}: ${token} must appear after prior Reader & Notes entry`);
    last = idx;
  }
}

function extractArrayBody(source, name) {
  const marker = `export const ${name} = Object.freeze([`;
  const start = source.indexOf(marker);
  assert.ok(start >= 0, `missing ${name}`);
  const bodyStart = source.indexOf('[', start);
  let depth = 0;
  for (let i = bodyStart; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '[') depth += 1;
    else if (ch === ']') {
      depth -= 1;
      if (depth === 0) return source.slice(bodyStart + 1, i);
    }
  }
  throw new Error(`unterminated ${name}`);
}

function quotedEntries(body) {
  const entries = [];
  const uncommented = body.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const re = /"([^"]+)"/g;
  let match;
  while ((match = re.exec(uncommented))) entries.push(match[1]);
  return entries;
}

function listSourceFiles(dirRel) {
  const root = path.join(REPO_ROOT, dirRel);
  const out = [];
  function visit(abs) {
    let entries = [];
    try { entries = fs.readdirSync(abs, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const next = path.join(abs, entry.name);
      if (entry.isDirectory()) visit(next);
      else if (/\.(js|mjs|html)$/i.test(entry.name)) out.push(path.relative(REPO_ROOT, next));
    }
  }
  visit(root);
  return out;
}

function makeInstrumentedSandbox(flagValue) {
  const storageCalls = [];
  const domCalls = [];
  const flagCalls = [];
  const writeCalls = [];
  const hookCalls = [];
  const sandbox = {
    H2O: {
      flags: flagValue === 'missing' ? undefined : {
        get(key, fallback) {
          flagCalls.push({ key, fallback });
          return flagValue === undefined ? fallback : flagValue;
        },
        set() { writeCalls.push('set'); },
        remove() { writeCalls.push('remove'); },
        clear() { writeCalls.push('clear'); },
      },
      Studio: { readerNotes: {} },
      events: { on() { hookCalls.push('H2O.events.on'); } },
      bus: { on() { hookCalls.push('H2O.bus.on'); } },
    },
    addEventListener() { hookCalls.push('addEventListener'); },
    removeEventListener() { hookCalls.push('removeEventListener'); },
    setTimeout() { hookCalls.push('setTimeout'); return 0; },
    clearTimeout() { hookCalls.push('clearTimeout'); },
    setInterval() { hookCalls.push('setInterval'); return 0; },
    clearInterval() { hookCalls.push('clearInterval'); },
    requestAnimationFrame() { hookCalls.push('requestAnimationFrame'); return 0; },
    cancelAnimationFrame() { hookCalls.push('cancelAnimationFrame'); },
    MutationObserver: function MutationObserver() { hookCalls.push('MutationObserver'); return { observe() { hookCalls.push('observe'); }, disconnect() {} }; },
    localStorage: {
      getItem(key) { storageCalls.push(['getItem', key]); return null; },
      setItem(key, value) { storageCalls.push(['setItem', key, value]); },
      removeItem(key) { storageCalls.push(['removeItem', key]); },
      clear() { storageCalls.push(['clear']); },
    },
    sessionStorage: {
      setItem(key, value) { storageCalls.push(['session.setItem', key, value]); },
      removeItem(key) { storageCalls.push(['session.removeItem', key]); },
      clear() { storageCalls.push(['session.clear']); },
    },
    document: {
      addEventListener() { hookCalls.push('document.addEventListener'); },
      removeEventListener() { hookCalls.push('document.removeEventListener'); },
      createRange() { domCalls.push('createRange'); return {}; },
      evaluate() { domCalls.push('evaluate'); return null; },
      body: {
        appendChild() { domCalls.push('appendChild'); },
        removeChild() { domCalls.push('removeChild'); },
      },
    },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  return { sandbox, storageCalls, domCalls, flagCalls, writeCalls, hookCalls };
}

function loadResolvers(flagValue, includeConsumer = false, includeUi = false) {
  const rt = makeInstrumentedSandbox(flagValue);
  vm.runInContext(read(CORE_REL), rt.sandbox, { filename: CORE_REL });
  vm.runInContext(read(DOM_REL), rt.sandbox, { filename: DOM_REL });
  if (includeConsumer) vm.runInContext(read(CONSUMER_REL), rt.sandbox, { filename: CONSUMER_REL });
  if (includeUi) vm.runInContext(read(UI_REL), rt.sandbox, { filename: UI_REL });
  return rt;
}

function storageWrites(calls) {
  return calls.filter((call) => !String(call[0]).endsWith('getItem'));
}

function runValidator(rel) {
  const full = path.join(REPO_ROOT, rel);
  assert.ok(fs.existsSync(full), `${rel} must exist`);
  try {
    const out = execFileSync('node', [full], { cwd: REPO_ROOT, encoding: 'utf8' });
    assert.ok(/validation passed|tauri-webkit-console-harness-generated/.test(out), `${rel} did not report passed`);
  } catch (error) {
    const output = (error && (error.stdout || '')) + (error && (error.stderr || ''));
    throw new Error(`${rel} failed (exit ${error && error.status}): ${output.slice(-1000)}`);
  }
}

check('studio.html includes resolver scripts in the approved Reader & Notes order', () => {
  const html = read(STUDIO_HTML_REL);
  assertNoConflictMarkers(STUDIO_HTML_REL, html);
  for (const token of ORDER) has(html, token, 'studio.html Reader & Notes order');
  indexOrder(html, ORDER, 'studio.html');
});

check('pack-studio includes resolver files in both lockstep lists with matching indices', () => {
  const pack = read(PACK_REL);
  assertNoConflictMarkers(PACK_REL, pack);
  const sourceEntries = quotedEntries(extractArrayBody(pack, 'ARCHIVE_WORKBENCH_SOURCE_FILES'));
  const outEntries = quotedEntries(extractArrayBody(pack, 'ARCHIVE_WORKBENCH_OUT_FILES'));
  for (const token of ORDER) {
    const srcIdx = sourceEntries.indexOf(token);
    const outIdx = outEntries.indexOf(token);
    assert.ok(srcIdx >= 0, `source list missing ${token}`);
    assert.ok(outIdx >= 0, `out list missing ${token}`);
    assert.equal(srcIdx, outIdx, `${token} must use matching source/out index`);
  }
  const srcOrder = ORDER.map((token) => sourceEntries.indexOf(token));
  const outOrder = ORDER.map((token) => outEntries.indexOf(token));
  assert.deepEqual(srcOrder, srcOrder.slice().sort((a, b) => a - b), 'source order must be A1.1/A1.2/A2a core/A2a DOM/A2a.4 consumer/A2a.5 UI probe');
  assert.deepEqual(outOrder, outOrder.slice().sort((a, b) => a - b), 'out order must be A1.1/A1.2/A2a core/A2a DOM/A2a.4 consumer/A2a.5 UI probe');
});

check('resolver and consumer module load installs frozen APIs and performs no storage, DOM, or hook writes', () => {
  const rt = loadResolvers(undefined, true);
  const api = rt.sandbox.H2O.Studio.readerNotes.anchorResolver;
  const domApi = rt.sandbox.H2O.Studio.readerNotes.anchorResolverDom;
  const consumerApi = rt.sandbox.H2O.Studio.readerNotes.highlightResolutionConsumer;
  assert.ok(api && api.__installed === true, 'core API installed');
  assert.ok(domApi && domApi.__installed === true, 'DOM API installed');
  assert.ok(consumerApi && consumerApi.__installed === true, 'consumer API installed');
  assert.ok(Object.isFrozen(api), 'core API frozen');
  assert.ok(Object.isFrozen(domApi), 'DOM API frozen');
  assert.ok(Object.isFrozen(consumerApi), 'consumer API frozen');
  assert.equal(api.flagKey, FLAG_KEY);
  assert.equal(domApi.flagKey, FLAG_KEY);
  assert.equal(consumerApi.flagKey, CONSUMER_FLAG_KEY);
  assert.deepEqual(storageWrites(rt.storageCalls), [], 'module load must not write storage');
  assert.deepEqual(rt.domCalls, [], 'module load must not touch DOM');
  assert.deepEqual(rt.flagCalls, [], 'module load must not read flags before methods are called');
  assert.deepEqual(rt.hookCalls, [], 'module load must not install hooks or timers');
});

check('default-off and missing flags keep resolver APIs disabled and inert', () => {
  let rt = loadResolvers(undefined, true);
  assert.equal(rt.sandbox.H2O.Studio.readerNotes.anchorResolver.isEnabled(), false);
  assert.equal(rt.sandbox.H2O.Studio.readerNotes.anchorResolverDom.isEnabled(), false);
  assert.equal(rt.sandbox.H2O.Studio.readerNotes.highlightResolutionConsumer.isEnabled(), false);
  assert.deepEqual(storageWrites(rt.storageCalls), []);
  assert.deepEqual(rt.domCalls, []);
  assert.deepEqual(rt.writeCalls, []);
  assert.deepEqual(rt.hookCalls, []);
  assert.deepEqual(rt.flagCalls.map((call) => call.key), [FLAG_KEY, FLAG_KEY, CONSUMER_FLAG_KEY]);

  rt = loadResolvers('missing', true);
  assert.equal(rt.sandbox.H2O.Studio.readerNotes.anchorResolver.isEnabled(), false);
  assert.equal(rt.sandbox.H2O.Studio.readerNotes.anchorResolverDom.isEnabled(), false);
  assert.equal(rt.sandbox.H2O.Studio.readerNotes.highlightResolutionConsumer.isEnabled(), false);
  assert.deepEqual(storageWrites(rt.storageCalls), []);
  assert.deepEqual(rt.domCalls, []);
  assert.deepEqual(rt.writeCalls, []);
  assert.deepEqual(rt.hookCalls, []);
});

check('selfCheck and diagnose report frozen read-only APIs with XPath deferred', () => {
  const rt = loadResolvers(false, true);
  const api = rt.sandbox.H2O.Studio.readerNotes.anchorResolver;
  const domApi = rt.sandbox.H2O.Studio.readerNotes.anchorResolverDom;
  const consumerApi = rt.sandbox.H2O.Studio.readerNotes.highlightResolutionConsumer;
  assert.equal(api.selfCheck().enabled, false);
  assert.equal(domApi.selfCheck().enabled, false);
  assert.equal(consumerApi.selfCheck().enabled, false);
  assert.equal(api.selfCheck().xpath, 'deferred');
  assert.equal(domApi.selfCheck().xpath, 'deferred');
  assert.equal(consumerApi.diagnose().xpath, 'deferred');
  assert.equal(consumerApi.diagnose().returnsLiveRange, false);
  assert.deepEqual(Array.from(api.diagnose().deferredSelectors), ['xpath']);
  assert.deepEqual(Array.from(domApi.diagnose().deferredSelectors), ['xpath']);
  assert.deepEqual(storageWrites(rt.storageCalls), []);
  assert.deepEqual(rt.domCalls, []);
  assert.deepEqual(rt.writeCalls, []);
  assert.deepEqual(rt.hookCalls, []);
});

check('A2a.5 UI probe module loads frozen, default-off, and inert', () => {
  const rt = loadResolvers(undefined, true, true);
  const uiApi = rt.sandbox.H2O.Studio.readerNotes.highlightResolutionUi;
  assert.ok(uiApi && uiApi.__installed === true, 'UI probe installed');
  assert.ok(Object.isFrozen(uiApi), 'UI probe frozen');
  assert.equal(uiApi.readonly, true);
  assert.equal(uiApi.flagKey, UI_FLAG_KEY);
  assert.equal(uiApi.optInKey, UI_OPT_IN_KEY);
  assert.equal(typeof uiApi.probe, 'function');
  assert.deepEqual(storageWrites(rt.storageCalls), [], 'UI load must not write storage');
  assert.deepEqual(rt.domCalls, [], 'UI load must not touch DOM');
  assert.deepEqual(rt.hookCalls, [], 'UI load must not install hooks or timers');
  assert.equal(uiApi.isEnabled(), false, 'UI probe default-off (no flag, no opt-in)');
});

check('no A1 integration, UI consumer, or resolver auto-invocation exists outside allowed modules', () => {
  const violations = [];
  for (const rel of listSourceFiles('src-surfaces-base/studio')) {
    if (ALLOWED_CONSUMER_RELS.has(rel)) continue;
    const text = read(rel);
    for (const token of CONSUMER_TOKENS) {
      if (text.includes(token)) violations.push(`${rel}: ${token}`);
    }
  }
  assert.deepEqual(violations, []);
  for (const rel of [A1_LIBRARY_REL, A1_ANNOTATION_REL, 'src-surfaces-base/studio/studio.js']) {
    const text = read(rel);
    for (const token of CONSUMER_TOKENS) hasNot(text, token, `${rel} consumer token ${token}`);
  }
});

check('forbidden areas do not contain A2a.3 resolver consumer footprint', () => {
  for (const dir of FORBIDDEN_DIRS) {
    for (const rel of listSourceFiles(dir)) {
      const text = read(rel);
      for (const token of CONSUMER_TOKENS) {
        assert.ok(!text.includes(token), `${rel} must not contain ${token}`);
      }
    }
  }
});

check('prior A2a evidence gates are present', () => {
  const chrome = read(CHROME_EVIDENCE_REL);
  const webkit = read(WEBKIT_EVIDENCE_REL);
  const flags = read(FLAGS_EVIDENCE_REL);
  has(chrome, 'real-dom-smoke-passed', 'Chrome/Blink evidence');
  has(webkit, 'WebKit gate status: CLOSED', 'Tauri/WebKit evidence');
  has(webkit, 'tauri-webkit-smoke-passed', 'Tauri/WebKit result');
  has(flags, 'H2O.flags.get(key, fallback) is read-pure', 'flags read-purity evidence');
});

check('A2a.3 evidence records inert loader/pack exposure and rollback', () => {
  const evidence = read(A2A3_EVIDENCE_REL);
  for (const token of [
    'A2a.3 exposes the resolver modules inertly through loader/pack only',
    'reader-notes/anchor-resolver.studio.js',
    'reader-notes/anchor-resolver-dom.studio.js',
    'Chrome/Blink proof gate already passed',
    'Tauri/WebKit proof gate already closed',
    'flags.get read-purity gate already passed',
    'No UI consumer is invoked',
    'No A1 integration is implemented',
    'No XPath is implemented',
    'No DOM/storage writes occur during module load',
    'A2a.3b real-boot namespace-installation confirmation is required before any consumer slice',
  ]) {
    has(evidence, token, 'A2a.3 evidence');
  }
});

check('A2a.2d validator still passes', () => runValidator(A2A2D_VALIDATOR_REL));
check('A2a.2c Tauri/WebKit generator validator still passes', () => runValidator(A2A2C_VALIDATOR_REL));
check('A2a.2 validator still passes', () => runValidator(A2A2_VALIDATOR_REL));
check('A2a validator still passes', () => runValidator(A2A_VALIDATOR_REL));
check('A1.3 validator still passes', () => runValidator(A1_3_VALIDATOR_REL));
check('A1.2 validator still passes', () => runValidator(A1_2_VALIDATOR_REL));
check('A1.1 validator still passes', () => runValidator(A1_1_VALIDATOR_REL));
check('A0 contract validator still passes', () => runValidator(A0_VALIDATOR_REL));

if (fail.length) {
  console.log(`\nReader & Notes MVP-A2a.3 loader/pack inert exposure validation failed: ${fail.length} failed, ${pass.length} passed.`);
  process.exitCode = 1;
} else {
  console.log(`\nReader & Notes MVP-A2a.3 loader/pack inert exposure validation passed: ${pass.length} checks.`);
}
