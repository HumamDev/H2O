#!/usr/bin/env node
// Validator for Prompt Manager (7A1a) Phase 2A — in-panel editor, card
// foundation, feedback, duplicate and conversion de-duplication.
//
// Everything here drives the REAL production module through the flag-gated
// `__H2O_PM_TEST__` hook. No editor rule, validation rule, normalization rule or
// duplicate rule is reimplemented in this file; a copy would pass while the
// shipped code was wrong.
//
// The Phase 1 guarantee this suite must never undermine: a failed commit must
// leave the editor open with the user's typed values intact, and must never
// report success. Several cases below assert exactly that by making the
// underlying storage write fail.

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
    console.log(`      ${m.split('\n')[0]}`);
  }
}

/* ── minimal DOM ────────────────────────────────────────────────────────────
 * Just enough for the editor to resolve its owned nodes and read/write field
 * values. Elements are registered by their `data-cgxui` token, which is exactly
 * how UI_PM.selOwned() addresses them in production. */
function makeEl(tag = 'div', lookup = null) {
  const el = {
    tagName: String(tag).toUpperCase(),
    _attrs: new Map(),
    value: '',
    textContent: '',
    disabled: false,
    title: '',
    style: {},
    children: [],
    classList: {
      _s: new Set(),
      add(...c) { c.forEach(x => this._s.add(x)); },
      remove(...c) { c.forEach(x => this._s.delete(x)); },
      toggle(c, on) { if (on === undefined) { this._s.has(c) ? this._s.delete(c) : this._s.add(c); } else if (on) this._s.add(c); else this._s.delete(c); },
      contains(c) { return this._s.has(c); },
    },
    setAttribute(k, v) { this._attrs.set(k, String(v)); },
    getAttribute(k) { return this._attrs.has(k) ? this._attrs.get(k) : null; },
    hasAttribute(k) { return this._attrs.has(k); },
    removeAttribute(k) { this._attrs.delete(k); },
    addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
    focus() {}, remove() {}, closest() { return null; },
    // DOM_q(sel, root) delegates to root.querySelector, so owned lookups must
    // resolve from the same registry the document uses.
    querySelector(sel) { return lookup ? lookup(sel) : null; },
    querySelectorAll() { return []; },
    contains() { return false; },
    getBoundingClientRect() { return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }; },
    get innerHTML() { return this._html || ''; },
    set innerHTML(v) { this._html = String(v); },
  };
  return el;
}

const OWNED_RE = /\[data-cgxui="([^"]+)"\]/;

function makeSandbox({ failWriteFor = null } = {}) {
  const registry = new Map();          // token -> element
  const lookup = (sel) => {
    const m = OWNED_RE.exec(String(sel));
    return (m && registry.has(m[1])) ? registry.get(m[1]) : null;
  };
  const reg = (token, tag) => { const e = makeEl(tag, lookup); e.setAttribute('data-cgxui', token); registry.set(token, e); return e; };

  // Tokens the editor and renderers address.
  for (const t of ['prmn-status', 'prmn-editor', 'prmn-ed-heading', 'prmn-ed-title-row',
    'prmn-ed-type-row', 'prmn-ed-type-prompt', 'prmn-ed-type-append', 'prmn-ed-fav',
    'prmn-ed-save', 'prmn-ed-cancel', 'prmn-ed-delete', 'prmn-ed-discard',
    'prmn-ed-discard-yes', 'prmn-ed-discard-no', 'prmn-list-edit', 'prmn-list-simple',
    'prmn-edit-filter-row', 'prmn-new-btn', 'prmn-wrap', 'prmn-panel',
    'prmn-mode-simple', 'prmn-mode-edit']) reg(t, 'div');
  reg('prmn-ed-title', 'input');
  reg('prmn-ed-body', 'textarea');

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

  const documentStub = {
    readyState: 'loading',                 // park boot; we drive helpers directly
    documentElement: { ...makeEl('html', lookup), classList: { contains: () => false, add() {}, remove() {}, toggle() {} } },
    body: makeEl('body', lookup),
    title: '',
    activeElement: null,
    createElement: (t) => makeEl(t, lookup),
    getElementById: () => null,
    querySelector: (sel) => lookup(sel),
    querySelectorAll: () => [],
    addEventListener() {}, removeEventListener() {},
    contains() { return true; },
  };

  const sandbox = {
    console,
    localStorage,
    performance: { now: () => 0 },
    CustomEvent: class { constructor(t, i) { this.type = t; this.detail = i?.detail; } },
    Event: class { constructor(t) { this.type = t; } },
    MutationObserver: class { observe() {} disconnect() {} },
    ResizeObserver: class { observe() {} disconnect() {} },
    CSS: { escape: (s) => String(s) },
    document: documentStub,
    window: {
      __H2O_PM_TEST__: true,
      location: { pathname: '/c/test', href: 'https://chatgpt.com/c/test' },
      localStorage,
      crypto: { randomUUID: (() => { let n = 0; return () => `gen-id-${++n}`; })() },
      setTimeout: (fn, ms) => { sandbox.__timers.push({ fn, ms }); return sandbox.__timers.length; },
      clearTimeout: (id) => { if (id) sandbox.__cleared.push(id); },
      setInterval: () => 0, clearInterval: () => {},
      requestAnimationFrame: () => 0, cancelAnimationFrame: () => {},
      getComputedStyle: () => ({ display: 'none', visibility: 'hidden', opacity: '0' }),
      innerWidth: 1280, innerHeight: 900,
      addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
    },
    __timers: [],
    __cleared: [],
    __registry: registry,
  };
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  return sandbox;
}

function load(opts) {
  const sandbox = makeSandbox(opts);
  const src = fs.readFileSync(path.join(REPO_ROOT, MODULE_REL), 'utf8');
  vm.runInContext(src, sandbox, { filename: MODULE_REL });
  const t = sandbox.window.H2O?.PM?.prmptmngr?.__test;
  if (!t) throw new Error('test hook missing — is __H2O_PM_TEST__ honoured?');
  return { t, sandbox, reg: sandbox.__registry };
}

const P = (id, title, body, type = 'prompt', favorite = false) =>
  ({ id, title, body, favorite, type, createdAt: 100, updatedAt: 100 });

