#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const ROOT = process.cwd();
const OVERLAY_REL = 'src-surfaces-base/studio/overlay/overlay-applier.studio.js';
const OVERLAY_PATH = path.join(ROOT, OVERLAY_REL);
const STUDIO_REL = 'src-surfaces-base/studio/studio.js';
const STUDIO_PATH = path.join(ROOT, STUDIO_REL);
const S3H1A_REL = 'src-surfaces-base/studio/S3H1a. 🎬 Highlights Engine - Studio.js';
const S3H1A_PATH = path.join(ROOT, S3H1A_REL);

const EXACT = 'no oven-safe symbol ';
const PREFIX = 'ameter: 35 cmHowever:❌ There is ';
const SUFFIX = 'shown on this label.\n❌ No maximu';
const ANSWER_ID = '7ad7c10e-8e2c-459a-a37a-5392a04996d7';
const WRONG_FIRST = 'l';
const WRONG_SECOND = 'shown on this labe';
const TITLE_EXACT = '🍽️ Stainless Steel Tray — Oven Safe?';

const PASS = [];
function check(name, fn) {
  fn();
  PASS.push(name);
  console.log(`[visible-inline-replay] PASS ${name}`);
}

class TextNode {
  constructor(value) {
    this.nodeType = 3;
    this.nodeValue = String(value || '');
    this.parentNode = null;
  }
}

class ElementNode {
  constructor(tagName, attrs = {}) {
    this.nodeType = 1;
    this.tagName = String(tagName || 'div').toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.attrs = { ...attrs };
  }
  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }
  getAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attrs, name) ? String(this.attrs[name]) : null;
  }
  setAttribute(name, value) {
    this.attrs[name] = String(value);
  }
  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }
  querySelectorAll(selector) {
    const selectors = String(selector || '').split(',').map((part) => part.trim()).filter(Boolean);
    const out = [];
    const visit = (node) => {
      if (node && node.nodeType === 1) {
        if (selectors.some((sel) => matchesSelector(node, sel))) out.push(node);
        node.children.forEach(visit);
      }
    };
    this.children.forEach(visit);
    return out;
  }
}

function matchesSelector(node, selector) {
  if (selector === '.cgFrame') return /\bcgFrame\b/.test(node.getAttribute('class') || '');
  if (selector === '[data-message-id]') return node.getAttribute('data-message-id') !== null;
  if (selector === '[data-turn]') return node.getAttribute('data-turn') !== null;
  if (selector === '[data-message-author-role]') return node.getAttribute('data-message-author-role') !== null;
  return false;
}

function collectTextNodes(root) {
  const out = [];
  const visit = (node) => {
    if (!node) return;
    if (node.nodeType === 3) {
      if (node.nodeValue.length) out.push(node);
      return;
    }
    if (node.nodeType === 1) node.children.forEach(visit);
  };
  visit(root);
  return out;
}

function flatten(root) {
  let plain = '';
  const map = [];
  for (const node of collectTextNodes(root)) {
    const start = plain.length;
    plain += node.nodeValue;
    map.push({ node, start, end: plain.length });
  }
  return { plain, map, length: plain.length };
}

function makeDocument(rootById) {
  return {
    getElementById(id) {
      return rootById[id] || null;
    },
    createTreeWalker(root, show, filter) {
      const nodes = collectTextNodes(root).filter((node) => {
        if (!filter || typeof filter.acceptNode !== 'function') return true;
        return filter.acceptNode(node) === 1;
      });
      let index = -1;
      return {
        nextNode() {
          index += 1;
          return nodes[index] || null;
        },
      };
    },
  };
}

function el(tag, attrs, children = []) {
  const node = new ElementNode(tag, attrs);
  for (const child of children) node.appendChild(typeof child === 'string' ? new TextNode(child) : child);
  return node;
}

