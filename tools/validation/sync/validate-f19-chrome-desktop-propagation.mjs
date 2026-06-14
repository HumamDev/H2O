#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';
import { TextDecoder, TextEncoder } from 'node:util';
import { webcrypto } from 'node:crypto';

const root = process.cwd();
const failures = [];

const folderSyncFile = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const focusImportFile = 'src-surfaces-base/studio/sync/focus-import.tauri.js';
const importBundleFile = 'src-surfaces-base/studio/ingestion/import-bundle.tauri.js';
const contractFile = 'docs/systems/cross-platform/f19.2-chrome-desktop-automatic-propagation-contract.md';

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

function exists(file) {
  return fs.existsSync(path.join(root, file));
}

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function assertExists(file) {
  assert(exists(file), `${file}: missing`);
}

function assertContains(file, needle, label = needle) {
  const text = read(file);
  assert(text.includes(needle), `${file}: missing ${label}`);
}

function assertNotContains(file, needle, label = needle) {
  const text = read(file);
  assert(!text.includes(needle), `${file}: unexpectedly contains ${label}`);
}

function makeStorage() {
  const values = new Map();
  return {
    local: {
      get(keys, callback) {
        const out = {};
        for (const key of Array.isArray(keys) ? keys : [keys]) {
          if (values.has(key)) out[key] = values.get(key);
        }
        callback(out);
      },
      set(items, callback) {
        for (const [key, value] of Object.entries(items || {})) values.set(key, value);
        if (callback) callback();
      }
    }
  };
}

function buildChromeBundle() {
  return {
    schema: 'h2o.studio.fullBundle.v2',
    exportedAt: '2026-06-14T12:00:00.000Z',
    exportId: 'chrome-export-fixture',
    sequenceNumber: 7,
    previousExportId: 'chrome-export-prev',
    contentSha256: 'hash-fixture',
    sourceSurfaceKind: 'chrome-studio',
    sourceAppKind: 'chrome-extension',
    sourceStoreKind: 'mv3-storage',
    sourcePeerEnvelope: { peerIdHash: 'peer-hash-fixture', installIdHash: 'install-hash-fixture' },
    chatArchive: {
      schema: 'h2o.chatArchive.bundle.v1',
      exportedAt: '2026-06-14T12:00:00.000Z',
      catalogs: {
        categories: [{ id: 'raw-category-id', name: 'Private Category Name', color: '#123456' }],
        labels: [{ id: 'raw-label-id', name: 'Private Label Name' }],
        tags: [{ id: 'raw-tag-id', name: 'Private Tag Name' }]
      },
      chats: [
        {
          chatIndex: {
            id: 'raw-chat-id-1',
            title: 'Private Saved Chat Title',
            view: 'saved',
            pinned: true,
            organization: {
              categoryId: 'raw-category-id',
              labels: ['raw-label-id'],
              tags: ['raw-tag-id'],
              projectId: 'raw-project-id'
            }
          },
          snapshots: [{ id: 'raw-snapshot-id-1', content: 'Private message body' }]
        },
        {
          chatIndex: {
            id: 'raw-chat-id-2',
            title: 'Private Linked Chat Title',
            view: 'linked',
            organization: {}
          },
          snapshots: []
        }
      ]
    },
    chromeStorageLocal: {
      'h2o:prm:cgx:fldrs:state:data:v1': {
        schemaVersion: 1,
        exportedFrom: 'chrome-studio',
        folders: [{ id: 'raw-folder-id', name: 'Private Folder Name', color: '#abcdef' }],
        items: { 'raw-folder-id': ['raw-chat-id-1'] }
      },
      'unsupported-private-key': { value: 'private unsupported value' }
    },
    libraryKv: [
      { key: 'h2o:library:labels:raw-chat-id-1', value: ['raw-label-id'] }
    ],
    projects: [{ id: 'raw-project-id', name: 'Private Project Name' }]
  };
}

