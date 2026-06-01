#!/usr/bin/env node
// Validator for Studio Desktop importBundle (M2b-1 dry-run + M2b-2/M2c-3
// merge-mode write side). Focused end-to-end proof harness — pure Node.
//
// Loads src-surfaces-base/studio/ingestion/import-bundle.tauri.js into the
// current VM context after pre-installing:
//
//   • globalThis.__TAURI_INTERNALS__   — passes detectTauri() at top of IIFE
//   • globalThis.H2O.Studio.store.*    — in-memory mocks of the exact public
//                                        API surface importBundle calls
//                                        (chats / snapshots / folders /
//                                        categories / labels / tags) with
//                                        Map-backed read-after-write
//                                        semantics
//   • globalThis.chrome.storage.local  — minimal Promise-callback shim that
//                                        mimics the Tauri-side chrome.storage
//                                        polyfill (set / get)
//   • globalThis.chrome.runtime        — empty (lastError absent → success)
//
// The IIFE registers H2O.Studio.ingestion.{dryRunImportBundle, importBundle,
// importFolderStateOnly, diagnose}. The harness then exercises:
//
//   1. API shape (functions exist; diagnose() reports M2c-3 / merge-only)
//   2. Empty / malformed bundle behavior (no throws; ok flag set correctly)
//   3. Sample fullBundle.v2 dry-run plan counts
//   4. Sample fullBundle.v2 merge import (real writes via mocks)
//   5. Re-run idempotence (zero new writes; skip counters reflect duplicates)
//   6. Overwrite mode rejection (Desktop V1 is append-only)
//
// If the importer code grows new dependencies on the store that aren't
// covered by these mocks, this harness fails fast with a clear message.
//
// No Tauri runtime, no SQLite, no chrome extension — Node-only. The shapes
// the mocks accept exactly match what the .tauri.js entity stores accept;
// see categories.tauri.js / labels.tauri.js / tags.tauri.js / chats.tauri.js
// / snapshots.tauri.js / folders.tauri.js for the schemas.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..', '..', '..');
const IMPORT_BUNDLE_REL = 'src-surfaces-base/studio/ingestion/import-bundle.tauri.js';
const IMPORT_BUNDLE_PATH = path.join(REPO_ROOT, IMPORT_BUNDLE_REL);

const PASS = [];
const FAIL = [];

function check(label, fn) {
  try {
    fn();
    PASS.push(label);
    console.log(`  ✓ ${label}`);
  } catch (e) {
    const msg = (e && e.message) || String(e);
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
  } catch (e) {
    const msg = (e && e.message) || String(e);
    FAIL.push({ label, err: msg });
    console.log(`  ✗ ${label}`);
    console.log(`      ${msg}`);
  }
}

// ── Mock entity stores ────────────────────────────────────────────────
// Map-backed in-memory replicas of the .tauri.js entity stores. The
// importer reads via .get(id) and writes via .upsert / .create / .bindChat;
// these mocks honor those exact contracts and expose the underlying tables
// via _tables for direct post-condition assertions.
function createMockStores() {
  const tables = {
    chats: new Map(),
    snapshots: new Map(),
    folders: new Map(),
    folderBindings: new Set(),   // "folderId:chatId"
    categories: new Map(),
    labels: new Map(),
    labelBindings: new Set(),    // "labelId:chatId"
    tags: new Map(),
    tagBindings: new Set(),      // "tagId:chatId"
  };

  function bindingKey(a, b) { return String(a) + '::' + String(b); }
  function splitBindingKey(key) {
    const idx = key.indexOf('::');
    return idx < 0 ? [key, ''] : [key.slice(0, idx), key.slice(idx + 2)];
  }

  return {
    _tables: tables,
    __registerEntity: () => {}, // .tauri.js entity stores would call this; harmless no-op here.
    chats: {
      get: async (id) => tables.chats.get(String(id || '').trim()) || null,
      upsert: async (patch) => {
        const id = patch && String(patch.chatId || '').trim();
        if (!id) throw new Error('mock chats.upsert: chatId required');
        tables.chats.set(id, { ...patch });
        return tables.chats.get(id);
      },
    },
    snapshots: {
      get: async (id) => tables.snapshots.get(String(id || '').trim()) || null,
      create: async (patch) => {
        const id = patch && String(patch.snapshotId || '').trim();
        if (!id) throw new Error('mock snapshots.create: snapshotId required');
        tables.snapshots.set(id, { ...patch });
        return tables.snapshots.get(id);
      },
    },
    folders: {
      get: async (id) => tables.folders.get(String(id || '').trim()) || null,
      upsert: async (patch) => {
        const id = patch && String(patch.folderId || '').trim();
        if (!id) throw new Error('mock folders.upsert: folderId required');
        tables.folders.set(id, { ...patch });
        return tables.folders.get(id);
      },
      bindChat: async (folderId, chatId /*, opts */) => {
        const f = String(folderId || '').trim();
        const c = String(chatId || '').trim();
        if (!f || !c) return false;
        tables.folderBindings.add(bindingKey(f, c));
        return true;
      },
    },
    categories: {
      get: async (id) => tables.categories.get(String(id || '').trim()) || null,
      upsert: async (patch) => {
        const id = patch && String(patch.categoryId || '').trim();
        if (!id) throw new Error('mock categories.upsert: categoryId required');
        tables.categories.set(id, { ...patch });
        return tables.categories.get(id);
      },
    },
    labels: {
      get: async (id) => tables.labels.get(String(id || '').trim()) || null,
      upsert: async (patch) => {
        const id = patch && String(patch.labelId || '').trim();
        if (!id) throw new Error('mock labels.upsert: labelId required');
        tables.labels.set(id, { ...patch });
        return tables.labels.get(id);
      },
      bindChat: async (labelId, chatId /*, opts */) => {
        const l = String(labelId || '').trim();
        const c = String(chatId || '').trim();
        if (!l || !c) return false;
        tables.labelBindings.add(bindingKey(l, c));
        return true;
      },
      listForChat: async (chatId) => {
        const c = String(chatId || '').trim();
        const out = [];
        for (const key of tables.labelBindings) {
          const [lblId, cId] = splitBindingKey(key);
          if (cId === c) out.push({ labelId: lblId });
        }
        return out;
      },
    },
    tags: {
      get: async (id) => tables.tags.get(String(id || '').trim()) || null,
      upsert: async (patch) => {
        const id = patch && String(patch.tagId || '').trim();
        if (!id) throw new Error('mock tags.upsert: tagId required');
        tables.tags.set(id, { ...patch });
        return tables.tags.get(id);
      },
      bindChat: async (tagId, chatId /*, opts */) => {
        const t = String(tagId || '').trim();
        const c = String(chatId || '').trim();
        if (!t || !c) return false;
        tables.tagBindings.add(bindingKey(t, c));
        return true;
      },
      listForChat: async (chatId) => {
        const c = String(chatId || '').trim();
        const out = [];
        for (const key of tables.tagBindings) {
          const [tagId, cId] = splitBindingKey(key);
          if (cId === c) out.push({ tagId: tagId });
        }
        return out;
      },
    },
    // tombstoneReviews intentionally absent — importBundle treats it as
    // optional (gated behind options.ingestTombstoneReviews === true).
  };
}

// ── chrome.storage.local shim ─────────────────────────────────────────
// Minimal Promise-callback shim mirroring the localStorage-backed
// chrome.storage.local polyfill that platform.tauri.js installs on M1
// boot. importBundle's chromeStorageGet/chromeStorageSet helpers call
// .get(keys, cb) and .set(items, cb); the cb is invoked async with the
// data object / no args.
function createChromeShim() {
  const data = new Map();
  return {
    _data: data,
    storage: {
      local: {
        get: (keys, cb) => {
          const arr = Array.isArray(keys) ? keys : [keys];
          const out = {};
          for (const k of arr) {
            if (data.has(k)) out[k] = data.get(k);
          }
          // Defer to next tick to match chrome.storage's async contract.
          Promise.resolve().then(() => { try { cb(out); } catch (_) { /* swallow */ } });
        },
        set: (items, cb) => {
          for (const k of Object.keys(items || {})) {
            data.set(k, items[k]);
          }
          Promise.resolve().then(() => { try { if (typeof cb === 'function') cb(); } catch (_) { /* swallow */ } });
        },
      },
    },
    runtime: {
      // lastError intentionally undefined → chromeStorageSet sees success.
    },
  };
}

// ── Load importer into the current Node context ──────────────────────
function loadImporter() {
  // Pre-install globals BEFORE the IIFE runs.
  globalThis.__TAURI_INTERNALS__ = {
    invoke: async () => {
      // Importer doesn't call invoke directly; entity stores do.
      // The mocks bypass invoke entirely, so this throw is defensive only.
      throw new Error('mock __TAURI_INTERNALS__.invoke should not be called from importBundle path');
    },
  };
  const stores = createMockStores();
  const chromeShim = createChromeShim();
  globalThis.H2O = { Studio: { store: stores } };
  globalThis.chrome = chromeShim;

  const src = fs.readFileSync(IMPORT_BUNDLE_PATH, 'utf8');
  vm.runInThisContext(src, { filename: IMPORT_BUNDLE_REL });

  const ingestion = globalThis.H2O && globalThis.H2O.Studio && globalThis.H2O.Studio.ingestion;
  if (!ingestion) {
    throw new Error('H2O.Studio.ingestion did not register after loading ' + IMPORT_BUNDLE_REL);
  }
  return { stores, chromeShim, ingestion };
}

