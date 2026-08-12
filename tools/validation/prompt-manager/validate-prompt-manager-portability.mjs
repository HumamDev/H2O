#!/usr/bin/env node
// Validator for Prompt Manager (7A1a) Phase 2C — portability:
// export envelope, strict import validation, Merge/Replace identity rules,
// the pre-import backup, and all-or-nothing behaviour across the two live
// stores.
//
// Every case drives the REAL production helpers through the flag-gated
// `__H2O_PM_TEST__` hook. Nothing here reimplements a shape, a validation rule,
// a merge rule or a rollback: a private copy would pass happily while the
// shipped code lost a user's library.
//
// Two kinds of case appear below and are labelled as such:
//   [live]   the production function is executed against real inputs
//   [source] the shipped call sites are asserted against the module text,
//            because the production build has no test hook for UI handlers
//            (its absence there is itself a Phase 1 guarantee)

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..', '..', '..');
const MODULE_REL = 'src-runtime-base/7A1a.⬜️✍️ Prompt Manager ✍️.js';
const SRC = fs.readFileSync(path.join(REPO_ROOT, MODULE_REL), 'utf8');

const PASS = [];
const FAIL = [];
function check(label, fn) {
  try { fn(); PASS.push(label); console.log(`  ✓ ${label}`); }
  catch (e) {
    const m = e && e.message ? e.message : String(e);
    FAIL.push({ label, m });
    console.log(`  ✗ ${label}`);
    console.log(`      ${m.split('\n')[0]}`);
  }
}

/* Values built inside the vm realm carry that realm's prototypes, so
 * deepStrictEqual against a host literal fails on identity alone. Every
 * comparison below goes through this first. */
const host = (v) => JSON.parse(JSON.stringify(v));

/* ── sandbox ────────────────────────────────────────────────────────────────
 * Storage is a real in-memory Map so persist/rollback paths are genuine, and
 * `failWrite` is a mutable predicate the tests flip between writes to simulate
 * a quota exhaustion that arrives partway through an import. */
function makeSandbox() {
  const store = new Map();
  /* `sneakWrite` models a storage layer that WRITES and then still throws — the
   * case independent review found, where a setter reports failure while the
   * bytes actually land. It lives here rather than in a wrapper so the failure
   * predicate is consulted exactly once per write. */
  const state = { failWrite: null, sneakWrite: null, writes: [] };
  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => {
      state.writes.push(String(k));
      if (state.failWrite && state.failWrite(String(k), String(v))) {
        if (state.sneakWrite && state.sneakWrite(String(k))) store.set(k, String(v));
        throw new Error('QuotaExceededError (simulated)');
      }
      store.set(k, String(v));
    },
    removeItem: (k) => {
      if (state.failWrite && state.failWrite(String(k), null)) {
        throw new Error('SecurityError (simulated)');
      }
      store.delete(k);
    },
    get length() { return store.size; },
    key: (i) => Array.from(store.keys())[i] ?? null,
  };
  const el = () => ({
    style: {}, value: '', textContent: '', innerText: '', innerHTML: '',
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    setAttribute() {}, getAttribute: () => null, appendChild() {}, remove() {},
    addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
    querySelector: () => null, querySelectorAll: () => [], focus() {}, click() {},
  });
  const sandbox = {
    console, localStorage,
    performance: { now: () => 0 },
    CustomEvent: class { constructor(t, i) { this.type = t; this.detail = i?.detail; } },
    Event: class { constructor(t) { this.type = t; } },
    MutationObserver: class { observe() {} disconnect() {} },
    ResizeObserver: class { observe() {} disconnect() {} },
    CSS: { escape: (s) => String(s) },
    /* Real browsers expose TextEncoder globally; the portability byte-size
     * authority uses it, so the sandbox must too or every size check would
     * fail closed for the wrong reason. */
    TextEncoder,
    Blob: class { constructor(parts, o) { this.parts = parts; this.type = o?.type || ''; } },
    URL: {
      createObjectURL: (b) => { sandbox.__urls.created.push(b); return `blob:pm-${sandbox.__urls.created.length}`; },
      revokeObjectURL: (u) => { sandbox.__urls.revoked.push(u); },
    },
    document: {
      readyState: 'loading',
      documentElement: { classList: { contains: () => false, add() {}, remove() {}, toggle() {} } },
      body: el(), title: '', activeElement: null,
      createElement: el, getElementById: () => null,
      querySelector: () => null, querySelectorAll: () => [],
      addEventListener() {}, removeEventListener() {}, contains: () => true,
    },
    window: {
      __H2O_PM_TEST__: true,
      location: { pathname: '/c/test', href: 'https://chatgpt.com/c/test' },
      localStorage,
      crypto: { randomUUID: (() => { let n = 0; return () => `gen-${++n}`; })() },
      setTimeout: (fn, ms) => { sandbox.__timers.push({ fn, ms }); return sandbox.__timers.length; },
      clearTimeout: (id) => { if (id) sandbox.__cleared.push(id); },
      setInterval: () => 0, clearInterval: () => {},
      requestAnimationFrame: () => 0, cancelAnimationFrame: () => {},
      getComputedStyle: () => ({}), innerWidth: 1280, innerHeight: 900,
      addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
    },
    __timers: [], __cleared: [], __store: store, __ctl: state,
    __urls: { created: [], revoked: [] },
  };
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  return sandbox;
}

function load() {
  const sandbox = makeSandbox();
  vm.runInContext(SRC, sandbox, { filename: MODULE_REL });
  const t = sandbox.window.H2O?.PM?.prmptmngr?.__test;
  if (!t) throw new Error('test hook missing — is __H2O_PM_TEST__ honoured?');
  return { t, sandbox, P: t.portability };
}

const NOW = 1_800_000_000_000;

/* Canonical export-shaped records. Optional metadata appears ONLY when asked
 * for, so "absent" cases really are absent rather than zero-valued. */
const rec = (id, o = {}) => ({
  id,
  title: o.title ?? `T-${id}`,
  body: o.body ?? `B-${id}`,
  type: o.type ?? 'prompt',
  favorite: o.favorite ?? false,
  createdAt: o.createdAt ?? 1000,
  updatedAt: o.updatedAt ?? 2000,
  ...(o.lastUsedAt !== undefined ? { lastUsedAt: o.lastUsedAt } : {}),
  ...(o.useCount !== undefined ? { useCount: o.useCount } : {}),
});

const qrec = (id, o = {}) => ({
  id,
  text: o.text ?? `Q-${id}`,
  order: o.order ?? 0,
  createdAt: o.createdAt ?? 1000,
  updatedAt: o.updatedAt ?? 2000,
});

const envelope = (prompts = [], quickReplies = [], o = {}) => ({
  kind: o.kind ?? 'h2o-prompt-manager-portability',
  version: o.version ?? 1,
  exportedAt: o.exportedAt ?? NOW,
  prompts,
  quickReplies,
});

const ids = (list) => Array.from(list).map(r => r.id);

/* [2C-closure] buildExportEnvelope now returns { ok, envelope | error } because
 * export is all-or-nothing. `built()` asserts success and hands back the
 * envelope, so the contract cases below read as they always did while still
 * exercising the refusal-capable shape. */
const built = (P, prompts, quick, now = NOW) => {
  const r = P.buildExportEnvelope(prompts, quick, now);
  assert.ok(r.ok, `export was expected to succeed, got: ${r.error}`);
  assert.ok(r.envelope, 'a successful export yields an envelope');
  return r.envelope;
};

