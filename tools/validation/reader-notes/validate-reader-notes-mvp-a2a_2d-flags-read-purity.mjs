#!/usr/bin/env node
// Validator for Studio Reader & Notes MVP-A2a.2d:
// behavioral read-purity audit for H2O.flags.get before A2a runtime exposure.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..', '..', '..');

const STUDIO_DIR_REL = 'src-surfaces-base/studio';
const CORE_REL = 'src-surfaces-base/studio/reader-notes/anchor-resolver.studio.js';
const DOM_REL = 'src-surfaces-base/studio/reader-notes/anchor-resolver-dom.studio.js';
const STUDIO_HTML_REL = 'src-surfaces-base/studio/studio.html';
const PACK_REL = 'tools/product/studio/pack-studio.mjs';
const EVIDENCE_REL = 'release-evidence/2026-06-30/reader-notes-a2a2d-flags-read-purity.md';
const A2A2C_VALIDATOR_REL = 'tools/validation/reader-notes/validate-reader-notes-mvp-a2a_2_tauri-webkit-smoke.mjs';
const A2A2_VALIDATOR_REL = 'tools/validation/reader-notes/validate-reader-notes-mvp-a2a_2.mjs';
const A2A_VALIDATOR_REL = 'tools/validation/reader-notes/validate-reader-notes-mvp-a2a.mjs';
const A1_3_VALIDATOR_REL = 'tools/validation/reader-notes/validate-reader-notes-mvp-a1_3.mjs';
const A1_2_VALIDATOR_REL = 'tools/validation/reader-notes/validate-reader-notes-mvp-a1_2.mjs';
const A1_1_VALIDATOR_REL = 'tools/validation/reader-notes/validate-reader-notes-mvp-a1_1.mjs';
const A0_VALIDATOR_REL = 'tools/validation/reader-notes/validate-reader-notes-architecture-contract-v1_2.mjs';

const START_MARKER = '// ── H2O.flags registry (minimal, per-surface)';
const END_MARKER = '// ── Library Core registration';
const FLAGS_STORAGE_KEY = 'h2o:flags:v1';
const RESOLVER_FLAG_KEY = 'studio.readerNotes.anchorResolver.enabled';

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

function assertNoConflictMarkers(rel, text) {
  for (const marker of ['<<<<<<<', '=======', '>>>>>>>']) {
    assert.ok(!text.includes(marker), `${rel} contains conflict marker ${marker}`);
  }
}

function resolveS0F1kRel() {
  const dir = path.join(REPO_ROOT, STUDIO_DIR_REL);
  const name = fs.readdirSync(dir).find((entry) => entry.startsWith('S0F1k'));
  assert.ok(name, 'must find S0F1k flag registry source by prefix');
  return path.join(STUDIO_DIR_REL, name);
}

function sliceFlagRegistry(source) {
  const start = source.indexOf(START_MARKER);
  const end = source.indexOf(END_MARKER, start);
  assert.ok(start >= 0, 'flag registry start marker must exist');
  assert.ok(end > start, 'flag registry end marker must exist after start');
  const sliced = source.slice(start, end);
  for (const needle of [
    'function ensureFlags',
    'get(name, fallback',
    'set(name, value',
    'writeFlagsToStorage',
    'readFlagsFromStorage',
    'H2O.flags',
  ]) {
    has(sliced, needle, `non-vacuous flag slice guard`);
  }
  return sliced;
}

function extractMethodBody(text, signature) {
  const start = text.indexOf(signature);
  assert.ok(start >= 0, `missing method signature ${signature}`);
  const brace = text.indexOf('{', start);
  assert.ok(brace > start, `missing body for ${signature}`);
  let depth = 0;
  for (let i = brace; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(brace + 1, i);
    }
  }
  throw new Error(`unterminated method body for ${signature}`);
}

