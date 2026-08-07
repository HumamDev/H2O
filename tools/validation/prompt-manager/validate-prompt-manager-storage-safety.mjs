#!/usr/bin/env node
// Validator for Prompt Manager (7A1a) storage safety — Phase 1.
//
// Loads the REAL module into a Node VM behind a minimal DOM/window stub and a
// mocked localStorage, then exercises the production ENGINE_PM. Nothing here
// reimplements the storage algorithm: the assertions run against the same code
// that ships.
//
// The stub reports document.readyState === 'loading', so the module parks
// CORE_PM_boot() on its own DOMContentLoaded listener, which never fires here.
// The storage engine and the flag-gated test hook are both constructed before
// that point, so every case controls exactly which load/save runs and in what
// order. Boot-time seeding is covered by the deferred live checks, not here.
//
// Proves:
//   1  malformed JSON            → primary key byte-identical, quarantine copy
//                                  written, loader returns [], corruptReads++
//   2  parsed non-array          → treated as corrupt
//   3  valid empty array         → [] and never reseeded
//   4  absent prompts + no flag  → seeds once, sets ONLY the prompts flag
//   5  absent quick + no flag    → seeds once, sets ONLY the quickReplies flag
//   6  absent + flag already set → [] (no resurrection of defaults)
//   7  failed seed write         → marker NOT set, loader returns []
//   8  setItem failure           → save* returns false, no changed event,
//                                  writeFailures++
//   9  failed prompt mutation    → previous authoritative in-memory array kept

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..', '..', '..');
const MODULE_REL = 'src-runtime-base/7A1a.⬜️✍️ Prompt Manager ✍️.js';

const PASS = [];
const FAIL = [];
function check(label, fn) {
  try { fn(); PASS.push(label); console.log(`  ✓ ${label}`); }
  catch (e) {
    const m = e && e.message ? e.message : String(e);
    FAIL.push({ label, m });
    console.log(`  ✗ ${label}`);
    console.log(`      ${m}`);
  }
}

function readModuleSource() {
  return fs.readFileSync(path.join(REPO_ROOT, MODULE_REL), 'utf8');
}

// Values crossing the VM boundary carry the sandbox realm's prototypes, so they
// are never deepStrictEqual to host-realm literals. Normalize before comparing —
// the same approach the Studio/library validators use.
function plain(value) { return JSON.parse(JSON.stringify(value)); }
function assertEmptyArray(value, msg) {
  assert.equal(Array.isArray(value) || Array.isArray(plain(value)), true, `${msg} (not an array)`);
  assert.equal(plain(value).length, 0, msg);
}

/* ── mock localStorage ──────────────────────────────────────────────────────
 * `failWrites` makes every setItem throw, standing in for a quota error. */
function makeStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    failWrites: false,
    failEnumeration: false,
    writes: 0,
    getItem(k) { return map.has(k) ? map.get(k) : null; },
    setItem(k, v) {
      if (this.failWrites) throw new Error('QuotaExceededError (mock)');
      this.writes += 1;
      map.set(k, String(v));
    },
    removeItem(k) { map.delete(k); },
    // Real Storage exposes length/key(i); the quarantine dedup scan uses both.
    get length() {
      if (this.failEnumeration) throw new Error('enumeration blocked (mock)');
      return map.size;
    },
    key(i) {
      if (this.failEnumeration) throw new Error('enumeration blocked (mock)');
      const ks = Array.from(map.keys());
      return i >= 0 && i < ks.length ? ks[i] : null;
    },
    _map: map,
    _keys() { return Array.from(map.keys()); },
  };
}

/* ── minimal DOM/window stub ────────────────────────────────────────────────
 * Deliberately inert: no composer form is discoverable, so the module mounts
 * nothing and boot retreats to its retry path without throwing. */
function makeSandbox(storage, opts = {}) {
  const listeners = new Map();
  const emitted = [];

  const noopEl = () => ({
    style: {},
    classList: {
      add() {}, remove() {}, toggle() {}, contains() { return false; },
    },
    setAttribute() {}, removeAttribute() {}, getAttribute() { return null; },
    appendChild() {}, remove() {}, focus() {},
    addEventListener() {}, removeEventListener() {},
    querySelector() { return null; }, querySelectorAll() { return []; },
    closest() { return null; }, contains() { return false; },
    getBoundingClientRect() { return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }; },
    children: [],
    textContent: '',
    innerHTML: '',
  });

  const documentStub = {
    // 'loading' parks CORE_PM_boot() on the module's own DOMContentLoaded path,
    // which never fires in this harness. That leaves the REAL storage engine
    // fully constructed but not yet invoked, so each case controls exactly which
    // load/save runs and in what order. Boot itself is covered by the live
    // checks, not here.
    readyState: 'loading',
    documentElement: { ...noopEl(), classList: { contains: () => false, add() {}, remove() {}, toggle() {} } },
    body: null, // keeps the self-heal observer on its DOMContentLoaded path
    title: '',
    activeElement: null,
    createElement: () => noopEl(),
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener() {},
    removeEventListener() {},
    contains() { return false; },
  };

  const windowStub = {
    __H2O_PM_TEST__: true, // flag-gated internals hook
    location: { pathname: '/c/test-chat', href: 'https://chatgpt.com/c/test-chat' },
    localStorage: storage,
    crypto: { randomUUID: (() => { let n = 0; return () => `id-${++n}`; })() },
    setTimeout: () => 0,
    clearTimeout: () => {},
    setInterval: () => 0,
    clearInterval: () => {},
    requestAnimationFrame: () => 0,
    cancelAnimationFrame: () => {},
    getComputedStyle: () => ({ display: 'none', visibility: 'hidden', opacity: '0' }),
    innerWidth: 1280,
    innerHeight: 900,
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    removeEventListener() {},
    // Invokes registered listeners synchronously, exactly as a real window does.
    // This is what lets a listener assert on the state it observes AT EMIT TIME.
    dispatchEvent(ev) {
      emitted.push(ev);
      for (const fn of (listeners.get(ev.type) || [])) {
        try { fn(ev); } catch (e) { emitted.push({ type: '__listener_threw__', error: e }); }
      }
      return true;
    },
  };

  const sandbox = {
    console,
    window: windowStub,
    document: documentStub,
    localStorage: storage,
    performance: { now: () => 0 },
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
    Event: class { constructor(type) { this.type = type; } },
    MutationObserver: class { observe() {} disconnect() {} },
    ResizeObserver: class { observe() {} disconnect() {} },
    CSS: { escape: (s) => String(s) },
  };
  // Frozen clock: UTIL_now() is Date.now(), so overriding the sandbox's Date
  // pins every timestamp the module derives. Used to force quarantine key
  // collisions deterministically instead of racing the real millisecond.
  if (opts.frozenNow != null) {
    const Real = Date;
    class FrozenDate extends Real { static now() { return opts.frozenNow; } }
    sandbox.Date = FrozenDate;
  }

  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  return { sandbox, emitted };
}

/* Boots a fresh module instance over the supplied storage and returns the
 * flag-gated production internals. */
function loadModule(storage, opts = {}) {
  const { sandbox, emitted } = makeSandbox(storage, opts);
  vm.runInContext(readModuleSource(), sandbox, { filename: MODULE_REL });
  const t = sandbox.window.H2O?.PM?.prmptmngr?.__test;
  if (!t) throw new Error('test hook missing — is __H2O_PM_TEST__ honoured?');
  return { t, emitted, sandbox };
}

function changedEvents(emitted) {
  return emitted.filter(e => /promptmgr:changed|pm:changed/.test(String(e.type || '')));
}