function main() {
  console.log('── Prompt Manager 7A1a Phase 2A editor / card / feedback ─');

  /* ── pure conversion helpers ─────────────────────────────────────────── */
  const { t } = load();

  check('normalizeConvBody converts CRLF to LF', () => {
    assert.equal(t.normalizeConvBody('a\r\nb'), 'a\nb');
  });
  check('normalizeConvBody converts bare CR to LF', () => {
    assert.equal(t.normalizeConvBody('a\rb'), 'a\nb');
  });
  check('normalizeConvBody trims outer whitespace only', () => {
    assert.equal(t.normalizeConvBody('  a\n  b  '), 'a\n  b');
  });
  check('normalizeConvBody preserves case and internal blank lines', () => {
    assert.equal(t.normalizeConvBody('Ab\n\nCd'), 'Ab\n\nCd');
  });
  check('normalizeConvBody handles null/undefined safely', () => {
    assert.equal(t.normalizeConvBody(null), '');
    assert.equal(t.normalizeConvBody(undefined), '');
  });

  check('convTitle uses the first non-empty line', () => {
    assert.equal(t.convTitle('\n\n  Hello world  \nsecond', 'fb'), 'Hello world');
  });
  check('convTitle caps at the configured maximum and appends one ellipsis', () => {
    const long = 'x'.repeat(t.convTitleMax + 25);
    const got = t.convTitle(long, 'fb');
    assert.equal(got.length, t.convTitleMax + 1, 'cap + single ellipsis');
    assert.ok(got.endsWith('…'));
    assert.equal((got.match(/…/g) || []).length, 1, 'exactly one ellipsis');
  });
  check('convTitle does not append an ellipsis when it did not truncate', () => {
    assert.equal(t.convTitle('short', 'fb'), 'short');
  });
  check('convTitle falls back when no meaningful line exists', () => {
    assert.equal(t.convTitle('', 'From history'), 'From history');
    assert.equal(t.convTitle('\n \n', 'From draft'), 'From draft');
  });

  /* ── conversion duplicate rule ───────────────────────────────────────── */
  const list = [P('a', 'A', 'Same Body', 'prompt'), P('b', 'B', 'Other', 'append')];
  check('duplicate: same normalized body + same type IS a duplicate', () => {
    assert.ok(t.findConvDuplicate(list, t.normalizeConvBody('Same Body'), 'prompt'));
  });
  check('duplicate: CRLF variant of the same body still matches', () => {
    assert.ok(t.findConvDuplicate([P('a', 'A', 'l1\r\nl2')], t.normalizeConvBody('l1\nl2'), 'prompt'));
  });
  check('duplicate: same body, DIFFERENT type is NOT a duplicate', () => {
    assert.equal(t.findConvDuplicate(list, t.normalizeConvBody('Same Body'), 'append'), null);
  });
  check('duplicate: case-different body is NOT a duplicate', () => {
    assert.equal(t.findConvDuplicate(list, t.normalizeConvBody('same body'), 'prompt'), null);
  });
  check('duplicate: same title is NOT duplication authority', () => {
    assert.equal(t.findConvDuplicate([P('a', 'Shared', 'one')], t.normalizeConvBody('two'), 'prompt'), null);
  });
  check('duplicate: non-array input is handled safely', () => {
    assert.equal(t.findConvDuplicate(null, 'x', 'prompt'), null);
  });

  /* ── duplicate record construction ───────────────────────────────────── */
  check('buildDuplicate copies body, type and favourite', () => {
    const src = P('s1', 'Orig', 'BODY', 'append', true);
    const d = t.buildDuplicate(src, 'new-1', 999);
    assert.equal(d.body, 'BODY');
    assert.equal(d.type, 'append');
    assert.equal(d.favorite, true);
  });
  check('buildDuplicate title is "<original> (copy)"', () => {
    assert.equal(t.buildDuplicate(P('s', 'Orig', 'b'), 'n', 1).title, 'Orig (copy)');
  });
  check('buildDuplicate gets the supplied new id and fresh timestamps', () => {
    const d = t.buildDuplicate(P('s', 'O', 'b'), 'new-9', 4242);
    assert.equal(d.id, 'new-9');
    assert.equal(d.createdAt, 4242);
    assert.equal(d.updatedAt, 4242);
  });
  check('buildDuplicate introduces no Phase 2B/auto-send metadata', () => {
    const d = t.buildDuplicate(P('s', 'O', 'b'), 'n', 1);
    assert.deepEqual(Object.keys(d).sort(), ['body', 'createdAt', 'favorite', 'id', 'title', 'type', 'updatedAt']);
  });

  check('insertAfterId places the copy immediately after the original', () => {
    const arr = [P('a', 'A', '1'), P('b', 'B', '2'), P('c', 'C', '3')];
    const out = t.insertAfterId(arr, 'b', P('z', 'Z', 'z'));
    assert.equal(out.map(x => x.id).join(','), 'a,b,z,c');
  });
  check('insertAfterId preserves every other absolute slot', () => {
    const arr = [P('a', 'A', '1'), P('b', 'B', '2'), P('c', 'C', '3')];
    const out = t.insertAfterId(arr, 'a', P('z', 'Z', 'z'));
    assert.equal(out[0].id, 'a'); assert.equal(out[2].id, 'b'); assert.equal(out[3].id, 'c');
  });
  check('insertAfterId appends when the anchor is missing, and never mutates input', () => {
    const arr = [P('a', 'A', '1')];
    const out = t.insertAfterId(arr, 'nope', P('z', 'Z', 'z'));
    assert.equal(out.map(x => x.id).join(','), 'a,z');
    assert.equal(arr.length, 1, 'input array must not be mutated');
  });

  /* ── editor validation ───────────────────────────────────────────────── */
  check('validate rejects an empty prompt title', () => {
    assert.equal(t.editorValidate('prompt', { title: '', body: 'b' }).ok, false);
  });
  check('validate rejects a whitespace-only prompt title', () => {
    assert.equal(t.editorValidate('prompt', { title: '   \n\t ', body: 'b' }).ok, false);
  });
  check('validate rejects an empty prompt body', () => {
    assert.equal(t.editorValidate('prompt', { title: 'T', body: '' }).ok, false);
  });
  check('validate rejects a whitespace-only prompt body', () => {
    assert.equal(t.editorValidate('prompt', { title: 'T', body: '  \n ' }).ok, false);
  });
  check('validate accepts a well-formed prompt', () => {
    assert.equal(t.editorValidate('prompt', { title: 'T', body: 'B' }).ok, true);
  });
  check('validate rejects empty and whitespace-only quick text', () => {
    assert.equal(t.editorValidate('quick', { text: '' }).ok, false);
    assert.equal(t.editorValidate('quick', { text: '   ' }).ok, false);
  });
  check('validate accepts non-empty quick text', () => {
    assert.equal(t.editorValidate('quick', { text: 'hi' }).ok, true);
  });
  check('validate returns a non-empty error message on rejection', () => {
    assert.ok(t.editorValidate('prompt', { title: '', body: '' }).error.length > 0);
  });

  /* ── dirty comparison ────────────────────────────────────────────────── */
  const init = { title: 'T', body: 'B', type: 'prompt', favorite: false };
  check('isDirty false for an untouched prompt draft', () => {
    assert.equal(t.editorIsDirty('prompt', init, { ...init }), false);
  });
  check('isDirty true when the title changes', () => {
    assert.equal(t.editorIsDirty('prompt', init, { ...init, title: 'T2' }), true);
  });
  check('isDirty true when the body changes', () => {
    assert.equal(t.editorIsDirty('prompt', init, { ...init, body: 'B2' }), true);
  });
  check('isDirty true when the type changes', () => {
    assert.equal(t.editorIsDirty('prompt', init, { ...init, type: 'append' }), true);
  });
  check('isDirty true when favourite changes', () => {
    assert.equal(t.editorIsDirty('prompt', init, { ...init, favorite: true }), true);
  });
  check('isDirty ignores key order (field-wise, not serialized)', () => {
    assert.equal(t.editorIsDirty('prompt', init, { favorite: false, type: 'prompt', body: 'B', title: 'T' }), false);
  });
  check('isDirty compares quick text only', () => {
    assert.equal(t.editorIsDirty('quick', { text: 'a' }, { text: 'a' }), false);
    assert.equal(t.editorIsDirty('quick', { text: 'a' }, { text: 'b' }), true);
  });

  /* ── live editor: create / edit / save through the real commit path ───── */
  function boot(opts) {
    const { t: tt, sandbox, reg } = load(opts);
    const root = reg.get('prmn-wrap');
    return { t: tt, sandbox, reg, root };
  }

  check('create prompt: save commits through commitPrompts and closes', () => {
    const { t: tt, reg, root } = boot();
    tt.state.data.prompts = [];
    tt.editor.open(root, { kind: 'prompt', mode: 'create', type: 'prompt' });
    reg.get('prmn-ed-title').value = 'New T';
    reg.get('prmn-ed-body').value = 'New B';
    assert.equal(tt.editor.save(root), true);
    assert.equal(tt.state.data.prompts.length, 1);
    assert.equal(tt.state.data.prompts[0].title, 'New T');
    assert.equal(tt.editor.isOpen(), false, 'editor closes on success');
  });

  check('create prompt: type Append is honoured', () => {
    const { t: tt, reg, root } = boot();
    tt.state.data.prompts = [];
    tt.editor.open(root, { kind: 'prompt', mode: 'create', type: 'append' });
    reg.get('prmn-ed-title').value = 'A';
    reg.get('prmn-ed-body').value = 'B';
    tt.editor.save(root);
    assert.equal(tt.state.data.prompts[0].type, 'append');
  });

  check('edit prompt: title and body are updated in place, id and createdAt preserved', () => {
    const { t: tt, reg, root } = boot();
    tt.state.data.prompts = [P('p1', 'Old', 'OldBody')];
    tt.editor.open(root, { kind: 'prompt', mode: 'edit', id: 'p1' });
    reg.get('prmn-ed-title').value = 'New';
    reg.get('prmn-ed-body').value = 'NewBody';
    tt.editor.save(root);
    const rec = tt.state.data.prompts[0];
    assert.equal(rec.id, 'p1');
    assert.equal(rec.title, 'New');
    assert.equal(rec.body, 'NewBody');
    assert.equal(rec.createdAt, 100, 'createdAt preserved');
  });

  check('edit prompt: multiline body round-trips EXACTLY', () => {
    const { t: tt, reg, root } = boot();
    const ML = 'line 1\nline 2\n\n  indented\ttab\nend';
    tt.state.data.prompts = [P('p1', 'T', 'x')];
    tt.editor.open(root, { kind: 'prompt', mode: 'edit', id: 'p1' });
    reg.get('prmn-ed-body').value = ML;
    tt.editor.save(root);
    assert.equal(tt.state.data.prompts[0].body, ML);
  });

  check('edit prompt: body keeps internal whitespace (only the title is trimmed)', () => {
    const { t: tt, reg, root } = boot();
    tt.state.data.prompts = [P('p1', 'T', 'x')];
    tt.editor.open(root, { kind: 'prompt', mode: 'edit', id: 'p1' });
    reg.get('prmn-ed-title').value = '  Padded  ';
    reg.get('prmn-ed-body').value = 'a  b\n  c';
    tt.editor.save(root);
    assert.equal(tt.state.data.prompts[0].title, 'Padded');
    assert.equal(tt.state.data.prompts[0].body, 'a  b\n  c');
  });

  check('edit prompt: Prompt→Append type switching persists', () => {
    const { t: tt, reg, root } = boot();
    tt.state.data.prompts = [P('p1', 'T', 'B', 'prompt')];
    tt.editor.open(root, { kind: 'prompt', mode: 'edit', id: 'p1' });
    tt.editor.st().draft.type = 'append';
    reg.get('prmn-ed-title').value = 'T';
    reg.get('prmn-ed-body').value = 'B';
    tt.editor.save(root);
    assert.equal(tt.state.data.prompts[0].type, 'append');
  });

  check('edit prompt: favourite state is editable and persists', () => {
    const { t: tt, reg, root } = boot();
    tt.state.data.prompts = [P('p1', 'T', 'B', 'prompt', false)];
    tt.editor.open(root, { kind: 'prompt', mode: 'edit', id: 'p1' });
    tt.editor.st().draft.favorite = true;
    reg.get('prmn-ed-title').value = 'T';
    reg.get('prmn-ed-body').value = 'B';
    tt.editor.save(root);
    assert.equal(tt.state.data.prompts[0].favorite, true);
  });

  check('save rejects an empty title and keeps the editor open', () => {
    const { t: tt, reg, root } = boot();
    tt.state.data.prompts = [];
    tt.editor.open(root, { kind: 'prompt', mode: 'create' });
    reg.get('prmn-ed-title').value = '   ';
    reg.get('prmn-ed-body').value = 'B';
    assert.equal(tt.editor.save(root), false);
    assert.equal(tt.editor.isOpen(), true);
    assert.equal(tt.state.data.prompts.length, 0, 'nothing written');
  });

  check('save rejects an empty body and keeps the editor open', () => {
    const { t: tt, reg, root } = boot();
    tt.state.data.prompts = [];
    tt.editor.open(root, { kind: 'prompt', mode: 'create' });
    reg.get('prmn-ed-title').value = 'T';
    reg.get('prmn-ed-body').value = '  \n ';
    assert.equal(tt.editor.save(root), false);
    assert.equal(tt.state.data.prompts.length, 0);
  });

  /* ── cancel / dirty guard ────────────────────────────────────────────── */
  check('clean Cancel closes immediately', () => {
    const { t: tt, root } = boot();
    tt.state.data.prompts = [P('p1', 'T', 'B')];
    tt.editor.open(root, { kind: 'prompt', mode: 'edit', id: 'p1' });
    assert.equal(tt.editor.cancel(root), true);
    assert.equal(tt.editor.isOpen(), false);
  });

  check('dirty Cancel does NOT close; it arms the inline discard strip', () => {
    const { t: tt, reg, root } = boot();
    tt.state.data.prompts = [P('p1', 'T', 'B')];
    tt.editor.open(root, { kind: 'prompt', mode: 'edit', id: 'p1' });
    reg.get('prmn-ed-title').value = 'changed';
    assert.equal(tt.editor.cancel(root), false);
    assert.equal(tt.editor.isOpen(), true, 'still open');
    assert.equal(tt.editor.st().discardArmed, true);
  });

  check('Keep editing disarms the discard strip and stays open', () => {
    const { t: tt, reg, root } = boot();
    tt.state.data.prompts = [P('p1', 'T', 'B')];
    tt.editor.open(root, { kind: 'prompt', mode: 'edit', id: 'p1' });
    reg.get('prmn-ed-title').value = 'changed';
    tt.editor.cancel(root);
    tt.editor.keepEditing(root);
    assert.equal(tt.editor.st().discardArmed, false);
    assert.equal(tt.editor.isOpen(), true);
  });

  check('confirmed discard closes without writing', () => {
    const { t: tt, reg, root } = boot();
    tt.state.data.prompts = [P('p1', 'T', 'B')];
    tt.editor.open(root, { kind: 'prompt', mode: 'edit', id: 'p1' });
    reg.get('prmn-ed-title').value = 'changed';
    tt.editor.cancel(root);
    tt.editor.close(root);
    assert.equal(tt.editor.isOpen(), false);
    assert.equal(tt.state.data.prompts[0].title, 'T', 'record untouched');
  });

  /* ── delete arm / confirm ────────────────────────────────────────────── */
  check('delete is a two-step: the first activation only arms', () => {
    const { t: tt, root } = boot();
    tt.state.data.prompts = [P('p1', 'T', 'B')];
    tt.editor.open(root, { kind: 'prompt', mode: 'edit', id: 'p1' });
    tt.editor.armDelete(root);
    assert.equal(tt.editor.st().deleteArmed, true);
    assert.equal(tt.state.data.prompts.length, 1, 'nothing deleted yet');
  });

  check('confirmed delete removes exactly that record and closes', () => {
    const { t: tt, root } = boot();
    tt.state.data.prompts = [P('p1', 'T1', 'B'), P('p2', 'T2', 'B2')];
    tt.editor.open(root, { kind: 'prompt', mode: 'edit', id: 'p1' });
    tt.editor.armDelete(root);
    assert.equal(tt.editor.confirmDelete(root), true);
    assert.equal(tt.state.data.prompts.map(p => p.id).join(','), 'p2');
    assert.equal(tt.editor.isOpen(), false);
  });

  check('delete arm uses an OWNED timer (registered for disposal)', () => {
    const { t: tt, sandbox, root } = boot();
    tt.state.data.prompts = [P('p1', 'T', 'B')];
    const before = tt.state.clean.timers.size;
    tt.editor.open(root, { kind: 'prompt', mode: 'edit', id: 'p1' });
    tt.editor.armDelete(root);
    assert.ok(tt.state.clean.timers.size > before, 'timer registered in the owned set');
    assert.ok(sandbox.__timers.some(x => x.ms === tt.deleteArmMs), `arm delay ${tt.deleteArmMs}ms scheduled`);
  });

  check('the delete arm expires back to the unarmed state', () => {
    const { t: tt, sandbox, root } = boot();
    tt.state.data.prompts = [P('p1', 'T', 'B')];
    tt.editor.open(root, { kind: 'prompt', mode: 'edit', id: 'p1' });
    tt.editor.armDelete(root);
    const timer = sandbox.__timers.find(x => x.ms === tt.deleteArmMs);
    timer.fn();
    assert.equal(tt.editor.st().deleteArmed, false);
    assert.equal(tt.state.data.prompts.length, 1, 'expiry must not delete');
  });

  check('opening the editor disarms any prior delete', () => {
    const { t: tt, root } = boot();
    tt.state.data.prompts = [P('p1', 'T', 'B'), P('p2', 'T2', 'B2')];
    tt.editor.open(root, { kind: 'prompt', mode: 'edit', id: 'p1' });
    tt.editor.armDelete(root);
    tt.editor.open(root, { kind: 'prompt', mode: 'edit', id: 'p2' });
    assert.equal(tt.editor.st().deleteArmed, false);
  });

  /* ── truthful write-failure behaviour (Phase 1 contract) ─────────────── */
  check('failed prompt save keeps the editor OPEN', () => {
    const { t: tt, reg, root } = boot({ failWriteFor: 'state:prompts' });
    tt.state.data.prompts = [P('p1', 'Old', 'OldBody')];
    tt.editor.open(root, { kind: 'prompt', mode: 'edit', id: 'p1' });
    reg.get('prmn-ed-title').value = 'New';
    reg.get('prmn-ed-body').value = 'NewBody';
    assert.equal(tt.editor.save(root), false);
    assert.equal(tt.editor.isOpen(), true);
  });

  check('failed prompt save preserves the typed values', () => {
    const { t: tt, reg, root } = boot({ failWriteFor: 'state:prompts' });
    tt.state.data.prompts = [P('p1', 'Old', 'OldBody')];
    tt.editor.open(root, { kind: 'prompt', mode: 'edit', id: 'p1' });
    reg.get('prmn-ed-title').value = 'Typed';
    reg.get('prmn-ed-body').value = 'TypedBody';
    tt.editor.save(root);
    assert.equal(reg.get('prmn-ed-title').value, 'Typed');
    assert.equal(reg.get('prmn-ed-body').value, 'TypedBody');
  });

  check('failed prompt save leaves the prior authoritative record unchanged', () => {
    const { t: tt, reg, root } = boot({ failWriteFor: 'state:prompts' });
    tt.state.data.prompts = [P('p1', 'Old', 'OldBody')];
    tt.editor.open(root, { kind: 'prompt', mode: 'edit', id: 'p1' });
    reg.get('prmn-ed-title').value = 'New';
    reg.get('prmn-ed-body').value = 'NewBody';
    tt.editor.save(root);
    assert.equal(tt.state.data.prompts[0].title, 'Old');
    assert.equal(tt.state.data.prompts[0].body, 'OldBody');
  });

  check('failed prompt save reports an ERROR, never "Saved"', () => {
    const { t: tt, reg, root } = boot({ failWriteFor: 'state:prompts' });
    tt.state.data.prompts = [P('p1', 'Old', 'B')];
    tt.editor.open(root, { kind: 'prompt', mode: 'edit', id: 'p1' });
    reg.get('prmn-ed-title').value = 'New';
    reg.get('prmn-ed-body').value = 'B';
    tt.editor.save(root);
    const status = reg.get('prmn-status');
    assert.match(status.textContent, /failed/i);
    assert.ok(!/saved/i.test(status.textContent));
  });

  check('failed prompt save increments the Phase 1 writeFailures counter', () => {
    const { t: tt, reg, root } = boot({ failWriteFor: 'state:prompts' });
    tt.state.data.prompts = [P('p1', 'Old', 'B')];
    const before = tt.diag.counters.writeFailures;
    tt.editor.open(root, { kind: 'prompt', mode: 'edit', id: 'p1' });
    reg.get('prmn-ed-title').value = 'New';
    reg.get('prmn-ed-body').value = 'B';
    tt.editor.save(root);
    assert.ok(tt.diag.counters.writeFailures > before, 'truthful failure propagation preserved');
  });

  check('failed delete keeps the record and the editor', () => {
    const { t: tt, root } = boot({ failWriteFor: 'state:prompts' });
    tt.state.data.prompts = [P('p1', 'T', 'B')];
    tt.editor.open(root, { kind: 'prompt', mode: 'edit', id: 'p1' });
    tt.editor.armDelete(root);
    assert.equal(tt.editor.confirmDelete(root), false);
    assert.equal(tt.state.data.prompts.length, 1);
    assert.equal(tt.editor.isOpen(), true);
  });

  /* ── quick editor ────────────────────────────────────────────────────── */
  check('quick edit updates the reply text through commitQuick', () => {
    const { t: tt, reg, root } = boot();
    tt.state.data.quick = [{ id: 'q1', text: 'old', order: 0, createdAt: 1, updatedAt: 1 }];
    tt.editor.open(root, { kind: 'quick', mode: 'edit', id: 'q1' });
    reg.get('prmn-ed-body').value = 'new text';
    assert.equal(tt.editor.save(root), true);
    assert.equal(tt.state.data.quick[0].text, 'new text');
    assert.equal(tt.state.data.quick[0].id, 'q1', 'id preserved');
  });

  check('quick create appends a reply with a sequential order', () => {
    const { t: tt, reg, root } = boot();
    tt.state.data.quick = [{ id: 'q1', text: 'a', order: 0, createdAt: 1, updatedAt: 1 }];
    tt.editor.open(root, { kind: 'quick', mode: 'create' });
    reg.get('prmn-ed-body').value = 'b';
    tt.editor.save(root);
    assert.equal(tt.state.data.quick.length, 2);
    assert.equal(tt.state.data.quick[1].order, 1);
  });

  check('quick editor exposes no title/type/favourite fields', () => {
    const { t: tt, reg, root } = boot();
    tt.state.data.quick = [{ id: 'q1', text: 'a', order: 0, createdAt: 1, updatedAt: 1 }];
    tt.editor.open(root, { kind: 'quick', mode: 'edit', id: 'q1' });
    assert.equal(reg.get('prmn-ed-title-row').style.display, 'none');
    assert.equal(reg.get('prmn-ed-type-row').style.display, 'none');
  });

  check('quick save rejects empty text', () => {
    const { t: tt, reg, root } = boot();
    tt.state.data.quick = [{ id: 'q1', text: 'a', order: 0, createdAt: 1, updatedAt: 1 }];
    tt.editor.open(root, { kind: 'quick', mode: 'edit', id: 'q1' });
    reg.get('prmn-ed-body').value = '   ';
    assert.equal(tt.editor.save(root), false);
    assert.equal(tt.state.data.quick[0].text, 'a');
  });

  check('quick delete removes the reply and renumbers order', () => {
    const { t: tt, root } = boot();
    tt.state.data.quick = [
      { id: 'q1', text: 'a', order: 0, createdAt: 1, updatedAt: 1 },
      { id: 'q2', text: 'b', order: 1, createdAt: 1, updatedAt: 1 },
    ];
    tt.editor.open(root, { kind: 'quick', mode: 'edit', id: 'q1' });
    tt.editor.armDelete(root);
    tt.editor.confirmDelete(root);
    assert.equal(tt.state.data.quick.length, 1);
    assert.equal(tt.state.data.quick[0].id, 'q2');
    assert.equal(tt.state.data.quick[0].order, 0);
  });

  check('failed quick save keeps the editor open and the record unchanged', () => {
    const { t: tt, reg, root } = boot({ failWriteFor: 'state:quick_replies' });
    tt.state.data.quick = [{ id: 'q1', text: 'orig', order: 0, createdAt: 1, updatedAt: 1 }];
    tt.editor.open(root, { kind: 'quick', mode: 'edit', id: 'q1' });
    reg.get('prmn-ed-body').value = 'changed';
    assert.equal(tt.editor.save(root), false);
    assert.equal(tt.state.data.quick[0].text, 'orig');
    assert.equal(tt.editor.isOpen(), true);
  });

  check('editing a missing record is refused rather than creating one', () => {
    const { t: tt, root } = boot();
    tt.state.data.prompts = [];
    assert.equal(tt.editor.open(root, { kind: 'prompt', mode: 'edit', id: 'nope' }), false);
    assert.equal(tt.editor.isOpen(), false);
  });

  /* ── feedback semantics ──────────────────────────────────────────────── */
  check('info feedback schedules an auto-clear on an OWNED timer', () => {
    const { t: tt, sandbox, root } = boot();
    tt.feedback.say('Saved', 'info', root);
    assert.ok(sandbox.__timers.some(x => x.ms === tt.statusClearMs), `${tt.statusClearMs}ms clear scheduled`);
  });

  check('info feedback clears when its timer fires', () => {
    const { t: tt, sandbox, reg, root } = boot();
    tt.feedback.say('Saved', 'info', root);
    sandbox.__timers.filter(x => x.ms === tt.statusClearMs).pop().fn();
    assert.equal(reg.get('prmn-status').textContent, '');
  });

  check('ERROR feedback does NOT schedule an auto-clear', () => {
    const { t: tt, sandbox, root } = boot();
    const before = sandbox.__timers.filter(x => x.ms === tt.statusClearMs).length;
    tt.feedback.say('Storage write failed', 'error', root);
    const after = sandbox.__timers.filter(x => x.ms === tt.statusClearMs).length;
    assert.equal(after, before, 'a serious storage error must stay visible');
  });

  check('ERROR feedback carries the error styling hook', () => {
    const { t: tt, reg, root } = boot();
    tt.feedback.say('Storage write failed', 'error', root);
    assert.ok(reg.get('prmn-status').classList.contains('cgxui-prmn--status-err'));
  });

  check('a new message supersedes the prior auto-clear timer', () => {
    const { t: tt, sandbox, root } = boot();
    tt.feedback.say('Saved', 'info', root);
    const cleared = sandbox.__cleared.length;
    tt.feedback.say('Inserted', 'info', root);
    assert.ok(sandbox.__cleared.length > cleared, 'previous clear timer cancelled');
  });

  check('feedback text is exactly the supplied message', () => {
    const { t: tt, reg, root } = boot();
    tt.feedback.say('Duplicated', 'info', root);
    assert.equal(reg.get('prmn-status').textContent, 'Duplicated');
  });

  /* ── card builder ────────────────────────────────────────────────────── */
  check('card shows a Prompt badge for prompt records', () => {
    const html = t.promptCard(P('c1', 'T', 'B', 'prompt'), { mode: 'simple' });
    assert.match(html, /--badge[^>]*>Prompt</);
  });
  check('card shows an Append badge for append records', () => {
    const html = t.promptCard(P('c1', 'T', 'B', 'append'), { mode: 'simple' });
    assert.match(html, />Append</);
  });
  check('card favourite is a <button> with aria-pressed', () => {
    const html = t.promptCard(P('c1', 'T', 'B', 'prompt', true), { mode: 'simple' });
    assert.match(html, /<button[^>]*--star[^>]*aria-pressed="true"/);
  });
  check('card favourite reflects the unfavourited state', () => {
    const html = t.promptCard(P('c1', 'T', 'B', 'prompt', false), { mode: 'simple' });
    assert.match(html, /aria-pressed="false"/);
  });
  check('card body preview carries the two-line clamp class', () => {
    const html = t.promptCard(P('c1', 'T', 'B'), { mode: 'simple' });
    assert.match(html, /--prev-clamp/);
  });
  check('card preserves the data-id contract used by handlers', () => {
    const html = t.promptCard(P('c-id-1', 'T', 'B'), { mode: 'edit' });
    assert.match(html, /data-id="c-id-1"/);
  });
  check('edit card keeps ▲▼ Insert Append Edit Delete and adds Duplicate', () => {
    const html = t.promptCard(P('c1', 'T', 'B'), { mode: 'edit' });
    for (const act of ['up', 'down', 'insert', 'append', 'edit', 'delete', 'duplicate']) {
      assert.match(html, new RegExp(`data-act="${act}"`), `missing data-act="${act}"`);
    }
  });
  check('simple card exposes NO Duplicate/Delete row actions', () => {
    const html = t.promptCard(P('c1', 'T', 'B'), { mode: 'simple' });
    assert.ok(!/data-act="duplicate"/.test(html));
    assert.ok(!/data-act="delete"/.test(html));
  });
  check('card escapes hostile title/body rather than emitting markup', () => {
    const html = t.promptCard(P('c1', '<script>x</script>', '<b>y</b>'), { mode: 'simple' });
    assert.ok(!/<script>/.test(html), 'no raw script tag');
    assert.match(html, /&lt;script&gt;/);
  });
  check('card does not truncate the stored body text', () => {
    const long = 'z'.repeat(500);
    const html = t.promptCard(P('c1', 'T', long), { mode: 'simple' });
    assert.ok(html.includes(long), 'clamping is presentational only');
  });

  /* ══════════════ PHASE 2A AUDIT CORRECTIONS (A / B / C / D + favourite) ══════════════ */

  /* ── A: Back cannot hide an open editor ─────────────────────────────── */
  check('[fix A] Back with a CLEAN editor closes it and is permitted', () => {
    const { t: tt, root } = boot();
    tt.state.data.prompts = [P('p1', 'T', 'B')];
    tt.editor.open(root, { kind: 'prompt', mode: 'edit', id: 'p1' });
    assert.equal(tt.editor.requestBack(root), true, 'Back must be permitted');
    assert.equal(tt.editor.isOpen(), false, 'editor closed');
  });

  check('[fix A] Back with a DIRTY editor is DENIED and arms discard', () => {
    const { t: tt, reg, root } = boot();
    tt.state.data.prompts = [P('p1', 'T', 'B')];
    tt.editor.open(root, { kind: 'prompt', mode: 'edit', id: 'p1' });
    reg.get('prmn-ed-title').value = 'changed';
    assert.equal(tt.editor.requestBack(root), false, 'Back must be denied');
    assert.equal(tt.editor.isOpen(), true, 'editor stays open');
    assert.equal(tt.editor.st().discardArmed, true, 'discard strip armed');
  });

  check('[fix A] Back with no editor open is permitted', () => {
    const { t: tt, root } = boot();
    assert.equal(tt.editor.requestBack(root), true);
  });

  check('[fix A] denied Back never discards the typed values', () => {
    const { t: tt, reg, root } = boot();
    tt.state.data.prompts = [P('p1', 'T', 'B')];
    tt.editor.open(root, { kind: 'prompt', mode: 'edit', id: 'p1' });
    reg.get('prmn-ed-title').value = 'typed';
    tt.editor.requestBack(root);
    assert.equal(reg.get('prmn-ed-title').value, 'typed');
  });

  check('[fix A] confirmed discard after a denied Back closes and clears feedback', () => {
    const { t: tt, reg, root } = boot();
    tt.state.data.prompts = [P('p1', 'T', 'B')];
    tt.editor.open(root, { kind: 'prompt', mode: 'edit', id: 'p1' });
    reg.get('prmn-ed-title').value = 'changed';
    tt.editor.requestBack(root);
    tt.editor.close(root);
    assert.equal(tt.editor.isOpen(), false);
    assert.equal(reg.get('prmn-status').textContent, '', 'stale editor feedback cleared');
  });

  /* ── B: remount / reopen preservation ───────────────────────────────── */
  check('[fix B] resetTransient drops deleteArmed and discardArmed', () => {
    const { t: tt, root } = boot();
    tt.state.data.prompts = [P('p1', 'T', 'B')];
    tt.editor.open(root, { kind: 'prompt', mode: 'edit', id: 'p1' });
    tt.editor.armDelete(root);
    tt.editor.st().discardArmed = true;
    tt.editor.resetTransient();
    assert.equal(tt.editor.st().deleteArmed, false);
    assert.equal(tt.editor.st().discardArmed, false);
  });

  check('[fix B] resetTransient clears the stale delete timer id', () => {
    const { t: tt, root } = boot();
    tt.state.data.prompts = [P('p1', 'T', 'B')];
    tt.editor.open(root, { kind: 'prompt', mode: 'edit', id: 'p1' });
    tt.editor.armDelete(root);
    tt.editor.resetTransient();
    assert.equal(tt.state.ui.editorDeleteTimer, 0);
  });

  check('[fix B] the unsaved draft SURVIVES a transient reset', () => {
    const { t: tt, reg, root } = boot();
    tt.state.data.prompts = [P('p1', 'T', 'B')];
    tt.editor.open(root, { kind: 'prompt', mode: 'edit', id: 'p1' });
    reg.get('prmn-ed-title').value = 'unsaved work';
    tt.editor.refreshDirty(root);
    tt.editor.resetTransient();
    assert.equal(tt.editor.isOpen(), true, 'editor still open');
    assert.equal(tt.editor.st().dirty, true, 'still dirty');
    assert.equal(tt.editor.st().draft.title, 'unsaved work', 'draft preserved');
  });

  check('[fix B] restore() on a fresh root reflects the open editor in the DOM', () => {
    const { t: tt, reg, root } = boot();
    tt.state.data.prompts = [P('p1', 'Title A', 'Body A')];
    tt.editor.open(root, { kind: 'prompt', mode: 'edit', id: 'p1' });
    // simulate a fresh root: fields blank, editor box not marked open
    reg.get('prmn-ed-title').value = '';
    reg.get('prmn-ed-body').value = '';
    reg.get('prmn-editor').classList.remove('cgxui-prmn--editor-open');
    assert.equal(tt.editor.restore(root), true, 'restore reports the editor was reopened');
    assert.ok(reg.get('prmn-editor').classList.contains('cgxui-prmn--editor-open'), 'editor visible');
    assert.equal(reg.get('prmn-ed-title').value, 'Title A', 'title restored');
    assert.equal(reg.get('prmn-ed-body').value, 'Body A', 'body restored');
  });

  check('[fix B] restore() makes Edit mode authoritative before syncing', () => {
    const { t: tt, root } = boot();
    tt.state.data.prompts = [P('p1', 'T', 'B')];
    tt.engine.setUiMode('simple');
    tt.editor.open(root, { kind: 'prompt', mode: 'edit', id: 'p1' });
    tt.editor.restore(root);
    assert.equal(tt.engine.getUiMode(), 'edit', 'editor can never sit behind the Simple list');
  });

  check('[fix B] restore() with a closed editor leaves the list UI and reports false', () => {
    const { t: tt, reg, root } = boot();
    assert.equal(tt.editor.restore(root), false);
    assert.ok(!reg.get('prmn-editor').classList.contains('cgxui-prmn--editor-open'));
    assert.notEqual(reg.get('prmn-list-edit').style.display, 'none', 'list not hidden');
  });

  check('[fix B] restore() drops transient confirmation state', () => {
    const { t: tt, root } = boot();
    tt.state.data.prompts = [P('p1', 'T', 'B')];
    tt.editor.open(root, { kind: 'prompt', mode: 'edit', id: 'p1' });
    tt.editor.armDelete(root);
    tt.editor.restore(root);
    assert.equal(tt.editor.st().deleteArmed, false, 'a re-armed delete must not survive');
  });

  check('[fix B] an open editor hides list, filters and New button consistently', () => {
    const { t: tt, reg, root } = boot();
    tt.state.data.prompts = [P('p1', 'T', 'B')];
    tt.editor.open(root, { kind: 'prompt', mode: 'edit', id: 'p1' });
    tt.editor.restore(root);
    assert.equal(reg.get('prmn-list-edit').style.display, 'none');
    assert.equal(reg.get('prmn-edit-filter-row').style.display, 'none');
    assert.equal(reg.get('prmn-new-btn').style.display, 'none');
  });

  check('[fix B] focusPrimary targets title for prompts and body for quick', () => {
    const { t: tt, reg, root } = boot();
    let focused = null;
    reg.get('prmn-ed-title').focus = () => { focused = 'title'; };
    reg.get('prmn-ed-body').focus = () => { focused = 'body'; };
    tt.state.data.prompts = [P('p1', 'T', 'B')];
    tt.editor.open(root, { kind: 'prompt', mode: 'edit', id: 'p1' });
    focused = null; tt.editor.focusPrimary(root);
    assert.equal(focused, 'title');
    tt.state.data.quick = [{ id: 'q1', text: 'a', order: 0, createdAt: 1, updatedAt: 1 }];
    tt.editor.open(root, { kind: 'quick', mode: 'edit', id: 'q1' });
    focused = null; tt.editor.focusPrimary(root);
    assert.equal(focused, 'body');
  });

  /* ── C: Unicode-safe conversion title ───────────────────────────────── */
  const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

  check('[fix C] an emoji crossing the cap boundary is never split', () => {
    const line = 'x'.repeat(t.convTitleMax - 1) + '🧪' + 'Z';
    const got = t.convTitle(line, 'fb');
    assert.ok(!LONE_SURROGATE.test(got), 'no lone surrogate may be emitted');
    assert.ok(got.includes('🧪'), 'the emoji is kept whole');
  });

  check('[fix C] no lone surrogate for any offset around the boundary', () => {
    for (let pad = t.convTitleMax - 3; pad <= t.convTitleMax + 2; pad++) {
      const got = t.convTitle('x'.repeat(pad) + '🚀' + 'tail', 'fb');
      assert.ok(!LONE_SURROGATE.test(got), `lone surrogate at pad=${pad}`);
    }
  });

  check('[fix C] truncation counts CODE POINTS, not UTF-16 units', () => {
    const got = t.convTitle('🧪'.repeat(t.convTitleMax + 10), 'fb');
    assert.equal(Array.from(got).length, t.convTitleMax + 1, 'cap + one ellipsis, measured in code points');
    assert.ok(got.endsWith('…'));
  });

  check('[fix C] ordinary ASCII cap behaviour is unchanged', () => {
    const exact = 'a'.repeat(t.convTitleMax);
    assert.equal(t.convTitle(exact, 'fb'), exact, 'exactly at the cap is not truncated');
    const over = 'a'.repeat(t.convTitleMax + 1);
    assert.equal(t.convTitle(over, 'fb'), 'a'.repeat(t.convTitleMax) + '…');
  });

  /* ── D: feedback lifecycle ──────────────────────────────────────────── */
  check('[fix D] manual hide() cancels the pending info clear timer', () => {
    const { t: tt, sandbox, root } = boot();
    tt.feedback.say('Saved', 'info', root);
    const before = sandbox.__cleared.length;
    tt.feedback.hide(root);
    assert.ok(sandbox.__cleared.length > before, 'pending owned timer must be cancelled');
    assert.equal(tt.state.ui.statusTimer, 0, 'no stale timer id left behind');
  });

  check('[fix D] validation error then discard leaves no stale error status', () => {
    const { t: tt, reg, root } = boot();
    tt.state.data.prompts = [];
    tt.editor.open(root, { kind: 'prompt', mode: 'create' });
    reg.get('prmn-ed-title').value = '';
    reg.get('prmn-ed-body').value = '';
    tt.editor.save(root);                                   // -> validation error
    assert.ok(reg.get('prmn-status').textContent.length > 0, 'error shown first');
    tt.editor.close(root);                                  // discard / close
    assert.equal(reg.get('prmn-status').textContent, '', 'status text cleared');
    assert.ok(!reg.get('prmn-status').classList.contains('cgxui-prmn--status-err'), 'error class removed');
  });

  check('[fix D] a successful save still reports Saved after the clear', () => {
    const { t: tt, reg, root } = boot();
    tt.state.data.prompts = [];
    tt.editor.open(root, { kind: 'prompt', mode: 'create' });
    reg.get('prmn-ed-title').value = 'T';
    reg.get('prmn-ed-body').value = 'B';
    tt.editor.save(root);
    assert.equal(reg.get('prmn-status').textContent, 'Saved');
  });

  check('[fix D] a successful delete still reports Deleted after the clear', () => {
    const { t: tt, reg, root } = boot();
    tt.state.data.prompts = [P('p1', 'T', 'B')];
    tt.editor.open(root, { kind: 'prompt', mode: 'edit', id: 'p1' });
    tt.editor.armDelete(root);
    tt.editor.confirmDelete(root);
    assert.equal(reg.get('prmn-status').textContent, 'Deleted');
  });

  check('[fix D] a persistent error still does not auto-clear after the fix', () => {
    const { t: tt, sandbox, root } = boot();
    const before = sandbox.__timers.filter(x => x.ms === tt.statusClearMs).length;
    tt.feedback.say('Storage write failed', 'error', root);
    assert.equal(sandbox.__timers.filter(x => x.ms === tt.statusClearMs).length, before);
  });

  /* ── E: stale edit/delete target must fail truthfully ────────────────────
   * The defect: an editor opened on an id outlives the record. `list.map(x =>
   * x.id === id ? ... : x)` then matched nothing, the UNCHANGED list committed
   * successfully, and the editor closed reporting "Saved". Delete had the same
   * hole through `filter`. Every case below drives the real EDITOR_PM. */

  const Q = (id, text, order = 0) => ({ id, text, order, createdAt: 100, updatedAt: 100 });

  /* Count real commit attempts by wrapping the production engine methods.
   * ENGINE_PM is a live object, so this observes the shipped call site rather
   * than a copy of it. */
  function spyCommits(tt) {
    const s = { prompts: 0, quick: 0 };
    const rp = tt.engine.commitPrompts, rq = tt.engine.commitQuick;
    tt.engine.commitPrompts = (n) => { s.prompts++; return rp(n); };
    tt.engine.commitQuick = (n) => { s.quick++; return rq(n); };
    return s;
  }

  check('[fix E] prompt edit target removed before Save: save returns false', () => {
    const { t: tt, reg, root } = boot();
    tt.state.data.prompts = [P('p1', 'T', 'B'), P('p2', 'T2', 'B2')];
    tt.editor.open(root, { kind: 'prompt', mode: 'edit', id: 'p1' });
    reg.get('prmn-ed-title').value = 'Typed title';
    reg.get('prmn-ed-body').value = 'Typed body';
    tt.state.data.prompts = [P('p2', 'T2', 'B2')];          // p1 disappears
    const spy = spyCommits(tt);
    assert.equal(tt.editor.save(root), false, 'a vanished target must not report success');
    assert.equal(spy.prompts, 0, 'commitPrompts must not be called at all');
  });

  check('[fix E] prompt edit target removed before Save: editor stays open with typed values', () => {
    const { t: tt, reg, root } = boot();
    tt.state.data.prompts = [P('p1', 'T', 'B')];
    tt.editor.open(root, { kind: 'prompt', mode: 'edit', id: 'p1' });
    reg.get('prmn-ed-title').value = 'Typed title';
    reg.get('prmn-ed-body').value = 'Typed body';
    tt.state.data.prompts = [];
    tt.editor.save(root);
    assert.equal(tt.editor.isOpen(), true, 'editor must stay open');
    assert.equal(tt.editor.st().id, 'p1', 'the target id is retained');
    assert.equal(reg.get('prmn-ed-title').value, 'Typed title');
    assert.equal(reg.get('prmn-ed-body').value, 'Typed body');
  });

  check('[fix E] prompt edit target removed before Save: collection unchanged, nothing recreated', () => {
    const { t: tt, reg, root } = boot();
    tt.state.data.prompts = [P('p1', 'T', 'B')];
    tt.editor.open(root, { kind: 'prompt', mode: 'edit', id: 'p1' });
    reg.get('prmn-ed-title').value = 'Typed';
    reg.get('prmn-ed-body').value = 'Typed';
    const survivors = [P('p2', 'T2', 'B2')];
    tt.state.data.prompts = survivors;
    tt.editor.save(root);
    assert.deepEqual(tt.state.data.prompts, survivors, 'authoritative list untouched');
    assert.equal(tt.state.data.prompts.length, 1, 'the deleted item is not resurrected or appended');
    assert.ok(!tt.state.data.prompts.some(x => x.id === 'p1'), 'p1 must not reappear');
  });

  check('[fix E] prompt edit target removed before Save: reports Item no longer exists', () => {
    const { t: tt, reg, root } = boot();
    tt.state.data.prompts = [P('p1', 'T', 'B')];
    tt.editor.open(root, { kind: 'prompt', mode: 'edit', id: 'p1' });
    reg.get('prmn-ed-title').value = 'T';
    reg.get('prmn-ed-body').value = 'B';
    tt.state.data.prompts = [];
    tt.editor.save(root);
    assert.equal(reg.get('prmn-status').textContent, tt.msgTargetGone);
    assert.equal(reg.get('prmn-status').textContent, 'Item no longer exists');
    assert.ok(reg.get('prmn-status').classList.contains('cgxui-prmn--status-err'), 'error styling');
    assert.equal(tt.state.ui.feedback.kind, 'error', 'persistent, not transient');
  });

  check('[fix E] quick edit target removed before Save: save returns false, no commit', () => {
    const { t: tt, reg, root } = boot();
    tt.state.data.quick = [Q('q1', 'old'), Q('q2', 'other', 1)];
    tt.editor.open(root, { kind: 'quick', mode: 'edit', id: 'q1' });
    reg.get('prmn-ed-body').value = 'typed quick text';
    tt.state.data.quick = [Q('q2', 'other', 1)];
    const spy = spyCommits(tt);
    assert.equal(tt.editor.save(root), false);
    assert.equal(spy.quick, 0, 'commitQuick must not be called at all');
  });

  check('[fix E] quick edit target removed before Save: editor open, text kept, list unchanged', () => {
    const { t: tt, reg, root } = boot();
    tt.state.data.quick = [Q('q1', 'old')];
    tt.editor.open(root, { kind: 'quick', mode: 'edit', id: 'q1' });
    reg.get('prmn-ed-body').value = 'typed quick text';
    const survivors = [Q('q2', 'other', 0)];
    tt.state.data.quick = survivors;
    tt.editor.save(root);
    assert.equal(tt.editor.isOpen(), true);
    assert.equal(reg.get('prmn-ed-body').value, 'typed quick text');
    assert.deepEqual(tt.state.data.quick, survivors);
    assert.ok(!tt.state.data.quick.some(x => x.id === 'q1'));
    assert.equal(reg.get('prmn-status').textContent, 'Item no longer exists');
  });

  check('[fix E] prompt delete target removed before confirm: returns false, list unchanged', () => {
    const { t: tt, reg, root } = boot();
    tt.state.data.prompts = [P('p1', 'T', 'B')];
    tt.editor.open(root, { kind: 'prompt', mode: 'edit', id: 'p1' });
    tt.editor.armDelete(root);
    const survivors = [P('p2', 'T2', 'B2')];
    tt.state.data.prompts = survivors;
    const spy = spyCommits(tt);
    assert.equal(tt.editor.confirmDelete(root), false);
    assert.equal(spy.prompts, 0, 'the unchanged collection must not be committed');
    assert.deepEqual(tt.state.data.prompts, survivors);
    assert.equal(tt.editor.isOpen(), true, 'editor stays open');
    assert.notEqual(reg.get('prmn-status').textContent, 'Deleted', 'must never report Deleted');
    assert.equal(reg.get('prmn-status').textContent, 'Item no longer exists');
    assert.equal(tt.editor.st().deleteArmed, false, 'delete confirmation is disarmed');
  });

  check('[fix E] quick delete target removed before confirm: returns false, list unchanged', () => {
    const { t: tt, reg, root } = boot();
    tt.state.data.quick = [Q('q1', 'a')];
    tt.editor.open(root, { kind: 'quick', mode: 'edit', id: 'q1' });
    tt.editor.armDelete(root);
    const survivors = [Q('q2', 'b', 0)];
    tt.state.data.quick = survivors;
    const spy = spyCommits(tt);
    assert.equal(tt.editor.confirmDelete(root), false);
    assert.equal(spy.quick, 0);
    assert.deepEqual(tt.state.data.quick, survivors);
    assert.equal(tt.editor.isOpen(), true);
    assert.notEqual(reg.get('prmn-status').textContent, 'Deleted');
    assert.equal(reg.get('prmn-status').textContent, 'Item no longer exists');
    assert.equal(tt.editor.st().deleteArmed, false);
  });

  check('[fix E] stale delete does not revert what the user had typed', () => {
    const { t: tt, reg, root } = boot();
    tt.state.data.prompts = [P('p1', 'T', 'B')];
    tt.editor.open(root, { kind: 'prompt', mode: 'edit', id: 'p1' });
    reg.get('prmn-ed-title').value = 'Typed';
    reg.get('prmn-ed-body').value = 'Typed body';
    // Production binds `input` -> EDITOR_PM.refreshDirty, so the draft tracks
    // the fields live. Drive the same production helper rather than relying on
    // a synthetic event the DOM stub cannot deliver.
    tt.editor.refreshDirty(root);
    tt.editor.armDelete(root);
    tt.state.data.prompts = [];
    tt.editor.confirmDelete(root);
    assert.equal(reg.get('prmn-ed-title').value, 'Typed');
    assert.equal(reg.get('prmn-ed-body').value, 'Typed body');
    assert.equal(tt.editor.st().dirty, true, 'the unsaved edit is still recognised as dirty');
  });

  check('[fix E] existing-target prompt save STILL succeeds', () => {
    const { t: tt, reg, root } = boot();
    tt.state.data.prompts = [P('p1', 'T', 'B')];
    tt.editor.open(root, { kind: 'prompt', mode: 'edit', id: 'p1' });
    reg.get('prmn-ed-title').value = 'New title';
    reg.get('prmn-ed-body').value = 'New body';
    assert.equal(tt.editor.save(root), true);
    assert.equal(tt.state.data.prompts[0].title, 'New title');
    assert.equal(tt.editor.isOpen(), false);
    assert.equal(reg.get('prmn-status').textContent, 'Saved');
  });

  check('[fix E] existing-target quick save STILL succeeds', () => {
    const { t: tt, reg, root } = boot();
    tt.state.data.quick = [Q('q1', 'old')];
    tt.editor.open(root, { kind: 'quick', mode: 'edit', id: 'q1' });
    reg.get('prmn-ed-body').value = 'new text';
    assert.equal(tt.editor.save(root), true);
    assert.equal(tt.state.data.quick[0].text, 'new text');
    assert.equal(tt.editor.isOpen(), false);
    assert.equal(reg.get('prmn-status').textContent, 'Saved');
  });

  check('[fix E] existing-target prompt delete STILL succeeds', () => {
    const { t: tt, reg, root } = boot();
    tt.state.data.prompts = [P('p1', 'T', 'B'), P('p2', 'T2', 'B2')];
    tt.editor.open(root, { kind: 'prompt', mode: 'edit', id: 'p1' });
    tt.editor.armDelete(root);
    assert.equal(tt.editor.confirmDelete(root), true);
    assert.deepEqual(tt.state.data.prompts.map(x => x.id), ['p2']);
    assert.equal(reg.get('prmn-status').textContent, 'Deleted');
  });

  check('[fix E] existing-target quick delete STILL succeeds and reindexes order', () => {
    const { t: tt, reg, root } = boot();
    tt.state.data.quick = [Q('q1', 'a', 0), Q('q2', 'b', 1), Q('q3', 'c', 2)];
    tt.editor.open(root, { kind: 'quick', mode: 'edit', id: 'q2' });
    tt.editor.armDelete(root);
    assert.equal(tt.editor.confirmDelete(root), true);
    assert.deepEqual(tt.state.data.quick.map(x => x.id), ['q1', 'q3']);
    assert.deepEqual(tt.state.data.quick.map(x => x.order), [0, 1]);
    assert.equal(reg.get('prmn-status').textContent, 'Deleted');
  });

  check('[fix E] CREATE mode is unaffected by the stale-target guard', () => {
    const { t: tt, reg, root } = boot();
    tt.state.data.prompts = [];
    tt.editor.open(root, { kind: 'prompt', mode: 'create' });
    reg.get('prmn-ed-title').value = 'T';
    reg.get('prmn-ed-body').value = 'B';
    assert.equal(tt.editor.save(root), true, 'create has no pre-existing target to find');
    assert.equal(tt.state.data.prompts.length, 1);
  });

  check('[fix E] hasTarget: present, absent, empty list, null id', () => {
    assert.equal(t.editorHasTarget([P('p1', 'T', 'B')], 'p1'), true);
    assert.equal(t.editorHasTarget([P('p1', 'T', 'B')], 'p2'), false);
    assert.equal(t.editorHasTarget([], 'p1'), false);
    assert.equal(t.editorHasTarget(null, 'p1'), false);
    assert.equal(t.editorHasTarget([P('p1', 'T', 'B')], null), false);
    assert.equal(t.editorHasTarget([P('p1', 'T', 'B')], ''), false);
    assert.equal(t.editorHasTarget([null, undefined, P('p1', 'T', 'B')], 'p1'), true);
  });

  /* ── F: persistent error feedback survives a root remount ────────────────
   * A self-heal replaces the root, so a DOM-only status line vanished with it.
   * remountStatus() builds a genuinely new, empty status node through the same
   * document the module uses, then re-registers it under its owned token. */
  function remountStatus(sandbox, reg) {
    const fresh = sandbox.document.createElement('div');
    fresh.setAttribute('data-cgxui', 'prmn-status');
    reg.set('prmn-status', fresh);
    return fresh;
  }

  check('[fix F] say() records the feedback authority in STATE_PM.ui', () => {
    const { t: tt, root } = boot();
    tt.feedback.say('Storage write failed', 'error', root);
    assert.equal(tt.state.ui.feedback.message, 'Storage write failed');
    assert.equal(tt.state.ui.feedback.kind, 'error');
  });

  check('[fix F] a persistent error is re-applied to a freshly mounted status node', () => {
    const { t: tt, sandbox, reg, root } = boot();
    tt.feedback.say('Storage write failed', 'error', root);
    const fresh = remountStatus(sandbox, reg);
    assert.equal(fresh.textContent, '', 'the new node starts empty');
    assert.equal(tt.feedback.restore(root), true);
    assert.equal(fresh.textContent, 'Storage write failed', 'text restored');
    assert.ok(fresh.classList.contains('cgxui-prmn--status-show'), 'shown');
    assert.ok(fresh.classList.contains('cgxui-prmn--status-err'), 'error styling restored');
  });

  check('[fix F] restore() creates no auto-clear timer for the restored error', () => {
    const { t: tt, sandbox, reg, root } = boot();
    tt.feedback.say('Storage write failed', 'error', root);
    remountStatus(sandbox, reg);
    const before = sandbox.__timers.length;
    tt.feedback.restore(root);
    assert.equal(sandbox.__timers.length, before, 'a restored error must never be scheduled away');
    assert.equal(tt.state.ui.feedback.kind, 'error', 'restore does not consume the authority');
  });

  check('[fix F] a stale-target error survives a remount and is still shown', () => {
    const { t: tt, sandbox, reg, root } = boot();
    tt.state.data.prompts = [P('p1', 'T', 'B')];
    tt.editor.open(root, { kind: 'prompt', mode: 'edit', id: 'p1' });
    reg.get('prmn-ed-title').value = 'T';
    reg.get('prmn-ed-body').value = 'B';
    tt.state.data.prompts = [];
    tt.editor.save(root);
    const fresh = remountStatus(sandbox, reg);
    tt.editor.restore(root);                       // recovery, not a user action
    tt.feedback.restore(root);
    assert.equal(fresh.textContent, 'Item no longer exists');
    assert.equal(tt.editor.isOpen(), true, 'editor restored alongside the error');
  });

  check('[fix F] editor restore() does NOT clear the persistent error authority', () => {
    const { t: tt, root } = boot();
    tt.state.data.prompts = [P('p1', 'T', 'B')];
    tt.editor.open(root, { kind: 'prompt', mode: 'edit', id: 'p1' });
    tt.feedback.say('Storage write failed', 'error', root);
    tt.editor.restore(root);
    assert.equal(tt.state.ui.feedback.message, 'Storage write failed', 'recovery must not dismiss it');
  });

  check('[fix F] transient info does NOT become permanent because a remount occurred', () => {
    const { t: tt, sandbox, reg, root } = boot();
    tt.feedback.say('Saved', 'info', root);
    assert.equal(tt.state.ui.feedback.kind, 'info');
    const fresh = remountStatus(sandbox, reg);
    assert.equal(tt.feedback.restore(root), false, 'nothing persistent to restore');
    assert.equal(fresh.textContent, '', 'a transient message is not re-applied');
    assert.equal(tt.state.ui.feedback.message, '', 'transient authority dropped');
    assert.equal(tt.state.ui.feedback.kind, '');
  });

  check('[fix F] clearTransient drops info/success but preserves an error', () => {
    const { t: tt, root } = boot();
    tt.feedback.say('Saved', 'info', root);
    assert.equal(tt.feedback.clearTransient(), true);
    assert.equal(tt.state.ui.feedback.message, '');
    tt.feedback.say('Storage write failed', 'error', root);
    assert.equal(tt.feedback.clearTransient(), false, 'an error is not transient');
    assert.equal(tt.state.ui.feedback.message, 'Storage write failed');
  });

  check('[fix F] hide() clears BOTH the DOM and the stored feedback authority', () => {
    const { t: tt, reg, root } = boot();
    tt.feedback.say('Storage write failed', 'error', root);
    tt.feedback.hide(root);
    assert.equal(reg.get('prmn-status').textContent, '', 'DOM cleared');
    assert.ok(!reg.get('prmn-status').classList.contains('cgxui-prmn--status-err'));
    assert.equal(tt.state.ui.feedback.message, '', 'authority cleared');
    assert.equal(tt.state.ui.feedback.kind, '');
  });

  check('[fix F] a dismissed error does not reappear at the next remount', () => {
    const { t: tt, sandbox, reg, root } = boot();
    tt.feedback.say('Storage write failed', 'error', root);
    tt.feedback.hide(root);
    const fresh = remountStatus(sandbox, reg);
    assert.equal(tt.feedback.restore(root), false);
    assert.equal(fresh.textContent, '');
  });

  check('[fix F] a successful Save after an error replaces it with Saved', () => {
    const { t: tt, reg, root } = boot();
    tt.state.data.prompts = [P('p1', 'T', 'B')];
    tt.editor.open(root, { kind: 'prompt', mode: 'edit', id: 'p1' });
    tt.feedback.say('Storage write failed', 'error', root);
    reg.get('prmn-ed-title').value = 'New';
    reg.get('prmn-ed-body').value = 'New body';
    assert.equal(tt.editor.save(root), true);
    assert.equal(reg.get('prmn-status').textContent, 'Saved');
    assert.equal(tt.state.ui.feedback.message, 'Saved');
    assert.equal(tt.state.ui.feedback.kind, 'info', 'the error authority is replaced, not merged');
    assert.ok(!reg.get('prmn-status').classList.contains('cgxui-prmn--status-err'));
  });

  check('[fix F] a successful Delete after an error replaces it with Deleted', () => {
    const { t: tt, reg, root } = boot();
    tt.state.data.prompts = [P('p1', 'T', 'B')];
    tt.editor.open(root, { kind: 'prompt', mode: 'edit', id: 'p1' });
    tt.feedback.say('Storage write failed', 'error', root);
    tt.editor.armDelete(root);
    assert.equal(tt.editor.confirmDelete(root), true);
    assert.equal(reg.get('prmn-status').textContent, 'Deleted');
    assert.equal(tt.state.ui.feedback.message, 'Deleted');
    assert.equal(tt.state.ui.feedback.kind, 'info');
  });

  check('[fix F] an error raised with no status node is still recorded for restore', () => {
    const { t: tt, sandbox, reg, root } = boot();
    reg.delete('prmn-status');                     // root mid-remount: no node
    assert.equal(tt.feedback.say('Storage write failed', 'error', root), false, 'DOM not updated');
    assert.equal(tt.state.ui.feedback.kind, 'error', 'but the authority is recorded');
    const fresh = remountStatus(sandbox, reg);
    assert.equal(tt.feedback.restore(root), true);
    assert.equal(fresh.textContent, 'Storage write failed');
  });

  check('[fix F] feedback authority is memory only — no storage key is written', () => {
    const { t: tt, sandbox, root } = boot();
    tt.feedback.say('Storage write failed', 'error', root);
    const keys = [];
    for (let i = 0; i < sandbox.localStorage.length; i++) keys.push(sandbox.localStorage.key(i));
    assert.ok(!keys.some(k => /feedback|status/i.test(String(k))), `no feedback key may exist: ${keys.join(',')}`);
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
