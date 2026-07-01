#!/usr/bin/env node
// Validator for Studio Reader & Notes MVP-A2a.5:
// operator-only, read-only reader-root resolution probe (no rendering).

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..', '..', '..');

const UI_REL = 'src-surfaces-base/studio/reader-notes/highlight-resolution-ui.studio.js';
const STUDIO_HTML_REL = 'src-surfaces-base/studio/studio.html';
const PACK_REL = 'tools/product/studio/pack-studio.mjs';
const EVIDENCE_REL = 'release-evidence/2026-07-01/reader-notes-a2a5-reader-root-resolution-probe.md';

const A2A3_VALIDATOR_REL = 'tools/validation/reader-notes/validate-reader-notes-mvp-a2a_3-loader-pack-inert-exposure.mjs';
const A2A4_CONSUMER_VALIDATOR_REL = 'tools/validation/reader-notes/validate-reader-notes-mvp-a2a_4-highlight-resolution-consumer.mjs';
const A2A4_READINESS_VALIDATOR_REL = 'tools/validation/reader-notes/validate-reader-notes-mvp-a2a_4-consumer-readiness.mjs';
const A2A2D_VALIDATOR_REL = 'tools/validation/reader-notes/validate-reader-notes-mvp-a2a_2d-flags-read-purity.mjs';
const A2A2_VALIDATOR_REL = 'tools/validation/reader-notes/validate-reader-notes-mvp-a2a_2.mjs';
const A2A_VALIDATOR_REL = 'tools/validation/reader-notes/validate-reader-notes-mvp-a2a.mjs';
const A1_3_VALIDATOR_REL = 'tools/validation/reader-notes/validate-reader-notes-mvp-a1_3.mjs';
const A1_2_VALIDATOR_REL = 'tools/validation/reader-notes/validate-reader-notes-mvp-a1_2.mjs';
const A1_1_VALIDATOR_REL = 'tools/validation/reader-notes/validate-reader-notes-mvp-a1_1.mjs';
const A0_VALIDATOR_REL = 'tools/validation/reader-notes/validate-reader-notes-architecture-contract-v1_2.mjs';

const FLAG_KEY = 'studio.readerNotes.highlightResolutionUi.enabled';
const OPT_IN_KEY = 'h2o.readerNotes.highlightResolutionUi.operatorOptIn';
const CHAT_ID = 'chat-a2a5';

const pass = [];
const fail = [];