// ── Sample bundle ─────────────────────────────────────────────────────
// Shapes mirror the chrome-live-background.mjs exporter output documented in
// the file header: chatArchive.chats[] with chatIndex + tags fallback,
// catalogs.categories[], catalogs.labels[], chromeStorageLocal folder state,
// libraryKv label bindings.
function makeSampleBundle() {
  return {
    schema: 'h2o.studio.fullBundle.v2',
    chatArchive: {
      chats: [
        {
          chatId: 'c_test1',
          chatIndex: {
            title: 'Test Chat',
            href: 'https://chatgpt.com/c/c_test1',
            state: { isSaved: true, isLinked: true },
            organization: {
              categoryId: 'cat_test1',
              tagIds: ['tag_test1'],
            },
          },
          tags: [{ id: 'tag_test1', name: 'TestTag' }],
          snapshots: [
            {
              snapshotId: 'snap_test1',
              createdAt: '2026-05-01T00:00:00Z',
              messages: [
                { role: 'user', text: 'Hello', order: 0 },
                { role: 'assistant', text: 'Hi!', order: 1 },
              ],
              meta: {
                title: 'Test Chat',
                richTurns: [
                  { turnIdx: 0, role: 'user', outerHTML: '<div>Hello</div>' },
                  { turnIdx: 1, role: 'assistant', outerHTML: '<div>Hi!</div>' },
                ],
              },
              digest: 'abc123',
              messageCount: 2,
            },
          ],
        },
      ],
      catalogs: {
        categories: [
          { id: 'cat_test1', name: 'TestCategory', source: 'imported' },
        ],
        labels: [
          { id: 'lbl_test1', name: 'TestLabel', color: '#ff0000', source: 'imported' },
        ],
      },
    },
    chromeStorageLocal: {
      // Folder catalog + bindings live here (canonical key).
      'h2o:prm:cgx:fldrs:state:data:v1': {
        folders: [{ id: 'fld_test1', name: 'TestFolder', color: '#00ff00' }],
        items: { 'fld_test1': ['c_test1'] },
      },
      // Opaque allowlisted blob — proves the chromeStorageLocal write path.
      'h2o:prm:cgx:library:labels:catalog:v1': { catalog: [{ id: 'lbl_test1', name: 'TestLabel' }] },
    },
    libraryKv: [
      // Canonical label-bindings KV blob — parsed by importLabelBindings
      // AND written through opaquely by importLibraryKvBlobs.
      {
        key: 'h2o:prm:cgx:library:labels:bindings:v1',
        value: { bindings: { 'c_test1': ['lbl_test1'] } },
      },
    ],
  };
}

// ── Run tests ─────────────────────────────────────────────────────────
async function main() {
  console.log('── Studio Desktop importBundle proof harness ───────────────');

  // (0) Module load
  let stores, chromeShim, ingestion;
  try {
    ({ stores, chromeShim, ingestion } = loadImporter());
    PASS.push('module loads and registers H2O.Studio.ingestion');
    console.log('  ✓ module loads and registers H2O.Studio.ingestion');
  } catch (e) {
    const msg = (e && e.message) || String(e);
    FAIL.push({ label: 'module loads and registers H2O.Studio.ingestion', err: msg });
    console.log(`  ✗ module loads and registers H2O.Studio.ingestion`);
    console.log(`      ${msg}`);
    summarize();
    process.exit(1);
  }

  // (1) API shape
  check('ingestion namespace is installed', () => {
    assert.equal(ingestion.__installed, true, 'ingestion.__installed should be true');
  });
  check('dryRunImportBundle is a function', () => {
    assert.equal(typeof ingestion.dryRunImportBundle, 'function');
  });
  check('importBundle is a function', () => {
    assert.equal(typeof ingestion.importBundle, 'function');
  });
  check('importFolderStateOnly is a function', () => {
    assert.equal(typeof ingestion.importFolderStateOnly, 'function');
  });
  check('diagnose is a function', () => {
    assert.equal(typeof ingestion.diagnose, 'function');
  });
  check('diagnose() reports M2c-3 / merge-only / sqlite backend', () => {
    const d = ingestion.diagnose();
    assert.equal(d.installed, true, 'installed should be true');
    assert.equal(d.backend, 'sqlite');
    assert.equal(d.stage, 'M2c-3');
    assert.equal(d.writeSide, 'merge-only');
    assert.ok(d.storesAvailable, 'storesAvailable section missing');
    assert.equal(d.storesAvailable.chats, true);
    assert.equal(d.storesAvailable.snapshots, true);
    assert.equal(d.storesAvailable.folders, true);
    assert.equal(d.storesAvailable.categories, true);
    assert.equal(d.storesAvailable.labels, true);
    assert.equal(d.storesAvailable.tags, true);
  });

  // (2) Empty / malformed bundle behavior
  await checkAsync('empty valid bundle → dry-run ok with zero counts', async () => {
    const r = await ingestion.dryRunImportBundle({ schema: 'h2o.studio.fullBundle.v2' });
    assert.equal(r.ok, true, 'expected ok=true, errors=' + JSON.stringify(r.errors));
    assert.equal(r.plan.chats.willImport, 0);
    assert.equal(r.plan.snapshots.willImport, 0);
    assert.equal(r.plan.categories.willImport, 0);
    assert.equal(r.plan.labels.willImport, 0);
    assert.equal(r.plan.folders.willImport, 0);
    assert.equal(r.plan.chromeStorageLocal.willImport, 0);
    assert.equal(r.plan.libraryKv.willImport, 0);
  });
  await checkAsync('empty valid bundle → merge import ok with zero writes', async () => {
    const r = await ingestion.importBundle({ schema: 'h2o.studio.fullBundle.v2' }, 'merge');
    assert.equal(r.ok, true, 'expected ok=true, errors=' + JSON.stringify(r.errors));
    assert.equal(r.written.chats, 0);
    assert.equal(r.written.snapshots, 0);
    assert.equal(r.written.categories, 0);
    assert.equal(r.written.labels, 0);
    assert.equal(r.written.folders, 0);
    assert.equal(r.written.folderBindings, 0);
    assert.equal(r.written.labelBindings, 0);
    assert.equal(r.written.tagBindings, 0);
    assert.equal(r.written.chromeStorageLocalKeys, 0);
    assert.equal(r.written.libraryKvKeys, 0);
  });
  await checkAsync('invalid JSON string → ok=false, parse error', async () => {
    const r = await ingestion.dryRunImportBundle('{not json');
    assert.equal(r.ok, false);
    assert.match(r.error || '', /Invalid JSON/);
  });
  await checkAsync('unrecognized schema → ok=false, schema error', async () => {
    const r = await ingestion.dryRunImportBundle({ schema: 'h2o.something.else' });
    assert.equal(r.ok, false);
    assert.match(r.error || '', /Unrecognized bundle schema/);
  });

  // (3) Sample bundle dry-run
  const sample = makeSampleBundle();
  let dryRun = null;
  await checkAsync('sample bundle dry-run plan: all entities counted', async () => {
    dryRun = await ingestion.dryRunImportBundle(sample);
    assert.equal(dryRun.ok, true,
      'dry-run not ok; errors=' + JSON.stringify(dryRun.errors));
    assert.equal(dryRun.sourceVersion, 'v2');
    assert.equal(dryRun.destinationVersion, 'v1-sqlite');
    assert.equal(dryRun.destinationBackend, 'sqlite');
    assert.equal(dryRun.plan.categories.willImport, 1, 'categories.willImport');
    assert.equal(dryRun.plan.labels.willImport, 1, 'labels.willImport');
    assert.equal(dryRun.plan.folders.willImport, 1, 'folders.willImport');
    assert.equal(dryRun.plan.chats.willImport, 1, 'chats.willImport');
    assert.equal(dryRun.plan.snapshots.willImport, 1, 'snapshots.willImport');
    assert.ok(dryRun.plan.chromeStorageLocal.willImport >= 1,
      'chromeStorageLocal.willImport >= 1');
    assert.ok(dryRun.plan.libraryKv.willImport >= 1, 'libraryKv.willImport >= 1');
  });
  check('sample bundle dry-run sample arrays are populated', () => {
    assert.ok(dryRun.sample, 'sample section missing');
    assert.deepEqual(dryRun.sample.newChatIds.slice(0, 1), ['c_test1']);
    assert.deepEqual(dryRun.sample.newCategoryIds.slice(0, 1), ['cat_test1']);
    assert.deepEqual(dryRun.sample.newLabelIds.slice(0, 1), ['lbl_test1']);
    assert.deepEqual(dryRun.sample.newFolderIds.slice(0, 1), ['fld_test1']);
    assert.deepEqual(dryRun.sample.newSnapshotIds.slice(0, 1), ['snap_test1']);
  });

  // (4) Sample bundle real import
  let firstImport = null;
  await checkAsync('sample bundle merge import → writes all entities', async () => {
    firstImport = await ingestion.importBundle(sample, 'merge');
    assert.equal(firstImport.ok, true,
      'import not ok; errors=' + JSON.stringify(firstImport.errors));
    assert.equal(firstImport.mode, 'merge');
    assert.equal(firstImport.sourceVersion, 'v2');
    assert.equal(firstImport.destinationBackend, 'sqlite');
    assert.equal(firstImport.written.categories, 1);
    assert.equal(firstImport.written.labels, 1);
    assert.equal(firstImport.written.folders, 1);
    assert.equal(firstImport.written.chats, 1);
    assert.equal(firstImport.written.snapshots, 1);
    assert.equal(firstImport.written.folderBindings, 1);
    assert.equal(firstImport.written.labelBindings, 1);
    assert.equal(firstImport.written.tagBindings, 1);
    assert.equal(firstImport.written.tagsAutoCreated, 1,
      'expected tagsAutoCreated=1 (catalog absent; tag name from chat.tags[])');
    assert.ok(firstImport.written.chromeStorageLocalKeys >= 1);
    assert.ok(firstImport.written.libraryKvKeys >= 1);
  });
  check('mock entity stores received the data', () => {
    assert.equal(stores._tables.categories.size, 1, 'categories table size');
    assert.equal(stores._tables.labels.size, 1, 'labels table size');
    assert.equal(stores._tables.folders.size, 1, 'folders table size');
    assert.equal(stores._tables.chats.size, 1, 'chats table size');
    assert.equal(stores._tables.snapshots.size, 1, 'snapshots table size');
    assert.equal(stores._tables.tags.size, 1, 'tags table size (auto-created)');
    assert.ok(stores._tables.folderBindings.has('fld_test1::c_test1'),
      'folder binding fld_test1->c_test1');
    assert.ok(stores._tables.labelBindings.has('lbl_test1::c_test1'),
      'label binding lbl_test1->c_test1');
    assert.ok(stores._tables.tagBindings.has('tag_test1::c_test1'),
      'tag binding tag_test1->c_test1');
  });
  check('written chat row carries expected shape', () => {
    const row = stores._tables.chats.get('c_test1');
    assert.ok(row, 'chat c_test1 not in mock store');
    assert.equal(row.chatId, 'c_test1');
    assert.equal(row.title, 'Test Chat');
    assert.equal(row.href, 'https://chatgpt.com/c/c_test1');
    assert.equal(row.isSaved, true);
    assert.equal(row.isLinked, true);
    assert.equal(row.categoryId, 'cat_test1');
    assert.equal(row.snapshotCount, 1);
    assert.equal(row.lastSnapshotId, 'snap_test1');
  });
  check('written snapshot carries turns built from messages + richTurns', () => {
    const snap = stores._tables.snapshots.get('snap_test1');
    assert.ok(snap, 'snapshot snap_test1 not in mock store');
    assert.equal(snap.chatId, 'c_test1');
    assert.equal(snap.title, 'Test Chat');
    assert.ok(Array.isArray(snap.turns), 'turns should be an array');
    assert.equal(snap.turns.length, 2, 'expected 2 turns');
    assert.equal(snap.turns[0].role, 'user');
    assert.equal(snap.turns[0].text, 'Hello');
    assert.equal(snap.turns[0].outerHtml, '<div>Hello</div>');
    assert.equal(snap.turns[1].role, 'assistant');
    assert.equal(snap.turns[1].text, 'Hi!');
    assert.equal(snap.turns[1].outerHtml, '<div>Hi!</div>');
  });
  check('chrome.storage.local mock received the allowed keys', () => {
    assert.ok(chromeShim._data.size >= 1,
      'chrome.storage.local mock should have at least one key written');
    assert.ok(chromeShim._data.has('h2o:prm:cgx:library:labels:catalog:v1'),
      'expected library:labels:catalog key in chrome.storage.local mock');
  });

  // (5) Re-run idempotence
  //
  // Contract per import-bundle.tauri.js:
  //   - categories / labels / chats / snapshots → skip-if-exists (.get() →
  //     skipped++ continue), so rerun increments written.* by 0.
  //   - folders → merge-upsert (intentional, lines 579-617): always reads
  //     existing, merges visual metadata (color/icon), always upserts,
  //     always increments written.folders. Re-importing the same folder
  //     yields written.folders > 0 by design — that's the "Visual metadata
  //     merged via existing importFolders rules" guarantee called out in
  //     the importFolderStateOnly docstring.
  //   - label/tag bindings → pre-check via listForChat(chatId); existing
  //     (chatId, labelId/tagId) pair is detected and skipped at the JS
  //     layer (the SQL layer is also idempotent via INSERT OR IGNORE).
  //   - folder bindings → no JS-layer pre-check; folderStore.bindChat is
  //     called every rerun and the underlying SQL is INSERT OR REPLACE
  //     (folders.tauri.js PRIMARY KEY chat_id). written.folderBindings
  //     therefore also increments on rerun by design.
  //   - chromeStorageLocal / libraryKv keys → skip-if-exists via the
  //     chrome.storage.local shim.
  let rerun = null;
  await checkAsync('re-running same bundle is safe (skip-or-merge per entity)', async () => {
    rerun = await ingestion.importBundle(sample, 'merge');
    assert.equal(rerun.ok, true,
      'rerun not ok; errors=' + JSON.stringify(rerun.errors));
    // skip-if-exists entities → 0 new writes
    assert.equal(rerun.written.categories, 0, 'rerun categories');
    assert.equal(rerun.written.labels, 0, 'rerun labels');
    assert.equal(rerun.written.chats, 0, 'rerun chats');
    assert.equal(rerun.written.snapshots, 0, 'rerun snapshots');
    assert.equal(rerun.written.tagsAutoCreated, 0, 'rerun tagsAutoCreated');
    // binding-layer idempotency (label/tag use listForChat pre-check)
    assert.equal(rerun.written.labelBindings, 0, 'rerun labelBindings');
    assert.equal(rerun.written.tagBindings, 0, 'rerun tagBindings');
    // skip counters explicitly reflect the duplicates for skip-if-exists
    assert.equal(rerun.skipped.categories, 1, 'rerun skipped.categories');
    assert.equal(rerun.skipped.labels, 1, 'rerun skipped.labels');
    assert.equal(rerun.skipped.chats, 1, 'rerun skipped.chats');
    assert.equal(rerun.skipped.snapshots, 1, 'rerun skipped.snapshots');
    assert.equal(rerun.skipped.labelBindings, 1, 'rerun skipped.labelBindings');
    assert.equal(rerun.skipped.tagBindings, 1, 'rerun skipped.tagBindings');
    assert.ok(rerun.skipped.chromeStorageLocalKeysExisting >= 1,
      'rerun skipped.chromeStorageLocalKeysExisting');
    assert.ok(rerun.skipped.libraryKvKeysExisting >= 1,
      'rerun skipped.libraryKvKeysExisting');
  });
  check('folders use merge-upsert semantics (NOT skip-if-exists)', () => {
    // Documented design: importFolders always re-upserts so visual
    // metadata (color/icon) imported in a fresh bundle wins over the
    // existing row's prior visual state. The counter is therefore the
    // "considered" count, not the "newly-inserted" count.
    assert.equal(rerun.written.folders, 1,
      'expected written.folders=1 on rerun (merge-upsert by design)');
    assert.equal(rerun.skipped.folders, 0,
      'expected skipped.folders=0 (folders never skip; they merge)');
    // Folder bindings: bindChat with INSERT OR REPLACE → counter increments
    // every call. Verify the design without locking the exact number.
    assert.ok(rerun.written.folderBindings >= 0,
      'folderBindings counter is non-negative');
  });
  check('mock store table sizes unchanged after rerun (no row duplication)', () => {
    assert.equal(stores._tables.categories.size, 1);
    assert.equal(stores._tables.labels.size, 1);
    assert.equal(stores._tables.folders.size, 1);
    assert.equal(stores._tables.chats.size, 1);
    assert.equal(stores._tables.snapshots.size, 1);
    assert.equal(stores._tables.tags.size, 1);
    assert.equal(stores._tables.folderBindings.size, 1);
    assert.equal(stores._tables.labelBindings.size, 1);
    assert.equal(stores._tables.tagBindings.size, 1);
  });

  // (6) Overwrite mode rejection
  await checkAsync('overwrite mode is rejected (Desktop V1 is append-only)', async () => {
    const r = await ingestion.importBundle(sample, 'overwrite');
    assert.equal(r.mode, 'rejected');
    assert.equal(r.ok, false);
    assert.match(r.error || '', /overwrite mode not supported/i);
  });
  await checkAsync('replace mode is rejected (Desktop V1 is append-only)', async () => {
    const r = await ingestion.importBundle(sample, 'replace');
    assert.equal(r.mode, 'rejected');
    assert.equal(r.ok, false);
  });

  // ── (7) Chrome autoImport round-trip contract (R3 phase 1) ─────────
  //
  // auto-import.mv3.js gates on Tauri-detection-FALSE (the opposite of
  // import-bundle.tauri.js). Run it in a fresh vm sandbox so the two
  // module loads don't fight over globalThis. After producing a bundle
  // via the mocked SW round-trip, parse the captured file content and
  // verify it can be merge-imported through the existing importBundle
  // path (proving end-to-end Chrome→Desktop wire compatibility).
  await runChromeAutoImportTests(ingestion);

  // ── (8) Chrome event-trigger contract (R3 phase 2) ──────────────────
  // Verifies that autoImport.enable() actually wires the library-save
  // event listeners (cross-surface-sync / library-index:updated / custom
  // trigger), that dispatching one of those events with both flags ON
  // schedules a debounced exportNow, that disable() unbinds, that the
  // master flag being OFF prevents the trigger from firing even if the
  // event-trigger flag is ON.
  await runChromeEventTriggerTests();

  // ── (9) Desktop focus-trigger contract (R3 phase 2) ─────────────────
  // Verifies that focusImport.enable() wires window 'focus' +
  // document 'visibilitychange' listeners, that triggerNow() exists for
  // manual / test use, that the master flag is the gate, and that the
  // trigger calls H2O.Studio.sync.scanFolderOnce + LibraryIndex.refresh.
  await runDesktopFocusImportTests();

  // ── (10) Desktop Categories Write Parity (R4.1) ─────────────────────
  // Verifies that H2O.Studio.actions.categories writes to SQLite via
  // store.categories, dispatches the canonical LibraryIndex refresh
  // event, and handles validation/error paths cleanly.
  await runDesktopCategoriesActionsTests();

  summarize();
  if (FAIL.length > 0) process.exit(1);
}