function makeLocalStorage(initialFlags = {}) {
  const calls = [];
  const data = Object.create(null);
  data[FLAGS_STORAGE_KEY] = JSON.stringify(initialFlags);
  return {
    calls,
    api: {
      getItem(key) {
        calls.push({ op: 'getItem', key: String(key) });
        return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
      },
      setItem(key, value) {
        calls.push({ op: 'setItem', key: String(key), value: String(value) });
        data[String(key)] = String(value);
      },
      removeItem(key) {
        calls.push({ op: 'removeItem', key: String(key) });
        delete data[String(key)];
      },
      clear() {
        calls.push({ op: 'clear' });
        Object.keys(data).forEach((key) => { delete data[key]; });
      },
    },
  };
}

function writeCalls(calls) {
  return calls.filter((call) => call.op === 'setItem' || call.op === 'removeItem' || call.op === 'clear');
}

function makeFlagRuntime(initialFlags = {}) {
  const sourceRel = resolveS0F1kRel();
  const source = read(sourceRel);
  const slice = sliceFlagRegistry(source);
  const storage = makeLocalStorage(initialFlags);
  const errCalls = [];
  const stepCalls = [];
  const sandbox = {
    H2O: {},
    W: { localStorage: storage.api },
    SURFACE: 'studio-validator',
    err(label, error) {
      errCalls.push({ label, error: String(error && error.message || error || '') });
    },
    step(label, detail) {
      stepCalls.push({ label, detail: String(detail || '') });
    },
  };
  sandbox.errCalls = errCalls;
  sandbox.stepCalls = stepCalls;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(`${slice}\nglobalThis.__ensureFlags = ensureFlags;`, sandbox, { filename: sourceRel });
  sandbox.__ensureFlags();
  return { sandbox, calls: storage.calls, slice, sourceRel };
}

function clearCalls(runtime) {
  runtime.calls.splice(0, runtime.calls.length);
}

function keys(runtime) {
  return Array.from(runtime.sandbox.H2O.flags.diagnose().keys).sort();
}

function assertNoWrites(runtime, label) {
  assert.deepEqual(writeCalls(runtime.calls), [], `${label}: expected zero storage writes`);
}

function loadResolversWithFlags(flagsValue) {
  const coreSource = read(CORE_REL);
  const domSource = read(DOM_REL);
  const writes = [];
  const getCalls = [];
  let flags;
  if (flagsValue === 'missing') {
    flags = undefined;
  } else if (flagsValue === 'malformed') {
    flags = { set() { writes.push('set'); } };
  } else if (flagsValue === 'throwing') {
    flags = {
      get() { throw new Error('flag boom'); },
      set() { writes.push('set'); },
    };
  } else {
    flags = {
      get(key, fallback) {
        getCalls.push({ key, fallback });
        return flagsValue;
      },
      set() { writes.push('set'); },
      removeItem() { writes.push('removeItem'); },
      clear() { writes.push('clear'); },
    };
  }
  const sandbox = {
    H2O: {
      Studio: { readerNotes: {} },
    },
  };
  if (flags !== undefined) sandbox.H2O.flags = flags;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(coreSource, sandbox, { filename: CORE_REL });
  vm.runInContext(domSource, sandbox, { filename: DOM_REL });
  return {
    core: sandbox.H2O.Studio.readerNotes.anchorResolver,
    dom: sandbox.H2O.Studio.readerNotes.anchorResolverDom,
    writes,
    getCalls,
  };
}

function loadResolversWithRealFlags(initialFlags = {}) {
  const runtime = makeFlagRuntime(initialFlags);
  const coreSource = read(CORE_REL);
  const domSource = read(DOM_REL);
  runtime.sandbox.H2O.Studio = { readerNotes: {} };
  vm.runInContext(coreSource, runtime.sandbox, { filename: CORE_REL });
  vm.runInContext(domSource, runtime.sandbox, { filename: DOM_REL });
  return {
    runtime,
    core: runtime.sandbox.H2O.Studio.readerNotes.anchorResolver,
    dom: runtime.sandbox.H2O.Studio.readerNotes.anchorResolverDom,
  };
}

function runValidator(rel) {
  const full = path.join(REPO_ROOT, rel);
  assert.ok(fs.existsSync(full), `${rel} must exist`);
  try {
    const out = execFileSync('node', [full], { cwd: REPO_ROOT, encoding: 'utf8' });
    assert.ok(/validation passed|tauri-webkit-console-harness-generated/.test(out), `${rel} did not report passed`);
  } catch (error) {
    const output = (error && (error.stdout || '')) + (error && (error.stderr || ''));
    throw new Error(`${rel} failed (exit ${error && error.status}): ${output.slice(-900)}`);
  }
}

