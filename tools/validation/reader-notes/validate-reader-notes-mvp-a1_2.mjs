#!/usr/bin/env node
// Validator for Studio Reader & Notes MVP-A1.2:
// the flag-guarded, read-only notes + bookmarks annotation façade.
//
// Combines static source assertions with behavioral tests. The module is a
// browser IIFE; it is loaded in a node:vm sandbox with a mocked H2O global so
// its runtime behavior (flag-off, missing deps, unknown/empty id, mapping,
// malformed counting, clone-safety) can be exercised without a browser.
// This script writes no files. The only child processes are the A1.1 and A0
// validators (checks 22-23), which are themselves read-only.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..', '..', '..');

const MODULE_REL = 'src-surfaces-base/studio/reader-notes/annotation-facade.studio.js';
const A1_VIEW_REL = 'src-surfaces-base/studio/reader-notes/library-item-view.studio.js';
const A1_1_VALIDATOR_REL = 'tools/validation/reader-notes/validate-reader-notes-mvp-a1_1.mjs';
const A0_VALIDATOR_REL = 'tools/validation/reader-notes/validate-reader-notes-architecture-contract-v1_2.mjs';
const STUDIO_HTML_REL = 'src-surfaces-base/studio/studio.html';
const PACK_REL = 'tools/product/studio/pack-studio.mjs';
const FLAG_KEY = 'studio.readerNotes.annotationFacade.enabled';

const MARKERS = ['readerNotes.annotations', 'annotation-facade', 'annotationFacade'];
const FORBIDDEN_FILES = [
  'src-surfaces-base/studio/store/notes.js',
  'src-surfaces-base/studio/store/bookmarks.js',
  'src-surfaces-base/studio/store/highlights.js',
  'src-surfaces-base/studio/studio.js',
];
const FORBIDDEN_DIRS = [
  'src-surfaces-base/studio/sync',
  'src-surfaces-base/studio/ingestion',
];

const pass = [];
const fail = [];
function readIfExists(rel) {
  const full = path.join(REPO_ROOT, rel);
  return fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : null;
}
function read(rel) { const t = readIfExists(rel); assert.ok(t != null, `${rel} must exist`); return t; }
function check(label, fn) {
  try { fn(); pass.push(label); console.log(`[ok] ${label}`); }
  catch (error) {
    const m = error && error.message ? error.message : String(error);
    fail.push({ label, message: m });
    console.log(`[fail] ${label}`);
    console.log(`       ${m}`);
  }
}
function has(t, n, l) { assert.ok(t.includes(n), `${l}: missing "${n}"`); }
function hasNot(t, n, l) { assert.ok(!t.includes(n), `${l}: must NOT contain "${n}"`); }
function listFilesRecursive(absDir, acc) {
  let entries = [];
  try { entries = fs.readdirSync(absDir, { withFileTypes: true }); } catch { return acc; }
  for (const e of entries) {
    const p = path.join(absDir, e.name);
    if (e.isDirectory()) listFilesRecursive(p, acc); else acc.push(p);
  }
  return acc;
}

const moduleText = read(MODULE_REL);

// ── Behavioral harness: load the IIFE in a vm sandbox with a mock H2O ──────
function freshMock() { return { flags: null, Studio: { store: {}, readerNotes: {} } }; }
const mock = freshMock();
globalThis.H2O = mock;
vm.runInThisContext(moduleText, { filename: 'annotation-facade.studio.js' });
const api = mock.Studio.readerNotes.annotations;
assert.ok(api && api.__installed, 'module must install H2O.Studio.readerNotes.annotations');

// in-place leaf setters (deps are read lazily, so mutation between scenarios works)
const setFlag = (enabled) => { mock.flags = (enabled === undefined) ? null : { get: (k, d) => (k === FLAG_KEY ? enabled : d) }; };
const setLib = (getFn) => { mock.Studio.readerNotes.libraryItems = getFn ? { get: getFn } : undefined; };
const setNotes = (listFn) => { mock.Studio.store.notes = listFn ? { list: listFn } : undefined; };
const setBookmarks = (listFn) => { mock.Studio.store.bookmarks = listFn ? { list: listFn } : undefined; };
const validItemGet = (id) => (id === 'chatA' ? { kind: 'captured_chat', id: 'chatA', identity: { chatId: 'chatA' } } : null);

// Load the pack module once (top-level await) so check 21 can read its lists.
const packMod = await import(pathToFileURL(path.join(REPO_ROOT, PACK_REL)).href);

