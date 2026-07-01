#!/usr/bin/env node
// Validator for Studio Reader & Notes MVP-A2a.4.2:
// read-only highlight-resolution consumer adapter.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..', '..', '..');

const CORE_REL = 'src-surfaces-base/studio/reader-notes/anchor-resolver.studio.js';
const DOM_REL = 'src-surfaces-base/studio/reader-notes/anchor-resolver-dom.studio.js';
const CONSUMER_REL = 'src-surfaces-base/studio/reader-notes/highlight-resolution-consumer.studio.js';
const STUDIO_HTML_REL = 'src-surfaces-base/studio/studio.html';
const PACK_REL = 'tools/product/studio/pack-studio.mjs';
const EVIDENCE_REL = 'release-evidence/2026-07-01/reader-notes-a2a4-highlight-resolution-consumer.md';
const A2A4_1_EVIDENCE_REL = 'release-evidence/2026-07-01/reader-notes-a2a4-consumer-readiness.md';

const A2A3_VALIDATOR_REL = 'tools/validation/reader-notes/validate-reader-notes-mvp-a2a_3-loader-pack-inert-exposure.mjs';
const A2A2D_VALIDATOR_REL = 'tools/validation/reader-notes/validate-reader-notes-mvp-a2a_2d-flags-read-purity.mjs';
const A2A2C_VALIDATOR_REL = 'tools/validation/reader-notes/validate-reader-notes-mvp-a2a_2_tauri-webkit-smoke.mjs';
const A2A2_VALIDATOR_REL = 'tools/validation/reader-notes/validate-reader-notes-mvp-a2a_2.mjs';
const A2A_VALIDATOR_REL = 'tools/validation/reader-notes/validate-reader-notes-mvp-a2a.mjs';
const A1_3_VALIDATOR_REL = 'tools/validation/reader-notes/validate-reader-notes-mvp-a1_3.mjs';
const A1_2_VALIDATOR_REL = 'tools/validation/reader-notes/validate-reader-notes-mvp-a1_2.mjs';
const A1_1_VALIDATOR_REL = 'tools/validation/reader-notes/validate-reader-notes-mvp-a1_1.mjs';
const A0_VALIDATOR_REL = 'tools/validation/reader-notes/validate-reader-notes-architecture-contract-v1_2.mjs';

const RESOLVER_FLAG_KEY = 'studio.readerNotes.anchorResolver.enabled';
const CONSUMER_FLAG_KEY = 'studio.readerNotes.highlightResolutionConsumer.enabled';
const CHAT_ID = 'chat-a2a4';
const ITEM_ID = CHAT_ID;
const ANSWER_ID = 'answer-a2a4';
const NATIVE_ID = 'highlight-a2a4';
const EXACT = 'some selected text';
const PLAIN = 'alpha some selected text omega';

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

function collectTextNodes(root, out = []) {
  if (!root) return out;
  if (root.nodeType === 3) {
    if (root.nodeValue.length > 0) out.push(root);
    return out;
  }
  for (const child of root.childNodes || []) collectTextNodes(child, out);
  return out;
}

function walk(root, fn) {
  if (!root) return;
  fn(root);
  for (const child of root.childNodes || []) walk(child, fn);
}

function nodeCount(root) {
  let count = 0;
  walk(root, () => { count += 1; });
  return count;
}

function textContent(root) {
  return collectTextNodes(root, []).map((node) => node.nodeValue).join('');
}

function markupSnapshot(root) {
  const parts = [];
  walk(root, (node) => {
    if (node.nodeType === 3) parts.push(`#text:${node.nodeValue}`);
    else if (node.nodeType === 1) {
      const attrs = Object.keys(node._attrs || {}).sort().map((key) => `${key}=${node._attrs[key]}`).join('|');
      parts.push(`${node.tagName}:${attrs}`);
    }
  });
  return parts.join('\n');
}

function overlayNodeCount(root) {
  let count = 0;
  walk(root, (node) => {
    if (node.nodeType !== 1) return;
    const tag = String(node.tagName || '').toLowerCase();
    if (tag === 'mark') count += 1;
    if (node.getAttribute && node.getAttribute('data-overlay-inline')) count += 1;
    if (node.getAttribute && node.getAttribute('data-highlight-id')) count += 1;
  });
  return count;
}

