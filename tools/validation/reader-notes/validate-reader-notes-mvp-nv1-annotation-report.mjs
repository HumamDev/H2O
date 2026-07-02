#!/usr/bin/env node
// Validator for Studio Reader & Notes NV1:
// read-only non-visual annotation report consumer.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..', '..', '..');

const REPORT_REL = 'src-surfaces-base/studio/reader-notes/annotation-report.studio.js';
const STUDIO_HTML_REL = 'src-surfaces-base/studio/studio.html';
const PACK_REL = 'tools/product/studio/pack-studio.mjs';
const EVIDENCE_REL = 'release-evidence/2026-07-01/reader-notes-nv1-annotation-report.md';

const A2A5_VALIDATOR_REL = 'tools/validation/reader-notes/validate-reader-notes-mvp-a2a_5-reader-root-resolution-probe.mjs';
const A2A3_VALIDATOR_REL = 'tools/validation/reader-notes/validate-reader-notes-mvp-a2a_3-loader-pack-inert-exposure.mjs';
const A2A4_VALIDATOR_REL = 'tools/validation/reader-notes/validate-reader-notes-mvp-a2a_4-highlight-resolution-consumer.mjs';
const A2A4_READINESS_VALIDATOR_REL = 'tools/validation/reader-notes/validate-reader-notes-mvp-a2a_4-consumer-readiness.mjs';
const A2A2D_VALIDATOR_REL = 'tools/validation/reader-notes/validate-reader-notes-mvp-a2a_2d-flags-read-purity.mjs';
const A2A2_VALIDATOR_REL = 'tools/validation/reader-notes/validate-reader-notes-mvp-a2a_2.mjs';
const A2A_VALIDATOR_REL = 'tools/validation/reader-notes/validate-reader-notes-mvp-a2a.mjs';
const A1_3_VALIDATOR_REL = 'tools/validation/reader-notes/validate-reader-notes-mvp-a1_3.mjs';
const A1_2_VALIDATOR_REL = 'tools/validation/reader-notes/validate-reader-notes-mvp-a1_2.mjs';
const A1_1_VALIDATOR_REL = 'tools/validation/reader-notes/validate-reader-notes-mvp-a1_1.mjs';
const A0_VALIDATOR_REL = 'tools/validation/reader-notes/validate-reader-notes-architecture-contract-v1_2.mjs';

const FLAG_KEY = 'studio.readerNotes.annotationReport.enabled';
const OPT_IN_KEY = 'h2o.readerNotes.annotationReport.operatorOptIn';
const ITEM_ID = 'chat-nv1';
const ANSWER_ID = 'answer-nv1';

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
    throw new Error(`${rel} failed (exit ${error && error.status}): ${output.slice(-1400)}`);
  }
}

function json(value) {
  return JSON.parse(JSON.stringify(value));
}

function walk(root, fn) {
  if (!root) return;
  fn(root);
  for (const child of root.childNodes || []) walk(child, fn);
}

function textContent(root) {
  let out = '';
  walk(root, (node) => { if (node.nodeType === 3) out += node.nodeValue; });
  return out;
}

function nodeCount(root) {
  let count = 0;
  walk(root, () => { count += 1; });
  return count;
}

function makeText(value) {
  return { nodeType: 3, nodeValue: String(value), childNodes: [], parentNode: null };
}

function makeElement(tagName, attrs = {}, children = []) {
  const attr = new Map(Object.entries(attrs).map(([key, value]) => [key, String(value)]));
  const node = {
    nodeType: 1,
    tagName: String(tagName).toUpperCase(),
    childNodes: [],
    dataset: {},
    parentNode: null,
    getAttribute(name) { return attr.has(name) ? attr.get(name) : null; },
    hasAttribute(name) { return attr.has(name); },
    querySelector(selector) {
      let found = null;
      walk(this, (candidate) => {
        if (found || candidate === this || candidate.nodeType !== 1) return;
        if (selector === '.cgFrame' && String(candidate.getAttribute('class') || '').split(/\s+/).includes('cgFrame')) found = candidate;
      });
      return found;
    },
    querySelectorAll(selector) {
      const out = [];
      walk(this, (candidate) => {
        if (candidate === this || candidate.nodeType !== 1) return;
        if (selector === '[data-message-id]' && candidate.hasAttribute('data-message-id')) out.push(candidate);
      });
      return out;
    },
  };
  Object.keys(attrs).forEach((key) => {
    if (key.startsWith('data-')) {
      const prop = key.slice(5).replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
      node.dataset[prop] = String(attrs[key]);
    }
  });
  for (const child of children) {
    child.parentNode = node;
    node.childNodes.push(child);
  }
  return node;
}