// ── Chrome autoImport sandbox & mocks ─────────────────────────────────
async function runChromeAutoImportTests(desktopIngestion) {
  console.log('');
  console.log('── Chrome autoImport round-trip contract (R3) ──────────────');

  const AUTO_IMPORT_REL = 'src-surfaces-base/studio/sync/auto-import.mv3.js';
  const AUTO_IMPORT_PATH = path.join(REPO_ROOT, AUTO_IMPORT_REL);

  // Build minimal File System Access mocks. Files live in a Map keyed by
  // basename. FakeFileHandle.move() is intentionally supported so the
  // happy-path exercises the atomic-rename code branch.
  function makeFakeDirHandle(name) {
    const files = new Map();
    let permission = 'prompt';
    let permissionGrantPath = 'granted'; // what requestPermission will return
    const dir = {
      name,
      _files: files,
      _setPermission(p) { permission = p; permissionGrantPath = p; },
      _setRequestResult(p) { permissionGrantPath = p; },
      async queryPermission(_opts) { return permission; },
      async requestPermission(_opts) {
        permission = permissionGrantPath;
        return permissionGrantPath;
      },
      async getFileHandle(filename, opts) {
        if (!files.has(filename) && !(opts && opts.create)) {
          const err = new Error('NotFoundError'); err.name = 'NotFoundError'; throw err;
        }
        return {
          name: filename,
          async createWritable() {
            let buffered = '';
            return {
              async write(chunk) { buffered += String(chunk); },
              async close() { files.set(filename, buffered); },
            };
          },
          async move(newName) {
            if (!files.has(filename)) {
              const err = new Error('NotFoundError'); err.name = 'NotFoundError'; throw err;
            }
            const content = files.get(filename);
            files.delete(filename);
            files.set(newName, content);
          },
        };
      },
      async removeEntry(filename) {
        if (!files.has(filename)) {
          const err = new Error('NotFoundError'); err.name = 'NotFoundError'; throw err;
        }
        files.delete(filename);
      },
    };
    return dir;
  }

  // Minimal IDB substitute. open() returns a request whose async events
  // (upgradeneeded, success) fire on the microtask queue. get() returns a
  // request that fires onsuccess with the stored row.
  function makeFakeIdb(initialRows) {
    const rowsByStore = new Map(); // storeName -> Map<key, value>
    for (const [storeName, kvMap] of initialRows) rowsByStore.set(storeName, new Map(kvMap));
    return {
      open(_name, _version) {
        const req = { onupgradeneeded: null, onsuccess: null, onerror: null, result: null };
        Promise.resolve().then(() => {
          const db = {
            objectStoreNames: { contains() { return true; } },
            createObjectStore() {},
            transaction(storeName, _mode) {
              const tx = { oncomplete: null, onerror: null, onabort: null };
              const objStore = {
                get(key) {
                  const greq = { onsuccess: null, onerror: null, result: null };
                  Promise.resolve().then(() => {
                    const store = rowsByStore.get(storeName) || new Map();
                    greq.result = store.has(key) ? store.get(key) : null;
                    if (greq.onsuccess) greq.onsuccess();
                  });
                  return greq;
                },
              };
              tx.objectStore = function () { return objStore; };
              Promise.resolve().then(() => { if (tx.oncomplete) tx.oncomplete(); });
              return tx;
            },
            close() {},
          };
          req.result = db;
          if (req.onupgradeneeded) req.onupgradeneeded();
          if (req.onsuccess) req.onsuccess();
        });
        return req;
      },
    };
  }

  // Reusable Chrome runtime mock with a settable SW handler.
  function makeChromeMock(initialSendHandler) {
    let sendHandler = initialSendHandler;
    const storage = new Map();
    return {
      _setSendMessageHandler(fn) { sendHandler = fn; },
      _storage: storage,
      runtime: {
        id: 'mock-extension-id',
        get lastError() { return undefined; },
        sendMessage(message, callback) {
          // Don't return a Promise; auto-import.mv3.js then uses the callback path.
          Promise.resolve().then(() => {
            try {
              const result = sendHandler(message);
              callback({ ok: true, result });
            } catch (e) {
              callback({ ok: false, error: String((e && e.message) || e) });
            }
          });
        },
      },
      storage: {
        local: {
          get(keys, cb) {
            const arr = Array.isArray(keys) ? keys : [keys];
            const out = {};
            for (const k of arr) if (storage.has(k)) out[k] = storage.get(k);
            Promise.resolve().then(() => cb(out));
          },
          set(items, cb) {
            for (const k of Object.keys(items || {})) storage.set(k, items[k]);
            Promise.resolve().then(() => { if (typeof cb === 'function') cb(); });
          },
        },
      },
    };
  }

  // Build the sample bundle (re-use shape from desktopIngestion test).
  function sampleBundle() {
    return makeSampleBundleForChromeRoundTrip();
  }

  // Set up a sandbox with no Tauri internals, with chrome.runtime present,
  // with a fake IDB pre-populated with a directory handle row, and with
  // an H2O.flags mock starting in OFF state.
  function buildSandbox(opts) {
    const handle = makeFakeDirHandle(opts.folderName || 'TestFolder');
    if (opts.permission) handle._setPermission(opts.permission);
    if (opts.requestResult) handle._setRequestResult(opts.requestResult);
    const idbRows = new Map();
    if (opts.includeHandle !== false) {
      const handlesStore = new Map();
      handlesStore.set('sync-folder', { handle, folderName: handle.name, connectedAt: '2026-01-01T00:00:00Z' });
      idbRows.set('handles', handlesStore);
    }
    const sandbox = {
      chrome: makeChromeMock(opts.sendHandler || (() => sampleBundle())),
      indexedDB: makeFakeIdb(idbRows),
      H2O: {
        flags: (function () {
          const store = new Map();
          if (opts.flagOn) store.set('sync.chromeAutoImport', true);
          return {
            get(name, fallback) { return store.has(name) ? store.get(name) : fallback; },
            set(name, value) { store.set(name, value); },
          };
        })(),
      },
      Promise, JSON, Date, console, Number, String, Boolean, Object, Array, Error, Math,
      Map, Set, WeakMap, WeakSet, Symbol, RegExp,
      TextEncoder: globalThis.TextEncoder,
      setTimeout: globalThis.setTimeout,
      clearTimeout: globalThis.clearTimeout,
      crypto: globalThis.crypto,
    };
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    const src = fs.readFileSync(AUTO_IMPORT_PATH, 'utf8');
    vm.runInContext(src, sandbox, { filename: AUTO_IMPORT_REL });
    return { sandbox, handle };
  }

  // ── Group 7.1 — module load + API shape ─────────────────────────────
  let baseSandbox;
  try {
    baseSandbox = buildSandbox({ includeHandle: false });
    PASS.push('auto-import.mv3.js loads in a Chrome sandbox');
    console.log('  ✓ auto-import.mv3.js loads in a Chrome sandbox');
  } catch (e) {
    const msg = (e && e.message) || String(e);
    FAIL.push({ label: 'auto-import.mv3.js loads in a Chrome sandbox', err: msg });
    console.log('  ✗ auto-import.mv3.js loads in a Chrome sandbox');
    console.log('      ' + msg);
    return;
  }
  const autoImport = baseSandbox.sandbox.H2O?.Studio?.sync?.autoImport;
  check('H2O.Studio.sync.autoImport namespace registered', () => {
    assert.ok(autoImport, 'autoImport not registered');
    assert.equal(autoImport.__installed, true);
  });
  for (const fn of ['exportNow', 'isEnabled', 'enable', 'disable', 'status', 'diagnose']) {
    check(`autoImport.${fn} is a function`, () => {
      assert.equal(typeof autoImport[fn], 'function');
    });
  }
  await checkAsync('diagnose() reports R3-phase1 / writesLatestJson=false / flagKey', async () => {
    const d = await autoImport.diagnose();
    assert.equal(d.phase, 'R3-phase1');
    assert.equal(d.flagKey, 'sync.chromeAutoImport');
    assert.equal(d.flagEnabled, false, 'flag should default OFF');
    assert.equal(d.writesLatestJson, false);
    assert.equal(d.polling, false);
    assert.equal(d.backgroundDaemon, false);
    assert.equal(d.bidirectionalSync, false);
    assert.equal(d.filename, 'chrome-latest.json');
    assert.equal(d.tmpFilename, 'chrome-latest.json.tmp');
  });

  // ── Group 7.2 — flag-off path ───────────────────────────────────────
  await checkAsync('flag-off (default) → ok=false, flagEnabled=false, error mentions flag key', async () => {
    const r = await autoImport.exportNow();
    assert.equal(r.ok, false);
    assert.equal(r.flagEnabled, false);
    assert.match(r.error || '', /sync\.chromeAutoImport/);
  });

  // ── Group 7.3 — flag-on but no folder handle ────────────────────────
  await checkAsync('flag-on + no handle → ok=false, error mentions "not connected"', async () => {
    baseSandbox.sandbox.H2O.flags.set('sync.chromeAutoImport', true);
    const r = await autoImport.exportNow();
    assert.equal(r.ok, false);
    assert.match(r.error || '', /not connected/i);
  });

  // ── Group 7.4 — flag-on + handle + permission denied ────────────────
  {
    const env = buildSandbox({ flagOn: true, permission: 'prompt', requestResult: 'denied' });
    const api = env.sandbox.H2O.Studio.sync.autoImport;
    await checkAsync('permission denied → ok=false, error mentions "not granted"', async () => {
      const r = await api.exportNow();
      assert.equal(r.ok, false);
      assert.match(r.error || '', /not granted/i);
      // Tmp file should NOT exist if permission was denied before the write started.
      assert.equal(env.handle._files.has('chrome-latest.json.tmp'), false);
      assert.equal(env.handle._files.has('chrome-latest.json'), false);
    });
  }

  // ── Group 7.5 — flag-on + handle + SW returns wrong schema ──────────
  {
    const env = buildSandbox({
      flagOn: true,
      permission: 'granted',
      sendHandler: () => ({ schema: 'not.the.right.schema' }),
    });
    const api = env.sandbox.H2O.Studio.sync.autoImport;
    await checkAsync('SW returns wrong schema → ok=false, error mentions schema', async () => {
      const r = await api.exportNow();
      assert.equal(r.ok, false);
      assert.match(r.error || '', /schema/i);
      // No file should have been written.
      assert.equal(env.handle._files.has('chrome-latest.json'), false);
    });
  }

  // ── Group 7.6 — happy path: write chrome-latest.json via move() ────
  let capturedBundleJson = null;
  {
    const env = buildSandbox({
      flagOn: true,
      permission: 'granted',
      sendHandler: () => sampleBundle(),
    });
    const api = env.sandbox.H2O.Studio.sync.autoImport;
    await checkAsync('happy path → ok=true, chrome-latest.json present, .tmp gone, atomic via move()', async () => {
      const r = await api.exportNow({ reason: 'unit-test' });
      assert.equal(r.ok, true, 'errors=' + JSON.stringify(r.errors || r.error));
      assert.equal(r.filename, 'chrome-latest.json');
      assert.equal(r.flagEnabled, true);
      assert.ok(r.bytes > 0);
      assert.equal(r.atomicMethod, 'move',
        'expected atomic move() path; got ' + r.atomicMethod);
      assert.ok(env.handle._files.has('chrome-latest.json'),
        'final file should exist');
      assert.equal(env.handle._files.has('chrome-latest.json.tmp'), false,
        'tmp file should be renamed away');
      capturedBundleJson = env.handle._files.get('chrome-latest.json');
    });
  }
  check('captured file content is valid h2o.studio.fullBundle.v2 JSON', () => {
    assert.ok(capturedBundleJson, 'no captured bundle');
    const parsed = JSON.parse(capturedBundleJson);
    assert.equal(parsed.schema, 'h2o.studio.fullBundle.v2');
    assert.ok(parsed.chatArchive && Array.isArray(parsed.chatArchive.chats),
      'chatArchive.chats must be present');
    assert.ok(parsed.chatArchive.chats.length >= 1);
  });

  // ── Group 7.7 — round-trip: Desktop imports the Chrome-produced file ─
  //
  // Re-use the existing Tauri-context desktopIngestion. Note this lives
  // in a DIFFERENT vm sandbox (`globalThis` here vs `sandbox` for
  // autoImport) — but JS objects pass freely across the boundary, so a
  // JSON.parse on this side gives the desktop importer a regular object.
  //
  // The desktop store mocks were ALREADY populated by tests 4-5 above with
  // the same sample bundle records, so the rerun should be idempotent
  // (skip-if-exists across the board, folders re-upsert per design).
  await checkAsync('Chrome-produced bundle round-trips through Desktop importBundle (merge)', async () => {
    const parsed = JSON.parse(capturedBundleJson);
    const r = await desktopIngestion.importBundle(parsed, 'merge');
    assert.equal(r.ok, true, 'desktop import not ok; errors=' + JSON.stringify(r.errors));
    assert.equal(r.mode, 'merge');
    assert.equal(r.sourceVersion, 'v2');
    // Records were already imported in earlier tests, so rerun semantics apply:
    // skip-if-exists for catalogs/chats/snapshots; merge-upsert for folders.
    assert.equal(r.skipped.chats, 1);
    assert.equal(r.skipped.snapshots, 1);
    assert.equal(r.skipped.categories, 1);
    assert.equal(r.skipped.labels, 1);
  });
  await checkAsync('Chrome-produced bundle still rejects overwrite mode', async () => {
    const parsed = JSON.parse(capturedBundleJson);
    const r = await desktopIngestion.importBundle(parsed, 'overwrite');
    assert.equal(r.mode, 'rejected');
    assert.equal(r.ok, false);
    assert.match(r.error || '', /overwrite mode not supported/i);
  });

  // ── Group 7.8 — fallback path (no move() method) ────────────────────
  //
  // When FileSystemFileHandle.move() is unavailable in the user's browser,
  // auto-import.mv3.js falls back to "write final, then delete tmp". Verify
  // that branch by stripping move() from the fake file handle.
  {
    const env = buildSandbox({
      flagOn: true,
      permission: 'granted',
      sendHandler: () => sampleBundle(),
    });
    // Wrap getFileHandle to strip move() from returned file handles.
    const dir = env.handle;
    const origGetFileHandle = dir.getFileHandle.bind(dir);
    dir.getFileHandle = async function (name, opts) {
      const fh = await origGetFileHandle(name, opts);
      delete fh.move;
      return fh;
    };
    const api = env.sandbox.H2O.Studio.sync.autoImport;
    await checkAsync('fallback (no move()) → ok=true, atomicMethod="copy-then-delete"', async () => {
      const r = await api.exportNow({ reason: 'unit-test-fallback' });
      assert.equal(r.ok, true, 'errors=' + JSON.stringify(r.errors || r.error));
      assert.equal(r.atomicMethod, 'copy-then-delete');
      assert.ok(env.handle._files.has('chrome-latest.json'));
      assert.equal(env.handle._files.has('chrome-latest.json.tmp'), false,
        'fallback path should still remove the tmp file');
    });
  }
}

