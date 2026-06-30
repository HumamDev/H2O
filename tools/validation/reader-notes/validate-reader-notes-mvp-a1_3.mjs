#!/usr/bin/env node
// Validator for Studio Reader & Notes MVP-A1.3b:
// exact per-item convoId highlight attribution in the read-only annotation
// facade. This validator writes no files.

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

const OUTER_FLAG_KEY = 'studio.readerNotes.annotationFacade.enabled';
const HIGHLIGHT_FLAG_KEY = 'studio.readerNotes.annotationHighlights.enabled';
const A1_3_MARKERS = ['annotationHighlights', 'listUnattributed', 'lastAttributedHighlights'];
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
function assertEmptyArray(value, label) {
  assert.ok(Array.isArray(value), `${label}: expected array`);
  assert.equal(value.length, 0, `${label}: expected empty array`);
}

const moduleText = read(MODULE_REL);

function makeItemsByAnswer() {
  return {
    answerLooksLikeChatA: [
      { id: 'ha', convoId: 'c/chatA', color: 'yellow', anchors: { exact: 'chat A quote' }, ts: 101 },
      { id: 'hb', convoId: 'c/chatB', color: 'green', anchors: { exact: 'chat B quote' }, ts: 202 },
      { id: 'missing', color: 'pink', anchors: { exact: 'missing convo quote' }, ts: 303 },
      { id: 'unknown', convoId: 'c/unknown', text: 'unknown convo quote', ts: 404 },
      { id: 'bad', convoId: 'chatA', quote: 'bad convo quote', ts: 505 },
      { id: 'unknownLib', convoId: 'c/chatX', quote: 'unknown library quote', ts: 606 },
      'MALFORMED',
    ],
    answerShared: [
      { id: 'hb2', convoId: 'c/chatB', color: 'blue', exact: 'chat B second quote', ts: 707 },
      { id: 'fallback', convoId: 'c/chatA', selectedText: 'chat A fallback quote' },
    ],
  };
}