function buildContext() {
  const imported = [];
  const refreshReasons = [];
  const context = {
    console,
    TextEncoder,
    TextDecoder,
    crypto: webcrypto,
    Date,
    setTimeout(callback) {
      if (typeof callback === 'function') callback();
      return 1;
    },
    clearTimeout() {},
    setInterval() { return 1; },
    clearInterval() {},
    H2O: {
      Studio: {
        ingestion: {
          async importBundle(bundle, mode, options) {
            imported.push({ bundle, mode, options });
            return {
              ok: true,
              mode,
              destinationBackend: 'sqlite-fixture',
              written: {
                chats: bundle.chatArchive.chats.length,
                snapshots: 1,
                categories: bundle.chatArchive.catalogs.categories.length,
                folders: bundle.chromeStorageLocal['h2o:prm:cgx:fldrs:state:data:v1'].folders.length
              },
              skipped: { chats: 0, snapshots: 0, categories: 0, folders: 0 },
              warnings: [],
              errors: [],
              libraryBulkMigration: [
                { phase: 'catalogs', ok: true, status: 'classified', blockers: [], warnings: [] }
              ]
            };
          }
        },
        sync: {}
      },
      LibraryIndex: {
        async refresh(reason) {
          refreshReasons.push(reason);
          return { ok: true };
        }
      }
    },
    chrome: {
      storage: makeStorage(),
      runtime: { lastError: null }
    },
    __TAURI_INTERNALS__: {
      invoke() {
        throw new Error('fs invoke is intentionally unavailable in VM propagation proof');
      }
    },
    __imported: imported,
    __refreshReasons: refreshReasons
  };
  context.window = context;
  context.globalThis = context;
  return vm.createContext(context);
}

async function runVmProof() {
  const source = read(folderSyncFile);
  const context = buildContext();
  vm.runInContext(source, context, { filename: folderSyncFile });
  const api = context.H2O.Studio.sync;
  api.libraryParity = {
    async captureSnapshot() {
      return {
        schema: 'h2o.studio.sync.library-parity-snapshot.v1',
        surface: 'desktop-studio',
        counts: { total: 2, saved: 1, linked: 1 },
        fingerprints: { chats: 'hash-only-fixture' }
      };
    }
  };

  assert(api.__installed === true, 'folder sync API marker missing');
  assert(api.chromeDesktopPropagationSchema === 'h2o.studio.sync.chrome-desktop-propagation.v1', 'propagation schema marker mismatch');
  assert(api.chromeDesktopPropagationVersion === '0.1.0-f19.2.b', 'propagation version marker mismatch');
  assert(typeof api.importChromeLatestBundle === 'function', 'importChromeLatestBundle missing');
  assert(typeof api.importChromeLatestFromFile === 'function', 'importChromeLatestFromFile missing');
  assert(typeof api.importChromeLatestFromFolder === 'function', 'importChromeLatestFromFolder missing');

  const result = await api.importChromeLatestBundle(buildChromeBundle(), { proofMode: true });
  assert(result.schema === 'h2o.studio.sync.chrome-desktop-propagation.v1', 'result schema mismatch');
  assert(result.version === '0.1.0-f19.2.b', 'result version mismatch');
  assert(result.ok === true, 'propagation proof should pass');
  assert(result.status === 'imported', 'propagation status should be imported');
  assert(result.direction === 'chrome-to-desktop', 'direction mismatch');
  assert(result.sourceSummary.chatCount === 2, 'source chat count mismatch');
  assert(result.sourceSummary.savedCount === 1, 'source saved count mismatch');
  assert(result.sourceSummary.linkedCount === 1, 'source linked count mismatch');
  assert(result.sourceSummary.pinnedCount === 1, 'source pinned count mismatch');
  assert(result.supportedFields.includes('saved-chat-records'), 'saved chats not marked supported');
  assert(result.supportedFields.includes('linked-chat-records'), 'linked chats not marked supported');
  assert(result.supportedFields.includes('folder-metadata'), 'folder metadata not marked supported');
  assert(result.supportedFields.includes('category-metadata'), 'category metadata not marked supported');
  for (const code of [
    'library-propagation-labels-deferred',
    'library-propagation-tags-deferred',
    'library-propagation-projects-deferred',
    'library-propagation-chat-folder-bindings-deferred',
    'library-propagation-unsupported-storage-deferred'
  ]) {
    assert(result.warnings.includes(code), `result missing warning ${code}`);
  }
  assert(result.privacy.rawIdsReturned === false, 'raw ID privacy flag should remain false');
  assert(result.privacy.rawTitlesReturned === false, 'raw title privacy flag should remain false');
  assert(result.privacy.rawContentReturned === false, 'raw content privacy flag should remain false');
  assert(result.sideEffects.chromeStorageWritten === false, 'Chrome storage should not be written by Desktop import');
  assert(result.sideEffects.nativeCalled === false, 'Native should not be called by propagation proof');
  assert(result.parity.snapshotCaptured === true, 'parity snapshot should be captured');

  const call = context.__imported[0];
  assert(call, 'importBundle was not called');
  assert(call.mode === 'merge', 'import mode must be merge');
  assert(call.options.allowLibraryShimFallback === false, 'Library shim fallback must be disabled');
  assert(call.options.skipExistingFolderMetadata === true, 'existing folder metadata must be protected');
  assert(call.options.f19ChromeDesktopPropagation === true, 'F19 propagation marker missing');
  assert(call.options.transport === 'chrome-latest.json', 'transport option mismatch');
  assert(call.bundle.chatArchive.chats.length === 2, 'chat count should be preserved');
  assert(call.bundle.chatArchive.catalogs.categories.length === 1, 'category count should be preserved');
  assert(call.bundle.chatArchive.catalogs.labels.length === 0, 'labels must be stripped');
  assert(call.bundle.libraryKv.length === 0, 'libraryKv must be stripped');
  assert(Object.keys(call.bundle.chromeStorageLocal).length === 1, 'unsupported chromeStorageLocal keys must be stripped');
  const folderState = call.bundle.chromeStorageLocal['h2o:prm:cgx:fldrs:state:data:v1'];
  assert(folderState.folders.length === 1, 'folder metadata should be preserved');
  assert(Object.keys(folderState.items).length === 0, 'chat-folder bindings must be deferred');
  const org = call.bundle.chatArchive.chats[0].chatIndex.organization;
  assert(org.categoryId === 'raw-category-id', 'chat category binding should be preserved for importer');
  assert(!Object.prototype.hasOwnProperty.call(org, 'labels'), 'labels must be stripped from chat organization');
  assert(!Object.prototype.hasOwnProperty.call(org, 'tags'), 'tags must be stripped from chat organization');
  assert(!Object.prototype.hasOwnProperty.call(org, 'projectId'), 'project must be stripped from chat organization');
  assert(context.__refreshReasons.includes('f19-chrome-desktop-import'), 'LibraryIndex refresh was not requested');

  const publicResult = JSON.stringify(result);
  for (const forbidden of [
    'raw-chat-id-1',
    'raw-snapshot-id-1',
    'raw-folder-id',
    'raw-category-id',
    'Private Saved Chat Title',
    'Private message body',
    'Private Folder Name',
    'Private Label Name',
    'Private Category Name',
    'Private Project Name',
    'chat_id',
    'folder_id',
    'category_id'
  ]) {
    assert(!publicResult.includes(forbidden), `public result leaked ${forbidden}`);
  }
}