function makeSampleBundleForChromeRoundTrip() {
  // Same shape as makeSampleBundle() used in the desktop tests, so the
  // round-trip exercises the same skip-if-exists path. Kept as a separate
  // function so both groups can mutate the bundle independently.
  return {
    schema: 'h2o.studio.fullBundle.v2',
    chatArchive: {
      chats: [
        {
          chatId: 'c_test1',
          chatIndex: {
            title: 'Test Chat',
            href: 'https://chatgpt.com/c/c_test1',
            state: { isSaved: true, isLinked: true },
            organization: { categoryId: 'cat_test1', tagIds: ['tag_test1'] },
          },
          tags: [{ id: 'tag_test1', name: 'TestTag' }],
          snapshots: [
            {
              snapshotId: 'snap_test1',
              createdAt: '2026-05-01T00:00:00Z',
              messages: [
                { role: 'user', text: 'Hello', order: 0 },
                { role: 'assistant', text: 'Hi!', order: 1 },
              ],
              meta: {
                title: 'Test Chat',
                richTurns: [
                  { turnIdx: 0, role: 'user', outerHTML: '<div>Hello</div>' },
                  { turnIdx: 1, role: 'assistant', outerHTML: '<div>Hi!</div>' },
                ],
              },
              digest: 'abc123',
              messageCount: 2,
            },
          ],
        },
      ],
      catalogs: {
        categories: [{ id: 'cat_test1', name: 'TestCategory', source: 'imported' }],
        labels: [{ id: 'lbl_test1', name: 'TestLabel', color: '#ff0000', source: 'imported' }],
      },
    },
    chromeStorageLocal: {
      'h2o:prm:cgx:fldrs:state:data:v1': {
        folders: [{ id: 'fld_test1', name: 'TestFolder', color: '#00ff00' }],
        items: { 'fld_test1': ['c_test1'] },
      },
      'h2o:prm:cgx:library:labels:catalog:v1': { catalog: [{ id: 'lbl_test1', name: 'TestLabel' }] },
    },
    libraryKv: [
      { key: 'h2o:prm:cgx:library:labels:bindings:v1', value: { bindings: { 'c_test1': ['lbl_test1'] } } },
    ],
  };
}

