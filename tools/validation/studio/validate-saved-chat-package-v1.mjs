#!/usr/bin/env node
// Validator for Studio Desktop saved-chat package v1 Phase B.
//
// Loads src-surfaces-base/studio/ingestion/saved-chat-package-v1.tauri.js
// into a Node VM with mocked H2O.Studio.store adapters and mocked Tauri fs.
// Proves package shape, canonical snapshot hashing, renderer hashes, HTML
// sanitization, text fallback, and fail-if-existing write behavior.

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..', '..', '..');
const MODULE_REL = 'src-surfaces-base/studio/ingestion/saved-chat-package-v1.tauri.js';
const MODULE_PATH = path.join(REPO_ROOT, MODULE_REL);
const STUDIO_HTML_REL = 'src-surfaces-base/studio/studio.html';
const PACK_REL = 'tools/product/studio/pack-studio.mjs';

const PASS = [];
const FAIL = [];

function check(label, fn) {
  try {
    fn();
    PASS.push(label);
    console.log(`  ✓ ${label}`);
  } catch (error) {
    const msg = error && error.message ? error.message : String(error);
    FAIL.push({ label, err: msg });
    console.log(`  ✗ ${label}`);
    console.log(`      ${msg}`);
  }
}

async function checkAsync(label, fn) {
  try {
    await fn();
    PASS.push(label);
    console.log(`  ✓ ${label}`);
  } catch (error) {
    const msg = error && error.message ? error.message : String(error);
    FAIL.push({ label, err: msg });
    console.log(`  ✗ ${label}`);
    console.log(`      ${msg}`);
  }
}

function readRepo(rel) {
  return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      if (typeof value[key] !== 'undefined') out[key] = canonicalize(value[key]);
    }
    return out;
  }
  return value;
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function sha256Prefixed(text) {
  return 'sha256-' + crypto.createHash('sha256').update(String(text), 'utf8').digest('hex');
}

function byteLength(text) {
  return Buffer.byteLength(String(text), 'utf8');
}

function createMockStores() {
  const chatId = 'chat_phase_b';
  const snapshotId = 'snap_phase_b';
  const chat = {
    chatId,
    title: 'Phase B Saved Chat',
    href: 'https://chatgpt.com/c/native-phase-b',
    externalId: 'native-phase-b',
    isSaved: true,
    isLinked: true,
    folderId: 'folder_a',
    categoryId: 'cat_a',
    projectId: 'proj_a',
  };
  const snapshot = {
    snapshotId,
    chatId,
    title: 'Phase B Saved Chat Snapshot',
    digest: 'legacy-digest',
    messageCount: 5,
    capturedAt: Date.parse('2026-06-23T10:00:00.000Z'),
    updatedAt: Date.parse('2026-06-23T10:05:00.000Z'),
    meta: {
      model: 'gpt-test',
      locale: 'en-US',
      timezone: 'UTC',
      sourceUrl: 'https://chatgpt.com/c/native-phase-b',
    },
  };
  const turns = [
    {
      turnIdx: 0,
      role: 'user',
      outerHtml: '<div><p>Hello <strong>HTML</strong></p></div>',
      text: 'Hello HTML',
      meta: { messageId: 'm_outerHtml' },
    },
    {
      turnIdx: 1,
      role: 'assistant',
      outerHTML: '<section><p>OuterHTML payload</p></section>',
      text: 'OuterHTML payload',
      meta: { messageId: 'm_outerHTML' },
    },
    {
      turnIdx: 2,
      role: 'user',
      outer_html: '<article><p>outer_html payload</p></article>',
      text: 'outer_html payload',
      meta: { messageId: 'm_outer_html' },
    },
    {
      turnIdx: 3,
      role: 'assistant',
      text: 'Plain text only fallback',
      meta: { messageId: 'm_text' },
    },
    {
      turnIdx: 4,
      role: 'assistant',
      contentHtml: '<div onclick="evil()"><a href="javascript:alert(1)">bad</a><script>alert(2)</script><iframe src="https://x.test"></iframe><p>Safe text</p></div>',
      meta: { messageId: 'm_unsafe' },
    },
  ];

  return {
    chats: {
      get: async (id) => (id === chatId ? { ...chat } : null),
    },
    snapshots: {
      listByChat: async (id) => (id === chatId ? [{ ...snapshot }] : []),
      get: async (id) => (id === snapshotId ? { snapshot: { ...snapshot }, turns: turns.map((turn) => ({ ...turn, meta: { ...(turn.meta || {}) } })) } : null),
    },
    folders: {
      listForChat: async (id) => (id === chatId ? [{ folderId: 'folder_a', name: 'Folder A' }] : []),
    },
    categories: {
      getForChat: async (id) => (id === chatId ? { categoryId: 'cat_a', name: 'Category A' } : null),
    },
    labels: {
      listForChat: async (id) => (id === chatId ? [{ labelId: 'label_a' }, { labelId: 'label_b' }] : []),
    },
    tags: {
      listForChat: async (id) => (id === chatId ? [{ tagId: 'tag_a' }] : []),
    },
  };
}