function main() {
  console.log('── Prompt Manager 7A1a storage safety (Phase 1) ─────────');

  // 1 — malformed JSON must never be overwritten.
  check('malformed JSON: primary key untouched, quarantined, [] returned, corruptReads++', () => {
    const CORRUPT = '{"broken": [1,2,';
    const store = makeStorage();
    // Seed the raw bytes directly so the key exists but cannot parse.
    store._map.set('h2o:prm:cgx:prmptmngr:state:prompts:v1', CORRUPT);
    const { t } = loadModule(store);

    const out = t.engine.loadPrompts();
    assertEmptyArray(out, 'loader must return an empty list');
    assert.equal(
      store.getItem(t.keys.prompts), CORRUPT,
      'PRIMARY KEY WAS MODIFIED — the original bytes must survive verbatim',
    );
    const q = store._keys().filter(k => k.startsWith(`${t.keys.prompts}.corrupt.`));
    assert.equal(q.length, 1, `expected exactly one quarantine key, got ${q.length}`);
    assert.equal(store.getItem(q[0]), CORRUPT, 'quarantine copy must be byte-identical');
    assert.ok(t.diag.counters.corruptReads >= 1, 'corruptReads must increment');
    assert.equal(t.state.dataError, true, 'dataError must be set');
  });

  // 2 — a parsed non-array is just as corrupt as unparseable text.
  check('parsed non-array is treated as corrupt (primary key preserved)', () => {
    const RAW = '{"not":"an array"}';
    const store = makeStorage();
    store._map.set('h2o:prm:cgx:prmptmngr:state:prompts:v1', RAW);
    const { t } = loadModule(store);

    assertEmptyArray(t.engine.loadPrompts(), 'loader must return an empty list');
    assert.equal(store.getItem(t.keys.prompts), RAW, 'primary key must be preserved');
    assert.equal(
      store._keys().filter(k => k.startsWith(`${t.keys.prompts}.corrupt.`)).length, 1,
      'quarantine copy expected',
    );
  });

  // 3 — an empty list is a legitimate user state, not a first run.
  check('valid empty array returns [] and is never reseeded', () => {
    const store = makeStorage();
    store._map.set('h2o:prm:cgx:prmptmngr:state:prompts:v1', '[]');
    const { t } = loadModule(store);

    assertEmptyArray(t.engine.loadPrompts(), 'empty must stay empty');
    assert.equal(store.getItem(t.keys.prompts), '[]', 'stored value must remain []');
    assert.equal(t.diag.counters.seeds, 0, 'no seed may occur');

    // Reload from scratch: still empty.
    const again = loadModule(store);
    assertEmptyArray(again.t.engine.loadPrompts(), 'still empty after a fresh load');
  });

  check('valid empty quick-reply array is never reseeded', () => {
    const store = makeStorage();
    store._map.set('h2o:prm:cgx:prmptmngr:state:quick_replies:v1', '[]');
    const { t } = loadModule(store);
    assertEmptyArray(t.engine.loadQuick(), 'empty quick list must stay empty');
    assert.equal(t.diag.counters.seeds, 0, 'no seed may occur');
  });

  // 4 — first run seeds exactly once and marks only its own collection.
  check('absent prompts + no flag: seeds once and sets only the prompts flag', () => {
    const store = makeStorage();
    const { t } = loadModule(store);

    const seeded = t.engine.loadPrompts();
    assert.ok(Array.isArray(seeded) && seeded.length > 0, 'expected seed data');
    assert.ok(t.diag.counters.seeds >= 1, 'seeds counter must increment');

    const flags = t.engine.loadSeedState();
    assert.equal(flags.prompts, true, 'prompts flag must be set');
    assert.equal(flags.quickReplies, false, 'quickReplies flag must NOT be set by a prompt seed');
  });

  // 5 — the two collections seed independently.
  check('absent quick + no flag: seeds once and sets only the quickReplies flag', () => {
    const store = makeStorage();
    const { t } = loadModule(store);

    const seeded = t.engine.loadQuick();
    assert.ok(Array.isArray(seeded) && seeded.length > 0, 'expected quick seed data');

    const flags = t.engine.loadSeedState();
    assert.equal(flags.quickReplies, true, 'quickReplies flag must be set');
    assert.equal(flags.prompts, false, 'prompts flag must NOT be set by a quick seed');
  });

  // 6 — the whole point of the marker: deleting everything stays deleted.
  check('absent key with its flag already true returns [] (no resurrection)', () => {
    const store = makeStorage();
    store._map.set(
      'h2o:prm:cgx:prmptmngr:state:seeded:v1',
      JSON.stringify({ prompts: true, quickReplies: true }),
    );
    const { t } = loadModule(store);

    assertEmptyArray(t.engine.loadPrompts(), 'prompts must not be reseeded');
    assertEmptyArray(t.engine.loadQuick(), 'quick replies must not be reseeded');
    assert.equal(t.diag.counters.seeds, 0, 'no seed may occur');
    assert.equal(store.getItem(t.keys.prompts), null, 'no primary key may be written');
  });

  // 7 — never claim a seed that was not persisted.
  check('failed seed write leaves the marker unset and returns []', () => {
    const store = makeStorage();
    const { t } = loadModule(store);
    store.failWrites = true;

    assertEmptyArray(t.engine.loadPrompts(), 'must not report an unpersisted seed');
    assert.equal(t.engine.loadSeedState().prompts, false, 'marker must stay unset');
    assert.ok(t.diag.counters.writeFailures >= 1, 'writeFailures must increment');
    assert.equal(t.state.dataError, true, 'dataError must be set');
  });

  // 8 — a failed write must not masquerade as success.
  check('setItem failure: save* returns false, emits no changed event, writeFailures++', () => {
    const store = makeStorage();
    const { t, emitted } = loadModule(store);
    const before = t.diag.counters.writeFailures;
    emitted.length = 0;
    store.failWrites = true;

    assert.equal(t.engine.savePrompts([{ id: 'x', title: 'x', body: 'x' }]), false, 'savePrompts must report false');
    assert.equal(t.engine.saveQuick([{ id: 'q', text: 'q', order: 0 }]), false, 'saveQuick must report false');
    assert.equal(t.engine.saveHistory([]), false, 'saveHistory must report false');
    assert.equal(t.engine.saveDrafts([]), false, 'saveDrafts must report false');
    assert.equal(t.engine.savePasted([]), false, 'savePasted must report false');

    assert.equal(changedEvents(emitted).length, 0, 'no changed event may be emitted for a failed write');
    assert.ok(t.diag.counters.writeFailures >= before + 5, 'writeFailures must count each failure');
  });

  check('successful save emits both canonical and legacy changed events', () => {
    const store = makeStorage();
    const { t, emitted } = loadModule(store);
    emitted.length = 0;

    assert.equal(t.engine.savePrompts([{ id: 'x', title: 'x', body: 'x' }]), true);
    const types = changedEvents(emitted).map(e => e.type);
    assert.ok(types.includes(t.events.changed), `missing ${t.events.changed}`);
    assert.ok(types.includes(t.events.changedLegacy), `missing ${t.events.changedLegacy}`);
  });

  // 9 — the visible list must never diverge from what was actually stored.
  check('failed prompt mutation preserves the previous in-memory array', () => {
    const store = makeStorage();
    const { t } = loadModule(store);

    const original = [
      { id: 'a', title: 'A', body: 'a', type: 'prompt', favorite: false, createdAt: 1, updatedAt: 1 },
      { id: 'b', title: 'B', body: 'b', type: 'prompt', favorite: false, createdAt: 1, updatedAt: 1 },
    ];
    assert.equal(t.engine.commitPrompts(original), true, 'baseline commit must succeed');
    assert.equal(t.state.data.prompts, original, 'baseline must be adopted');

    store.failWrites = true;
    const candidate = original.concat([{ id: 'c', title: 'C', body: 'c', type: 'prompt' }]);
    assert.equal(t.engine.commitPrompts(candidate), false, 'commit must report failure');

    assert.equal(t.state.data.prompts, original, 'authoritative array must still be the previous one');
    assert.equal(t.state.data.prompts.length, 2, 'the unsaved entry must not appear in memory');
    assert.equal(t.state.data.prompts.some(p => p.id === 'c'), false, 'unsaved entry leaked into state');
  });

  check('failed quick mutation preserves the previous in-memory array', () => {
    const store = makeStorage();
    const { t } = loadModule(store);
    const original = [{ id: 'q1', text: 'Yes', order: 0 }];
    assert.equal(t.engine.commitQuick(original), true);
    store.failWrites = true;
    assert.equal(t.engine.commitQuick(original.concat([{ id: 'q2', text: 'No', order: 1 }])), false);
    assert.equal(t.state.data.quick, original, 'authoritative quick array must be unchanged');
  });

  check('capture push helpers report truthful success and failure', () => {
    const store = makeStorage();
    const { t } = loadModule(store);
    assert.equal(t.engine.pushHistory('hello'), true, 'successful push must report true');
    assert.equal(t.engine.pushHistory(''), true, 'empty push is a deliberate skip, not a failure');
    assert.equal(t.engine.pushHistory('hello'), true, 'duplicate push is a deliberate skip');
    store.failWrites = true;
    assert.equal(t.engine.pushHistory('another'), false, 'failed write must report false');
    assert.equal(t.engine.pushDraft('draft'), false, 'failed write must report false');
    assert.equal(t.engine.pushPasted('pasted'), false, 'failed write must report false');
  });

  check('existing valid prompt data loads unchanged (backward compatibility)', () => {
    const legacy = [
      { id: 'p1', title: 'G: (grammar only)', body: 'G:', favorite: true, type: 'append', createdAt: 10, updatedAt: 20 },
      { id: 'p2', title: 'Old record', body: 'no type field' }, // pre-schema record
    ];
    const store = makeStorage();
    store._map.set('h2o:prm:cgx:prmptmngr:state:prompts:v1', JSON.stringify(legacy));
    const { t } = loadModule(store);

    const out = t.engine.loadPrompts();
    assert.equal(out.length, 2, 'both records must survive');
    assert.equal(out[0].title, 'G: (grammar only)');
    assert.equal(out[0].favorite, true, 'favourite flag preserved');
    assert.equal(out[0].createdAt, 10, 'existing timestamps preserved');
    assert.equal(out[1].type, 'prompt', 'missing type normalized to prompt');
    assert.ok(Number.isFinite(out[1].createdAt), 'missing createdAt backfilled');
  });

  // ── Correction 1: an empty string is a stored value, not an absent key ──────
  // '' is what a truncated or cleared-to-empty write leaves behind. Classifying
  // it as absent would re-seed defaults over recoverable bytes.
  for (const [label, key, load] of [
    ['prompts', 'h2o:prm:cgx:prmptmngr:state:prompts:v1', (t) => t.engine.loadPrompts()],
    ['quick replies', 'h2o:prm:cgx:prmptmngr:state:quick_replies:v1', (t) => t.engine.loadQuick()],
  ]) {
    check(`empty-string ${label} value is corrupt, not absent (no reseed, bytes kept)`, () => {
      const store = makeStorage();
      store._map.set(key, '');
      const { t } = loadModule(store);

      assertEmptyArray(load(t), 'loader must return an empty list');
      assert.equal(store.getItem(key), '', 'PRIMARY KEY WAS MODIFIED — the empty value must survive');
      assert.equal(t.diag.counters.seeds, 0, 'defaults must NOT be seeded over an empty-string value');
      assert.ok(t.diag.counters.corruptReads >= 1, 'corruptReads must increment');
      assert.equal(t.state.dataError, true, 'dataError must be set');

      const q = store._keys().filter(k => k.startsWith(`${key}.corrupt.`));
      assert.equal(q.length, 1, `expected exactly one quarantine key, got ${q.length}`);
      assert.equal(store.getItem(q[0]), '', 'quarantine copy must hold the same empty payload');
    });
  }

  check('a genuinely absent key is still absent (getItem === null seeds normally)', () => {
    const store = makeStorage();
    const { t } = loadModule(store);
    const seeded = t.engine.loadPrompts();
    assert.ok(plain(seeded).length > 0, 'absent key must still seed — only null means absent');
    assert.equal(t.state.dataError, false, 'a normal first run is not a data error');
  });

  // ── Correction 2: adopt state BEFORE publishing the change ─────────────────
  check('changed listener observes the NEW prompt array (adopt precedes emit)', () => {
    const store = makeStorage();
    const { t, sandbox } = loadModule(store);

    const base = [{ id: 'a', title: 'A', body: 'a', type: 'prompt' }];
    assert.equal(t.engine.commitPrompts(base), true, 'baseline commit must succeed');

    const observed = [];
    for (const ev of [t.events.changed, t.events.changedLegacy]) {
      sandbox.window.addEventListener(ev, () => {
        observed.push({ ev, seen: t.state.data.prompts });
      });
    }

    const next = base.concat([{ id: 'b', title: 'B', body: 'b', type: 'prompt' }]);
    assert.equal(t.engine.commitPrompts(next), true, 'commit must succeed');

    assert.equal(observed.length, 2, 'both canonical and legacy listeners must fire');
    for (const o of observed) {
      assert.equal(o.seen, next, `${o.ev}: listener saw the OLD array — emit ran before adoption`);
      assert.equal(plain(o.seen).length, 2, `${o.ev}: listener must see the 2-entry array`);
    }
  });

  check('changed listener observes the NEW quick-reply array (adopt precedes emit)', () => {
    const store = makeStorage();
    const { t, sandbox } = loadModule(store);

    const base = [{ id: 'q1', text: 'Yes', order: 0 }];
    assert.equal(t.engine.commitQuick(base), true, 'baseline commit must succeed');

    const observed = [];
    for (const ev of [t.events.changed, t.events.changedLegacy]) {
      sandbox.window.addEventListener(ev, () => {
        observed.push({ ev, seen: t.state.data.quick });
      });
    }

    const next = base.concat([{ id: 'q2', text: 'No', order: 1 }]);
    assert.equal(t.engine.commitQuick(next), true, 'commit must succeed');

    assert.equal(observed.length, 2, 'both canonical and legacy listeners must fire');
    for (const o of observed) {
      assert.equal(o.seen, next, `${o.ev}: listener saw the OLD array — emit ran before adoption`);
      assert.equal(plain(o.seen).length, 2, `${o.ev}: listener must see the 2-entry array`);
    }
  });

  check('a failed write emits nothing, so no listener can observe a phantom change', () => {
    const store = makeStorage();
    const { t, sandbox } = loadModule(store);
    const base = [{ id: 'a', title: 'A', body: 'a', type: 'prompt' }];
    assert.equal(t.engine.commitPrompts(base), true);

    let fired = 0;
    sandbox.window.addEventListener(t.events.changed, () => { fired += 1; });
    sandbox.window.addEventListener(t.events.changedLegacy, () => { fired += 1; });

    store.failWrites = true;
    assert.equal(t.engine.commitPrompts(base.concat([{ id: 'z' }])), false, 'commit must fail');
    assert.equal(fired, 0, 'no changed event may be emitted for a failed write');
    assert.equal(t.state.data.prompts, base, 'previous authoritative array must survive');
  });

  check('persist* writes bytes only — no adoption, no event', () => {
    const store = makeStorage();
    const { t, sandbox } = loadModule(store);
    const base = [{ id: 'a', title: 'A', body: 'a', type: 'prompt' }];
    assert.equal(t.engine.commitPrompts(base), true);

    let fired = 0;
    sandbox.window.addEventListener(t.events.changed, () => { fired += 1; });

    const other = [{ id: 'zzz', title: 'Z', body: 'z', type: 'prompt' }];
    assert.equal(t.engine.persistPrompts(other), true, 'persist must report success');
    assert.equal(fired, 0, 'persist must not publish a change');
    assert.equal(t.state.data.prompts, base, 'persist must not adopt state');
    assert.equal(t.engine.persistQuick([]), true, 'persistQuick must report success');
  });

  // ── Correction 5: quarantine copies are deduplicated ───────────────────────
  const CORRUPT_A = '{"broken": [1,2,';
  const CORRUPT_B = '{"different": "payload"';
  const PKEY = 'h2o:prm:cgx:prmptmngr:state:prompts:v1';
  const qkeys = (store) => store._keys().filter(k => k.startsWith(`${PKEY}.corrupt.`));

  check('first corrupt load creates exactly one quarantine copy', () => {
    const store = makeStorage();
    store._map.set(PKEY, CORRUPT_A);
    const { t } = loadModule(store);
    assertEmptyArray(t.engine.loadPrompts(), 'loader must return []');
    assert.equal(qkeys(store).length, 1, 'exactly one quarantine copy expected');
    assert.equal(store.getItem(PKEY), CORRUPT_A, 'primary bytes must be untouched');
  });

  check('a fresh module load over unchanged storage creates no second copy', () => {
    const store = makeStorage();
    store._map.set(PKEY, CORRUPT_A);

    const first = loadModule(store);
    first.t.engine.loadPrompts();
    assert.equal(qkeys(store).length, 1, 'first load must create one copy');
    const afterFirst = qkeys(store)[0];

    // Simulate later boots over the same unchanged storage.
    for (let boot = 2; boot <= 4; boot += 1) {
      const again = loadModule(store);
      assertEmptyArray(again.t.engine.loadPrompts(), 'loader must still return []');
      assert.equal(qkeys(store).length, 1,
        `boot ${boot} duplicated the quarantine copy (${qkeys(store).length} keys)`);
      assert.ok(again.t.diag.counters.corruptReads >= 1,
        'a corrupt read still counts even when the copy is reused');
    }
    assert.equal(qkeys(store)[0], afterFirst, 'the original quarantine key must be reused');
    assert.equal(store.getItem(PKEY), CORRUPT_A, 'primary bytes must be untouched');
  });

  check('a different corrupt payload creates a new copy alongside the first', () => {
    const store = makeStorage();
    store._map.set(PKEY, CORRUPT_A);
    loadModule(store).t.engine.loadPrompts();
    assert.equal(qkeys(store).length, 1);

    store._map.set(PKEY, CORRUPT_B); // the corrupt value changed
    loadModule(store).t.engine.loadPrompts();
    assert.equal(qkeys(store).length, 2, 'a distinct payload must be quarantined separately');

    const stored = qkeys(store).map(k => store.getItem(k)).sort();
    assert.deepEqual(stored, [CORRUPT_A, CORRUPT_B].sort(), 'both payloads must be preserved');
    assert.equal(store.getItem(PKEY), CORRUPT_B, 'primary bytes must be untouched');
  });

  check('quarantine enumeration failure is diagnostic and never touches the primary key', () => {
    const store = makeStorage();
    store._map.set(PKEY, CORRUPT_A);
    const { t } = loadModule(store);
    store.failEnumeration = true;

    assertEmptyArray(t.engine.loadPrompts(), 'loader must still return []');
    assert.equal(store.getItem(PKEY), CORRUPT_A, 'primary bytes must be untouched');
    assert.ok(t.diag.counters.corruptReads >= 1, 'the corrupt read is still recorded');
    const where = (t.diag.errors || []).map(e => e.where).join(' ');
    assert.match(where, /quarantineScan/, 'the failed enumeration must be reported diagnostically');
  });

  check('quarantine write failure leaves the primary key intact', () => {
    const store = makeStorage();
    store._map.set(PKEY, CORRUPT_A);
    const { t } = loadModule(store);
    store.failWrites = true;

    assertEmptyArray(t.engine.loadPrompts(), 'loader must still return []');
    assert.equal(store.getItem(PKEY), CORRUPT_A, 'primary bytes must be untouched');
    assert.equal(qkeys(store).length, 0, 'no quarantine copy could be written');
    assert.equal(t.state.dataError, true, 'dataError must be set');
  });

  // ══ MIGRATION SAFETY ══════════════════════════════════════════════════════
  // Every case below drives the REAL production migration routines through the
  // guarded test hook. No migration logic is reimplemented here.

  // ── migrateKeysOnce ───────────────────────────────────────────────────────

  check('KEY-MIG 1: destination "" is PRESENT — never overwritten from legacy', () => {
    const store = makeStorage();
    const { t } = loadModule(store);
    store._map.set(t.keys.prompts, '');                       // destination = ''
    store._map.set(t.legacyKeys.prompts, '[{"id":"legacy"}]'); // legacy has data

    t.engine.migrateKeysOnce();

    assert.equal(store.getItem(t.keys.prompts), '',
      'DESTINATION OVERWRITTEN — "" must be treated as present, not absent');
    assert.equal(store.getItem(t.legacyKeys.prompts), '[{"id":"legacy"}]',
      'a differing legacy value must be retained as the recovery copy');
  });

  check('KEY-MIG 1b: destination "" for quick replies is likewise preserved', () => {
    const store = makeStorage();
    const { t } = loadModule(store);
    store._map.set(t.keys.quick, '');
    store._map.set(t.legacyKeys.quick, '[{"id":"legacy-quick"}]');

    t.engine.migrateKeysOnce();

    assert.equal(store.getItem(t.keys.quick), '', 'quick destination "" must survive');
    assert.equal(store.getItem(t.legacyKeys.quick), '[{"id":"legacy-quick"}]', 'legacy retained');
  });

  check('KEY-MIG 2: destination absent + write fails → legacy kept, dest absent, no marker', () => {
    const store = makeStorage();
    const { t } = loadModule(store);
    store._map.set(t.legacyKeys.prompts, '[{"id":"legacy"}]');
    store.failWrites = true;

    const ok = t.engine.migrateKeysOnce();

    assert.equal(ok, false, 'migration must report failure');
    assert.equal(store.getItem(t.legacyKeys.prompts), '[{"id":"legacy"}]',
      'LEGACY DELETED — it must survive a failed destination write');
    assert.equal(store.getItem(t.keys.prompts), null, 'destination must remain absent');
    assert.equal(store.getItem(t.keys.migKeys), null, 'migration marker must remain unset');
    assert.ok(t.diag.counters.writeFailures >= 1, 'write failure must be counted');
  });

  check('KEY-MIG 3: destination absent + legacy present → verified copy, legacy removed', () => {
    const store = makeStorage();
    const { t } = loadModule(store);
    const payload = '[{"id":"legacy","title":"L"}]';
    store._map.set(t.legacyKeys.prompts, payload);

    const ok = t.engine.migrateKeysOnce();

    assert.equal(ok, true, 'migration must report success');
    assert.equal(store.getItem(t.keys.prompts), payload, 'destination must equal legacy byte-for-byte');
    assert.equal(store.getItem(t.legacyKeys.prompts), null, 'legacy removed only after verification');
    assert.equal(store.getItem(t.keys.migKeys), '1', 'marker set once every pair is terminal');
  });

  check('KEY-MIG 4: destination holds a different valid value → untouched, legacy retained', () => {
    const store = makeStorage();
    const { t } = loadModule(store);
    const dest = '[{"id":"current"}]';
    const legacy = '[{"id":"legacy"}]';
    store._map.set(t.keys.prompts, dest);
    store._map.set(t.legacyKeys.prompts, legacy);

    t.engine.migrateKeysOnce();

    assert.equal(store.getItem(t.keys.prompts), dest, 'existing destination must never be overwritten');
    assert.equal(store.getItem(t.legacyKeys.prompts), legacy,
      'a differing legacy value must not be deleted — it may be the only recovery copy');
  });

  check('KEY-MIG 5: no legacy and no destination → pair is terminal, marker set', () => {
    const store = makeStorage();
    const { t } = loadModule(store);
    const ok = t.engine.migrateKeysOnce();
    assert.equal(ok, true, 'nothing to copy is a success');
    assert.equal(store.getItem(t.keys.migKeys), '1', 'marker set');
  });

  check('KEY-MIG 6: marker write failure → sources intact, marker unset, retry succeeds', () => {
    const store = makeStorage();
    const { t } = loadModule(store);
    const payload = '[{"id":"legacy"}]';
    store._map.set(t.legacyKeys.prompts, payload);

    // Fail only the marker write; let the verified copy through.
    const realSet = store.setItem.bind(store);
    store.setItem = function (k, v) {
      if (k === t.keys.migKeys) throw new Error('marker write blocked (mock)');
      return realSet(k, v);
    };
    const ok = t.engine.migrateKeysOnce();
    assert.equal(ok, false, 'must report failure when the marker cannot be written');
    assert.equal(store.getItem(t.keys.migKeys), null, 'marker must remain unset');
    assert.equal(store.getItem(t.keys.prompts), payload, 'copied data remains safe');

    store.setItem = realSet;
    const again = loadModule(store);
    assert.equal(again.t.engine.migrateKeysOnce(), true, 'retry must complete');
    assert.equal(store.getItem(t.keys.migKeys), '1', 'marker set on retry');
    assert.equal(store.getItem(t.keys.prompts), payload, 'data unchanged by the retry');
  });

  // ── migrateDraftsFromHistoryOnce ──────────────────────────────────────────

  const HIST_WITH_DRAFT = JSON.stringify([
    { id: 'h1', text: 'a sent message', createdAt: 100, source: 'send' },
    { id: 'd1', text: 'an unsent draft', createdAt: 200, source: 'draft' },
  ]);

  check('DRAFT-MIG 5: Drafts write fails → History byte-identical, no marker', () => {
    const store = makeStorage();
    const { t } = loadModule(store);
    store._map.set(t.keys.history, HIST_WITH_DRAFT);
    store.failWrites = true;

    const ok = t.engine.migrateDraftsFromHistoryOnce();

    assert.equal(ok, false, 'must report failure');
    assert.equal(store.getItem(t.keys.history), HIST_WITH_DRAFT,
      'HISTORY MUTATED — it must be byte-identical when the Drafts write fails');
    assert.equal(store.getItem(t.keys.drafts), null, 'Drafts must not falsely contain the item');
    assert.equal(store.getItem(t.keys.migDrafts), null, 'marker must remain unset');
  });

  check('DRAFT-MIG 6: History write fails after Drafts succeeds → original History kept, no marker', () => {
    const store = makeStorage();
    const { t } = loadModule(store);
    store._map.set(t.keys.history, HIST_WITH_DRAFT);

    const realSet = store.setItem.bind(store);
    store.setItem = function (k, v) {
      if (k === t.keys.history) throw new Error('history write blocked (mock)');
      return realSet(k, v);
    };
    const ok = t.engine.migrateDraftsFromHistoryOnce();
    store.setItem = realSet;

    assert.equal(ok, false, 'must report failure');
    assert.equal(store.getItem(t.keys.history), HIST_WITH_DRAFT, 'original History must remain');
    const drafts = JSON.parse(store.getItem(t.keys.drafts));
    assert.equal(drafts.length, 1, 'the copied draft is safely stored');
    assert.equal(drafts[0].text, 'an unsent draft');
    assert.equal(store.getItem(t.keys.migDrafts), null, 'marker must remain unset');
  });

  check('DRAFT-MIG 7: retry after case 6 → no duplicates, History migrates, marker set', () => {
    const store = makeStorage();
    const first = loadModule(store);
    store._map.set(first.t.keys.history, HIST_WITH_DRAFT);

    const realSet = store.setItem.bind(store);
    store.setItem = function (k, v) {
      if (k === first.t.keys.history) throw new Error('history write blocked (mock)');
      return realSet(k, v);
    };
    assert.equal(first.t.engine.migrateDraftsFromHistoryOnce(), false, 'first attempt defers');
    store.setItem = realSet;

    // Fresh module load = a later boot over the same storage.
    const { t } = loadModule(store);
    assert.equal(t.engine.migrateDraftsFromHistoryOnce(), true, 'retry must complete');

    const drafts = JSON.parse(store.getItem(t.keys.drafts));
    assert.equal(drafts.length, 1, `DUPLICATE DRAFTS on retry: got ${drafts.length}`);
    assert.equal(drafts[0].text, 'an unsent draft');

    const hist = JSON.parse(store.getItem(t.keys.history));
    assert.equal(hist.length, 1, 'the draft row is removed from History');
    assert.equal(hist[0].id, 'h1', 'the sent message is preserved');
    assert.equal(store.getItem(t.keys.migDrafts), '1', 'marker set once both writes succeed');
  });

  check('DRAFT-MIG 7b: retry dedups even when the source row carried no id', () => {
    const noId = JSON.stringify([
      { text: 'sent', createdAt: 100, source: 'send' },
      { text: 'draft without id', source: 'draft' },
    ]);
    const store = makeStorage();
    const first = loadModule(store);
    store._map.set(first.t.keys.history, noId);

    const realSet = store.setItem.bind(store);
    store.setItem = function (k, v) {
      if (k === first.t.keys.history) throw new Error('history write blocked (mock)');
      return realSet(k, v);
    };
    assert.equal(first.t.engine.migrateDraftsFromHistoryOnce(), false);
    store.setItem = realSet;

    const { t } = loadModule(store);
    assert.equal(t.engine.migrateDraftsFromHistoryOnce(), true);
    const drafts = JSON.parse(store.getItem(t.keys.drafts));
    assert.equal(drafts.length, 1,
      `id-less draft duplicated on retry: got ${drafts.length} — text fallback identity failed`);
  });

  check('DRAFT-MIG 8: marker write failure → data safe, retry does not duplicate', () => {
    const store = makeStorage();
    const first = loadModule(store);
    store._map.set(first.t.keys.history, HIST_WITH_DRAFT);

    const realSet = store.setItem.bind(store);
    store.setItem = function (k, v) {
      if (k === first.t.keys.migDrafts) throw new Error('marker write blocked (mock)');
      return realSet(k, v);
    };
    assert.equal(first.t.engine.migrateDraftsFromHistoryOnce(), false, 'must report failure');
    store.setItem = realSet;

    assert.equal(store.getItem(first.t.keys.migDrafts), null, 'marker unset');
    assert.equal(JSON.parse(store.getItem(first.t.keys.drafts)).length, 1, 'migrated data safe');

    const { t } = loadModule(store);
    assert.equal(t.engine.migrateDraftsFromHistoryOnce(), true, 'retry completes');
    assert.equal(JSON.parse(store.getItem(t.keys.drafts)).length, 1, 'no duplicate on retry');
    assert.equal(store.getItem(t.keys.migDrafts), '1', 'marker set on retry');
  });

  check('DRAFT-MIG 9: malformed History → primary bytes untouched, no marker', () => {
    const BAD = '{"broken": [1,2,';
    const store = makeStorage();
    const { t } = loadModule(store);
    store._map.set(t.keys.history, BAD);

    const ok = t.engine.migrateDraftsFromHistoryOnce();

    assert.equal(ok, false, 'must fail closed');
    assert.equal(store.getItem(t.keys.history), BAD,
      'HISTORY REWRITTEN — malformed source must never be replaced with []');
    assert.equal(store.getItem(t.keys.migDrafts), null, 'marker must remain unset');
    assert.equal(t.state.dataError, true, 'dataError must be set');
  });

  check('DRAFT-MIG 10: malformed Drafts → both stores untouched, no marker', () => {
    const BADD = 'not json at all';
    const store = makeStorage();
    const { t } = loadModule(store);
    store._map.set(t.keys.history, HIST_WITH_DRAFT);
    store._map.set(t.keys.drafts, BADD);

    const ok = t.engine.migrateDraftsFromHistoryOnce();

    assert.equal(ok, false, 'must fail closed');
    assert.equal(store.getItem(t.keys.drafts), BADD, 'malformed Drafts must be preserved');
    assert.equal(store.getItem(t.keys.history), HIST_WITH_DRAFT, 'History must be untouched');
    assert.equal(store.getItem(t.keys.migDrafts), null, 'marker must remain unset');
  });

  check('DRAFT-MIG 11: clean run migrates and sets the marker', () => {
    const store = makeStorage();
    const { t } = loadModule(store);
    store._map.set(t.keys.history, HIST_WITH_DRAFT);

    assert.equal(t.engine.migrateDraftsFromHistoryOnce(), true);
    assert.equal(JSON.parse(store.getItem(t.keys.drafts)).length, 1);
    assert.equal(JSON.parse(store.getItem(t.keys.history)).length, 1);
    assert.equal(store.getItem(t.keys.migDrafts), '1');
  });

  check('DRAFT-MIG 12: an already-marked migration is a no-op', () => {
    const store = makeStorage();
    const { t } = loadModule(store);
    store._map.set(t.keys.history, HIST_WITH_DRAFT);
    store._map.set(t.keys.migDrafts, '1');

    assert.equal(t.engine.migrateDraftsFromHistoryOnce(), true, 'already complete');
    assert.equal(store.getItem(t.keys.history), HIST_WITH_DRAFT, 'History untouched when already migrated');
  });

  // ══ FINAL CLOSURE: DRAFT IDENTITY ═════════════════════════════════════════
  // Text alone is never an identity. A valid id is authoritative; an idless row
  // gets a deterministic id from text + timestamp + occurrence ordinal.

  const H = (rows) => JSON.stringify(rows);
  const draftsOf = (store, t) => JSON.parse(store.getItem(t.keys.drafts) || '[]');

  check('ID-1: existing draft and History row share text but differ by id → both kept', () => {
    const store = makeStorage();
    const { t } = loadModule(store);
    store._map.set(t.keys.drafts, H([{ id: 'A', text: 'same text', createdAt: 100 }]));
    store._map.set(t.keys.history, H([{ id: 'B', text: 'same text', createdAt: 200, source: 'draft' }]));

    assert.equal(t.engine.migrateDraftsFromHistoryOnce(), true);
    const d = draftsOf(store, t);
    assert.equal(d.length, 2, `RECORD LOST: expected both, got ${d.length}`);
    assert.deepEqual(d.map(x => x.id).sort(), ['A', 'B'], 'both ids must survive');
  });

  check('ID-2: two History rows share text but differ by id → both migrate', () => {
    const store = makeStorage();
    const { t } = loadModule(store);
    store._map.set(t.keys.history, H([
      { id: 'B', text: 'same text', createdAt: 100, source: 'draft' },
      { id: 'C', text: 'same text', createdAt: 100, source: 'draft' },
    ]));

    assert.equal(t.engine.migrateDraftsFromHistoryOnce(), true);
    const d = draftsOf(store, t);
    assert.equal(d.length, 2, `RECORD LOST: expected both, got ${d.length}`);
    assert.deepEqual(d.map(x => x.id).sort(), ['B', 'C']);
  });

  check('ID-3: two idless rows share text, differ by timestamp → both migrate', () => {
    const store = makeStorage();
    const { t } = loadModule(store);
    store._map.set(t.keys.history, H([
      { text: 'same text', createdAt: 100, source: 'draft' },
      { text: 'same text', createdAt: 200, source: 'draft' },
    ]));

    assert.equal(t.engine.migrateDraftsFromHistoryOnce(), true);
    const d = draftsOf(store, t);
    assert.equal(d.length, 2, `RECORD LOST: expected both, got ${d.length}`);
    assert.equal(new Set(d.map(x => x.id)).size, 2, 'derived ids must be distinct');
    assert.deepEqual(d.map(x => x.createdAt).sort((a, b) => a - b), [100, 200]);
  });

  check('ID-4: two idless rows share text AND timestamp → both migrate as occurrences', () => {
    const store = makeStorage();
    const { t } = loadModule(store);
    store._map.set(t.keys.history, H([
      { text: 'same text', createdAt: 100, source: 'draft' },
      { text: 'same text', createdAt: 100, source: 'draft' },
    ]));

    assert.equal(t.engine.migrateDraftsFromHistoryOnce(), true);
    const d = draftsOf(store, t);
    assert.equal(d.length, 2, `OCCURRENCE COLLAPSED: expected both, got ${d.length}`);
    assert.equal(new Set(d.map(x => x.id)).size, 2, 'occurrence ordinal must make ids distinct');
    // Ids come from the real production helper, ordinals 0 and 1.
    assert.deepEqual(
      d.map(x => x.id).sort(),
      [t.migratedDraftId('same text', 100, 0), t.migratedDraftId('same text', 100, 1)].sort(),
      'ids must match the production derivation exactly',
    );
  });

  check('ID-5: a repeated valid id with IDENTICAL content dedups to one record', () => {
    // NOTE: same-id-with-DIFFERENT-content is no longer a silent dedup — it is a
    // fail-closed collision (see VC-*). Only identical content is idempotent.
    const store = makeStorage();
    const { t } = loadModule(store);
    store._map.set(t.keys.history, H([
      { id: 'X', text: 'same content', createdAt: 100, source: 'draft' },
      { id: 'X', text: 'same content', createdAt: 100, source: 'draft' },
    ]));

    assert.equal(t.engine.migrateDraftsFromHistoryOnce(), true);
    const d = draftsOf(store, t);
    assert.equal(d.length, 1, `expected one record for a repeated id, got ${d.length}`);
    assert.equal(d[0].id, 'X');
  });

  check('ID-6: retry after a History-write failure preserves cases 1-4 exactly', () => {
    const scenarios = [
      ['ID-1', [{ id: 'B', text: 'same text', createdAt: 200, source: 'draft' }],
        [{ id: 'A', text: 'same text', createdAt: 100 }], 2],
      ['ID-2', [{ id: 'B', text: 'same text', createdAt: 100, source: 'draft' },
        { id: 'C', text: 'same text', createdAt: 100, source: 'draft' }], null, 2],
      ['ID-3', [{ text: 'same text', createdAt: 100, source: 'draft' },
        { text: 'same text', createdAt: 200, source: 'draft' }], null, 2],
      ['ID-4', [{ text: 'same text', createdAt: 100, source: 'draft' },
        { text: 'same text', createdAt: 100, source: 'draft' }], null, 2],
    ];

    for (const [label, histRows, seedDrafts, expected] of scenarios) {
      const store = makeStorage();
      const first = loadModule(store);
      // Keep a non-draft row so History genuinely changes on success.
      const hist = [{ id: 'h0', text: 'a sent message', createdAt: 1, source: 'send' }, ...histRows];
      store._map.set(first.t.keys.history, H(hist));
      if (seedDrafts) store._map.set(first.t.keys.drafts, H(seedDrafts));
      const historyBefore = store.getItem(first.t.keys.history);

      // Attempt 1: Drafts succeeds, History fails.
      const realSet = store.setItem.bind(store);
      store.setItem = function (k, v) {
        if (k === first.t.keys.history) throw new Error('history write blocked (mock)');
        return realSet(k, v);
      };
      assert.equal(first.t.engine.migrateDraftsFromHistoryOnce(), false, `${label}: attempt 1 must defer`);
      store.setItem = realSet;

      assert.equal(store.getItem(first.t.keys.history), historyBefore,
        `${label}: History must be unchanged after the failed write`);
      assert.equal(store.getItem(first.t.keys.migDrafts), null,
        `${label}: marker must remain unset after failure`);
      assert.equal(draftsOf(store, first.t).length, expected,
        `${label}: attempt 1 must copy every distinct record`);

      // Attempt 2: a later boot over the same storage.
      const { t } = loadModule(store);
      assert.equal(t.engine.migrateDraftsFromHistoryOnce(), true, `${label}: retry must complete`);

      const d = draftsOf(store, t);
      assert.equal(d.length, expected,
        `${label}: retry changed the record count (${d.length} vs ${expected}) — duplicate or loss`);
      assert.equal(new Set(d.map(x => x.id)).size, expected, `${label}: ids must stay distinct`);
      assert.equal(store.getItem(t.keys.migDrafts), '1', `${label}: marker set after successful retry`);
      const remaining = JSON.parse(store.getItem(t.keys.history));
      assert.equal(remaining.length, 1, `${label}: only the sent row remains in History`);
    }
  });

  check('ID-7: the deterministic id helper is stable and discriminating', () => {
    const store = makeStorage();
    const { t } = loadModule(store);
    const a = t.migratedDraftId('hello', 100, 0);
    assert.equal(a, t.migratedDraftId('hello', 100, 0), 'must be stable across calls');
    // A fresh module instance must derive the identical id (no clock/randomness).
    const other = loadModule(makeStorage()).t;
    assert.equal(other.migratedDraftId('hello', 100, 0), a, 'must be stable across module loads');

    assert.notEqual(t.migratedDraftId('hello', 100, 1), a, 'ordinal must change the id');
    assert.notEqual(t.migratedDraftId('hello', 200, 0), a, 'timestamp must change the id');
    assert.notEqual(t.migratedDraftId('hellp', 100, 0), a, 'text must change the id');
    assert.notEqual(t.migratedDraftId('hello world', 100, 0), a, 'longer text must change the id');
    assert.doesNotMatch(a, /undefined|NaN/, 'the id must be well formed');

    // The hash helper itself is exercised directly.
    assert.equal(t.hash32('abc'), t.hash32('abc'), 'hash must be deterministic');
    assert.notEqual(t.hash32('abc'), t.hash32('abd'), 'hash must discriminate');
    assert.match(t.hash32('abc'), /^[0-9a-f]{8}$/, 'hash must be 8 hex chars');
  });

  // ══ FINAL CLOSURE: QUARANTINE EXHAUSTION ══════════════════════════════════
  check('QX: with the base and .2-.50 occupied, nothing is overwritten', () => {
    const FROZEN = 1_700_000_000_000;
    const PKEY = 'h2o:prm:cgx:prmptmngr:state:prompts:v1';
    const store = makeStorage();
    const { t } = loadModule(store, { frozenNow: FROZEN });

    assert.equal(t.quarantineMaxCandidates, 50, 'expected a bound of 50 candidates');

    // Occupy the full candidate space with distinct, recognisable bytes.
    const occupied = new Map();
    const base = `${PKEY}.corrupt.${FROZEN}`;
    occupied.set(base, 'occupant-1');
    for (let n = 2; n <= 50; n += 1) occupied.set(`${base}.${n}`, `occupant-${n}`);
    for (const [k, v] of occupied) store._map.set(k, v);
    assert.equal(occupied.size, 50, 'the candidate space must be fully occupied');

    // A NEW distinct corrupt payload arrives.
    const NEW_PAYLOAD = '{"a brand new corrupt payload":';
    store._map.set(PKEY, NEW_PAYLOAD);

    const out = t.engine.loadPrompts();
    assertEmptyArray(out, 'loader must still return []');

    // Every pre-existing quarantine entry must be byte-identical.
    for (const [k, v] of occupied) {
      assert.equal(store.getItem(k), v, `QUARANTINE OVERWRITTEN at ${k}`);
    }
    // The primary key must be byte-identical.
    assert.equal(store.getItem(PKEY), NEW_PAYLOAD, 'primary key must be untouched');

    // Either stored under a separately verified free key, or failed safely.
    const all = store._keys().filter(k => k.startsWith(`${PKEY}.corrupt.`));
    const extra = all.filter(k => !occupied.has(k));
    if (extra.length) {
      assert.equal(extra.length, 1, 'at most one new quarantine key may be created');
      assert.equal(store.getItem(extra[0]), NEW_PAYLOAD, 'the new key must hold the new payload');
    } else {
      const where = (t.diag.errors || []).map(e => e.where).join(' ');
      assert.match(where, /quarantineExhausted/,
        'exhaustion must be reported diagnostically when nothing could be written');
    }
    assert.equal(t.state.dataError, true, 'dataError must be set');
  });

  check('QX-2: a free slot inside the candidate space is used without overwriting', () => {
    const FROZEN = 1_700_000_000_000;
    const PKEY = 'h2o:prm:cgx:prmptmngr:state:prompts:v1';
    const store = makeStorage();
    const { t } = loadModule(store, { frozenNow: FROZEN });

    const base = `${PKEY}.corrupt.${FROZEN}`;
    const occupied = new Map([[base, 'occupant-1'], [`${base}.2`, 'occupant-2']]);
    for (const [k, v] of occupied) store._map.set(k, v);

    const NEW_PAYLOAD = '{"third distinct payload":';
    store._map.set(PKEY, NEW_PAYLOAD);

    assertEmptyArray(t.engine.loadPrompts(), 'loader must return []');

    for (const [k, v] of occupied) assert.equal(store.getItem(k), v, `overwrote ${k}`);
    assert.equal(store.getItem(`${base}.3`), NEW_PAYLOAD,
      'the first proven-free candidate must be used');
    assert.equal(store.getItem(PKEY), NEW_PAYLOAD, 'primary key untouched');
  });

  check('QX-3: an unreadable candidate aborts without writing anything', () => {
    const FROZEN = 1_700_000_000_000;
    const PKEY = 'h2o:prm:cgx:prmptmngr:state:prompts:v1';
    const store = makeStorage();
    const { t } = loadModule(store, { frozenNow: FROZEN });
    store._map.set(PKEY, '{"corrupt":');

    const before = store._keys().length;
    const realGet = store.getItem.bind(store);
    store.getItem = function (k) {
      if (k.includes('.corrupt.')) throw new Error('candidate read blocked (mock)');
      return realGet(k);
    };
    assertEmptyArray(t.engine.loadPrompts(), 'loader must return []');
    store.getItem = realGet;

    assert.equal(store._keys().length, before, 'no key may be created when a probe fails');
    assert.equal(store.getItem(PKEY), '{"corrupt":', 'primary key untouched');
    const where = (t.diag.errors || []).map(e => e.where).join(' ');
    assert.match(where, /quarantineProbe|quarantineScan/, 'the failed probe must be reported');
  });

  // ══ IDENTITY COLLISION CLOSURE ════════════════════════════════════════════
  // Two length-10 strings whose FNV-1a-32 values collide. Under the old
  // bucket-local ordinal both derived pmmig_100_0_10_5f9d7f26 and the second
  // was discarded as "already migrated".
  const COL_A = '7QjG3tiYE8';
  const COL_B = 'KNjz6XA4ov';

  check('COL-0: the production hash helper really does collide for these strings', () => {
    const store = makeStorage();
    const { t } = loadModule(store);
    assert.equal(t.hash32(COL_A), '5f9d7f26', `unexpected hash for ${COL_A}`);
    assert.equal(t.hash32(COL_B), '5f9d7f26', `unexpected hash for ${COL_B}`);
    assert.equal(COL_A.length, COL_B.length, 'the collision needs equal lengths');
    // Same length + same hash + same timestamp: only the ordinal can separate them.
    assert.equal(t.migratedDraftId(COL_A, 100, 0), t.migratedDraftId(COL_B, 100, 0),
      'ordinal 0 for both must be identical — that is the defect being closed');
    assert.notEqual(t.migratedDraftId(COL_A, 100, 0), t.migratedDraftId(COL_B, 100, 1),
      'distinct ordinals must separate them');
  });

  check('COL-1: hash-colliding idless drafts both migrate with distinct ids', () => {
    const store = makeStorage();
    const { t } = loadModule(store);
    store._map.set(t.keys.history, H([
      { text: COL_A, createdAt: 100, source: 'draft' },
      { text: COL_B, createdAt: 100, source: 'draft' },
    ]));

    assert.equal(t.engine.migrateDraftsFromHistoryOnce(), true);
    const d = draftsOf(store, t);
    assert.equal(d.length, 2, `RECORD LOST to a hash collision: got ${d.length}`);
    assert.equal(new Set(d.map(x => x.id)).size, 2, 'generated ids must be distinct');
    assert.deepEqual(d.map(x => x.text).sort(), [COL_A, COL_B].sort(), 'both texts must survive');
    // History is emptied only because both rows were preserved.
    assert.deepEqual(JSON.parse(store.getItem(t.keys.history)), [], 'History empties after both are kept');
  });

  check('COL-2/3: an unrelated draft occupying the base id is preserved; source takes a suffix', () => {
    const store = makeStorage();
    const { t } = loadModule(store);
    // The id the source row will generate, occupied by a DIFFERENT record.
    const base = t.migratedDraftId(COL_A, 100, 0);
    store._map.set(t.keys.drafts, H([{ id: base, text: 'totally different', createdAt: 999 }]));
    store._map.set(t.keys.history, H([{ text: COL_A, createdAt: 100, source: 'draft' }]));

    assert.equal(t.engine.migrateDraftsFromHistoryOnce(), true);
    const d = draftsOf(store, t);
    assert.equal(d.length, 2, `expected the existing record plus the migrated one, got ${d.length}`);

    const kept = d.find(x => x.id === base);
    assert.ok(kept, 'the pre-existing record must keep its id');
    assert.equal(kept.text, 'totally different', 'the pre-existing record must be untouched');
    assert.equal(kept.createdAt, 999);

    const migrated = d.find(x => x.id !== base);
    assert.equal(migrated.text, COL_A, 'the source row must be migrated');
    assert.equal(migrated.id, `${base}.2`, 'it must take the first deterministic free suffix');
  });

  check('COL-4/5: retry after a History-write failure reuses the same base/suffix choices', () => {
    const scenarios = [
      ['collision pair', [
        { text: COL_A, createdAt: 100, source: 'draft' },
        { text: COL_B, createdAt: 100, source: 'draft' },
      ], null, 2],
      ['occupied base', [{ text: COL_A, createdAt: 100, source: 'draft' }],
        (t) => [{ id: t.migratedDraftId(COL_A, 100, 0), text: 'totally different', createdAt: 999 }], 2],
    ];

    for (const [label, histRows, seed, expected] of scenarios) {
      const store = makeStorage();
      const first = loadModule(store);
      const hist = [{ id: 'h0', text: 'a sent message', createdAt: 1, source: 'send' }, ...histRows];
      store._map.set(first.t.keys.history, H(hist));
      if (seed) store._map.set(first.t.keys.drafts, H(seed(first.t)));
      const historyBefore = store.getItem(first.t.keys.history);

      const realSet = store.setItem.bind(store);
      store.setItem = function (k, v) {
        if (k === first.t.keys.history) throw new Error('history write blocked (mock)');
        return realSet(k, v);
      };
      assert.equal(first.t.engine.migrateDraftsFromHistoryOnce(), false, `${label}: attempt 1 defers`);
      store.setItem = realSet;

      assert.equal(store.getItem(first.t.keys.history), historyBefore, `${label}: History unchanged`);
      assert.equal(store.getItem(first.t.keys.migDrafts), null, `${label}: marker unset after failure`);
      const afterFirst = draftsOf(store, first.t);
      assert.equal(afterFirst.length, expected, `${label}: attempt 1 must copy every distinct record`);
      const idsFirst = afterFirst.map(x => x.id).sort();

      // Retry from a fresh module instance.
      const { t } = loadModule(store);
      assert.equal(t.engine.migrateDraftsFromHistoryOnce(), true, `${label}: retry completes`);
      const afterRetry = draftsOf(store, t);
      assert.equal(afterRetry.length, expected,
        `${label}: retry changed the count (${afterRetry.length} vs ${expected})`);
      assert.deepEqual(afterRetry.map(x => x.id).sort(), idsFirst,
        `${label}: retry must reuse the identical base/suffix choices`);
      assert.equal(store.getItem(t.keys.migDrafts), '1', `${label}: marker set after successful retry`);
      assert.equal(JSON.parse(store.getItem(t.keys.history)).length, 1, `${label}: only the sent row remains`);
    }
  });

  check('COL-6/7: exhausting the candidate space fails safely, writing nothing', () => {
    const store = makeStorage();
    const { t } = loadModule(store);

    // Occupy the base id and EVERY permitted suffix with different records.
    const base = t.migratedDraftId(COL_A, 100, 0);
    const max = 50 + 1; // CFG_PM.DRAFTS_MAX + 1
    const occupants = [{ id: base, text: 'occupant-1', createdAt: 900 }];
    for (let n = 2; n <= max; n += 1) {
      occupants.push({ id: `${base}.${n}`, text: `occupant-${n}`, createdAt: 900 + n });
    }
    const draftsBefore = H(occupants);
    const historyBefore = H([
      { id: 'h0', text: 'a sent message', createdAt: 1, source: 'send' },
      { text: COL_A, createdAt: 100, source: 'draft' },
    ]);
    store._map.set(t.keys.drafts, draftsBefore);
    store._map.set(t.keys.history, historyBefore);

    const ok = t.engine.migrateDraftsFromHistoryOnce();

    assert.equal(ok, false, 'migration must return false');
    assert.equal(store.getItem(t.keys.history), historyBefore,
      'HISTORY MUTATED — it must be byte-identical on exhaustion');
    assert.equal(store.getItem(t.keys.drafts), draftsBefore,
      'DRAFTS MUTATED — it must be byte-identical on exhaustion');
    assert.equal(store.getItem(t.keys.migDrafts), null, 'marker must remain unset');
    assert.equal(t.state.dataError, true, 'dataError must be set');
    const where = (t.diag.errors || []).map(e => e.where).join(' ');
    assert.match(where, /identityExhausted/, 'exhaustion must be reported diagnostically');
  });

  check('COL-8: a matching occupant IS a retry copy; a mismatching one is not', () => {
    // Matching content under the base id → recognised, no duplicate.
    const store = makeStorage();
    const { t } = loadModule(store);
    const base = t.migratedDraftId(COL_A, 100, 0);
    store._map.set(t.keys.drafts, H([{ id: base, text: COL_A, createdAt: 100 }]));
    store._map.set(t.keys.history, H([{ text: COL_A, createdAt: 100, source: 'draft' }]));

    assert.equal(t.engine.migrateDraftsFromHistoryOnce(), true);
    const d = draftsOf(store, t);
    assert.equal(d.length, 1, 'a matching occupant must be recognised as the retry copy');
    assert.equal(d[0].id, base);

    // Same text but a DIFFERENT timestamp → not a retry copy, must not collapse.
    const store2 = makeStorage();
    const m2 = loadModule(store2);
    const base2 = m2.t.migratedDraftId(COL_A, 100, 0);
    store2._map.set(m2.t.keys.drafts, H([{ id: base2, text: COL_A, createdAt: 555 }]));
    store2._map.set(m2.t.keys.history, H([{ text: COL_A, createdAt: 100, source: 'draft' }]));

    assert.equal(m2.t.engine.migrateDraftsFromHistoryOnce(), true);
    const d2 = draftsOf(store2, m2.t);
    assert.equal(d2.length, 2, 'a timestamp mismatch means a different record — both must survive');
    assert.equal(d2.find(x => x.id === base2).createdAt, 555, 'the occupant is untouched');
    assert.equal(d2.find(x => x.id === `${base2}.2`).createdAt, 100, 'the source takes a free suffix');
  });

  check('COL-9: the global ordinal advances per idless row, not per text bucket', () => {
    const store = makeStorage();
    const { t } = loadModule(store);
    store._map.set(t.keys.history, H([
      { text: 'alpha', createdAt: 100, source: 'draft' },
      { text: 'beta', createdAt: 100, source: 'draft' },
      { text: 'alpha', createdAt: 100, source: 'draft' },
    ]));

    assert.equal(t.engine.migrateDraftsFromHistoryOnce(), true);
    const d = draftsOf(store, t);
    assert.equal(d.length, 3, 'all three rows must migrate');
    assert.deepEqual(d.map(x => x.id), [
      t.migratedDraftId('alpha', 100, 0),
      t.migratedDraftId('beta', 100, 1),   // ordinal 1, NOT 0 — global counter
      t.migratedDraftId('alpha', 100, 2),
    ], 'ids must follow one global source-order ordinal');
  });

  // ══ MISSING-CREATEDAT CLOSURE ═════════════════════════════════════════════
  // A source row with no usable createdAt normalizes to 0. The retry test used
  // to skip the timestamp comparison in that case, so an UNRELATED draft on the
  // generated id with the same text was accepted as the retry copy and the
  // source row was dropped from History. The sentinel makes the stored value
  // deterministic so the comparison can always run.
  const MT_TEXT = 'a draft with no timestamp';

  check('MT-0: the sentinel is a reserved, JSON-safe, loadDrafts-proof value', () => {
    const store = makeStorage();
    const { t } = loadModule(store);
    const S = t.migUnknownCreatedAt;
    assert.equal(typeof S, 'number', 'the sentinel must be exposed as a number');
    assert.ok(S < 0, `the sentinel must be negative (reserved), got ${S}`);
    assert.ok(S, 'the sentinel must be truthy so loadDrafts() cannot replace it');
    assert.equal(JSON.parse(JSON.stringify({ c: S })).c, S, 'must survive JSON round-trip');
    // Production normalization: Number(x) || UTIL_now() must leave it alone.
    assert.equal(Number(S) || 'REPLACED', S, 'loadDrafts() normalization must not replace it');
  });

  check('MT-1: unrelated same-text occupant is preserved; source takes .2', () => {
    const store = makeStorage();
    const { t } = loadModule(store);
    const base = t.migratedDraftId(MT_TEXT, 0, 0); // missing ts contributes 0 to the id
    store._map.set(t.keys.drafts, H([{ id: base, text: MT_TEXT, createdAt: 999 }]));
    store._map.set(t.keys.history, H([{ text: MT_TEXT, source: 'draft' }])); // no id, no createdAt

    assert.equal(t.engine.migrateDraftsFromHistoryOnce(), true);
    const d = draftsOf(store, t);
    assert.equal(d.length, 2, `RECORD LOST: expected occupant + migrated, got ${d.length}`);

    const kept = d.find(x => x.id === base);
    assert.ok(kept, 'the unrelated occupant must keep its id');
    assert.equal(kept.createdAt, 999, 'the occupant must be untouched');

    const migrated = d.find(x => x.id === `${base}.2`);
    assert.ok(migrated, 'the source must migrate under the first free deterministic suffix');
    assert.equal(migrated.text, MT_TEXT);
    assert.equal(migrated.createdAt, t.migUnknownCreatedAt, 'must carry the sentinel');

    // History is emptied only because both records are safely represented.
    assert.deepEqual(JSON.parse(store.getItem(t.keys.history)), []);
  });

  check('MT-2: an occupant carrying the sentinel IS the retry copy (no duplicate)', () => {
    const store = makeStorage();
    const { t } = loadModule(store);
    const base = t.migratedDraftId(MT_TEXT, 0, 0);
    store._map.set(t.keys.drafts, H([{ id: base, text: MT_TEXT, createdAt: t.migUnknownCreatedAt }]));
    store._map.set(t.keys.history, H([{ text: MT_TEXT, source: 'draft' }]));

    assert.equal(t.engine.migrateDraftsFromHistoryOnce(), true);
    const d = draftsOf(store, t);
    assert.equal(d.length, 1, `DUPLICATE: expected the retry copy to be recognised, got ${d.length}`);
    assert.equal(d[0].id, base);
    assert.equal(d[0].createdAt, t.migUnknownCreatedAt);
  });

  check('MT-3: partial failure + real loadDrafts() + fresh retry stays stable', () => {
    const store = makeStorage();
    const first = loadModule(store);
    const hist = [
      { id: 'h0', text: 'a sent message', createdAt: 1, source: 'send' },
      { text: MT_TEXT, source: 'draft' }, // no id, no createdAt
    ];
    store._map.set(first.t.keys.history, H(hist));
    const historyBefore = store.getItem(first.t.keys.history);

    // Attempt 1: Drafts succeeds, History fails.
    const realSet = store.setItem.bind(store);
    store.setItem = function (k, v) {
      if (k === first.t.keys.history) throw new Error('history write blocked (mock)');
      return realSet(k, v);
    };
    assert.equal(first.t.engine.migrateDraftsFromHistoryOnce(), false, 'attempt 1 must defer');
    store.setItem = realSet;

    assert.equal(store.getItem(first.t.keys.history), historyBefore, 'History must be unchanged');
    assert.equal(store.getItem(first.t.keys.migDrafts), null, 'marker unset after failure');
    const afterFirst = draftsOf(store, first.t);
    assert.equal(afterFirst.length, 1, 'the row must have been copied');
    const idFirst = afterFirst[0].id;
    assert.equal(afterFirst[0].createdAt, first.t.migUnknownCreatedAt, 'sentinel stored');

    // Simulate later boot activity: the REAL production loadDrafts() runs and
    // normalizes/rewrites the store. The sentinel must survive that.
    const loaded = first.t.engine.loadDrafts();
    assert.equal(loaded.length, 1, 'loadDrafts must return the record');
    assert.equal(loaded[0].createdAt, first.t.migUnknownCreatedAt,
      'SENTINEL DESTROYED by loadDrafts() normalization');
    assert.equal(JSON.parse(store.getItem(first.t.keys.drafts))[0].createdAt,
      first.t.migUnknownCreatedAt, 'the stored value must still be the sentinel');

    // Retry from a fresh module instance.
    const { t } = loadModule(store);
    assert.equal(t.engine.migrateDraftsFromHistoryOnce(), true, 'retry must complete');
    const d = draftsOf(store, t);
    assert.equal(d.length, 1, `DUPLICATE on retry: got ${d.length}`);
    assert.equal(d[0].id, idFirst, 'the id and suffix choice must be identical');
    assert.equal(d[0].createdAt, t.migUnknownCreatedAt, 'sentinel preserved');
    assert.equal(store.getItem(t.keys.migDrafts), '1', 'marker set after successful retry');
    assert.equal(JSON.parse(store.getItem(t.keys.history)).length, 1, 'only the sent row remains');
  });

  check('MT-4: every missing-timestamp shape uses the sentinel and is retry-safe', () => {
    const variants = [
      ['field absent', { text: MT_TEXT, source: 'draft' }],
      ['null', { text: MT_TEXT, createdAt: null, source: 'draft' }],
      ['empty string', { text: MT_TEXT, createdAt: '', source: 'draft' }],
      ['non-numeric string', { text: MT_TEXT, createdAt: 'not-a-number', source: 'draft' }],
    ];

    for (const [label, row] of variants) {
      const store = makeStorage();
      const { t } = loadModule(store);
      store._map.set(t.keys.history, H([row]));

      assert.equal(t.engine.migrateDraftsFromHistoryOnce(), true, `${label}: must migrate`);
      const d = draftsOf(store, t);
      assert.equal(d.length, 1, `${label}: expected one record`);
      assert.equal(d[0].createdAt, t.migUnknownCreatedAt,
        `${label}: must store the sentinel, got ${d[0].createdAt}`);
      assert.equal(d[0].id, t.migratedDraftId(MT_TEXT, 0, 0),
        `${label}: the id must derive from normalized source ts 0`);

      // Retry-safe: re-running over the same Drafts must not duplicate.
      store._map.delete(t.keys.migDrafts);
      store._map.set(t.keys.history, H([row]));
      const again = loadModule(store);
      assert.equal(again.t.engine.migrateDraftsFromHistoryOnce(), true, `${label}: retry completes`);
      assert.equal(draftsOf(store, again.t).length, 1, `${label}: retry must not duplicate`);
    }
  });

  check('MT-5: a valid numeric timestamp is unaffected', () => {
    const store = makeStorage();
    const { t } = loadModule(store);
    store._map.set(t.keys.history, H([{ text: MT_TEXT, createdAt: 100, source: 'draft' }]));

    assert.equal(t.engine.migrateDraftsFromHistoryOnce(), true);
    const d = draftsOf(store, t);
    assert.equal(d.length, 1);
    assert.equal(d[0].createdAt, 100, 'a real timestamp must be stored verbatim');
    assert.notEqual(d[0].createdAt, t.migUnknownCreatedAt, 'must not be replaced by the sentinel');
    assert.equal(d[0].id, t.migratedDraftId(MT_TEXT, 100, 0), 'id derives from the real timestamp');

    // Suffix behaviour for a real timestamp is unchanged: a same-text occupant
    // with a DIFFERENT timestamp is a collision, not a retry copy.
    const store2 = makeStorage();
    const m2 = loadModule(store2);
    const base2 = m2.t.migratedDraftId(MT_TEXT, 100, 0);
    store2._map.set(m2.t.keys.drafts, H([{ id: base2, text: MT_TEXT, createdAt: 555 }]));
    store2._map.set(m2.t.keys.history, H([{ text: MT_TEXT, createdAt: 100, source: 'draft' }]));
    assert.equal(m2.t.engine.migrateDraftsFromHistoryOnce(), true);
    const d2 = draftsOf(store2, m2.t);
    assert.equal(d2.length, 2, 'a timestamp mismatch must remain a collision');
    assert.equal(d2.find(x => x.id === `${base2}.2`).createdAt, 100);
  });

  check('MT-6: a valid-id row with no timestamp also stores the sentinel', () => {
    const store = makeStorage();
    const { t } = loadModule(store);
    store._map.set(t.keys.history, H([{ id: 'X', text: MT_TEXT, source: 'draft' }]));

    assert.equal(t.engine.migrateDraftsFromHistoryOnce(), true);
    const d = draftsOf(store, t);
    assert.equal(d.length, 1);
    assert.equal(d[0].id, 'X', 'a valid source id stays authoritative');
    assert.equal(d[0].createdAt, t.migUnknownCreatedAt,
      'the valid-id record shape must also use the deterministic sentinel');
  });

  // ══ DEFERRED-HISTORY CLOSURE ══════════════════════════════════════════════
  // While the drafts migration is deferred, a source:'draft' row in History is
  // the ONLY copy. Ordinary History operations must not destroy it.
  const DRAFT_TEXT = 'an unsent draft still pending migration';
  const histOf = (store, t) => JSON.parse(store.getItem(t.keys.history) || '[]');
  const srcOf = (rows) => rows.map(r => String(r?.source || '').toLowerCase());

  check('DH-1: Drafts write failure leaves History bytes and marker untouched', () => {
    const store = makeStorage();
    const { t } = loadModule(store);
    const before = H([
      { id: 'h0', text: 'a sent message', createdAt: 100, source: 'send' },
      { id: 'd0', text: DRAFT_TEXT, createdAt: 200, source: 'draft' },
    ]);
    store._map.set(t.keys.history, before);
    store.failWrites = true;

    assert.equal(t.engine.migrateDraftsFromHistoryOnce(), false, 'migration must defer');
    assert.equal(store.getItem(t.keys.history), before, 'History bytes must be untouched');
    assert.equal(store.getItem(t.keys.migDrafts), null, 'marker must remain unset');
  });

  check('DH-2: real loadHistory() after deferral preserves the draft row', () => {
    const store = makeStorage();
    const { t } = loadModule(store);
    const before = H([
      { id: 'h0', text: 'a sent message', createdAt: 100, source: 'send' },
      { id: 'd0', text: DRAFT_TEXT, createdAt: 200, source: 'draft' },
    ]);
    store._map.set(t.keys.history, before);
    store.failWrites = true;
    t.engine.migrateDraftsFromHistoryOnce();
    store.failWrites = false;

    const loaded = t.engine.loadHistory();
    assert.equal(loaded.length, 2, `DRAFT DROPPED from the returned collection: got ${loaded.length}`);
    const draft = loaded.find(h => h.id === 'd0');
    assert.ok(draft, 'the draft row must be in the returned collection');
    assert.equal(String(draft.source).toLowerCase(), 'draft',
      'the draft row must NOT be normalized to "send"');

    const stored = histOf(store, t);
    assert.ok(stored.some(h => h.id === 'd0'), 'DRAFT DESTROYED in storage by a normalization write');
    assert.deepEqual(srcOf(stored).sort(), ['draft', 'send'], 'both sources must persist');

    // The sent-only view is display-only and must not be what gets written back.
    const sentOnly = t.engine.loadHistorySent();
    assert.equal(sentOnly.length, 1, 'the display view must hide pending drafts');
    assert.equal(sentOnly[0].id, 'h0');
    assert.ok(histOf(store, t).some(h => h.id === 'd0'),
      'reading the display view must not remove the draft from storage');
  });

  check('DH-3: real pushHistory() after deferral keeps the draft and adds the sent row', () => {
    const store = makeStorage();
    const { t } = loadModule(store);
    store._map.set(t.keys.history, H([
      { id: 'h0', text: 'a sent message', createdAt: 100, source: 'send' },
      { id: 'd0', text: DRAFT_TEXT, createdAt: 200, source: 'draft' },
    ]));
    store.failWrites = true;
    t.engine.migrateDraftsFromHistoryOnce();
    store.failWrites = false;

    assert.equal(t.engine.pushHistory('new sent text'), true, 'the sent capture must succeed');
    const stored = histOf(store, t);
    assert.ok(stored.some(h => h.id === 'd0'), 'DRAFT LOST by pushHistory');
    assert.ok(stored.some(h => h.text === 'new sent text'), 'the new sent row must be added');
    const draft = stored.find(h => h.id === 'd0');
    assert.equal(String(draft.source).toLowerCase(), 'draft', 'the draft source must be preserved');
    const added = stored.find(h => h.text === 'new sent text');
    assert.equal(String(added.source).toLowerCase(), 'send', 'the new row must be a sent record');
  });

  check('DH-4: deleting a visible sent record through the save path keeps the draft', () => {
    const store = makeStorage();
    const { t } = loadModule(store);
    store._map.set(t.keys.history, H([
      { id: 'h0', text: 'a sent message', createdAt: 100, source: 'send' },
      { id: 'd0', text: DRAFT_TEXT, createdAt: 200, source: 'draft' },
      { id: 'h1', text: 'another sent message', createdAt: 300, source: 'send' },
    ]));
    store.failWrites = true;
    t.engine.migrateDraftsFromHistoryOnce();
    store.failWrites = false;

    // Exactly what the UI delete handler does: full collection in, only the
    // selected visible id removed, full collection saved.
    const full = t.engine.loadHistory();
    const next = full.filter(h => h.id !== 'h0');
    assert.equal(t.engine.saveHistory(next), true);

    const stored = histOf(store, t);
    assert.equal(stored.some(h => h.id === 'h0'), false, 'the selected sent record must be removed');
    assert.ok(stored.some(h => h.id === 'h1'), 'the other sent record must remain');
    assert.ok(stored.some(h => h.id === 'd0'), 'DRAFT LOST by the delete save path');
  });

  check('DH-5: retry after writes recover copies the draft once, then clears History', () => {
    const store = makeStorage();
    const first = loadModule(store);
    store._map.set(first.t.keys.history, H([
      { id: 'h0', text: 'a sent message', createdAt: 100, source: 'send' },
      { id: 'd0', text: DRAFT_TEXT, createdAt: 200, source: 'draft' },
    ]));
    store.failWrites = true;
    assert.equal(first.t.engine.migrateDraftsFromHistoryOnce(), false, 'attempt 1 defers');
    store.failWrites = false;

    // Ordinary activity between attempts.
    first.t.engine.loadHistory();
    first.t.engine.pushHistory('interleaved send');

    const { t } = loadModule(store);
    assert.equal(t.engine.migrateDraftsFromHistoryOnce(), true, 'retry must complete');

    const drafts = draftsOf(store, t);
    assert.equal(drafts.length, 1, `draft copied ${drafts.length} times, expected exactly 1`);
    assert.equal(drafts[0].id, 'd0', 'the valid source id stays authoritative');
    assert.equal(drafts[0].text, DRAFT_TEXT);

    const stored = histOf(store, t);
    assert.equal(stored.some(h => h.id === 'd0'), false,
      'the draft row is removed from History only after Drafts persistence succeeded');
    assert.equal(store.getItem(t.keys.migDrafts), '1', 'marker set');
    assert.ok(stored.some(h => h.text === 'interleaved send'), 'interleaved sent row survives');
  });

  check('DH-6: with the marker complete, a stale draft row may be cleaned', () => {
    const store = makeStorage();
    const { t } = loadModule(store);
    store._map.set(t.keys.migDrafts, '1'); // migration already complete
    store._map.set(t.keys.drafts, H([{ id: 'd0', text: DRAFT_TEXT, createdAt: 200 }]));
    store._map.set(t.keys.history, H([
      { id: 'h0', text: 'a sent message', createdAt: 100, source: 'send' },
      { id: 'd0', text: DRAFT_TEXT, createdAt: 200, source: 'draft' }, // stale
    ]));

    const loaded = t.engine.loadHistory();
    assert.equal(loaded.length, 1, 'a stale draft row is cleaned once migration is proven complete');
    assert.equal(loaded[0].id, 'h0');
    assert.equal(histOf(store, t).some(h => h.id === 'd0'), false, 'stale row removed from storage');
    assert.equal(draftsOf(store, t).length, 1, 'the Drafts copy is unaffected');
  });

  check('DH-7: sent dedup examines the most recent SENT record, not a trailing draft', () => {
    const store = makeStorage();
    const { t } = loadModule(store);
    // A pending draft sits AFTER the last sent row.
    store._map.set(t.keys.history, H([
      { id: 'h0', text: 'hello', createdAt: 100, source: 'send' },
      { id: 'd0', text: 'a pending draft', createdAt: 200, source: 'draft' },
    ]));
    store.failWrites = true;
    t.engine.migrateDraftsFromHistoryOnce();
    store.failWrites = false;

    // Duplicate of the most recent SENT row must be suppressed...
    assert.equal(t.engine.pushHistory('hello'), true);
    assert.equal(histOf(store, t).filter(h => h.text === 'hello').length, 1,
      'a duplicate of the last sent record must not be appended');

    // ...while text matching the trailing DRAFT must still be captured.
    assert.equal(t.engine.pushHistory('a pending draft'), true);
    const stored = histOf(store, t);
    const sent = stored.filter(h => String(h.source).toLowerCase() === 'send');
    assert.ok(sent.some(h => h.text === 'a pending draft'),
      'a draft must not suppress a genuine send with the same text');
    assert.ok(stored.some(h => h.id === 'd0'), 'the pending draft still survives');
  });

  // ══ FINITE-TIMESTAMP CLOSURE ══════════════════════════════════════════════
  check('FT-3: the real normalizer maps every non-finite value to 0', () => {
    const store = makeStorage();
    const { t } = loadModule(store);
    for (const [label, v] of [
      ['numeric Infinity', Infinity], ['numeric -Infinity', -Infinity], ['NaN', NaN],
      ['"Infinity"', 'Infinity'], ['"-Infinity"', '-Infinity'], ['"NaN"', 'NaN'],
      ['"abc"', 'abc'], ['undefined', undefined], ['null', null], ['""', ''], ['{}', {}],
    ]) {
      assert.equal(t.normDraftTs(v), 0, `${label} must normalize to 0, got ${t.normDraftTs(v)}`);
    }
  });

  check('FT-4: finite timestamps pass through unchanged', () => {
    const store = makeStorage();
    const { t } = loadModule(store);
    for (const v of [100, 1, 1.5, -7, 1700000000000, 0.25]) {
      assert.equal(t.normDraftTs(v), v, `${v} must be preserved`);
    }
    assert.equal(t.normDraftTs('100'), 100, 'a numeric string must be coerced');
    assert.equal(t.normDraftTs(0), 0, 'zero stays zero (resolved to the sentinel by the caller)');
  });

  for (const [label, raw] of [['FT-1', 'Infinity'], ['FT-2', '-Infinity']]) {
    check(`${label}: createdAt ${JSON.stringify(raw)} uses the sentinel and retries cleanly`, () => {
      const store = makeStorage();
      const first = loadModule(store);
      const TEXT = `draft with ${raw} timestamp`;
      const hist = [
        { id: 'h0', text: 'a sent message', createdAt: 1, source: 'send' },
        { text: TEXT, createdAt: raw, source: 'draft' }, // idless
      ];
      store._map.set(first.t.keys.history, H(hist));

      // Attempt 1: Drafts succeeds, History fails.
      const realSet = store.setItem.bind(store);
      store.setItem = function (k, v) {
        if (k === first.t.keys.history) throw new Error('history write blocked (mock)');
        return realSet(k, v);
      };
      assert.equal(first.t.engine.migrateDraftsFromHistoryOnce(), false, 'attempt 1 defers');
      store.setItem = realSet;

      const afterFirst = draftsOf(store, first.t);
      assert.equal(afterFirst.length, 1, 'the row must be copied once');
      assert.equal(afterFirst[0].createdAt, first.t.migUnknownCreatedAt,
        `non-finite timestamp must resolve to the sentinel, got ${afterFirst[0].createdAt}`);
      const idFirst = afterFirst[0].id;

      // Fresh retry must recognise the copy — no duplicate suffix.
      const { t } = loadModule(store);
      assert.equal(t.engine.migrateDraftsFromHistoryOnce(), true, 'retry completes');
      const after = draftsOf(store, t);
      assert.equal(after.length, 1, `DUPLICATE on retry: got ${after.length}`);
      assert.equal(after[0].id, idFirst, 'the id must be identical across attempts');
      assert.equal(store.getItem(t.keys.migDrafts), '1', 'marker set after successful retry');
    });
  }

  check('FT-5: every persisted migrated record carries a finite numeric createdAt', () => {
    const store = makeStorage();
    const { t } = loadModule(store);
    store._map.set(t.keys.history, H([
      { text: 'inf', createdAt: 'Infinity', source: 'draft' },
      { text: 'neginf', createdAt: '-Infinity', source: 'draft' },
      { text: 'nan', createdAt: 'NaN', source: 'draft' },
      { text: 'absent', source: 'draft' },
      { text: 'good', createdAt: 100, source: 'draft' },
      { id: 'V', text: 'valid id no ts', source: 'draft' },
    ]));

    assert.equal(t.engine.migrateDraftsFromHistoryOnce(), true);
    const raw = store.getItem(t.keys.drafts);
    assert.doesNotMatch(raw, /Infinity|NaN/, 'the persisted JSON must contain no non-finite tokens');
    assert.doesNotMatch(raw, /"createdAt":null/, 'a non-finite value must never serialize to null');

    for (const d of JSON.parse(raw)) {
      assert.equal(typeof d.createdAt, 'number', `${d.text}: createdAt must be a number`);
      assert.ok(Number.isFinite(d.createdAt), `${d.text}: createdAt must be finite, got ${d.createdAt}`);
    }
    const byText = Object.fromEntries(JSON.parse(raw).map(d => [d.text, d.createdAt]));
    assert.equal(byText.good, 100, 'a valid timestamp survives verbatim');
    for (const k of ['inf', 'neginf', 'nan', 'absent', 'valid id no ts']) {
      assert.equal(byText[k], t.migUnknownCreatedAt, `${k} must carry the sentinel`);
    }
  });

  // ══ CORRECTION 1: MALFORMED CAPTURE STORES FAIL CLOSED ════════════════════
  const CAPTURE = [
    ['History', (t) => t.keys.history, (t, s) => t.engine.pushHistory(s), 'new sent text'],
    ['Drafts', (t) => t.keys.drafts, (t, s) => t.engine.pushDraft(s), 'new draft text'],
    ['Pasted', (t) => t.keys.pasted, (t, s) => t.engine.pushPasted(s), 'new pasted text'],
  ];
  const MALFORMED = [['malformed JSON', '{"broken": [1,2,'], ['parsed non-array', '{"not":"an array"}']];

  for (const [label, keyOf, push, sample] of CAPTURE) {
    for (const [shape, raw] of MALFORMED) {
      check(`CS-${label}/${shape}: capture aborts, bytes preserved, one quarantine copy`, () => {
        const store = makeStorage();
        const { t } = loadModule(store);
        const key = keyOf(t);
        store._map.set(key, raw);

        assert.equal(push(t, sample), false, 'the capture must report failure');
        assert.equal(store.getItem(key), raw,
          `PRIMARY BYTES REPLACED for ${label} — a corrupt value must never be overwritten`);
        const q = store._keys().filter(k => k.startsWith(`${key}.corrupt.`));
        assert.equal(q.length, 1, `expected exactly one quarantine copy, got ${q.length}`);
        assert.equal(store.getItem(q[0]), raw, 'the quarantine copy must be byte-identical');
        assert.equal(t.state.dataError, true, 'dataError must be set');
        assert.ok(t.diag.counters.corruptReads >= 1, 'corruptReads must increment');
        const where = (t.diag.errors || []).map(e => e.where).join(' ');
        assert.match(where, /corruptRead/, 'a diagnostic must be recorded');
      });
    }
  }

  check('CS-7: repeated attempts never create duplicate quarantine copies', () => {
    const raw = '{"broken": [1,2,';
    const store = makeStorage();
    const { t } = loadModule(store);
    store._map.set(t.keys.history, raw);

    for (let i = 0; i < 4; i += 1) {
      assert.equal(t.engine.pushHistory(`attempt ${i}`), false, `attempt ${i} must fail`);
    }
    // A fresh module (later boot) over the same unchanged storage.
    const again = loadModule(store);
    assert.equal(again.t.engine.pushHistory('later boot'), false);

    const q = store._keys().filter(k => k.startsWith(`${t.keys.history}.corrupt.`));
    assert.equal(q.length, 1, `quarantine copies multiplied: ${q.length}`);
    assert.equal(store.getItem(t.keys.history), raw, 'primary bytes still intact');
  });

  check('CS-8: after a valid array is restored, the next capture succeeds', () => {
    const store = makeStorage();
    const { t } = loadModule(store);
    store._map.set(t.keys.history, '{"broken": [1,2,');
    assert.equal(t.engine.pushHistory('blocked'), false, 'capture blocked while corrupt');

    // Owner (or recovery tooling) restores a valid collection.
    store._map.set(t.keys.history, H([{ id: 'h0', text: 'restored', createdAt: 100, source: 'send' }]));
    const fresh = loadModule(store);
    assert.equal(fresh.t.engine.pushHistory('now works'), true, 'capture must resume');
    const stored = JSON.parse(store.getItem(t.keys.history));
    assert.equal(stored.length, 2, 'the restored row and the new capture must both be present');
    assert.ok(stored.some(h => h.text === 'now works'));
  });

  check('CS-9: a failed normalization write is reported and blocks the mutation', () => {
    const store = makeStorage();
    const { t } = loadModule(store);
    // A row needing normalization (missing id) so `changed` becomes true.
    store._map.set(t.keys.history, H([{ text: 'needs an id', createdAt: 100, source: 'send' }]));
    store.failWrites = true;

    const rd = t.engine.loadHistoryStrict();
    assert.equal(rd.ok, false, 'a failed normalization write must report !ok');
    assert.ok(t.diag.counters.writeFailures >= 1, 'the write failure must be counted');
    assert.equal(t.state.dataError, true, 'dataError must be set');

    // A mutation must not proceed as though the normalized state were persisted.
    assert.equal(t.engine.pushHistory('should not proceed'), false,
      'the mutation must abort when the read is not authoritative');
  });

  check('CS-10: strict readers expose the { ok, list } contract for all three stores', () => {
    const store = makeStorage();
    const { t } = loadModule(store);
    for (const [label, fn, key] of [
      ['History', () => t.engine.loadHistoryStrict(), t.keys.history],
      ['Drafts', () => t.engine.loadDraftsStrict(), t.keys.drafts],
      ['Pasted', () => t.engine.loadPastedStrict(), t.keys.pasted],
    ]) {
      const absent = fn();
      assert.equal(absent.ok, true, `${label}: an absent key is ok`);
      assertEmptyArray(absent.list, `${label}: an absent key yields []`);

      store._map.set(key, '{"broken":');
      const corrupt = fn();
      assert.equal(corrupt.ok, false, `${label}: corrupt must report !ok`);
      assertEmptyArray(corrupt.list, `${label}: corrupt yields an empty list`);
      store._map.delete(key);
    }
  });

  // ══ CORRECTION 2: VALID-ID MIGRATION COLLISION FAILS CLOSED ═══════════════
  check('VC-10: existing Draft and source share an id but differ in text → fail closed', () => {
    const store = makeStorage();
    const { t } = loadModule(store);
    const draftsBefore = H([{ id: 'X', text: 'existing text', createdAt: 100 }]);
    const histBefore = H([
      { id: 'h0', text: 'a sent message', createdAt: 1, source: 'send' },
      { id: 'X', text: 'DIFFERENT text', createdAt: 100, source: 'draft' },
    ]);
    store._map.set(t.keys.drafts, draftsBefore);
    store._map.set(t.keys.history, histBefore);

    assert.equal(t.engine.migrateDraftsFromHistoryOnce(), false, 'migration must fail closed');
    assert.equal(store.getItem(t.keys.drafts), draftsBefore, 'Drafts bytes must be unchanged');
    assert.equal(store.getItem(t.keys.history), histBefore, 'History bytes must be unchanged');
    assert.equal(store.getItem(t.keys.migDrafts), null, 'marker must remain unset');
    assert.equal(t.state.dataError, true, 'dataError must be set');
    const where = (t.diag.errors || []).map(e => e.where).join(' ');
    assert.match(where, /validIdCollision/, 'a validIdCollision diagnostic must be recorded');
  });

  check('VC-11: two History rows share a valid id with different content → nothing written', () => {
    const store = makeStorage();
    const { t } = loadModule(store);
    const histBefore = H([
      { id: 'h0', text: 'a sent message', createdAt: 1, source: 'send' },
      { id: 'X', text: 'first content', createdAt: 100, source: 'draft' },
      { id: 'X', text: 'second content', createdAt: 200, source: 'draft' },
    ]);
    store._map.set(t.keys.history, histBefore);

    assert.equal(t.engine.migrateDraftsFromHistoryOnce(), false, 'migration must fail closed');
    assert.equal(store.getItem(t.keys.history), histBefore, 'History must be untouched — neither row lost');
    assert.equal(store.getItem(t.keys.drafts), null, 'no Drafts write may occur');
    assert.equal(store.getItem(t.keys.migDrafts), null, 'marker must remain unset');
  });

  check('VC-12: same id, same text, same stored timestamp → idempotent retry', () => {
    const store = makeStorage();
    const { t } = loadModule(store);
    store._map.set(t.keys.drafts, H([{ id: 'X', text: 'same content', createdAt: 100 }]));
    store._map.set(t.keys.history, H([
      { id: 'h0', text: 'a sent message', createdAt: 1, source: 'send' },
      { id: 'X', text: 'same content', createdAt: 100, source: 'draft' },
    ]));

    assert.equal(t.engine.migrateDraftsFromHistoryOnce(), true, 'an identical copy is an idempotent retry');
    const d = draftsOf(store, t);
    assert.equal(d.length, 1, `no duplicate may be created, got ${d.length}`);
    assert.equal(store.getItem(t.keys.migDrafts), '1', 'marker set');
  });

  check('VC-12b: same id, same text, missing source timestamp matched via the sentinel', () => {
    const store = makeStorage();
    const { t } = loadModule(store);
    store._map.set(t.keys.drafts, H([{ id: 'X', text: 'same content', createdAt: t.migUnknownCreatedAt }]));
    store._map.set(t.keys.history, H([{ id: 'X', text: 'same content', source: 'draft' }]));

    assert.equal(t.engine.migrateDraftsFromHistoryOnce(), true);
    assert.equal(draftsOf(store, t).length, 1, 'the sentinel copy must be recognised as the retry');
  });

  check('VC-13: same id and text but a different timestamp → collision, fail closed', () => {
    const store = makeStorage();
    const { t } = loadModule(store);
    const draftsBefore = H([{ id: 'X', text: 'same content', createdAt: 555 }]);
    const histBefore = H([{ id: 'X', text: 'same content', createdAt: 100, source: 'draft' }]);
    store._map.set(t.keys.drafts, draftsBefore);
    store._map.set(t.keys.history, histBefore);

    assert.equal(t.engine.migrateDraftsFromHistoryOnce(), false, 'a timestamp mismatch is a collision');
    assert.equal(store.getItem(t.keys.drafts), draftsBefore, 'Drafts untouched');
    assert.equal(store.getItem(t.keys.history), histBefore, 'History untouched');
    assert.equal(store.getItem(t.keys.migDrafts), null, 'marker unset');
  });

  // ══ CORRECTION 3: SENT-HISTORY OCCURRENCE ADDRESSING ══════════════════════
  const withPendingDraft = (t, store, rows) => {
    store._map.set(t.keys.history, H(rows));
    store.failWrites = true;
    t.engine.migrateDraftsFromHistoryOnce(); // defer, so drafts stay pending
    store.failWrites = false;
  };

  check('HO-14: a sent card resolves the SENT row, not a hidden draft sharing its id', () => {
    const store = makeStorage();
    const { t } = loadModule(store);
    withPendingDraft(t, store, [
      { id: 'SHARED', text: 'hidden pending draft', createdAt: 100, source: 'draft' },
      { id: 'SHARED', text: 'visible sent row', createdAt: 200, source: 'send' },
    ]);

    const entries = t.engine.sentHistoryEntries();
    assert.equal(entries.length, 1, 'only the sent row is visible');
    assert.equal(entries[0].item.text, 'visible sent row');
    assert.equal(entries[0].fullIndex, 1, 'the card carries its full-collection index');

    const full = t.engine.loadHistory();
    const resolved = t.verifyCaptureOccurrence(full, entries[0].fullIndex, entries[0].snapshot, 'send');
    assert.ok(resolved, 'verification must succeed');
    assert.equal(resolved.text, 'visible sent row', 'ID-ONLY LOOKUP would have hit the draft');
    // An id-only lookup demonstrably resolves the wrong record.
    assert.equal(full.find(h => h.id === 'SHARED').text, 'hidden pending draft',
      'proves the old id-only lookup resolved the hidden draft');
  });

  check('HO-15: deleting that sent row leaves the hidden draft byte-identical', () => {
    const store = makeStorage();
    const { t } = loadModule(store);
    withPendingDraft(t, store, [
      { id: 'SHARED', text: 'hidden pending draft', createdAt: 100, source: 'draft' },
      { id: 'SHARED', text: 'visible sent row', createdAt: 200, source: 'send' },
    ]);

    const entry = t.engine.sentHistoryEntries()[0];
    const full = t.engine.loadHistoryStrict();
    assert.equal(full.ok, true);
    const next = full.list.slice();
    next.splice(entry.fullIndex, 1);           // single verified occurrence
    assert.equal(t.engine.saveHistory(next), true);

    const stored = JSON.parse(store.getItem(t.keys.history));
    assert.equal(stored.length, 1, 'exactly one record removed');
    assert.equal(String(stored[0].source).toLowerCase(), 'draft', 'the hidden draft survives');
    assert.equal(stored[0].text, 'hidden pending draft');
  });

  check('HO-16: two sent rows sharing an id — deleting one removes one occurrence', () => {
    const store = makeStorage();
    const { t } = loadModule(store);
    store._map.set(t.keys.history, H([
      { id: 'DUP', text: 'first sent', createdAt: 100, source: 'send' },
      { id: 'DUP', text: 'second sent', createdAt: 200, source: 'send' },
    ]));

    const entries = t.engine.sentHistoryEntries();
    assert.equal(entries.length, 2, 'both sent rows are visible');
    const target = entries.find(e => e.item.text === 'first sent');

    const full = t.engine.loadHistory();
    assert.ok(t.verifyCaptureOccurrence(full, target.fullIndex, target.snapshot, 'send'),
      'the occurrence must verify');
    const next = full.slice();
    next.splice(target.fullIndex, 1);
    assert.equal(t.engine.saveHistory(next), true);

    const stored = JSON.parse(store.getItem(t.keys.history));
    assert.equal(stored.length, 1, `expected one occurrence removed, got ${2 - stored.length}`);
    assert.equal(stored[0].text, 'second sent', 'the other occurrence must survive');
  });

  check('HO-17: a stale rendered index aborts safely without removing anything', () => {
    const store = makeStorage();
    const { t } = loadModule(store);
    store._map.set(t.keys.history, H([
      { id: 'a', text: 'first', createdAt: 100, source: 'send' },
      { id: 'b', text: 'second', createdAt: 200, source: 'send' },
    ]));
    const entries = t.engine.sentHistoryEntries();
    const stale = entries.find(e => e.item.id === 'b');

    // The collection drifts before the click is handled.
    assert.equal(t.engine.saveHistory([{ id: 'a', text: 'first', createdAt: 100, source: 'send' }]), true);
    const before = store.getItem(t.keys.history);

    const full = t.engine.loadHistory();
    assert.equal(t.verifyCaptureOccurrence(full, stale.fullIndex, stale.snapshot, 'send'), null,
      'a stale index must not verify');
    // Out-of-range, id mismatch and wrong source must all refuse.
    const snapA = { id: 'a', text: 'first', createdAt: 100, source: 'send' };
    assert.equal(t.verifyCaptureOccurrence(full, 99, snapA, 'send'), null, 'out-of-range index refused');
    assert.equal(t.verifyCaptureOccurrence(full, 0, { ...snapA, id: 'WRONG' }, 'send'), null, 'id mismatch refused');
    assert.equal(t.verifyCaptureOccurrence(full, -1, snapA, 'send'), null, 'negative index refused');
    assert.equal(t.verifyCaptureOccurrence(full, '0', snapA, 'send')?.id, 'a', 'a numeric string index is accepted');
    assert.equal(store.getItem(t.keys.history), before, 'nothing may be removed');
  });

  check('HO-17b: the occurrence verifier refuses a draft-source record', () => {
    const store = makeStorage();
    const { t } = loadModule(store);
    const list = [
      { id: 'd', text: 'a draft', createdAt: 100, source: 'draft' },
      { id: 's', text: 'a send', createdAt: 200, source: 'send' },
    ];
    assert.equal(t.verifyCaptureOccurrence(list, 0, { id: 'd', text: 'a draft', createdAt: 100, source: 'draft' }, 'send'),
      null, 'a draft record must never verify as sent');
    assert.equal(t.verifyCaptureOccurrence(list, 1, { id: 's', text: 'a send', createdAt: 200, source: 'send' }, 'send')?.text,
      'a send', 'the sent record verifies');
    assert.equal(t.verifyCaptureOccurrence(null, 0, { id: 'x' }, 'send'), null, 'a non-array refuses');
  });

  check('HO-18: insert and both conversions resolve the verified sent row', () => {
    const store = makeStorage();
    const { t } = loadModule(store);
    withPendingDraft(t, store, [
      { id: 'SHARED', text: 'hidden pending draft', createdAt: 100, source: 'draft' },
      { id: 'SHARED', text: 'visible sent row', createdAt: 200, source: 'send' },
    ]);

    const entry = t.engine.sentHistoryEntries()[0];
    const full = t.engine.loadHistory();
    // Insert, +Prompt and +Append all read `item.text` from the same resolution.
    const item = t.verifyCaptureOccurrence(full, entry.fullIndex, entry.snapshot, 'send');
    assert.ok(item, 'the sent row must resolve');
    assert.equal(item.text, 'visible sent row',
      'insert/convert must use the sent row, never the hidden draft');
  });

  // ══ CAPTURE-OCCURRENCE CLOSURE ════════════════════════════════════════════
  // Identity for a rendered card is the WHOLE record, not its id.

  check('OC-H1: same index and id, different text → verification fails', () => {
    const store = makeStorage();
    const { t } = loadModule(store);
    const rendered = { id: 'X', text: 'as rendered', createdAt: 100, source: 'send' };
    const live = [{ id: 'X', text: 'REPLACED text', createdAt: 100, source: 'send' }];
    assert.equal(t.verifyCaptureOccurrence(live, 0, rendered, 'send'), null,
      'a different sent record at the same index must not verify');
  });

  check('OC-H2: same index, id and text, different timestamp → verification fails', () => {
    const store = makeStorage();
    const { t } = loadModule(store);
    const rendered = { id: 'X', text: 'same text', createdAt: 100, source: 'send' };
    const live = [{ id: 'X', text: 'same text', createdAt: 999, source: 'send' }];
    assert.equal(t.verifyCaptureOccurrence(live, 0, rendered, 'send'), null,
      'a timestamp change must invalidate the rendered snapshot');
  });

  check('OC-H3: exact id/text/timestamp/source match → verification succeeds', () => {
    const store = makeStorage();
    const { t } = loadModule(store);
    const rec = { id: 'X', text: 'same text', createdAt: 100, source: 'send' };
    const got = t.verifyCaptureOccurrence([rec], 0, { ...rec }, 'send');
    assert.ok(got, 'an exact match must verify');
    assert.equal(got.text, 'same text');
  });

  check('OC-H4: exact match but the record is a Draft → History verification fails', () => {
    const store = makeStorage();
    const { t } = loadModule(store);
    const rec = { id: 'X', text: 'same text', createdAt: 100, source: 'draft' };
    assert.equal(t.verifyCaptureOccurrence([rec], 0, { ...rec }, 'send'), null,
      'expectedSource "send" must reject a draft record');
    assert.ok(t.verifyCaptureOccurrence([rec], 0, { ...rec }), 'without expectedSource it verifies');
  });

  check('OC-H5: a stale index after collection drift aborts and deletes nothing', () => {
    const store = makeStorage();
    const { t } = loadModule(store);
    store._map.set(t.keys.history, H([
      { id: 'a', text: 'first', createdAt: 100, source: 'send' },
      { id: 'b', text: 'second', createdAt: 200, source: 'send' },
    ]));
    const stale = t.engine.sentHistoryEntries().find(e => e.item.id === 'b');

    // Collection drifts before the click is handled.
    assert.equal(t.engine.saveHistory([{ id: 'a', text: 'first', createdAt: 100, source: 'send' }]), true);
    const before = store.getItem(t.keys.history);

    const full = t.engine.loadHistory();
    assert.equal(t.verifyCaptureOccurrence(full, stale.fullIndex, stale.snapshot, 'send'), null,
      'a stale index must not verify');
    assert.equal(store.getItem(t.keys.history), before, 'nothing may be removed');
  });

  check('OC-helper: index and input validation', () => {
    const store = makeStorage();
    const { t } = loadModule(store);
    const rec = { id: 'a', text: 'x', createdAt: 1, source: 'send' };
    const list = [rec];
    const snap = { ...rec };
    assert.equal(t.verifyCaptureOccurrence(null, 0, snap), null, 'non-array refused');
    assert.equal(t.verifyCaptureOccurrence('nope', 0, snap), null, 'non-array refused');
    assert.equal(t.verifyCaptureOccurrence(list, 0, null), null, 'missing snapshot refused');
    assert.equal(t.verifyCaptureOccurrence(list, 0.5, snap), null, 'fractional index refused');
    assert.equal(t.verifyCaptureOccurrence(list, -1, snap), null, 'negative index refused');
    assert.equal(t.verifyCaptureOccurrence(list, 1, snap), null, 'out-of-range index refused');
    assert.equal(t.verifyCaptureOccurrence(list, undefined, snap), null, 'missing index refused');
    assert.equal(t.verifyCaptureOccurrence(list, 'x', snap), null, 'non-numeric index refused');
    assert.ok(t.verifyCaptureOccurrence(list, '0', snap), 'a numeric string index is accepted');
    assert.ok(t.verifyCaptureOccurrence(list, 0, snap), 'an exact match verifies');
  });

  // ── Drafts and Pasted occurrence addressing (same battery for both) ────────
  for (const [LABEL, keyOf, strictOf, entriesOf] of [
    ['D', (t) => t.keys.drafts, (t) => t.engine.loadDraftsStrict(), (t) => t.engine.captureEntries(t.engine.loadDrafts())],
    ['P', (t) => t.keys.pasted, (t) => t.engine.loadPastedStrict(), (t) => t.engine.captureEntries(t.engine.loadPasted())],
  ]) {
    const TWO = [
      { id: 'SAME', text: 'first record', createdAt: 100 },
      { id: 'SAME', text: 'second record', createdAt: 200 },
    ];

    check(`OC-${LABEL}1: two rows share an id — each occurrence resolves its own record`, () => {
      const store = makeStorage();
      const { t } = loadModule(store);
      store._map.set(keyOf(t), H(TWO));

      const entries = entriesOf(t);
      assert.equal(entries.length, 2, 'both rows must be addressable');
      assert.deepEqual(plain(entries.map(e => e.fullIndex)), [0, 1], 'full indexes retained');

      const live = strictOf(t).list;
      const a = t.verifyCaptureOccurrence(live, entries[0].fullIndex, entries[0].snapshot);
      const b = t.verifyCaptureOccurrence(live, entries[1].fullIndex, entries[1].snapshot);
      assert.equal(a.text, 'first record', 'occurrence 0 resolves its own record');
      assert.equal(b.text, 'second record', 'occurrence 1 resolves its own record');
    });

    check(`OC-${LABEL}2: deleting the first removes exactly the first`, () => {
      const store = makeStorage();
      const { t } = loadModule(store);
      store._map.set(keyOf(t), H(TWO));
      const entries = entriesOf(t);
      const rd = strictOf(t);
      assert.equal(rd.ok, true);
      assert.ok(t.verifyCaptureOccurrence(rd.list, entries[0].fullIndex, entries[0].snapshot));

      const next = rd.list.slice();
      next.splice(entries[0].fullIndex, 1);
      assert.equal(LABEL === 'D' ? t.engine.saveDrafts(next) : t.engine.savePasted(next), true);

      const stored = JSON.parse(store.getItem(keyOf(t)));
      assert.equal(stored.length, 1, 'exactly one record removed');
      assert.equal(stored[0].text, 'second record', 'the second survives byte-identically');
      assert.equal(stored[0].createdAt, 200);
      assert.equal(stored[0].id, 'SAME');
    });

    check(`OC-${LABEL}3: deleting the second removes exactly the second`, () => {
      const store = makeStorage();
      const { t } = loadModule(store);
      store._map.set(keyOf(t), H(TWO));
      const entries = entriesOf(t);
      const rd = strictOf(t);
      assert.ok(t.verifyCaptureOccurrence(rd.list, entries[1].fullIndex, entries[1].snapshot));

      const next = rd.list.slice();
      next.splice(entries[1].fullIndex, 1);
      assert.equal(LABEL === 'D' ? t.engine.saveDrafts(next) : t.engine.savePasted(next), true);

      const stored = JSON.parse(store.getItem(keyOf(t)));
      assert.equal(stored.length, 1, 'exactly one record removed');
      assert.equal(stored[0].text, 'first record', 'the first survives byte-identically');
      assert.equal(stored[0].createdAt, 100);
    });

    check(`OC-${LABEL}4: same index and id but changed text/timestamp → stale action aborts`, () => {
      const store = makeStorage();
      const { t } = loadModule(store);
      store._map.set(keyOf(t), H(TWO));
      const entries = entriesOf(t);
      const rendered = entries[0].snapshot;

      // The record at that index is replaced by a different one with the same id.
      store._map.set(keyOf(t), H([
        { id: 'SAME', text: 'REPLACED', createdAt: 100 },
        { id: 'SAME', text: 'second record', createdAt: 200 },
      ]));
      const live = strictOf(t).list;
      assert.equal(t.verifyCaptureOccurrence(live, 0, rendered), null,
        'a text change must invalidate the rendered snapshot');

      // Same id and text but a changed timestamp must also abort.
      store._map.set(keyOf(t), H([
        { id: 'SAME', text: 'first record', createdAt: 777 },
        { id: 'SAME', text: 'second record', createdAt: 200 },
      ]));
      const live2 = strictOf(t).list;
      assert.equal(t.verifyCaptureOccurrence(live2, 0, rendered), null,
        'a timestamp change must invalidate the rendered snapshot');
    });

    check(`OC-${LABEL}5: insert and both conversions resolve the selected occurrence`, () => {
      const store = makeStorage();
      const { t } = loadModule(store);
      store._map.set(keyOf(t), H(TWO));
      const entries = entriesOf(t);
      const live = strictOf(t).list;

      // All three actions read `item.text` from one shared resolution.
      for (const e of entries) {
        const item = t.verifyCaptureOccurrence(live, e.fullIndex, e.snapshot);
        assert.ok(item, `occurrence ${e.fullIndex} must resolve`);
        assert.equal(item.text, e.item.text,
          'insert/+Prompt/+Append must all act on the selected occurrence');
      }
      assert.notEqual(entries[0].item.text, entries[1].item.text,
        'the two occurrences are genuinely distinct records');
    });
  }

  // ── Regression guards ─────────────────────────────────────────────────────
  check('OC-R12: malformed Drafts/Pasted strict reads still abort without overwriting', () => {
    for (const [label, key, strict] of [
      ['Drafts', (t) => t.keys.drafts, (t) => t.engine.loadDraftsStrict()],
      ['Pasted', (t) => t.keys.pasted, (t) => t.engine.loadPastedStrict()],
    ]) {
      const store = makeStorage();
      const { t } = loadModule(store);
      const raw = '{"broken": [1,2,';
      store._map.set(key(t), raw);
      const rd = strict(t);
      assert.equal(rd.ok, false, `${label}: corrupt must report !ok`);
      assert.equal(store.getItem(key(t)), raw, `${label}: primary bytes preserved`);
      assert.equal(t.state.dataError, true, `${label}: dataError set`);
    }
  });

  check('OC-R13: History hidden-draft preservation remains intact', () => {
    const store = makeStorage();
    const { t } = loadModule(store);
    store._map.set(t.keys.history, H([
      { id: 'h0', text: 'a sent message', createdAt: 100, source: 'send' },
      { id: 'd0', text: 'pending draft', createdAt: 200, source: 'draft' },
    ]));
    store.failWrites = true;
    t.engine.migrateDraftsFromHistoryOnce();
    store.failWrites = false;

    const full = t.engine.loadHistory();
    assert.equal(full.length, 2, 'the pending draft stays in the full collection');
    assert.equal(t.engine.sentHistoryEntries().length, 1, 'but is hidden from the sent view');
    assert.ok(JSON.parse(store.getItem(t.keys.history)).some(h => h.id === 'd0'),
      'and remains in storage');
  });

  check('OC-R14: valid-ID migration collision cases remain green', () => {
    const store = makeStorage();
    const { t } = loadModule(store);
    const draftsBefore = H([{ id: 'X', text: 'existing text', createdAt: 100 }]);
    const histBefore = H([{ id: 'X', text: 'DIFFERENT text', createdAt: 100, source: 'draft' }]);
    store._map.set(t.keys.drafts, draftsBefore);
    store._map.set(t.keys.history, histBefore);

    assert.equal(t.engine.migrateDraftsFromHistoryOnce(), false, 'collision still fails closed');
    assert.equal(store.getItem(t.keys.drafts), draftsBefore, 'Drafts untouched');
    assert.equal(store.getItem(t.keys.history), histBefore, 'History untouched');
    assert.equal(store.getItem(t.keys.migDrafts), null, 'marker unset');
  });

  console.log('');
  console.log(`PASS ${PASS.length}`);
  if (FAIL.length) {
    console.log(`FAIL ${FAIL.length}`);
    for (const f of FAIL) console.log(`- ${f.label}: ${f.m}`);
    process.exitCode = 1;
  }
}

main();
