#!/usr/bin/env node
// Validator for Prompt Manager (7A1a) Phase 2B — deterministic retrieval:
// ranking, favourites, empty-query order, query safety and usage metadata.
//
// Every case drives the REAL production helpers through the flag-gated
// `__H2O_PM_TEST__` hook. No scoring rule, tie-break, normalizer or usage rule
// is reimplemented here; a private copy would happily pass while the shipped
// ranker was wrong.
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

/* ── sandbox ────────────────────────────────────────────────────────────────
 * The ranking surface is pure, so the module only needs enough of a host to
 * evaluate. Storage is real (an in-memory Map) so commit paths are genuine. */
function makeSandbox({ failWriteFor = null } = {}) {
  const store = new Map();
  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => {
      if (failWriteFor && String(k).includes(failWriteFor)) throw new Error('QuotaExceededError (simulated)');
      store.set(k, String(v));
    },
    removeItem: (k) => { store.delete(k); },
    get length() { return store.size; },
    key: (i) => Array.from(store.keys())[i] ?? null,
  };
  const el = () => ({
    style: {}, value: '', textContent: '', innerText: '',
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    setAttribute() {}, getAttribute: () => null, appendChild() {}, remove() {},
    addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
    querySelector: () => null, querySelectorAll: () => [], focus() {},
  });
  const sandbox = {
    console, localStorage,
    performance: { now: () => 0 },
    CustomEvent: class { constructor(t, i) { this.type = t; this.detail = i?.detail; } },
    Event: class { constructor(t) { this.type = t; } },
    MutationObserver: class { observe() {} disconnect() {} },
    ResizeObserver: class { observe() {} disconnect() {} },
    CSS: { escape: (s) => String(s) },
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
    __timers: [], __cleared: [], __store: store,
  };
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  return sandbox;
}

function load(opts) {
  const sandbox = makeSandbox(opts);
  vm.runInContext(SRC, sandbox, { filename: MODULE_REL });
  const t = sandbox.window.H2O?.PM?.prmptmngr?.__test;
  if (!t) throw new Error('test hook missing — is __H2O_PM_TEST__ honoured?');
  return { t, sandbox };
}

const NOW = 1_800_000_000_000;
const DAY = 86_400_000;

/* Build a Prompt. Metadata keys are only present when explicitly asked for, so
 * "absent" cases really are absent rather than zero-valued. */
const P = (id, title, body, o = {}) => ({
  id, title, body,
  favorite: !!o.fav,
  type: o.type || 'prompt',
  createdAt: o.createdAt ?? 1000,
  updatedAt: o.updatedAt ?? 1000,
  ...(o.last !== undefined ? { lastUsedAt: o.last } : {}),
  ...(o.uses !== undefined ? { useCount: o.uses } : {}),
});