function createMockFs() {
  const dirs = new Set();
  const files = new Map();
  return {
    dirs,
    files,
    api: {
      exists: async (target) => dirs.has(target) || files.has(target),
      mkdir: async (target) => {
        dirs.add(target);
        return true;
      },
      remove: async (target) => {
        dirs.delete(target);
        for (const key of Array.from(files.keys())) {
          if (key === target || key.startsWith(target + '/')) files.delete(key);
        }
        for (const key of Array.from(dirs.keys())) {
          if (key.startsWith(target + '/')) dirs.delete(key);
        }
        return true;
      },
      writeTextFile: async (target, text) => {
        files.set(target, String(text));
        return true;
      },
    },
  };
}

function loadModule() {
  const stores = createMockStores();
  const mockFs = createMockFs();
  const context = {
    console,
    URL,
    TextEncoder,
    Uint8Array,
    ArrayBuffer,
    Intl,
    navigator: { language: 'en-US' },
    crypto: globalThis.crypto || crypto.webcrypto,
    __TAURI_INTERNALS__: {
      invoke: async () => {
        throw new Error('mock invoke should not be used when __TAURI__.fs facade is present');
      },
    },
    __TAURI__: {
      fs: mockFs.api,
    },
    H2O: {
      Studio: {
        store: stores,
      },
    },
    chrome: {
      runtime: {
        id: 'desktop-test',
        getManifest: () => ({ name: 'H2O Studio Test', version: '0.0.0-test' }),
      },
    },
  };
  context.globalThis = context;
  const sandbox = vm.createContext(context);
  vm.runInContext(readRepo(MODULE_REL), sandbox, { filename: MODULE_REL });
  const ingestion = sandbox.H2O?.Studio?.ingestion;
  if (!ingestion) throw new Error('H2O.Studio.ingestion did not register');
  return { sandbox, stores, mockFs, ingestion };
}

function validatePackageObject(pkg) {
  assert.equal(pkg.ok, true);
  assert.equal(pkg.schema, 'h2o.savedChatPackage');
  assert.equal(pkg.schemaVersion, 1);
  assert.equal(pkg.packageDirName, 'chat_phase_b.h2ochat');
  for (const name of ['manifest.json', 'snapshot.json', 'chat.md', 'chat.html']) {
    assert.ok(pkg.files[name], `${name} missing from build result`);
    assert.equal(typeof pkg.files[name].text, 'string', `${name} text missing`);
  }

  const manifest = JSON.parse(pkg.files['manifest.json'].text);
  const snapshot = JSON.parse(pkg.files['snapshot.json'].text);
  assert.equal(manifest.schema, 'h2o.savedChatPackage');
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(snapshot.schema, 'h2o.savedChatSnapshot');
  assert.equal(snapshot.schemaVersion, 1);
  assert.equal(manifest.chatId, snapshot.chatId);
  assert.equal(manifest.snapshotId, snapshot.snapshotId);
  assert.equal(manifest.provenance.projectionOnly, true);
  assert.deepEqual(manifest.assets, []);

  const canonicalSnapshot = canonicalJson(snapshot);
  assert.equal(pkg.files['snapshot.json'].text, canonicalSnapshot);
  const snapshotHash = sha256Prefixed(canonicalSnapshot);
  assert.equal(manifest.files.snapshot.sha256, snapshotHash);
  assert.equal(manifest.contentHash, snapshotHash);
  assert.equal(pkg.contentHash, snapshotHash);
  assert.equal(manifest.files.snapshot.byteLength, byteLength(canonicalSnapshot));

  assert.equal(manifest.files.markdown.sha256, sha256Prefixed(pkg.files['chat.md'].text));
  assert.equal(manifest.files.markdown.byteLength, byteLength(pkg.files['chat.md'].text));
  assert.equal(manifest.files.html.sha256, sha256Prefixed(pkg.files['chat.html'].text));
  assert.equal(manifest.files.html.byteLength, byteLength(pkg.files['chat.html'].text));

  assert.equal(snapshot.source.nativeConversationId, 'native-phase-b');
  assert.equal(snapshot.library.folderIdAtCapture, 'folder_a');
  assert.equal(snapshot.library.categoryIdAtCapture, 'cat_a');
  assert.equal(snapshot.library.projectIdAtCapture, 'proj_a');
  assert.deepEqual(snapshot.library.labelIdsAtCapture, ['label_a', 'label_b']);
  assert.deepEqual(snapshot.library.tagIdsAtCapture, ['tag_a']);

  const byId = Object.fromEntries(snapshot.messages.map((message) => [message.id, message]));
  assert.ok(byId.m_outerHtml.contentHtml.includes('<strong>HTML</strong>'));
  assert.ok(byId.m_outerHTML.contentHtml.includes('OuterHTML payload'));
  assert.ok(byId.m_outer_html.contentHtml.includes('outer_html payload'));
  assert.equal(byId.m_text.contentText, 'Plain text only fallback');
  assert.equal(Object.hasOwn(byId.m_text, 'contentHtml'), false);
  assert.match(byId.m_unsafe.contentText, /Safe text/);
  assert.doesNotMatch(byId.m_unsafe.contentHtml, /<script|<iframe|onclick|javascript:/i);
  assert.doesNotMatch(pkg.files['chat.html'].text, /<script|<iframe|onclick|javascript:/i);
  assert.match(pkg.files['chat.html'].text, /Safe text/);
}