function freshRuntime(options = {}) {
  const calls = {
    highlightsGetAll: 0,
    highlightsGetForAnswer: [],
    highlightWrites: [],
    notesList: [],
    bookmarksList: [],
    libraryGets: [],
  };
  const itemsByAnswer = options.itemsByAnswer || makeItemsByAnswer();
  const knownChats = options.knownChats || { chatA: true, chatB: true };
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
      readerNotes: {},
      store: {
        notes: {
          list(chatId) {
            calls.notesList.push(chatId);
            return [{ id: `note-${chatId}`, title: 'N', text: 'note body' }];
          },
        },
        bookmarks: {
          list(chatId) {
            calls.bookmarksList.push(chatId);
            return [{ msgId: `bookmark-${chatId}`, title: 'B', snapText: 'bookmark body' }];
          },
        },
      },
    },
  };
  if (!options.missingLibraryItems) {
    mock.Studio.readerNotes.libraryItems = {
      get(id) {
        calls.libraryGets.push(id);
        return knownChats[id] ? { kind: 'captured_chat', id, identity: { chatId: id } } : null;
      },
    };
  }
  if (options.withHighlights !== false) {
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
        if (options.liveHighlightRefs) return Array.isArray(list) ? list : [];
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
  return { api: sandbox.H2O.Studio.readerNotes.annotations, calls, itemsByAnswer };
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

check('exact public API allowlist', () => {
  const { api } = freshRuntime();
  const keys = Object.keys(api).sort();
  assert.deepEqual(keys, [
    '__installed',
    'diagnose',
    'flagKey',
    'isEnabled',
    'kinds',
    'listForItem',
    'listUnattributed',
    'readonly',
    'selfCheck',
    'version',
  ]);
  const fnKeys = keys.filter((key) => typeof api[key] === 'function').sort();
  assert.deepEqual(fnKeys, ['diagnose', 'isEnabled', 'listForItem', 'listUnattributed', 'selfCheck']);
  assert.equal(api.readonly, true);
  assert.ok(Object.isFrozen(api));
});

check('exact-match attribution adds highlights to listForItem', () => {
  const { api } = freshRuntime({ outerFlag: true, highlightFlag: true });
  const res = api.listForItem('chatA');
  const ha = res.find((a) => a.kind === 'highlight' && a.source.nativeId === 'ha');
  assert.ok(ha, 'chatA highlight should be attributed');
  assert.equal(ha.item.kind, 'captured_chat');
  assert.equal(ha.item.id, 'chatA');
  assert.equal(ha.attribution, 'attributed');
  assert.equal(ha.id, 'highlight:chatA:answerLooksLikeChatA:ha');
  assert.equal(ha.source.chatId, 'chatA');
  assert.equal(ha.source.convoId, 'c/chatA');
  assert.equal(ha.body.text, 'chat A quote');
  assert.equal(ha.body.color, 'yellow');
  assert.equal(ha.body.createdAt, 101);
});

check('mixed bucket partitions chatA and chatB by per-item convoId only', () => {
  const { api } = freshRuntime({ outerFlag: true, highlightFlag: true });
  const chatA = Array.from(api.listForItem('chatA').filter((a) => a.kind === 'highlight'), (h) => h.source.nativeId).sort();
  const chatB = Array.from(api.listForItem('chatB').filter((a) => a.kind === 'highlight'), (h) => h.source.nativeId).sort();
  assert.deepEqual(chatA, ['fallback', 'ha']);
  assert.deepEqual(chatB, ['hb', 'hb2']);
});

check('top-level blob convoId is ignored', () => {
  const itemsByAnswer = { answer1: [{ id: 'topOnly', anchors: { exact: 'top only' } }] };
  const { api } = freshRuntime({
    outerFlag: true,
    highlightFlag: true,
    itemsByAnswer,
    highlightBlob: { convoId: 'c/chatA', itemsByAnswer },
  });
  assert.ok(!api.listForItem('chatA').some((a) => a.kind === 'highlight'), 'top-level convoId must not attribute');
  const unattributed = api.listUnattributed();
  assert.equal(unattributed.length, 1);
  assert.equal(unattributed[0].reason, 'missing-convo');
});

check('answerId cannot attribute ownership', () => {
  const { api } = freshRuntime({ outerFlag: true, highlightFlag: true });
  const chatAIds = api.listForItem('chatA').filter((a) => a.kind === 'highlight').map((h) => h.source.nativeId);
  const chatBIds = api.listForItem('chatB').filter((a) => a.kind === 'highlight').map((h) => h.source.nativeId);
  assert.ok(!chatAIds.includes('hb'), 'answerLooksLikeChatA must not attribute hb to chatA');
  assert.ok(chatBIds.includes('hb'), 'hb belongs only to chatB via c/chatB');
});

check('unattributed reasons are implemented', () => {
  const { api } = freshRuntime({ outerFlag: true, highlightFlag: true });
  const byId = Object.fromEntries(api.listUnattributed().map((h) => [h.source.nativeId, h]));
  assert.equal(byId.missing.reason, 'missing-convo');
  assert.equal(byId.unknown.reason, 'unknown-convo');
  assert.equal(byId.bad.reason, 'malformed-convo');
  assert.equal(byId.unknownLib.reason, 'convo-not-in-library');

  const missingLib = freshRuntime({ outerFlag: true, highlightFlag: true, missingLibraryItems: true });
  const unavailable = missingLib.api.listUnattributed().filter((h) => h.reason === 'attribution-unavailable');
  assert.ok(unavailable.length >= 1, 'libraryItems unavailable should produce attribution-unavailable');
});

check('listUnattributed excludes safely attributed highlights', () => {
  const { api } = freshRuntime({ outerFlag: true, highlightFlag: true });
  const ids = Array.from(api.listUnattributed(), (h) => h.source.nativeId).sort();
  assert.deepEqual(ids, ['bad', 'missing', 'unknown', 'unknownLib']);
  const attributed = api.listForItem('chatA').filter((a) => a.kind === 'highlight').map((h) => h.source.nativeId);
  for (const id of attributed) assert.ok(!ids.includes(id), `attributed ${id} must be absent from listUnattributed`);
});

check('clone safety with live getForAnswer references', () => {
  const itemsByAnswer = { answer1: [{ id: 'live', convoId: 'c/chatA', anchors: { exact: 'ORIG' } }] };
  const { api } = freshRuntime({ outerFlag: true, highlightFlag: true, itemsByAnswer, liveHighlightRefs: true });
  const res = api.listForItem('chatA').find((a) => a.kind === 'highlight');
  res.raw.anchors.exact = 'MUTATED';
  res.body.text = 'BODY MUTATED';
  assert.equal(itemsByAnswer.answer1[0].anchors.exact, 'ORIG');
});

check('malformed entries are omitted and counted', () => {
  const { api } = freshRuntime({ outerFlag: true, highlightFlag: true });
  api.listForItem('chatA');
  assert.equal(api.diagnose().lastMalformed.highlight, 1);
  api.listUnattributed();
  assert.equal(api.diagnose().lastMalformed.highlight, 1);
});

check('flags and missing stores fail closed', () => {
  assertEmptyArray(freshRuntime({ outerFlag: false, highlightFlag: true }).api.listUnattributed(), 'outer off');
  assertEmptyArray(freshRuntime({ outerFlag: true, highlightFlag: false }).api.listUnattributed(), 'highlight off');
  assertEmptyArray(freshRuntime({ missingFlags: true }).api.listUnattributed(), 'missing flags');
  assertEmptyArray(freshRuntime({ outerFlag: true, highlightFlag: true, withHighlights: false }).api.listUnattributed(), 'missing store');
});

check('only allowed highlight read APIs are used and no write APIs are called', () => {
  const { api, calls } = freshRuntime({ outerFlag: true, highlightFlag: true });
  api.listForItem('chatA');
  api.listUnattributed();
  assert.ok(calls.highlightsGetAll >= 2, 'getAll should be used to enumerate answer keys');
  assert.ok(calls.highlightsGetForAnswer.includes('answerLooksLikeChatA'), 'getForAnswer used');
  assert.deepEqual(calls.highlightWrites, [], 'no highlight write calls');
  for (const method of HIGHLIGHT_WRITE_METHODS) {
    assert.ok(!new RegExp(`\\.\\s*${method}\\s*\\(`).test(moduleText), `source must not call highlights.${method}()`);
  }
});

check('no raw browser storage', () => {
  for (const token of ['chrome.', 'localStorage', 'sessionStorage', 'indexedDB']) hasNot(moduleText, token, 'raw storage');
});

check('diagnostics include A1.3b attribution fields', () => {
  const { api } = freshRuntime({ outerFlag: true, highlightFlag: true });
  api.listForItem('chatA');
  let diag = api.diagnose();
  assert.equal(diag.lastAttributedHighlights, 2);
  assert.equal(typeof diag.lastUnattributedHighlights, 'number');
  assert.ok(diag.lastAttributionReasons);
  assert.ok(diag.note.includes("item.convoId === 'c/' + chatId"));
  api.listUnattributed();
  diag = api.diagnose();
  assert.equal(diag.lastUnattributedHighlights, 4);
  assert.equal(diag.lastAttributionReasons['missing-convo'], 1);
  assert.equal(diag.lastAttributionReasons['unknown-convo'], 1);
  assert.equal(diag.lastAttributionReasons['malformed-convo'], 1);
  assert.equal(diag.lastAttributionReasons['convo-not-in-library'], 1);
});

check('no anchor resolver / sidecar / renderer registry / native_note implementation', () => {
  for (const token of [
    'readerNotes.anchor',
    'anchorResolver',
    'resolveAnchor',
    'readerNotes.sidecar',
    'rendererRegistry',
    'nativeNote',
    'native_note:',
    'buildReaderDOM',
  ]) {
    hasNot(moduleText, token, 'forbidden later-phase implementation marker');
  }
});

check('no sync / ingestion / runtime marker footprint', () => {
  for (const rel of FORBIDDEN_FILES) {
    const text = readIfExists(rel);
    if (text == null) continue;
    for (const marker of A1_3_MARKERS) hasNot(text, marker, `forbidden file ${rel}`);
  }
  for (const dirRel of FORBIDDEN_DIRS) {
    for (const file of listFilesRecursive(path.join(REPO_ROOT, dirRel), [])) {
      let text = '';
      try { text = fs.readFileSync(file, 'utf8'); } catch { continue; }
      for (const marker of A1_3_MARKERS) {
        assert.ok(!text.includes(marker), `forbidden dir ${dirRel} file ${path.relative(REPO_ROOT, file)} contains ${marker}`);
      }
    }
  }
});

check('A1.2 validator still passes', () => runValidator(A1_2_VALIDATOR_REL));
check('A1.1 validator still passes', () => runValidator(A1_1_VALIDATOR_REL));
check('A0 contract validator still passes', () => runValidator(A0_VALIDATOR_REL));

if (fail.length) {
  console.log(`\nReader & Notes MVP-A1.3 validation failed: ${fail.length} failed, ${pass.length} passed.`);
  process.exitCode = 1;
} else {
  console.log(`\nReader & Notes MVP-A1.3 validation passed: ${pass.length} checks.`);
}
