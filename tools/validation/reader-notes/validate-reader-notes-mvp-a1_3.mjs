#!/usr/bin/env node
// Validator for Studio Reader & Notes MVP-A1.3a:
// zero-attribution-risk highlight support in the read-only annotation facade.
//
// A1.3a must enumerate highlights as unattributed only. It must not move
// highlights into listForItem(), must not attempt safe attribution, and must
// not implement anchor resolver, sidecar, renderer registry, or native_note.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..', '..', '..');

const MODULE_REL = 'src-surfaces-base/studio/reader-notes/annotation-facade.studio.js';
const A1_2_VALIDATOR_REL = 'tools/validation/reader-notes/validate-reader-notes-mvp-a1_2.mjs';
const A1_1_VALIDATOR_REL = 'tools/validation/reader-notes/validate-reader-notes-mvp-a1_1.mjs';
const A0_VALIDATOR_REL = 'tools/validation/reader-notes/validate-reader-notes-architecture-contract-v1_2.mjs';
const STUDIO_HTML_REL = 'src-surfaces-base/studio/studio.html';
const PACK_REL = 'tools/product/studio/pack-studio.mjs';

const OUTER_FLAG_KEY = 'studio.readerNotes.annotationFacade.enabled';
const HIGHLIGHT_FLAG_KEY = 'studio.readerNotes.annotationHighlights.enabled';
const A1_3_MARKERS = [
  'annotationHighlights',
  'listUnattributed',
  'a1_3a-attribution-deferred',
];
const FORBIDDEN_FILES = [
  'src-surfaces-base/studio/store/highlights.js',
  'src-surfaces-base/studio/store/notes.js',
  'src-surfaces-base/studio/store/bookmarks.js',
  'src-surfaces-base/studio/studio.js',
];
const FORBIDDEN_DIRS = [
  'src-surfaces-base/studio/sync',
  'src-surfaces-base/studio/ingestion',
  'src-runtime-base',
  'apps/studio/desktop/src-tauri',
];
const HIGHLIGHT_WRITE_METHODS = [
  'setForAnswer',
  'removeForAnswer',
  'update',
  'saveNow',
  'setCurrentColor',
  'save',
  'set',
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

const moduleText = read(MODULE_REL);

function freshRuntime(options = {}) {
  const calls = {
    highlightsGetAll: 0,
    highlightsGetForAnswer: [],
    highlightWrites: [],
    notesList: [],
    bookmarksList: [],
  };
  const flagMap = {
    [OUTER_FLAG_KEY]: options.outerFlag,
    [HIGHLIGHT_FLAG_KEY]: options.highlightFlag,
  };
  const mock = {
    flags: options.missingFlags ? null : {
      get(key, fallback) {
        return Object.prototype.hasOwnProperty.call(flagMap, key) && flagMap[key] !== undefined
          ? flagMap[key]
          : fallback;
      },
    },
    Studio: {
      readerNotes: {
        libraryItems: {
          get(id) {
            return id === 'chatA'
              ? { kind: 'captured_chat', id: 'chatA', identity: { chatId: 'chatA' } }
              : null;
          },
        },
      },
      store: {
        notes: {
          list(chatId) {
            calls.notesList.push(chatId);
            return [{ id: 'note1', title: 'N', text: 'note body' }];
          },
        },
        bookmarks: {
          list(chatId) {
            calls.bookmarksList.push(chatId);
            return [{ msgId: 'bookmark1', title: 'B', snapText: 'bookmark body' }];
          },
        },
      },
    },
  };

  if (options.withHighlights !== false) {
    const itemsByAnswer = options.itemsByAnswer || {
      ans1: [
        { id: 'h1', convoId: 'c/chatA', color: 'yellow', anchors: { exact: 'quote one' }, ts: 101 },
        { id: 'h2', convoId: 'c/chatB', exact: 'quote two', highlightColor: 'green', ts: 202 },
      ],
      ans2: [
        'BAD',
        { convoId: 'c/chatA', quote: 'fallback id quote', c: 'blue' },
      ],
    };
    const blob = options.highlightBlob || { convoId: 'c/chatA', itemsByAnswer };
    mock.Studio.store.highlights = {
      getAll() {
        calls.highlightsGetAll += 1;
        if (options.throwGetAll) throw new Error('getAll boom');
        return blob;
      },
      getForAnswer(answerId) {
        calls.highlightsGetForAnswer.push(answerId);
        if (options.throwGetForAnswer) throw new Error('getForAnswer boom');
        const list = itemsByAnswer[answerId];
        return Array.isArray(list) ? JSON.parse(JSON.stringify(list)) : [];
      },
    };
    for (const method of HIGHLIGHT_WRITE_METHODS) {
      if (!mock.Studio.store.highlights[method]) {
        mock.Studio.store.highlights[method] = function forbiddenWrite() {
          calls.highlightWrites.push(method);
          throw new Error(`forbidden highlight write method called: ${method}`);
        };
      }
    }
  }

  const sandbox = { H2O: mock };
  sandbox.globalThis = sandbox;
  sandbox.window = undefined;
  vm.createContext(sandbox);
  vm.runInContext(moduleText, sandbox, { filename: 'annotation-facade.studio.js' });
  return { api: sandbox.H2O.Studio.readerNotes.annotations, calls, mock };
}

function runValidator(rel) {
  const full = path.join(REPO_ROOT, rel);
  assert.ok(fs.existsSync(full), `${rel} must exist`);
  try {
    const out = execFileSync('node', [full], { cwd: REPO_ROOT, encoding: 'utf8' });
    assert.ok(/validation passed/.test(out), `${rel} did not report passed`);
  } catch (error) {
    const output = (error && (error.stdout || '')) + (error && (error.stderr || ''));
    throw new Error(`${rel} failed (exit ${error && error.status}): ${output.slice(-500)}`);
  }
}
function assertEmptyArray(value, label) {
  assert.ok(Array.isArray(value), `${label}: expected array`);
  assert.equal(value.length, 0, `${label}: expected empty array`);
}

// 1.
check('annotation-facade.studio.js exists', () => {
  assert.ok(fs.existsSync(path.join(REPO_ROOT, MODULE_REL)), `${MODULE_REL} must exist`);
});

// 2.
check('public API includes listUnattributed', () => {
  const { api } = freshRuntime();
  assert.equal(typeof api.listUnattributed, 'function', 'listUnattributed must be public');
  has(moduleText, 'listUnattributed', 'source should define listUnattributed');
});

// 3.
check('API remains frozen/read-only', () => {
  const { api } = freshRuntime();
  assert.equal(api.readonly, true, 'readonly true');
  assert.ok(Object.isFrozen(api), 'api frozen');
});

// 4.
check('API exposes no write-like methods', () => {
  const { api } = freshRuntime();
  const writeLike = /^(set|save|update|remove|delete|upsert|patch|clear|write|put|add|mutate|persist|commit)/i;
  const bad = Object.keys(api).filter((key) => typeof api[key] === 'function' && writeLike.test(key));
  assert.deepEqual(bad, [], `write-like api methods exposed: ${bad.join(',')}`);
});

// 5.
check('kinds includes highlight', () => {
  const { api } = freshRuntime();
  assert.ok(Array.isArray(api.kinds), 'kinds array');
  assert.ok(api.kinds.includes('note'), 'includes note');
  assert.ok(api.kinds.includes('bookmark'), 'includes bookmark');
  assert.ok(api.kinds.includes('highlight'), 'includes highlight');
});

// 6 + 7.
check('highlight sub-flag key exists and defaults off', () => {
  has(moduleText, HIGHLIGHT_FLAG_KEY, 'highlight flag key');
  has(moduleText, 'get(HIGHLIGHT_FLAG_KEY, false)', 'highlight flag default-off read');
  const { api } = freshRuntime({ outerFlag: true });
  assertEmptyArray(api.listUnattributed(), 'missing highlight flag value defaults off');
  assert.equal(api.selfCheck().highlightSubFlag, false, 'selfCheck reports sub-flag disabled');
});

// 8.
check('with highlight sub-flag off, listUnattributed returns []', () => {
  const { api, calls } = freshRuntime({ outerFlag: true, highlightFlag: false });
  assertEmptyArray(api.listUnattributed(), 'sub-flag off');
  assert.equal(calls.highlightsGetAll, 0, 'must not read highlight store when sub-flag off');
});

// 9.
check('with outer facade flag off, listUnattributed returns []', () => {
  const { api, calls } = freshRuntime({ outerFlag: false, highlightFlag: true });
  assertEmptyArray(api.listUnattributed(), 'outer flag off');
  assert.equal(calls.highlightsGetAll, 0, 'must not read highlight store when outer flag off');
  const missing = freshRuntime({ missingFlags: true });
  assertEmptyArray(missing.api.listUnattributed(), 'missing flags fail closed');
});

// 10 + 12.
check('with both flags on, mocked highlights return unattributed objects', () => {
  const { api } = freshRuntime({ outerFlag: true, highlightFlag: true });
  const res = api.listUnattributed();
  assert.equal(res.length, 3, `expected 3 valid highlights, got ${res.length}`);
  for (const h of res) {
    assert.equal(h.schemaVersion, 1);
    assert.equal(h.kind, 'highlight');
    assert.equal(h.item, null);
    assert.equal(h.attribution, 'unattributed');
    assert.equal(h.reason, 'a1_3a-attribution-deferred');
    assert.equal(h.source.store, 'highlights');
    assert.equal(h.source.chatId, null);
    assert.ok(h.source.answerId === 'ans1' || h.source.answerId === 'ans2');
    assert.ok(h.id.startsWith(`highlight:unattributed:${h.source.answerId}:`));
    assert.ok(h.raw && typeof h.raw === 'object', 'raw clone present');
  }
  const first = res.find((h) => h.source.nativeId === 'h1');
  assert.equal(first.source.convoId, 'c/chatA');
  assert.equal(first.body.color, 'yellow');
  assert.equal(first.body.text, 'quote one');
  assert.equal(first.body.createdAt, 101);
  const fallback = res.find((h) => h.source.answerId === 'ans2');
  assert.equal(fallback.source.nativeId, 'ans2:1', 'fallback native id');
  assert.equal(fallback.body.text, 'fallback id quote');
});

// 11.
check('A1.3a does not add highlights to listForItem', () => {
  const { api, calls } = freshRuntime({ outerFlag: true, highlightFlag: true });
  const res = api.listForItem('chatA');
  assert.deepEqual(Array.from(res, (a) => a.kind).sort(), ['bookmark', 'note']);
  assert.equal(calls.highlightsGetAll, 0, 'listForItem must not enumerate highlights');
  assert.deepEqual(calls.highlightsGetForAnswer, [], 'listForItem must not read highlight answer buckets');
});

// 13 + 14.
check('A1.3a does not attempt safe attribution and ignores top-level blob convoId', () => {
  const { api } = freshRuntime({ outerFlag: true, highlightFlag: true });
  const res = api.listUnattributed();
  const apparentlyAttributable = res.find((h) => h.source.convoId === 'c/chatA');
  assert.ok(apparentlyAttributable, 'fixture includes per-item c/chatA provenance');
  assert.equal(apparentlyAttributable.item, null, 'must not attribute even exact-looking per-item provenance in A1.3a');
  assert.equal(apparentlyAttributable.attribution, 'unattributed');
  assert.ok(res.every((h) => h.source.chatId === null), 'top-level blob convoId must not assign chatId');
});

// 15.
check('returned raw highlight entries are deep cloned', () => {
  const source = { ans1: [{ id: 'h1', anchors: { exact: 'ORIG' }, color: 'yellow' }] };
  const { api } = freshRuntime({ outerFlag: true, highlightFlag: true, itemsByAnswer: source });
  const res = api.listUnattributed();
  res[0].raw.anchors.exact = 'MUTATED';
  res[0].body.text = 'BODY MUTATED';
  assert.equal(source.ans1[0].anchors.exact, 'ORIG', 'source fixture must not mutate');
});

// 16.
check('malformed highlights are omitted and counted', () => {
  const { api } = freshRuntime({ outerFlag: true, highlightFlag: true });
  api.listUnattributed();
  const diag = api.diagnose();
  assert.equal(diag.lastUnattributedHighlights, 3, 'three valid highlights counted');
  assert.equal(diag.lastMalformed.highlight, 1, 'one malformed highlight counted');
});

// 17.
check('missing highlights store fails closed', () => {
  const { api } = freshRuntime({ outerFlag: true, highlightFlag: true, withHighlights: false });
  assertEmptyArray(api.listUnattributed(), 'missing highlights store');
  assert.equal(api.selfCheck().deps.highlightsStore, false);
});

// 18.
check('store errors are caught and return []', () => {
  const getAll = freshRuntime({ outerFlag: true, highlightFlag: true, throwGetAll: true });
  assertEmptyArray(getAll.api.listUnattributed(), 'getAll throw');
  const getFor = freshRuntime({ outerFlag: true, highlightFlag: true, throwGetForAnswer: true });
  assertEmptyArray(getFor.api.listUnattributed(), 'getForAnswer throw');
});

// 19 + 20.
check('only allowed highlight read APIs are used and no write APIs are called', () => {
  const { api, calls } = freshRuntime({ outerFlag: true, highlightFlag: true });
  api.listUnattributed();
  assert.equal(calls.highlightsGetAll, 1, 'getAll used once');
  assert.deepEqual(calls.highlightsGetForAnswer.sort(), ['ans1', 'ans2'], 'getForAnswer used per answer');
  assert.deepEqual(calls.highlightWrites, [], 'no highlight write methods called');
  for (const method of HIGHLIGHT_WRITE_METHODS) {
    assert.ok(!new RegExp(`\\.\\s*${method}\\s*\\(`).test(moduleText), `source must not call highlights.${method}()`);
  }
});

// 21.
check('no raw browser storage APIs', () => {
  for (const token of ['chrome.', 'localStorage', 'sessionStorage', 'indexedDB']) {
    hasNot(moduleText, token, 'forbidden storage API');
  }
});

// 22-25.
check('no anchor resolver / sidecar / native_note / renderer registry implementation', () => {
  for (const token of [
    'readerNotes.anchor',
    'anchorResolver',
    'resolveAnchor',
    'readerNotes.sidecar',
    'nativeNote',
    'native_note:',
    'rendererRegistry',
    'buildReaderDOM',
  ]) {
    hasNot(moduleText, token, 'forbidden later-phase implementation marker');
  }
});

// 26.
check('no sync/ingestion/runtime marker footprint', () => {
  for (const rel of FORBIDDEN_FILES) {
    const text = readIfExists(rel);
    if (text == null) continue;
    for (const marker of A1_3_MARKERS) hasNot(text, marker, `forbidden file ${rel}`);
  }
  for (const dirRel of FORBIDDEN_DIRS) {
    const files = listFilesRecursive(path.join(REPO_ROOT, dirRel), []);
    for (const file of files) {
      let text = '';
      try { text = fs.readFileSync(file, 'utf8'); } catch { continue; }
      for (const marker of A1_3_MARKERS) {
        assert.ok(!text.includes(marker), `forbidden dir ${dirRel} file ${path.relative(REPO_ROOT, file)} contains ${marker}`);
      }
    }
  }
});

check('no loader or pack changes required for A1.3a', () => {
  const html = read(STUDIO_HTML_REL);
  const pack = read(PACK_REL);
  has(html, 'reader-notes/annotation-facade.studio.js', 'A1.2 loader still present');
  has(pack, 'reader-notes/annotation-facade.studio.js', 'A1.2 pack entry still present');
  hasNot(html, 'annotationHighlights', 'no A1.3a loader marker in studio.html');
  hasNot(pack, 'annotationHighlights', 'no A1.3a pack marker');
});

// 27-29.
check('A1.2 validator still passes', () => runValidator(A1_2_VALIDATOR_REL));
check('A1.1 validator still passes', () => runValidator(A1_1_VALIDATOR_REL));
check('A0 contract validator still passes', () => runValidator(A0_VALIDATOR_REL));

if (fail.length) {
  console.log(`\nReader & Notes MVP-A1.3 validation failed: ${fail.length} failed, ${pass.length} passed.`);
  process.exitCode = 1;
} else {
  console.log(`\nReader & Notes MVP-A1.3 validation passed: ${pass.length} checks.`);
}