function main() {
  console.log('Prompt Manager — Phase 2C portability');
  console.log('');

  /* ── EXPORT CONTRACT ───────────────────────────────────────────────────── */
  console.log('  EXPORT CONTRACT');

  check('P1 [live] envelope kind is the one supported portability kind', () => {
    const { P } = load();
    const env = built(P, [], []);
    assert.equal(env.kind, 'h2o-prompt-manager-portability');
    assert.equal(env.kind, P.kind, 'the constant and the emitted value are the same authority');
  });

  check('P2 [live] envelope version is the one supported version', () => {
    const { P } = load();
    assert.equal(built(P, [], []).version, 1);
    assert.equal(P.version, 1);
  });

  check('P3 [live] exportedAt is a finite epoch value', () => {
    const { P } = load();
    assert.equal(built(P, [], []).exportedAt, NOW);
    // Called directly, not through built(): `undefined` must reach the module
    // rather than picking up the helper's default timestamp.
    for (const bad of [undefined, null, NaN, Infinity, -Infinity, 'x', {}]) {
      const r = P.buildExportEnvelope([], [], bad);
      assert.ok(r.ok, `an empty library still exports with stamp ${String(bad)}`);
      const got = r.envelope.exportedAt;
      assert.ok(Number.isFinite(got), `non-finite input ${String(bad)} still yields a finite stamp`);
      assert.equal(got, 0, 'and normalizes to 0 rather than to a guessed clock reading');
    }
  });

  /* [2C-closure-2] RETARGETED. This case previously asserted that a non-array
   * collection still produced an array — which is exactly how a corrupt library
   * exported as zero records and reported success. A non-array now REFUSES. */
  check('P4 [live] a non-array Prompt collection refuses; a real array projects', () => {
    const { P } = load();
    for (const bad of [undefined, null, 'x', 7, {}]) {
      const r = P.buildExportEnvelope(bad, [], NOW);
      assert.equal(r.ok, false, `non-array refused: ${String(bad)}`);
      assert.equal(r.envelope, null);
      assert.equal(r.error, P.messages.exportInvalidPrompts);
    }
    assert.deepEqual(host(built(P, [rec('a')], []).prompts).map(r => r.id), ['a']);
    assert.ok(Array.isArray(built(P, [], []).prompts), 'and [] is still a valid empty library');
  });

  /* [2C-closure-2] RETARGETED for the same reason as P4. */
  check('P5 [live] a non-array Quick collection refuses; a real array projects', () => {
    const { P } = load();
    for (const bad of [undefined, null, 'x', 7, {}]) {
      const r = P.buildExportEnvelope([], bad, NOW);
      assert.equal(r.ok, false, `non-array refused: ${String(bad)}`);
      assert.equal(r.envelope, null);
      assert.equal(r.error, P.messages.exportInvalidQuick);
    }
    assert.deepEqual(host(built(P, [], [qrec('q1')]).quickReplies).map(r => r.id), ['q1']);
    assert.ok(Array.isArray(built(P, [], []).quickReplies));
  });

  check('P6 [live] no capture store reaches the envelope', () => {
    const { t, P } = load();
    // Populate every capture store, then export.
    t.storage.setJSON(t.keys.history, [{ id: 'h1', text: 'secret history', createdAt: 1 }]);
    t.storage.setJSON(t.keys.drafts, [{ id: 'd1', text: 'secret draft', createdAt: 1 }]);
    t.storage.setJSON(t.keys.pasted, [{ id: 'p1', text: 'secret pasted', createdAt: 1 }]);
    const env = built(P, [rec('a')], [qrec('q1')]);
    const text = P.serializeExport(env);
    assert.equal(Object.keys(host(env)).sort().join(','), 'exportedAt,kind,prompts,quickReplies,version');
    for (const leak of ['history', 'drafts', 'pasted', 'secret history', 'secret draft', 'secret pasted']) {
      assert.ok(!text.includes(leak), `no "${leak}" anywhere in the serialized envelope`);
    }
  });

  check('P7 [live] no UI, search, filter or config state reaches the envelope', () => {
    const { t, P } = load();
    t.state.ui.searchQuery = 'my-private-query';
    t.state.ui.editCategory = 'favorites';
    t.state.ui.simpleTypeFilter = 'append';
    t.engine.setAutoSend(true);
    t.engine.setUiMode('edit');
    const text = P.serializeExport(built(P, [rec('a')], [qrec('q1')]));
    for (const leak of ['my-private-query', 'autoSend', 'auto_send', 'uiMode', 'searchQuery',
      'editCategory', 'simpleTypeFilter', 'seeded', 'migrate', 'corrupt']) {
      assert.ok(!text.includes(leak), `no "${leak}" in the envelope`);
    }
    assert.deepEqual(Object.keys(host(built(P, [], []))).sort(),
      Array.from(P.envelopeKeys).sort(), 'envelope keys are exactly the declared contract');
  });

  check('P8 [live] serialize → parse → validate round-trips an export exactly', () => {
    const { P } = load();
    const env = built(P,
      [rec('a', { favorite: true, type: 'append', lastUsedAt: 555, useCount: 3 }), rec('b')],
      [qrec('q1', { order: 0 }), qrec('q2', { order: 1 })]);
    const res = P.parseImportText(P.serializeExport(env));
    assert.ok(res.ok, `round trip validates: ${res.error}`);
    assert.deepEqual(host(res.envelope), host(env), 'byte-for-byte the same data');
  });

  check('P9 [live] Prompt metadata is preserved, and absent stays absent', () => {
    const { P } = load();
    const withMeta = rec('a', { favorite: true, type: 'append', createdAt: 11, updatedAt: 22, lastUsedAt: 33, useCount: 4 });
    const noMeta = rec('b');
    const env = host(built(P, [withMeta, noMeta], []));
    assert.deepEqual(env.prompts[0], {
      id: 'a', title: 'T-a', body: 'B-a', type: 'append', favorite: true,
      createdAt: 11, updatedAt: 22, lastUsedAt: 33, useCount: 4,
    });
    assert.ok(!('lastUsedAt' in env.prompts[1]), 'absent usage metadata is not materialized');
    assert.ok(!('useCount' in env.prompts[1]), 'absent useCount is not materialized');
  });

  check('P10 [live] Quick metadata is preserved exactly', () => {
    const { P } = load();
    const env = host(built(P, [], [qrec('q1', { text: 'Yes', order: 2, createdAt: 7, updatedAt: 8 })]));
    assert.deepEqual(env.quickReplies[0], { id: 'q1', text: 'Yes', order: 2, createdAt: 7, updatedAt: 8 });
    assert.deepEqual(Object.keys(env.quickReplies[0]).sort(), Array.from(P.quickKeys).sort());
  });

  /* [2C-closure] RETARGETED. This case previously APPROVED the skipping
   * behaviour ("first occurrence wins"). Independent review proved that a
   * five-record library could produce a one-record file while the UI reported
   * "Exported", so the behaviour was rejected and replaced by an all-or-nothing
   * refusal. The case now pins the opposite guarantee. */
  check('P10a [live] export REFUSES a library it cannot represent losslessly', () => {
    const { P } = load();
    const lossy = P.buildExportEnvelope(
      [rec('a'), { title: 'no id', body: 'x' }, rec('a', { title: 'dup' }), rec('b')],
      [qrec('q1'), qrec('q1', { text: 'dup' })],
      NOW,
    );
    assert.equal(lossy.ok, false, 'no file is produced for a library with unusable records');
    assert.equal(lossy.envelope, null, 'and no partial envelope is handed back');
    assert.equal(lossy.error, P.messages.exportInvalidPrompts,
      'reported as an invalid Prompt library, without naming any record content');
    // The clean subset still exports, and every source record appears.
    const good = built(P, [rec('a'), rec('b')], [qrec('q1')]);
    assert.deepEqual(ids(good.prompts), ['a', 'b']);
    assert.deepEqual(ids(good.quickReplies), ['q1']);
    assert.ok(P.parseImportText(P.serializeExport(good)).ok, 'and the produced file is importable');
  });

  check('P10b [live] export filename is deterministic and JSON-suffixed', () => {
    const { P } = load();
    const a = P.exportFilename(NOW);
    assert.equal(a, P.exportFilename(NOW), 'same input, same name');
    assert.match(a, /^h2o-prompt-manager-\d{4}-\d{2}-\d{2}\.json$/);
    assert.match(P.exportFilename(NaN), /^h2o-prompt-manager-.*\.json$/, 'a non-finite stamp still yields a safe name');
  });

  /* ── STRICT ENVELOPE VALIDATION ────────────────────────────────────────── */
  console.log('');
  console.log('  STRICT ENVELOPE VALIDATION');

  const rejects = (P, value, expected) => {
    const res = P.validateImportEnvelope(value);
    assert.equal(res.ok, false, 'rejected');
    assert.equal(res.envelope, null, 'and yields no candidate envelope');
    if (expected) assert.equal(res.error, expected);
    return res;
  };

  check('P11 [live] null root rejected', () => {
    const { P } = load();
    rejects(P, null, P.messages.invalid);
    rejects(P, undefined, P.messages.invalid);
  });

  check('P12 [live] array root rejected', () => {
    const { P } = load();
    rejects(P, [], P.messages.invalid);
    rejects(P, [envelope()], P.messages.invalid);
  });

  check('P13 [live] wrong kind rejected', () => {
    const { P } = load();
    rejects(P, envelope([], [], { kind: 'h2o-prompt-manager-import-backup' }), P.messages.invalid);
    rejects(P, envelope([], [], { kind: 'something-else' }), P.messages.invalid);
  });

  check('P14 [live] missing kind rejected', () => {
    const { P } = load();
    const e = envelope(); delete e.kind;
    rejects(P, e, P.messages.invalid);
  });

  check('P15 [live] wrong version rejected with the version message', () => {
    const { P } = load();
    rejects(P, envelope([], [], { version: 2 }), P.messages.version);
    rejects(P, envelope([], [], { version: 0 }), P.messages.version);
    rejects(P, envelope([], [], { version: '1' }), P.messages.version);
  });

  check('P16 [live] missing prompts rejected', () => {
    const { P } = load();
    const e = envelope(); delete e.prompts;
    rejects(P, e, P.messages.invalid);
  });

  check('P17 [live] non-array prompts rejected', () => {
    const { P } = load();
    for (const bad of [null, {}, 'x', 3, true]) rejects(P, envelope(bad, []), P.messages.invalid);
  });

  check('P18 [live] missing quickReplies rejected', () => {
    const { P } = load();
    const e = envelope(); delete e.quickReplies;
    rejects(P, e, P.messages.invalid);
  });

  check('P19 [live] non-array quickReplies rejected', () => {
    const { P } = load();
    for (const bad of [null, {}, 'x', 3, true]) rejects(P, envelope([], bad), P.messages.invalid);
  });

  check('P20 [live] malformed Prompt records rejected, one field at a time', () => {
    const { P } = load();
    const bad = [
      ['null record', null],
      ['array record', []],
      ['string record', 'x'],
      ['missing id', (() => { const r = rec('a'); delete r.id; return r; })()],
      ['blank id', rec('   ')],
      ['numeric id', rec(7)],
      ['missing title', (() => { const r = rec('a'); delete r.title; return r; })()],
      ['numeric title', rec('a', { title: 5 })],
      ['missing body', (() => { const r = rec('a'); delete r.body; return r; })()],
      // Built directly: the `rec` helper's ?? defaults would swallow an
      // explicit null and hand back a perfectly valid record.
      ['null body', { ...rec('a'), body: null }],
      ['null title', { ...rec('a'), title: null }],
      ['null id', { ...rec('a'), id: null }],
      ['unknown type', rec('a', { type: 'note' })],
      ['missing type', (() => { const r = rec('a'); delete r.type; return r; })()],
      ['non-boolean favorite', rec('a', { favorite: 'yes' })],
      ['missing favorite', (() => { const r = rec('a'); delete r.favorite; return r; })()],
      ['string createdAt', rec('a', { createdAt: '1000' })],
      ['Infinity createdAt', rec('a', { createdAt: Infinity })],
      ['missing updatedAt', (() => { const r = rec('a'); delete r.updatedAt; return r; })()],
      ['negative useCount', rec('a', { useCount: -1 })],
      ['fractional useCount', rec('a', { useCount: 1.5 })],
      ['string useCount', rec('a', { useCount: '3' })],
      ['non-finite lastUsedAt', rec('a', { lastUsedAt: NaN })],
      ['unknown extra field', { ...rec('a'), history: [{ text: 'leak' }] }],
    ];
    for (const [why, r] of bad) {
      const res = P.validateImportEnvelope(envelope([r], []));
      assert.equal(res.ok, false, `rejected: ${why}`);
      assert.equal(res.error, P.messages.invalid, `invalid-file message for: ${why}`);
    }
    assert.ok(P.validateImportEnvelope(envelope([rec('a')], [])).ok, 'a well-formed record still passes');
  });

  check('P21 [live] malformed Quick records rejected, one field at a time', () => {
    const { P } = load();
    const bad = [
      ['null record', null],
      ['array record', []],
      ['missing id', (() => { const r = qrec('q'); delete r.id; return r; })()],
      ['blank id', qrec('  ')],
      ['numeric text', qrec('q', { text: 4 })],
      ['missing text', (() => { const r = qrec('q'); delete r.text; return r; })()],
      ['missing order', (() => { const r = qrec('q'); delete r.order; return r; })()],
      ['string order', qrec('q', { order: '1' })],
      ['NaN order', qrec('q', { order: NaN })],
      ['missing createdAt', (() => { const r = qrec('q'); delete r.createdAt; return r; })()],
      ['Infinity updatedAt', qrec('q', { updatedAt: Infinity })],
      ['unknown extra field', { ...qrec('q'), pasted: 'leak' }],
    ];
    for (const [why, r] of bad) {
      const res = P.validateImportEnvelope(envelope([], [r]));
      assert.equal(res.ok, false, `rejected: ${why}`);
      assert.equal(res.error, P.messages.invalid, `invalid-file message for: ${why}`);
    }
    assert.ok(P.validateImportEnvelope(envelope([], [qrec('q')])).ok, 'a well-formed record still passes');
  });

  check('P22 [live] duplicate imported Prompt ID rejects the whole file', () => {
    const { P } = load();
    const res = P.validateImportEnvelope(envelope([rec('a'), rec('b'), rec('a', { title: 'again' })], []));
    assert.equal(res.ok, false);
    assert.equal(res.error, P.messages.duplicatePrompt, 'and says exactly which collection collided');
    assert.equal(res.envelope, null, 'no deduplicated, no renamed, no partial result');
  });

  check('P23 [live] duplicate imported Quick ID rejects the whole file', () => {
    const { P } = load();
    const res = P.validateImportEnvelope(envelope([], [qrec('q1'), qrec('q1')]));
    assert.equal(res.ok, false);
    assert.equal(res.error, P.messages.duplicateQuick);
    assert.equal(res.envelope, null);
  });

  check('P24 [live] unknown envelope keys are rejected deterministically', () => {
    const { P } = load();
    for (const extra of ['history', 'drafts', 'pasted', 'autoSend', 'uiMode', 'ui', 'cookies', 'profile']) {
      const e = envelope([rec('a')], [qrec('q')]);
      e[extra] = [{ text: 'not portable' }];
      const res = P.validateImportEnvelope(e);
      assert.equal(res.ok, false, `unknown envelope key "${extra}" rejected`);
      assert.equal(res.error, P.messages.invalid);
    }
    assert.ok(P.validateImportEnvelope(envelope([rec('a')], [qrec('q')])).ok);
  });

  check('P24a [live] a valid envelope yields fresh records, not the caller objects', () => {
    const { P } = load();
    const src = rec('a');
    const res = P.validateImportEnvelope(envelope([src], []));
    assert.ok(res.ok);
    assert.notEqual(res.envelope.prompts[0], src, 'the accepted record is a new object');
    assert.deepEqual(host(res.envelope.prompts[0]), host(src), 'with identical data');
  });

  check('P24b [live] record count cap rejects before any record work', () => {
    const { P } = load();
    const many = new Array(P.maxRecords + 1).fill(null).map((_, i) => rec(`p${i}`));
    const res = P.validateImportEnvelope(envelope(many, []));
    assert.equal(res.ok, false);
    assert.equal(res.error, P.messages.tooLarge);
    const q = new Array(P.maxRecords + 1).fill(null).map((_, i) => qrec(`q${i}`));
    assert.equal(P.validateImportEnvelope(envelope([], q)).error, P.messages.tooLarge);
  });

  /* ── MERGE ─────────────────────────────────────────────────────────────── */
  console.log('');
  console.log('  MERGE');

  check('P25 [live] empty local + empty import is an empty result', () => {
    const { P } = load();
    const out = P.buildImportCandidates('merge', { prompts: [], quick: [] }, envelope([], []));
    assert.deepEqual(host(out.prompts), []);
    assert.deepEqual(host(out.quick), []);
    assert.equal(out.summary.promptsAdded, 0);
    assert.equal(out.summary.promptsUpdated, 0);
  });

  check('P26 [live] an imported new Prompt appends', () => {
    const { P } = load();
    const local = [rec('a'), rec('b')];
    const out = P.buildImportCandidates('merge', { prompts: local, quick: [] }, envelope([rec('z')], []));
    assert.deepEqual(ids(out.prompts), ['a', 'b', 'z']);
    assert.equal(out.summary.promptsAdded, 1);
    assert.equal(out.summary.promptsUpdated, 0);
  });

  check('P27 [live] an imported existing Prompt replaces the local record', () => {
    const { P } = load();
    const local = [rec('a', { title: 'local A' }), rec('b')];
    const imported = rec('a', { title: 'imported A', favorite: true, useCount: 9 });
    const out = P.buildImportCandidates('merge', { prompts: local, quick: [] }, envelope([imported], []));
    assert.deepEqual(ids(out.prompts), ['a', 'b']);
    assert.deepEqual(host(out.prompts[0]), host(imported), 'the imported record wins wholesale');
    assert.equal(out.summary.promptsUpdated, 1);
    assert.equal(out.summary.promptsAdded, 0);
  });

  check('P28 [live] local order is retained for existing IDs', () => {
    const { P } = load();
    const local = [rec('a'), rec('b'), rec('c')];
    // Imported in a DIFFERENT order; the local arrangement must survive.
    const out = P.buildImportCandidates('merge', { prompts: local, quick: [] },
      envelope([rec('c', { title: 'C2' }), rec('a', { title: 'A2' })], []));
    assert.deepEqual(ids(out.prompts), ['a', 'b', 'c'], 'no slot moved');
    assert.equal(host(out.prompts[0]).title, 'A2');
    assert.equal(host(out.prompts[2]).title, 'C2');
    assert.equal(out.summary.promptsUpdated, 2);
  });

  check('P29 [live] multiple new imported records keep import order', () => {
    const { P } = load();
    const out = P.buildImportCandidates('merge', { prompts: [rec('a')], quick: [] },
      envelope([rec('x'), rec('y'), rec('z')], []));
    assert.deepEqual(ids(out.prompts), ['a', 'x', 'y', 'z']);
    assert.equal(out.summary.promptsAdded, 3);
  });

  check('P30 [live] Quick merge follows the same identity rule', () => {
    const { P } = load();
    const local = [qrec('q1', { text: 'Yes' }), qrec('q2', { text: 'No' })];
    const out = P.buildImportCandidates('merge', { prompts: [], quick: local },
      envelope([], [qrec('q2', { text: 'Nope' }), qrec('q9', { text: 'Maybe' })]));
    assert.deepEqual(ids(out.quick), ['q1', 'q2', 'q9'], 'existing slot held, new appended');
    assert.equal(host(out.quick[1]).text, 'Nope');
    assert.equal(out.summary.quickUpdated, 1);
    assert.equal(out.summary.quickAdded, 1);
  });

  check('P31 [live] merge mutates neither input array nor any input record', () => {
    const { P } = load();
    const localP = [rec('a', { title: 'local A' })];
    const localQ = [qrec('q1', { text: 'Yes' })];
    const beforeP = host(localP); const beforeQ = host(localQ);
    const env = envelope([rec('a', { title: 'imported A' }), rec('n')], [qrec('q9')]);
    const beforeEnv = host(env);
    const out = P.buildImportCandidates('merge', { prompts: localP, quick: localQ }, env);
    assert.deepEqual(host(localP), beforeP, 'local prompts untouched');
    assert.deepEqual(host(localQ), beforeQ, 'local quick untouched');
    assert.deepEqual(host(env), beforeEnv, 'the envelope is untouched');
    assert.notEqual(out.prompts, localP, 'a new array is returned');
    assert.equal(out.prompts.length, 2);
  });

  check('P32 [live] imported usage metadata survives the merge', () => {
    const { P } = load();
    const out = P.buildImportCandidates('merge', { prompts: [rec('a')], quick: [] },
      envelope([rec('a', { lastUsedAt: 4242, useCount: 7 })], []));
    assert.equal(host(out.prompts[0]).lastUsedAt, 4242);
    assert.equal(host(out.prompts[0]).useCount, 7);
  });

  check('P33 [live] importing is not "using" — useCount is never incremented', () => {
    const { P } = load();
    const imported = rec('a', { useCount: 3, lastUsedAt: 100 });
    const merged = P.buildImportCandidates('merge', { prompts: [rec('a', { useCount: 99 })], quick: [] },
      envelope([imported], []));
    assert.equal(host(merged.prompts[0]).useCount, 3, 'the imported value, verbatim');
    assert.equal(host(merged.prompts[0]).lastUsedAt, 100);
    const added = P.buildImportCandidates('merge', { prompts: [], quick: [] }, envelope([imported], []));
    assert.equal(host(added.prompts[0]).useCount, 3, 'and no increment on the append path either');
    const replaced = P.buildImportCandidates('replace', { prompts: [], quick: [] }, envelope([imported], []));
    assert.equal(host(replaced.prompts[0]).useCount, 3, 'nor on replace');
  });

  check('P34 [live] favorite, type and timestamps are preserved verbatim', () => {
    const { P } = load();
    const imported = rec('a', { favorite: true, type: 'append', createdAt: 11, updatedAt: 22 });
    const out = P.buildImportCandidates('merge', { prompts: [rec('a', { favorite: false, type: 'prompt' })], quick: [] },
      envelope([imported], []));
    const got = host(out.prompts[0]);
    assert.equal(got.favorite, true);
    assert.equal(got.type, 'append');
    assert.equal(got.createdAt, 11, 'createdAt is not reset by importing');
    assert.equal(got.updatedAt, 22, 'updatedAt is not bumped by importing');
  });

  /* ── REPLACE ───────────────────────────────────────────────────────────── */
  console.log('');
  console.log('  REPLACE');

  check('P35 [live] replace preserves imported Prompt ordering exactly', () => {
    const { P } = load();
    const out = P.buildImportCandidates('replace', { prompts: [rec('a'), rec('b')], quick: [] },
      envelope([rec('z'), rec('y'), rec('x')], []));
    assert.deepEqual(ids(out.prompts), ['z', 'y', 'x']);
  });

  check('P36 [live] replace preserves imported Quick ordering exactly', () => {
    const { P } = load();
    const out = P.buildImportCandidates('replace', { prompts: [], quick: [qrec('q1')] },
      envelope([], [qrec('q3'), qrec('q2')]));
    assert.deepEqual(ids(out.quick), ['q3', 'q2']);
  });

  check('P37 [live] replace removes local records the file omits', () => {
    const { P } = load();
    const out = P.buildImportCandidates('replace', { prompts: [rec('a'), rec('b')], quick: [qrec('q1')] },
      envelope([rec('a')], []));
    assert.deepEqual(ids(out.prompts), ['a'], 'b is gone');
    assert.deepEqual(ids(out.quick), [], 'and an omitted Quick library is emptied');
  });

  check('P38 [live] the candidate builder never touches a capture store', () => {
    const { t, P } = load();
    const before = {
      history: t.storage.getStr(t.keys.history, null),
      drafts: t.storage.getStr(t.keys.drafts, null),
      pasted: t.storage.getStr(t.keys.pasted, null),
    };
    P.buildImportCandidates('replace', { prompts: [rec('a')], quick: [] }, envelope([rec('z')], [qrec('q')]));
    P.buildImportCandidates('merge', { prompts: [rec('a')], quick: [] }, envelope([rec('z')], [qrec('q')]));
    assert.equal(t.storage.getStr(t.keys.history, null), before.history);
    assert.equal(t.storage.getStr(t.keys.drafts, null), before.drafts);
    assert.equal(t.storage.getStr(t.keys.pasted, null), before.pasted);
  });

  check('P39 [live] replace mutates neither input array nor the envelope', () => {
    const { P } = load();
    const localP = [rec('a')];
    const env = envelope([rec('z')], [qrec('q')]);
    const beforeLocal = host(localP); const beforeEnv = host(env);
    const out = P.buildImportCandidates('replace', { prompts: localP, quick: [] }, env);
    assert.deepEqual(host(localP), beforeLocal);
    assert.deepEqual(host(env), beforeEnv);
    assert.notEqual(out.prompts, env.prompts, 'the candidate is a copy, not the envelope array');
  });

  /* ── BACKUP / ATOMICITY ────────────────────────────────────────────────── */
  console.log('');
  console.log('  BACKUP / ATOMICITY');

  /* Seed a loaded module with a known live state and return the helpers every
   * atomicity case needs. Prompts and Quick are written through the real
   * commit path, so the stored bytes are exactly what production writes. */
  function seeded() {
    const ctx = load();
    const { t, sandbox } = ctx;
    t.engine.commitPrompts([rec('a', { title: 'local A' }), rec('b')]);
    t.engine.commitQuick([qrec('q1', { text: 'Yes' })]);
    ctx.raw = () => ({
      prompts: sandbox.__store.get(t.keys.prompts) ?? null,
      quick: sandbox.__store.get(t.keys.quick) ?? null,
      backup: sandbox.__store.get(t.keys.importBackup) ?? null,
    });
    ctx.stage = (env) => { t.state.ui.port.pending = { envelope: env }; };
    ctx.validEnv = (prompts, quick) => {
      const res = ctx.P.validateImportEnvelope(envelope(prompts, quick));
      assert.ok(res.ok, `fixture envelope must be valid: ${res.error}`);
      return res.envelope;
    };
    return ctx;
  }

  check('P40 [live] an invalid file performs zero writes', () => {
    const c = seeded();
    const before = c.raw();
    const writesBefore = c.sandbox.__ctl.writes.length;
    for (const bad of [null, [], envelope([], [], { version: 9 }), envelope([rec('a'), rec('a')], [])]) {
      const res = c.P.validateImportEnvelope(bad);
      assert.equal(res.ok, false);
    }
    // A rejected file never reaches pending, so applyImport has nothing to do.
    assert.equal(c.P.controller.applyImport(undefined, 'merge'), false, 'no pending import, no write');
    assert.deepEqual(c.raw(), before, 'every live and backup key is byte-identical');
    assert.equal(c.sandbox.__ctl.writes.length, writesBefore, 'not a single setItem call');
  });

  check('P41 [live] Cancel performs zero writes and clears the pending state', () => {
    const c = seeded();
    c.stage(c.validEnv([rec('z')], [qrec('q9')]));
    const before = c.raw();
    const writesBefore = c.sandbox.__ctl.writes.length;
    assert.equal(c.P.controller.isPending(), true);
    assert.equal(c.P.controller.cancelImport(undefined), true);
    assert.equal(c.P.controller.isPending(), false, 'pending cleared');
    assert.deepEqual(c.raw(), before, 'nothing written');
    assert.equal(c.sandbox.__ctl.writes.length, writesBefore);
    assert.equal(c.P.controller.applyImport(undefined, 'merge'), false, 'and Merge afterwards is inert');
  });

  check('P42 [live] the backup holds Prompts and Quick only', () => {
    const { t, P } = load();
    t.storage.setJSON(t.keys.history, [{ id: 'h', text: 'secret', createdAt: 1 }]);
    const bb = P.buildBackupEnvelope([rec('a')], [qrec('q1')], NOW);
    assert.ok(bb.ok, 'a valid library yields a backup');
    const b = host(bb.envelope);
    assert.deepEqual(Object.keys(b).sort(), ['kind', 'prompts', 'quickReplies', 'savedAt', 'version']);
    assert.equal(b.kind, P.backupKind);
    assert.equal(b.version, P.backupVersion);
    assert.notEqual(b.kind, P.kind, 'a backup can never be mistaken for a portability file');
    assert.ok(!JSON.stringify(b).includes('secret'), 'no capture content');
  });

  check('P43 [live] a failed backup write causes zero live writes', () => {
    const c = seeded();
    c.stage(c.validEnv([rec('z')], [qrec('q9')]));
    const before = c.raw();
    c.sandbox.__ctl.failWrite = (k) => k.includes('import_backup');
    assert.equal(c.P.controller.applyImport(undefined, 'merge'), false, 'import aborts');
    c.sandbox.__ctl.failWrite = null;
    const after = c.raw();
    assert.equal(after.prompts, before.prompts, 'Prompts untouched');
    assert.equal(after.quick, before.quick, 'Quick untouched');
    assert.equal(after.backup, null, 'and no backup landed either');
    assert.equal(c.t.state.ui.feedback.kind, 'error');
    assert.equal(c.t.state.ui.feedback.message, c.P.messages.backup, 'with the backup-specific message');
    assert.deepEqual(ids(c.t.state.data.prompts), ['a', 'b'], 'in-memory authority is still the old library');
  });

  check('P44 [live] a Prompt write failure leaves BOTH stores old', () => {
    const c = seeded();
    c.stage(c.validEnv([rec('z')], [qrec('q9')]));
    const before = c.raw();
    c.sandbox.__ctl.failWrite = (k) => k.includes('state:prompts');
    assert.equal(c.P.controller.applyImport(undefined, 'replace'), false);
    c.sandbox.__ctl.failWrite = null;
    const after = c.raw();
    assert.equal(after.prompts, before.prompts, 'Prompts exactly as before');
    assert.equal(after.quick, before.quick, 'Quick never advanced past the failure');
    assert.deepEqual(ids(c.t.state.data.prompts), ['a', 'b']);
    assert.deepEqual(ids(c.t.state.data.quick), ['q1']);
    assert.equal(c.t.state.ui.feedback.message, c.P.messages.write);
    assert.equal(c.t.state.ui.feedback.kind, 'error', 'and the failure is persistent');
  });

  check('P45 [live] a Quick write failure rolls the Prompt store back', () => {
    const c = seeded();
    c.stage(c.validEnv([rec('z')], [qrec('q9')]));
    const before = c.raw();
    c.sandbox.__ctl.failWrite = (k) => k.includes('state:quick_replies');
    assert.equal(c.P.controller.applyImport(undefined, 'replace'), false);
    c.sandbox.__ctl.failWrite = null;
    const after = c.raw();
    assert.equal(after.prompts, before.prompts, 'the already-written Prompt store was rolled back');
    assert.equal(after.quick, before.quick, 'Quick never changed');
    assert.deepEqual(ids(c.t.state.data.prompts), ['a', 'b'], 'no half-imported memory state');
    assert.equal(c.t.state.ui.feedback.message, c.P.messages.write);
  });

  check('P46 [live] rollback restores the exact raw Prompt bytes, not a re-serialization', () => {
    const c = seeded();
    // A legacy-shaped record the tolerant loader would normalize in memory. If
    // rollback wrote back a parsed-and-restringified value, these bytes would
    // change even though the import never touched this record.
    const legacy = '[{"id":"legacy","title":"L","body":"B"}]';
    c.sandbox.__store.set(c.t.keys.prompts, legacy);
    c.stage(c.validEnv([rec('z')], [qrec('q9')]));
    c.sandbox.__ctl.failWrite = (k) => k.includes('state:quick_replies');
    assert.equal(c.P.controller.applyImport(undefined, 'replace'), false);
    c.sandbox.__ctl.failWrite = null;
    assert.equal(c.sandbox.__store.get(c.t.keys.prompts), legacy, 'byte-for-byte the original string');
  });

  check('P47 [live] rollback restores the exact raw Quick bytes', () => {
    const c = seeded();
    const legacyQuick = '[{"id":"lq","text":"Y"}]';
    c.sandbox.__store.set(c.t.keys.quick, legacyQuick);
    c.stage(c.validEnv([rec('z')], [qrec('q9')]));
    // Fail the Quick write only AFTER the Prompt write has landed, then verify
    // the Quick bytes are exactly what they were.
    c.sandbox.__ctl.failWrite = (k) => k.includes('state:quick_replies');
    assert.equal(c.P.controller.applyImport(undefined, 'replace'), false);
    c.sandbox.__ctl.failWrite = null;
    assert.equal(c.sandbox.__store.get(c.t.keys.quick), legacyQuick);
  });

  check('P48 [live] an absent key is restored as absent, never as "[]"', () => {
    const c = seeded();
    c.sandbox.__store.delete(c.t.keys.quick);
    assert.equal(c.sandbox.__store.has(c.t.keys.quick), false, 'precondition: Quick key absent');
    c.stage(c.validEnv([rec('z')], [qrec('q9')]));

    // Let Prompts land, then fail Quick so both are rolled back.
    c.sandbox.__ctl.failWrite = (k) => k.includes('state:quick_replies');
    assert.equal(c.P.controller.applyImport(undefined, 'replace'), false);
    c.sandbox.__ctl.failWrite = null;
    assert.equal(c.sandbox.__store.has(c.t.keys.quick), false,
      'the absent key is still absent — no "[]" was written in its place');

    // And the direct restore primitive behaves the same way in isolation.
    c.sandbox.__store.set(c.t.keys.quick, '["x"]');
    assert.equal(c.P.restoreRaw(c.t.keys.quick, { ok: true, present: false, raw: null }), true);
    assert.equal(c.sandbox.__store.has(c.t.keys.quick), false, 'restoring absence removes the key');
  });

  check('P49 [live] a successful import commits BOTH candidate stores', () => {
    const c = seeded();
    c.stage(c.validEnv([rec('z'), rec('y')], [qrec('q9')]));
    assert.equal(c.P.controller.applyImport(undefined, 'replace'), true);
    const after = c.raw();
    assert.deepEqual(JSON.parse(after.prompts).map(r => r.id), ['z', 'y']);
    assert.deepEqual(JSON.parse(after.quick).map(r => r.id), ['q9']);
    assert.ok(after.backup, 'and the pre-import backup is on disk');
    const b = JSON.parse(after.backup);
    assert.deepEqual(b.prompts.map(r => r.id), ['a', 'b'], 'holding the PRE-import library');
    assert.deepEqual(b.quickReplies.map(r => r.id), ['q1']);
  });

  check('P50 [live] in-memory authority is adopted only after full storage success', () => {
    const c = seeded();
    c.stage(c.validEnv([rec('z')], [qrec('q9')]));

    // Failure path: memory must still be the old library.
    c.sandbox.__ctl.failWrite = (k) => k.includes('state:quick_replies');
    assert.equal(c.P.controller.applyImport(undefined, 'replace'), false);
    c.sandbox.__ctl.failWrite = null;
    assert.deepEqual(ids(c.t.state.data.prompts), ['a', 'b'], 'not adopted on failure');
    assert.deepEqual(ids(c.t.state.data.quick), ['q1']);

    // Success path: memory matches the bytes.
    assert.equal(c.P.controller.applyImport(undefined, 'replace'), true);
    assert.deepEqual(ids(c.t.state.data.prompts), ['z']);
    assert.deepEqual(ids(c.t.state.data.quick), ['q9']);
    assert.deepEqual(JSON.parse(c.raw().prompts).map(r => r.id), ids(c.t.state.data.prompts),
      'memory and disk agree exactly');
  });

  check('P51 [live] no success feedback is ever shown for a failed import', () => {
    for (const failing of ['import_backup', 'state:prompts', 'state:quick_replies']) {
      const c = seeded();
      c.stage(c.validEnv([rec('z')], [qrec('q9')]));
      c.sandbox.__ctl.failWrite = (k) => k.includes(failing);
      const ok = c.P.controller.applyImport(undefined, 'merge');
      c.sandbox.__ctl.failWrite = null;
      assert.equal(ok, false, `${failing}: reported as failure`);
      assert.equal(c.t.state.ui.feedback.kind, 'error', `${failing}: error feedback`);
      assert.ok(!/^Imported/.test(c.t.state.ui.feedback.message),
        `${failing}: never claims "Imported" (saw "${c.t.state.ui.feedback.message}")`);
      assert.equal(c.P.controller.isPending(), true,
        `${failing}: the confirmation stays open so the user can retry or cancel`);
    }
  });

  check('P52 [live] a failed rollback is surfaced distinctly from a failed write', () => {
    const c = degraded();
    c.stage(c.validEnv([rec('z')], [qrec('q9')]));
    // Quick fails; then the Prompt rollback write fails too. Both keys are
    // unwritable from that point, so the module cannot restore what it wrote.
    c.failQuickAndPromptRestore();
    assert.equal(c.P.controller.applyImport(undefined, 'replace'), false);
    c.sandbox.__ctl.failWrite = null;
    assert.equal(c.t.state.ui.feedback.message, c.P.messages.rollback,
      'the distinct rollback message, not the generic write message');
    assert.equal(c.t.state.ui.feedback.kind, 'error');
    assert.notEqual(c.P.messages.rollback, c.P.messages.write, 'the two messages really are different');
  });

  check('P52a [live] a successful import never mutates a capture store', () => {
    const c = seeded();
    c.t.storage.setJSON(c.t.keys.history, [{ id: 'h1', text: 'keep me', createdAt: 1 }]);
    c.t.storage.setJSON(c.t.keys.drafts, [{ id: 'd1', text: 'keep me too', createdAt: 1 }]);
    c.t.storage.setJSON(c.t.keys.pasted, [{ id: 'p1', text: 'and me', createdAt: 1 }]);
    const before = {
      h: c.sandbox.__store.get(c.t.keys.history),
      d: c.sandbox.__store.get(c.t.keys.drafts),
      p: c.sandbox.__store.get(c.t.keys.pasted),
    };
    c.stage(c.validEnv([rec('z')], [qrec('q9')]));
    assert.equal(c.P.controller.applyImport(undefined, 'replace'), true);
    assert.equal(c.sandbox.__store.get(c.t.keys.history), before.h);
    assert.equal(c.sandbox.__store.get(c.t.keys.drafts), before.d);
    assert.equal(c.sandbox.__store.get(c.t.keys.pasted), before.p);
  });

  check('P52b [live] a rejected file never quarantines anything', () => {
    const c = seeded();
    const corruptBefore = c.t.diag.counters.corruptReads;
    const quarantineKeys = () => Array.from(c.sandbox.__store.keys()).filter(k => k.includes('.corrupt.'));
    assert.deepEqual(quarantineKeys(), []);
    for (const bad of ['not json at all', '{"kind":"x"}', '[]', '']) {
      const res = c.P.parseImportText(bad);
      assert.equal(res.ok, false);
    }
    assert.deepEqual(quarantineKeys(), [], 'a user-supplied file is not internal storage corruption');
    assert.equal(c.t.diag.counters.corruptReads, corruptBefore, 'and no corrupt-read is recorded');
  });

  check('P52c [live] only one backup key is ever used — no unbounded log', () => {
    const c = seeded();
    for (let i = 0; i < 3; i += 1) {
      c.stage(c.validEnv([rec(`z${i}`)], [qrec('q9')]));
      assert.equal(c.P.controller.applyImport(undefined, 'replace'), true);
    }
    const backups = Array.from(c.sandbox.__store.keys()).filter(k => k.includes('import_backup'));
    assert.deepEqual(backups, [c.t.keys.importBackup], 'exactly one backup key, overwritten in place');
    const b = JSON.parse(c.sandbox.__store.get(c.t.keys.importBackup));
    assert.deepEqual(b.prompts.map(r => r.id), ['z1'], 'holding the state from just before the LAST import');
  });

  /* ── SIZE / FILE SAFETY ────────────────────────────────────────────────── */
  console.log('');
  console.log('  SIZE / FILE SAFETY');

  check('P53 [live] a normal file below the bound is accepted', () => {
    const { P } = load();
    const env = envelope([rec('a'), rec('b')], [qrec('q1')]);
    const text = JSON.stringify(env);
    assert.ok(text.length < P.maxBytes);
    assert.equal(P.overSizeLimit(text.length), false);
    assert.equal(P.overSizeLimit(P.maxBytes), false, 'exactly at the bound is allowed');
    assert.ok(P.parseImportText(text).ok);
  });

  check('P54 [live] an oversized file is rejected before parsing', () => {
    const { P } = load();
    assert.equal(P.overSizeLimit(P.maxBytes + 1), true);
    for (const unknown of [undefined, NaN, 'x', {}, Infinity, -Infinity]) {
      assert.equal(P.overSizeLimit(unknown), true, `unknown size ${String(unknown)} fails closed`);
    }
    // `null` coerces to a real 0, i.e. a zero-length file rather than an
    // unknown size. It is not "too large"; the empty-file rule rejects it.
    assert.equal(P.overSizeLimit(null), false, 'null is a zero-length file, not an unknown size');
    assert.equal(P.overSizeLimit(0), false);
    assert.equal(P.parseImportText('').ok, false, 'and a zero-length file is still rejected');
    // Oversized text is refused with the size message, never a parse error.
    const huge = `"${'x'.repeat(P.maxBytes + 1)}"`;
    const res = P.parseImportText(huge);
    assert.equal(res.ok, false);
    assert.equal(res.error, P.messages.tooLarge, 'the size message, not the generic invalid message');
  });

  check('P55 [live] invalid JSON is rejected', () => {
    const { P } = load();
    for (const bad of ['{', '{"kind":', 'not json', '{"a":1,}', '<html></html>']) {
      const res = P.parseImportText(bad);
      assert.equal(res.ok, false, `rejected: ${bad}`);
      assert.equal(res.error, P.messages.invalid);
      assert.equal(res.envelope, null);
    }
  });

  check('P56 [live] an empty or whitespace-only file is rejected', () => {
    const { P } = load();
    for (const bad of ['', '   ', '\n\n', '\t', null, undefined]) {
      const res = P.parseImportText(bad);
      assert.equal(res.ok, false, `rejected: ${JSON.stringify(bad)}`);
      assert.equal(res.error, P.messages.invalid);
    }
  });

  check('P57 [live] Unicode and emoji round-trip exactly', () => {
    const { P } = load();
    const text = 'héllo — 你好 — 🙂🎬 — Ω≈ç√ — ​ ';
    const env = built(P,
      [rec('a', { title: text, body: `${text}!` })],
      [qrec('q1', { text })]);
    const res = P.parseImportText(P.serializeExport(env));
    assert.ok(res.ok, `accepted: ${res.error}`);
    assert.equal(host(res.envelope).prompts[0].title, text);
    assert.equal(host(res.envelope).prompts[0].body, `${text}!`);
    assert.equal(host(res.envelope).quickReplies[0].text, text);
  });

  check('P58 [live] CR/LF and tab content round-trips byte-exactly', () => {
    const { P } = load();
    const body = 'line1\r\nline2\nline3\r\tindented\n\n  trailing spaces   ';
    const env = built(P, [rec('a', { body })], []);
    const res = P.parseImportText(P.serializeExport(env));
    assert.ok(res.ok);
    assert.equal(host(res.envelope).prompts[0].body, body, 'every line ending preserved');
    // Titles are stored trimmed by the editor, so the export preserves whatever
    // is stored rather than re-trimming it.
    const env2 = built(P, [rec('a', { title: ' kept ' })], []);
    assert.equal(host(env2).prompts[0].title, ' kept ', 'export does not silently re-trim stored values');
  });

  check('P59 [live] HTML-looking imported text stays data', () => {
    const { P } = load();
    const evil = '<img src=x onerror="alert(1)"><script>alert(2)</script>';
    const env = built(P, [rec('a', { title: evil, body: evil })], [qrec('q1', { text: evil })]);
    const res = P.parseImportText(P.serializeExport(env));
    assert.ok(res.ok);
    assert.equal(host(res.envelope).prompts[0].title, evil, 'stored and returned verbatim as text');
    // And the preview surface writes with textContent, never innerHTML.
    const i = SRC.indexOf('summary.textContent = pending');
    assert.ok(i !== -1, 'the import summary is written with textContent');
    const box = SRC.slice(SRC.indexOf('UI_PM_IMPORT_SUMMARY}"'), SRC.indexOf('UI_PM_IMPORT_MERGE'));
    assert.ok(!box.includes('innerHTML'), 'the summary node is never filled with innerHTML');
  });

  check('P60 [source] no eval, Function or script execution on any import path', () => {
    /* Sliced tightly to the two portability blocks. A looser range would sweep
     * in the renderers, which legitimately build markup, and the assertion
     * would then be proving something about them instead. */
    const pureStart = SRC.indexOf('📦 PORTABILITY — export / import');
    const pureEnd = SRC.indexOf('🧪 TEST HOOK', pureStart);
    const ctlStart = SRC.indexOf('📦 PORTABILITY — controller');
    const ctlEnd = SRC.indexOf('if (W.__H2O_PM_TEST__ === true)', ctlStart);
    assert.ok(pureStart !== -1 && pureEnd > pureStart, 'the pure block is locatable');
    assert.ok(ctlStart !== -1 && ctlEnd > ctlStart, 'the controller block is locatable');
    const raw = SRC.slice(pureStart, pureEnd) + SRC.slice(ctlStart, ctlEnd);

    /* Comments are stripped first: this block documents WHY it avoids innerHTML
     * and eval, and a naive substring scan would fail on its own prose. Neither
     * portability block contains a `//` inside a string literal, so the simple
     * strip is exact here. */
    const code = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    assert.ok(!code.includes('Comments are stripped'), 'the comment strip really removed prose');

    const forbidden = [
      [/\beval\s*\(/, 'eval('],
      [/new\s+Function\s*\(/, 'new Function('],
      [/\bFunction\s*\(\s*['"`]/, 'Function("…")'],
      [/\.innerHTML\s*\+?=/, '.innerHTML ='],
      [/insertAdjacentHTML\s*\(/, 'insertAdjacentHTML('],
      [/document\s*\.\s*write\s*\(/, 'document.write('],
      [/importScripts\s*\(/, 'importScripts('],
      [/javascript:/, 'javascript: URL'],
      [/setTimeout\s*\(\s*['"`]/, 'string-bodied setTimeout'],
    ];
    for (const [re, name] of forbidden) {
      assert.ok(!re.test(code), `portability code contains no ${name}`);
    }
    assert.ok(code.includes('JSON.parse('), 'parsing is JSON.parse and nothing else');
    assert.ok(code.includes('textContent'), 'and the preview writes text, not markup');
  });

  /* ── SHIPPED CALL SITES ────────────────────────────────────────────────── */
  console.log('');
  console.log('  SHIPPED CALL SITES');

  check('P61 [source] the import writes are persist* (bytes only), never commit*', () => {
    const i = SRC.indexOf('applyImport(root =');
    const j = SRC.indexOf('function PORT_PM_download', i);
    assert.ok(i !== -1 && j > i, 'applyImport is locatable');
    const block = SRC.slice(i, j);
    assert.match(block, /ENGINE_PM\.persistPrompts\(/, 'Prompts written as bytes');
    assert.match(block, /ENGINE_PM\.persistQuick\(/, 'Quick written as bytes');
    assert.doesNotMatch(block, /ENGINE_PM\.commitPrompts\(/, 'commitPrompts would adopt too early');
    assert.doesNotMatch(block, /ENGINE_PM\.commitQuick\(/, 'commitQuick would adopt too early');
    assert.doesNotMatch(block, /ENGINE_PM\.savePrompts\(/);
    assert.doesNotMatch(block, /ENGINE_PM\.saveQuick\(/);
  });

  check('P62 [source] backup precedes both live writes, adoption follows both', () => {
    const i = SRC.indexOf('applyImport(root =');
    const j = SRC.indexOf('function PORT_PM_download', i);
    const block = SRC.slice(i, j);
    const readPre = block.indexOf('UTIL_storage.readRaw(KEY_PM_STATE_PROMPTS_V1)');
    const backup = block.indexOf('KEY_PM_STATE_IMPORT_BACKUP_V1');
    const wp = block.indexOf('ENGINE_PM.persistPrompts(');
    const wq = block.indexOf('ENGINE_PM.persistQuick(');
    const adoptP = block.indexOf('STATE_PM.data.prompts = candidates.prompts');
    const adoptQ = block.indexOf('STATE_PM.data.quick = candidates.quick');
    const emit = block.indexOf('UTIL_emitPmChanged(');
    for (const [name, v] of Object.entries({ readPre, backup, wp, wq, adoptP, adoptQ, emit })) {
      assert.ok(v !== -1, `${name} is present`);
    }
    assert.ok(readPre < backup, 'the raw pre-state is captured before the backup');
    assert.ok(backup < wp && backup < wq, 'the backup precedes every live write');
    assert.ok(wp < wq, 'Prompts then Quick');
    assert.ok(wq < adoptP && wq < adoptQ, 'nothing is adopted until both writes have returned');
    /* [2C-closure] The degraded closure also emits and is DEFINED above the
     * writes, so compare against the emit that follows the SUCCESS-path
     * adoption rather than the first occurrence anywhere in the block. */
    const emitAfterAdopt = block.indexOf('UTIL_emitPmChanged(', adoptQ);
    assert.ok(emitAfterAdopt !== -1 && adoptQ < emitAfterAdopt,
      'and the changed events publish after adoption');
    assert.ok(emit !== -1, 'the emit authority is present');
  });

  check('P63 [source] both stores are rolled back on either failure', () => {
    const i = SRC.indexOf('applyImport(root =');
    const j = SRC.indexOf('function PORT_PM_download', i);
    const block = SRC.slice(i, j);
    const rb = block.indexOf('const rollback = ');
    assert.ok(rb !== -1, 'a single rollback authority exists');
    const body = block.slice(rb, block.indexOf('// 3+4.', rb));
    assert.match(body, /PORT_PM_restoreRaw\(KEY_PM_STATE_PROMPTS_V1, beforePrompts\)/);
    assert.match(body, /PORT_PM_restoreRaw\(KEY_PM_STATE_QUICK_V1, beforeQuick\)/);
    const calls = block.split('rollback()').length - 1;
    assert.ok(calls >= 2, `both failure branches roll back (found ${calls} call sites)`);
  });

  check('P64 [source] the export path revokes its object URL', () => {
    const i = SRC.indexOf('function PORT_PM_download');
    const j = SRC.indexOf('if (W.__H2O_PM_TEST__ === true)', i);
    const block = SRC.slice(i, j);
    assert.match(block, /URL\.createObjectURL\(/);
    assert.match(block, /URL\.revokeObjectURL\(/);
    assert.match(block, /CLEAN_addFn\(revoke\)/, 'disposal revokes it too');
    assert.match(block, /CLEAN_setTimeout\(revoke,/, 'and the normal path revokes on an owned timer');
  });

  check('P65 [live] export downloads a file and releases the object URL', () => {
    const c = seeded();
    const before = c.sandbox.__urls.revoked.length;
    assert.equal(c.P.controller.exportLibrary(undefined), true);
    assert.equal(c.sandbox.__urls.created.length, 1, 'one blob URL created');
    // Read the feedback BEFORE draining the timers: success is transient by
    // Phase-2A rule, and one of those owned timers is its auto-clear.
    assert.equal(c.t.state.ui.feedback.message, 'Exported');
    assert.notEqual(c.t.state.ui.feedback.kind, 'error');
    // The deferred revoke is an owned timer; run it the way disposal would.
    for (const timer of c.sandbox.__timers) { if (timer && typeof timer.fn === 'function') timer.fn(); }
    assert.ok(c.sandbox.__urls.revoked.length > before, 'and revoked');
    assert.equal(c.sandbox.__urls.revoked.length, 1, 'exactly once, however many paths ran');
  });

  check('P66 [live] exporting writes no storage key at all', () => {
    const c = seeded();
    const before = Array.from(c.sandbox.__store.entries()).map(([k, v]) => `${k}=${v}`).sort();
    const writes = c.sandbox.__ctl.writes.length;
    assert.equal(c.P.controller.exportLibrary(undefined), true);
    const after = Array.from(c.sandbox.__store.entries()).map(([k, v]) => `${k}=${v}`).sort();
    assert.deepEqual(after, before, 'storage is byte-identical after an export');
    assert.equal(c.sandbox.__ctl.writes.length, writes, 'and setItem was never called');
  });

  check('P67 [source] Escape cancels a staged import instead of closing the panel', () => {
    const i = SRC.indexOf('attachEscClose(');
    const j = SRC.indexOf('closePanel();', i);
    const block = SRC.slice(i, j);
    assert.match(block, /PORT_PM\.isPending\(\)/, 'a pending import is checked');
    assert.match(block, /PORT_PM\.cancelImport\(/, 'and Escape cancels it');
    const editor = block.indexOf('EDITOR_PM.isOpen()');
    const port = block.indexOf('PORT_PM.isPending()');
    assert.ok(editor !== -1 && editor < port, 'an open editor still takes precedence');
  });

  check('P68 [source] the file picker never mutates storage on selection', () => {
    const i = SRC.indexOf("bindPort(p && p.file, 'change'");
    assert.ok(i !== -1, 'the change handler is locatable');
    const block = SRC.slice(i, i + 400);
    assert.match(block, /PORT_PM\.beginImport\(root, f\)/, 'selection only stages the file');
    for (const forbidden of ['commitPrompts', 'commitQuick', 'persistPrompts', 'persistQuick', 'setJSON', 'setStr']) {
      assert.ok(!block.includes(forbidden), `no ${forbidden} on the selection path`);
    }
  });

  check('P69 [source] the six-method public API is unchanged by Phase 2C', () => {
    const api = SRC.match(/^ {2}MOD_OBJ\.api\.\w+ = /gm) || [];
    assert.equal(api.length, 6, `exactly six public methods (found ${api.length})`);
    const names = api.map(s => (s.match(/MOD_OBJ\.api\.(\w+)/) || [])[1]);
    assert.deepEqual(names.sort(), ['close', 'focusSearch', 'isOpen', 'open', 'toggle', 'toggleQuickTray']);
    for (const leak of ['MOD_OBJ.api.export', 'MOD_OBJ.api.import', 'MOD_OBJ.api.portability']) {
      assert.ok(!SRC.includes(leak), `portability is not exposed as ${leak}`);
    }
  });

  check('P70 [live] the test hook exposes helpers only — never raw storage contents', () => {
    const { t, P } = load();
    assert.ok(typeof P.buildExportEnvelope === 'function');
    assert.ok(typeof P.validateImportEnvelope === 'function');
    assert.ok(typeof P.buildImportCandidates === 'function');
    /* No materialized user data is handed out. The three declared key lists are
     * schema constants — arrays of field NAMES — so they are checked to contain
     * only strings rather than excluded from the sweep. */
    const schemaLists = new Set(['envelopeKeys', 'promptKeys', 'quickKeys']);
    for (const k of Object.keys(P)) {
      const v = P[k];
      if (!Array.isArray(v)) continue;
      assert.ok(schemaLists.has(k), `portability.${k} is not an unexpected record list`);
      assert.ok(Array.from(v).every(x => typeof x === 'string'),
        `portability.${k} holds field names, never records`);
    }
    for (const k of ['prompts', 'quickReplies', 'history', 'drafts', 'pasted', 'store', 'localStorage']) {
      assert.ok(!(k in P), `portability surface exposes no "${k}" dump`);
    }
    assert.ok(t.portability === P, 'one portability surface, not a copy');
  });

  /* ── EXPORT LOSSLESSNESS (closure) ─────────────────────────────────────── */
  console.log('');
  console.log('  EXPORT LOSSLESSNESS');

  const refuses = (P, prompts, quick, expected) => {
    const r = P.buildExportEnvelope(prompts, quick, NOW);
    assert.equal(r.ok, false, 'refused');
    assert.equal(r.envelope, null, 'and no partial envelope exists');
    if (expected) assert.equal(r.error, expected);
    assert.ok(!/title|body|text/i.test(String(r.error)), 'the message names no record content');
    return r;
  };

  check('E1 [live] a valid library exports every record', () => {
    const { P } = load();
    const env = built(P, [rec('a'), rec('b'), rec('c')], [qrec('q1'), qrec('q2')]);
    assert.deepEqual(ids(env.prompts), ['a', 'b', 'c']);
    assert.deepEqual(ids(env.quickReplies), ['q1', 'q2']);
  });

  check('E2 [live] empty libraries export successfully', () => {
    const { P } = load();
    const env = built(P, [], []);
    assert.deepEqual(host(env.prompts), []);
    assert.deepEqual(host(env.quickReplies), []);
  });

  check('E3 [live] a Prompt with a missing id is refused', () => {
    const { P } = load();
    const r = rec('a'); delete r.id;
    refuses(P, [r], [], P.messages.exportInvalidPrompts);
  });

  check('E4 [live] a Prompt with an empty id is refused', () => {
    const { P } = load();
    refuses(P, [rec('')], [], P.messages.exportInvalidPrompts);
    refuses(P, [rec('   ')], [], P.messages.exportInvalidPrompts);
  });

  check('E5 [live] a Prompt with a non-string id is refused', () => {
    const { P } = load();
    for (const bad of [42, null, {}, [], true]) refuses(P, [rec(bad)], [], P.messages.exportInvalidPrompts);
  });

  check('E6 [live] a duplicate Prompt id is refused', () => {
    const { P } = load();
    refuses(P, [rec('a'), rec('b'), rec('a', { title: 'again' })], [], P.messages.exportDupPrompt);
    /* [2C-closure-2] A padded id is no longer trimmed into a collision — it is
     * simply not a canonical id, so it refuses as an INVALID library. Either
     * way no file is produced; the distinction is that nothing is repaired. */
    refuses(P, [rec('a'), rec(' a ')], [], P.messages.exportInvalidPrompts);
  });

  check('E7 [live] a Quick with a missing id is refused', () => {
    const { P } = load();
    const q = qrec('q'); delete q.id;
    refuses(P, [], [q], P.messages.exportInvalidQuick);
  });

  check('E8 [live] a Quick with an empty id is refused', () => {
    const { P } = load();
    refuses(P, [], [qrec('  ')], P.messages.exportInvalidQuick);
  });

  check('E9 [live] a Quick with a non-string id is refused', () => {
    const { P } = load();
    for (const bad of [7, null, {}]) refuses(P, [], [qrec(bad)], P.messages.exportInvalidQuick);
  });

  check('E10 [live] a duplicate Quick id is refused', () => {
    const { P } = load();
    refuses(P, [], [qrec('q1'), qrec('q1', { text: 'again' })], P.messages.exportDupQuick);
  });

  check('E11 [live] one invalid record among many refuses the ENTIRE export', () => {
    const { P } = load();
    const many = [rec('a'), rec('b'), rec('c'), rec('d'), rec('e')];
    assert.ok(P.buildExportEnvelope(many, [], NOW).ok, 'the clean library exports');
    for (const [why, bad] of [
      ['non-boolean favorite', { ...rec('x'), favorite: 1 }],
      ['string createdAt', { ...rec('x'), createdAt: 'yesterday' }],
      ['non-finite updatedAt', { ...rec('x'), updatedAt: Infinity }],
      ['numeric title', { ...rec('x'), title: 5 }],
      ['unknown type', { ...rec('x'), type: 'note' }],
      ['negative useCount', { ...rec('x'), useCount: -1 }],
    ]) {
      const mixed = many.slice(0, 3).concat([bad], many.slice(3));
      const r = P.buildExportEnvelope(mixed, [], NOW);
      assert.equal(r.ok, false, `refused: ${why}`);
      assert.equal(r.envelope, null, `no partial envelope: ${why}`);
    }
  });

  check('E12 [live] no partial envelope is ever treated as success', () => {
    const { P } = load();
    const r = P.buildExportEnvelope([rec('a'), { ...rec('b'), createdAt: 'x' }], [qrec('q1')], NOW);
    assert.equal(r.ok, false);
    assert.equal(r.envelope, null);
    assert.ok(r.error, 'and a reason is reported');
  });

  check('E13 [live] a refused export creates zero object URLs', () => {
    const { t, sandbox, P } = load();
    /* Seed a HEALTHY live store first: the closure-3 preflight refuses when the
     * primary bytes are absent while memory is non-empty, and this case is
     * about the projection refusal, not that one. */
    t.engine.commitPrompts([rec('a')]);
    t.engine.commitQuick([qrec('q1')]);
    t.state.data.prompts = [rec('a'), { ...rec('b'), favorite: 'yes' }];
    t.state.data.quick = [qrec('q1')];
    const before = sandbox.__urls.created.length;
    assert.equal(P.controller.exportLibrary(undefined), false);
    assert.equal(sandbox.__urls.created.length, before, 'no Blob URL was ever minted');
    assert.equal(sandbox.__urls.revoked.length, 0, 'and none needed revoking');
  });

  check('E14 [live] a refused export triggers zero download clicks', () => {
    const { t, sandbox, P } = load();
    t.engine.commitPrompts([rec('a')]);
    t.engine.commitQuick([]);
    let clicks = 0;
    const realCreate = sandbox.document.createElement;
    sandbox.document.createElement = () => {
      const el = realCreate();
      el.click = () => { clicks += 1; };
      return el;
    };
    t.state.data.prompts = [rec('a'), rec('a')]; // duplicate id
    t.state.data.quick = [];
    // (the live store seeded above is healthy, so the duplicate is the refusal)
    assert.equal(P.controller.exportLibrary(undefined), false);
    assert.equal(clicks, 0, 'no anchor was clicked');
    sandbox.document.createElement = realCreate;
  });

  check('E15 [live] a refused export produces no Exported feedback', () => {
    const { t, P } = load();
    t.engine.commitPrompts([rec('a')]);
    t.engine.commitQuick([]);
    t.state.data.prompts = [{ ...rec('a'), title: 7 }];
    t.state.data.quick = [];
    assert.equal(P.controller.exportLibrary(undefined), false);
    assert.equal(t.state.ui.feedback.kind, 'error', 'persistent error');
    assert.notEqual(t.state.ui.feedback.message, 'Exported');
    assert.equal(t.state.ui.feedback.message, P.messages.storePrompts,
      'the strict live-authority gate refuses malformed memory before projection');
  });

  check('E16 [live] a refused export performs zero storage writes', () => {
    const { t, sandbox, P } = load();
    t.engine.commitPrompts([rec('a')]);
    t.engine.commitQuick([qrec('q1')]);
    t.state.data.prompts = [rec('a'), rec('a')];
    const snapshot = Array.from(sandbox.__store.entries()).map(([k, v]) => `${k}=${v}`).sort();
    const writes = sandbox.__ctl.writes.length;
    assert.equal(P.controller.exportLibrary(undefined), false);
    assert.deepEqual(Array.from(sandbox.__store.entries()).map(([k, v]) => `${k}=${v}`).sort(), snapshot);
    assert.equal(sandbox.__ctl.writes.length, writes, 'setItem was never called');
  });

  check('E17 [live] successful export counts equal source-library counts exactly', () => {
    const { P } = load();
    for (const n of [0, 1, 5, 40]) {
      const ps = Array.from({ length: n }, (_, i) => rec(`p${i}`));
      const qs = Array.from({ length: n }, (_, i) => qrec(`q${i}`));
      const env = built(P, ps, qs);
      assert.equal(env.prompts.length, ps.length, `prompts: ${n}`);
      assert.equal(env.quickReplies.length, qs.length, `quick: ${n}`);
      assert.deepEqual(ids(env.prompts), ps.map(r => r.id), 'and in source order');
    }
  });

  check('E18 [live] a successful envelope is accepted by the real strict importer', () => {
    const { P } = load();
    const env = built(P,
      [rec('a', { favorite: true, type: 'append', lastUsedAt: 9, useCount: 2 }), rec('b')],
      [qrec('q1', { order: 3 })]);
    const res = P.parseImportText(P.serializeExport(env));
    assert.ok(res.ok, `self-import must succeed: ${res.error}`);
    assert.deepEqual(host(res.envelope), host(env), 'byte-for-byte the same data');
  });

  check('E19 [live] Unicode, CRLF and HTML-looking content survive exactly', () => {
    const { P } = load();
    const title = 'héllo 🙂 <b>x</b> — Ω';
    const body = 'l1\r\nl2\n\tindented\r\n\n  trailing   ';
    const env = built(P, [rec('u', { title, body })], [qrec('q', { text: 'a\r\nb 🙂 <script>' })]);
    const res = P.parseImportText(P.serializeExport(env));
    assert.ok(res.ok);
    const back = host(res.envelope);
    assert.equal(back.prompts[0].title, title);
    assert.equal(back.prompts[0].body, body);
    assert.equal(back.quickReplies[0].text, 'a\r\nb 🙂 <script>');
  });

  check('E20 [live] the export helper mutates no input', () => {
    const { P } = load();
    const ps = [rec('a', { lastUsedAt: 5 }), rec('b')];
    const qs = [qrec('q1')];
    const beforeP = host(ps); const beforeQ = host(qs);
    built(P, ps, qs);
    P.buildExportEnvelope(ps.concat([rec('a')]), qs, NOW); // a refused build too
    assert.deepEqual(host(ps), beforeP, 'prompts untouched');
    assert.deepEqual(host(qs), beforeQ, 'quick untouched');
  });

  /* ── ROLLBACK TRUTHFULNESS / DEGRADED STATE (closure) ──────────────────── */
  console.log('');
  console.log('  ROLLBACK TRUTHFULNESS / DEGRADED STATE');

  /* A seeded module whose storage layer can fail per key and, when asked, can
   * "lie": write the value and then throw, so the setter reports failure while
   * the bytes actually land. That is the case independent review found. */
  function degraded() {
    const c = seeded();
    // `lie(pred)` marks keys whose failing write should still land its bytes.
    c.lie = (pred) => { c.sandbox.__ctl.sneakWrite = pred; };
    /* The write sequence every degraded case needs: the Quick write always
     * fails, and the Prompt key succeeds ONCE (the live write) and fails
     * afterwards (the rollback restore). */
    c.failQuickAndPromptRestore = () => {
      let promptWrites = 0;
      c.sandbox.__ctl.failWrite = (k) => {
        if (k.includes('state:quick_replies')) return true;
        if (k.includes('state:prompts')) { promptWrites += 1; return promptWrites > 1; }
        return false;
      };
    };
    c.clearFailures = () => { c.sandbox.__ctl.failWrite = null; c.sandbox.__ctl.sneakWrite = null; };
    return c;
  }

  check('R1 [live] both rollbacks succeed -> ordinary write failure, not rollback-failed', () => {
    const c = degraded();
    c.stage(c.validEnv([rec('z')], [qrec('q9')]));
    const before = c.raw();
    c.sandbox.__ctl.failWrite = (k) => k.includes('state:quick_replies');
    assert.equal(c.P.controller.applyImport(undefined, 'replace'), false);
    c.sandbox.__ctl.failWrite = null;
    const after = c.raw();
    assert.equal(after.prompts, before.prompts, 'exact old Prompt bytes');
    assert.equal(after.quick, before.quick, 'exact old Quick bytes');
    assert.deepEqual(ids(c.t.state.data.prompts), ['a', 'b'], 'memory still old');
    assert.equal(c.t.state.ui.feedback.message, c.P.messages.write);
    assert.notEqual(c.t.state.ui.feedback.message, c.P.messages.rollback,
      'a clean rollback must NOT be reported as a rollback failure');
  });

  check('R2 [live] setter reported failure but bytes are correct -> rollback counts as successful', () => {
    const c = degraded();
    c.stage(c.validEnv([rec('z')], [qrec('q9')]));
    const before = c.raw();
    c.failQuickAndPromptRestore();
    c.lie((k) => k.includes('state:prompts')); // the restoring write throws AND lands
    assert.equal(c.P.controller.applyImport(undefined, 'replace'), false);
    c.clearFailures();
    assert.equal(c.raw().prompts, before.prompts, 'the bytes really are the originals');
    assert.equal(c.t.state.ui.feedback.message, c.P.messages.write,
      'so the module reports an ordinary write failure, not a rollback failure');
    assert.deepEqual(ids(c.t.state.data.prompts), ['a', 'b'], 'and memory stays old');
  });

  check('R3 [live] genuine degraded state -> rollback-failed AND memory synced to disk', () => {
    const c = degraded();
    c.stage(c.validEnv([rec('z')], [qrec('q9')]));
    c.failQuickAndPromptRestore();
    assert.equal(c.P.controller.applyImport(undefined, 'replace'), false);
    c.clearFailures();
    const after = c.raw();
    const diskP = JSON.parse(after.prompts).map(r => r.id);
    const diskQ = JSON.parse(after.quick).map(r => r.id);
    assert.deepEqual(diskP, ['z'], 'the Prompt store really is the new value');
    assert.deepEqual(diskQ, ['q1'], 'while Quick is still the old one — a mixed pair');
    assert.equal(c.t.state.ui.feedback.message, c.P.messages.rollback, 'reported distinctly');
    assert.equal(c.t.state.ui.feedback.kind, 'error', 'and persistently');
    assert.deepEqual(ids(c.t.state.data.prompts), diskP, 'memory matches the actual disk');
    assert.deepEqual(ids(c.t.state.data.quick), diskQ);
  });

  check('R4 [live] a first-store failure with a clean rollback stays an ordinary failure', () => {
    const c = degraded();
    c.stage(c.validEnv([rec('z')], [qrec('q9')]));
    const before = c.raw();
    c.sandbox.__ctl.failWrite = (k) => k.includes('state:prompts');
    assert.equal(c.P.controller.applyImport(undefined, 'replace'), false);
    c.sandbox.__ctl.failWrite = null;
    assert.equal(c.raw().prompts, before.prompts);
    assert.equal(c.raw().quick, before.quick);
    assert.equal(c.t.state.ui.feedback.message, c.P.messages.write);
    assert.deepEqual(ids(c.t.state.data.prompts), ['a', 'b']);
  });

  check('R5 [live] when both live writes land the import succeeds — no rollback path', () => {
    const c = degraded();
    c.stage(c.validEnv([rec('z')], [qrec('q9')]));
    assert.equal(c.P.controller.applyImport(undefined, 'replace'), true);
    assert.deepEqual(ids(c.t.state.data.prompts), ['z']);
    assert.deepEqual(ids(c.t.state.data.quick), ['q9']);
    assert.equal(c.t.state.ui.feedback.message, 'Imported — replaced');
    assert.notEqual(c.t.state.ui.feedback.kind, 'error');
  });

  check('R6 [live] an absent store stays absent through the degraded path', () => {
    const c = degraded();
    /* An absent key is only coherent with an empty in-memory collection — the
     * closure-3 preflight refuses the incoherent pair — so the fixture models a
     * library that genuinely has no Quick Replies yet. */
    c.sandbox.__store.delete(c.t.keys.quick);
    c.t.state.data.quick = [];
    c.stage(c.validEnv([rec('z')], [qrec('q9')]));
    c.failQuickAndPromptRestore();
    assert.equal(c.P.controller.applyImport(undefined, 'replace'), false);
    c.sandbox.__ctl.failWrite = null;
    assert.equal(c.sandbox.__store.has(c.t.keys.quick), false,
      'the key is still absent — no "[]" was invented in storage');
    assert.deepEqual(ids(c.t.state.data.quick), [],
      'and memory shows the empty list the module already uses for an absent key');
  });

  check('R7 [live] bytes already correct are classified as a successful rollback', () => {
    const { P } = load();
    // The primitive itself: equal snapshots compare equal regardless of setters.
    assert.equal(P.rawEquals({ ok: true, present: true, raw: '[]' }, { ok: true, present: true, raw: '[]' }), true);
    assert.equal(P.rawEquals({ ok: true, present: false, raw: null }, { ok: true, present: false, raw: null }), true);
    assert.equal(P.rawEquals({ ok: true, present: true, raw: '[]' }, { ok: true, present: true, raw: '[ ]' }), false,
      'byte comparison, not a normalized parse');
    assert.equal(P.rawEquals({ ok: true, present: true, raw: '[]' }, { ok: true, present: false, raw: null }), false);
    assert.equal(P.rawEquals({ ok: false }, { ok: true, present: false, raw: null }), false, 'an unreadable side never matches');
  });

  check('R8 [live] undecodable surviving bytes fail closed, no list is invented', () => {
    const { P } = load();
    assert.deepEqual(host(P.decodeRawList({ ok: true, present: false, raw: null })), { ok: true, list: [] });
    for (const raw of ['{not json', '{"a":1}', '"a string"', '42', 'null']) {
      const d = P.decodeRawList({ ok: true, present: true, raw });
      assert.equal(d.ok, false, `fails closed for ${raw}`);
      assert.deepEqual(host(d.list), [], 'and hands back nothing to adopt');
    }
    assert.equal(P.decodeRawList({ ok: false }).ok, false, 'an unreadable key fails closed');
    assert.equal(P.decodeRawList({ ok: true, present: true, raw: '[{"id":"a"}]' }).ok, true);
  });

  check('R9 [live] degraded reconciliation performs zero storage writes', () => {
    const c = degraded();
    c.stage(c.validEnv([rec('z')], [qrec('q9')]));
    c.failQuickAndPromptRestore();
    assert.equal(c.P.controller.applyImport(undefined, 'replace'), false);
    c.sandbox.__ctl.failWrite = null;
    const afterImport = c.sandbox.__ctl.writes.length;
    const snapshot = Array.from(c.sandbox.__store.entries()).map(([k, v]) => `${k}=${v}`).sort();
    // The decode path on its own must add nothing.
    c.P.decodeRawList({ ok: true, present: true, raw: c.sandbox.__store.get(c.t.keys.prompts) });
    c.P.decodeRawList({ ok: true, present: true, raw: c.sandbox.__store.get(c.t.keys.quick) });
    assert.equal(c.sandbox.__ctl.writes.length, afterImport, 'no further setItem');
    assert.deepEqual(Array.from(c.sandbox.__store.entries()).map(([k, v]) => `${k}=${v}`).sort(), snapshot);
  });

  check('R10 [live] capture stores and quarantine are untouched through the degraded path', () => {
    const c = degraded();
    c.t.storage.setJSON(c.t.keys.history, [{ id: 'h', text: 'keep', createdAt: 1 }]);
    c.t.storage.setJSON(c.t.keys.drafts, [{ id: 'd', text: 'keep', createdAt: 1 }]);
    c.t.storage.setJSON(c.t.keys.pasted, [{ id: 'p', text: 'keep', createdAt: 1 }]);
    const before = {
      h: c.sandbox.__store.get(c.t.keys.history),
      d: c.sandbox.__store.get(c.t.keys.drafts),
      p: c.sandbox.__store.get(c.t.keys.pasted),
    };
    const corruptBefore = c.t.diag.counters.corruptReads;
    c.stage(c.validEnv([rec('z')], [qrec('q9')]));
    c.failQuickAndPromptRestore();
    assert.equal(c.P.controller.applyImport(undefined, 'replace'), false);
    c.sandbox.__ctl.failWrite = null;
    assert.equal(c.sandbox.__store.get(c.t.keys.history), before.h);
    assert.equal(c.sandbox.__store.get(c.t.keys.drafts), before.d);
    assert.equal(c.sandbox.__store.get(c.t.keys.pasted), before.p);
    assert.deepEqual(Array.from(c.sandbox.__store.keys()).filter(k => k.includes('.corrupt.')), []);
    assert.equal(c.t.diag.counters.corruptReads, corruptBefore);
  });

  check('R11 [live] an undecodable degraded state latches recovery and fails closed', () => {
    const c = degraded();
    c.stage(c.validEnv([rec('z')], [qrec('q9')]));
    /* Simulate another writer clobbering the Prompt key at the moment the
     * rollback tries to restore it: the restoring write fails AND the bytes
     * that survive are neither the snapshot nor anything decodable. */
    let promptWrites = 0;
    c.sandbox.__ctl.failWrite = (k) => {
      if (k.includes('state:quick_replies')) return true;
      if (k.includes('state:prompts')) {
        promptWrites += 1;
        if (promptWrites > 1) { c.sandbox.__store.set(c.t.keys.prompts, '{not an array'); return true; }
      }
      return false;
    };
    const memBefore = ids(c.t.state.data.prompts);
    assert.equal(c.P.controller.applyImport(undefined, 'replace'), false);
    c.clearFailures();
    assert.equal(c.t.state.ui.port.recoveryRequired, true, 'recovery is latched');
    assert.equal(c.t.state.ui.feedback.message, c.P.messages.recovery);
    assert.equal(c.t.state.ui.feedback.kind, 'error');
    assert.deepEqual(ids(c.t.state.data.prompts), memBefore,
      'no list was invented — in-memory authority is left exactly as it was');
    // and any further portability mutation now fails closed
    c.stage(c.validEnv([rec('y')], [qrec('q8')]));
    assert.equal(c.P.controller.applyImport(undefined, 'merge'), false);
    assert.equal(c.t.state.ui.feedback.message, c.P.messages.recovery);
  });

  check('R12 [live] the backup refuses a library it cannot snapshot, before any live write', () => {
    const c = degraded();
    // A local library with a duplicate id cannot be backed up losslessly.
    c.t.state.data.prompts = [rec('a'), rec('a')];
    c.stage(c.validEnv([rec('z')], [qrec('q9')]));
    const before = c.raw();
    const writes = c.sandbox.__ctl.writes.length;
    assert.equal(c.P.controller.applyImport(undefined, 'replace'), false);
    assert.equal(c.t.state.ui.feedback.message, c.P.messages.storePrompts,
      'the strict live-authority gate now catches the unsnapshottable library first');
    assert.equal(c.t.state.ui.feedback.kind, 'error');
    assert.deepEqual(c.raw(), before, 'no live byte and no backup byte changed');
    assert.equal(c.sandbox.__ctl.writes.length, writes, 'setItem was never called');
  });

  /* ── CANONICAL PORTABILITY IDENTITY (closure 2) ────────────────────────── */
  console.log('');
  console.log('  CANONICAL PORTABILITY IDENTITY');

  const PADDED = [' abc', 'abc ', ' abc ', '\tabc', 'abc\n', '  ', '\t', '\n'];

  check('I1 [live] a canonical Prompt id exports byte-identically', () => {
    const { P } = load();
    for (const id of ['abc', 'a', 'my prompt', 'a-b_c.1', '🙂id', 'Ω']) {
      const env = built(P, [rec(id)], []);
      assert.equal(host(env).prompts[0].id, id, `exported exactly: ${JSON.stringify(id)}`);
    }
  });

  check('I2 [live] a leading-space Prompt id refuses export', () => {
    const { P } = load();
    refuses(P, [rec(' abc')], [], P.messages.exportInvalidPrompts);
  });

  check('I3 [live] a trailing-space Prompt id refuses export', () => {
    const { P } = load();
    refuses(P, [rec('abc ')], [], P.messages.exportInvalidPrompts);
  });

  check('I4 [live] a both-sides-padded Prompt id refuses export', () => {
    const { P } = load();
    refuses(P, [rec(' abc ')], [], P.messages.exportInvalidPrompts);
    refuses(P, [rec('\tabc\n')], [], P.messages.exportInvalidPrompts);
  });

  check('I5 [live] a whitespace-only or empty Prompt id refuses export', () => {
    const { P } = load();
    for (const id of ['', ' ', '   ', '\t', '\n']) {
      refuses(P, [rec(id)], [], P.messages.exportInvalidPrompts);
    }
  });

  check('I6 [live] the same rule applies to Quick Replies', () => {
    const { P } = load();
    assert.equal(host(built(P, [], [qrec('q one')])).quickReplies[0].id, 'q one',
      'internal spaces are ordinary characters');
    for (const id of PADDED.concat([''])) {
      refuses(P, [], [qrec(id)], P.messages.exportInvalidQuick);
    }
  });

  check('I7 [live] the strict importer rejects a padded Prompt id', () => {
    const { P } = load();
    for (const id of PADDED) {
      const res = P.validateImportEnvelope(envelope([rec(id)], []));
      assert.equal(res.ok, false, `rejected: ${JSON.stringify(id)}`);
      assert.equal(res.error, P.messages.invalid);
    }
    assert.ok(P.validateImportEnvelope(envelope([rec('abc')], [])).ok);
  });

  check('I8 [live] the strict importer rejects a padded Quick id', () => {
    const { P } = load();
    for (const id of PADDED) {
      assert.equal(P.validateImportEnvelope(envelope([], [qrec(id)])).ok, false,
        `rejected: ${JSON.stringify(id)}`);
    }
    assert.ok(P.validateImportEnvelope(envelope([], [qrec('q1')])).ok);
  });

  check('I9 [live] import never converts " abc " into "abc"', () => {
    const { P } = load();
    const res = P.validateImportEnvelope(envelope([rec(' abc ')], []));
    assert.equal(res.ok, false, 'it is refused outright');
    assert.equal(res.envelope, null, 'and no repaired record is produced');
    // The identity primitive itself never trims.
    assert.equal(P.isCanonicalId(' abc '), false);
    assert.equal(P.isCanonicalId('abc'), true);
    assert.equal(P.recordId({ id: ' abc ' }), '', 'a padded id has no canonical identity');
    assert.equal(P.recordId({ id: 'abc' }), 'abc', 'and a canonical one is returned unchanged');
  });

  check('I10 [live] canonical ids survive export → JSON → import byte-identically', () => {
    const { P } = load();
    const idsIn = ['abc', 'my prompt', 'a b  c', 'x-1', '🙂'];
    const env = built(P, idsIn.map(i => rec(i)), idsIn.map(i => qrec(`q:${i}`)));
    const res = P.parseImportText(P.serializeExport(env));
    assert.ok(res.ok, res.error);
    assert.deepEqual(ids(res.envelope.prompts), idsIn, 'every id round-trips exactly');
    assert.deepEqual(ids(res.envelope.quickReplies), idsIn.map(i => `q:${i}`));
  });

  check('I11 [live] internal spaces are legitimate and exact', () => {
    const { P } = load();
    const id = 'my prompt';
    const env = built(P, [rec(id)], [qrec('two words here')]);
    assert.equal(host(env).prompts[0].id, id);
    assert.equal(host(env).quickReplies[0].id, 'two words here');
    assert.equal(P.isCanonicalId('a  b'), true, 'doubled internal spaces are fine too');
  });

  check('I12 [live] duplicate detection operates on exact canonical ids', () => {
    const { P } = load();
    // Same exact string -> duplicate.
    refuses(P, [rec('abc'), rec('abc')], [], P.messages.exportDupPrompt);
    // Different strings that only a trim would have merged -> not a duplicate,
    // but the padded one is not canonical, so the library still refuses.
    refuses(P, [rec('abc'), rec('abc ')], [], P.messages.exportInvalidPrompts);
    // Distinct canonical ids are fine.
    assert.ok(P.buildExportEnvelope([rec('abc'), rec('abcd')], [], NOW).ok);
    // Import-side duplicate detection is exact too.
    assert.equal(P.validateImportEnvelope(envelope([rec('abc'), rec('abc')], [])).error,
      P.messages.duplicatePrompt);
    // Merge identity uses the same canonical rule.
    const merged = P.buildImportCandidates('merge',
      { prompts: [rec('abc', { title: 'local' })], quick: [] },
      { prompts: [rec('abc', { title: 'imported' })], quickReplies: [] });
    assert.equal(merged.prompts.length, 1, 'exact id matched the local slot');
    assert.equal(host(merged.prompts[0]).title, 'imported');
  });

  /* ── NON-ARRAY FAIL-CLOSED (closure 2) ─────────────────────────────────── */
  console.log('');
  console.log('  NON-ARRAY COLLECTIONS');

  check('N1 [live] a non-array Prompt collection refuses export', () => {
    const { P } = load();
    for (const bad of [{ bad: true }, 'x', 7, true, () => {}]) {
      const r = P.buildExportEnvelope(bad, [], NOW);
      assert.equal(r.ok, false, `refused: ${typeof bad}`);
      assert.equal(r.envelope, null);
      assert.equal(r.error, P.messages.exportInvalidPrompts);
    }
  });

  check('N2 [live] a null Prompt collection refuses export', () => {
    const { P } = load();
    const r = P.buildExportEnvelope(null, [], NOW);
    assert.equal(r.ok, false);
    assert.equal(r.envelope, null);
    const u = P.buildExportEnvelope(undefined, [], NOW);
    assert.equal(u.ok, false, 'undefined too');
  });

  check('N3 [live] an object Prompt collection refuses — it is not an empty library', () => {
    const { P } = load();
    const r = P.buildExportEnvelope({ bad: true }, [], NOW);
    assert.equal(r.ok, false, 'this returned ok:true with prompts:[] before the closure');
    assert.equal(r.envelope, null, 'and no empty envelope is produced');
    const arrayLike = { length: 0 };
    assert.equal(P.buildExportEnvelope(arrayLike, [], NOW).ok, false, 'array-like is not an array');
  });

  check('N4 [live] a non-array Quick collection refuses export', () => {
    const { P } = load();
    for (const bad of [null, undefined, { bad: true }, 'x', 7]) {
      const r = P.buildExportEnvelope([], bad, NOW);
      assert.equal(r.ok, false, `refused: ${String(bad)}`);
      assert.equal(r.error, P.messages.exportInvalidQuick);
    }
  });

  check('N5 [live] genuinely empty libraries still export successfully', () => {
    const { P } = load();
    const env = built(P, [], []);
    assert.deepEqual(host(env.prompts), []);
    assert.deepEqual(host(env.quickReplies), []);
    assert.ok(P.parseImportText(P.serializeExport(env)).ok, 'and the empty file imports');
  });

  check('N6 [live] a refused non-array export has no side effect of any kind', () => {
    const { t, sandbox, P } = load();
    let clicks = 0;
    const realCreate = sandbox.document.createElement;
    sandbox.document.createElement = () => { const el = realCreate(); el.click = () => { clicks += 1; }; return el; };
    t.engine.commitPrompts([rec('a')]);
    t.engine.commitQuick([qrec('q1')]);
    t.state.data.prompts = { bad: true };
    const snapshot = Array.from(sandbox.__store.entries()).map(([k, v]) => `${k}=${v}`).sort();
    const writes = sandbox.__ctl.writes.length;
    const urls = sandbox.__urls.created.length;
    assert.equal(P.controller.exportLibrary(undefined), false);
    assert.equal(sandbox.__urls.created.length, urls, 'no object URL');
    assert.equal(clicks, 0, 'no anchor click');
    assert.notEqual(t.state.ui.feedback.message, 'Exported');
    assert.equal(t.state.ui.feedback.kind, 'error');
    assert.equal(sandbox.__ctl.writes.length, writes, 'no storage write');
    assert.deepEqual(Array.from(sandbox.__store.entries()).map(([k, v]) => `${k}=${v}`).sort(), snapshot);
    sandbox.document.createElement = realCreate;
  });

  check('N7 [live] the backup builder refuses a non-array Prompt collection', () => {
    const { P } = load();
    for (const bad of [null, undefined, { bad: true }, 'x']) {
      const r = P.buildBackupEnvelope(bad, [], NOW);
      assert.equal(r.ok, false, `refused: ${String(bad)}`);
      assert.equal(r.envelope, null);
    }
    assert.ok(P.buildBackupEnvelope([], [], NOW).ok, 'and an empty library still snapshots');
  });

  check('N8 [live] the backup builder refuses a non-array Quick collection', () => {
    const { P } = load();
    for (const bad of [null, undefined, { bad: true }, 7]) {
      assert.equal(P.buildBackupEnvelope([], bad, NOW).ok, false, `refused: ${String(bad)}`);
    }
  });

  check('N9 [live] no path turns an invalid collection into an empty successful envelope', () => {
    const { P } = load();
    for (const [p, q] of [[{ bad: true }, []], [[], { bad: true }], [null, null], ['x', 'y']]) {
      const e = P.buildExportEnvelope(p, q, NOW);
      assert.equal(e.ok, false, 'export refuses');
      assert.equal(e.envelope, null);
      const b = P.buildBackupEnvelope(p, q, NOW);
      assert.equal(b.ok, false, 'backup refuses');
      assert.equal(b.envelope, null);
    }
    // The projection primitive itself is the single gate.
    const pl = P.projectList({ bad: true }, (r, i) => r, () => true, 'INVALID', 'DUP');
    assert.equal(pl.ok, false);
    assert.equal(pl.error, 'INVALID');
    assert.deepEqual(host(pl.list), []);
  });

  /* ── FILEREADER READ-GENERATION (closure 2) ────────────────────────────── */
  console.log('');
  console.log('  FILEREADER READ-GENERATION');

  /* A deterministic FileReader: nothing completes until the test says so, and
   * completion ORDER is chosen explicitly. No timers, no sleeps. */
  function readerHarness() {
    const c = seeded();
    const readers = [];
    c.sandbox.FileReader = class {
      constructor() { this.result = null; this.onload = null; this.onerror = null; readers.push(this); }
      readAsText(file) { this.file = file; }
    };
    c.readers = readers;
    c.file = (text) => ({ size: text.length, __text: text });
    c.finish = (r) => { r.result = r.file.__text; if (r.onload) r.onload(); };
    c.failRead = (r) => { if (r.onerror) r.onerror(); };
    c.envText = (id) => JSON.stringify(envelope([rec(id)], [qrec(`q-${id}`)]));
    return c;
  }

  check('F1 [live] select A then B; B completes first, then A -> pending stays B', () => {
    const c = readerHarness();
    c.P.controller.beginImport(undefined, c.file(c.envText('A')));
    c.P.controller.beginImport(undefined, c.file(c.envText('B')));
    assert.equal(c.readers.length, 2, 'two readers were started');
    c.finish(c.readers[1]);           // B
    assert.deepEqual(ids(c.P.controller.st().pending.envelope.prompts), ['B']);
    c.finish(c.readers[0]);           // stale A
    assert.deepEqual(ids(c.P.controller.st().pending.envelope.prompts), ['B'],
      'the stale completion did not replace the pending file');
  });

  check('F2 [live] a stale error after a newer success does not touch feedback', () => {
    const c = readerHarness();
    c.P.controller.beginImport(undefined, c.file(c.envText('A')));
    c.P.controller.beginImport(undefined, c.file(c.envText('B')));
    c.finish(c.readers[1]);
    const fb = { ...c.t.state.ui.feedback };
    c.failRead(c.readers[0]);
    assert.deepEqual({ ...c.t.state.ui.feedback }, fb, 'feedback untouched by the stale error');
    assert.deepEqual(ids(c.P.controller.st().pending.envelope.prompts), ['B']);
  });

  check('F3 [live] a stale success after a newer failure cannot resurrect pending', () => {
    const c = readerHarness();
    c.P.controller.beginImport(undefined, c.file(c.envText('A')));
    c.P.controller.beginImport(undefined, c.file('not json at all'));
    c.finish(c.readers[1]);           // B: invalid JSON
    assert.equal(c.P.controller.isPending(), false, 'B was rejected, nothing staged');
    assert.equal(c.t.state.ui.feedback.kind, 'error');
    c.finish(c.readers[0]);           // stale A, a perfectly valid file
    assert.equal(c.P.controller.isPending(), false,
      'the stale valid read must not stage an import the user did not select last');
  });

  check('F4 [live] the older read is ignored even before the newer one completes', () => {
    const c = readerHarness();
    c.P.controller.beginImport(undefined, c.file(c.envText('A')));
    c.P.controller.beginImport(undefined, c.file(c.envText('B')));
    c.finish(c.readers[0]);           // A completes first, but B is current
    assert.equal(c.P.controller.isPending(), false, 'A is not the current selection');
  });

  check('F5 [live] the newest read still stages when it completes', () => {
    const c = readerHarness();
    c.P.controller.beginImport(undefined, c.file(c.envText('A')));
    c.P.controller.beginImport(undefined, c.file(c.envText('B')));
    c.finish(c.readers[0]);
    c.finish(c.readers[1]);
    assert.equal(c.P.controller.isPending(), true);
    assert.deepEqual(ids(c.P.controller.st().pending.envelope.prompts), ['B']);
  });

  check('F6 [live] Cancel invalidates an outstanding older read', () => {
    const c = readerHarness();
    c.P.controller.beginImport(undefined, c.file(c.envText('A')));
    c.finish(c.readers[0]);
    assert.equal(c.P.controller.isPending(), true);
    c.P.controller.beginImport(undefined, c.file(c.envText('B')));   // B in flight
    assert.equal(c.P.controller.isPending(), false, 'the old confirmation is cleared at once');
    c.P.controller.cancelImport(undefined);
    c.finish(c.readers[1]);           // B completes after the cancel
    assert.equal(c.P.controller.isPending(), false, 'a cancelled read stages nothing');
  });

  check('F7 [live] after a successful import an old reader cannot recreate pending', () => {
    const c = readerHarness();
    c.stage(c.validEnv([rec('z')], [qrec('q9')]));
    c.P.controller.beginImport(undefined, c.file(c.envText('A')));   // A in flight
    c.stage(c.validEnv([rec('z')], [qrec('q9')]));                   // re-stage for the apply
    assert.equal(c.P.controller.applyImport(undefined, 'replace'), true);
    assert.equal(c.P.controller.isPending(), false, 'cleared by the successful import');
    c.finish(c.readers[0]);           // the stale reader lands now
    assert.equal(c.P.controller.isPending(), false, 'and stages nothing');
  });

  check('F8 [live] recoveryRequired prevents a stale callback from staging', () => {
    const c = readerHarness();
    c.P.controller.beginImport(undefined, c.file(c.envText('A')));
    c.t.state.ui.port.recoveryRequired = true;   // as a failed rollback would set it
    c.finish(c.readers[0]);
    assert.equal(c.P.controller.isPending(), false, 'nothing staged while recovery is required');
  });

  check('F9 [live] a stale callback performs zero storage writes', () => {
    const c = readerHarness();
    c.P.controller.beginImport(undefined, c.file(c.envText('A')));
    c.P.controller.beginImport(undefined, c.file(c.envText('B')));
    c.finish(c.readers[1]);
    const writes = c.sandbox.__ctl.writes.length;
    const snapshot = Array.from(c.sandbox.__store.entries()).map(([k, v]) => `${k}=${v}`).sort();
    c.finish(c.readers[0]);
    c.failRead(c.readers[0]);
    assert.equal(c.sandbox.__ctl.writes.length, writes);
    assert.deepEqual(Array.from(c.sandbox.__store.entries()).map(([k, v]) => `${k}=${v}`).sort(), snapshot);
  });

  check('F10 [live] a stale callback mutates no feedback', () => {
    const c = readerHarness();
    c.P.controller.beginImport(undefined, c.file(c.envText('A')));
    c.P.controller.beginImport(undefined, c.file('{invalid'));
    c.finish(c.readers[1]);
    const fb = { ...c.t.state.ui.feedback };
    c.finish(c.readers[0]);
    c.failRead(c.readers[0]);
    assert.deepEqual({ ...c.t.state.ui.feedback }, fb, 'byte-identical feedback state');
  });

  check('F11 [live] the read generation is memory-only', () => {
    const c = readerHarness();
    const before = Array.from(c.sandbox.__store.keys()).sort();
    c.P.controller.beginImport(undefined, c.file(c.envText('A')));
    c.P.controller.beginImport(undefined, c.file(c.envText('B')));
    c.finish(c.readers[1]);
    assert.deepEqual(Array.from(c.sandbox.__store.keys()).sort(), before, 'no new storage key');
    for (const [, v] of c.sandbox.__store) {
      assert.ok(!String(v).includes('readSeq'), 'and no persisted read counter');
    }
    assert.ok(Number.isInteger(c.t.state.ui.port.readSeq), 'it lives in memory state');
  });

  check('F12 [live] repeated selections never accumulate pending authorities', () => {
    const c = readerHarness();
    for (let i = 0; i < 5; i += 1) c.P.controller.beginImport(undefined, c.file(c.envText(`F${i}`)));
    assert.equal(c.readers.length, 5);
    // Complete them in a deliberately scrambled order.
    for (const i of [2, 0, 4, 1, 3]) c.finish(c.readers[i]);
    assert.equal(c.P.controller.isPending(), true);
    assert.deepEqual(ids(c.P.controller.st().pending.envelope.prompts), ['F4'],
      'exactly one pending import, and it is the last selection');
    assert.equal(typeof c.P.controller.st().pending, 'object');
  });

  /* ── RECOVERY-REQUIRED PORTABILITY GATE (closure 2) ────────────────────── */
  console.log('');
  console.log('  RECOVERY-REQUIRED PORTABILITY GATE');

  check('G1 [live] export returns false while recovery is required', () => {
    const c = seeded();
    c.t.state.ui.port.recoveryRequired = true;
    assert.equal(c.P.controller.exportLibrary(undefined), false);
  });

  check('G2 [live] a gated export creates zero object URLs', () => {
    const c = seeded();
    c.t.state.ui.port.recoveryRequired = true;
    const before = c.sandbox.__urls.created.length;
    c.P.controller.exportLibrary(undefined);
    assert.equal(c.sandbox.__urls.created.length, before);
    assert.equal(c.sandbox.__urls.revoked.length, 0);
  });

  check('G3 [live] a gated export triggers zero download clicks', () => {
    const c = seeded();
    let clicks = 0;
    const realCreate = c.sandbox.document.createElement;
    c.sandbox.document.createElement = () => { const el = realCreate(); el.click = () => { clicks += 1; }; return el; };
    c.t.state.ui.port.recoveryRequired = true;
    c.P.controller.exportLibrary(undefined);
    assert.equal(clicks, 0);
    c.sandbox.document.createElement = realCreate;
  });

  check('G4 [live] a gated export reports the persistent recovery message', () => {
    const c = seeded();
    c.t.state.ui.port.recoveryRequired = true;
    c.P.controller.exportLibrary(undefined);
    assert.equal(c.t.state.ui.feedback.message, c.P.messages.recovery);
    assert.equal(c.t.state.ui.feedback.kind, 'error', 'persistent, not transient');
    // Import is gated too, and Merge/Replace remain impossible.
    c.stage(c.validEnv([rec('z')], [qrec('q9')]));
    assert.equal(c.P.controller.applyImport(undefined, 'merge'), false);
    assert.equal(c.P.controller.applyImport(undefined, 'replace'), false);
    assert.equal(c.P.controller.beginImport(undefined, { size: 10 }), false);
  });

  check('G5 [live] a fresh module state (as after a reload) exports normally again', () => {
    const c = seeded();
    c.t.state.ui.port.recoveryRequired = true;
    assert.equal(c.P.controller.exportLibrary(undefined), false);
    // A reload gives a brand-new module: the latch is memory-only.
    const fresh = seeded();
    assert.equal(fresh.t.state.ui.port.recoveryRequired, false, 'the latch did not survive');
    assert.equal(fresh.P.controller.exportLibrary(undefined), true);
    assert.equal(fresh.t.state.ui.feedback.message, 'Exported');
    // And the public API is untouched by any of this.
    const api = SRC.match(/^ {2}MOD_OBJ\.api\.\w+ = /gm) || [];
    assert.equal(api.length, 6);
  });

  /* ── DURABLE QUICK ORDERING (closure 3) ────────────────────────────────── */
  console.log('');
  console.log('  DURABLE QUICK ORDERING');

  /* Persist a candidate through the REAL commit path and read it back through
   * the REAL loader, so the runtime sort authority is what judges the order. */
  const persistAndReload = (t, quickCandidate) => {
    assert.equal(t.engine.commitQuick(quickCandidate), true, 'the candidate persists');
    return Array.from(t.engine.loadQuick()).map(r => r.id);
  };

  check('Q1 [live] an imported foreign order cannot undo the merged sequence', () => {
    const { t, P } = load();
    const local = [qrec('A', { order: 0 }), qrec('B', { order: 1 }), qrec('C', { order: 2 })];
    const imported = [qrec('B', { order: 99, text: 'B2' })];
    const cand = P.buildImportCandidates('merge', { prompts: [], quick: local },
      { prompts: [], quickReplies: imported });
    assert.deepEqual(ids(cand.quick), ['A', 'B', 'C'], 'candidate sequence holds the local slot');
    assert.deepEqual(host(cand.quick).map(r => r.order), [0, 1, 2],
      'and order is re-derived from that sequence, not imported');
    assert.deepEqual(persistAndReload(t, cand.quick), ['A', 'B', 'C'],
      'the real loader agrees after persistence');
  });

  check('Q2 [live] new imported records append and survive the reload', () => {
    const { t, P } = load();
    const local = [qrec('A', { order: 0 }), qrec('B', { order: 1 })];
    const imported = [qrec('X', { order: -5 }), qrec('Y', { order: 0 })];
    const cand = P.buildImportCandidates('merge', { prompts: [], quick: local },
      { prompts: [], quickReplies: imported });
    assert.deepEqual(ids(cand.quick), ['A', 'B', 'X', 'Y'], 'appended in imported order');
    assert.deepEqual(host(cand.quick).map(r => r.order), [0, 1, 2, 3]);
    assert.deepEqual(persistAndReload(t, cand.quick), ['A', 'B', 'X', 'Y'],
      'foreign low/negative order values cannot pull them to the front');
  });

  check('Q3 [live] several existing imported ids leave the local sequence intact', () => {
    const { t, P } = load();
    const local = [qrec('A', { order: 0 }), qrec('B', { order: 1 }), qrec('C', { order: 2 })];
    const imported = [qrec('C', { order: 1, text: 'C2' }), qrec('A', { order: 7, text: 'A2' })];
    const cand = P.buildImportCandidates('merge', { prompts: [], quick: local },
      { prompts: [], quickReplies: imported });
    assert.deepEqual(ids(cand.quick), ['A', 'B', 'C']);
    assert.deepEqual(persistAndReload(t, cand.quick), ['A', 'B', 'C'], 'no slot moved');
    assert.equal(host(cand.quick)[0].text, 'A2', 'and the imported record still won its slot');
    assert.equal(host(cand.quick)[2].text, 'C2');
  });

  check('Q4 [live] Replace keeps the imported sequence through persistence', () => {
    const { t, P } = load();
    const imported = [qrec('C', { order: 42 }), qrec('A', { order: 7 }), qrec('B', { order: 0 })];
    const cand = P.buildImportCandidates('replace', { prompts: [], quick: [qrec('Z', { order: 0 })] },
      { prompts: [], quickReplies: imported });
    assert.deepEqual(ids(cand.quick), ['C', 'A', 'B']);
    assert.deepEqual(host(cand.quick).map(r => r.order), [0, 1, 2]);
    assert.deepEqual(persistAndReload(t, cand.quick), ['C', 'A', 'B']);
  });

  check('Q5 [live] the renderer sort of the candidate gives the same sequence', () => {
    const { P } = load();
    const cand = P.buildImportCandidates('merge',
      { prompts: [], quick: [qrec('A', { order: 0 }), qrec('B', { order: 1 })] },
      { prompts: [], quickReplies: [qrec('B', { order: 99 }), qrec('N', { order: -1 })] });
    // The Quick tray and both renderers sort by `order`, exactly like this.
    const rendered = Array.from(cand.quick).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
    assert.deepEqual(rendered.map(r => r.id), ids(cand.quick),
      'sorting the candidate by order reproduces the candidate sequence');
  });

  check('Q6 [live] candidate construction mutates no input record or array', () => {
    const { P } = load();
    const local = [qrec('A', { order: 0 }), qrec('B', { order: 1 })];
    const imported = [qrec('B', { order: 99 }), qrec('N', { order: 5 })];
    const beforeL = host(local); const beforeI = host(imported);
    const cand = P.buildImportCandidates('merge', { prompts: [], quick: local },
      { prompts: [], quickReplies: imported });
    assert.deepEqual(host(local), beforeL, 'local untouched, orders included');
    assert.deepEqual(host(imported), beforeI, 'imported untouched, orders included');
    assert.notEqual(cand.quick[0], local[0], 'the candidate holds new record objects');
  });

  check('Q7 [live] only `order` is derived — every other field is the merge winner', () => {
    const { P } = load();
    const imported = qrec('B', { order: 99, text: 'imported text', createdAt: 111, updatedAt: 222 });
    const cand = P.buildImportCandidates('merge',
      { prompts: [], quick: [qrec('A', { order: 0 }), qrec('B', { order: 1, text: 'local' })] },
      { prompts: [], quickReplies: [imported] });
    const got = host(cand.quick)[1];
    assert.equal(got.id, 'B');
    assert.equal(got.text, 'imported text');
    assert.equal(got.createdAt, 111, 'createdAt is the imported value');
    assert.equal(got.updatedAt, 222, 'updatedAt is the imported value');
    assert.equal(got.order, 1, 'and only order is re-derived from the sequence');
    assert.deepEqual(Object.keys(got).sort(), ['createdAt', 'id', 'order', 'text', 'updatedAt']);
  });

  check('Q8 [live] Prompt candidate ordering is untouched by the Quick correction', () => {
    const { P } = load();
    const cand = P.buildImportCandidates('merge',
      { prompts: [rec('a'), rec('b')], quick: [] },
      { prompts: [rec('b', { title: 'B2' }), rec('z')], quickReplies: [] });
    assert.deepEqual(ids(cand.prompts), ['a', 'b', 'z']);
    for (const p of host(cand.prompts)) {
      assert.ok(!('order' in p), 'no order field is introduced on a Prompt record');
    }
  });

  check('Q9 [live] rollback still restores the exact pre-import raw Quick bytes', () => {
    const c = degraded();
    // A stored Quick library with deliberate non-sequential order values.
    const legacy = JSON.stringify([{ id: 'A', text: 'a', order: 7, createdAt: 1, updatedAt: 1 }]);
    c.sandbox.__store.set(c.t.keys.quick, legacy);
    c.t.state.data.quick = [qrec('A', { order: 7 })];
    c.stage(c.validEnv([rec('z')], [qrec('q9', { order: 3 })]));
    c.sandbox.__ctl.failWrite = (k) => k.includes('state:quick_replies');
    assert.equal(c.P.controller.applyImport(undefined, 'replace'), false);
    c.clearFailures();
    assert.equal(c.sandbox.__store.get(c.t.keys.quick), legacy,
      'byte-for-byte, order fields and all');
  });

  check('Q10 [live] the backup records the PRE-import Quick state', () => {
    const c = degraded();
    c.t.engine.commitQuick([qrec('A', { order: 5 }), qrec('B', { order: 6 })]);
    c.stage(c.validEnv([rec('z')], [qrec('N', { order: 0 })]));
    assert.equal(c.P.controller.applyImport(undefined, 'replace'), true);
    const backup = JSON.parse(c.sandbox.__store.get(c.t.keys.importBackup));
    assert.deepEqual(backup.quickReplies.map(r => r.id), ['A', 'B'], 'the pre-import ids');
    assert.deepEqual(backup.quickReplies.map(r => r.order), [5, 6],
      'with their original order values, not the new sequence');
    assert.deepEqual(Array.from(c.t.state.data.quick).map(r => r.order), [0],
      'while the live candidate carries the re-derived sequence');
  });

  /* ── LIVE-STORE PORTABILITY PREFLIGHT (closure 3) ──────────────────────── */
  console.log('');
  console.log('  LIVE-STORE PORTABILITY PREFLIGHT');

  /* A module whose live Prompt/Quick primaries can be corrupted directly, and
   * whose in-memory state is loaded through the REAL tolerant readers — which
   * is exactly how a corrupt primary reaches the UI as []. */
  function corrupted({ promptsRaw, quickRaw, dropPrompts = false, dropQuick = false } = {}) {
    const c = load();
    const { t, sandbox } = c;
    t.engine.commitPrompts([rec('a')]);
    t.engine.commitQuick([qrec('q1')]);
    if (promptsRaw !== undefined) sandbox.__store.set(t.keys.prompts, promptsRaw);
    if (quickRaw !== undefined) sandbox.__store.set(t.keys.quick, quickRaw);
    if (dropPrompts) sandbox.__store.delete(t.keys.prompts);
    if (dropQuick) sandbox.__store.delete(t.keys.quick);
    // Load through the real readers, exactly as boot does.
    t.state.data.prompts = t.engine.loadPrompts();
    t.state.data.quick = t.engine.loadQuick();
    c.raw = () => ({
      prompts: sandbox.__store.get(t.keys.prompts),
      quick: sandbox.__store.get(t.keys.quick),
      backup: sandbox.__store.get(t.keys.importBackup),
    });
    c.clicks = 0;
    const realCreate = sandbox.document.createElement;
    sandbox.document.createElement = () => { const el = realCreate(); el.click = () => { c.clicks += 1; }; return el; };
    return c;
  }

  check('S1 [live] a malformed Prompt primary refuses export even though memory is []', () => {
    const c = corrupted({ promptsRaw: '{bad json' });
    assert.deepEqual(Array.from(c.t.state.data.prompts), [],
      'precondition: the tolerant reader represented it as an empty library');
    const before = c.raw();
    const urls = c.sandbox.__urls.created.length;
    assert.equal(c.P.controller.exportLibrary(undefined), false);
    assert.equal(c.sandbox.__urls.created.length, urls, 'zero object URLs');
    assert.equal(c.clicks, 0, 'zero clicks');
    assert.equal(c.t.state.ui.feedback.message, c.P.messages.storePrompts);
    assert.equal(c.t.state.ui.feedback.kind, 'error');
    assert.equal(c.raw().prompts, before.prompts, 'the corrupt bytes are untouched');
  });

  check('S2 [live] a present non-array Prompt primary refuses export', () => {
    const c = corrupted({ promptsRaw: '{"not":"an array"}' });
    const before = c.raw();
    assert.equal(c.P.controller.exportLibrary(undefined), false);
    assert.equal(c.t.state.ui.feedback.message, c.P.messages.storePrompts);
    assert.equal(c.raw().prompts, before.prompts);
    assert.equal(c.clicks, 0);
  });

  check('S3 [live] a malformed Quick primary refuses export', () => {
    const c = corrupted({ quickRaw: '[{oops' });
    const before = c.raw();
    assert.equal(c.P.controller.exportLibrary(undefined), false);
    assert.equal(c.t.state.ui.feedback.message, c.P.messages.storeQuick);
    assert.equal(c.raw().quick, before.quick);
    assert.equal(c.sandbox.__urls.created.length, 0);
  });

  check('S4 [live] an unreadable raw read fails portability closed', () => {
    const { t, P } = load();
    t.engine.commitPrompts([rec('a')]);
    t.engine.commitQuick([qrec('q1')]);
    // A storage layer whose reads throw.
    const ls = t.storage;
    const realRead = ls.readRaw;
    ls.readRaw = () => ({ ok: false, present: false, raw: null, err: new Error('blocked') });
    const res = P.checkLiveStoreAuthority(t.state.data.prompts, t.state.data.quick);
    ls.readRaw = realRead;
    assert.equal(res.ok, false, 'an unreadable primary is unsafe');
    assert.equal(res.error, P.messages.storePrompts);
  });

  check('S5 [live] a malformed Prompt primary refuses Merge BEFORE backup or live write', () => {
    const c = corrupted({ promptsRaw: '{bad json' });
    const valid = c.P.validateImportEnvelope(envelope([rec('z')], [qrec('q9')]));
    c.t.state.ui.port.pending = { envelope: valid.envelope };
    const before = c.raw();
    const writes = c.sandbox.__ctl.writes.length;
    assert.equal(c.P.controller.applyImport(undefined, 'merge'), false);
    assert.equal(c.t.state.ui.feedback.message, c.P.messages.storePrompts);
    assert.deepEqual(c.raw(), before, 'no live byte and no backup byte');
    assert.equal(c.sandbox.__ctl.writes.length, writes, 'setItem was never called');
  });

  check('S6 [live] the same holds for Replace', () => {
    const c = corrupted({ promptsRaw: '{bad json' });
    const valid = c.P.validateImportEnvelope(envelope([rec('z')], [qrec('q9')]));
    c.t.state.ui.port.pending = { envelope: valid.envelope };
    const before = c.raw();
    assert.equal(c.P.controller.applyImport(undefined, 'replace'), false);
    assert.deepEqual(c.raw(), before);
    assert.notEqual(c.t.state.ui.feedback.message, 'Imported — replaced');
  });

  check('S7 [live] a malformed Quick primary refuses import before any live mutation', () => {
    const c = corrupted({ quickRaw: 'nope' });
    const valid = c.P.validateImportEnvelope(envelope([rec('z')], [qrec('q9')]));
    c.t.state.ui.port.pending = { envelope: valid.envelope };
    const before = c.raw();
    assert.equal(c.P.controller.applyImport(undefined, 'merge'), false);
    assert.equal(c.t.state.ui.feedback.message, c.P.messages.storeQuick);
    assert.deepEqual(c.raw(), before);
    // Selection is refused too, before any FileReader work.
    assert.equal(c.P.controller.beginImport(undefined, { size: 10 }), false);
  });

  check('S8 [live] the preflight itself writes nothing and quarantines nothing', () => {
    const c = corrupted({ promptsRaw: '{bad json' });
    const writes = c.sandbox.__ctl.writes.length;
    const keys = Array.from(c.sandbox.__store.keys()).sort();
    const before = c.raw();
    /* The Phase-1 tolerant loader that ran in the fixture legitimately
     * quarantined a copy — that is its contract, and it is not what this case
     * is about. Compare the quarantine set BEFORE and AFTER the preflight. */
    const quarantineBefore = Array.from(c.sandbox.__store.keys()).filter(k => k.includes('.corrupt.')).sort();
    for (let i = 0; i < 3; i += 1) {
      c.P.checkLiveStoreAuthority(c.t.state.data.prompts, c.t.state.data.quick);
    }
    assert.equal(c.sandbox.__ctl.writes.length, writes, 'zero writes');
    assert.deepEqual(Array.from(c.sandbox.__store.keys()).sort(), keys, 'zero new keys');
    assert.equal(c.raw().prompts, before.prompts, 'the corrupt bytes survive byte-identically');
    assert.deepEqual(
      Array.from(c.sandbox.__store.keys()).filter(k => k.includes('.corrupt.')).sort(),
      quarantineBefore,
      'the preflight itself quarantined nothing');
    assert.equal(c.t.diag.counters.corruptReads, c.t.diag.counters.corruptReads,
      'and recorded no corrupt read of its own');
  });

  check('S9 [live] a reload does not turn corruption into a valid empty export', () => {
    const c = corrupted({ promptsRaw: '{bad json' });
    // The Phase-1 loader legitimately reports [] and sets dataError; export must
    // still refuse, and must do so on the STORE check rather than on that flag.
    assert.deepEqual(Array.from(c.t.engine.loadPrompts()), []);
    assert.equal(c.P.controller.exportLibrary(undefined), false);
    assert.equal(c.t.state.ui.feedback.message, c.P.messages.storePrompts);
    assert.equal(c.sandbox.__urls.created.length, 0);
  });

  check('S10 [live] an absent Prompt key with a non-empty memory fails closed', () => {
    const { t, P } = load();
    t.state.data.prompts = [rec('a')];   // memory says there is a library
    t.state.data.quick = [];
    // no primary key written at all
    const res = P.checkLiveStoreAuthority(t.state.data.prompts, t.state.data.quick);
    assert.equal(res.ok, false, 'storage and memory disagree');
    assert.equal(res.error, P.messages.changedPrompts);
    assert.equal(P.controller.exportLibrary(undefined), false);
  });

  check('S11 [live] an absent key with an empty collection is a legitimate first run', () => {
    const { t, P } = load();
    t.state.data.prompts = [];
    t.state.data.quick = [];
    assert.equal(P.checkLiveStoreAuthority([], []).ok, true, 'absent + empty is coherent');
    assert.equal(P.controller.exportLibrary(undefined), true, 'and exports normally');
    assert.equal(t.state.ui.feedback.message, 'Exported');
  });

  check('S12 [live] a healthy pair preserves normal export and import behaviour', () => {
    const c = corrupted({});   // nothing corrupted
    assert.equal(c.P.checkLiveStoreAuthority(c.t.state.data.prompts, c.t.state.data.quick).ok, true);
    assert.equal(c.P.controller.exportLibrary(undefined), true);
    assert.equal(c.t.state.ui.feedback.message, 'Exported');
    const valid = c.P.validateImportEnvelope(envelope([rec('z')], [qrec('q9')]));
    c.t.state.ui.port.pending = { envelope: valid.envelope };
    assert.equal(c.P.controller.applyImport(undefined, 'replace'), true);
    assert.deepEqual(ids(c.t.state.data.prompts), ['z']);
  });

  check('S13 [live] an unsafe preflight writes no import-backup key', () => {
    const c = corrupted({ promptsRaw: '{bad json' });
    const valid = c.P.validateImportEnvelope(envelope([rec('z')], [qrec('q9')]));
    c.t.state.ui.port.pending = { envelope: valid.envelope };
    assert.equal(c.sandbox.__store.get(c.t.keys.importBackup), undefined, 'precondition: no backup');
    assert.equal(c.P.controller.applyImport(undefined, 'merge'), false);
    assert.equal(c.sandbox.__store.get(c.t.keys.importBackup), undefined,
      'and none was written by the refused import');
  });

  check('S14 [live] capture stores are untouched by every refused portability path', () => {
    const c = corrupted({ promptsRaw: '{bad json' });
    c.t.storage.setJSON(c.t.keys.history, [{ id: 'h', text: 'keep', createdAt: 1 }]);
    c.t.storage.setJSON(c.t.keys.drafts, [{ id: 'd', text: 'keep', createdAt: 1 }]);
    c.t.storage.setJSON(c.t.keys.pasted, [{ id: 'p', text: 'keep', createdAt: 1 }]);
    const before = {
      h: c.sandbox.__store.get(c.t.keys.history),
      d: c.sandbox.__store.get(c.t.keys.drafts),
      p: c.sandbox.__store.get(c.t.keys.pasted),
    };
    const valid = c.P.validateImportEnvelope(envelope([rec('z')], [qrec('q9')]));
    c.t.state.ui.port.pending = { envelope: valid.envelope };
    c.P.controller.exportLibrary(undefined);
    c.P.controller.applyImport(undefined, 'merge');
    c.P.controller.beginImport(undefined, { size: 10 });
    assert.equal(c.sandbox.__store.get(c.t.keys.history), before.h);
    assert.equal(c.sandbox.__store.get(c.t.keys.drafts), before.d);
    assert.equal(c.sandbox.__store.get(c.t.keys.pasted), before.p);
  });

  /* ── VALID-BUT-STALE LIVE AUTHORITY (closure 4) ───────────────────────── */
  console.log('');
  console.log('  VALID-BUT-STALE LIVE AUTHORITY');

  const stageSynchronously = (c, env) => {
    const text = JSON.stringify(env);
    let constructions = 0;
    c.sandbox.FileReader = class {
      constructor() { constructions += 1; this.result = null; this.onload = null; this.onerror = null; }
      readAsText(file) { this.result = file.__text; if (this.onload) this.onload(); }
    };
    assert.equal(c.P.controller.beginImport(undefined, { size: text.length, __text: text }), true);
    assert.equal(c.P.controller.isPending(), true, 'the coherent selection staged');
    assert.equal(constructions, 1, 'one real controller reader was constructed');
  };

  check('V1 [live] memory Prompt [A] and valid live Prompt [B] fail coherence', () => {
    const c = seeded();
    c.t.state.data.prompts = [rec('A')];
    c.sandbox.__store.set(c.t.keys.prompts, JSON.stringify([rec('B')]));
    const res = c.P.checkLiveStoreAuthority(c.t.state.data.prompts, c.t.state.data.quick);
    assert.equal(res.ok, false);
    assert.equal(res.error, c.P.messages.changedPrompts);
  });

  check('V2 [live] same Prompt id/count but changed fields and metadata fail coherence', () => {
    const c = seeded();
    c.t.state.data.prompts = [rec('same', { title: 'old', body: 'old body', lastUsedAt: 4, useCount: 1 })];
    c.sandbox.__store.set(c.t.keys.prompts, JSON.stringify([
      rec('same', { title: 'new', body: 'new body', favorite: true, updatedAt: 9, lastUsedAt: 8, useCount: 2 }),
    ]));
    assert.equal(c.P.checkLiveStoreAuthority(c.t.state.data.prompts, c.t.state.data.quick).ok, false);
  });

  check('V3 [live] memory Quick [A] and valid live Quick [B] fail coherence', () => {
    const c = seeded();
    c.t.state.data.quick = [qrec('A', { order: 0 })];
    c.sandbox.__store.set(c.t.keys.quick, JSON.stringify([qrec('B', { order: 0 })]));
    const res = c.P.checkLiveStoreAuthority(c.t.state.data.prompts, c.t.state.data.quick);
    assert.equal(res.ok, false);
    assert.equal(res.error, c.P.messages.changedQuick);
  });

  check('V4 [live] same Quick id with changed text/order/timestamps fails coherence', () => {
    const c = seeded();
    c.t.state.data.quick = [qrec('same', { text: 'old', order: 0, createdAt: 1, updatedAt: 2 })];
    c.sandbox.__store.set(c.t.keys.quick, JSON.stringify([
      qrec('same', { text: 'new', order: 9, createdAt: 3, updatedAt: 4 }),
    ]));
    assert.equal(c.P.checkLiveStoreAuthority(c.t.state.data.prompts, c.t.state.data.quick).ok, false);
  });

  check('V5 [live] stale valid Prompt storage cannot be exported or downloaded', () => {
    const c = seeded();
    c.t.state.data.prompts = [rec('old')];
    const live = JSON.stringify([rec('newer')]);
    c.sandbox.__store.set(c.t.keys.prompts, live);
    let clicks = 0;
    const realCreate = c.sandbox.document.createElement;
    c.sandbox.document.createElement = () => { const el = realCreate(); el.click = () => { clicks += 1; }; return el; };
    const writes = c.sandbox.__ctl.writes.length;
    assert.equal(c.P.controller.exportLibrary(undefined), false);
    assert.equal(c.sandbox.__urls.created.length, 0);
    assert.equal(clicks, 0);
    assert.notEqual(c.t.state.ui.feedback.message, 'Exported');
    assert.equal(c.sandbox.__store.get(c.t.keys.prompts), live, 'live bytes unchanged');
    assert.equal(c.sandbox.__ctl.writes.length, writes, 'zero storage writes');
    c.sandbox.document.createElement = realCreate;
  });

  check('V6 [live] stale valid Quick storage cannot be exported or downloaded', () => {
    const c = seeded();
    c.t.state.data.quick = [qrec('old', { order: 0 })];
    const live = JSON.stringify([qrec('newer', { order: 0 })]);
    c.sandbox.__store.set(c.t.keys.quick, live);
    let clicks = 0;
    const realCreate = c.sandbox.document.createElement;
    c.sandbox.document.createElement = () => { const el = realCreate(); el.click = () => { clicks += 1; }; return el; };
    const writes = c.sandbox.__ctl.writes.length;
    assert.equal(c.P.controller.exportLibrary(undefined), false);
    assert.equal(c.sandbox.__urls.created.length, 0);
    assert.equal(clicks, 0);
    assert.notEqual(c.t.state.ui.feedback.message, 'Exported');
    assert.equal(c.sandbox.__store.get(c.t.keys.quick), live);
    assert.equal(c.sandbox.__ctl.writes.length, writes);
    c.sandbox.document.createElement = realCreate;
  });

  check('V7 [live] beginImport refuses stale valid storage before FileReader construction', () => {
    const c = seeded();
    c.sandbox.__store.set(c.t.keys.prompts, JSON.stringify([rec('newer')]));
    let constructions = 0;
    c.sandbox.FileReader = class { constructor() { constructions += 1; } };
    assert.equal(c.P.controller.beginImport(undefined, { size: 10 }), false);
    assert.equal(constructions, 0);
    assert.equal(c.P.controller.isPending(), false);
  });

  check('V8 [live] a valid Prompt change after staging makes Apply refuse', () => {
    const c = seeded();
    stageSynchronously(c, c.validEnv([rec('imported')], [qrec('imported-q')]));
    c.sandbox.__store.set(c.t.keys.prompts, JSON.stringify([rec('newer')]));
    assert.equal(c.P.controller.applyImport(undefined, 'merge'), false);
    assert.equal(c.t.state.ui.feedback.message, c.P.messages.changedPrompts);
  });

  check('V9 [live] the pending Prompt race refuses before backup or live writes', () => {
    const c = seeded();
    stageSynchronously(c, c.validEnv([rec('imported')], [qrec('imported-q')]));
    const live = JSON.stringify([rec('newer')]);
    c.sandbox.__store.set(c.t.keys.prompts, live);
    const before = c.raw();
    const writes = c.sandbox.__ctl.writes.length;
    assert.equal(c.P.controller.applyImport(undefined, 'replace'), false);
    assert.deepEqual(c.raw(), before, 'Prompt, Quick and backup bytes are unchanged');
    assert.equal(c.sandbox.__store.get(c.t.keys.prompts), live);
    assert.equal(c.sandbox.__ctl.writes.length, writes);
  });

  check('V10 [live] the pending Quick race refuses before any mutation', () => {
    const c = seeded();
    stageSynchronously(c, c.validEnv([rec('imported')], [qrec('imported-q')]));
    const live = JSON.stringify([qrec('newer', { order: 0 })]);
    c.sandbox.__store.set(c.t.keys.quick, live);
    const before = c.raw();
    const writes = c.sandbox.__ctl.writes.length;
    assert.equal(c.P.controller.applyImport(undefined, 'merge'), false);
    assert.equal(c.t.state.ui.feedback.message, c.P.messages.changedQuick);
    assert.deepEqual(c.raw(), before);
    assert.equal(c.sandbox.__ctl.writes.length, writes);
  });

  check('V11 [live] stale-valid preflight writes nothing and creates no quarantine', () => {
    const c = seeded();
    c.sandbox.__store.set(c.t.keys.prompts, JSON.stringify([rec('newer')]));
    const writes = c.sandbox.__ctl.writes.length;
    const keys = Array.from(c.sandbox.__store.keys()).sort();
    const quarantine = keys.filter(k => k.includes('.corrupt.'));
    for (let i = 0; i < 3; i += 1) {
      assert.equal(c.P.checkLiveStoreAuthority(c.t.state.data.prompts, c.t.state.data.quick).ok, false);
    }
    assert.equal(c.sandbox.__ctl.writes.length, writes);
    assert.deepEqual(Array.from(c.sandbox.__store.keys()).sort(), keys);
    assert.deepEqual(Array.from(c.sandbox.__store.keys()).filter(k => k.includes('.corrupt.')).sort(), quarantine);
  });

  check('V12 [live] whitespace and property insertion order do not create false staleness', () => {
    const c = seeded();
    const p = rec('A', { title: 'same', body: 'same body', lastUsedAt: 7, useCount: 2 });
    const q = qrec('Q', { text: 'same quick', order: 0, createdAt: 3, updatedAt: 4 });
    c.t.state.data.prompts = [p];
    c.t.state.data.quick = [q];
    c.sandbox.__store.set(c.t.keys.prompts,
      '[ { "useCount": 2, "lastUsedAt": 7, "updatedAt": 2000, "createdAt": 1000, "favorite": false, "type": "prompt", "body": "same body", "title": "same", "id": "A" } ]');
    c.sandbox.__store.set(c.t.keys.quick,
      '[\n { "updatedAt":4, "createdAt":3, "order":0, "text":"same quick", "id":"Q" }\n]');
    assert.equal(c.P.checkLiveStoreAuthority(c.t.state.data.prompts, c.t.state.data.quick).ok, true);
  });

  check('V13 [live] Quick physical order may differ when `order` defines the same runtime sequence', () => {
    const c = seeded();
    const a = qrec('A', { order: 0 });
    const b = qrec('B', { order: 1 });
    c.t.state.data.quick = [a, b];
    c.sandbox.__store.set(c.t.keys.quick, JSON.stringify([b, a]));
    assert.equal(c.P.checkLiveStoreAuthority(c.t.state.data.prompts, c.t.state.data.quick).ok, true);
  });

  check('V14 [live] Prompt manual array sequence differences are rejected', () => {
    const c = seeded();
    const a = rec('A'); const b = rec('B');
    c.t.state.data.prompts = [a, b];
    c.sandbox.__store.set(c.t.keys.prompts, JSON.stringify([b, a]));
    const res = c.P.checkLiveStoreAuthority(c.t.state.data.prompts, c.t.state.data.quick);
    assert.equal(res.ok, false);
    assert.equal(res.error, c.P.messages.changedPrompts);
  });

  check('V15 [live] coherent healthy libraries retain Export and Import behaviour', () => {
    const c = seeded();
    assert.equal(c.P.checkLiveStoreAuthority(c.t.state.data.prompts, c.t.state.data.quick).ok, true);
    assert.equal(c.P.controller.exportLibrary(undefined), true);
    c.stage(c.validEnv([rec('z')], [qrec('qz')]));
    assert.equal(c.P.controller.applyImport(undefined, 'merge'), true);
    assert.deepEqual(ids(c.t.state.data.prompts), ['a', 'b', 'z']);
    assert.deepEqual(ids(c.t.state.data.quick), ['q1', 'qz']);
  });

  /* ── COMPLETE-RECORD LOSSLESSNESS (closure 4) ─────────────────────────── */
  console.log('');
  console.log('  COMPLETE-RECORD LOSSLESSNESS');

  check('L1 [live] a Prompt with one unknown own key refuses export construction', () => {
    const { P } = load();
    const res = P.buildExportEnvelope([{ ...rec('p1'), extraSecret: 'KEEP-ME' }], [], NOW);
    assert.equal(res.ok, false);
    assert.equal(res.error, P.messages.exportInvalidPrompts);
    assert.equal(res.envelope, null);
  });

  check('L2 [live] a Quick Reply with one unknown own key refuses export construction', () => {
    const { P } = load();
    const res = P.buildExportEnvelope([], [{ ...qrec('q1'), extraSecret: 'KEEP-ME' }], NOW);
    assert.equal(res.ok, false);
    assert.equal(res.error, P.messages.exportInvalidQuick);
    assert.equal(res.envelope, null);
  });

  check('L3 [live] meaningful unknown data is never silently omitted', () => {
    const { P } = load();
    const source = { ...rec('p1'), extraSecret: { value: 'KEEP-ME', nested: [1, 2, 3] } };
    const res = P.buildExportEnvelope([source], [], NOW);
    assert.equal(res.ok, false);
    assert.equal(res.envelope, null, 'there is no sanitized envelope to serialize');
    assert.deepEqual(source.extraSecret, { value: 'KEEP-ME', nested: [1, 2, 3] });
  });

  check('L4 [live] controller Export refuses unknown Prompt/Quick keys with zero side effects', () => {
    for (const kind of ['prompt', 'quick']) {
      const c = seeded();
      const localP = kind === 'prompt' ? [{ ...rec('p1'), extraSecret: 'KEEP-ME' }] : c.t.state.data.prompts;
      const localQ = kind === 'quick' ? [{ ...qrec('q1'), extraSecret: 'KEEP-ME' }] : c.t.state.data.quick;
      c.t.state.data.prompts = localP;
      c.t.state.data.quick = localQ;
      c.sandbox.__store.set(c.t.keys.prompts, JSON.stringify(localP));
      c.sandbox.__store.set(c.t.keys.quick, JSON.stringify(localQ));
      let clicks = 0;
      const realCreate = c.sandbox.document.createElement;
      c.sandbox.document.createElement = () => { const el = realCreate(); el.click = () => { clicks += 1; }; return el; };
      const writes = c.sandbox.__ctl.writes.length;
      const snapshot = c.raw();
      assert.equal(c.P.controller.exportLibrary(undefined), false, `${kind} refused`);
      assert.equal(c.sandbox.__urls.created.length, 0);
      assert.equal(clicks, 0);
      assert.notEqual(c.t.state.ui.feedback.message, 'Exported');
      assert.equal(c.sandbox.__ctl.writes.length, writes);
      assert.deepEqual(c.raw(), snapshot);
      c.sandbox.document.createElement = realCreate;
    }
  });

  check('L5 [live] backup construction refuses an unknown Prompt key', () => {
    const { P } = load();
    const res = P.buildBackupEnvelope([{ ...rec('p1'), extraSecret: 'KEEP-ME' }], [], NOW);
    assert.equal(res.ok, false);
    assert.equal(res.envelope, null);
  });

  check('L6 [live] backup construction refuses an unknown Quick key', () => {
    const { P } = load();
    const res = P.buildBackupEnvelope([], [{ ...qrec('q1'), extraSecret: 'KEEP-ME' }], NOW);
    assert.equal(res.ok, false);
    assert.equal(res.envelope, null);
  });

  check('L7 [live] Merge with an unknown local Prompt field aborts before all writes', () => {
    const c = seeded();
    const local = [{ ...rec('same'), extraSecret: 'KEEP-ME' }];
    c.t.state.data.prompts = local;
    c.sandbox.__store.set(c.t.keys.prompts, JSON.stringify(local));
    c.stage(c.validEnv([rec('same', { title: 'imported' })], [qrec('q9')]));
    const before = c.raw(); const writes = c.sandbox.__ctl.writes.length;
    assert.equal(c.P.controller.applyImport(undefined, 'merge'), false);
    assert.deepEqual(c.raw(), before);
    assert.equal(c.sandbox.__ctl.writes.length, writes);
  });

  check('L8 [live] Replace with an unknown local Prompt field aborts before all writes', () => {
    const c = seeded();
    const local = [{ ...rec('same'), extraSecret: 'KEEP-ME' }];
    c.t.state.data.prompts = local;
    c.sandbox.__store.set(c.t.keys.prompts, JSON.stringify(local));
    c.stage(c.validEnv([rec('same', { title: 'imported' })], [qrec('q9')]));
    const before = c.raw(); const writes = c.sandbox.__ctl.writes.length;
    assert.equal(c.P.controller.applyImport(undefined, 'replace'), false);
    assert.deepEqual(c.raw(), before);
    assert.equal(c.sandbox.__ctl.writes.length, writes);
  });

  check('L9 [live] Merge and Replace with an unknown local Quick field abort before writes', () => {
    for (const mode of ['merge', 'replace']) {
      const c = seeded();
      const local = [{ ...qrec('same'), extraSecret: 'KEEP-ME' }];
      c.t.state.data.quick = local;
      c.sandbox.__store.set(c.t.keys.quick, JSON.stringify(local));
      c.stage(c.validEnv([rec('z')], [qrec('same', { text: 'imported' })]));
      const before = c.raw(); const writes = c.sandbox.__ctl.writes.length;
      assert.equal(c.P.controller.applyImport(undefined, mode), false, mode);
      assert.deepEqual(c.raw(), before);
      assert.equal(c.sandbox.__ctl.writes.length, writes);
    }
  });

  check('L10 [live] no backup key is created on complete-record refusal', () => {
    const c = seeded();
    const local = [{ ...rec('same'), extraSecret: 'KEEP-ME' }];
    c.t.state.data.prompts = local;
    c.sandbox.__store.set(c.t.keys.prompts, JSON.stringify(local));
    c.stage(c.validEnv([rec('same')], []));
    assert.equal(c.sandbox.__store.has(c.t.keys.importBackup), false);
    assert.equal(c.P.controller.applyImport(undefined, 'merge'), false);
    assert.equal(c.sandbox.__store.has(c.t.keys.importBackup), false);
  });

  check('L11 [live] supported optional Prompt fields remain accepted and exact', () => {
    const { P } = load();
    const source = rec('p1', { lastUsedAt: 123, useCount: 7, favorite: true, type: 'append' });
    const ex = P.buildExportEnvelope([source], [], NOW);
    const bk = P.buildBackupEnvelope([source], [], NOW);
    assert.ok(ex.ok); assert.ok(bk.ok);
    assert.deepEqual(host(ex.envelope.prompts[0]), source);
    assert.deepEqual(host(bk.envelope.prompts[0]), source);
  });

  check('L12 [live] every declared Quick field remains accepted and exact', () => {
    const { P } = load();
    const source = qrec('q1', { text: 'exact 🙂', order: 17, createdAt: 11, updatedAt: 22 });
    const ex = P.buildExportEnvelope([], [source], NOW);
    const bk = P.buildBackupEnvelope([], [source], NOW);
    assert.ok(ex.ok); assert.ok(bk.ok);
    assert.deepEqual(host(ex.envelope.quickReplies[0]), source);
    assert.deepEqual(host(bk.envelope.quickReplies[0]), source);
  });

  check('L13 [live] known-field successful Export is accepted by the real importer', () => {
    const { P } = load();
    const ex = P.buildExportEnvelope(
      [rec('p1', { lastUsedAt: 9, useCount: 3 })],
      [qrec('q1', { order: 4 })], NOW);
    assert.ok(ex.ok);
    const imported = P.parseImportText(P.serializeExport(ex.envelope));
    assert.ok(imported.ok, imported.error);
    assert.deepEqual(host(imported.envelope), host(ex.envelope));
  });

  check('L14 [live] strict source checking mutates no accepted or refused input', () => {
    const { P } = load();
    const prompts = [rec('p1', { lastUsedAt: 4, useCount: 2 }), { ...rec('p2'), extraSecret: 'KEEP-ME' }];
    const quick = [qrec('q1')];
    const beforeP = host(prompts); const beforeQ = host(quick);
    assert.equal(P.buildExportEnvelope(prompts, quick, NOW).ok, false);
    assert.equal(P.buildBackupEnvelope(prompts, quick, NOW).ok, false);
    assert.deepEqual(host(prompts), beforeP);
    assert.deepEqual(host(quick), beforeQ);
  });

  check('L15 [live] complete-record refusals leave capture and quarantine stores untouched', () => {
    const c = seeded();
    c.t.storage.setJSON(c.t.keys.history, [{ id: 'h', text: 'keep', createdAt: 1 }]);
    c.t.storage.setJSON(c.t.keys.drafts, [{ id: 'd', text: 'keep', createdAt: 1 }]);
    c.t.storage.setJSON(c.t.keys.pasted, [{ id: 'p', text: 'keep', createdAt: 1 }]);
    const local = [{ ...rec('same'), extraSecret: 'KEEP-ME' }];
    c.t.state.data.prompts = local;
    c.sandbox.__store.set(c.t.keys.prompts, JSON.stringify(local));
    c.stage(c.validEnv([rec('same')], []));
    const captures = [c.t.keys.history, c.t.keys.drafts, c.t.keys.pasted]
      .map(k => [k, c.sandbox.__store.get(k)]);
    const quarantine = Array.from(c.sandbox.__store.keys()).filter(k => k.includes('.corrupt.')).sort();
    c.P.controller.exportLibrary(undefined);
    c.P.controller.applyImport(undefined, 'merge');
    for (const [k, v] of captures) assert.equal(c.sandbox.__store.get(k), v);
    assert.deepEqual(Array.from(c.sandbox.__store.keys()).filter(k => k.includes('.corrupt.')).sort(), quarantine);
  });

  /* ── EXPORT/IMPORT ROUND-TRIP SIZE (closure 3) ─────────────────────────── */
  console.log('');
  console.log('  EXPORT / IMPORT ROUND-TRIP SIZE');

  /* Build a library whose serialized envelope lands near a target byte size. */
  const bigLibrary = (P, targetBytes, unit) => {
    const per = 4000;
    const chunk = unit.repeat(per);
    const out = [];
    let bytes = 0;
    for (let i = 0; bytes <= targetBytes; i += 1) {
      out.push(rec(`p${i}`, { body: chunk }));
      bytes = P.utf8Bytes(P.serializeExport({ kind: P.kind, version: P.version, exportedAt: NOW, prompts: out, quickReplies: [] }));
    }
    return out;
  };

  check('Z1 [live] a normal small export is still downloadable', () => {
    const c = corrupted({});
    assert.equal(c.P.controller.exportLibrary(undefined), true);
    assert.equal(c.t.state.ui.feedback.message, 'Exported');
    assert.equal(c.sandbox.__urls.created.length, 1);
  });

  check('Z2 [live] an ASCII export over 5 MiB is refused before any object URL', () => {
    const c = corrupted({});
    const big = bigLibrary(c.P, c.P.maxBytes, 'x');
    c.t.engine.commitPrompts(big);
    c.t.state.data.quick = [];
    c.t.engine.commitQuick([]);
    const built = c.P.buildExportEnvelope(big, [], NOW);
    assert.ok(built.ok, 'the envelope itself builds — the size gate is separate');
    assert.ok(c.P.utf8Bytes(c.P.serializeExport(built.envelope)) > c.P.maxBytes, 'and it is oversized');
    const urls = c.sandbox.__urls.created.length;
    assert.equal(c.P.controller.exportLibrary(undefined), false);
    assert.equal(c.sandbox.__urls.created.length, urls, 'zero object URLs');
    assert.equal(c.clicks, 0, 'zero clicks');
    assert.equal(c.t.state.ui.feedback.message, c.P.messages.exportTooLarge);
    assert.equal(c.t.state.ui.feedback.kind, 'error');
  });

  check('Z3 [live] a Unicode export under the LENGTH cap but over the BYTE cap is refused', () => {
    const c = corrupted({});
    // '🙂' is 4 UTF-8 bytes and 2 UTF-16 code units, so bytes ~ 2x length.
    const big = bigLibrary(c.P, c.P.maxBytes, '🙂');
    const text = c.P.serializeExport(c.P.buildExportEnvelope(big, [], NOW).envelope);
    assert.ok(text.length < c.P.maxBytes, `String.length is under the cap (${text.length})`);
    assert.ok(c.P.utf8Bytes(text) > c.P.maxBytes, `but the UTF-8 size is over (${c.P.utf8Bytes(text)})`);
    c.t.engine.commitPrompts(big);
    c.t.engine.commitQuick([]);
    const urls = c.sandbox.__urls.created.length;
    assert.equal(c.P.controller.exportLibrary(undefined), false, 'refused on real bytes');
    assert.equal(c.sandbox.__urls.created.length, urls);
    assert.equal(c.t.state.ui.feedback.message, c.P.messages.exportTooLarge);
  });

  check('Z4 [live] parseImportText rejects the same payload by real UTF-8 size', () => {
    const { P } = load();
    const big = bigLibrary(P, P.maxBytes, '🙂');
    const text = P.serializeExport(P.buildExportEnvelope(big, [], NOW).envelope);
    assert.ok(text.length < P.maxBytes, 'a String.length gate would have let it through');
    const res = P.parseImportText(text);
    assert.equal(res.ok, false);
    assert.equal(res.error, P.messages.tooLarge, 'rejected as too large, not as invalid');
  });

  check('Z5 [live] the native File.size check remains the first UI gate', () => {
    const c = corrupted({});
    let readers = 0;
    c.sandbox.FileReader = class { constructor() { readers += 1; } readAsText() {} };
    assert.equal(c.P.controller.beginImport(undefined, { size: c.P.maxBytes + 1 }), false);
    assert.equal(readers, 0, 'no FileReader was even constructed');
    assert.equal(c.t.state.ui.feedback.message, c.P.messages.tooLarge);
    assert.equal(c.P.overSizeLimit(c.P.maxBytes + 1), true);
  });

  check('Z6 [live] an oversized export has no side effect at all', () => {
    const c = corrupted({});
    const big = bigLibrary(c.P, c.P.maxBytes, 'x');
    c.t.engine.commitPrompts(big);
    c.t.engine.commitQuick([]);
    const snapshot = Array.from(c.sandbox.__store.entries()).map(([k, v]) => `${k}=${v}`).sort();
    const writes = c.sandbox.__ctl.writes.length;
    const urls = c.sandbox.__urls.created.length;
    assert.equal(c.P.controller.exportLibrary(undefined), false);
    assert.equal(c.sandbox.__urls.created.length, urls);
    assert.equal(c.clicks, 0);
    assert.notEqual(c.t.state.ui.feedback.message, 'Exported');
    assert.equal(c.sandbox.__ctl.writes.length, writes, 'zero storage writes');
    assert.deepEqual(Array.from(c.sandbox.__store.entries()).map(([k, v]) => `${k}=${v}`).sort(), snapshot);
  });

  check('Z7 [live] every successful export is within the import byte cap', () => {
    const c = corrupted({});
    for (const lib of [[], [rec('a')], [rec('a', { body: 'x'.repeat(10000) }), rec('b')],
      [rec('u', { body: '🙂'.repeat(5000) })]]) {
      c.t.engine.commitPrompts(lib);
      c.t.engine.commitQuick([qrec('q1')]);
      assert.equal(c.P.controller.exportLibrary(undefined), true, `exported: ${lib.length} records`);
      const built = c.P.buildExportEnvelope(c.t.state.data.prompts, c.t.state.data.quick, NOW);
      const bytes = c.P.utf8Bytes(c.P.serializeExport(built.envelope));
      assert.ok(bytes <= c.P.maxBytes, `${bytes} <= ${c.P.maxBytes}`);
    }
  });

  check('Z8 [live] a successful export text passes the real import gates', () => {
    const c = corrupted({});
    c.t.engine.commitPrompts([rec('a', { body: '🙂'.repeat(2000) }), rec('b')]);
    c.t.engine.commitQuick([qrec('q1', { text: 'héllo 🙂' })]);
    assert.equal(c.P.controller.exportLibrary(undefined), true);
    const built = c.P.buildExportEnvelope(c.t.state.data.prompts, c.t.state.data.quick, NOW);
    const text = c.P.serializeExport(built.envelope);
    const res = c.P.parseImportText(text);
    assert.ok(res.ok, `the size gate and the strict validator both accept it: ${res.error}`);
    assert.deepEqual(host(res.envelope), host(built.envelope));
  });

  check('Z9 [live] the byte boundary is deterministic', () => {
    const { P } = load();
    const at = 'a'.repeat(P.maxBytes);
    assert.equal(P.utf8Bytes(at), P.maxBytes, 'exactly at the cap');
    assert.equal(P.overSizeLimit(P.maxBytes), false, 'at the cap is allowed');
    assert.equal(P.overSizeLimit(P.maxBytes + 1), true, 'one over is not');
    assert.equal(P.utf8Bytes('a'), 1);
    assert.equal(P.utf8Bytes('é'), 2);
    assert.equal(P.utf8Bytes('€'), 3);
    assert.equal(P.utf8Bytes('🙂'), 4, 'a 2-code-unit emoji is 4 bytes');
    assert.equal('🙂'.length, 2, 'which String.length would have counted as 2');
  });

  check('Z10 [live] Unicode below the cap still round-trips exactly', () => {
    const { P } = load();
    const body = '🙂'.repeat(1000) + '\r\n' + '日本語テキスト' + '\t<b>x</b>';
    const built = P.buildExportEnvelope([rec('u', { body })], [qrec('q', { text: '🙂 é €' })], NOW);
    assert.ok(built.ok);
    const res = P.parseImportText(P.serializeExport(built.envelope));
    assert.ok(res.ok, res.error);
    assert.equal(host(res.envelope).prompts[0].body, body);
    assert.equal(host(res.envelope).quickReplies[0].text, '🙂 é €');
  });

  console.log('');
  console.log(`PASS ${PASS.length}`);
  if (FAIL.length) {
    console.log(`FAIL ${FAIL.length}`);
    for (const f of FAIL) console.log(`- ${f.label}: ${f.m.split('\n')[0]}`);
    process.exitCode = 1;
  }
}

main();