async function main() {
  console.log('── Studio saved-chat package v1 validator ───────────────');

  check('module source exists', () => {
    assert.ok(fs.existsSync(MODULE_PATH));
  });

  check('module stays out of raw SQLite and sync lanes', () => {
    const src = readRepo(MODULE_REL);
    assert.doesNotMatch(src, /plugin:sql|sqlite:/i);
    assert.doesNotMatch(src, /H2O\.Studio\.sync|H2O\.Desktop\.Sync/);
    assert.match(src, /if \(!detectTauri\(\)\) return;/);
  });

  check('loader and pack list expose the Desktop-only module', () => {
    const html = readRepo(STUDIO_HTML_REL);
    const pack = readRepo(PACK_REL);
    assert.match(html, /ingestion\/saved-chat-package-v1\.tauri\.js/);
    assert.match(pack, /ingestion\/saved-chat-package-v1\.tauri\.js/);
    assert.ok(html.indexOf('ingestion/export-bundle.tauri.js') < html.indexOf('ingestion/saved-chat-package-v1.tauri.js'));
    assert.ok(html.indexOf('ingestion/saved-chat-package-v1.tauri.js') < html.indexOf('sync/kernel/privacy-scan.tauri.js'));
  });

  const { ingestion, mockFs } = loadModule();

  check('private Desktop API registers required functions', () => {
    assert.equal(typeof ingestion.buildSavedChatPackageV1, 'function');
    assert.equal(typeof ingestion.writeSavedChatPackageV1, 'function');
    assert.equal(typeof ingestion.diagnoseSavedChatPackageV1, 'function');
    assert.equal(typeof ingestion.__savedChatPackageV1.canonicalJson, 'function');
    assert.equal(typeof ingestion.__savedChatPackageV1.sha256Hex, 'function');
  });

  let built = null;
  await checkAsync('buildSavedChatPackageV1 builds package from explicit snapshotId', async () => {
    built = await ingestion.buildSavedChatPackageV1({ snapshotId: 'snap_phase_b' });
    validatePackageObject(built);
  });

  await checkAsync('buildSavedChatPackageV1 chooses latest snapshot via listByChat', async () => {
    const latest = await ingestion.buildSavedChatPackageV1({ chatId: 'chat_phase_b' });
    validatePackageObject(latest);
  });

  await checkAsync('writeSavedChatPackageV1 writes explicit target folder only', async () => {
    const written = await ingestion.writeSavedChatPackageV1({
      snapshotId: 'snap_phase_b',
      targetDir: '/tmp/h2o-saved-chat-test',
    });
    assert.equal(written.written, true);
    assert.equal(mockFs.dirs.has('/tmp/h2o-saved-chat-test/chat_phase_b.h2ochat'), true);
    assert.equal(mockFs.files.has('/tmp/h2o-saved-chat-test/chat_phase_b.h2ochat/manifest.json'), true);
    assert.equal(mockFs.files.has('/tmp/h2o-saved-chat-test/chat_phase_b.h2ochat/snapshot.json'), true);
    assert.equal(mockFs.files.has('/tmp/h2o-saved-chat-test/chat_phase_b.h2ochat/chat.md'), true);
    assert.equal(mockFs.files.has('/tmp/h2o-saved-chat-test/chat_phase_b.h2ochat/chat.html'), true);
    assert.equal(mockFs.dirs.has('/tmp/h2o-saved-chat-test/chat_phase_b.h2ochat/assets'), false);
  });

  await checkAsync('writer fails when package exists unless overwrite is explicit', async () => {
    await assert.rejects(
      () => ingestion.writeSavedChatPackageV1({ snapshotId: 'snap_phase_b', targetDir: '/tmp/h2o-saved-chat-test' }),
      /already exists/
    );
    const overwritten = await ingestion.writeSavedChatPackageV1({
      snapshotId: 'snap_phase_b',
      targetDir: '/tmp/h2o-saved-chat-test',
      overwrite: true,
    });
    assert.equal(overwritten.written, true);
  });

  check('diagnose reports Phase B boundaries', () => {
    const diag = ingestion.diagnoseSavedChatPackageV1();
    assert.equal(diag.desktopOnly, true);
    assert.equal(diag.projectionOnly, true);
    assert.equal(diag.uiWired, false);
    assert.equal(diag.syncIntegrated, false);
    assert.equal(diag.casImplemented, false);
  });

  console.log('');
  console.log(`PASS ${PASS.length}`);
  if (FAIL.length) {
    console.log(`FAIL ${FAIL.length}`);
    for (const failure of FAIL) console.log(`- ${failure.label}: ${failure.err}`);
    process.exitCode = 1;
  }
}

await main();