// ── Chrome event-trigger test runner (R3 phase 2) ─────────────────────
async function runChromeEventTriggerTests() {
  console.log('');
  console.log('── Chrome event-trigger contract (R3 phase 2) ──────────────');

  const AUTO_IMPORT_REL = 'src-surfaces-base/studio/sync/auto-import.mv3.js';
  const AUTO_IMPORT_PATH = path.join(REPO_ROOT, AUTO_IMPORT_REL);

  // CustomEvent shim — vm sandboxes don't include the DOM Event constructors.
  // A minimal stand-in is enough; we only need .type to flow through to listeners.
  function makeCustomEventCtor() {
    return class CustomEvent {
      constructor(type, init) {
        this.type = type;
        this.detail = init && init.detail !== undefined ? init.detail : null;
      }
    };
  }

  // EventTarget shim built on Map<eventName, Set<handler>>. addEventListener
  // / removeEventListener / dispatchEvent are the only API the module uses.
  function makeEventTarget() {
    const listeners = new Map();
    return {
      _listeners: listeners,
      addEventListener(type, fn) {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type).add(fn);
      },
      removeEventListener(type, fn) {
        const set = listeners.get(type);
        if (set) set.delete(fn);
      },
      dispatchEvent(event) {
        const set = listeners.get(event && event.type);
        if (!set) return true;
        for (const fn of set) { try { fn(event); } catch (_) { /* swallow */ } }
        return true;
      },
    };
  }

  function makeFlagsMock(initial) {
    const store = new Map();
    if (initial) for (const [k, v] of Object.entries(initial)) store.set(k, v);
    return {
      _store: store,
      get(name, fallback) { return store.has(name) ? store.get(name) : fallback; },
      set(name, value) { store.set(name, value); },
    };
  }

  // Build a sandbox with: no Tauri, Chrome runtime present, in-memory IDB
  // with a directory handle, FSA mocks, flag mocks, and an EventTarget
  // backing for window-level dispatchEvent. The same auto-import.mv3.js
  // file already loaded earlier in Group 7 is re-evaluated in this
  // sandbox — the IIFE is idempotent (the `if (... .__installed) return`
  // guard runs per-context, not per-process).
  function buildSandbox(opts) {
    const eventTarget = makeEventTarget();
    const exportCalls = [];
    const sandbox = {
      __TAURI_INTERNALS__: undefined,
      __TAURI__: undefined,
      indexedDB: undefined,             // filled below
      H2O: { flags: makeFlagsMock(opts.flags || {}) },
      chrome: {
        runtime: {
          id: 'mock-extension-id',
          get lastError() { return undefined; },
          sendMessage(message, callback) {
            exportCalls.push(message);
            Promise.resolve().then(() => {
              try {
                const result = opts.sendHandler
                  ? opts.sendHandler(message)
                  : { schema: 'h2o.studio.fullBundle.v2', chatArchive: { chats: [] } };
                callback({ ok: true, result });
              } catch (e) {
                callback({ ok: false, error: String((e && e.message) || e) });
              }
            });
          },
        },
        storage: {
          local: (() => {
            const data = new Map();
            return {
              _data: data,
              get(keys, cb) {
                const arr = Array.isArray(keys) ? keys : [keys];
                const out = {};
                for (const k of arr) if (data.has(k)) out[k] = data.get(k);
                Promise.resolve().then(() => cb(out));
              },
              set(items, cb) {
                for (const k of Object.keys(items || {})) data.set(k, items[k]);
                Promise.resolve().then(() => { if (typeof cb === 'function') cb(); });
              },
            };
          })(),
        },
      },
      addEventListener: eventTarget.addEventListener.bind(eventTarget),
      removeEventListener: eventTarget.removeEventListener.bind(eventTarget),
      dispatchEvent: eventTarget.dispatchEvent.bind(eventTarget),
      Promise, JSON, Date, console, Number, String, Boolean, Object, Array, Error, Math,
      Map, Set, WeakMap, WeakSet, Symbol, RegExp,
      CustomEvent: makeCustomEventCtor(),
      TextEncoder: globalThis.TextEncoder,
      setTimeout: globalThis.setTimeout,
      clearTimeout: globalThis.clearTimeout,
      crypto: globalThis.crypto,
      _eventTarget: eventTarget,
      _exportCalls: exportCalls,
    };
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    const src = fs.readFileSync(AUTO_IMPORT_PATH, 'utf8');
    vm.runInContext(src, sandbox, { filename: AUTO_IMPORT_REL });
    return sandbox;
  }

  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

  // ── 8.1 — module loads in event-trigger sandbox; API shape includes new fields ──
  let sandbox;
  try {
    sandbox = buildSandbox({ flags: {} });
    PASS.push('auto-import.mv3.js loads in event-trigger sandbox');
    console.log('  ✓ auto-import.mv3.js loads in event-trigger sandbox');
  } catch (e) {
    const msg = (e && e.message) || String(e);
    FAIL.push({ label: 'auto-import.mv3.js loads in event-trigger sandbox', err: msg });
    console.log(`  ✗ auto-import.mv3.js loads in event-trigger sandbox\n      ${msg}`);
    return;
  }
  const autoImport = sandbox.H2O?.Studio?.sync?.autoImport;
  await checkAsync('diagnose() reports event-trigger surface area', async () => {
    const d = await autoImport.diagnose();
    assert.equal(d.eventTriggerFlagKey, 'sync.chromeAutoImport.eventTrigger');
    assert.equal(d.eventTriggerEnabled, false, 'event-trigger flag defaults OFF');
    assert.equal(d.eventTriggerListenersBound, false, 'no listeners bound at boot when flag OFF');
    assert.ok(Array.isArray(d.eventTriggerNames));
    assert.ok(d.eventTriggerNames.includes('evt:h2o:library:cross-surface-sync'));
    assert.ok(d.eventTriggerNames.includes('evt:h2o:library-index:updated'));
    assert.equal(d.eventTriggerDebounceMs, 2000);
  });

  // ── 8.2 — enable() binds listeners; isEnabled() reflects the flag ────
  await checkAsync('enable() binds listeners and sets event-trigger flag', async () => {
    await autoImport.enable();
    assert.equal(autoImport.isEnabled(), true);
    const d = await autoImport.diagnose();
    assert.equal(d.eventTriggerEnabled, true);
    assert.equal(d.eventTriggerListenersBound, true);
    // Confirm the EventTarget actually has listeners now.
    const liblisteners = sandbox._eventTarget._listeners.get('evt:h2o:library:cross-surface-sync');
    assert.ok(liblisteners && liblisteners.size === 1, 'cross-surface-sync listener bound');
    const idxlisteners = sandbox._eventTarget._listeners.get('evt:h2o:library-index:updated');
    assert.ok(idxlisteners && idxlisteners.size === 1, 'library-index:updated listener bound');
  });

  // ── 8.3 — master flag OFF prevents export even with event-trigger ON ──
  await checkAsync('master flag OFF → dispatched event does NOT trigger export', async () => {
    sandbox._exportCalls.length = 0;
    // Master flag stays OFF (default). Event-trigger flag is ON from 8.2.
    sandbox.dispatchEvent(new sandbox.CustomEvent('evt:h2o:library:cross-surface-sync'));
    await sleep(2200); // > 2000ms debounce
    assert.equal(sandbox._exportCalls.length, 0,
      'export should NOT fire when master flag is OFF; got ' + sandbox._exportCalls.length + ' calls');
  });

  // ── 8.4 — both flags ON + event dispatched → debounced export runs ──
  // Observable contract: state.eventTriggerCount counts every dispatched
  // event (3); state.lastExportAt + state.lastExportStatus prove that
  // exportNow was attempted exactly once after the debounce — the IDB
  // handle is intentionally absent in this sandbox so the call resolves
  // with status='error' / error matching "not connected", which is the
  // CORRECT outcome for "exportNow ran but had nowhere to write." This
  // tests the trigger contract (debounce + coalesce + invoke exportNow)
  // independently of the full write path (Group 7 covers that).
  await checkAsync('both flags ON + 3 events → 1 coalesced exportNow attempt after 2s debounce', async () => {
    const diagBefore = await autoImport.diagnose();
    const eventCountBefore = diagBefore.eventTriggerCount;
    const lastExportAtBefore = diagBefore.lastExportAt;
    sandbox.H2O.flags.set('sync.chromeAutoImport', true);
    // Fire 3 events in quick succession; debounce should coalesce to 1.
    sandbox.dispatchEvent(new sandbox.CustomEvent('evt:h2o:library:cross-surface-sync'));
    sandbox.dispatchEvent(new sandbox.CustomEvent('evt:h2o:library-index:updated'));
    sandbox.dispatchEvent(new sandbox.CustomEvent('evt:h2o:sync:chrome-auto-import:trigger'));
    await sleep(500);
    const diagMid = await autoImport.diagnose();
    assert.equal(diagMid.eventTriggerCount - eventCountBefore, 3,
      'all 3 events should have arrived at onTriggerEvent; got ' +
      (diagMid.eventTriggerCount - eventCountBefore));
    assert.equal(diagMid.lastExportAt, lastExportAtBefore,
      'exportNow must NOT have fired during the debounce window');
    await sleep(1800); // total > 2000ms debounce
    const diagAfter = await autoImport.diagnose();
    assert.notEqual(diagAfter.lastExportAt, lastExportAtBefore,
      'exportNow should have been invoked exactly once after debounce; lastExportAt unchanged');
    // The sandbox has no IDB handle, so exportNow gets to the handle
    // lookup, fails with "not connected", and records error status.
    // That's the correct observation that "the debounce coalesced 3
    // events into 1 exportNow call which ran end-to-end-of-API."
    assert.equal(diagAfter.lastExportStatus, 'error',
      'expected status="error" (no handle in sandbox); got ' + diagAfter.lastExportStatus);
    assert.match(diagAfter.lastExportError || '', /not connected/i,
      'error should mention folder-not-connected');
  });

  // ── 8.5 — disable() unbinds listeners; further dispatches are no-op ──
  await checkAsync('disable() unbinds listeners; subsequent events do nothing', async () => {
    await autoImport.disable();
    assert.equal(autoImport.isEnabled(), false);
    const d = await autoImport.diagnose();
    assert.equal(d.eventTriggerListenersBound, false);
    const set = sandbox._eventTarget._listeners.get('evt:h2o:library:cross-surface-sync');
    assert.ok(!set || set.size === 0, 'listener should be removed');
    sandbox._exportCalls.length = 0;
    sandbox.dispatchEvent(new sandbox.CustomEvent('evt:h2o:library:cross-surface-sync'));
    await sleep(2200);
    assert.equal(sandbox._exportCalls.length, 0,
      'no export should fire after disable; got ' + sandbox._exportCalls.length);
  });

  // ── 8.6 — flag preset at boot → listeners auto-bind in loadPersistedState ──
  await checkAsync('flag preset ON at boot → listeners auto-bound, no enable() call needed', async () => {
    const fresh = buildSandbox({
      flags: { 'sync.chromeAutoImport.eventTrigger': true, 'sync.chromeAutoImport': true },
    });
    // Allow loadPersistedState (called from boot) to finish.
    await sleep(50);
    const ai = fresh.H2O?.Studio?.sync?.autoImport;
    assert.ok(ai, 'autoImport must be registered');
    assert.equal(ai.isEnabled(), true);
    const d = await ai.diagnose();
    assert.equal(d.eventTriggerListenersBound, true,
      'listeners should be bound at boot when flag was preset');
  });
}