function buildReaderFixture() {
  const wrongText = WRONG_FIRST + WRONG_SECOND + '.';
  const stalePrefix = 'x'.repeat(345);
  const bridge = ' gap before corrected quote ';
  const message = el('div', {
    'data-message-id': ANSWER_ID,
    'data-message-author-role': 'assistant',
  }, [
    stalePrefix,
    el('span', {}, [WRONG_FIRST]),
    WRONG_SECOND + '.',
    bridge + PREFIX,
    el('strong', {}, ['no oven-safe']),
    el('span', {}, [' symbol ']),
    SUFFIX,
  ]);
  const turn = el('div', { 'data-turn': '2' }, [message]);
  const scroll = el('div', { 'class': 'cgScroll', 'data-testid': 'conversation-turns' }, [
    el('div', { 'data-turn': '1' }, [el('div', { 'data-message-id': 'other', 'data-message-author-role': 'user' }, ['other'])]),
    turn,
  ]);
  const frame = el('div', { 'class': 'cgFrame', 'data-chat-id': '6a25a65c-b7bc-8326-bcbc-53280e1e3bb7' }, [scroll]);
  const reader = el('div', { id: 'viewReader' }, [frame]);
  return { reader, frame, scroll, turn, message, wrongText };
}

function loadOverlayApi(document) {
  const source = fs.readFileSync(OVERLAY_PATH, 'utf8');
  const sandbox = {
    console,
    document,
    NodeFilter: { SHOW_TEXT: 4, FILTER_ACCEPT: 1, FILTER_REJECT: 2 },
    H2O: {
      Studio: {
        OverlayKeys: { schemaVersion: 1 },
        OverlayEvents: { ready: 'test:overlay-ready', driftDetected: 'test:drift', applySkipped: 'test:skip' },
      },
    },
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(source, sandbox, { filename: OVERLAY_REL });
  return sandbox.H2O.Studio.overlay;
}

function buildOverlay() {
  return {
    schemaVersion: 1,
    ops: [{
      id: 'op_mr6i5exb_2a1ebm2t',
      type: 'inline-format',
      target: {
        kind: 'inline',
        turnIdx: 2,
        messageId: ANSWER_ID,
        anchor: {
          textQuote: { exact: EXACT, prefix: PREFIX, suffix: SUFFIX, approx: 345 },
          textPos: { start: 345, end: 365 },
          xpath: {
            startXPath: './div[3]/div[1]/p[5]/text()[1]',
            startOffset: 11,
            endXPath: './div[3]/div[1]/p[5]/text()[2]',
            endOffset: 1,
          },
        },
      },
      payload: { style: 'text-color', kind: 'red' },
    }],
  };
}

check('overlay applier contains quote-aware inline replay resolver', () => {
  const source = fs.readFileSync(OVERLAY_PATH, 'utf8');
  assert.match(source, /function resolveInlineReplayTextPos/);
  assert.match(source, /findInlineTextQuotePos/);
  assert.match(source, /inlineTextPosMatchesQuote/);
  assert.doesNotMatch(source, /readerNotes\.annotationReport/);
});

check('visible text-color wrapper skips empty whitespace-only overlay fragments', () => {
  const source = fs.readFileSync(STUDIO_PATH, 'utf8');
  assert.match(source, /if\s*\(\s*isColor\s*&&\s*!slice\.trim\(\)\s*\)\s*continue;/);
});

check('S3H1a listens for saved-reader rebuild and schedules owned restore', () => {
  const source = fs.readFileSync(S3H1A_PATH, 'utf8');
  assert.match(source, /EV_DOM_STUDIO_READER_REFRESH_REQUESTED\s*=\s*'evt:h2o:studio:reader-refresh-requested'/);
  assert.match(source, /onStudioReaderRefreshRequested/);
  assert.match(source, /detail\.source\s*!==\s*'reader-loaded'/);
  assert.match(source, /REST_reloadStoreThenAllStable\('studio-reader-loaded'\)/);
});

check('S3H1a saved-reader context reloads store before owned restore when mounted rows are missing', () => {
  const source = fs.readFileSync(S3H1A_PATH, 'utf8');
  const helperStart = source.indexOf("const REST_reloadStoreThenAllStable = (reason = 'studio-reader-loaded') => {");
  const helperEnd = source.indexOf('const REST_handleTargetedSignal', helperStart);
  assert.ok(helperStart > 0 && helperEnd > helperStart, 'reload helper body must be locatable');
  const helperBody = source.slice(helperStart, helperEnd);
  assert.match(source, /const REST_mountedHighlightsAvailable = \(\) => \{/);
  assert.match(source, /document\.querySelectorAll\(SEL_MSG\)/);
  assert.match(source, /byAnswer\[answerId\]/);
  assert.match(helperBody, /typeof store\.reload !== 'function'/);
  assert.match(helperBody, /Promise\.resolve\(store\.reload\(\)\)\.then\(finish, finish\)/);
  assert.doesNotMatch(helperBody, /setForAnswer/);
  assert.doesNotMatch(helperBody, /STORE_write/);
});

check('S3H1a saved-reader chat key falls back to cgFrame data-chat-id', () => {
  const source = fs.readFileSync(S3H1A_PATH, 'utf8');
  assert.match(source, /#viewReader \.cgFrame\[data-chat-id\], \.cgFrame\[data-chat-id\]/);
  assert.match(source, /frame\?\.getAttribute\?\.\('data-chat-id'\)/);
  assert.match(source, /frame\?\.dataset\?\.chatId/);
});

check('S3H1a gold title restore remains quote-first and idempotent by highlight id', () => {
  const source = fs.readFileSync(S3H1A_PATH, 'utf8');
  const titleHighlight = {
    id: 'hl_retaz0l',
    color: 'gold',
    anchors: {
      textQuote: {
        exact: TITLE_EXACT,
        prefix: 'TITLE 1Oven Safe⌄1',
        suffix: 'Short answer: ❓Probably, but it',
      },
      textPos: { start: 18, end: 55 },
      xpath: {
        startXPath: './/div[3]/div[1]/h1[1]/#text[1]',
        startOffset: 0,
        endXPath: './/div[3]/div[1]/h1[1]/#text[1]',
        endOffset: 37,
      },
    },
  };
  assert.equal(titleHighlight.anchors.textQuote.exact, TITLE_EXACT);
  assert.equal(titleHighlight.color, 'gold');
  assert.match(source, /const HL_resolveAnchors = \(item, root\) => \{/);
  assert.ok(source.indexOf('if (anchors.textQuote)') < source.indexOf('if (anchors.textPos)'), 'textQuote must precede textPos');
  assert.ok(source.indexOf('if (anchors.textPos)') < source.indexOf('if (anchors.xpath)'), 'textPos must precede xpath');
  assert.match(source, /TXT_rangeMatchesQuote\(r, anchors\.textQuote\)/);
  assert.match(source, /const existing = new Set\(/);
  assert.match(source, /if \(existing\.has\(h\.id\)\) continue;/);
  assert.match(source, /HL_wrapRange\(r, h\.color \|\| PAL_defaultName\(\), answerId, h\.id\)/);
});

const fixture = buildReaderFixture();
const doc = makeDocument({ viewReader: fixture.reader });
const overlayApi = loadOverlayApi(doc);
const flat = flatten(fixture.message);
const stale = flat.plain.slice(345, 365);

check('fixture proves persisted textPos would replay the wrong visible text', () => {
  assert.ok(stale.startsWith(WRONG_FIRST + WRONG_SECOND), `unexpected stale text: ${JSON.stringify(stale)}`);
  assert.notEqual(stale, EXACT);
  assert.ok(flat.plain.includes(PREFIX + EXACT + SUFFIX), 'fixture must contain correct quote context');
});

check('text-color replay is rebased to textQuote exact/prefix/suffix inside message root', () => {
  const state = overlayApi.computeInlineState(buildOverlay(), 2);
  assert.equal(state.textColor.length, 1);
  const seg = state.textColor[0];
  assert.equal(seg.kind, 'red');
  assert.equal(flat.plain.slice(seg.start, seg.end), EXACT);
  assert.notEqual(flat.plain.slice(seg.start, seg.end), stale);
});

check('logical replay is idempotent and does not duplicate red ranges', () => {
  const first = overlayApi.computeInlineState(buildOverlay(), 2).textColor;
  const second = overlayApi.computeInlineState(buildOverlay(), 2).textColor;
  assert.deepEqual(second, first);
  assert.equal(first.length, 1);
  assert.equal(flat.plain.slice(first[0].start, first[0].end), EXACT);
});

check('missing quote match fails closed instead of replaying stale textPos', () => {
  const bad = buildOverlay();
  bad.ops[0].target.anchor.textQuote.exact = 'missing oven-safe phrase ';
  const state = overlayApi.computeInlineState(bad, 2);
  assert.equal(state.textColor.length, 0);
});

console.log(`[visible-inline-replay] all ${PASS.length} checks passed`);
