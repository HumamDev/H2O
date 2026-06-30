#!/usr/bin/env node
// Validator for Studio Reader & Notes MVP-A2a.2a.
//
// This uses a hand-rolled DOM/Range model. The model is intentionally small:
// it tests wrapper logic against independent text-node traversal and range
// stringification, not full browser Range semantics.

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
const A2A_VALIDATOR_REL = 'tools/validation/reader-notes/validate-reader-notes-mvp-a2a.mjs';
const A1_3_VALIDATOR_REL = 'tools/validation/reader-notes/validate-reader-notes-mvp-a1_3.mjs';
const A1_2_VALIDATOR_REL = 'tools/validation/reader-notes/validate-reader-notes-mvp-a1_2.mjs';
const A1_1_VALIDATOR_REL = 'tools/validation/reader-notes/validate-reader-notes-mvp-a1_1.mjs';
const A0_VALIDATOR_REL = 'tools/validation/reader-notes/validate-reader-notes-architecture-contract-v1_2.mjs';
const STUDIO_HTML_REL = 'src-surfaces-base/studio/studio.html';
const PACK_REL = 'tools/product/studio/pack-studio.mjs';
const FLAG_KEY = 'studio.readerNotes.anchorResolver.enabled';
const WRITE_METHODS = ['set', 'save', 'update', 'remove', 'delete', 'upsert', 'patch', 'clear', 'write', 'put', 'add', 'mutate', 'persist', 'commit'];
const MUTATION_TOKENS = ['splitText', 'appendChild', 'insertBefore', 'removeChild', 'normalize', 'data-overlay-inline', '<mark', 'wrapRange', 'unwrap'];
const FORBIDDEN_FILES = [
  'src-surfaces-base/studio/store/highlights.js',
  'src-surfaces-base/studio/store/notes.js',
  'src-surfaces-base/studio/store/bookmarks.js',
  'src-surfaces-base/studio/studio.js',
];
const FORBIDDEN_DIRS = [
  'src-runtime-base',
  'src-surfaces-base/studio/sync',
  'src-surfaces-base/studio/ingestion',
  'apps/studio/desktop/src-tauri',
];
const A2A2_MARKERS = ['anchorResolverDom', 'anchor-resolver-dom', 'resolveHighlight'];

const pass = [];
const fail = [];