function makeFrame(itemId = ITEM_ID) {
  const msg = makeElement('div', {
    'data-message-id': ANSWER_ID,
    'data-message-author-role': 'assistant',
  }, [makeText('alpha some selected text omega')]);
  const frame = makeElement('div', { class: 'cgFrame', 'data-chat-id': itemId }, [msg]);
  return { frame, msg };
}

function makeDocument(frame) {
  const host = makeElement('section', { id: 'viewReader' }, [frame]);
  return {
    getElementById(id) {
      return id === 'viewReader' ? host : null;
    },
  };
}

function highlightAnnotation(id = 'highlight-nv1') {
  return {
    schemaVersion: 1,
    kind: 'highlight',
    id,
    attribution: 'attributed',
    source: { store: 'highlights', chatId: ITEM_ID, answerId: ANSWER_ID, nativeId: id, convoId: `c/${ITEM_ID}` },
    raw: { anchors: { textQuote: { exact: 'some selected text' }, textPos: { start: 6, end: 24 }, xpath: { deferred: true } } },
  };
}

function noteAnnotation() {
  return {
    schemaVersion: 1,
    kind: 'note',
    id: 'note-nv1',
    source: { store: 'notes', chatId: ITEM_ID },
    body: { text: 'reader note' },
    raw: { note: 'reader note' },
  };
}

function bookmarkAnnotation() {
  return {
    schemaVersion: 1,
    kind: 'bookmark',
    id: 'bookmark-nv1',
    source: { store: 'bookmarks', chatId: ITEM_ID },
    body: { title: 'reader bookmark' },
    raw: { bookmark: true },
  };
}

function makeSandbox({ flag = false, optIn = false, publicRelease = false, withDocument = true, withAnnotations = true, withConsumer = true, annotationsThrow = null } = {}) {
  const storageCalls = [];
  const flagCalls = [];
  const hookCalls = [];
  const mutationCalls = [];
  const annotationCalls = [];
  const consumerCalls = [];
  const { frame } = makeFrame();
  const annotationsByKind = {
    highlight: [highlightAnnotation()],
    note: [noteAnnotation()],
    bookmark: [bookmarkAnnotation()],
  };
  const sandbox = {
    H2O: {
      flags: {
        get(key, fallback) {
          flagCalls.push({ key, fallback });
          return key === FLAG_KEY ? flag : fallback;
        },
        set() { storageCalls.push(['flags.set']); },
      },
      Studio: {
        config: { publicRelease },
        readerNotes: {},
      },
      events: { on() { hookCalls.push('H2O.events.on'); } },
      bus: { on() { hookCalls.push('H2O.bus.on'); } },
    },
    localStorage: {
      getItem(key) { storageCalls.push(['getItem', key]); return key === OPT_IN_KEY && optIn ? '1' : null; },
      setItem(key, value) { storageCalls.push(['setItem', key, value]); },
      removeItem(key) { storageCalls.push(['removeItem', key]); },
      clear() { storageCalls.push(['clear']); },
    },
    addEventListener() { hookCalls.push('addEventListener'); },
    setTimeout() { hookCalls.push('setTimeout'); return 0; },
    setInterval() { hookCalls.push('setInterval'); return 0; },
    requestAnimationFrame() { hookCalls.push('requestAnimationFrame'); return 0; },
    MutationObserver: function MutationObserver() { hookCalls.push('MutationObserver'); return { observe() { hookCalls.push('observe'); }, disconnect() {} }; },
    document: withDocument ? makeDocument(frame) : undefined,
  };
  if (withAnnotations) {
    sandbox.H2O.Studio.readerNotes.annotations = {
      __installed: true,
      readonly: true,
      isEnabled: () => true,
      listForItem(itemId, options) {
        annotationCalls.push({ itemId, options: json(options || {}) });
        if (annotationsThrow) throw annotationsThrow;
        return annotationsByKind[options && options.kind] || [];
      },
    };
  }
  if (withConsumer) {
    sandbox.H2O.Studio.readerNotes.highlightResolutionConsumer = {
      __installed: true,
      readonly: true,
      isEnabled: () => true,
      resolveForItem(itemId, root, options) {
        consumerCalls.push({ itemId, rootFound: !!root, options: json(options || {}) });
        return {
          schemaVersion: 1,
          itemId,
          resolved: [{
            annotationId: 'highlight-resolved',
            nativeId: 'highlight-resolved',
            answerId: ANSWER_ID,
            source: { answerId: ANSWER_ID },
            status: 'anchored',
            span: { start: 6, end: 24 },
            selectorUsed: 'textQuote',
            confidence: 1,
            reason: 'textQuote-exact',
            text: 'some selected text',
            diagnostics: { xpathDeferred: true },
            range: { forbidden: true },
            msgEl: { forbidden: true },
            annotation: { forbidden: true },
          }],
          unresolved: [{
            annotationId: 'highlight-orphaned',
            nativeId: 'highlight-orphaned',
            answerId: 'missing-answer',
            source: { answerId: 'missing-answer' },
            status: 'orphaned',
            span: null,
            selectorUsed: null,
            confidence: 0,
            reason: 'resolver-orphaned',
            text: '',
            diagnostics: {},
            range: { forbidden: true },
          }],
          diagnostics: { considered: 2 },
        };
      },
    };
  }
  sandbox.document = withDocument ? makeDocument(frame) : undefined;
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(read(REPORT_REL), sandbox, { filename: REPORT_REL });
  return { sandbox, frame, storageCalls, flagCalls, hookCalls, mutationCalls, annotationCalls, consumerCalls };
}

