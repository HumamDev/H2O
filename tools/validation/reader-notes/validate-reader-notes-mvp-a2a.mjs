#!/usr/bin/env node
// Validator for Studio Reader & Notes MVP-A2a.1:
// pure text highlight anchor resolver core.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..', '..', '..');

const MODULE_REL = 'src-surfaces-base/studio/reader-notes/anchor-resolver.studio.js';
const A1_3_VALIDATOR_REL = 'tools/validation/reader-notes/validate-reader-notes-mvp-a1_3.mjs';
const A1_2_VALIDATOR_REL = 'tools/validation/reader-notes/validate-reader-notes-mvp-a1_2.mjs';
const A1_1_VALIDATOR_REL = 'tools/validation/reader-notes/validate-reader-notes-mvp-a1_1.mjs';
const A0_VALIDATOR_REL = 'tools/validation/reader-notes/validate-reader-notes-architecture-contract-v1_2.mjs';
const STUDIO_HTML_REL = 'src-surfaces-base/studio/studio.html';
const PACK_REL = 'tools/product/studio/pack-studio.mjs';
const FLAG_KEY = 'studio.readerNotes.anchorResolver.enabled';
const A2A_MARKERS = ['anchorResolver', 'anchor-resolver', 'resolveInText'];
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
const WRITE_METHODS = [
  'set',
  'save',
  'update',
  'remove',
  'delete',
  'upsert',
  'patch',
  'clear',
  'write',
  'put',
  'add',
  'mutate',
  'persist',
  'commit',
];

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
function assertSpan(actual, start, end) {
  assert.ok(actual, 'expected span');
  assert.equal(actual.start, start);
  assert.equal(actual.end, end);
}

const moduleText = read(MODULE_REL);