const sourceRel = resolveS0F1kRel();
const sourceText = read(sourceRel);
const flagSlice = sliceFlagRegistry(sourceText);
const evidenceText = read(EVIDENCE_REL);

check('S0F1k flag registry source is resolved defensively and sliced only', () => {
  assert.ok(path.basename(sourceRel).startsWith('S0F1k'));
  assert.ok(flagSlice.length < sourceText.length / 10, 'slice should be much smaller than full S0F1k source');
  hasNot(flagSlice, 'function registerCanonicalServices', 'slice must stop before Library Core registration');
  assertNoConflictMarkers(sourceRel, sourceText);
});

check('static get body has no write or event side-effect calls', () => {
  const getBody = extractMethodBody(flagSlice, 'get(name, fallback');
  for (const token of ['writeFlagsToStorage', 'setItem', 'removeItem', 'clear', 'dispatchEvent', 'addEventListener']) {
    hasNot(getBody, token, `get body token ${token}`);
  }
  assert.ok(!/\bset\s*\(/.test(getBody), 'get body must not call set(...)');
  for (const token of ['dispatchEvent', 'addEventListener', 'emit(', '.emit(']) {
    hasNot(flagSlice, token, `flag slice event token ${token}`);
  }
});

check('ensureFlags boot reads localStorage but does not write', () => {
  const runtime = makeFlagRuntime({ existingTrue: true });
  assert.ok(runtime.sandbox.H2O.flags, 'H2O.flags installed');
  assert.ok(runtime.calls.some((call) => call.op === 'getItem'), 'boot should read localStorage');
  assertNoWrites(runtime, 'ensureFlags boot');
});

check('get missing key fallback false is read-pure and does not persist defaults', () => {
  const runtime = makeFlagRuntime({ existing: true });
  clearCalls(runtime);
  const before = keys(runtime);
  assert.equal(runtime.sandbox.H2O.flags.get('missing.key', false), false);
  assertNoWrites(runtime, 'get missing false');
  assert.deepEqual(keys(runtime), before, 'diagnose keys must be unchanged');
});

check('get missing key fallback true is read-pure and does not persist defaults', () => {
  const runtime = makeFlagRuntime({ existing: true });
  clearCalls(runtime);
  const before = keys(runtime);
  assert.equal(runtime.sandbox.H2O.flags.get('missing.key', true), true);
  assertNoWrites(runtime, 'get missing true');
  assert.deepEqual(keys(runtime), before, 'diagnose keys must be unchanged');
});

check('get existing false and true keys are read-pure', () => {
  const runtime = makeFlagRuntime({ existingFalse: false, existingTrue: true });
  clearCalls(runtime);
  const before = keys(runtime);
  assert.equal(runtime.sandbox.H2O.flags.get('existingFalse', true), false);
  assert.equal(runtime.sandbox.H2O.flags.get('existingTrue', false), true);
  assertNoWrites(runtime, 'get existing values');
  assert.deepEqual(keys(runtime), before, 'diagnose keys must be unchanged');
});

check('set control writes storage and mutates diagnose keys', () => {
  const runtime = makeFlagRuntime({});
  clearCalls(runtime);
  const before = keys(runtime);
  assert.equal(runtime.sandbox.H2O.flags.set('control.write', true), true);
  assert.ok(writeCalls(runtime.calls).some((call) => call.op === 'setItem'), 'set control must write setItem');
  assert.deepEqual(before, []);
  assert.deepEqual(keys(runtime), ['control.write']);
});

check('resolver isEnabled fail-closed and write-free with mock flags', () => {
  for (const scenario of ['missing', 'malformed', 'throwing', false, true]) {
    const rt = loadResolversWithFlags(scenario);
    const expected = scenario === true;
    assert.equal(rt.core.isEnabled(), expected, `core isEnabled scenario ${scenario}`);
    assert.equal(rt.dom.isEnabled(), expected, `dom isEnabled scenario ${scenario}`);
    assert.deepEqual(rt.writes, [], `scenario ${scenario} must not call mock write methods`);
    if (scenario === false || scenario === true) {
      assert.deepEqual(rt.getCalls.map((call) => call.key), [RESOLVER_FLAG_KEY, RESOLVER_FLAG_KEY]);
      assert.deepEqual(rt.getCalls.map((call) => call.fallback), [false, false]);
    }
  }
});

check('resolver isEnabled is write-free against real sliced H2O.flags.get', () => {
  let rt = loadResolversWithRealFlags({});
  clearCalls(rt.runtime);
  const beforeMissing = keys(rt.runtime);
  assert.equal(rt.core.isEnabled(), false);
  assert.equal(rt.dom.isEnabled(), false);
  assertNoWrites(rt.runtime, 'resolver missing flag');
  assert.deepEqual(keys(rt.runtime), beforeMissing);

  rt = loadResolversWithRealFlags({ [RESOLVER_FLAG_KEY]: false });
  clearCalls(rt.runtime);
  const beforeFalse = keys(rt.runtime);
  assert.equal(rt.core.isEnabled(), false);
  assert.equal(rt.dom.isEnabled(), false);
  assertNoWrites(rt.runtime, 'resolver false flag');
  assert.deepEqual(keys(rt.runtime), beforeFalse);

  rt = loadResolversWithRealFlags({ [RESOLVER_FLAG_KEY]: true });
  clearCalls(rt.runtime);
  const beforeTrue = keys(rt.runtime);
  assert.equal(rt.core.isEnabled(), true);
  assert.equal(rt.dom.isEnabled(), true);
  assertNoWrites(rt.runtime, 'resolver true flag');
  assert.deepEqual(keys(rt.runtime), beforeTrue);
});

check('A2a.2d loader boundary is superseded by A2a.3 inert exposure gate', () => {
  const html = read(STUDIO_HTML_REL);
  const pack = read(PACK_REL);
  assertNoConflictMarkers(STUDIO_HTML_REL, html);
  assertNoConflictMarkers(PACK_REL, pack);
  has(html, 'reader-notes/library-item-view.studio.js', 'studio.html A1.1 boundary');
  has(html, 'reader-notes/annotation-facade.studio.js', 'studio.html A1.2 boundary');
  has(pack, 'reader-notes/library-item-view.studio.js', 'pack A1.1 boundary');
  has(pack, 'reader-notes/annotation-facade.studio.js', 'pack A1.2 boundary');
});

check('evidence doc records read-purity gate and deferred scope', () => {
  for (const token of [
    'A2a.2d proves the flags read-purity prerequisite',
    'H2O.flags.get(key, fallback) is read-pure',
    'ensureFlags() boot may read localStorage via getItem, but does not write',
    'get() does not persist defaults',
    'set() is the only proven write path',
    'A2a modules remain un-wired',
    'does not authorize loader/pack wiring',
    'No runtime/source modules were modified',
  ]) {
    has(evidenceText, token, 'evidence doc');
  }
});

check('A2a.2c generator validator still passes with known historical OPEN-string debt', () => runValidator(A2A2C_VALIDATOR_REL));
check('A2a.2 validator still passes', () => runValidator(A2A2_VALIDATOR_REL));
check('A2a validator still passes', () => runValidator(A2A_VALIDATOR_REL));
check('A1.3 validator still passes', () => runValidator(A1_3_VALIDATOR_REL));
check('A1.2 validator still passes', () => runValidator(A1_2_VALIDATOR_REL));
check('A1.1 validator still passes', () => runValidator(A1_1_VALIDATOR_REL));
check('A0 contract validator still passes', () => runValidator(A0_VALIDATOR_REL));

if (fail.length) {
  console.log(`\nReader & Notes MVP-A2a.2d flags read-purity validation failed: ${fail.length} failed, ${pass.length} passed.`);
  process.exitCode = 1;
} else {
  console.log(`\nReader & Notes MVP-A2a.2d flags read-purity validation passed: ${pass.length} checks.`);
}