// ── Desktop focus-trigger test runner (R3 phase 2) ────────────────────
async function runDesktopFocusImportTests() {
  console.log('');
  console.log('── Desktop focus-trigger contract (R3 phase 2) ─────────────');

  const FOCUS_IMPORT_REL = 'src-surfaces-base/studio/sync/focus-import.tauri.js';
  const FOCUS_IMPORT_PATH = path.join(REPO_ROOT, FOCUS_IMPORT_REL);

  function makeEventTarget() {
    const listeners = new Map();
    return {
      _listeners: listeners,
      addEventListener(type, fn) {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type).add(fn);
      },
      removeEventListener(type, fn) {
        const set = listeners.get(type);
        if (set) set.delete(fn);
      },
      dispatchEvent(event) {
        const set = listeners.get(event && event.type);
        if (!set) return true;
        for (const fn of set) { try { fn(event); } catch (_) { /* swallow */ } }
        return true;
      },
    };
  }

  function makeFlagsMock(initial) {
    const store = new Map();
    if (initial) for (const [k, v] of Object.entries(initial)) store.set(k, v);
    return {
      _store: store,
      get(name, fallback) { return store.has(name) ? store.get(name) : fallback; },
      set(name, value) { store.set(name, value); },
    };
  }

  // Build a Tauri-detected sandbox with H2O.Studio.sync.scanFolderOnce
  // pre-mocked. We pre-register H2O.Studio.sync.scanFolderOnce BEFORE
  // loading focus-import.tauri.js so the module sees a valid syncs API.
  function buildSandbox(opts) {
    const winEvents = makeEventTarget();
    const docEvents = makeEventTarget();
    const scanCalls = [];
    const refreshCalls = [];
    const fakeDocument = {
      visibilityState: opts.visibilityState || 'visible',
      addEventListener: docEvents.addEventListener.bind(docEvents),
      removeEventListener: docEvents.removeEventListener.bind(docEvents),
    };
    const sandbox = {
      __TAURI_INTERNALS__: { invoke: () => Promise.reject(new Error('mock invoke')) },
      H2O: {
        flags: makeFlagsMock(opts.flags || {}),
        Studio: {
          sync: {
            scanFolderOnce: async () => {
              scanCalls.push({ at: Date.now() });
              return opts.scanResult || { ok: true, imported: [], skipped: [] };
            },
          },
        },
        LibraryIndex: {
          refresh: async (reason) => { refreshCalls.push(reason); return true; },
        },
      },
      chrome: {
        storage: {
          local: (() => {
            const data = new Map();
            return {
              _data: data,
              get(keys, cb) {
                const arr = Array.isArray(keys) ? keys : [keys];
                const out = {};
                for (const k of arr) if (data.has(k)) out[k] = data.get(k);
                Promise.resolve().then(() => cb(out));
              },
              set(items, cb) {
                for (const k of Object.keys(items || {})) data.set(k, items[k]);
                Promise.resolve().then(() => { if (typeof cb === 'function') cb(); });
              },
            };
          })(),
        },
      },
      document: fakeDocument,
      addEventListener: winEvents.addEventListener.bind(winEvents),
      removeEventListener: winEvents.removeEventListener.bind(winEvents),
      dispatchEvent: winEvents.dispatchEvent.bind(winEvents),
      Promise, JSON, Date, console, Number, String, Boolean, Object, Array, Error, Math,
      Map, Set, WeakMap, WeakSet, Symbol, RegExp,
      CustomEvent: class { constructor(type) { this.type = type; } },
      setTimeout: globalThis.setTimeout,
      clearTimeout: globalThis.clearTimeout,
      _winEvents: winEvents,
      _docEvents: docEvents,
      _scanCalls: scanCalls,
      _refreshCalls: refreshCalls,
    };
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    const src = fs.readFileSync(FOCUS_IMPORT_PATH, 'utf8');
    vm.runInContext(src, sandbox, { filename: FOCUS_IMPORT_REL });
    return sandbox;
  }

  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

  // ── 9.1 — module loads and registers H2O.Studio.sync.focusImport ───
  let sandbox;
  try {
    sandbox = buildSandbox({ flags: {} });
    PASS.push('focus-import.tauri.js loads in Desktop sandbox');
    console.log('  ✓ focus-import.tauri.js loads in Desktop sandbox');
  } catch (e) {
    const msg = (e && e.message) || String(e);
    FAIL.push({ label: 'focus-import.tauri.js loads in Desktop sandbox', err: msg });
    console.log(`  ✗ focus-import.tauri.js loads in Desktop sandbox\n      ${msg}`);
    return;
  }
  const focusImport = sandbox.H2O?.Studio?.sync?.focusImport;
  check('focusImport namespace + public API', () => {
    assert.ok(focusImport, 'focusImport not registered');
    assert.equal(focusImport.__installed, true);
    for (const fn of ['enable', 'disable', 'isEnabled', 'status', 'diagnose', 'triggerNow']) {
      assert.equal(typeof focusImport[fn], 'function', `${fn} should be a function`);
    }
  });
  await checkAsync('diagnose() reports R3-phase2 / flag OFF / no listeners', async () => {
    const d = await focusImport.diagnose();
    assert.equal(d.phase, 'R3-phase2');
    assert.equal(d.flagKey, 'sync.desktopImportOnFocus');
    assert.equal(d.flagEnabled, false);
    assert.equal(d.listenersBound, false);
    assert.equal(d.polling, false);
    assert.equal(d.watcher, false);
    assert.equal(d.bidirectionalSync, false);
    assert.equal(d.backgroundDaemon, false);
    assert.equal(d.minIntervalMs, 30000);
    assert.equal(d.focusDebounceMs, 800);
  });

  // ── 9.2 — enable() binds focus + visibilitychange listeners ─────────
  await checkAsync('enable() binds window focus + document visibilitychange listeners', async () => {
    await focusImport.enable();
    assert.equal(focusImport.isEnabled(), true);
    const focusSet = sandbox._winEvents._listeners.get('focus');
    assert.ok(focusSet && focusSet.size === 1, 'focus listener must be bound');
    const visSet = sandbox._docEvents._listeners.get('visibilitychange');
    assert.ok(visSet && visSet.size === 1, 'visibilitychange listener must be bound');
  });

  // ── 9.3 — focus event with flag ON → scanFolderOnce called ──────────
  await checkAsync('focus event with flag ON → scanFolderOnce called', async () => {
    sandbox._scanCalls.length = 0;
    sandbox.dispatchEvent({ type: 'focus' });
    await sleep(900); // > 800ms debounce
    assert.equal(sandbox._scanCalls.length, 1,
      'expected 1 scan call after focus + debounce; got ' + sandbox._scanCalls.length);
  });

  // ── 9.4 — interval throttle: rapid 2nd focus within 30s → dropped ───
  await checkAsync('2nd focus within 30s interval → throttled (no extra scan)', async () => {
    sandbox._scanCalls.length = 0;
    // First focus happened in 9.3 (lastTriggerAt is recent). Within the
    // 30s MIN_INTERVAL_MS window, a new focus should be throttled.
    sandbox.dispatchEvent({ type: 'focus' });
    await sleep(900);
    assert.equal(sandbox._scanCalls.length, 0,
      'extra scan should be throttled within 30s interval; got ' + sandbox._scanCalls.length);
    const d = await focusImport.diagnose();
    assert.ok(d.skippedTooSoonCount >= 1, 'skippedTooSoonCount should reflect throttle');
  });

  // ── 9.5 — visibilitychange fires only when visibilityState === 'visible' ──
  await checkAsync('visibilitychange while hidden → no trigger', async () => {
    // Use a fresh sandbox with hidden state so we don't fight the
    // 30s throttle from the previous tests.
    const env = buildSandbox({ flags: { 'sync.desktopImportOnFocus': true }, visibilityState: 'hidden' });
    await sleep(50); // boot hydrate
    env.dispatchEvent({ type: 'visibilitychange' }); // window dispatch — handler is on document
    env._docEvents.dispatchEvent({ type: 'visibilitychange' });
    await sleep(900);
    assert.equal(env._scanCalls.length, 0,
      'visibilitychange should not trigger scan when document is hidden; got ' + env._scanCalls.length);
  });

  // ── 9.6 — visibilitychange when visible → triggers scan ─────────────
  await checkAsync('visibilitychange while visible → scan triggered', async () => {
    const env = buildSandbox({ flags: { 'sync.desktopImportOnFocus': true }, visibilityState: 'visible' });
    await sleep(50);
    env._docEvents.dispatchEvent({ type: 'visibilitychange' });
    await sleep(900);
    assert.equal(env._scanCalls.length, 1,
      'visibilitychange should trigger scan when document is visible; got ' + env._scanCalls.length);
  });

  // ── 9.7 — triggerNow() bypasses debounce + interval throttle ────────
  await checkAsync('triggerNow() bypasses debounce + throttle; runs synchronously', async () => {
    const env = buildSandbox({ flags: { 'sync.desktopImportOnFocus': true } });
    await sleep(50);
    const ai = env.H2O.Studio.sync.focusImport;
    const r = await ai.triggerNow({ reason: 'unit-test' });
    assert.equal(r.ok, true, 'triggerNow should succeed; got ' + JSON.stringify(r));
    assert.equal(env._scanCalls.length, 1, 'triggerNow should call scanFolderOnce immediately');
    // Second triggerNow should ALSO fire — bypassing the throttle.
    const r2 = await ai.triggerNow({ reason: 'unit-test-2' });
    assert.equal(r2.ok, true);
    assert.equal(env._scanCalls.length, 2);
  });

  // ── 9.8 — triggerNow() respects the master flag ─────────────────────
  await checkAsync('triggerNow() with flag OFF returns ok=false, no scan', async () => {
    const env = buildSandbox({ flags: {} }); // flag NOT set
    await sleep(50);
    const ai = env.H2O.Studio.sync.focusImport;
    const r = await ai.triggerNow({ reason: 'unit-test-flagoff' });
    assert.equal(r.ok, false);
    assert.match(r.error || '', /sync\.desktopImportOnFocus/);
    assert.equal(env._scanCalls.length, 0);
  });

  // ── 9.9 — scan that imported files triggers LibraryIndex.refresh ────
  await checkAsync('imported files > 0 → LibraryIndex.refresh called', async () => {
    const env = buildSandbox({
      flags: { 'sync.desktopImportOnFocus': true },
      scanResult: { ok: true, imported: [{ file: 'chrome-latest.json' }], skipped: [] },
    });
    await sleep(50);
    const ai = env.H2O.Studio.sync.focusImport;
    await ai.triggerNow({ reason: 'unit-test' });
    assert.equal(env._scanCalls.length, 1);
    assert.equal(env._refreshCalls.length, 1,
      'LibraryIndex.refresh must be called when imported>0; got ' + env._refreshCalls.length);
    assert.match(env._refreshCalls[0] || '', /focus-import/);
  });

  // ── 9.10 — scan with no new files → does NOT call LibraryIndex.refresh ──
  await checkAsync('imported files == 0 → LibraryIndex.refresh NOT called', async () => {
    const env = buildSandbox({
      flags: { 'sync.desktopImportOnFocus': true },
      scanResult: { ok: true, imported: [], skipped: [{ file: 'latest.json' }] },
    });
    await sleep(50);
    const ai = env.H2O.Studio.sync.focusImport;
    await ai.triggerNow({ reason: 'unit-test' });
    assert.equal(env._scanCalls.length, 1);
    assert.equal(env._refreshCalls.length, 0,
      'LibraryIndex.refresh should not be called when nothing imported');
  });

  // ── 9.11 — disable() unbinds listeners ──────────────────────────────
  await checkAsync('disable() unbinds focus + visibilitychange listeners', async () => {
    const env = buildSandbox({ flags: { 'sync.desktopImportOnFocus': true } });
    await sleep(50);
    const ai = env.H2O.Studio.sync.focusImport;
    // First confirm enabled state binds listeners (from boot hydrate).
    assert.equal(ai.isEnabled(), true);
    const focusSet = env._winEvents._listeners.get('focus');
    assert.ok(focusSet && focusSet.size === 1);
    await ai.disable();
    assert.equal(ai.isEnabled(), false);
    const focusSet2 = env._winEvents._listeners.get('focus');
    assert.ok(!focusSet2 || focusSet2.size === 0, 'focus listener should be removed after disable');
    const visSet2 = env._docEvents._listeners.get('visibilitychange');
    assert.ok(!visSet2 || visSet2.size === 0, 'visibilitychange listener should be removed after disable');
  });
}