function readIfExists(rel) {
  const full = path.join(REPO_ROOT, rel);
  return fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : null;
}
function read(rel) {
  const text = readIfExists(rel);
  assert.ok(text != null, `${rel} must exist`);
  return text;
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
function listFilesRecursive(absDir, acc) {
  let entries = [];
  try { entries = fs.readdirSync(absDir, { withFileTypes: true }); } catch { return acc; }
  for (const entry of entries) {
    const p = path.join(absDir, entry.name);
    if (entry.isDirectory()) listFilesRecursive(p, acc);
    else if (/\.(js|mjs|ts|tsx|jsx|json|md|html|css|rs|toml)$/i.test(entry.name)) acc.push(p);
  }
  return acc;
}
function runValidator(rel) {
  const full = path.join(REPO_ROOT, rel);
  assert.ok(fs.existsSync(full), `${rel} must exist`);
  try {
    const out = execFileSync('node', [full], { cwd: REPO_ROOT, encoding: 'utf8' });
    assert.ok(/validation passed/.test(out), `${rel} did not report passed`);
  } catch (error) {
    const output = (error && (error.stdout || '')) + (error && (error.stderr || ''));
    throw new Error(`${rel} failed (exit ${error && error.status}): ${output.slice(-700)}`);
  }
}

const coreText = read(CORE_REL);
const moduleText = read(DOM_REL);

function collectTextNodes(root, out = []) {
  if (!root) return out;
  if (root.nodeType === 3) {
    if (root.nodeValue.length > 0) out.push(root);
    return out;
  }
  for (const child of root.childNodes || []) collectTextNodes(child, out);
  return out;
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
  get collapsed() {
    return this.startContainer === this.endContainer && this.startOffset === this.endOffset;
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
    createRange() {
      return new RangeShim(this);
    },
  };
}
function text(owner, value) {
  return { nodeType: 3, nodeValue: String(value), childNodes: [], ownerDocument: owner, parentNode: null };
}
function el(owner, children = [], props = {}) {
  const node = { nodeType: 1, nodeValue: null, childNodes: [], ownerDocument: owner, parentNode: null, hidden: props.hidden === true };
  for (const child of children) {
    child.parentNode = node;
    node.childNodes.push(child);
  }
  return node;
}
function fixture() {
  const owner = makeOwner();
  const root = el(owner, [
    text(owner, 'alpha '),
    el(owner, [text(owner, 'beta')], { hidden: true }),
    text(owner, ' gamma'),
  ]);
  owner.root = root;
  return { owner, root };
}
function snapshotTree(root) {
  return JSON.stringify(collectTextNodes(root, []).map((node) => node.nodeValue));
}

function freshRuntime(options = {}) {
  const flagValue = options.flag;
  const mock = {
    flags: options.missingFlags ? null : {
      get(key, fallback) {
        return key === FLAG_KEY && flagValue !== undefined ? flagValue : fallback;
      },
    },
    Studio: {
      readerNotes: options.core
        ? { anchorResolver: options.core }
        : {},
    },
  };
  const sandbox = { H2O: mock };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  if (!options.core) vm.runInContext(coreText, sandbox, { filename: 'anchor-resolver.studio.js' });
  vm.runInContext(moduleText, sandbox, { filename: 'anchor-resolver-dom.studio.js' });
  return sandbox.H2O.Studio.readerNotes.anchorResolverDom;
}

check('DOM wrapper module exists', () => {
  assert.ok(fs.existsSync(path.join(REPO_ROOT, DOM_REL)));
});

check('API installs H2O.Studio.readerNotes.anchorResolverDom', () => {
  const api = freshRuntime({ flag: true });
  assert.ok(api && api.__installed === true);
  has(moduleText, 'H2O.Studio.readerNotes.anchorResolverDom', 'namespace');
});

check('API is frozen/read-only with exact public allowlist', () => {
  const api = freshRuntime({ flag: true });
  assert.equal(api.readonly, true);
  assert.ok(Object.isFrozen(api));
  const keys = Object.keys(api).sort();
  assert.deepEqual(keys, ['__installed', 'diagnose', 'flagKey', 'flattenRoot', 'isEnabled', 'readonly', 'resolveHighlight', 'selfCheck', 'spanToRange', 'version']);
  const fns = keys.filter((key) => typeof api[key] === 'function').sort();
  assert.deepEqual(fns, ['diagnose', 'flattenRoot', 'isEnabled', 'resolveHighlight', 'selfCheck', 'spanToRange']);
});

check('no write-like public methods or method calls', () => {
  const api = freshRuntime({ flag: true });
  for (const method of WRITE_METHODS) assert.equal(typeof api[method], 'undefined', `${method} must not be public`);
  for (const method of WRITE_METHODS) {
    assert.ok(!new RegExp(`\\.\\s*${method}\\s*\\(`).test(moduleText), `must not call .${method}()`);
    assert.ok(!new RegExp(`\\b${method}\\s*:`).test(moduleText), `must not expose ${method}:`);
  }
});

check('no storage APIs, global document/window, or DOM mutation methods', () => {
  for (const token of ['chrome.', 'localStorage', 'sessionStorage', 'indexedDB']) hasNot(moduleText, token, `storage token ${token}`);
  assert.ok(!/\bdocument\b/.test(moduleText), 'must not use bare global document token');
  assert.ok(!/\bwindow\b/.test(moduleText), 'must not use bare global window token');
  for (const token of MUTATION_TOKENS) hasNot(moduleText, token, `mutation token ${token}`);
});

check('feature flag key exists and defaults off', () => {
  has(moduleText, FLAG_KEY, 'flag key');
  has(moduleText, 'get(FLAG_KEY, false)', 'default off read');
  assert.equal(freshRuntime({ flag: true }).isEnabled(), true);
  assert.equal(freshRuntime({ flag: false }).isEnabled(), false);
  assert.equal(freshRuntime({ missingFlags: true }).isEnabled(), false);
});

check('flattenRoot is 3H1a-compatible for exact text and map', () => {
  const api = freshRuntime({ flag: true });
  const { root } = fixture();
  const flat = api.flattenRoot(root);
  assert.equal(flat.plain, 'alpha beta gamma');
  assert.equal(flat.length, 16);
  assert.equal(flat.map.length, 3);
  assert.deepEqual(JSON.parse(JSON.stringify(flat.map.map((seg) => [seg.start, seg.end, seg.node.nodeValue]))), [
    [0, 6, 'alpha '],
    [6, 10, 'beta'],
    [10, 16, ' gamma'],
  ]);
});

check('spanToRange maps a span inside one text node', () => {
  const api = freshRuntime({ flag: true });
  const { root } = fixture();
  const flat = api.flattenRoot(root);
  const range = api.spanToRange({ start: 1, end: 5 }, flat);
  assert.ok(range);
  assert.equal(range.toString(), 'lpha');
});

check('spanToRange maps a span across multiple text nodes', () => {
  const api = freshRuntime({ flag: true });
  const { root } = fixture();
  const flat = api.flattenRoot(root);
  const range = api.spanToRange({ start: 4, end: 11 }, flat);
  assert.ok(range);
  assert.equal(range.toString(), 'a beta ');
});

check('spanToRange rejects invalid spans', () => {
  const api = freshRuntime({ flag: true });
  const { root } = fixture();
  const flat = api.flattenRoot(root);
  assert.equal(api.spanToRange({ start: -1, end: 2 }, flat), null);
  assert.equal(api.spanToRange({ start: 2, end: 2 }, flat), null);
  assert.equal(api.spanToRange({ start: 0, end: 99 }, flat), null);
});

check('spanToRange requires owner createRange and content equality', () => {
  const api = freshRuntime({ flag: true });
  const { root } = fixture();
  const flat = api.flattenRoot(root);
  const corruptPlain = { plain: 'xxxxx ' + flat.plain.slice(6), map: flat.map, length: flat.length };
  Object.defineProperty(corruptPlain, 'root', { value: root, enumerable: false });
  assert.equal(api.spanToRange({ start: 0, end: 5 }, corruptPlain), null);
  root.ownerDocument.createRange = null;
  assert.equal(api.spanToRange({ start: 1, end: 5 }, flat), null);
});

// Protect against stale/changed DOM or range-string drift: we must drop to orphaned
// when the recovered range content no longer matches the flattened text slice.
check('resolveHighlight downgrades to orphaned when content-valid span maps to mismatched range', () => {
  const api = freshRuntime({ flag: true });
  const ann = {
    kind: 'highlight',
    raw: { anchors: { textQuote: { exact: 'beta' } } },
  };

  const { root } = fixture();
  const originalCreateRange = root.ownerDocument.createRange;
  const mismatchedText = '!mismatch!';
  root.ownerDocument.createRange = function createRangeWithMismatch() {
    const range = new RangeShim({ root });
    const baseToString = range.toString.bind(range);
    range.toString = function toStringMismatch() {
      return `${baseToString()}${mismatchedText}`;
    };
    return range;
  };

  const res = api.resolveHighlight(ann, root);
  assert.equal(res.status, 'orphaned');
  assert.equal(res.range, null);
  assert.equal(res.reason, 'range-unavailable');
  assert.equal(res.span.start, 6);
  assert.equal(res.span.end, 10);
  root.ownerDocument.createRange = originalCreateRange;
});

check('resolveHighlight fails closed for disabled, missing root, missing anchors, and unsupported kind', () => {
  const off = freshRuntime({ flag: false });
  const ann = { kind: 'highlight', raw: { anchors: { textQuote: { exact: 'alpha' } } } };
  assert.equal(off.resolveHighlight(ann, fixture().root).status, 'orphaned');
  const api = freshRuntime({ flag: true });
  assert.equal(api.resolveHighlight(ann, null).reason, 'missing-root');
  assert.equal(api.resolveHighlight({ kind: 'highlight', raw: {} }, fixture().root).reason, 'missing-anchors');
  assert.equal(api.resolveHighlight({ kind: 'note', raw: { anchors: {} } }, fixture().root).reason, 'unsupported-annotation');
});

check('resolveHighlight delegates to A2a.1 core and returns span plus range', () => {
  let called = 0;
  const spyCore = {
    resolveInText(anchors, plainText, options) {
      called += 1;
      assert.equal(plainText, 'alpha beta gamma');
      assert.equal(anchors.textQuote.exact, 'beta');
      assert.equal(options.note, 'spy');
      return {
        schemaVersion: 1,
        status: 'anchored',
        span: { start: 6, end: 10 },
        selectorUsed: 'textQuote',
        confidence: 1,
        reason: 'textQuote-exact',
        diagnostics: { tried: ['textQuote'], xpathDeferred: false },
      };
    },
  };
  const api = freshRuntime({ flag: true, core: spyCore });
  const res = api.resolveHighlight({ kind: 'highlight', raw: { anchors: { textQuote: { exact: 'beta' } } } }, fixture().root, { note: 'spy' });
  assert.equal(called, 1);
  assert.equal(res.status, 'anchored');
  assert.equal(res.span.start, 6);
  assert.equal(res.span.end, 10);
  assert.ok(res.range);
  assert.equal(res.range.toString(), 'beta');
});

check('resolveHighlight returns reanchored range through real A2a.1 textPos fallback', () => {
  const api = freshRuntime({ flag: true });
  const { root } = fixture();
  const ann = {
    kind: 'highlight',
    raw: {
      anchors: {
        textQuote: { exact: 'beta', prefix: 'missing' },
        textPos: { start: 6, end: 10 },
      },
    },
  };
  const res = api.resolveHighlight(ann, root);
  assert.equal(res.status, 'reanchored');
  assert.equal(res.span.start, 6);
  assert.equal(res.span.end, 10);
  assert.equal(res.range.toString(), 'beta');
});

check('XPath remains deferred and does not resolve', () => {
  const api = freshRuntime({ flag: true });
  const res = api.resolveHighlight({ kind: 'highlight', raw: { anchors: { xpath: { startXPath: './x' } } } }, fixture().root);
  assert.equal(res.status, 'orphaned');
  assert.equal(res.range, null);
  assert.equal(res.diagnostics.xpathDeferred, true);
});

check('inputs are not mutated', () => {
  const api = freshRuntime({ flag: true });
  const { root } = fixture();
  const ann = { kind: 'highlight', raw: { anchors: { textQuote: { exact: 'beta' } } } };
  const beforeAnn = JSON.stringify(ann);
  const beforeRoot = snapshotTree(root);
  api.resolveHighlight(ann, root);
  assert.equal(JSON.stringify(ann), beforeAnn);
  assert.equal(snapshotTree(root), beforeRoot);
});

check('no sidecar/enrichment/native_note/renderer markers', () => {
  for (const token of ['sidecar', 'enrichment', 'native_note', 'nativeNote', 'rendererRegistry', 'buildReaderDOM']) {
    hasNot(moduleText, token, `forbidden marker ${token}`);
  }
});

check('A1 modules remain non-consumers of A2a.2 DOM wrapper', () => {
  const a1_1 = readIfExists('src-surfaces-base/studio/reader-notes/library-item-view.studio.js') || '';
  const a1_2 = readIfExists('src-surfaces-base/studio/reader-notes/annotation-facade.studio.js') || '';
  hasNot(a1_1, 'anchorResolverDom', 'A1.1 must not reference DOM resolver');
  hasNot(a1_2, 'anchorResolverDom', 'A1.2/A1.3 must not reference DOM resolver');
  hasNot(a1_2, 'resolveHighlight(', 'A1.2/A1.3 must not call DOM resolver');
});

check('forbidden paths carry no A2a.2 footprint', () => {
  for (const rel of FORBIDDEN_FILES) {
    const text = readIfExists(rel);
    if (text == null) continue;
    for (const marker of A2A2_MARKERS) hasNot(text, marker, `forbidden file ${rel}`);
  }
  for (const dirRel of FORBIDDEN_DIRS) {
    for (const file of listFilesRecursive(path.join(REPO_ROOT, dirRel), [])) {
      let text = '';
      try { text = fs.readFileSync(file, 'utf8'); } catch { continue; }
      for (const marker of A2A2_MARKERS) {
        assert.ok(!text.includes(marker), `forbidden dir ${dirRel} file ${path.relative(REPO_ROOT, file)} contains ${marker}`);
      }
    }
  }
});

check('A2a.1 validator still passes', () => runValidator(A2A_VALIDATOR_REL));
check('A1.3 validator still passes', () => runValidator(A1_3_VALIDATOR_REL));
check('A1.2 validator still passes', () => runValidator(A1_2_VALIDATOR_REL));
check('A1.1 validator still passes', () => runValidator(A1_1_VALIDATOR_REL));
check('A0 contract validator still passes', () => runValidator(A0_VALIDATOR_REL));

if (fail.length) {
  console.log(`\nReader & Notes MVP-A2a.2 validation failed: ${fail.length} failed, ${pass.length} passed.`);
  process.exitCode = 1;
} else {
  console.log(`\nReader & Notes MVP-A2a.2 validation passed: ${pass.length} checks.`);
}