function read(rel) {
  const full = path.join(REPO_ROOT, rel);
  assert.ok(fs.existsSync(full), `${rel} must exist`);
  return fs.readFileSync(full, 'utf8');
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

function runValidator(rel) {
  const full = path.join(REPO_ROOT, rel);
  assert.ok(fs.existsSync(full), `${rel} must exist`);
  try {
    const out = execFileSync('node', [full], { cwd: REPO_ROOT, encoding: 'utf8' });
    assert.ok(/validation passed|tauri-webkit-console-harness-generated/.test(out), `${rel} did not report passed`);
  } catch (error) {
    const output = (error && (error.stdout || '')) + (error && (error.stderr || ''));
    throw new Error(`${rel} failed (exit ${error && error.status}): ${output.slice(-1200)}`);
  }
}

function defaultConsumerResult(itemId) {
  return {
    schemaVersion: 1,
    itemId,
    resolved: [
      {
        annotationId: 'highlight-a2a5',
        nativeId: 'native-a2a5',
        answerId: 'answer-a2a5',
        source: { store: 'highlights', chatId: itemId, answerId: 'answer-a2a5' },
        status: 'anchored',
        span: { start: 6, end: 24 },
        selectorUsed: 'textQuote',
        confidence: 1,
        reason: 'textQuote-exact',
        text: 'some selected text',
        diagnostics: { xpathDeferred: true, tried: ['textQuote'] },
      },
    ],
    unresolved: [],
    diagnostics: { reason: 'ok', resolvedCount: 1, unresolvedCount: 0 },
  };
}

function makeSandbox(opts = {}) {
  const {
    uiFlag = false,
    optIn = null,
    publicRelease = false,
    hasViewReader = true,
    hasFrame = true,
    frameChatId = CHAT_ID,
    includeConsumer = true,
    consumerThrows = null,
    consumerResult = undefined,
  } = opts;

  const storageCalls = [];
  const flagCalls = [];
  const writeCalls = [];
  const hookCalls = [];
  const consumerCalls = [];
  const domMutations = [];

  const cgFrame = {
    nodeType: 1,
    className: 'cgFrame',
    dataset: { chatId: frameChatId },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    appendChild() { domMutations.push('frame.appendChild'); },
    insertBefore() { domMutations.push('frame.insertBefore'); },
    setAttribute() { domMutations.push('frame.setAttribute'); },
    removeChild() { domMutations.push('frame.removeChild'); },
  };
  const viewReader = {
    nodeType: 1,
    id: 'viewReader',
    querySelector(sel) { return (sel === '.cgFrame' && hasFrame) ? cgFrame : null; },
    querySelectorAll() { return []; },
    appendChild() { domMutations.push('viewReader.appendChild'); },
  };
  const body = {
    nodeType: 1,
    innerHTML: '<div class="reader-body">baseline</div>',
    childNodes: [{ nodeType: 1 }],
    querySelectorAll() { return []; },
    appendChild() { domMutations.push('body.appendChild'); },
  };
  const documentMock = {
    getElementById(id) { return (id === 'viewReader' && hasViewReader) ? viewReader : null; },
    body,
    createElement(tag) { domMutations.push(`createElement:${tag}`); return { tagName: String(tag), appendChild() {}, setAttribute() {} }; },
    createRange() { domMutations.push('document.createRange'); return {}; },
    evaluate() { hookCalls.push('document.evaluate'); return null; },
    addEventListener() { hookCalls.push('document.addEventListener'); },
    removeEventListener() { hookCalls.push('document.removeEventListener'); },
  };

  const consumerMock = includeConsumer ? {
    __installed: true,
    readonly: true,
    isEnabled() { return true; },
    resolveForItem(itemId, root, options) {
      consumerCalls.push({ itemId, rootIsFrame: root === cgFrame, options: JSON.parse(JSON.stringify(options || {})) });
      if (consumerThrows) throw consumerThrows;
      return consumerResult !== undefined ? consumerResult : defaultConsumerResult(itemId);
    },
  } : undefined;

  const readerNotes = {};
  if (consumerMock) readerNotes.highlightResolutionConsumer = consumerMock;

  const sandbox = {
    H2O: {
      flags: {
        get(key, fallback) {
          flagCalls.push({ key, fallback });
          if (key === FLAG_KEY) return uiFlag;
          return fallback;
        },
        set() { writeCalls.push('flags.set'); },
        remove() { writeCalls.push('flags.remove'); },
        clear() { writeCalls.push('flags.clear'); },
      },
      Studio: {
        readerNotes,
        release: { publicRelease: !!publicRelease },
      },
      events: { on() { hookCalls.push('H2O.events.on'); } },
      bus: { on() { hookCalls.push('H2O.bus.on'); } },
    },
    document: documentMock,
    localStorage: {
      getItem(key) { storageCalls.push(['getItem', key]); return key === OPT_IN_KEY ? optIn : null; },
      setItem(key, value) { storageCalls.push(['setItem', key, value]); },
      removeItem(key) { storageCalls.push(['removeItem', key]); },
      clear() { storageCalls.push(['clear']); },
    },
    sessionStorage: {
      setItem(key, value) { storageCalls.push(['session.setItem', key, value]); },
      removeItem(key) { storageCalls.push(['session.removeItem', key]); },
      clear() { storageCalls.push(['session.clear']); },
    },
    addEventListener() { hookCalls.push('addEventListener'); },
    setTimeout() { hookCalls.push('setTimeout'); return 0; },
    setInterval() { hookCalls.push('setInterval'); return 0; },
    requestAnimationFrame() { hookCalls.push('requestAnimationFrame'); return 0; },
    MutationObserver: function MutationObserver() { hookCalls.push('MutationObserver'); return { observe() { hookCalls.push('observe'); }, disconnect() {} }; },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(read(UI_REL), sandbox, { filename: UI_REL });

  return { sandbox, cgFrame, viewReader, body, storageCalls, flagCalls, writeCalls, hookCalls, consumerCalls, domMutations };
}

function uiOf(rt) {
  return rt.sandbox.H2O.Studio.readerNotes.highlightResolutionUi;
}

function storageWrites(calls) {
  return calls.filter((call) => !String(call[0]).endsWith('getItem'));
}

function assertSerializable(value) {
  const encoded = JSON.stringify(value);
  assert.ok(encoded && encoded.length > 0, 'value must JSON encode');
  assert.equal(JSON.stringify(JSON.parse(encoded)), encoded, 'JSON round-trip must be stable');
}

function assertNoLiveNodes(result) {
  const seen = new Set();
  (function walk(v) {
    if (!v || typeof v !== 'object') return;
    if (seen.has(v)) return;
    seen.add(v);
    assert.ok(!('nodeType' in v), 'result must not expose live DOM nodes');
    for (const k of Object.keys(v)) walk(v[k]);
  }(result));
  assert.ok(!Object.prototype.hasOwnProperty.call(result, 'frame'), 'result must not expose frame');
  assert.ok(!Object.prototype.hasOwnProperty.call(result, 'root'), 'result must not expose root');
}

check('probe module source exists with approved public surface and safe reads only', () => {
  const source = read(UI_REL);
  has(source, 'highlightResolutionUi', 'UI namespace');
  has(source, FLAG_KEY, 'UI flag key');
  has(source, OPT_IN_KEY, 'UI opt-in key');
  has(source, "getElementById('viewReader')", 'reader view lookup');
  has(source, "querySelector('.cgFrame')", 'reader frame lookup');
  has(source, 'dataset.chatId', 'itemId derivation');
  has(source, 'resolveForItem', 'consumer invocation');
  for (const token of [
    "createElement('mark')",
    '.appendChild(',
    '.insertBefore(',
    '.setAttribute(',
    '.innerHTML =',
    'innerHTML=',
    'document.evaluate',
    'localStorage.setItem',
    'localStorage.removeItem',
    'localStorage.clear',
    'sessionStorage.setItem',
    '.textContent =',
    'sidecar',
    'enrichment',
    'renderer',
    'native_note',
    'imported_document',
    'converted_note',
    'saved-chat',
  ]) {
    hasNot(source, token, `probe source safety ${token}`);
  }
});

check('loader and pack include the UI probe last, after the consumer', () => {
  const order = [
    'reader-notes/library-item-view.studio.js',
    'reader-notes/annotation-facade.studio.js',
    'reader-notes/anchor-resolver.studio.js',
    'reader-notes/anchor-resolver-dom.studio.js',
    'reader-notes/highlight-resolution-consumer.studio.js',
    'reader-notes/highlight-resolution-ui.studio.js',
  ];
  for (const [rel, text] of [[STUDIO_HTML_REL, read(STUDIO_HTML_REL)], [PACK_REL, read(PACK_REL)]]) {
    let last = -1;
    for (const token of order) {
      const idx = text.indexOf(token);
      assert.ok(idx >= 0, `${rel} missing ${token}`);
      assert.ok(idx > last, `${rel} order violation for ${token}`);
      last = idx;
    }
  }
});

check('module installs frozen, default-off, and inert at load', () => {
  const rt = makeSandbox({ uiFlag: false, optIn: null });
  const ui = uiOf(rt);
  assert.ok(ui && ui.__installed === true, 'installed');
  assert.ok(Object.isFrozen(ui), 'frozen');
  assert.deepEqual(Object.keys(ui).sort(), ['__installed', 'diagnose', 'flagKey', 'isEnabled', 'optInKey', 'probe', 'readonly', 'selfCheck', 'version'].sort());
  assert.equal(ui.readonly, true);
  assert.equal(ui.flagKey, FLAG_KEY);
  assert.equal(ui.optInKey, OPT_IN_KEY);
  assert.equal(ui.isEnabled(), false);
  assert.deepEqual(rt.consumerCalls, [], 'no consumer calls at load');
  assert.deepEqual(storageWrites(rt.storageCalls), [], 'no storage writes at load');
  assert.deepEqual(rt.writeCalls, [], 'no flag writes at load');
  assert.deepEqual(rt.hookCalls, [], 'no hooks/timers/observers at load');
  assert.deepEqual(rt.domMutations, [], 'no DOM mutation at load');
});

check('isEnabled requires flag AND opt-in AND non-public-release', () => {
  assert.equal(uiOf(makeSandbox({ uiFlag: false, optIn: 'true' })).isEnabled(), false, 'flag off => disabled');
  assert.equal(uiOf(makeSandbox({ uiFlag: true, optIn: null })).isEnabled(), false, 'no opt-in => disabled');
  assert.equal(uiOf(makeSandbox({ uiFlag: true, optIn: 'true', publicRelease: true })).isEnabled(), false, 'public release => disabled');
  assert.equal(uiOf(makeSandbox({ uiFlag: true, optIn: 'true' })).isEnabled(), true, 'flag + opt-in + private => enabled');
});

check('disabled probe returns safe result without invoking the consumer', () => {
  const rt = makeSandbox({ uiFlag: false, optIn: 'true' });
  const out = uiOf(rt).probe();
  assert.equal(out.status, 'disabled');
  assert.equal(out.rootFound, false);
  assert.deepEqual(rt.consumerCalls, []);
  assert.deepEqual(rt.domMutations, []);
  assert.deepEqual(storageWrites(rt.storageCalls), []);
});

check('public-release probe returns safe result without invoking the consumer', () => {
  const rt = makeSandbox({ uiFlag: true, optIn: 'true', publicRelease: true });
  const out = uiOf(rt).probe();
  assert.equal(out.status, 'public-release-disabled');
  assert.deepEqual(rt.consumerCalls, []);
});

check('missing opt-in disables the probe', () => {
  const rt = makeSandbox({ uiFlag: true, optIn: null });
  const out = uiOf(rt).probe();
  assert.equal(out.status, 'disabled');
  assert.deepEqual(rt.consumerCalls, []);
});

check('missing #viewReader / .cgFrame / chatId / consumer all fail closed', () => {
  let rt = makeSandbox({ uiFlag: true, optIn: 'true', hasViewReader: false });
  let out = uiOf(rt).probe();
  assert.equal(out.status, 'no-reader-view');
  assert.equal(out.rootFound, false);
  assert.deepEqual(rt.consumerCalls, []);

  rt = makeSandbox({ uiFlag: true, optIn: 'true', hasFrame: false });
  out = uiOf(rt).probe();
  assert.equal(out.status, 'no-reader-frame');
  assert.deepEqual(rt.consumerCalls, []);

  rt = makeSandbox({ uiFlag: true, optIn: 'true', frameChatId: '' });
  out = uiOf(rt).probe();
  assert.equal(out.status, 'missing-chat-id');
  assert.equal(out.rootFound, true);
  assert.deepEqual(rt.consumerCalls, []);

  rt = makeSandbox({ uiFlag: true, optIn: 'true', includeConsumer: false });
  out = uiOf(rt).probe();
  assert.equal(out.status, 'consumer-unavailable');
  assert.equal(out.itemId, CHAT_ID);
});

check('valid probe invokes consumer with (itemId, frame, options) and returns data-only rows', () => {
  const rt = makeSandbox({ uiFlag: true, optIn: 'true' });
  const beforeBody = rt.body.innerHTML;
  const out = uiOf(rt).probe({ note: 'a2a5-probe' });
  assert.equal(out.status, 'ok');
  assert.equal(out.itemId, CHAT_ID);
  assert.equal(out.rootFound, true);
  assert.equal(out.resolvedCount, 1);
  assert.equal(out.unresolvedCount, 0);
  assert.ok(out.result && Array.isArray(out.result.resolved) && out.result.resolved.length === 1, 'data-only result carried');
  // consumer received the real frame + itemId + options
  assert.equal(rt.consumerCalls.length, 1);
  assert.equal(rt.consumerCalls[0].itemId, CHAT_ID);
  assert.equal(rt.consumerCalls[0].rootIsFrame, true);
  assert.deepEqual(rt.consumerCalls[0].options, { note: 'a2a5-probe' });
  // data-only: serializable, no live nodes
  assertSerializable(out);
  assertNoLiveNodes(out);
  // no mutation / no writes / no rendering
  assert.deepEqual(rt.domMutations, [], 'no DOM mutation');
  assert.equal(rt.body.innerHTML, beforeBody, 'reader body unchanged');
  assert.deepEqual(storageWrites(rt.storageCalls), [], 'no storage writes');
  assert.deepEqual(rt.writeCalls, [], 'no flag writes');
});

check('consumer throwing is caught and the probe fails closed', () => {
  const rt = makeSandbox({ uiFlag: true, optIn: 'true', consumerThrows: new Error('boom') });
  const out = uiOf(rt).probe();
  assert.equal(out.status, 'probe-error');
  assert.deepEqual(rt.domMutations, []);
  assert.deepEqual(storageWrites(rt.storageCalls), []);
});

check('no marks, overlays, or reader DOM mutation across probe (no-render proof)', () => {
  const rt = makeSandbox({ uiFlag: true, optIn: 'true' });
  const beforeBody = rt.body.innerHTML;
  uiOf(rt).probe();
  uiOf(rt).probe();
  assert.equal(rt.body.innerHTML, beforeBody, 'body html unchanged');
  assert.deepEqual(rt.domMutations, [], 'no createElement/appendChild/setAttribute/insertBefore anywhere');
  const source = read(UI_REL);
  hasNot(source, "'mark'", 'no mark tag creation');
  hasNot(source, 'data-overlay-inline', 'no inline overlay attribute');
  hasNot(source, 'data-highlight-id', 'no highlight-id attribute');
});

check('diagnose/selfCheck advertise read-only, no-render, no-live-nodes, XPath deferred', () => {
  const rt = makeSandbox({ uiFlag: true, optIn: 'true' });
  const ui = uiOf(rt);
  const d = ui.diagnose();
  assert.equal(d.readonly, true);
  assert.equal(d.rendersUi, false);
  assert.equal(d.mutatesDom, false);
  assert.equal(d.returnsLiveNodes, false);
  assert.equal(d.xpath, 'deferred');
  assert.equal(d.consumerAvailable, true);
  assert.deepEqual(Array.from(d.supported), ['probe']);
  assert.equal(ui.selfCheck().flagKey, FLAG_KEY);
  assert.equal(ui.selfCheck().optInKey, OPT_IN_KEY);
});

check('evidence doc records A2a.5 probe scope and deferral', () => {
  const evidence = read(EVIDENCE_REL);
  for (const token of [
    'A2a.5 is an operator diagnostic probe only',
    'No rendering',
    '#viewReader',
    '.cgFrame',
    'frame.dataset.chatId',
    'data-only',
    'UI rendering is deferred to A2a.6',
    'A2a.5b real-boot smoke is required before any rendering slice',
    'STUDIO_OVERLAY_CONTRACT.md',
    'XPath remains deferred',
  ]) {
    has(evidence, token, 'A2a.5 evidence');
  }
});

check('updated A2a.3 loader/pack inert exposure validator still passes', () => runValidator(A2A3_VALIDATOR_REL));
check('A2a.4.2 consumer validator still passes', () => runValidator(A2A4_CONSUMER_VALIDATOR_REL));
check('A2a.4.1 consumer-readiness validator still passes', () => runValidator(A2A4_READINESS_VALIDATOR_REL));
check('A2a.2d validator still passes', () => runValidator(A2A2D_VALIDATOR_REL));
check('A2a.2 validator still passes', () => runValidator(A2A2_VALIDATOR_REL));
check('A2a validator still passes', () => runValidator(A2A_VALIDATOR_REL));
check('A1.3 validator still passes', () => runValidator(A1_3_VALIDATOR_REL));
check('A1.2 validator still passes', () => runValidator(A1_2_VALIDATOR_REL));
check('A1.1 validator still passes', () => runValidator(A1_1_VALIDATOR_REL));
check('A0 contract validator still passes', () => runValidator(A0_VALIDATOR_REL));

if (fail.length) {
  console.log(`\nReader & Notes MVP-A2a.5 reader-root resolution probe validation failed: ${fail.length} failed, ${pass.length} passed.`);
  process.exitCode = 1;
} else {
  console.log(`\nReader & Notes MVP-A2a.5 reader-root resolution probe validation passed: ${pass.length} checks.`);
}