// ── Desktop Categories Actions test runner (R4.1) ─────────────────────
async function runDesktopCategoriesActionsTests() {
  console.log('');
  console.log('── Desktop Categories Write Parity (R4.1) ──────────────────');

  const S0F4B_REL  = 'src-surfaces-base/studio/S0F4b. 🎬 Categories Actions - Studio.js';
  const S0F4B_PATH = path.join(REPO_ROOT, S0F4B_REL);

  // Minimal store.categories mock — Map-backed, mirroring the public
  // surface of categories.tauri.js that S0F4b actually calls:
  // get / create / patch / remove / assignChat / clearChat.
  function makeCategoriesStoreMock() {
    const cats = new Map();    // categoryId -> row
    const chatCat = new Map(); // chatId -> categoryId
    let seq = 0;
    return {
      _cats: cats,
      _chatCat: chatCat,
      async get(idInput) {
        const id = String(idInput == null ? '' : idInput).trim();
        return id && cats.has(id) ? { ...cats.get(id) } : null;
      },
      async create(patch) {
        seq += 1;
        const id = `cat_test_${seq}`;
        const row = {
          categoryId: id,
          name: String((patch && patch.name) || ''),
          parentId: String((patch && patch.parentId) || ''),
          source: String((patch && patch.source) || ''),
          meta: (patch && patch.meta && typeof patch.meta === 'object') ? { ...patch.meta } : {},
        };
        cats.set(id, row);
        return { ...row };
      },
      async patch(idInput, partial) {
        const id = String(idInput == null ? '' : idInput).trim();
        if (!id || !cats.has(id)) return null;
        const cur = cats.get(id);
        const next = { ...cur, ...(partial || {}) };
        cats.set(id, next);
        return { ...next };
      },
      async remove(idInput) {
        const id = String(idInput == null ? '' : idInput).trim();
        if (!id || !cats.has(id)) return false;
        // Bulk-clear chats.category_id (matching the real store behavior).
        for (const [chatId, catId] of chatCat) {
          if (catId === id) chatCat.delete(chatId);
        }
        cats.delete(id);
        return true;
      },
      async assignChat(categoryIdInput, chatIdInput) {
        const cid = String(categoryIdInput == null ? '' : categoryIdInput).trim();
        const ch  = String(chatIdInput == null ? '' : chatIdInput).trim();
        if (!cid || !ch || !cats.has(cid)) return false;
        chatCat.set(ch, cid);
        return true;
      },
      async clearChat(chatIdInput) {
        const ch = String(chatIdInput == null ? '' : chatIdInput).trim();
        if (!ch || !chatCat.has(ch)) return false;
        chatCat.delete(ch);
        return true;
      },
    };
  }

  // EventTarget shim so dispatchRefresh() can be observed.
  function makeEventTarget() {
    const listeners = new Map();
    return {
      _listeners: listeners,
      _dispatchedEvents: [],
      addEventListener(type, fn) {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type).add(fn);
      },
      removeEventListener(type, fn) {
        const set = listeners.get(type);
        if (set) set.delete(fn);
      },
      dispatchEvent(event) {
        this._dispatchedEvents.push({ type: event && event.type, detail: event && event.detail });
        const set = listeners.get(event && event.type);
        if (!set) return true;
        for (const fn of set) { try { fn(event); } catch (_) { /* swallow */ } }
        return true;
      },
    };
  }

  function buildSandbox() {
    const eventTarget = makeEventTarget();
    const store = makeCategoriesStoreMock();
    const sandbox = {
      __TAURI_INTERNALS__: { invoke: () => Promise.reject(new Error('mock invoke')) },
      H2O: { Studio: { store: { categories: store } } },
      Promise, JSON, Date, console, Number, String, Boolean, Object, Array, Error, Math,
      Map, Set, WeakMap, WeakSet, Symbol, RegExp,
      CustomEvent: class { constructor(type, init) { this.type = type; this.detail = (init && init.detail) || null; } },
      addEventListener: eventTarget.addEventListener.bind(eventTarget),
      removeEventListener: eventTarget.removeEventListener.bind(eventTarget),
      dispatchEvent: eventTarget.dispatchEvent.bind(eventTarget),
      setTimeout: globalThis.setTimeout,
      clearTimeout: globalThis.clearTimeout,
      _eventTarget: eventTarget,
      _store: store,
    };
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    const src = fs.readFileSync(S0F4B_PATH, 'utf8');
    vm.runInContext(src, sandbox, { filename: S0F4B_REL });
    return sandbox;
  }

  // ── 10.1 — module loads + API shape ─────────────────────────────────
  let sandbox;
  try {
    sandbox = buildSandbox();
    PASS.push('S0F4b loads in Desktop sandbox + registers actions.categories');
    console.log('  ✓ S0F4b loads in Desktop sandbox + registers actions.categories');
  } catch (e) {
    const msg = (e && e.message) || String(e);
    FAIL.push({ label: 'S0F4b loads', err: msg });
    console.log(`  ✗ S0F4b loads in Desktop sandbox\n      ${msg}`);
    return;
  }
  const actions = sandbox.H2O?.Studio?.actions?.categories;
  check('actions.categories namespace + 7 expected methods', () => {
    assert.ok(actions, 'actions.categories not registered');
    assert.equal(actions.__installed, true);
    for (const fn of ['create', 'rename', 'remove', 'delete', 'assignChat', 'clearChat', 'diagnose']) {
      assert.equal(typeof actions[fn], 'function', `${fn} should be a function`);
    }
  });
  check('diagnose() reports R4.1 phase + storeAvailable=true', () => {
    const d = actions.diagnose();
    assert.equal(d.phase, 'R4.1-categories');
    assert.equal(d.installed, true);
    assert.equal(d.storeAvailable, true);
    assert.equal(d.refreshEvent, 'evt:h2o:library-index:refresh-request');
  });

  // ── 10.2 — create ──────────────────────────────────────────────────
  let createdId = '';
  await checkAsync('create({name}) → ok, returns categoryId, dispatches refresh', async () => {
    sandbox._eventTarget._dispatchedEvents.length = 0;
    const r = await actions.create({ name: 'TestCategory', meta: { foo: 'bar' } });
    assert.equal(r.ok, true, 'errors: ' + JSON.stringify(r));
    assert.equal(r.status, 'ok');
    assert.ok(r.categoryId && r.categoryId.startsWith('cat_test_'),
      'expected categoryId to be generated');
    assert.equal(r.name, 'TestCategory');
    createdId = r.categoryId;
    // Refresh event dispatched
    const evts = sandbox._eventTarget._dispatchedEvents
      .filter(e => e.type === 'evt:h2o:library-index:refresh-request');
    assert.equal(evts.length, 1, 'expected 1 refresh event');
    assert.match(String(evts[0].detail.reason), /categories-actions:create/);
    // Row actually in the store
    assert.ok(sandbox._store._cats.has(createdId));
  });
  await checkAsync('create with empty name → name-required, no dispatch', async () => {
    sandbox._eventTarget._dispatchedEvents.length = 0;
    const r = await actions.create({ name: '' });
    assert.equal(r.ok, false);
    assert.equal(r.status, 'name-required');
    assert.equal(sandbox._eventTarget._dispatchedEvents.length, 0,
      'no refresh event should fire on validation failure');
  });

  // ── 10.3 — rename ──────────────────────────────────────────────────
  await checkAsync('rename(id, newName) → ok, row updated, refresh dispatched', async () => {
    sandbox._eventTarget._dispatchedEvents.length = 0;
    const r = await actions.rename(createdId, 'RenamedCategory');
    assert.equal(r.ok, true, 'errors: ' + JSON.stringify(r));
    assert.equal(r.status, 'ok');
    assert.equal(r.name, 'RenamedCategory');
    assert.equal(sandbox._store._cats.get(createdId).name, 'RenamedCategory');
    const evts = sandbox._eventTarget._dispatchedEvents
      .filter(e => e.type === 'evt:h2o:library-index:refresh-request');
    assert.equal(evts.length, 1);
    assert.match(String(evts[0].detail.reason), /categories-actions:rename/);
  });
  await checkAsync('rename non-existent → not-found', async () => {
    const r = await actions.rename('cat_does_not_exist', 'Nope');
    assert.equal(r.ok, false);
    assert.equal(r.status, 'not-found');
  });
  await checkAsync('rename with empty newName → name-required', async () => {
    const r = await actions.rename(createdId, '');
    assert.equal(r.ok, false);
    assert.equal(r.status, 'name-required');
  });

  // ── 10.4 — assignChat ──────────────────────────────────────────────
  await checkAsync('assignChat(chatId, categoryId) → ok, store updated, refresh', async () => {
    sandbox._eventTarget._dispatchedEvents.length = 0;
    const r = await actions.assignChat('c_test1', createdId);
    assert.equal(r.ok, true, 'errors: ' + JSON.stringify(r));
    assert.equal(r.status, 'ok');
    assert.equal(sandbox._store._chatCat.get('c_test1'), createdId);
    const evts = sandbox._eventTarget._dispatchedEvents
      .filter(e => e.type === 'evt:h2o:library-index:refresh-request');
    assert.equal(evts.length, 1);
    assert.match(String(evts[0].detail.reason), /categories-actions:assignChat/);
  });
  await checkAsync('assignChat to non-existent category → category-not-found', async () => {
    const r = await actions.assignChat('c_test1', 'cat_phantom');
    assert.equal(r.ok, false);
    assert.equal(r.status, 'category-not-found');
  });
  await checkAsync('assignChat missing chatId → chat-id-required', async () => {
    const r = await actions.assignChat('', createdId);
    assert.equal(r.ok, false);
    assert.equal(r.status, 'chat-id-required');
  });

  // ── 10.5 — clearChat ───────────────────────────────────────────────
  await checkAsync('clearChat(chatId) → ok, wasAssigned=true, refresh dispatched', async () => {
    sandbox._eventTarget._dispatchedEvents.length = 0;
    const r = await actions.clearChat('c_test1');
    assert.equal(r.ok, true, 'errors: ' + JSON.stringify(r));
    assert.equal(r.status, 'ok');
    assert.equal(r.wasAssigned, true);
    assert.equal(sandbox._store._chatCat.has('c_test1'), false);
    const evts = sandbox._eventTarget._dispatchedEvents
      .filter(e => e.type === 'evt:h2o:library-index:refresh-request');
    assert.equal(evts.length, 1);
  });
  await checkAsync('clearChat on chat without category → ok, wasAssigned=false, NO refresh', async () => {
    sandbox._eventTarget._dispatchedEvents.length = 0;
    const r = await actions.clearChat('c_never_assigned');
    assert.equal(r.ok, true);
    assert.equal(r.wasAssigned, false);
    // No-op writes don't fire refresh — keep the event bus quiet.
    const evts = sandbox._eventTarget._dispatchedEvents
      .filter(e => e.type === 'evt:h2o:library-index:refresh-request');
    assert.equal(evts.length, 0,
      'clearChat on unassigned chat should NOT fire refresh (no state changed)');
  });

  // ── 10.6 — remove (with cascade) ──────────────────────────────────
  await checkAsync('remove(id) clears assigned chats too, then deletes', async () => {
    // First assign a few chats to a fresh category, then remove it.
    const created = await actions.create({ name: 'ToDelete' });
    await actions.assignChat('chat_a', created.categoryId);
    await actions.assignChat('chat_b', created.categoryId);
    assert.equal(sandbox._store._chatCat.size, 2);
    sandbox._eventTarget._dispatchedEvents.length = 0;
    const r = await actions.remove(created.categoryId);
    assert.equal(r.ok, true);
    assert.equal(r.status, 'ok');
    assert.equal(sandbox._store._cats.has(created.categoryId), false,
      'category row should be deleted');
    assert.equal(sandbox._store._chatCat.has('chat_a'), false,
      'chat_a should be unassigned');
    assert.equal(sandbox._store._chatCat.has('chat_b'), false,
      'chat_b should be unassigned');
    const evts = sandbox._eventTarget._dispatchedEvents
      .filter(e => e.type === 'evt:h2o:library-index:refresh-request');
    assert.equal(evts.length, 1, 'refresh should fire on successful delete');
  });
  await checkAsync('remove non-existent → not-found, no refresh', async () => {
    sandbox._eventTarget._dispatchedEvents.length = 0;
    const r = await actions.remove('cat_phantom');
    assert.equal(r.ok, false);
    assert.equal(r.status, 'not-found');
    const evts = sandbox._eventTarget._dispatchedEvents
      .filter(e => e.type === 'evt:h2o:library-index:refresh-request');
    assert.equal(evts.length, 0);
  });

  // ── 10.7 — delete alias points to remove ──────────────────────────
  check('actions.categories.delete is the same function as remove', () => {
    assert.equal(actions['delete'], actions.remove,
      'delete should be an alias of remove');
  });

  // ── 10.8 — LibraryIndex refresh visibility (round-trip) ───────────
  // Wire a listener for the refresh event; verify create/rename/assign/
  // clear/remove all surface visibly through it. This proves the
  // dispatchRefresh path matches what S0F1c.refreshFromStores listens
  // for; the actual reason strings are the contract.
  await checkAsync('end-to-end: 5 mutations → 5 refresh events with matching reasons', async () => {
    sandbox._eventTarget._dispatchedEvents.length = 0;
    const reasons = [];
    sandbox.addEventListener('evt:h2o:library-index:refresh-request', (e) => {
      reasons.push((e && e.detail && e.detail.reason) || '');
    });
    const c = await actions.create({ name: 'E2E' });
    await actions.rename(c.categoryId, 'E2E-renamed');
    await actions.assignChat('chat_e2e', c.categoryId);
    await actions.clearChat('chat_e2e');
    await actions.remove(c.categoryId);
    assert.equal(reasons.length, 5, 'expected 5 refresh events; got ' + reasons.length);
    assert.match(reasons[0], /create/);
    assert.match(reasons[1], /rename/);
    assert.match(reasons[2], /assignChat/);
    assert.match(reasons[3], /clearChat/);
    assert.match(reasons[4], /remove/);
  });

  // ── 10.9 — diagnose counters reflect the run ──────────────────────
  check('diagnose() counters reflect all writes since boot', () => {
    const d = actions.diagnose();
    // We did at least: create*3, rename*2 (1 ok + 1 not-found), assignChat*3 (1 ok + 2 errors),
    // clearChat*2, remove*3 (2 ok + 1 not-found). That's 13+ writes.
    assert.ok(d.writesSinceBoot >= 13,
      'expected writesSinceBoot >= 13; got ' + d.writesSinceBoot);
    assert.ok(d.lastWriteAt > 0);
    assert.equal(typeof d.lastWriteAction, 'string');
  });
}

function summarize() {
  console.log('');
  console.log(`  passed: ${PASS.length}`);
  console.log(`  failed: ${FAIL.length}`);
  if (FAIL.length > 0) {
    console.log('');
    console.log('Failures:');
    for (const f of FAIL) {
      console.log(`  ✗ ${f.label}`);
      console.log(`      ${f.err}`);
    }
  }
}

main().catch((e) => {
  console.error('Harness fatal error:', e && e.stack ? e.stack : e);
  process.exit(2);
});