for (const file of [folderSyncFile, focusImportFile, importBundleFile, contractFile]) assertExists(file);

if (failures.length === 0) {
  assertContains(folderSyncFile, 'h2o.studio.sync.chrome-desktop-propagation.v1', 'propagation schema');
  assertContains(folderSyncFile, '0.1.0-f19.2.b', 'propagation version');
  assertContains(folderSyncFile, 'importChromeLatestBundle', 'bundle API');
  assertContains(folderSyncFile, 'importChromeLatestFromFile', 'file API');
  assertContains(folderSyncFile, 'importChromeLatestFromFolder', 'folder API');
  assertContains(folderSyncFile, 'allowLibraryShimFallback: false', 'guarded import fallback disable');
  assertContains(folderSyncFile, 'skipExistingFolderMetadata: true', 'folder overwrite guard');
  assertContains(folderSyncFile, 'library-propagation-labels-deferred', 'label deferred taxonomy');
  assertContains(folderSyncFile, 'library-propagation-chat-folder-bindings-deferred', 'folder binding deferred taxonomy');
  assertContains(folderSyncFile, 'fileFingerprintChecked: true', 'file idempotency marker');
  assertContains(importBundleFile, 'shouldSkipExistingFolderMetadata', 'folder overwrite helper');
  assertContains(importBundleFile, 'skipExistingFolderMetadata', 'folder overwrite option');
  assertContains(focusImportFile, 'importChromeLatestFromFolder', 'focus importer guarded path');
  assertContains(contractFile, 'F19.2.b Minimal Chrome -> Desktop Scope', 'F19.2.b doc section');
  assertContains(contractFile, 'Premium Sync remains open', 'premium sync warning');
  assertNotContains(folderSyncFile, 'SKIP_STALENESS_CHECK', 'staleness bypass');
}

if (failures.length === 0) {
  await runVmProof();
}

if (failures.length) {
  console.error('F19 Chrome/Desktop propagation validation failed');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('F19 Chrome/Desktop propagation validation passed');