class RangeShim {
  constructor(owner) {
    this.owner = owner;
    this.startContainer = null;
    this.startOffset = 0;
    this.endContainer = null;
    this.endOffset = 0;
  }
  setStart(node, offset) {
    if (!node || node.nodeType !== 3) throw new Error('bad start');
    this.startContainer = node;
    this.startOffset = offset;
  }
  setEnd(node, offset) {
    if (!node || node.nodeType !== 3) throw new Error('bad end');
    this.endContainer = node;
    this.endOffset = offset;
  }
  toString() {
    const nodes = collectTextNodes(this.owner.root, []);
    const si = nodes.indexOf(this.startContainer);
    const ei = nodes.indexOf(this.endContainer);
    if (si < 0 || ei < 0 || si > ei) return '';
    if (si === ei) return String(nodes[si].nodeValue).slice(this.startOffset, this.endOffset);
    let out = String(nodes[si].nodeValue).slice(this.startOffset);
    for (let i = si + 1; i < ei; i += 1) out += String(nodes[i].nodeValue);
    out += String(nodes[ei].nodeValue).slice(0, this.endOffset);
    return out;
  }
}

function makeOwner() {
  return {
    root: null,
    createRangeCalls: 0,
    evaluateCalls: 0,
    createRange() {
      this.createRangeCalls += 1;
      return new RangeShim(this);
    },
    evaluate() {
      this.evaluateCalls += 1;
      return null;
    },
  };
}

function makeText(owner, value) {
  return {
    nodeType: 3,
    nodeValue: String(value),
    childNodes: [],
    ownerDocument: owner,
    parentNode: null,
  };
}

function matchesSelector(node, selector) {
  if (!node || node.nodeType !== 1 || typeof selector !== 'string') return false;
  if (selector === '[data-message-id]') return node.hasAttribute('data-message-id');
  if (selector === '.cgFrame') return String(node.getAttribute('class') || '').split(/\s+/).includes('cgFrame');
  if (selector === '.cgScroll') return String(node.getAttribute('class') || '').split(/\s+/).includes('cgScroll');
  if (selector === '[data-turn]') return node.hasAttribute('data-turn');
  if (selector === '[data-message-author-role]') return node.hasAttribute('data-message-author-role');
  return false;
}

function makeElement(owner, tagName, attrs = {}, children = [], queryLog = null) {
  const attr = new Map(Object.entries(attrs).map(([key, value]) => [key, String(value)]));
  const node = {
    nodeType: 1,
    tagName: String(tagName || 'div').toUpperCase(),
    nodeValue: null,
    childNodes: [],
    ownerDocument: owner,
    parentNode: null,
    _attrs: Object.fromEntries(attr.entries()),
    getAttribute(name) {
      return attr.has(name) ? attr.get(name) : null;
    },
    setAttribute(name, value) {
      attr.set(name, String(value));
      this._attrs[name] = String(value);
    },
    hasAttribute(name) {
      return attr.has(name);
    },
    querySelectorAll(selector) {
      if (queryLog) queryLog.push(String(selector));
      const out = [];
      walk(this, (candidate) => {
        if (candidate !== this && matchesSelector(candidate, selector)) out.push(candidate);
      });
      return out;
    },
  };
  for (const child of children) {
    child.parentNode = node;
    node.childNodes.push(child);
  }
  return node;
}

function buildSavedReaderFixture(answerId = ANSWER_ID, queryLog = []) {
  const owner = makeOwner();
  const msgBody = makeElement(owner, 'div', { class: 'cgMsgBody' }, [
    makeText(owner, 'alpha '),
    makeElement(owner, 'span', {}, [makeText(owner, 'some selected ')]),
    makeElement(owner, 'strong', {}, [makeText(owner, 'text')]),
    makeText(owner, ' omega'),
  ]);
  const msgEl = makeElement(owner, 'div', {
    class: 'cgMsg cgMsg--assistant',
    'data-message-author-role': 'assistant',
    'data-message-id': answerId,
  }, [msgBody]);
  const turn = makeElement(owner, 'section', {
    class: 'cgTurn cgTurn--assistant wbTurn wbTurn--fallback wbTurn--assistant',
    'data-turn': 'assistant',
    'data-testid': 'conversation-turn-2',
  }, [msgEl]);
  const scroll = makeElement(owner, 'div', {
    class: 'cgScroll wbReaderScroll wbRichRoot',
    'data-testid': 'conversation-turns',
  }, [turn], queryLog);
  const frame = makeElement(owner, 'div', {
    class: 'cgFrame',
    'data-chat-id': CHAT_ID,
  }, [scroll], queryLog);
  owner.root = frame;
  return { owner, frame, scroll, turn, msgEl, queryLog };
}