function storageWrites(calls) {
  return calls.filter((call) => !String(call[0]).endsWith('getItem'));
}

function assertSerializable(value) {
  const encoded = JSON.stringify(value);
  assert.ok(encoded && encoded.length > 0, 'value must encode as JSON');
  assert.equal(JSON.stringify(JSON.parse(encoded)), encoded, 'JSON round-trip must be stable');
}

function assertNoLiveLeak(value) {
  const encoded = JSON.stringify(value);
  assert.ok(!encoded.includes('forbidden'), 'report must strip live object placeholders');
  assert.ok(!encoded.includes('"range"'), 'report must not expose Range');
  assert.ok(!encoded.includes('"msgEl"'), 'report must not expose msgEl');
  assert.ok(!encoded.includes('"annotation"'), 'report must not expose annotation references');
}

check('static source policy: report module is non-rendering and write-free', () => {
  const source = read(REPORT_REL);
  for (const token of [
    'createElement',
    'appendChild',
    'insertBefore',
    'setAttribute',
    'innerHTML =',
    'document.evaluate',
    'data-highlight-id',
    'data-overlay-inline',
    'chrome.storage',
    'localStorage.setItem',
    'localStorage.removeItem',
    'localStorage.clear',
    'indexedDB',
    'sidecar',
    'fullBundle',
    'ingestion',
    'syncNow',
  ]) {
    hasNot(source, token, `source policy ${token}`);
  }
  assert.ok(!/createElement\s*\(\s*['"]mark['"]/.test(source), 'must not create mark elements');
  has(source, 'localStorage', 'opt-in localStorage read');
  has(source, 'getItem', 'opt-in getItem read');
  has(source, FLAG_KEY, 'flag key');
  has(source, OPT_IN_KEY, 'opt-in key');
});

check('loader and pack include annotation report after highlight-resolution-ui', () => {
  const order = [
    'reader-notes/library-item-view.studio.js',
    'reader-notes/annotation-facade.studio.js',
    'reader-notes/anchor-resolver.studio.js',
    'reader-notes/anchor-resolver-dom.studio.js',
    'reader-notes/highlight-resolution-consumer.studio.js',
    'reader-notes/highlight-resolution-ui.studio.js',
    'reader-notes/annotation-report.studio.js',
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

check('module installs frozen exact API and is inert at load', () => {
  const rt = makeSandbox({ flag: false, optIn: false });
  const api = rt.sandbox.H2O.Studio.readerNotes.annotationReport;
  assert.ok(api && api.__installed === true, 'annotationReport installed');
  assert.ok(Object.isFrozen(api), 'annotationReport API frozen');
  assert.deepEqual(Object.keys(api).sort(), ['__installed', 'buildReport', 'diagnose', 'flagKey', 'isEnabled', 'optInKey', 'readonly', 'selfCheck', 'version'].sort());
  assert.equal(api.flagKey, FLAG_KEY);
  assert.equal(api.optInKey, OPT_IN_KEY);
  assert.equal(api.readonly, true);
  assert.deepEqual(rt.annotationCalls, [], 'no facade calls at load');
  assert.deepEqual(rt.consumerCalls, [], 'no consumer calls at load');
  assert.deepEqual(storageWrites(rt.storageCalls), [], 'no storage writes at load');
  assert.deepEqual(rt.hookCalls, [], 'no automatic hooks at load');
});

check('disabled and public-release gates return safe empty reports', () => {
  let rt = makeSandbox({ flag: false, optIn: true });
  let out = rt.sandbox.H2O.Studio.readerNotes.annotationReport.buildReport(ITEM_ID, { root: rt.frame });
  assert.equal(out.diagnostics.reason, 'disabled');
  assert.equal(out.counts.highlightsConsidered, 0);
  assert.deepEqual(rt.annotationCalls, []);
  assert.deepEqual(rt.consumerCalls, []);

  rt = makeSandbox({ flag: true, optIn: false });
  out = rt.sandbox.H2O.Studio.readerNotes.annotationReport.buildReport(ITEM_ID, { root: rt.frame });
  assert.equal(out.diagnostics.reason, 'operator-opt-in-missing');

  rt = makeSandbox({ flag: true, optIn: true, publicRelease: true });
  out = rt.sandbox.H2O.Studio.readerNotes.annotationReport.buildReport(ITEM_ID, { root: rt.frame });
  assert.equal(out.diagnostics.reason, 'public-release-disabled');
});

check('buildReport returns serializable resolved/orphaned highlights, notes, bookmarks, counts, and diagnostics', () => {
  const rt = makeSandbox({ flag: true, optIn: true });
  const before = { text: textContent(rt.frame), nodes: nodeCount(rt.frame) };
  const out = rt.sandbox.H2O.Studio.readerNotes.annotationReport.buildReport(ITEM_ID, { root: rt.frame, limit: 10, caller: 'validator' });
  assert.equal(out.schemaVersion, 1);
  assert.equal(out.itemId, ITEM_ID);
  assert.equal(out.rootFound, true);
  assert.equal(out.highlights.resolved.length, 1);
  assert.equal(out.highlights.orphaned.length, 1);
  assert.equal(out.highlights.skipped.length, 0);
  assert.equal(out.notes.length, 1);
  assert.equal(out.bookmarks.length, 1);
  assert.deepEqual(json(out.counts), {
    highlightsConsidered: 2,
    highlightsResolved: 1,
    highlightsOrphaned: 1,
    highlightsSkipped: 0,
    notes: 1,
    bookmarks: 1,
  });
  assert.equal(out.diagnostics.reason, 'ok');
  assert.equal(out.diagnostics.annotationsAvailable, true);
  assert.equal(out.diagnostics.resolutionConsumerAvailable, true);
  assert.equal(rt.annotationCalls.length, 3);
  assert.deepEqual(rt.annotationCalls.map((call) => call.options.kind).sort(), ['bookmark', 'highlight', 'note']);
  assert.equal(rt.consumerCalls.length, 1);
  assert.equal(rt.consumerCalls[0].itemId, ITEM_ID);
  assert.deepEqual(rt.consumerCalls[0].options, { limit: 10, caller: 'validator' });
  assertSerializable(out);
  assertNoLiveLeak(out);
  assert.equal(textContent(rt.frame), before.text);
  assert.equal(nodeCount(rt.frame), before.nodes);
  assert.deepEqual(storageWrites(rt.storageCalls), []);
});

check('omitted itemId locates current reader frame and derives itemId', () => {
  const rt = makeSandbox({ flag: true, optIn: true, withDocument: true });
  const out = rt.sandbox.H2O.Studio.readerNotes.annotationReport.buildReport(null, { limit: 5 });
  assert.equal(out.itemId, ITEM_ID);
  assert.equal(out.rootFound, true);
  assert.equal(rt.consumerCalls.length, 1);
  assert.equal(rt.consumerCalls[0].itemId, ITEM_ID);
});

check('no-reader-root path skips highlights without throwing', () => {
  const rt = makeSandbox({ flag: true, optIn: true, withDocument: false });
  const out = rt.sandbox.H2O.Studio.readerNotes.annotationReport.buildReport(ITEM_ID, { limit: 10 });
  assert.equal(out.rootFound, false);
  assert.equal(out.highlights.resolved.length, 0);
  assert.equal(out.highlights.orphaned.length, 0);
  assert.equal(out.highlights.skipped.length, 1);
  assert.equal(out.highlights.skipped[0].reason, 'skipped-no-reader-root');
  assert.equal(rt.consumerCalls.length, 0);
  assert.equal(out.notes.length, 1);
  assert.equal(out.bookmarks.length, 1);
});

check('missing dependencies and thrown facade fail closed', () => {
  let rt = makeSandbox({ flag: true, optIn: true, withAnnotations: false });
  let out = rt.sandbox.H2O.Studio.readerNotes.annotationReport.buildReport(ITEM_ID, { root: rt.frame });
  assert.equal(out.diagnostics.reason, 'deps-unavailable');

  rt = makeSandbox({ flag: true, optIn: true, annotationsThrow: new Error('facade boom') });
  out = rt.sandbox.H2O.Studio.readerNotes.annotationReport.buildReport(ITEM_ID, { root: rt.frame });
  assert.equal(out.diagnostics.reason, 'deps-unavailable');
  assert.ok(String(out.diagnostics.error).includes('facade boom'));
});

check('options.limit truncates safely and reports truncated true', () => {
  const rt = makeSandbox({ flag: true, optIn: true });
  const out = rt.sandbox.H2O.Studio.readerNotes.annotationReport.buildReport(ITEM_ID, { root: rt.frame, limit: 2 });
  assert.equal(out.truncated, true);
  assert.equal(out.diagnostics.truncated, true);
  assert.equal(out.counts.highlightsResolved, 1);
  assert.equal(out.counts.highlightsOrphaned, 1);
  assert.equal(out.counts.notes, 0);
  assert.equal(out.counts.bookmarks, 0);
});

check('evidence doc records NV1 non-visual scope and sequencing', () => {
  const evidence = read(EVIDENCE_REL);
  for (const token of [
    'NV1 is a new non-visual Reader Notes lane',
    'NV1 is not an A2a rendering reopen',
    'A2a remains closed/read-only/non-rendering',
    'S3H1a remains sole visible highlight renderer',
    'A2a.6.1 rendering remains blocked',
    'XPath remains deferred',
    'A2b remains deferred',
    'NV1 uses existing read-only A1/A2a APIs',
    'NV1 persists nothing',
    'NV1 mutates no DOM',
    'serializable report data only',
    'orphan-rate / anchor-quality baseline',
    'Real-boot smoke is a separate future NV1b step',
  ]) {
    has(evidence, token, 'NV1 evidence');
  }
});

check('A2a.5 reader-root resolution probe validator still passes', () => runValidator(A2A5_VALIDATOR_REL));
check('A2a.3 loader/pack inert exposure validator still passes', () => runValidator(A2A3_VALIDATOR_REL));
check('A2a.4 highlight-resolution consumer validator still passes', () => runValidator(A2A4_VALIDATOR_REL));
check('A2a.4.1 consumer-readiness validator still passes', () => runValidator(A2A4_READINESS_VALIDATOR_REL));
check('A2a.2d validator still passes', () => runValidator(A2A2D_VALIDATOR_REL));
check('A2a.2 validator still passes', () => runValidator(A2A2_VALIDATOR_REL));
check('A2a validator still passes', () => runValidator(A2A_VALIDATOR_REL));
check('A1.3 validator still passes', () => runValidator(A1_3_VALIDATOR_REL));
check('A1.2 validator still passes', () => runValidator(A1_2_VALIDATOR_REL));
check('A1.1 validator still passes', () => runValidator(A1_1_VALIDATOR_REL));
check('A0 contract validator still passes', () => runValidator(A0_VALIDATOR_REL));

if (fail.length) {
  console.log(`\nReader & Notes NV1 annotation report validation failed: ${fail.length} failed, ${pass.length} passed.`);
  process.exitCode = 1;
} else {
  console.log(`\nReader & Notes NV1 annotation report validation passed: ${pass.length} checks.`);
}