// 1.
check('A1.2 module file exists', () => {
  assert.ok(fs.existsSync(path.join(REPO_ROOT, MODULE_REL)));
});

// 2.
check('module installs H2O.Studio.readerNotes.annotations', () => {
  has(moduleText, 'H2O.Studio.readerNotes.annotations', 'namespace');
  assert.ok(api && api.__installed === true, 'annotations installed at runtime');
});

// 3 + 4. Read-only API allowlist (runtime) + no write-like methods (static).
check('public API is exactly the read-only methods (runtime allowlist)', () => {
  const keys = Object.keys(api).sort();
  assert.deepEqual(keys,
    ['__installed', 'diagnose', 'flagKey', 'isEnabled', 'kinds', 'listForItem', 'readonly', 'selfCheck', 'version'],
    `unexpected api keys: ${keys.join(',')}`);
  const fnKeys = keys.filter((k) => typeof api[k] === 'function').sort();
  assert.deepEqual(fnKeys, ['diagnose', 'isEnabled', 'listForItem', 'selfCheck'],
    `unexpected function keys: ${fnKeys.join(',')}`);
  assert.equal(api.readonly, true, 'readonly true');
  assert.equal(api.flagKey, FLAG_KEY, 'flagKey');
  assert.ok(Array.isArray(api.kinds) && api.kinds.join(',') === 'note,bookmark', 'kinds = note,bookmark');
  assert.ok(Object.isFrozen(api), 'api is frozen');
});
check('module exposes no write-like methods (static)', () => {
  const re = /\b(set|save|update|remove|delete|upsert|patch|clear|write|put|add|mutate|persist|commit)\s*[:(]/;
  const m = moduleText.match(re);
  assert.ok(!m, `write-like token found: ${m ? m[0] : ''}`);
});

// 5-9. forbidden later-phase tokens absent.
check('no listUnattributed / highlights / anchor / sidecar / native_note', () => {
  hasNot(moduleText, 'listUnattributed', 'no unattributed listing');
  hasNot(moduleText, 'unattributed', 'no unattributed');
  hasNot(moduleText, 'highlight', 'no highlights');
  hasNot(moduleText, 'anchor', 'no anchor resolver');
  hasNot(moduleText, 'sidecar', 'no sidecar');
  hasNot(moduleText, 'native_note', 'no native_note');
  hasNot(moduleText, 'native-note', 'no native-note');
  hasNot(moduleText, 'getScratch', 'no scratchpad read');
  hasNot(moduleText, 'scratch', 'no scratch exposure');
});

// 10. flag key + default off.
check('feature flag key present and defaults off', () => {
  has(moduleText, `'${FLAG_KEY}'`, 'flag key string');
  has(moduleText, 'get(FLAG_KEY, false)', 'default-off read');
  has(moduleText, '=== true', 'strict-true coercion');
});

// 11. flag-off returns [] (not throws).
check('flag-off listForItem returns [] (not throws)', () => {
  setLib(validItemGet); setNotes(() => [{ id: 'n1' }]); setBookmarks(() => [{ msgId: 'm1' }]);
  setFlag(false);
  assert.deepEqual(api.listForItem('chatA'), []);
  setFlag(undefined); // H2O.flags missing
  assert.deepEqual(api.listForItem('chatA'), []);
});

// 12. missing dependency returns [] (not throws).
check('missing dependency returns [] (not throws)', () => {
  setFlag(true); setNotes(() => [{ id: 'n1' }]); setBookmarks(() => [{ msgId: 'm1' }]);
  setLib(null); // A1.1 view missing
  assert.deepEqual(api.listForItem('chatA'), []);
});

// 13. unknown item id returns [].
check('unknown item id returns []', () => {
  setFlag(true); setLib(validItemGet); setNotes(() => [{ id: 'n1' }]); setBookmarks(() => [{ msgId: 'm1' }]);
  assert.deepEqual(api.listForItem('does-not-exist'), []);
});

// 14. empty item id does not read any store (so never the 'unknown' bucket).
check("empty item id does not read stores ('unknown' bucket safe)", () => {
  setFlag(true); setLib(validItemGet);
  const notesCalls = []; const bmCalls = [];
  setNotes((c) => { notesCalls.push(c); return []; });
  setBookmarks((c) => { bmCalls.push(c); return []; });
  assert.deepEqual(api.listForItem(''), []);
  assert.deepEqual(api.listForItem(null), []);
  assert.deepEqual(api.listForItem(undefined), []);
  assert.equal(notesCalls.length, 0, 'notes.list must not be called for empty id');
  assert.equal(bmCalls.length, 0, 'bookmarks.list must not be called for empty id');
  // positive control: valid id calls with the real chatId only
  api.listForItem('chatA');
  assert.deepEqual(notesCalls, ['chatA']);
  assert.deepEqual(bmCalls, ['chatA']);
  assert.ok(!notesCalls.includes('unknown') && !notesCalls.includes(''), 'no unknown/empty bucket read');
});

// 15 + 16. mapping shapes + malformed omitted & counted.
check('notes/bookmarks map to expected shape; malformed omitted & counted', () => {
  setFlag(true); setLib(validItemGet);
  const note = { id: 'n1', title: 'NoteTitle', text: 'NoteBody', tags: ['x', 'y'], pinned: true, createdAt: 100, updatedAt: 200, source: { msgId: 'm9', role: 'assistant' } };
  setNotes((c) => (c === 'chatA' ? [note, 'BAD', { title: 'no-id' }] : []));
  const bm = { msgId: 'm1', primaryAId: 'a1', pairNo: 3, snapText: 'SNAP', title: 'BM', turnNo: 5, role: 'user', createdAt: 9 };
  setBookmarks((c) => (c === 'chatA' ? [bm, 77, { title: 'idx-bm' }] : []));

  const res = api.listForItem('chatA');
  assert.equal(res.length, 3, `expected 3 annotations, got ${res.length}`);

  const n = res.find((a) => a.kind === 'note');
  assert.deepEqual(n.item, { kind: 'captured_chat', id: 'chatA' });
  assert.deepEqual(n.source, { store: 'notes', chatId: 'chatA', nativeId: 'n1' });
  assert.equal(n.schemaVersion, 1);
  assert.equal(n.id, 'note:chatA:n1');
  assert.equal(n.body.title, 'NoteTitle');
  assert.equal(n.body.text, 'NoteBody');
  assert.deepEqual(n.body.tags, ['x', 'y']);
  assert.equal(n.body.pinned, true);
  assert.equal(n.body.createdAt, 100);
  assert.equal(n.body.updatedAt, 200);
  assert.deepEqual(n.body.source, { msgId: 'm9', role: 'assistant' });
  assert.deepEqual(n.raw, note);

  const byId = res.filter((a) => a.kind === 'bookmark');
  assert.equal(byId.length, 2);
  const b1 = byId.find((b) => b.source.nativeId === 'm1');
  assert.equal(b1.id, 'bookmark:chatA:m1');
  assert.equal(b1.body.msgId, 'm1');
  assert.equal(b1.body.primaryAId, 'a1');
  assert.equal(b1.body.pairNo, 3);
  assert.equal(b1.body.turnNo, 5);
  assert.equal(b1.body.role, 'user');
  assert.equal(b1.body.createdAt, 9);
  assert.equal(b1.body.text, 'SNAP');
  assert.equal(b1.body.title, 'BM');
  const bIdx = byId.find((b) => b.source.nativeId === '2'); // index fallback
  assert.ok(bIdx, 'index-fallback bookmark present');
  assert.equal(bIdx.id, 'bookmark:chatA:2');
  assert.equal(bIdx.body.msgId, null);
  assert.equal(bIdx.body.primaryAId, null);

  const diag = api.diagnose();
  assert.equal(diag.lastMalformed.note, 2, 'two malformed notes counted');
  assert.equal(diag.lastMalformed.bookmark, 1, 'one malformed bookmark counted');
});

// 17. returned annotations are cloned snapshots, not live store references.
check('returned annotations are cloned snapshots', () => {
  setFlag(true); setLib(validItemGet);
  const liveNote = { id: 'n1', title: 'ORIG', tags: ['t1'], source: { msgId: 'mm' } };
  setNotes(() => [liveNote]); setBookmarks(() => []);
  const res = api.listForItem('chatA');
  const n = res[0];
  n.raw.title = 'HACKED';
  n.body.title = 'HACKED2';
  n.body.tags.push('t2');
  n.body.source.msgId = 'HACK';
  assert.equal(liveNote.title, 'ORIG', 'raw must be a clone');
  assert.deepEqual(liveNote.tags, ['t1'], 'tags must be a copy');
  assert.equal(liveNote.source.msgId, 'mm', 'body.source must be a clone');
});

// (bonus behavioral) store error in one kind continues with the other.
check('store error in one kind continues with the other', () => {
  setFlag(true); setLib(validItemGet);
  setNotes(() => { throw new Error('notes boom'); });
  setBookmarks(() => [{ msgId: 'b1', title: 'OK' }]);
  const res = api.listForItem('chatA');
  assert.equal(res.length, 1);
  assert.equal(res[0].kind, 'bookmark');
  assert.equal(res[0].source.nativeId, 'b1');
});

// 18. no raw storage APIs.
check('no raw storage APIs', () => {
  for (const tok of ['chrome.', 'localStorage', 'sessionStorage', 'indexedDB']) hasNot(moduleText, tok, 'storage API');
});

// 19. only read access (.list) to notes/bookmarks stores.
check('only .list read access to notes/bookmarks stores', () => {
  has(moduleText, 'notesStore.list(', 'reads notes via list');
  has(moduleText, 'bmStore.list(', 'reads bookmarks via list');
  // no write-method call on either store (covered broadly by check 4 too)
  assert.ok(!/\bnotesStore\.(set|save|update|remove|delete|upsert|patch|clear|write|put|add)\s*\(/.test(moduleText), 'no notes write call');
  assert.ok(!/\bbmStore\.(set|save|update|remove|delete|upsert|patch|clear|write|put|add)\s*\(/.test(moduleText), 'no bookmarks write call');
});

// 20. studio.html loads A1.2 after A1.1.
check('studio.html loads A1.2 after A1.1', () => {
  const html = read(STUDIO_HTML_REL);
  const a1 = html.indexOf('reader-notes/library-item-view.studio.js');
  const a2 = html.indexOf('reader-notes/annotation-facade.studio.js');
  assert.ok(a1 >= 0, 'A1.1 script present');
  assert.ok(a2 >= 0, 'A1.2 script present');
  assert.ok(a2 > a1, 'A1.2 must load after A1.1');
});

// 21. pack includes module in both lockstep lists.
check('pack-studio.mjs includes module in both lockstep lists', () => {
  assert.ok(packMod.ARCHIVE_WORKBENCH_SOURCE_FILES.includes('reader-notes/annotation-facade.studio.js'), 'in SOURCE list');
  assert.ok(packMod.ARCHIVE_WORKBENCH_OUT_FILES.includes('reader-notes/annotation-facade.studio.js'), 'in OUT list');
  assert.equal(packMod.ARCHIVE_WORKBENCH_SOURCE_FILES.length, packMod.ARCHIVE_WORKBENCH_OUT_FILES.length, 'lockstep lengths equal');
});

// 22 + 23. prior validators still pass.
function runValidator(rel) {
  const full = path.join(REPO_ROOT, rel);
  assert.ok(fs.existsSync(full), `${rel} must exist`);
  try {
    const out = execFileSync('node', [full], { cwd: REPO_ROOT, encoding: 'utf8' });
    assert.ok(/validation passed/.test(out), `${rel} did not report passed`);
  } catch (e) {
    const so = (e && (e.stdout || '')) + (e && (e.stderr || ''));
    throw new Error(`${rel} failed (exit ${e && e.status}): ${so.slice(-400)}`);
  }
}
check('A1.1 validator still passes', () => runValidator(A1_1_VALIDATOR_REL));
check('A0 contract validator still passes', () => runValidator(A0_VALIDATOR_REL));

// 24. no A1.2 footprint in forbidden lanes.
check('forbidden paths carry no A1.2 footprint', () => {
  for (const rel of FORBIDDEN_FILES) {
    const t = readIfExists(rel);
    if (t == null) continue;
    for (const marker of MARKERS) hasNot(t, marker, `forbidden file ${rel}`);
  }
  for (const dirRel of FORBIDDEN_DIRS) {
    for (const f of listFilesRecursive(path.join(REPO_ROOT, dirRel), [])) {
      let t = '';
      try { t = fs.readFileSync(f, 'utf8'); } catch { continue; }
      for (const marker of MARKERS) {
        assert.ok(!t.includes(marker), `forbidden dir ${dirRel} file ${path.relative(REPO_ROOT, f)} has "${marker}"`);
      }
    }
  }
  assert.ok(read(A1_VIEW_REL).length > 0, 'A1.1 view still present');
});

if (fail.length) {
  console.log(`\nReader & Notes MVP-A1.2 validation failed: ${fail.length} failed, ${pass.length} passed.`);
  process.exitCode = 1;
} else {
  console.log(`\nReader & Notes MVP-A1.2 validation passed: ${pass.length} checks.`);
}