function freshRuntime(options = {}) {
  const flagValue = options.flag;
  const mock = {
    flags: options.missingFlags ? null : {
      get(key, fallback) {
        return key === FLAG_KEY && flagValue !== undefined ? flagValue : fallback;
      },
    },
    Studio: { readerNotes: {} },
  };
  const sandbox = { H2O: mock };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(moduleText, sandbox, { filename: 'anchor-resolver.studio.js' });
  return sandbox.H2O.Studio.readerNotes.anchorResolver;
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

check('anchor-resolver module exists', () => {
  assert.ok(fs.existsSync(path.join(REPO_ROOT, MODULE_REL)));
});

check('API installs H2O.Studio.readerNotes.anchorResolver', () => {
  const api = freshRuntime({ flag: true });
  assert.ok(api && api.__installed === true);
  has(moduleText, 'H2O.Studio.readerNotes.anchorResolver', 'namespace');
});

check('API is frozen/read-only with exact public allowlist', () => {
  const api = freshRuntime({ flag: true });
  assert.equal(api.readonly, true);
  assert.ok(Object.isFrozen(api));
  const keys = Object.keys(api).sort();
  assert.deepEqual(keys, ['__installed', 'diagnose', 'flagKey', 'isEnabled', 'readonly', 'resolveInText', 'selfCheck', 'version']);
  const fns = keys.filter((key) => typeof api[key] === 'function').sort();
  assert.deepEqual(fns, ['diagnose', 'isEnabled', 'resolveInText', 'selfCheck']);
});

check('no write-like public methods or method calls', () => {
  const api = freshRuntime({ flag: true });
  for (const method of WRITE_METHODS) assert.equal(typeof api[method], 'undefined', `${method} must not be public`);
  for (const method of WRITE_METHODS) {
    assert.ok(!new RegExp(`\\.\\s*${method}\\s*\\(`).test(moduleText), `must not call .${method}()`);
    assert.ok(!new RegExp(`\\b${method}\\s*:`).test(moduleText), `must not expose ${method}:`);
  }
});

check('feature flag key exists and defaults off', () => {
  has(moduleText, FLAG_KEY, 'flag key');
  has(moduleText, 'get(FLAG_KEY, false)', 'default off read');
  assert.equal(freshRuntime({ flag: true }).isEnabled(), true);
  assert.equal(freshRuntime({ flag: false }).isEnabled(), false);
  assert.equal(freshRuntime({ missingFlags: true }).isEnabled(), false);
});

check('flag off and missing flags return orphaned', () => {
  const anchors = { textQuote: { exact: 'needle' } };
  const off = freshRuntime({ flag: false }).resolveInText(anchors, 'needle');
  assert.equal(off.status, 'orphaned');
  assert.equal(off.reason, 'disabled');
  const missing = freshRuntime({ missingFlags: true }).resolveInText(anchors, 'needle');
  assert.equal(missing.status, 'orphaned');
  assert.equal(missing.reason, 'disabled');
});

check('TextQuote unique exact match returns anchored', () => {
  const api = freshRuntime({ flag: true });
  const res = api.resolveInText({ textQuote: { exact: 'brown fox' } }, 'the brown fox jumps');
  assert.equal(res.status, 'anchored');
  assert.equal(res.selectorUsed, 'textQuote');
  assert.equal(res.confidence, 1.0);
  assertSpan(res.span, 4, 13);
});

check('TextQuote repeated match with prefix/suffix selects correct span', () => {
  const api = freshRuntime({ flag: true });
  const plain = 'alpha target beta alpha target gamma';
  const res = api.resolveInText({ textQuote: { exact: 'target', prefix: 'alpha ', suffix: ' gamma' } }, plain);
  assert.equal(res.status, 'anchored');
  assertSpan(res.span, 24, 30);
  assert.equal(res.confidence, 1.0);
});

check('TextQuote repeated match with approx tie-break selects nearest span', () => {
  const api = freshRuntime({ flag: true });
  const plain = 'target x target y target';
  const res = api.resolveInText({ textQuote: { exact: 'target', approx: 9 } }, plain);
  assert.equal(res.status, 'anchored');
  assertSpan(res.span, 9, 15);
  assert.equal(res.confidence, 0.9);
});

check('ambiguous TextQuote without safe tie-break returns orphaned', () => {
  const api = freshRuntime({ flag: true });
  const res = api.resolveInText({ textQuote: { exact: 'target' } }, 'target target');
  assert.equal(res.status, 'orphaned');
  assert.equal(res.reason, 'ambiguous-textQuote');
});

check('wrong prefix/suffix returns orphaned', () => {
  const api = freshRuntime({ flag: true });
  const res = api.resolveInText({ textQuote: { exact: 'target', prefix: 'missing' } }, 'alpha target');
  assert.equal(res.status, 'orphaned');
  assert.equal(res.reason, 'no-safe-match');
});

check('no fuzzy search is performed', () => {
  const api = freshRuntime({ flag: true });
  const res = api.resolveInText({ textQuote: { exact: 'target' } }, 'targat');
  assert.equal(res.status, 'orphaned');
});

check('TextPos fallback works when quote validation passes', () => {
  const api = freshRuntime({ flag: true });
  const plain = 'alpha multi   space beta';
  const res = api.resolveInText({
    textQuote: { exact: 'multi space', prefix: 'missing' },
    textPos: { start: 6, end: 19 },
  }, plain);
  assert.equal(res.status, 'reanchored');
  assert.equal(res.selectorUsed, 'textPos');
  assert.equal(res.confidence, 0.75);
  assertSpan(res.span, 6, 19);
});

check('TextPos fallback fails when quote validation fails', () => {
  const api = freshRuntime({ flag: true });
  const res = api.resolveInText({
    textQuote: { exact: 'needle', prefix: 'missing' },
    textPos: { start: 0, end: 5 },
  }, 'wrong text');
  assert.equal(res.status, 'orphaned');
});

check('TextPos out-of-bounds returns orphaned', () => {
  const api = freshRuntime({ flag: true });
  const res = api.resolveInText({
    textQuote: { exact: 'needle', prefix: 'missing' },
    textPos: { start: 0, end: 999 },
  }, 'needle');
  assert.equal(res.status, 'orphaned');
});

check('XPath is ignored and marked deferred', () => {
  const api = freshRuntime({ flag: true });
  const res = api.resolveInText({ xpath: { startXPath: './/x' } }, 'needle');
  assert.equal(res.status, 'orphaned');
  assert.equal(res.selectorUsed, null);
  assert.equal(res.diagnostics.xpathDeferred, true);
});

check('unsupported or malformed anchors fail closed', () => {
  const api = freshRuntime({ flag: true });
  assert.equal(api.resolveInText(null, 'x').status, 'orphaned');
  assert.equal(api.resolveInText({ textQuote: { exact: '' } }, 'x').status, 'orphaned');
  assert.equal(api.resolveInText({ textPos: { start: 0, end: 1 } }, 'x').status, 'orphaned');
  assert.equal(api.resolveInText({ textQuote: { exact: 'x' } }, null).status, 'orphaned');
});

check('inputs are not mutated', () => {
  const api = freshRuntime({ flag: true });
  const anchors = { textQuote: { exact: 'needle', prefix: 'a' }, textPos: { start: 2, end: 8 }, xpath: { a: 1 } };
  const before = JSON.stringify(anchors);
  const plain = 'a needle b';
  api.resolveInText(anchors, plain);
  assert.equal(JSON.stringify(anchors), before);
  assert.equal(plain, 'a needle b');
});

check('no forbidden browser or storage APIs in module', () => {
  for (const token of ['document', 'window', 'TreeWalker', 'Range', 'document.evaluate',
    'chrome.', 'localStorage', 'sessionStorage', 'indexedDB']) {
    hasNot(moduleText, token, `forbidden token ${token}`);
  }
});

check('no sidecar/enrichment/native_note/renderer markers', () => {
  for (const token of ['sidecar', 'enrichment', 'native_note', 'nativeNote', 'rendererRegistry', 'buildReaderDOM']) {
    hasNot(moduleText, token, `forbidden marker ${token}`);
  }
});

check('no A1 module, loader, or pack changes required', () => {
  const html = read(STUDIO_HTML_REL);
  const pack = read(PACK_REL);
  hasNot(html, 'anchor-resolver.studio.js', 'studio.html must not load A2a.1');
  hasNot(pack, 'anchor-resolver.studio.js', 'pack must not include A2a.1');
  assert.ok(readIfExists('src-surfaces-base/studio/reader-notes/library-item-view.studio.js'), 'A1.1 present');
  assert.ok(readIfExists('src-surfaces-base/studio/reader-notes/annotation-facade.studio.js'), 'A1 annotation facade present');
});

check('forbidden paths carry no A2a footprint', () => {
  for (const rel of FORBIDDEN_FILES) {
    const text = readIfExists(rel);
    if (text == null) continue;
    for (const marker of A2A_MARKERS) hasNot(text, marker, `forbidden file ${rel}`);
  }
  for (const dirRel of FORBIDDEN_DIRS) {
    for (const file of listFilesRecursive(path.join(REPO_ROOT, dirRel), [])) {
      let text = '';
      try { text = fs.readFileSync(file, 'utf8'); } catch { continue; }
      for (const marker of A2A_MARKERS) {
        assert.ok(!text.includes(marker), `forbidden dir ${dirRel} file ${path.relative(REPO_ROOT, file)} contains ${marker}`);
      }
    }
  }
});

check('A1.3 validator still passes', () => runValidator(A1_3_VALIDATOR_REL));
check('A1.2 validator still passes', () => runValidator(A1_2_VALIDATOR_REL));
check('A1.1 validator still passes', () => runValidator(A1_1_VALIDATOR_REL));
check('A0 contract validator still passes', () => runValidator(A0_VALIDATOR_REL));

if (fail.length) {
  console.log(`\nReader & Notes MVP-A2a validation failed: ${fail.length} failed, ${pass.length} passed.`);
  process.exitCode = 1;
} else {
  console.log(`\nReader & Notes MVP-A2a validation passed: ${pass.length} checks.`);
}