function nativeHighlightEntry(answerId = ANSWER_ID) {
  return {
    id: NATIVE_ID,
    color: 'gold',
    ts: 1710000000000,
    convoId: `c/${CHAT_ID}`,
    anchors: {
      textQuote: {
        exact: EXACT,
        prefix: 'alpha ',
        suffix: ' omega',
        approx: 6,
      },
      textPos: { start: 6, end: 24 },
      xpath: { startXPath: './span[1]/text()[1]', startOffset: 0, endXPath: './strong[1]/text()[1]', endOffset: 4 },
    },
    answerId,
  };
}

function attributedHighlightFixture(answerId = ANSWER_ID) {
  const native = nativeHighlightEntry(answerId);
  return {
    schemaVersion: 1,
    kind: 'highlight',
    id: `highlight:${CHAT_ID}:${answerId}:${NATIVE_ID}`,
    item: { kind: 'captured_chat', id: CHAT_ID },
    attribution: 'attributed',
    source: {
      store: 'highlights',
      chatId: CHAT_ID,
      answerId,
      nativeId: NATIVE_ID,
      convoId: `c/${CHAT_ID}`,
    },
    body: { color: 'gold', text: EXACT, createdAt: 1710000000000 },
    raw: JSON.parse(JSON.stringify(native)),
  };
}

function jsonClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeSandbox({ consumerFlag = false, resolverFlag = true, annotations = [], resolverOverride = null, annotationsThrow = null } = {}) {
  const storageCalls = [];
  const flagCalls = [];
  const writeCalls = [];
  const hookCalls = [];
  const annotationCalls = [];
  const resolverCalls = [];
  const sandbox = {
    H2O: {
      flags: {
        get(key, fallback) {
          flagCalls.push({ key, fallback });
          if (key === CONSUMER_FLAG_KEY) return consumerFlag;
          if (key === RESOLVER_FLAG_KEY) return resolverFlag;
          return fallback;
        },
        set() { writeCalls.push('flags.set'); },
        remove() { writeCalls.push('flags.remove'); },
        clear() { writeCalls.push('flags.clear'); },
      },
      Studio: {
        readerNotes: {
          annotations: {
            __installed: true,
            readonly: true,
            isEnabled() { return true; },
            listForItem(itemId, options) {
              annotationCalls.push({ itemId, options: jsonClone(options || {}) });
              if (annotationsThrow) throw annotationsThrow;
              return annotations;
            },
          },
        },
      },
      events: { on() { hookCalls.push('H2O.events.on'); } },
      bus: { on() { hookCalls.push('H2O.bus.on'); } },
    },
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
    addEventListener() { hookCalls.push('addEventListener'); },
    setTimeout() { hookCalls.push('setTimeout'); return 0; },
    setInterval() { hookCalls.push('setInterval'); return 0; },
    requestAnimationFrame() { hookCalls.push('requestAnimationFrame'); return 0; },
    MutationObserver: function MutationObserver() { hookCalls.push('MutationObserver'); return { observe() { hookCalls.push('observe'); }, disconnect() {} }; },
    document: {
      addEventListener() { hookCalls.push('document.addEventListener'); },
      createRange() { hookCalls.push('document.createRange'); return {}; },
      evaluate() { hookCalls.push('document.evaluate'); return null; },
    },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(read(CORE_REL), sandbox, { filename: CORE_REL });
  vm.runInContext(read(DOM_REL), sandbox, { filename: DOM_REL });
  if (resolverOverride) {
    sandbox.H2O.Studio.readerNotes.anchorResolverDom = resolverOverride(resolverCalls);
  }
  vm.runInContext(read(CONSUMER_REL), sandbox, { filename: CONSUMER_REL });
  return { sandbox, storageCalls, flagCalls, writeCalls, hookCalls, annotationCalls, resolverCalls };
}

function storageWrites(calls) {
  return calls.filter((call) => !String(call[0]).endsWith('getItem'));
}

function assertSerializable(value) {
  const encoded = JSON.stringify(value);
  assert.ok(encoded && encoded.length > 0, 'value must JSON encode');
  assert.equal(JSON.stringify(JSON.parse(encoded)), encoded, 'JSON round-trip must be stable');
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function assertNoLiveReferences(row) {
  assert.ok(!Object.prototype.hasOwnProperty.call(row, 'range'), 'row must not expose range');
  assert.ok(!Object.prototype.hasOwnProperty.call(row, 'annotation'), 'row must not expose annotation');
  assert.ok(!Object.prototype.hasOwnProperty.call(row, 'msgEl'), 'row must not expose msgEl');
}

function sourceSafetyChecks() {
  const source = read(CONSUMER_REL);
  for (const token of [
    'localStorage',
    'sessionStorage',
    'indexedDB',
    'chrome.',
    'document.evaluate',
    'MutationObserver',
    'setTimeout',
    'setInterval',
    'requestAnimationFrame',
    'addEventListener',
    'removeEventListener',
    '.appendChild(',
    '.insertBefore(',
    '.removeChild(',
    '.normalize(',
    '.splitText(',
    'reanchorStatus',
    'sidecar.write',
    'native_note',
    'imported_document',
    'converted_note',
  ]) {
    hasNot(source, token, `consumer source safety ${token}`);
  }
  hasNot(source, RESOLVER_FLAG_KEY, 'consumer must not hard-code resolver flag');
  hasNot(source, 'annotationFacade.enabled', 'consumer must not hard-code annotation facade flag');
  hasNot(source, 'annotationHighlights.enabled', 'consumer must not hard-code highlight flag');
}

check('consumer module source exists and has the approved public surface only', () => {
  const source = read(CONSUMER_REL);
  has(source, 'highlightResolutionConsumer', 'consumer namespace');
  has(source, CONSUMER_FLAG_KEY, 'consumer flag key');
  has(source, 'resolveForItem', 'consumer resolve method');
  has(source, "querySelectorAll('[data-message-id]')", 'safe answerId lookup');
  hasNot(source, '[data-message-id="', 'unsafe answerId selector interpolation');
  hasNot(source, 'return range', 'live Range return');
  sourceSafetyChecks();
});

check('loader and pack include consumer after A1 and A2a resolver modules', () => {
  const order = [
    'reader-notes/library-item-view.studio.js',
    'reader-notes/annotation-facade.studio.js',
    'reader-notes/anchor-resolver.studio.js',
    'reader-notes/anchor-resolver-dom.studio.js',
    'reader-notes/highlight-resolution-consumer.studio.js',
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

check('module install is frozen, default-off, and inert at load', () => {
  const rt = makeSandbox({ consumerFlag: false, annotations: [attributedHighlightFixture()] });
  const api = rt.sandbox.H2O.Studio.readerNotes.highlightResolutionConsumer;
  assert.ok(api && api.__installed === true, 'consumer installed');
  assert.ok(Object.isFrozen(api), 'consumer API frozen');
  assert.deepEqual(Object.keys(api).sort(), ['__installed', 'diagnose', 'flagKey', 'isEnabled', 'readonly', 'resolveForItem', 'selfCheck', 'version'].sort());
  assert.equal(api.readonly, true);
  assert.equal(api.flagKey, CONSUMER_FLAG_KEY);
  assert.equal(api.isEnabled(), false);
  assert.deepEqual(rt.annotationCalls, [], 'no annotation calls at load');
  assert.deepEqual(rt.resolverCalls, [], 'no resolver calls at load');
  assert.deepEqual(storageWrites(rt.storageCalls), [], 'no storage writes at load');
  assert.deepEqual(rt.writeCalls, [], 'no flag writes at load');
  assert.deepEqual(rt.hookCalls, [], 'no automatic hooks at load');
});

check('disabled consumer returns a safe empty result without invoking upstream APIs', () => {
  const rt = makeSandbox({ consumerFlag: false, resolverFlag: true, annotations: [attributedHighlightFixture()] });
  const fixture = buildSavedReaderFixture();
  const out = rt.sandbox.H2O.Studio.readerNotes.highlightResolutionConsumer.resolveForItem(ITEM_ID, fixture.frame);
  assert.equal(out.diagnostics.reason, 'disabled');
  assert.deepEqual(plain(out.resolved), []);
  assert.deepEqual(plain(out.unresolved), []);
  assert.deepEqual(rt.annotationCalls, []);
  assert.equal(fixture.owner.createRangeCalls, 0);
});

check('happy path resolves one attributed highlight into a data-only row', () => {
  const annotation = attributedHighlightFixture();
  const annotationBefore = JSON.stringify(annotation);
  const rt = makeSandbox({ consumerFlag: true, resolverFlag: true, annotations: [annotation] });
  const fixture = buildSavedReaderFixture();
  const before = {
    text: textContent(fixture.frame),
    nodes: nodeCount(fixture.frame),
    overlays: overlayNodeCount(fixture.frame),
    markup: markupSnapshot(fixture.frame),
  };
  const out = rt.sandbox.H2O.Studio.readerNotes.highlightResolutionConsumer.resolveForItem(ITEM_ID, fixture.frame, { consumer: 'a2a4.2-validator' });
  assert.equal(out.schemaVersion, 1);
  assert.equal(out.itemId, ITEM_ID);
  assert.equal(out.resolved.length, 1);
  assert.equal(out.unresolved.length, 0);
  assert.equal(rt.annotationCalls.length, 1);
  assert.equal(rt.annotationCalls[0].itemId, ITEM_ID);
  assert.deepEqual(rt.annotationCalls[0].options, { kind: 'highlight' });
  assert.deepEqual(fixture.queryLog, ['[data-message-id]']);
  const row = out.resolved[0];
  assert.equal(row.annotationId, annotation.id);
  assert.equal(row.nativeId, NATIVE_ID);
  assert.equal(row.answerId, ANSWER_ID);
  assert.equal(row.status, 'anchored');
  assert.deepEqual(plain(row.span), { start: 6, end: 24 });
  assert.equal(row.selectorUsed, 'textQuote');
  assert.equal(row.confidence, 1);
  assert.equal(row.reason, 'textQuote-exact');
  assert.equal(row.text, EXACT);
  assert.equal(row.diagnostics.xpathDeferred, true);
  assertNoLiveReferences(row);
  assertSerializable(out);
  assert.notEqual(row.source, annotation.source, 'source must be cloned');
  assert.notEqual(row.diagnostics, rt.sandbox.H2O.Studio.readerNotes.anchorResolverDom.diagnose().lastDiagnostics, 'diagnostics must be cloned');
  row.source.answerId = 'mutated';
  row.diagnostics.xpathDeferred = false;
  assert.equal(annotation.source.answerId, ANSWER_ID, 'row source mutation must not mutate annotation source');
  assert.equal(JSON.stringify(annotation), annotationBefore, 'annotation/raw must not mutate');
  assert.equal(textContent(fixture.frame), before.text);
  assert.equal(nodeCount(fixture.frame), before.nodes);
  assert.equal(overlayNodeCount(fixture.frame), before.overlays);
  assert.equal(markupSnapshot(fixture.frame), before.markup);
  assert.equal(fixture.owner.evaluateCalls, 0, 'XPath must remain deferred');
  assert.deepEqual(storageWrites(rt.storageCalls), []);
  assert.deepEqual(rt.writeCalls, []);
});

check('safe answerId lookup handles special characters without selector interpolation', () => {
  const tricky = 'answer-"] .bad';
  const annotation = attributedHighlightFixture(tricky);
  const rt = makeSandbox({ consumerFlag: true, resolverFlag: true, annotations: [annotation] });
  const fixture = buildSavedReaderFixture(tricky);
  const out = rt.sandbox.H2O.Studio.readerNotes.highlightResolutionConsumer.resolveForItem(ITEM_ID, fixture.frame);
  assert.equal(out.resolved.length, 1);
  assert.deepEqual(fixture.queryLog, ['[data-message-id]']);
  assert.equal(out.resolved[0].answerId, tricky);
});

check('unattributed highlights, notes, bookmarks, and unsupported kinds are excluded before resolver invocation', () => {
  const base = attributedHighlightFixture();
  const annotations = [
    { ...base, id: 'unattributed', attribution: 'unattributed', item: null },
    { kind: 'note', id: 'note-1', source: { answerId: ANSWER_ID }, raw: { anchors: base.raw.anchors } },
    { kind: 'bookmark', id: 'bookmark-1', source: { answerId: ANSWER_ID }, raw: { anchors: base.raw.anchors } },
    { kind: 'quote', id: 'quote-1', source: { answerId: ANSWER_ID }, raw: { anchors: base.raw.anchors } },
  ];
  const rt = makeSandbox({
    consumerFlag: true,
    annotations,
    resolverOverride: (calls) => ({
      __installed: true,
      readonly: true,
      flagKey: RESOLVER_FLAG_KEY,
      isEnabled: () => true,
      resolveHighlight() { calls.push('called'); throw new Error('resolver should not be called'); },
      diagnose: () => ({ coreAvailable: true, deferredSelectors: ['xpath'] }),
    }),
  });
  const fixture = buildSavedReaderFixture();
  const out = rt.sandbox.H2O.Studio.readerNotes.highlightResolutionConsumer.resolveForItem(ITEM_ID, fixture.frame);
  assert.equal(out.resolved.length, 0);
  assert.equal(out.unresolved.length, 0);
  assert.equal(out.diagnostics.skipped.length, 4);
  assert.deepEqual(rt.resolverCalls, []);
});

check('missing anchors and missing answerId fail closed without resolver invocation', () => {
  const base = attributedHighlightFixture();
  const missingAnchors = { ...base, id: 'missing-anchors', raw: {} };
  const missingAnswer = { ...base, id: 'missing-answer', source: { ...base.source, answerId: '' } };
  const rt = makeSandbox({
    consumerFlag: true,
    annotations: [missingAnchors, missingAnswer],
    resolverOverride: (calls) => ({
      __installed: true,
      readonly: true,
      flagKey: RESOLVER_FLAG_KEY,
      isEnabled: () => true,
      resolveHighlight() { calls.push('called'); return {}; },
      diagnose: () => ({ coreAvailable: true, deferredSelectors: ['xpath'] }),
    }),
  });
  const fixture = buildSavedReaderFixture();
  const out = rt.sandbox.H2O.Studio.readerNotes.highlightResolutionConsumer.resolveForItem(ITEM_ID, fixture.frame);
  assert.equal(out.resolved.length, 0);
  assert.equal(out.unresolved.length, 2);
  assert.deepEqual(plain(out.unresolved.map((row) => row.reason).sort()), ['missing-answer', 'not-eligible'].sort());
  assert.deepEqual(rt.resolverCalls, []);
});

check('fail-closed cases return safe data-only results', () => {
  let rt = makeSandbox({ consumerFlag: true, annotations: [attributedHighlightFixture()] });
  assert.equal(rt.sandbox.H2O.Studio.readerNotes.highlightResolutionConsumer.resolveForItem('', buildSavedReaderFixture().frame).diagnostics.reason, 'invalid-item');
  assert.equal(rt.sandbox.H2O.Studio.readerNotes.highlightResolutionConsumer.resolveForItem(ITEM_ID, null).diagnostics.reason, 'missing-root');

  rt = makeSandbox({ consumerFlag: true, annotations: [attributedHighlightFixture()] });
  delete rt.sandbox.H2O.Studio.readerNotes.annotations;
  assert.equal(rt.sandbox.H2O.Studio.readerNotes.highlightResolutionConsumer.resolveForItem(ITEM_ID, buildSavedReaderFixture().frame).diagnostics.reason, 'deps-unavailable');

  rt = makeSandbox({ consumerFlag: true, annotations: [] });
  assert.equal(rt.sandbox.H2O.Studio.readerNotes.highlightResolutionConsumer.resolveForItem(ITEM_ID, buildSavedReaderFixture().frame).diagnostics.reason, 'no-highlights');

  rt = makeSandbox({ consumerFlag: true, annotations: [attributedHighlightFixture()] });
  let out = rt.sandbox.H2O.Studio.readerNotes.highlightResolutionConsumer.resolveForItem(ITEM_ID, buildSavedReaderFixture('different-answer').frame);
  assert.equal(out.unresolved[0].reason, 'message-root-missing');

  rt = makeSandbox({ consumerFlag: true, resolverFlag: false, annotations: [attributedHighlightFixture()] });
  out = rt.sandbox.H2O.Studio.readerNotes.highlightResolutionConsumer.resolveForItem(ITEM_ID, buildSavedReaderFixture().frame);
  assert.equal(out.unresolved[0].reason, 'resolver-disabled');

  rt = makeSandbox({
    consumerFlag: true,
    annotations: [attributedHighlightFixture()],
    resolverOverride: () => ({
      __installed: true,
      readonly: true,
      flagKey: RESOLVER_FLAG_KEY,
      isEnabled: () => true,
      resolveHighlight: () => ({ status: 'orphaned', range: null, span: null, reason: 'no-match', diagnostics: {} }),
      diagnose: () => ({ coreAvailable: true, deferredSelectors: ['xpath'] }),
    }),
  });
  out = rt.sandbox.H2O.Studio.readerNotes.highlightResolutionConsumer.resolveForItem(ITEM_ID, buildSavedReaderFixture().frame);
  assert.equal(out.unresolved[0].reason, 'resolver-orphaned');

  rt = makeSandbox({
    consumerFlag: true,
    annotations: [attributedHighlightFixture()],
    resolverOverride: () => ({
      __installed: true,
      readonly: true,
      flagKey: RESOLVER_FLAG_KEY,
      isEnabled: () => true,
      resolveHighlight: () => ({ status: 'orphaned', range: null, span: { start: 6, end: 24 }, reason: 'range-unavailable', diagnostics: {} }),
      diagnose: () => ({ coreAvailable: true, deferredSelectors: ['xpath'] }),
    }),
  });
  out = rt.sandbox.H2O.Studio.readerNotes.highlightResolutionConsumer.resolveForItem(ITEM_ID, buildSavedReaderFixture().frame);
  assert.equal(out.unresolved[0].reason, 'range-unavailable');

  rt = makeSandbox({ consumerFlag: true, annotations: [attributedHighlightFixture()], annotationsThrow: new Error('boom') });
  assert.equal(rt.sandbox.H2O.Studio.readerNotes.highlightResolutionConsumer.resolveForItem(ITEM_ID, buildSavedReaderFixture().frame).diagnostics.reason, 'deps-unavailable');

  rt = makeSandbox({
    consumerFlag: true,
    annotations: [attributedHighlightFixture()],
    resolverOverride: () => ({
      __installed: true,
      readonly: true,
      flagKey: RESOLVER_FLAG_KEY,
      isEnabled: () => true,
      resolveHighlight: () => { throw new Error('resolver boom'); },
      diagnose: () => ({ coreAvailable: true, deferredSelectors: ['xpath'] }),
    }),
  });
  out = rt.sandbox.H2O.Studio.readerNotes.highlightResolutionConsumer.resolveForItem(ITEM_ID, buildSavedReaderFixture().frame);
  assert.equal(out.unresolved[0].reason, 'resolver-error');
});

check('own feature flag gates only the consumer and upstream self-gating is respected', () => {
  const source = read(CONSUMER_REL);
  has(source, CONSUMER_FLAG_KEY, 'own consumer flag');
  hasNot(source, RESOLVER_FLAG_KEY, 'no resolver flag hard-code');
  const rt = makeSandbox({ consumerFlag: true, resolverFlag: false, annotations: [attributedHighlightFixture()] });
  const out = rt.sandbox.H2O.Studio.readerNotes.highlightResolutionConsumer.resolveForItem(ITEM_ID, buildSavedReaderFixture().frame);
  assert.equal(out.diagnostics.upstream.resolverEnabled, false);
  assert.equal(out.unresolved[0].reason, 'resolver-disabled');
});

check('evidence doc records A2a.4.2 scope and exclusions', () => {
  const evidence = read(EVIDENCE_REL);
  for (const token of [
    'A2a.4.2 creates one read-only explicit-invocation consumer module',
    'studio.readerNotes.highlightResolutionConsumer.enabled',
    'reader-notes/highlight-resolution-consumer.studio.js',
    'No auto-run',
    'No UI rendering',
    'No live `Range` return',
    'Data-only rows',
    'attribute comparison',
    'notes/bookmarks/unattributed',
    'Own flag + upstream self-gating',
    'A2a.4.2b real-boot smoke is required before any UI consumer slice',
    'does not authorize UI rendering, XPath, A2b',
  ]) {
    has(evidence, token, 'A2a.4.2 evidence');
  }
});

check('updated A2a.3 loader/pack inert exposure validator still passes', () => runValidator(A2A3_VALIDATOR_REL));
check('A2a.4.1 consumer-readiness evidence remains present', () => {
  const evidence = read(A2A4_1_EVIDENCE_REL);
  has(evidence, 'A2a.4.1 is validator/evidence only', 'A2a.4.1 evidence');
  has(evidence, 'source.answerId', 'A2a.4.1 message-root evidence');
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
  console.log(`\nReader & Notes MVP-A2a.4.2 highlight-resolution consumer validation failed: ${fail.length} failed, ${pass.length} passed.`);
  process.exitCode = 1;
} else {
  console.log(`\nReader & Notes MVP-A2a.4.2 highlight-resolution consumer validation passed: ${pass.length} checks.`);
}