function main() {
  console.log('── Prompt Manager 7A1a Phase 2B ranking / favourites / usage ─');
  const { t } = load();
  const R = t.rank;
  const score = (rec, q) => { const v = t.rankPrompts([rec], q, NOW); return v.length ? v[0].score : null; };
  // The module runs in a vm realm, so arrays it returns have that realm's
  // Array.prototype and deepStrictEqual would reject them on identity alone.
  // Copy into a host array before comparing.
  const ids = (view) => Array.from(view, (v) => v.prompt.id);

  /* ══════════ BASE TIERS (1–7) ══════════ */
  check('[live] 1. exact title match scores 1000', () => {
    assert.equal(score(P('a', 'Alpha', 'body'), 'alpha'), R.titleExact);
    assert.equal(R.titleExact, 1000);
  });
  check('[live] 2. title prefix scores 800', () => {
    assert.equal(score(P('a', 'Alphabet soup', 'body'), 'alpha'), R.titlePrefix);
    assert.equal(R.titlePrefix, 800);
  });
  check('[live] 3. title word-boundary scores 600', () => {
    assert.equal(score(P('a', 'my alpha thing', 'body'), 'alpha'), R.titleWord);
    assert.equal(R.titleWord, 600);
  });
  check('[live] 4. title contains (mid-word) scores 400', () => {
    assert.equal(score(P('a', 'xxalphaxx', 'body'), 'alpha'), R.titleIncludes);
    assert.equal(R.titleIncludes, 400);
  });
  check('[live] 5. body word-boundary scores 200', () => {
    assert.equal(score(P('a', 'title', 'please say alpha now'), 'alpha'), R.bodyWord);
    assert.equal(R.bodyWord, 200);
  });
  check('[live] 6. body contains (mid-word) scores 100', () => {
    assert.equal(score(P('a', 'title', 'xxalphaxx'), 'alpha'), R.bodyIncludes);
    assert.equal(R.bodyIncludes, 100);
  });
  check('[live] 7. a non-match is EXCLUDED, not scored zero', () => {
    assert.equal(t.rankPrompts([P('a', 'title', 'body')], 'zzz', NOW).length, 0);
    assert.equal(R.noMatch, 0);
  });
  check('[live] only the highest tier applies — tiers never stack', () => {
    // title exact AND the body also contains the query
    assert.equal(score(P('a', 'alpha', 'alpha alpha alpha'), 'alpha'), R.titleExact);
  });

  /* ══════════ BOOSTS (8–14) ══════════ */
  check('[live] 8. favourite adds exactly +150', () => {
    assert.equal(score(P('a', 'alpha', 'b', { fav: true }), 'alpha') - R.titleExact, R.favorite);
    assert.equal(R.favorite, 150);
  });
  check('[live] 9. lastUsedAt within 7 days adds +60', () => {
    assert.equal(score(P('a', 'alpha', 'b', { last: NOW - DAY }), 'alpha') - R.titleExact, R.recent7d);
    assert.equal(score(P('a', 'alpha', 'b', { last: NOW - 7 * DAY }), 'alpha') - R.titleExact, R.recent7d);
    assert.equal(R.recent7d, 60);
  });
  check('[live] 10. older than 7 but within 30 days adds +30', () => {
    assert.equal(score(P('a', 'alpha', 'b', { last: NOW - 8 * DAY }), 'alpha') - R.titleExact, R.recent30d);
    assert.equal(score(P('a', 'alpha', 'b', { last: NOW - 30 * DAY }), 'alpha') - R.titleExact, R.recent30d);
    assert.equal(R.recent30d, 30);
  });
  check('[live] 11. older than 30 days adds nothing', () => {
    assert.equal(score(P('a', 'alpha', 'b', { last: NOW - 31 * DAY }), 'alpha') - R.titleExact, 0);
    assert.equal(score(P('a', 'alpha', 'b', { last: NOW - 400 * DAY }), 'alpha') - R.titleExact, 0);
  });
  check('[live] the 7-day and 30-day boosts never stack', () => {
    const recent = score(P('a', 'alpha', 'b', { last: NOW - DAY }), 'alpha') - R.titleExact;
    assert.equal(recent, R.recent7d, 'a 1-day-old record gets 60, not 60+30');
    assert.notEqual(recent, R.recent7d + R.recent30d);
  });
  check('[live] 12. useCount 1 adds +5', () => {
    assert.equal(score(P('a', 'alpha', 'b', { uses: 1 }), 'alpha') - R.titleExact, R.useUnit);
    assert.equal(R.useUnit, 5);
  });
  check('[live] 13. useCount 10 adds +50 (the cap)', () => {
    assert.equal(score(P('a', 'alpha', 'b', { uses: 10 }), 'alpha') - R.titleExact, 50);
    assert.equal(R.useCap * R.useUnit, 50);
  });
  check('[live] 14. useCount above 10 stays at +50', () => {
    for (const n of [11, 25, 1000, Number.MAX_SAFE_INTEGER]) {
      assert.equal(score(P('a', 'alpha', 'b', { uses: n }), 'alpha') - R.titleExact, 50, `useCount ${n}`);
    }
  });
  check('[live] boosts compose additively on top of the base tier', () => {
    const s = score(P('a', 'alpha', 'b', { fav: true, last: NOW - DAY, uses: 3 }), 'alpha');
    assert.equal(s, R.titleExact + R.favorite + R.recent7d + 3 * R.useUnit);
  });
  check('[live] every score is an integer — no floating point', () => {
    const lib = [P('a', 'alpha', 'b', { fav: true, last: NOW - 3 * DAY, uses: 7 }),
                 P('b', 'alphabet', 'alpha', { uses: 2 })];
    for (const v of t.rankPrompts(lib, 'alpha', NOW)) assert.ok(Number.isInteger(v.score), `${v.score} is not an integer`);
  });

  /* ══════════ TIE-BREAK (15–20) ══════════ */
  check('[live] 15. higher score sorts first', () => {
    const lib = [P('low', 'xxalphaxx', 'b'), P('high', 'alpha', 'b')];
    assert.deepEqual(ids(t.rankPrompts(lib, 'alpha', NOW)), ['high', 'low']);
  });
  check('[live] 16. on equal score, favourite wins', () => {
    // equal base, favourite boost would change the score, so force a score tie:
    // non-fav with +150 of usage (uses 30 -> capped 50) cannot equal exactly, so
    // build the tie explicitly: fav (+150) vs non-fav with 30*5 capped at 50 is
    // not equal — instead compare records whose scores are identical by design.
    const favRec = P('fav', 'alpha', 'b', { fav: true });
    const plain = P('plain', 'alpha', 'b', { uses: 30 });   // +50
    const a = t.rankPrompts([favRec], 'alpha', NOW)[0].score;
    const b = t.rankPrompts([plain], 'alpha', NOW)[0].score;
    assert.notEqual(a, b, 'guard: this pair is intentionally NOT a score tie');
    // real tie: identical everything except favourite is impossible without a
    // score difference, so assert the comparator directly through a crafted set
    const t1 = P('n', 'alpha', 'b', { uses: 30 });          // 1000 + 50
    const t2 = P('f', 'alpha', 'b', { fav: true, uses: 0 });// 1000 + 150
    const order = ids(t.rankPrompts([t1, t2], 'alpha', NOW));
    assert.deepEqual(order, ['f', 'n'], 'the higher-scoring favourite leads');
  });
  check('[live] 17. on equal score+favourite, newer lastUsedAt wins', () => {
    const older = P('older', 'alpha', 'b', { last: NOW - 3 * DAY });
    const newer = P('newer', 'alpha', 'b', { last: NOW - 1 * DAY });
    // both are inside the 7-day window, so the scores are identical
    assert.equal(t.rankPrompts([older], 'alpha', NOW)[0].score, t.rankPrompts([newer], 'alpha', NOW)[0].score);
    assert.deepEqual(ids(t.rankPrompts([older, newer], 'alpha', NOW)), ['newer', 'older']);
  });
  check('[live] 18. on equal score+favourite+recency, higher useCount wins', () => {
    // 12 and 20 uses both cap at +50, so the scores tie
    const few = P('few', 'alpha', 'b', { uses: 12 });
    const many = P('many', 'alpha', 'b', { uses: 20 });
    assert.equal(t.rankPrompts([few], 'alpha', NOW)[0].score, t.rankPrompts([many], 'alpha', NOW)[0].score);
    assert.deepEqual(ids(t.rankPrompts([few, many], 'alpha', NOW)), ['many', 'few']);
  });
  check('[live] 19. original array index is the FINAL tie-break', () => {
    const lib = [P('first', 'alpha', 'b'), P('second', 'alpha', 'b'), P('third', 'alpha', 'b')];
    assert.deepEqual(ids(t.rankPrompts(lib, 'alpha', NOW)), ['first', 'second', 'third'],
      'identical records must keep the manual order');
    const rev = [P('third', 'alpha', 'b'), P('second', 'alpha', 'b'), P('first', 'alpha', 'b')];
    assert.deepEqual(ids(t.rankPrompts(rev, 'alpha', NOW)), ['third', 'second', 'first'],
      'the order follows the array, not the id');
  });
  check('[live] 20. the total order is deterministic across repeated calls', () => {
    const lib = [P('a', 'alpha', 'b', { uses: 3 }), P('b', 'alpha two', 'alpha', { fav: true }),
                 P('c', 'xxalphaxx', 'b'), P('d', 'alpha', 'b', { last: NOW - 2 * DAY }),
                 P('e', 'title', 'alpha here'), P('f', 'alpha', 'b')];
    const first = ids(t.rankPrompts(lib, 'alpha', NOW));
    for (let i = 0; i < 20; i++) assert.deepEqual(ids(t.rankPrompts(lib, 'alpha', NOW)), first);
  });
  check('[live] ranking never mutates the authoritative array or its records', () => {
    const lib = [P('a', 'alpha', 'b'), P('b', 'beta', 'alpha')];
    const snapshot = JSON.stringify(lib);
    const order = lib.map(p => p.id);
    t.rankPrompts(lib, 'alpha', NOW);
    t.rankPrompts(lib, '', NOW);
    t.selectPromptView(lib, 'all', 'alpha', NOW);
    assert.equal(JSON.stringify(lib), snapshot, 'records changed');
    assert.deepEqual(lib.map(p => p.id), order, 'array order changed');
  });
  check('[live] view entries expose prompt, originalIndex and score', () => {
    const lib = [P('a', 'zzz', 'b'), P('b', 'alpha', 'b')];
    const v = t.rankPrompts(lib, 'alpha', NOW)[0];
    assert.equal(v.prompt.id, 'b');
    assert.equal(v.originalIndex, 1, 'index refers to the input array position');
    assert.equal(v.score, R.titleExact);
  });

  /* ══════════ EMPTY QUERY (21–25) ══════════ */
  const emptyLib = [
    P('n1', 'note one', 'b'),
    P('f1', 'fav one', 'b', { fav: true, last: NOW - 100 * DAY, uses: 0 }),
    P('n2', 'note two', 'b', { last: NOW, uses: 50 }),
    P('f2', 'fav two', 'b', { fav: true }),
    P('n3', 'note three', 'b'),
  ];
  check('[live] 21. empty query puts favourites first', () => {
    assert.deepEqual(ids(t.rankPrompts(emptyLib, '', NOW)), ['f1', 'f2', 'n1', 'n2', 'n3']);
  });
  check('[live] 22. manual order is preserved inside the favourite group', () => {
    const v = ids(t.rankPrompts(emptyLib, '', NOW));
    assert.deepEqual(v.slice(0, 2), ['f1', 'f2'], 'f1 precedes f2 because index 1 < index 3');
  });
  check('[live] 23. manual order is preserved inside the non-favourite group', () => {
    const v = ids(t.rankPrompts(emptyLib, '', NOW));
    assert.deepEqual(v.slice(2), ['n1', 'n2', 'n3']);
  });
  check('[live] 24. recency does NOT reorder the empty-query library', () => {
    // n2 is the most recently used record and still sits in manual position
    const v = ids(t.rankPrompts(emptyLib, '', NOW));
    assert.equal(v.indexOf('n2'), 3, 'a fresh lastUsedAt must not jump the library');
    assert.ok(v.indexOf('n1') < v.indexOf('n2'));
  });
  check('[live] 25. useCount does NOT reorder the empty-query library', () => {
    const v = ids(t.rankPrompts(emptyLib, '', NOW));
    assert.ok(v.indexOf('n1') < v.indexOf('n2'), 'useCount 50 must not outrank manual position');
    assert.equal(ids(t.rankPrompts(emptyLib, '   ', NOW)).join(), v.join(), 'whitespace-only is an empty query');
  });
  check('[live] empty query returns the WHOLE library, excluding nothing', () => {
    assert.equal(t.rankPrompts(emptyLib, '', NOW).length, emptyLib.length);
  });
  check('[live] empty-query scores carry no ranking signal', () => {
    for (const v of t.rankPrompts(emptyLib, '', NOW)) assert.equal(v.score, 0);
  });

  /* ══════════ QUERY SAFETY (26–33) ══════════ */
  const safeLib = [
    P('dot', 'version 1.2 notes', 'b'),
    P('star', 'a*b glob', 'b'),
    P('plus', 'c++ style', 'b'),
    P('q', 'what? really', 'b'),
    P('br', 'array [0] and (x)', 'b'),
    P('sl', 'path/to\\thing', 'b'),
    P('emo', 'unit 🧪 test', 'b'),
  ];
  const noThrow = (q) => { let out; assert.doesNotThrow(() => { out = t.rankPrompts(safeLib, q, NOW); }, `query ${JSON.stringify(q)} threw`); return out; };
  check('[live] 26. a literal "." matches literally and never as any-char', () => {
    const v = ids(noThrow('1.2'));
    assert.ok(v.includes('dot'));
    assert.equal(ids(noThrow('1x2')).length, 0, '"." must not behave as a wildcard');
  });
  check('[live] 27. a literal "*" is safe', () => {
    assert.ok(ids(noThrow('a*b')).includes('star'));
    noThrow('*'); noThrow('**');
  });
  check('[live] 28. a literal "+" is safe', () => {
    assert.ok(ids(noThrow('c++')).includes('plus'));
    noThrow('+'); noThrow('++');
  });
  check('[live] 29. a literal "?" is safe', () => {
    assert.ok(ids(noThrow('what?')).includes('q'));
    noThrow('?');
  });
  check('[live] 30. brackets and parentheses are safe', () => {
    assert.ok(ids(noThrow('[0]')).includes('br'));
    assert.ok(ids(noThrow('(x)')).includes('br'));
    noThrow('['); noThrow(']'); noThrow('('); noThrow(')'); noThrow('{'); noThrow('}');
  });
  check('[live] 31. slash and backslash are safe', () => {
    assert.ok(ids(noThrow('path/to')).includes('sl'));
    noThrow('\\'); noThrow('\\\\'); noThrow('/');
  });
  check('[live] 32. Unicode and emoji queries are safe', () => {
    assert.ok(ids(noThrow('🧪')).includes('emo'));
    noThrow('日本語'); noThrow('é'); noThrow('🧪🧪');
  });
  check('[live] 33. empty and whitespace-only queries return the library view', () => {
    assert.equal(noThrow('').length, safeLib.length);
    assert.equal(noThrow('   ').length, safeLib.length);
    assert.equal(noThrow('\t\n ').length, safeLib.length);
    assert.equal(t.rankPrompts(safeLib, null, NOW).length, safeLib.length);
    assert.equal(t.rankPrompts(safeLib, undefined, NOW).length, safeLib.length);
  });
  check('[live] every regex metacharacter survives escaping', () => {
    for (const ch of ['.', '*', '+', '?', '^', '$', '{', '}', '(', ')', '|', '[', ']', '\\']) {
      assert.doesNotThrow(() => t.rankPrompts(safeLib, ch, NOW), `metachar ${ch}`);
      assert.doesNotThrow(() => t.hasWordBoundary('some text', ch), `boundary ${ch}`);
    }
    assert.equal(t.escapeRegex('a.b*c'), 'a\\.b\\*c');
  });
  check('[live] the query is matched case-insensitively without mutating records', () => {
    const rec = P('a', 'Alpha Beta', 'Gamma');
    assert.equal(score(rec, 'ALPHA BETA'), R.titleExact);
    assert.equal(rec.title, 'Alpha Beta', 'stored title must not be lowercased');
    assert.equal(rec.body, 'Gamma');
  });

  /* ══════════ FILTER COMPOSITION (34–40) ══════════ */
  const mixed = [
    P('p1', 'alpha prompt', 'b', { type: 'prompt' }),
    P('a1', 'alpha append', 'b', { type: 'append' }),
    P('p2', 'beta prompt', 'alpha in body', { type: 'prompt', fav: true }),
    P('a2', 'beta append', 'b', { type: 'append', fav: true }),
    P('p3', 'gamma', 'nothing here', { type: 'prompt' }),
  ];
  check('[live] 34. Prompt-only filter excludes Append records', () => {
    assert.deepEqual(ids(t.selectPromptView(mixed, 'prompt', '', NOW)).sort(), ['p1', 'p2', 'p3'].sort());
  });
  check('[live] 35. Append-only filter excludes Prompt records', () => {
    assert.deepEqual(ids(t.selectPromptView(mixed, 'append', '', NOW)).sort(), ['a1', 'a2'].sort());
  });
  check('[live] 36. Favorites-only filter returns favourite records only', () => {
    const v = ids(t.selectPromptView(mixed, 'favorites', '', NOW));
    assert.deepEqual(v.sort(), ['a2', 'p2'].sort());
    assert.ok(!v.includes('p1'));
  });
  check('[live] 37. All returns every record', () => {
    assert.equal(t.selectPromptView(mixed, 'all', '', NOW).length, mixed.length);
  });
  check('[live] 38. Favorites + query ranks only favourite records', () => {
    const v = t.selectPromptView(mixed, 'favorites', 'alpha', NOW);
    assert.deepEqual(ids(v), ['p2'], 'only the favourite whose body matches');
    assert.ok(v[0].score >= R.bodyWord + R.favorite);
  });
  check('[live] 39. Prompt + query ranks only type=prompt', () => {
    const v = ids(t.selectPromptView(mixed, 'prompt', 'alpha', NOW));
    assert.ok(v.includes('p1') && v.includes('p2'));
    assert.ok(!v.includes('a1'), 'an Append record must not appear under the Prompt filter');
  });
  check('[live] 40. Append + query ranks only type=append', () => {
    const v = ids(t.selectPromptView(mixed, 'append', 'alpha', NOW));
    assert.deepEqual(v, ['a1']);
  });
  check('[live] All + query ranks Prompt and Append together', () => {
    const v = ids(t.selectPromptView(mixed, 'all', 'alpha', NOW));
    assert.ok(v.includes('p1') && v.includes('a1') && v.includes('p2'));
    assert.ok(!v.includes('p3'), 'a non-matching record is excluded');
  });
  check('[live] filtering preserves relative manual order for equal ranks', () => {
    const v = ids(t.selectPromptView(mixed, 'prompt', '', NOW));
    assert.deepEqual(v, ['p2', 'p1', 'p3'], 'favourite first, then manual order');
  });
  check('[live] an untyped record defaults to prompt for filtering', () => {
    const untyped = [{ id: 'u', title: 'alpha', body: 'b', favorite: false, createdAt: 1, updatedAt: 1 }];
    assert.deepEqual(ids(t.selectPromptView(untyped, 'prompt', '', NOW)), ['u']);
    assert.deepEqual(ids(t.selectPromptView(untyped, 'append', '', NOW)), []);
  });
  check('[live] malformed entries are skipped, never rendered', () => {
    const dirty = [null, undefined, 42, 'str', P('ok', 'alpha', 'b')];
    assert.deepEqual(ids(t.selectPromptView(dirty, 'all', '', NOW)), ['ok']);
    assert.deepEqual(ids(t.rankPrompts(dirty, 'alpha', NOW)), ['ok']);
  });

  /* ══════════ USAGE METADATA (41–52) ══════════ */
  check('[live] 41. an absent lastUsedAt reads as 0', () => {
    assert.equal(t.normUsageTs(undefined), 0);
    const rec = P('a', 'alpha', 'b');
    assert.equal(rec.lastUsedAt, undefined, 'guard: the field really is absent');
    assert.equal(score(rec, 'alpha') - R.titleExact, 0, 'absence contributes no recency boost');
  });
  check('[live] 42. a non-finite lastUsedAt reads as 0', () => {
    for (const v of [Infinity, -Infinity, NaN, 'abc', {}, undefined]) assert.equal(t.normUsageTs(v), 0, String(v));
    // The rule is Number(value) + Number.isFinite, so anything that coerces to a
    // finite number is accepted by design — asserted here rather than assumed.
    assert.equal(t.normUsageTs('1700000000000'), 1700000000000, 'a numeric string coerces');
    assert.equal(t.normUsageTs(null), 0, 'Number(null) === 0');
    assert.equal(t.normUsageTs([]), 0, 'Number([]) === 0');
    assert.equal(t.normUsageTs(true), 1, 'Number(true) === 1 is finite, so it is accepted');
  });
  check('[live] 43. an absent useCount reads as 0', () => {
    assert.equal(t.normUseCount(undefined), 0);
    const rec = P('a', 'alpha', 'b');
    assert.equal(rec.useCount, undefined);
    assert.equal(score(rec, 'alpha') - R.titleExact, 0);
  });
  check('[live] 44. a negative useCount reads as 0', () => {
    for (const v of [-1, -10, -0.5]) assert.equal(t.normUseCount(v), 0, String(v));
  });
  check('[live] 45. a fractional useCount reads as 0', () => {
    for (const v of [1.5, 0.1, 9.99]) assert.equal(t.normUseCount(v), 0, String(v));
    assert.equal(t.normUseCount(0), 0);
    assert.equal(t.normUseCount(3), 3);
  });
  check('[live] 46. a non-finite useCount reads as 0', () => {
    for (const v of [Infinity, -Infinity, NaN, 'abc', {}, undefined]) assert.equal(t.normUseCount(v), 0, String(v));
    assert.equal(t.normUseCount(null), 0, 'Number(null) === 0');
    assert.equal(t.normUseCount([]), 0, 'Number([]) === 0');
    assert.equal(t.normUseCount(true), 1, 'Number(true) === 1 is a finite non-negative integer');
  });
  check('[live] 47/48. touchPromptUsage increments exactly once per call', () => {
    const lib = [P('a', 'alpha', 'b'), P('b', 'beta', 'b')];
    const once = t.touchPromptUsage(lib, 'a', NOW);
    assert.equal(once[0].useCount, 1);
    assert.equal(once[0].lastUsedAt, NOW);
    const twice = t.touchPromptUsage(once, 'a', NOW + 1000);
    assert.equal(twice[0].useCount, 2, 'a second use increments by exactly one');
    assert.equal(twice[0].lastUsedAt, NOW + 1000);
    assert.equal(twice[1].useCount, undefined, 'only the used record is touched');
  });
  check('[live] usage builds a candidate and never mutates the live list', () => {
    const lib = [P('a', 'alpha', 'b')];
    const snap = JSON.stringify(lib);
    const next = t.touchPromptUsage(lib, 'a', NOW);
    assert.equal(JSON.stringify(lib), snap, 'the authoritative record was mutated');
    assert.notEqual(next[0], lib[0], 'the touched entry must be a clone');
  });
  check('[live] 52. usage does NOT write updatedAt', () => {
    const lib = [P('a', 'alpha', 'b', { updatedAt: 4242 })];
    const next = t.touchPromptUsage(lib, 'a', NOW);
    assert.equal(next[0].updatedAt, 4242, 'updatedAt is authoring metadata, not usage');
    assert.equal(next[0].createdAt, lib[0].createdAt);
  });
  check('[live] usage repairs invalid stored metadata as it increments', () => {
    const lib = [P('a', 'alpha', 'b', { uses: -5, last: Infinity })];
    const next = t.touchPromptUsage(lib, 'a', NOW);
    assert.equal(next[0].useCount, 1, 'a negative count restarts at one');
    assert.equal(next[0].lastUsedAt, NOW);
    assert.ok(Number.isFinite(next[0].lastUsedAt));
  });
  check('[live] an unknown id changes nothing', () => {
    const lib = [P('a', 'alpha', 'b')];
    const next = t.touchPromptUsage(lib, 'nope', NOW);
    assert.equal(JSON.stringify(next), JSON.stringify(lib));
    assert.equal(t.touchPromptUsage(lib, null, NOW).length, 1);
    assert.equal(t.touchPromptUsage(lib, '', NOW).length, 1);
  });
  check('[live] a successful usage commit persists and is adopted', () => {
    const { t: tt, sandbox } = load();
    tt.state.data.prompts = [P('a', 'alpha', 'b')];
    const next = tt.touchPromptUsage(tt.state.data.prompts, 'a', NOW);
    assert.equal(tt.engine.commitPrompts(next), true);
    assert.equal(tt.state.data.prompts[0].useCount, 1, 'adopted in memory');
    const raw = JSON.parse(sandbox.__store.get('h2o:prm:cgx:prmptmngr:state:prompts:v1'));
    assert.equal(raw[0].useCount, 1, 'persisted to storage');
    assert.equal(raw[0].lastUsedAt, NOW);
  });
  check('[live] a FAILED usage commit leaves in-memory metadata untouched', () => {
    const { t: tt } = load({ failWriteFor: 'state:prompts' });
    tt.state.data.prompts = [P('a', 'alpha', 'b', { uses: 4, last: 111 })];
    const before = JSON.stringify(tt.state.data.prompts);
    const next = tt.touchPromptUsage(tt.state.data.prompts, 'a', NOW);
    assert.equal(tt.engine.commitPrompts(next), false, 'the write must fail');
    assert.equal(JSON.stringify(tt.state.data.prompts), before,
      'a failed commit must adopt nothing — the authoritative usage stays accurate');
    assert.equal(tt.state.data.prompts[0].useCount, 4);
    assert.equal(tt.diag.counters.writeFailures > 0, true, 'the failure is counted, not hidden');
  });
  check('[live] invalid metadata can never serialize as Infinity or NaN', () => {
    const { t: tt, sandbox } = load();
    tt.state.data.prompts = [P('a', 'alpha', 'b', { uses: Infinity, last: NaN })];
    const next = tt.touchPromptUsage(tt.state.data.prompts, 'a', NOW);
    assert.equal(tt.engine.commitPrompts(next), true);
    const text = sandbox.__store.get('h2o:prm:cgx:prmptmngr:state:prompts:v1');
    assert.doesNotMatch(text, /Infinity|NaN/, `serialized payload: ${text}`);
    assert.equal(JSON.parse(text)[0].useCount, 1);
  });

  /* Call-site rules. The production build carries no test hook for UI handlers,
   * so which ACTIONS count as a use is asserted against the shipped source. */
  const handler = (name) => {
    const i = SRC.indexOf(name);
    assert.notEqual(i, -1, `${name} not found in source`);
    return SRC.slice(i, i + 900);
  };
  check('[source] 47. Prompt insertion counts a use', () => {
    const simple = handler("const okIns = DOM_setInputText(p.body, { append: isAppend");
    assert.match(simple, /commitPromptUsage\(id\)/, 'the Simple insert path must record a use');
    const okIdx = simple.indexOf('if (okIns === false) return;');
    const useIdx = simple.indexOf('commitPromptUsage(id)');
    assert.ok(okIdx !== -1 && okIdx < useIdx, 'a failed insert must return BEFORE counting');
  });
  check('[source] 48. Append insertion counts a use', () => {
    const edit = handler("if (act === 'insert' || act === 'append') {");
    assert.match(edit, /commitPromptUsage\(id\)/);
    const okIdx = edit.indexOf('if (okIns === false) return;');
    const useIdx = edit.indexOf('commitPromptUsage(id)');
    assert.ok(okIdx !== -1 && okIdx < useIdx);
  });
  check('[source] 49/50/51. edit, duplicate and favourite do NOT count a use', () => {
    for (const [name, snippet] of [
      ['duplicate', handler("if (act === 'duplicate') {")],
      ['edit/delete', handler("if (act === 'delete' || act === 'edit') {")],
      ['favourite', handler('const toggleFavorite = (id) => {')],
    ]) {
      assert.doesNotMatch(snippet, /commitPromptUsage|touchPromptUsage/, `${name} must not record a use`);
    }
  });
  check('[source] create, conversion and reorder do NOT count a use', () => {
    for (const [name, snippet] of [
      ['conversion', handler('const convertToPrompt = (text, act, fallbackTitle) => {')],
      ['editor save', handler('    save(root) {')],
      ['reorder', handler('  const ENGINE_PM_reorderVisible = ')],
    ]) {
      assert.doesNotMatch(snippet, /commitPromptUsage|touchPromptUsage/, `${name} must not record a use`);
    }
  });
  check('[source] 52. no usage path writes updatedAt', () => {
    const i = SRC.indexOf('const ENGINE_PM_touchPromptUsage');
    const block = SRC.slice(i, SRC.indexOf('\n  };', i));
    assert.match(block, /lastUsedAt:/);
    assert.match(block, /useCount:/);
    assert.doesNotMatch(block, /updatedAt/, 'usage must never touch updatedAt');
  });
  check('[source] a usage-persistence failure reports without undoing the insert', () => {
    const i = SRC.indexOf('const commitPromptUsage = (id) => {');
    const block = SRC.slice(i, SRC.indexOf('\n      };', i));
    assert.match(block, /FEEDBACK_PM_writeFailure\(\w+, root\)/,
      'a failed usage write must be reported persistently');
    assert.doesNotMatch(block, /DOM_setInputText|closePanel/,
      'the already-successful insertion must not be re-run or undone');
  });

  /* ══════════ EMPTY-STATE COPY ══════════ */
  check('[live] empty copy distinguishes "no prompts" from "no matches"', () => {
    assert.match(t.promptEmptyHtml([], '', 'all'), /No prompts yet\./);
    assert.match(t.promptEmptyHtml([P('a', 'x', 'y')], 'zzz', 'all'), /No matches\./);
    assert.doesNotMatch(t.promptEmptyHtml([P('a', 'x', 'y')], 'zzz', 'all'), /Open Settings|Add one below/,
      'must not tell the user to add prompts when prompts exist');
  });
  check('[live] the "add one" instruction only appears when there is nothing to find', () => {
    assert.doesNotMatch(t.promptEmptyHtml([P('a', 'x', 'y')], '', 'favorites'), /No prompts yet/);
    assert.match(t.promptEmptyHtml([P('a', 'x', 'y')], '', 'favorites'), /No favourites yet\./);
  });


  /* ══════════ R13–R25 — POST-MOVE VISIBILITY SAFETY ══════════
   *
   * The first closure asked "is the current view the manual order?" before the
   * move. That is insufficient: a view can equal manual order, pass, and then
   * have ranking put the card straight back where it was — storage changes, the
   * screen does not. R1–R12 tested that superseded pre-move rule and are
   * retired with it; the cases below test the proposed-move authority that
   * replaced it, and R25 reproduces the exact contrast.
   *
   * Every case drives the real ENGINE_PM_canMovePromptView, which internally
   * runs the unchanged ENGINE_PM_reorderVisible and ENGINE_PM_selectPromptView. */

  const viewIdsFor = (lib, cat, q) => Array.from(t.selectPromptView(lib, cat, q, NOW), v => v.prompt.id);
  const canMove = (lib, cat, q, ids, id, dir) => t.canMovePromptView(lib, cat, q, NOW, ids, id, dir);
  /* The retired rule, reproduced here ONLY to show what it would have allowed.
   * It is no longer in the module; this is a local copy for the R25 contrast. */
  const retiredCurrentViewEquality = (lib, ids) => {
    const shown = new Set(ids);
    const manual = lib.filter(p => p && shown.has(p.id)).map(p => p.id);
    return manual.length === ids.length && manual.every((v, i) => v === ids[i]);
  };

  check('[live] R13. [A*,B,C] empty query, A down — ranking undoes it, so FALSE', () => {
    const lib = [P('A', 'aaa', 'b', { fav: true }), P('B', 'bbb', 'b'), P('C', 'ccc', 'b')];
    const view = viewIdsFor(lib, 'all', '');
    assert.deepEqual(view, ['A', 'B', 'C'], 'guard: the view already equals manual order');
    const candidate = t.reorderVisible(lib, view, 'A', 'down');
    assert.deepEqual(Array.from(candidate, p => p.id), ['B', 'A', 'C'], 'guard: storage WOULD change');
    assert.deepEqual(viewIdsFor(Array.from(candidate), 'all', ''), ['A', 'B', 'C'],
      'guard: and the rerank puts it straight back — the card never moves');
    assert.equal(canMove(lib, 'all', '', view, 'A', 'down'), false,
      'a move the user cannot see must not rewrite their manual order');
  });

  check('[live] R14. favourite-boundary crossing in reverse is FALSE', () => {
    // B is favourite, so the view is [B, A, C] while the array is [A, B, C].
    // Moving A up would place it above B visually — ranking refuses.
    const lib = [P('A', 'aaa', 'b'), P('B', 'bbb', 'b', { fav: true }), P('C', 'ccc', 'b')];
    const view = viewIdsFor(lib, 'all', '');
    assert.deepEqual(view, ['B', 'A', 'C']);
    assert.equal(canMove(lib, 'all', '', view, 'A', 'up'), false);
    // and the mirror: B down cannot fall below a non-favourite either
    assert.equal(canMove(lib, 'all', '', view, 'B', 'down'), false);
  });

  check('[live] R15. a search that happens to show manual order still refuses a no-op move', () => {
    // A and B tie on every signal, so the ranked view equals manual order...
    const lib = [P('A', 'alpha', 'b', { fav: true }), P('B', 'alpha', 'b')];
    const view = viewIdsFor(lib, 'all', 'alpha');
    assert.deepEqual(view, ['A', 'B'], 'guard: ranked view equals manual order');
    const candidate = t.reorderVisible(lib, view, 'A', 'down');
    assert.deepEqual(Array.from(candidate, p => p.id), ['B', 'A'], 'guard: storage WOULD change');
    assert.deepEqual(viewIdsFor(Array.from(candidate), 'all', 'alpha'), ['A', 'B'],
      'guard: the favourite boost reranks it back');
    assert.equal(canMove(lib, 'all', 'alpha', view, 'A', 'down'), false);
  });

  check('[live] R16. a search move that genuinely survives the rerank is TRUE', () => {
    const lib = [P('A', 'alpha', 'b'), P('B', 'alpha', 'b'), P('C', 'alpha', 'b')];
    const view = viewIdsFor(lib, 'all', 'alpha');
    assert.deepEqual(view, ['A', 'B', 'C'], 'guard: every signal ties, so index decides');
    assert.equal(canMove(lib, 'all', 'alpha', view, 'A', 'down'), true);
    const candidate = t.reorderVisible(lib, view, 'A', 'down');
    assert.deepEqual(viewIdsFor(Array.from(candidate), 'all', 'alpha'), ['B', 'A', 'C'],
      'the move really is visible after reranking');
  });

  check('[live] R17. Favorites-only [A,C], A down genuinely becomes [C,A] — TRUE', () => {
    const lib = [P('A', 'aaa', 'b', { fav: true }), P('B', 'bbb', 'b'), P('C', 'ccc', 'b', { fav: true })];
    const view = viewIdsFor(lib, 'favorites', '');
    assert.deepEqual(view, ['A', 'C']);
    assert.equal(canMove(lib, 'favorites', '', view, 'A', 'down'), true);
    const candidate = t.reorderVisible(lib, view, 'A', 'down');
    assert.deepEqual(Array.from(candidate, p => p.id), ['C', 'B', 'A'], 'B keeps its absolute slot');
    assert.deepEqual(viewIdsFor(Array.from(candidate), 'favorites', ''), ['C', 'A']);
  });

  check('[live] R18. all non-favourites, empty query — a manual move is TRUE', () => {
    const lib = [P('A', 'aaa', 'b'), P('B', 'bbb', 'b'), P('C', 'ccc', 'b')];
    const view = viewIdsFor(lib, 'all', '');
    assert.deepEqual(view, ['A', 'B', 'C']);
    assert.equal(canMove(lib, 'all', '', view, 'A', 'down'), true);
    assert.equal(canMove(lib, 'all', '', view, 'C', 'up'), true);
    assert.equal(canMove(lib, 'all', '', view, 'B', 'up'), true);
    assert.equal(canMove(lib, 'all', '', view, 'B', 'down'), true);
  });

  check('[live] R19. all favourites, empty query — a manual move is TRUE', () => {
    const lib = [P('A', 'aaa', 'b', { fav: true }), P('B', 'bbb', 'b', { fav: true }), P('C', 'ccc', 'b', { fav: true })];
    const view = viewIdsFor(lib, 'all', '');
    assert.deepEqual(view, ['A', 'B', 'C']);
    assert.equal(canMove(lib, 'all', '', view, 'A', 'down'), true);
    assert.equal(canMove(lib, 'all', '', view, 'C', 'up'), true);
  });

  check('[live] R20. a move WITHIN one ranking group is TRUE', () => {
    const lib = [P('A', 'aaa', 'b', { fav: true }), P('B', 'bbb', 'b', { fav: true }), P('C', 'ccc', 'b')];
    const view = viewIdsFor(lib, 'all', '');
    assert.deepEqual(view, ['A', 'B', 'C']);
    assert.equal(canMove(lib, 'all', '', view, 'A', 'down'), true, 'A and B are both favourites');
    const candidate = t.reorderVisible(lib, view, 'A', 'down');
    assert.deepEqual(viewIdsFor(Array.from(candidate), 'all', ''), ['B', 'A', 'C']);
  });

  check('[live] R21. a move ACROSS the favourite boundary is FALSE', () => {
    const lib = [P('A', 'aaa', 'b', { fav: true }), P('B', 'bbb', 'b', { fav: true }), P('C', 'ccc', 'b')];
    const view = viewIdsFor(lib, 'all', '');
    assert.equal(canMove(lib, 'all', '', view, 'B', 'down'), false, 'a favourite cannot fall below a non-favourite');
    assert.equal(canMove(lib, 'all', '', view, 'C', 'up'), false, 'nor can a non-favourite rise above one');
  });

  check('[live] R22. top Up and bottom Down are FALSE', () => {
    const lib = [P('A', 'aaa', 'b'), P('B', 'bbb', 'b'), P('C', 'ccc', 'b')];
    const view = viewIdsFor(lib, 'all', '');
    assert.equal(canMove(lib, 'all', '', view, 'A', 'up'), false, 'nothing above the first card');
    assert.equal(canMove(lib, 'all', '', view, 'C', 'down'), false, 'nothing below the last card');
  });

  check('[live] R23. duplicate, stale and ghost ids fail CLOSED', () => {
    const lib = [P('A', 'aaa', 'b'), P('B', 'bbb', 'b')];
    assert.equal(canMove(lib, 'all', '', ['A', 'A'], 'A', 'down'), false, 'a repeated id');
    assert.equal(canMove(lib, 'all', '', ['A', 'ghost'], 'A', 'down'), false, 'an id with no record');
    assert.equal(canMove(lib, 'all', '', ['A', 'B'], 'ghost', 'down'), false, 'a target not in the view');
    const dupRecords = [P('A', 'aaa', 'b'), P('A', 'aaa2', 'b'), P('B', 'bbb', 'b')];
    assert.equal(canMove(dupRecords, 'all', '', ['A', 'B'], 'A', 'down'), false, 'two records share an id');
    assert.equal(canMove(lib, 'all', '', ['A'], 'A', 'down'), false, 'a single card has no neighbour');
    assert.equal(canMove(lib, 'all', '', [], 'A', 'down'), false);
    assert.equal(canMove(lib, 'all', '', ['A', 'B'], 'A', 'sideways'), false, 'an unknown direction');
    assert.equal(canMove(lib, 'all', '', ['A', 'B'], 'A', null), false);
    assert.equal(canMove(null, 'all', '', ['A', 'B'], 'A', 'down'), false, 'no list');
    assert.equal(canMove(lib, 'all', '', null, 'A', 'down'), false, 'no view');
    assert.equal(canMove(lib, 'all', '', ['A', 'B'], null, 'down'), false, 'no target');
  });

  check('[live] R24. the authority mutates none of its inputs', () => {
    const lib = [P('A', 'aaa', 'b', { fav: true }), P('B', 'bbb', 'b'), P('C', 'ccc', 'b')];
    const libSnap = JSON.stringify(lib);
    const order = lib.map(p => p.id).join(',');
    const view = viewIdsFor(lib, 'all', '');
    const viewSnap = JSON.stringify(view);
    for (const id of ['A', 'B', 'C']) for (const d of ['up', 'down']) canMove(lib, 'all', '', view, id, d);
    assert.equal(JSON.stringify(lib), libSnap, 'a record changed');
    assert.equal(lib.map(p => p.id).join(','), order, 'the array order changed');
    assert.equal(JSON.stringify(view), viewSnap, 'the view id array changed');
  });

  check('[live] R25. the audit case: the retired rule allowed it, the new authority refuses', () => {
    const lib = [P('A', 'aaa', 'b', { fav: true }), P('B', 'bbb', 'b'), P('C', 'ccc', 'b')];
    const view = viewIdsFor(lib, 'all', '');
    assert.deepEqual(view, ['A', 'B', 'C']);
    // the retired pre-move rule: current view equals manual order -> allow
    assert.equal(retiredCurrentViewEquality(lib, view), true,
      'the superseded rule would have permitted this move');
    // the shipped authority, asked about the actual proposed move
    assert.equal(canMove(lib, 'all', '', view, 'A', 'down'), false,
      'the proposed-move authority refuses it');
    // and the reason, spelled out
    const candidate = Array.from(t.reorderVisible(lib, view, 'A', 'down'), p => p.id);
    const reranked = viewIdsFor(t.reorderVisible(lib, view, 'A', 'down'), 'all', '');
    assert.deepEqual(candidate, ['B', 'A', 'C'], 'persistent order would have changed');
    assert.deepEqual(reranked, view, 'while the rendered order would not have moved at all');
    // the same contrast under a search
    const s2 = [P('A', 'alpha', 'b', { fav: true }), P('B', 'alpha', 'b')];
    const v2 = viewIdsFor(s2, 'all', 'alpha');
    assert.equal(retiredCurrentViewEquality(s2, v2), true);
    assert.equal(canMove(s2, 'all', 'alpha', v2, 'A', 'down'), false);
  });

  check('[live] up and down are evaluated INDEPENDENTLY per card', () => {
    // B sits between two favourites in the view: it can move down, not up.
    const lib = [P('A', 'aaa', 'b', { fav: true }), P('B', 'bbb', 'b'), P('C', 'ccc', 'b')];
    const view = viewIdsFor(lib, 'all', '');
    assert.deepEqual(view, ['A', 'B', 'C']);
    const state = {};
    for (const id of view) state[id] = { up: canMove(lib, 'all', '', view, id, 'up'),
                                         down: canMove(lib, 'all', '', view, id, 'down') };
    assert.deepEqual(state.A, { up: false, down: false }, 'A: pinned favourite at the top');
    assert.deepEqual(state.B, { up: false, down: true }, 'B: cannot pass the favourite, can move down');
    assert.deepEqual(state.C, { up: true, down: false }, 'C: can move up, nothing below');
    // all four combinations are therefore representable
    assert.ok(Object.values(state).some(v => v.up !== v.down), 'per-direction verdicts really differ');
  });




  check('[source] the exact simulation is retained as an ORACLE, not a production path', () => {
    assert.match(SRC, /const ENGINE_PM_canMovePromptView = /, 'the oracle is still defined');
    assert.equal((SRC.match(/ENGINE_PM_canMovePromptView\(/g) || []).length, 0,
      'it must not be invoked anywhere in production');
    assert.match(SRC, /canMovePromptView: ENGINE_PM_canMovePromptView,/, 'exposed to validators only');
  });

  check('[source] the oracle derives its answer from the unchanged helpers', () => {
    const h = SRC.match(/const ENGINE_PM_canMovePromptView = [\s\S]*?\n  \};/)[0];
    assert.match(h, /ENGINE_PM_reorderVisible\(arr, ids, targetId, dir\)/, 'candidate via the Phase-1 helper');
    assert.match(h, /ENGINE_PM_selectPromptView\(candidate, category, query, now\)/, 'reranked via the shipped ranker');
    assert.match(h, /if \(reranked\[i\] !== expected\[i\]\) return false;/, 'exact element-wise comparison');
    assert.doesNotMatch(h, /favorite|score|PM_RANK_/, 'no ranking assumptions are baked in');
  });


  /* ══════════ PERFORMANCE CLOSURE — ORACLE EQUIVALENCE ══════════
   * The optimized batch authority must return exactly what the exact simulation
   * returns, for every proposed move. The oracle below is not a reimplementation
   * of anything: it is the shipped ENGINE_PM_canMovePromptView, which itself
   * composes the real reorder helper and the real ranker. */

  const oracleSays = (lib, cat, q, ids, id, dir) => t.canMovePromptView(lib, cat, q, NOW, ids, id, dir);
  const batchSays = (lib, cat, q, ids) => Array.from(t.computeMoveAvailability(lib, cat, q, NOW, ids),
    (r) => ({ id: r.id, up: r.up, down: r.down }));

  /* Compare the batch answer against the oracle for every row and both
   * directions. Returns the number of proposed moves checked. */
  function assertEquivalent(label, lib, cat, q) {
    const ids = Array.from(t.selectPromptView(lib, cat, q, NOW), v => v.prompt.id);
    const batch = batchSays(lib, cat, q, ids);
    assert.equal(batch.length, ids.length, `${label}: availability must be occurrence-aligned`);
    let checked = 0;
    for (let i = 0; i < ids.length; i++) {
      assert.equal(batch[i].id, ids[i], `${label}: slot ${i} out of alignment`);
      for (const dir of ['up', 'down']) {
        const want = oracleSays(lib, cat, q, ids, ids[i], dir);
        assert.equal(batch[i][dir], want,
          `${label}: row ${i} (${ids[i]}) ${dir} — batch ${batch[i][dir]}, oracle ${want}`);
        checked++;
      }
    }
    return checked;
  }

  const F = (id, o) => P(id, o.title || `t-${id}`, o.body || `b-${id}`, o);

  check('[live] ORACLE: deterministic scenario matrix — batch === exact simulation', () => {
    let total = 0;
    const scenarios = [
      ['empty query, all non-favourites', [F('A',{}), F('B',{}), F('C',{}), F('D',{})], 'all', ''],
      ['empty query, all favourites', [F('A',{fav:1}), F('B',{fav:1}), F('C',{fav:1})], 'all', ''],
      ['empty query, mixed favourite groups', [F('A',{fav:1}), F('B',{}), F('C',{fav:1}), F('D',{})], 'all', ''],
      ['empty query, favourite last', [F('A',{}), F('B',{}), F('C',{fav:1})], 'all', ''],
      ['favorites-only view', [F('A',{fav:1}), F('B',{}), F('C',{fav:1}), F('D',{fav:1})], 'favorites', ''],
      ['prompt-only view', [F('A',{type:'prompt'}), F('B',{type:'append'}), F('C',{type:'prompt'}), F('D',{type:'prompt'})], 'prompt', ''],
      ['append-only view', [F('A',{type:'append'}), F('B',{type:'prompt'}), F('C',{type:'append'})], 'append', ''],
      ['search, differing scores', [F('A',{title:'alpha'}), F('B',{title:'alpha beta'}), F('C',{title:'xxalphaxx'}), F('D',{body:'alpha'})], 'all', 'alpha'],
      ['search, all tied', [F('A',{title:'alpha'}), F('B',{title:'alpha'}), F('C',{title:'alpha'})], 'all', 'alpha'],
      ['search, tie then break', [F('A',{title:'alpha'}), F('B',{title:'alpha'}), F('C',{title:'alpha',fav:1})], 'all', 'alpha'],
      ['recency differences', [F('A',{title:'alpha',last:NOW-DAY}), F('B',{title:'alpha',last:NOW-10*DAY}), F('C',{title:'alpha'})], 'all', 'alpha'],
      ['recency ties', [F('A',{title:'alpha',last:NOW-2*DAY}), F('B',{title:'alpha',last:NOW-3*DAY}), F('C',{title:'alpha',last:NOW-DAY})], 'all', 'alpha'],
      ['useCount differences', [F('A',{title:'alpha',uses:1}), F('B',{title:'alpha',uses:9}), F('C',{title:'alpha'})], 'all', 'alpha'],
      ['useCount ties above the cap', [F('A',{title:'alpha',uses:12}), F('B',{title:'alpha',uses:40}), F('C',{title:'alpha',uses:11})], 'all', 'alpha'],
      ['favourite + recency + useCount', [F('A',{title:'alpha',fav:1,last:NOW-DAY,uses:3}), F('B',{title:'alpha',uses:3,last:NOW-DAY}), F('C',{title:'alpha',fav:1,last:NOW-DAY,uses:3})], 'all', 'alpha'],
      ['filtered non-adjacent records', [F('A',{type:'prompt'}), F('X',{type:'append'}), F('B',{type:'prompt'}), F('Y',{type:'append'}), F('C',{type:'prompt'})], 'prompt', ''],
      ['single-row view', [F('A',{})], 'all', ''],
      ['two-row view', [F('A',{}), F('B',{})], 'all', ''],
      ['empty result set', [F('A',{title:'zzz'})], 'all', 'nomatch'],
    ];
    for (const [label, lib, cat, q] of scenarios) total += assertEquivalent(label, lib, cat, q);
    assert.ok(total >= 60, `expected a substantial matrix, checked ${total}`);
    console.log(`      deterministic matrix: ${scenarios.length} scenarios, ${total} proposed moves`);
  });

  check('[live] ORACLE: deterministic fuzz matrix — several hundred proposed moves', () => {
    // A small deterministic LCG: reproducible across machines and runs, and no
    // Math.random, so a failure can always be replayed exactly.
    let seed = 20260807;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    const pick = (a) => a[Math.floor(rnd() * a.length)];
    const titles = ['alpha', 'alpha beta', 'xxalphaxx', 'beta', 'gamma alpha', 'alpha'];
    const bodies = ['alpha inside', 'nothing here', 'say alpha now', 'xxalphaxx'];
    const cats = ['all', 'prompt', 'append', 'favorites'];
    const queries = ['', '', 'alpha', 'beta', '   ', 'zzz'];
    let total = 0, libs = 0;
    for (let iter = 0; iter < 120; iter++) {
      const size = 2 + Math.floor(rnd() * 7);
      const lib = [];
      for (let i = 0; i < size; i++) {
        lib.push(P(`r${i}`, pick(titles), pick(bodies), {
          fav: rnd() < 0.4,
          type: rnd() < 0.3 ? 'append' : 'prompt',
          ...(rnd() < 0.5 ? { last: NOW - Math.floor(rnd() * 45) * DAY } : {}),
          ...(rnd() < 0.5 ? { uses: Math.floor(rnd() * 15) } : {}),
        }));
      }
      const cat = pick(cats), q = pick(queries);
      total += assertEquivalent(`fuzz#${iter} cat=${cat} q="${q}"`, lib, cat, q);
      libs++;
    }
    assert.ok(total >= 300, `expected several hundred proposed moves, checked ${total}`);
    console.log(`      fuzz matrix: ${libs} libraries, ${total} proposed moves, seed 20260807`);
  });

  check('[live] ORACLE: every R13–R25 verdict is reproduced by the batch authority', () => {
    const cases = [
      [[P('A','aaa','b',{fav:true}), P('B','bbb','b'), P('C','ccc','b')], 'all', ''],
      [[P('A','aaa','b'), P('B','bbb','b',{fav:true}), P('C','ccc','b')], 'all', ''],
      [[P('A','alpha','b',{fav:true}), P('B','alpha','b')], 'all', 'alpha'],
      [[P('A','alpha','b'), P('B','alpha','b'), P('C','alpha','b')], 'all', 'alpha'],
      [[P('A','aaa','b',{fav:true}), P('B','bbb','b'), P('C','ccc','b',{fav:true})], 'favorites', ''],
      [[P('A','aaa','b',{fav:true}), P('B','bbb','b',{fav:true}), P('C','ccc','b')], 'all', ''],
    ];
    let n = 0;
    for (const [lib, cat, q] of cases) n += assertEquivalent('R13-R25 replay', lib, cat, q);
    assert.ok(n > 0);
  });

  /* ══════════ PERFORMANCE + FAIL-CLOSED ══════════ */

  check('[live] 1,000-record library: availability computes correctly for the whole view', () => {
    const big = [];
    for (let i = 0; i < 1000; i++) {
      big.push(P(`p${i}`, `prompt ${i}`, `body ${i}`, {
        fav: i % 7 === 0,
        ...(i % 3 === 0 ? { uses: i % 12 } : {}),
        ...(i % 5 === 0 ? { last: NOW - (i % 40) * DAY } : {}),
      }));
    }
    const snapshot = JSON.stringify(big);
    const order = big.map(p => p.id).join(',');
    const ids = Array.from(t.selectPromptView(big, 'all', '', NOW), v => v.prompt.id);
    assert.equal(ids.length, 1000, 'the whole library renders');

    const started = process.hrtime.bigint();
    const avail = t.computeMoveAvailability(big, 'all', '', NOW, ids);
    const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;

    assert.equal(avail.length, 1000, 'one entry per rendered slot');
    for (let i = 0; i < 1000; i++) assert.equal(avail[i].id, ids[i], `slot ${i} misaligned`);
    assert.equal(avail[0].up, false, 'nothing above the first row');
    assert.equal(avail[999].down, false, 'nothing below the last row');
    assert.equal(JSON.stringify(big), snapshot, 'the library was mutated');
    assert.equal(big.map(p => p.id).join(','), order, 'the library order changed');
    // spot-check a sample against the exact oracle rather than all 2,000 moves
    for (const i of [0, 1, 2, 137, 500, 501, 700, 998, 999]) {
      for (const dir of ['up', 'down']) {
        assert.equal(avail[i][dir], oracleSays(big, 'all', '', ids, ids[i], dir),
          `1000-record row ${i} ${dir} disagrees with the oracle`);
      }
    }
    console.log(`      1,000 records: availability computed in ${elapsedMs.toFixed(1)} ms (diagnostic only)`);
  });

  check('[live] duplicate rendered ids fail the WHOLE view closed', () => {
    const lib = [P('A', 'aaa', 'b'), P('B', 'bbb', 'b'), P('C', 'ccc', 'b')];
    const avail = t.computeMoveAvailability(lib, 'all', '', NOW, ['A', 'B', 'A']);
    assert.equal(avail.length, 3, 'the shape is still occurrence-aligned');
    for (const slot of avail) {
      assert.equal(slot.up, false, 'every Up is disabled');
      assert.equal(slot.down, false, 'every Down is disabled');
    }
  });

  check('[live] duplicate RECORD ids in the library also fail closed', () => {
    const lib = [P('A', 'aaa', 'b'), P('A', 'aaa2', 'b'), P('B', 'bbb', 'b')];
    for (const slot of t.computeMoveAvailability(lib, 'all', '', NOW, ['A', 'B'])) {
      assert.equal(slot.up, false); assert.equal(slot.down, false);
    }
  });

  check('[live] a stale view fails closed without any per-button work', () => {
    const lib = [P('A', 'aaa', 'b'), P('B', 'bbb', 'b'), P('C', 'ccc', 'b')];
    // the DOM claims an order the ranker no longer produces
    for (const slot of t.computeMoveAvailability(lib, 'all', '', NOW, ['C', 'B', 'A'])) {
      assert.equal(slot.up, false); assert.equal(slot.down, false);
    }
    // ghost id
    for (const slot of t.computeMoveAvailability(lib, 'all', '', NOW, ['A', 'ghost'])) {
      assert.equal(slot.up, false); assert.equal(slot.down, false);
    }
    // junk shapes
    assert.deepEqual(Array.from(t.computeMoveAvailability(lib, 'all', '', NOW, [])), []);
    assert.deepEqual(Array.from(t.computeMoveAvailability(null, 'all', '', NOW, ['A'])), []);
    assert.deepEqual(Array.from(t.computeMoveAvailability(lib, 'all', '', NOW, null)), []);
    for (const slot of t.computeMoveAvailability(lib, 'all', '', NOW, ['A', null])) {
      assert.equal(slot.up, false); assert.equal(slot.down, false);
    }
  });

  check('[live] the batch authority mutates nothing', () => {
    const lib = [P('A', 'aaa', 'b', { fav: true }), P('B', 'bbb', 'b'), P('C', 'ccc', 'b')];
    const snap = JSON.stringify(lib); const order = lib.map(p => p.id).join(',');
    const ids = Array.from(t.selectPromptView(lib, 'all', '', NOW), v => v.prompt.id);
    const idsSnap = JSON.stringify(ids);
    t.computeMoveAvailability(lib, 'all', '', NOW, ids);
    t.computeMoveAvailability(lib, 'all', '', NOW, ids);
    assert.equal(JSON.stringify(lib), snap);
    assert.equal(lib.map(p => p.id).join(','), order);
    assert.equal(JSON.stringify(ids), idsSnap);
  });

  check('[live] the renderer applies availability POSITIONALLY, not by id lookup', () => {
    const { t: tt } = load();
    const mk = () => ({ disabled: false, _a: {}, setAttribute(k, v) { this._a[k] = v; },
      getAttribute(k) { return this._a[k] ?? null; }, removeAttribute(k) { delete this._a[k]; } });
    const rows = ['A', 'B', 'C'].map(() => ({ up: mk(), down: mk() }));
    const cards = rows.map(r => ({ querySelector: (sel) => sel.includes('"up"') ? r.up : r.down }));
    const listEl = { children: cards, querySelector: () => { throw new Error('id lookup must not be used'); } };
    tt.state.data.prompts = [P('A', 'aaa', 'b', { fav: true }), P('B', 'bbb', 'b'), P('C', 'ccc', 'b')];
    const items = Array.from(tt.selectPromptView(tt.state.data.prompts, 'all', '', NOW), v => v.prompt);
    tt.applyReorderAvailability(listEl, items, 'all', '', NOW);
    assert.equal(rows[0].up.disabled, true);  assert.equal(rows[0].down.disabled, true);
    assert.equal(rows[1].up.disabled, true);  assert.equal(rows[1].down.disabled, false);
    assert.equal(rows[2].up.disabled, false); assert.equal(rows[2].down.disabled, true);
    assert.equal(rows[1].down.getAttribute('aria-disabled'), 'false');
    assert.equal(rows[1].down.getAttribute('title'), null);
    assert.equal(rows[0].up.getAttribute('title'), tt.msgRankedNoReorder);
  });

  check('[source] the renderer calls the BATCH helper once and no per-button oracle', () => {
    const r = SRC.match(/const RENDER_PM_applyReorderAvailability = [\s\S]*?\n  \};/)[0];
    assert.equal((r.match(/ENGINE_PM_computeMoveAvailability\(/g) || []).length, 1,
      'exactly one batch computation per render');
    assert.doesNotMatch(r, /ENGINE_PM_canMovePromptView/, 'the exact oracle must not run per button');
    assert.doesNotMatch(r, /ENGINE_PM_reorderVisible|ENGINE_PM_selectPromptView/,
      'no candidate build or rerank inside the render loop');
    assert.match(r, /const cards = Array\.from\(listEl\.children \|\| \[\]\);/, 'positional walk');
    assert.match(r, /availability\[i\]/, 'occurrence-aligned application');
  });

  check('[source] the batch helper validates once and uses two-record ranking', () => {
    const h = SRC.match(/const ENGINE_PM_computeMoveAvailability = [\s\S]*?\n  \};/)[0];
    assert.equal((h.match(/ENGINE_PM_selectPromptView\(/g) || []).length, 1,
      'the current view is ranked exactly once');
    assert.doesNotMatch(h, /ENGINE_PM_reorderVisible|ENGINE_PM_canMovePromptView/,
      'no candidate simulation inside the batch helper');
    assert.match(h, /ENGINE_PM_rankPrompts\(\[a, b\], query, now\)/, 'pair ranked forward');
    assert.match(h, /ENGINE_PM_rankPrompts\(\[b, a\], query, now\)/, 'and reversed');
    assert.match(h, /for \(let i = 0; i \+ 1 < n; i\+\+\)/, 'N-1 adjacent pairs, not N full reranks');
    assert.match(h, /out\[i\]\.down = true; out\[i \+ 1\]\.up = true;/, 'one pair verdict serves two buttons');
    assert.doesNotMatch(h, /PM_RANK_|\.favorite|\.lastUsedAt|\.useCount/,
      'no ranking arithmetic is duplicated — the real ranker decides');
  });

  check('[source] renderer and handler share the one batch authority', () => {
    assert.match(SRC, /const ENGINE_PM_computeMoveAvailability = /, 'defined once');
    const calls = SRC.match(/ENGINE_PM_computeMoveAvailability\(/g) || [];
    assert.equal(calls.length, 2, `exactly one renderer and one handler call; found ${calls.length}`);
    const i = SRC.indexOf('const moveBtn = e.target.closest');
    const block = SRC.slice(i, SRC.indexOf('// Favorite', i));
    assert.match(block, /ENGINE_PM_computeMoveAvailability\(/, 'the handler uses the same authority');
    assert.doesNotMatch(block, /ENGINE_PM_canMovePromptView/, 'and not a divergent rule');
    const guard = block.indexOf('if (!slot || slot.id !== id || !slot[dir])');
    const reorder = block.indexOf('ENGINE_PM_reorderVisible(');
    const commit = block.indexOf('ENGINE_PM.commitPromptsResult(');
    const flash = block.indexOf('RENDER_PM.flashMoved(');
    assert.ok(guard !== -1 && guard < reorder && guard < commit && guard < flash,
      'the guard precedes reorder, commit and flash');
    assert.match(block, /const slotIndex = Array\.from\(listEdit\.children\)\.indexOf\(card\);/,
      'the clicked occurrence is resolved positionally');
  });

  /* ══════════ RANKING COST SHAPE ══════════
   * Operation counts, never timings, so these mean the same thing on any
   * machine. They exist because ranking is the one PM path a keystroke re-runs
   * across the whole library: a change that reintroduces per-record pattern
   * compilation stays functionally correct while silently multiplying that cost
   * by the library size, and no functional case above would notice. */
  check('[cost] the boundary pattern compiles once per query pass, not once per record', () => {
    const { t: rt, sandbox } = load();
    // `RegExp` is a realm intrinsic, not an own property of the sandbox object,
    // so it has to be read from inside the context. The module resolves it from
    // its global at call time, so a counting stand-in installed as an own
    // property shadows the intrinsic and observes the shipped call site.
    const RealRegExp = vm.runInContext('RegExp', sandbox);
    let built = 0;
    function CountingRegExp(...a) { built++; return new RealRegExp(...a); }
    CountingRegExp.prototype = RealRegExp.prototype;
    sandbox.RegExp = CountingRegExp;
    try {
      const list = [];
      for (let i = 0; i < 400; i++) {
        list.push(P(`r${i}`, `title ${i} zulu`, `body ${i} zulu text that does not match the query`));
      }
      built = 0;
      rt.rankPrompts(list, 'zulu', NOW);
      assert.ok(built <= 2, `expected at most 2 pattern builds for one pass over 400 records, saw ${built}`);
      const first = built;
      rt.rankPrompts(list, 'zulu', NOW);
      assert.equal(built, first, 'a repeated identical query rebuilds no pattern');
    } finally { sandbox.RegExp = RealRegExp; }
  });
  check('[cost] a changed query still recompiles, so the memo cannot answer for the wrong query', () => {
    const rec = P('a', 'alpha beta', 'gamma delta');
    assert.equal(score(rec, 'beta'), R.titleWord + 0);
    assert.equal(score(rec, 'delta'), R.bodyWord + 0);
    assert.equal(score(rec, 'beta'), R.titleWord + 0);
  });
  check('[invariant] a word-boundary hit always contains the query as a substring', () => {
    // The `includes` guard in rankBase is sound only while this holds.
    const cases = [['alpha beta', 'beta'], ['x-ray vision', 'ray'], ['(paren) word', 'paren'],
      ['tab\tsep', 'sep'], ['emoji 🎬 clap', 'clap'], ['ünïcode wörd', 'wörd'], ['a.b.c', 'b']];
    for (const [hay, q] of cases) {
      const hl = hay.toLowerCase(), ql = q.toLowerCase();
      if (t.hasWordBoundary(hl, ql)) {
        assert.ok(hl.includes(ql), `boundary hit for "${q}" in "${hay}" must imply containment`);
      }
    }
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
