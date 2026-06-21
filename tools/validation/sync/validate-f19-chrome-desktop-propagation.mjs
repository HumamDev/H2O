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
const folderImportFile = 'src-surfaces-base/studio/sync/folder-import.mv3.js';
const autoImportFile = 'src-surfaces-base/studio/sync/auto-import.mv3.js';
const focusImportFile = 'src-surfaces-base/studio/sync/focus-import.tauri.js';
const importBundleFile = 'src-surfaces-base/studio/ingestion/import-bundle.tauri.js';
const chatStoreFile = 'src-surfaces-base/studio/store/chats.tauri.js';
const studioArchiveFile = 'src-surfaces-base/studio/S0D3a. 🎬 Transcript Archive Engine - Studio.js';
const studioSyncFile = 'src-surfaces-base/studio/S0F1h. 🎬 Library Sync - Studio.js';
const chromeLiveBackgroundFile = 'tools/product/extensions/chatgpt/chrome/chrome-live-background.mjs';
const chromeLiveLoaderFile = 'tools/product/extensions/chatgpt/chrome/chrome-live-loader.mjs';
const chromeLiveManifestFile = 'tools/product/extensions/chatgpt/chrome/chrome-live-manifest.mjs';
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

function chromeManifestHash(value) {
  const text = String(value == null ? '' : value).trim();
  if (!text) return '';
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
  }
  return `h:${(`00000000${hash.toString(16)}`).slice(-8)}`;
}

function buildChromeBundle() {
  const unindexedRows = [1, 2, 3].map((index) => ({
    rowHash: chromeManifestHash(`chat:unindexed-private-chat-${index}`),
    chatIdHash: chromeManifestHash(`unindexed-private-chat-${index}`),
    snapshotIdHash: '',
    reason: 'not-indexed',
    rowClass: 'unknown',
    hasSnapshotId: false,
    hasSnapshots: false,
    isSaved: false,
    isLinked: false,
    isPinned: false,
    isArchived: false
  }));
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
              folderId: 'raw-folder-id',
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
            state: {
              isSaved: false,
              isLinked: true,
              isPinned: true,
              isArchived: false,
              isDeleted: false
            },
            f19MinimalLibraryIndexRow: true,
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
        items: {
          'raw-folder-id': ['raw-chat-id-1'],
          'raw-legacy-folder-id': ['raw-chat-id-legacy']
        }
      },
      'unsupported-private-key': { value: 'private unsupported value' }
    },
    libraryKv: [
      { key: 'h2o:library:labels:raw-chat-id-1', value: ['raw-label-id'] }
    ],
    diagnostics: {
      unindexedRowManifest: {
        schema: 'h2o.studio.sync.chrome-export-unindexed-rows.v1',
        count: unindexedRows.length,
        rows: unindexedRows,
        reasonCounts: { 'not-indexed': unindexedRows.length },
        privacy: {
          redacted: true,
          rawIdsReturned: false,
          rawTitlesReturned: false,
          rawContentReturned: false
        }
      },
      unindexedRows
    },
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
              unindexedRowsReceived: 3,
              unindexedRowsMatched: 3,
              unindexedRowsArchived: 3,
              unindexedRowsMissing: 0,
              unindexedRowReasonCounts: { 'not-indexed': 3 },
              folderMetadataFreshness: {
                incoming: 1,
                created: 0,
                refreshed: 1,
                skippedStale: 0,
                missingIncomingUpdatedAt: 0,
                missingExistingUpdatedAt: 0
              },
              chatWriteDiagnostics: [{
                pathName: 'unindexed-archive-reconciliation',
                action: 'reconciled-archived',
                rowClass: 'unknown',
                reason: 'not-indexed',
                hasChatId: true,
                hasSnapshotId: false,
                isSaved: false,
                isLinked: false,
                isArchived: true,
                hasTranscriptEvidence: false,
                weakClassifierRan: true,
                identityFieldNames: ['patch.chatId']
              }],
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
  assert(api.folder && api.folder.__installed === true, 'Desktop folder facade missing');
  assert(typeof api.folder.syncNow === 'function', 'Desktop folder.syncNow missing');
  assert(typeof api.folder.importChromeFromSyncFolder === 'function', 'Desktop folder importChromeFromSyncFolder missing');
  assert(typeof api.folder.importChromeLatestFromFolder === 'function', 'Desktop folder importChromeLatestFromFolder missing');
  assert(api.folder.transport === 'chrome-latest.json', 'Desktop folder facade transport mismatch');
  assert(api.folder.desktopReadsChromeLatestJson === true, 'Desktop folder facade read marker missing');

  const result = await api.importChromeLatestBundle(buildChromeBundle(), { proofMode: true });
  assert(result.schema === 'h2o.studio.sync.chrome-desktop-propagation.v1', 'result schema mismatch');
  assert(result.version === '0.1.0-f19.2.b', 'result version mismatch');
  assert(result.ok === true, 'propagation proof should pass');
  assert(result.status === 'imported', 'propagation status should be imported');
  assert(result.direction === 'chrome-to-desktop', 'direction mismatch');
  assert(result.sourceSummary.chatCount === 2, 'source chat count mismatch');
  assert(result.sourceSummary.savedCount === 1, 'source saved count mismatch');
  assert(result.sourceSummary.linkedCount === 1, 'source linked count mismatch');
  assert(result.sourceSummary.pinnedCount === 2, 'source pinned count mismatch');
  assert(result.sourceSummary.minimalRowCount === 1, 'source minimal row count mismatch');
  assert(result.sourceSummary.unindexedArchiveRowCount === 3, 'source unindexed archive count mismatch');
  assert(result.sourceSummary.unindexedRowManifestCount === 3, 'source unindexed manifest count mismatch');
  assert(result.sourceSummary.unindexedRowReasonCounts['not-indexed'] === 3, 'source unindexed reason count mismatch');
  assert(result.importSummary.unindexedRowsReceived === 3, 'import summary unindexedRowsReceived mismatch');
  assert(result.importSummary.unindexedRowsMatched === 3, 'import summary unindexedRowsMatched mismatch');
  assert(result.importSummary.unindexedRowsArchived === 3, 'import summary unindexedRowsArchived mismatch');
  assert(result.importSummary.unindexedRowsMissing === 0, 'import summary unindexedRowsMissing mismatch');
  assert(result.importSummary.folderMetadataFreshness.refreshed === 1, 'Chrome->Desktop newer folder metadata refresh summary missing');
  assert(result.importSummary.folderMetadataFreshness.skippedStale === 0, 'Chrome->Desktop folder metadata should not be stale in fixture');
  assert(result.unindexedRowsReceived === 3, 'top-level unindexedRowsReceived mismatch');
  assert(result.unindexedRowsArchived === 3, 'top-level unindexedRowsArchived mismatch');
  assert(result.unindexedRowReasonCounts['not-indexed'] === 3, 'top-level unindexed reason count mismatch');
  assert(result.importSummary.chatWriteDiagnostics.some((entry) => entry.action === 'reconciled-archived' && entry.reason === 'not-indexed'),
    'redacted reconciled-archived diagnostic missing');
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
  assert(call.bundle.diagnostics.unindexedRowManifest.rows.length === 3, 'unindexed manifest should be preserved for Desktop import');
  assert(call.bundle.diagnostics.unindexedRowManifest.reasonCounts['not-indexed'] === 3, 'unindexed manifest reason count should be preserved');
  assert(call.bundle.chatArchive.catalogs.categories.length === 1, 'category count should be preserved');
  assert(call.bundle.chatArchive.catalogs.labels.length === 0, 'labels must be stripped');
  assert(call.bundle.libraryKv.length === 0, 'libraryKv must be stripped');
  assert(Object.keys(call.bundle.chromeStorageLocal).length === 1, 'unsupported chromeStorageLocal keys must be stripped');
  const folderState = call.bundle.chromeStorageLocal['h2o:prm:cgx:fldrs:state:data:v1'];
  assert(folderState.folders.length === 1, 'folder metadata should be preserved');
  assert(Object.keys(folderState.items).length === 0, 'chat-folder bindings must be deferred');
  const org = call.bundle.chatArchive.chats[0].chatIndex.organization;
  assert(org.categoryId === 'raw-category-id', 'chat category binding should be preserved for importer');
  assert(org.folderId === 'raw-folder-id', 'safe per-chat folder binding should be preserved for importer');
  assert(!Object.prototype.hasOwnProperty.call(org, 'labels'), 'labels must be stripped from chat organization');
  assert(!Object.prototype.hasOwnProperty.call(org, 'tags'), 'tags must be stripped from chat organization');
  assert(!Object.prototype.hasOwnProperty.call(org, 'projectId'), 'project must be stripped from chat organization');
  assert(context.__refreshReasons.includes('f19-chrome-desktop-import'), 'LibraryIndex refresh was not requested');

  context.H2O.Studio.ingestion.importBundle = async function coveredMinimalImport(bundle, mode) {
    return {
      ok: false,
      mode,
      destinationBackend: 'sqlite-fixture',
      written: { chats: 1, snapshots: 0, categories: 0, folders: 0 },
      skipped: { chats: 1, snapshots: 0, categories: 0, folders: 0 },
      warnings: [],
      errors: [{ kind: 'chrome-minimal-row-import', code: 'sqlite-unavailable' }],
      chromeMinimalRows: { total: 1, attempted: 1, materialized: 1, existing: 0, failed: 0 },
      libraryBulkMigration: []
    };
  };
  const covered = await api.importChromeLatestBundle(buildChromeBundle(), { proofMode: true });
  assert(covered.ok === true, 'covered minimal row stale error should not block propagation');
  assert(!covered.blockers.includes('chrome-minimal-row-import-unsupported'), 'covered minimal row should not emit unsupported blocker');
  assert(covered.warnings.includes('chrome-minimal-row-stale-error-covered'), 'covered minimal row warning missing');
  assert(covered.importSummary.staleMinimalRowErrorsCovered === true, 'covered minimal row summary marker missing');
  assert(covered.importSummary.redactedErrorCategories.some((entry) => entry.code === 'sqlite-unavailable' && entry.count === 1), 'redacted error categories missing');
  assert(covered.redactedErrorCategories.some((entry) => entry.code === 'sqlite-unavailable' && entry.count === 1), 'top-level redacted error categories missing');
  assert(covered.minimalRowsMaterialized === 1, 'top-level minimalRowsMaterialized mismatch');
  assert(covered.minimalRowsExisting === 0, 'top-level minimalRowsExisting mismatch');
  assert(covered.minimalRowsSatisfied === 1, 'top-level minimalRowsSatisfied mismatch');
  assert(covered.minimalRowsFailed === 0, 'top-level minimalRowsFailed mismatch');
  assert(covered.minimalRowErrors === 1, 'top-level minimalRowErrors mismatch');

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

function buildImportBundleContext({ transcriptBacked = false, existingChat = null, authorizedSqlFails = false } = {}) {
  let chatUpsertCalls = 0;
  let authorizedSqlCalls = 0;
  const context = {
    console,
    TextEncoder,
    TextDecoder,
    Date,
    setTimeout(callback) {
      if (typeof callback === 'function') callback();
      return 1;
    },
    clearTimeout() {},
    H2O: {
      Desktop: {
        Sync: {
          async executeAuthorizedSqlite() {
            authorizedSqlCalls += 1;
            if (authorizedSqlFails) throw new Error('no such function: h2o_writer_identity');
            return [1, 0];
          }
        }
      },
      Studio: {
        store: {
          chats: {
            async get() { return existingChat; },
            async upsert() {
              chatUpsertCalls += 1;
              throw new Error('no such function: h2o_writer_identity');
            },
            async reload() {}
          },
          snapshots: {
            async get() { return null; },
            async create() { return { ok: true }; }
          },
          categories: { async get() { return null; }, async upsert() { return { ok: true }; } },
          labels: { async get() { return null; }, async upsert() { return { ok: true }; } },
          folders: { async get() { return null; }, async upsert() { return { ok: true }; } }
        }
      }
    },
    chrome: {
      storage: makeStorage(),
      runtime: { lastError: null }
    },
    __TAURI_INTERNALS__: {
      invoke() {
        throw new Error('sqlite fallback should not be reached in weak-row proof');
      }
    },
    __getProofCounters() {
      return { chatUpsertCalls, authorizedSqlCalls, transcriptBacked, existingChat: !!existingChat, authorizedSqlFails };
    }
  };
  context.window = context;
  context.globalThis = context;
  return vm.createContext(context);
}

function buildWeakImportBundle({ transcriptBacked = false } = {}) {
  const snapshots = transcriptBacked ? [{
    snapshotId: 'snap-private-fixture',
    createdAt: '2026-06-14T12:00:00.000Z',
    messages: [
      { role: 'user', text: 'Private user text', order: 0 },
      { role: 'assistant', text: 'Private assistant text', order: 1 }
    ],
    meta: { title: 'Private Transcript Title' }
  }] : [];
  return {
    schema: 'h2o.studio.fullBundle.v2',
    chatArchive: {
      schema: 'h2o.chatArchive.bundle.v1',
      catalogs: { categories: [], labels: [] },
      chats: [{
        chatId: 'weak-row-private-chat-id',
        chatIndex: {
          id: 'weak-row-private-chat-id',
          title: transcriptBacked ? 'Private Transcript Title' : 'Private Link Title',
          href: 'https://chatgpt.com/c/weak-row-private-chat-id',
          view: transcriptBacked ? 'saved' : 'linked',
          state: {
            isSaved: transcriptBacked,
            isLinked: !transcriptBacked,
            isPinned: false,
            isArchived: false,
            isDeleted: false
          },
          organization: {}
        },
        snapshots
      }]
    },
    chromeStorageLocal: {},
    libraryKv: []
  };
}

function buildUnindexedReconciliationFixture() {
  const existingRows = new Map();
  const activeChats = [];
  for (let i = 1; i <= 7; i += 1) {
    const chatId = `active-saved-${i}`;
    activeChats.push({
      chatId,
      chatIndex: {
        id: chatId,
        view: 'saved',
        href: `https://chatgpt.com/c/${chatId}`,
        state: { isSaved: true, isLinked: false, isPinned: i === 1, isArchived: false, isDeleted: false },
        organization: {}
      },
      snapshots: []
    });
    existingRows.set(chatId, {
      chatId,
      href: `https://chatgpt.com/c/${chatId}`,
      normalizedHref: `https://chatgpt.com/c/${chatId}`,
      isSaved: true,
      isLinked: false,
      isPinned: i === 1,
      isArchived: false,
      isDeleted: false,
      snapshotCount: 0,
      messageCount: 0,
      turnCount: 0,
      meta: {}
    });
  }
  for (let i = 1; i <= 10; i += 1) {
    const chatId = `active-link-${i}`;
    activeChats.push({
      chatId,
      chatIndex: {
        id: chatId,
        view: 'linked',
        href: `https://chatgpt.com/c/${chatId}`,
        state: { isSaved: false, isLinked: true, isPinned: false, isArchived: false, isDeleted: false },
        organization: {}
      },
      snapshots: []
    });
    existingRows.set(chatId, {
      chatId,
      href: `https://chatgpt.com/c/${chatId}`,
      normalizedHref: `https://chatgpt.com/c/${chatId}`,
      isSaved: false,
      isLinked: true,
      isPinned: false,
      isArchived: false,
      isDeleted: false,
      snapshotCount: 0,
      messageCount: 0,
      turnCount: 0,
      meta: {}
    });
  }
  const unindexedRows = [];
  for (let i = 1; i <= 3; i += 1) {
    const chatId = `unindexed-private-chat-${i}`;
    existingRows.set(chatId, {
      chatId,
      href: `https://chatgpt.com/c/${chatId}`,
      normalizedHref: `https://chatgpt.com/c/${chatId}`,
      isSaved: false,
      isLinked: false,
      isPinned: false,
      isArchived: false,
      isDeleted: false,
      snapshotCount: 0,
      messageCount: 0,
      turnCount: 0,
      meta: {}
    });
    unindexedRows.push({
      rowHash: chromeManifestHash(`chat:${chatId}`),
      chatIdHash: chromeManifestHash(chatId),
      snapshotIdHash: '',
      reason: 'not-indexed',
      rowClass: 'unknown',
      hasSnapshotId: false,
      hasSnapshots: false,
      isSaved: false,
      isLinked: false,
      isPinned: false,
      isArchived: false
    });
  }
  const bundle = {
    schema: 'h2o.studio.fullBundle.v2',
    chatArchive: {
      schema: 'h2o.chatArchive.bundle.v1',
      catalogs: { categories: [], labels: [] },
      chats: activeChats
    },
    chromeStorageLocal: {},
    libraryKv: [],
    diagnostics: {
      unindexedRowManifest: {
        schema: 'h2o.studio.sync.chrome-export-unindexed-rows.v1',
        count: unindexedRows.length,
        rows: unindexedRows,
        reasonCounts: { 'not-indexed': unindexedRows.length },
        privacy: {
          redacted: true,
          rawIdsReturned: false,
          rawTitlesReturned: false,
          rawContentReturned: false
        }
      },
      unindexedRows
    }
  };
  return { bundle, existingRows };
}

function buildUnindexedImportBundleContext(existingRows) {
  let chatUpsertCalls = 0;
  let archiveExistingCalls = 0;
  const context = {
    console,
    TextEncoder,
    TextDecoder,
    Date,
    setTimeout(callback) {
      if (typeof callback === 'function') callback();
      return 1;
    },
    clearTimeout() {},
    H2O: {
      Studio: {
        store: {
          chats: {
            async get(chatId) {
              const id = typeof chatId === 'string' ? chatId : String((chatId && (chatId.chatId || chatId.id)) || '');
              return existingRows.get(id) || null;
            },
            async list() { return Array.from(existingRows.values()); },
            async archiveExisting(chatId) {
              const row = existingRows.get(chatId);
              if (!row) return null;
              archiveExistingCalls += 1;
              row.isArchived = true;
              return row;
            },
            async upsert() {
              chatUpsertCalls += 1;
              throw new Error('upsert must not create rows during unindexed reconciliation proof');
            },
            async reload() {}
          },
          snapshots: {
            async get() { return null; },
            async create() { return { ok: true }; }
          },
          categories: { async get() { return null; }, async upsert() { return { ok: true }; } },
          labels: { async get() { return null; }, async upsert() { return { ok: true }; } },
          folders: { async get() { return null; }, async upsert() { return { ok: true }; } }
        }
      }
    },
    chrome: {
      storage: makeStorage(),
      runtime: { lastError: null }
    },
    __TAURI_INTERNALS__: {
      invoke() {
        throw new Error('sqlite fallback should not be reached in unindexed reconciliation proof');
      }
    },
    __getProofCounters() {
      return { chatUpsertCalls, archiveExistingCalls };
    }
  };
  context.window = context;
  context.globalThis = context;
  return vm.createContext(context);
}

async function runUnindexedArchiveReconciliationProof() {
  const source = read(importBundleFile);
  const fixture = buildUnindexedReconciliationFixture();
  const context = buildUnindexedImportBundleContext(fixture.existingRows);
  vm.runInContext(source, context, { filename: importBundleFile });
  const result = await context.H2O.Studio.ingestion.importBundle(
    fixture.bundle,
    'merge',
    { disableLibraryBulkMigration: true }
  );
  const counters = context.__getProofCounters();
  assert(result.ok === true, 'unindexed archive reconciliation should not block import');
  assert(counters.chatUpsertCalls === 0, 'unindexed reconciliation must not create rows via chatStore.upsert');
  assert(counters.archiveExistingCalls === 3, 'unindexed reconciliation must archive exactly three existing rows');
  assert(result.unindexedRowsReceived === 3, 'unindexedRowsReceived mismatch');
  assert(result.unindexedRowsMatched === 3, 'unindexedRowsMatched mismatch');
  assert(result.unindexedRowsArchived === 3, 'unindexedRowsArchived mismatch');
  assert(result.unindexedRowsMissing === 0, 'unindexedRowsMissing mismatch');
  assert(result.unindexedRowReasonCounts['not-indexed'] === 3, 'unindexed reason count mismatch');
  assert((result.chatWriteDiagnostics || []).some((entry) => entry && entry.action === 'reconciled-archived' && entry.reason === 'not-indexed'),
    'reconciled-archived chatWriteDiagnostic missing');
  const rows = Array.from(fixture.existingRows.values());
  const activeRows = rows.filter((row) => !row.isArchived && !row.isDeleted);
  assert(activeRows.length === 17, 'Desktop active total should converge to 17');
  assert(activeRows.filter((row) => row.isSaved).length === 7, 'Desktop active saved count should be 7');
  assert(activeRows.filter((row) => !row.isSaved && row.isLinked).length === 10, 'Desktop active link count should be 10');
  assert(rows.filter((row) => row.isArchived).length === 3, 'Desktop archived bucket should be 3');
}

async function runImportBundleWeakRowProof() {
  const source = read(importBundleFile);

  const weakContext = buildImportBundleContext({ transcriptBacked: false });
  vm.runInContext(source, weakContext, { filename: importBundleFile });
  const weakResult = await weakContext.H2O.Studio.ingestion.importBundle(
    buildWeakImportBundle({ transcriptBacked: false }),
    'merge',
    { disableLibraryBulkMigration: true }
  );
  const weakCounters = weakContext.__getProofCounters();
  assert(weakResult.ok === true, 'weak zero-transcript row should not block import');
  assert(weakCounters.chatUpsertCalls === 0, 'weak zero-transcript row should be handled before chatStore.upsert');
  assert(weakCounters.authorizedSqlCalls === 1, 'weak zero-transcript row should use authorized shell materialization');
  assert(weakResult.chromeWeakRows && weakResult.chromeWeakRows.attempted === 1, 'weakRowsAttempted should increment before upsert');
  assert(weakResult.chromeWeakRows && weakResult.chromeWeakRows.materialized === 1, 'weak row should materialize in VM proof');
  assert((weakResult.warnings || []).some((w) => w && w.kind === 'chrome-weak-row-pre-upsert-diagnostic'), 'weak row pre-upsert diagnostic missing');

  const strictContext = buildImportBundleContext({ transcriptBacked: true });
  vm.runInContext(source, strictContext, { filename: importBundleFile });
  const strictResult = await strictContext.H2O.Studio.ingestion.importBundle(
    buildWeakImportBundle({ transcriptBacked: true }),
    'merge',
    { disableLibraryBulkMigration: true }
  );
  const strictCounters = strictContext.__getProofCounters();
  assert(strictResult.ok === false, 'transcript-backed row writer identity failure must remain strict');
  assert(strictCounters.chatUpsertCalls === 1, 'transcript-backed row should still use canonical chatStore.upsert');
  assert(!strictResult.chromeWeakRows || Number(strictResult.chromeWeakRows.attempted || 0) === 0, 'transcript-backed row must not be counted as weak');
  assert((strictResult.errors || []).some((e) => e && e.transcriptBacked === true), 'strict transcript-backed error diagnostic missing');

  const existingWeakFailContext = buildImportBundleContext({
    transcriptBacked: false,
    authorizedSqlFails: true,
    existingChat: {
      chatId: 'weak-row-private-chat-id',
      title: 'Existing Private Link Title',
      href: 'https://chatgpt.com/c/weak-row-private-chat-id',
      isSaved: false,
      isLinked: false,
      snapshotCount: 0,
      messageCount: 0,
      turnCount: 0,
      userTurnCount: 0,
      assistantTurnCount: 0,
      meta: {}
    }
  });
  vm.runInContext(source, existingWeakFailContext, { filename: importBundleFile });
  const existingWeakFailResult = await existingWeakFailContext.H2O.Studio.ingestion.importBundle(
    buildWeakImportBundle({ transcriptBacked: false }),
    'merge',
    { disableLibraryBulkMigration: true }
  );
  const existingWeakFailCounters = existingWeakFailContext.__getProofCounters();
  assert(existingWeakFailResult.ok === true, 'existing weak zero-transcript evidence merge should not block import');
  assert(existingWeakFailCounters.authorizedSqlCalls === 1, 'existing weak row should try authorized evidence merge first');
  assert(existingWeakFailCounters.chatUpsertCalls === 0, 'existing weak row should not fall through to chatStore.upsert when authorized merge fails');
  assert(existingWeakFailResult.chromeWeakRows && existingWeakFailResult.chromeWeakRows.attempted === 1, 'existing weak evidence merge should increment weakRowsAttempted');
  assert(existingWeakFailResult.chromeWeakRows && existingWeakFailResult.chromeWeakRows.skipped === 1, 'existing weak evidence merge should increment weakRowsSkipped');
  assert((existingWeakFailResult.warnings || []).some((w) => w && w.kind === 'chrome-weak-row-skipped-unrecoverable' && w.phase === 'existing-evidence-upsert'),
    'existing weak evidence skip diagnostic missing');

  const existingStrictContext = buildImportBundleContext({
    transcriptBacked: true,
    existingChat: {
      chatId: 'weak-row-private-chat-id',
      title: 'Existing Private Transcript Title',
      href: 'https://chatgpt.com/c/weak-row-private-chat-id',
      isSaved: false,
      isLinked: true,
      snapshotCount: 0,
      messageCount: 0,
      turnCount: 0,
      userTurnCount: 0,
      assistantTurnCount: 0,
      meta: {}
    }
  });
  vm.runInContext(source, existingStrictContext, { filename: importBundleFile });
  const existingStrictResult = await existingStrictContext.H2O.Studio.ingestion.importBundle(
    buildWeakImportBundle({ transcriptBacked: true }),
    'merge',
    { disableLibraryBulkMigration: true }
  );
  const existingStrictCounters = existingStrictContext.__getProofCounters();
  assert(existingStrictResult.ok === true, 'existing transcript-backed evidence merge should use authorized writer and succeed');
  assert(existingStrictCounters.authorizedSqlCalls === 1, 'existing transcript-backed evidence should use authorized SQL writer');
  assert(existingStrictCounters.chatUpsertCalls === 0, 'existing transcript-backed evidence should not use unprivileged chatStore.upsert');
  assert(!existingStrictResult.chromeWeakRows || Number(existingStrictResult.chromeWeakRows.attempted || 0) === 0, 'existing transcript-backed evidence must not count as weak');
  assert((existingStrictResult.warnings || []).some((w) => w && w.kind === 'chrome-desktop-existing-chat-evidence-merged'),
    'existing transcript-backed evidence merge warning missing');

  const existingStrictFailContext = buildImportBundleContext({
    transcriptBacked: true,
    authorizedSqlFails: true,
    existingChat: {
      chatId: 'weak-row-private-chat-id',
      title: 'Existing Private Transcript Title',
      href: 'https://chatgpt.com/c/weak-row-private-chat-id',
      isSaved: false,
      isLinked: true,
      snapshotCount: 0,
      messageCount: 0,
      turnCount: 0,
      userTurnCount: 0,
      assistantTurnCount: 0,
      meta: {}
    }
  });
  vm.runInContext(source, existingStrictFailContext, { filename: importBundleFile });
  const existingStrictFailResult = await existingStrictFailContext.H2O.Studio.ingestion.importBundle(
    buildWeakImportBundle({ transcriptBacked: true }),
    'merge',
    { disableLibraryBulkMigration: true }
  );
  const existingStrictFailCounters = existingStrictFailContext.__getProofCounters();
  assert(existingStrictFailResult.ok === false, 'existing transcript-backed evidence merge must remain strict when authorized writer fails');
  assert(existingStrictFailCounters.authorizedSqlCalls === 1, 'existing transcript-backed failure should come from authorized SQL writer');
  assert(existingStrictFailCounters.chatUpsertCalls === 0, 'existing transcript-backed failure should not fall through to chatStore.upsert');
  assert(!existingStrictFailResult.chromeWeakRows || Number(existingStrictFailResult.chromeWeakRows.attempted || 0) === 0, 'failing transcript-backed evidence must not count as weak');
  assert((existingStrictFailResult.errors || []).some((e) => e && e.transcriptBacked === true),
    'existing transcript-backed strict failure diagnostic missing');
}

for (const file of [folderSyncFile, folderImportFile, autoImportFile, focusImportFile, importBundleFile, chatStoreFile, studioArchiveFile, studioSyncFile, chromeLiveBackgroundFile, chromeLiveLoaderFile, chromeLiveManifestFile, contractFile]) assertExists(file);

if (failures.length === 0) {
  assertContains(autoImportFile, 'direction: \'chrome-to-desktop\'', 'Chrome export direction result');
  assertContains(autoImportFile, 'transport: CHROME_FILE', 'Chrome export transport result');
  assertContains(autoImportFile, 'chromeWritesSyncFolder: true', 'Chrome export write marker');
  assertContains(autoImportFile, 'chrome-to-desktop-exported', 'Chrome export success status');
  assertContains(autoImportFile, 'chromeExportCoverage', 'Chrome export coverage diagnostic');
  assertContains(autoImportFile, 'function displayClass', 'display classification helper');
  assertContains(autoImportFile, 'view === \'link\' || view === \'linked\'', 'Link display rows are exported as linked rows');
  assertContains(autoImportFile, 'function hasRealTranscriptEvidence', 'real transcript evidence helper');
  assertContains(autoImportFile, 'function transcriptEvidenceFromLibraryRow', 'LibraryIndex transcript evidence export helper');
  assertContains(autoImportFile, 'messageCount: evidence.messageCount', 'message evidence carried into Chrome export');
  assertContains(autoImportFile, 'turnCount: evidence.turnCount', 'turn evidence carried into Chrome export');
  assertContains(autoImportFile, 'folderId: cleanString(row && (row.folderId || row.folder_id))', 'Chrome export carries per-chat folder binding');
  assertContains(autoImportFile, 'supportedRowsRepresented', 'coverage supported-row representation detail');
  assertContains(autoImportFile, 'addedMinimalRowTypeCounts', 'coverage minimal-row class detail');
  assertContains(folderImportFile, 'var LATEST_FILE = \'latest.json\'', 'Desktop import transport constant');
  assertContains(folderImportFile, 'var CHROME_LATEST_FILE = \'chrome-latest.json\'', 'Chrome export transport constant');
  assertContains(folderImportFile, 'function exportChromeToSyncFolder', 'direction-specific Chrome export API');
  assertContains(folderImportFile, 'function wantsChromeToDesktopExport', 'direction selector');
  assertContains(folderImportFile, 'autoImport.exportNow', 'folder API delegates to Chrome export');
  assertContains(folderImportFile, 'syncNowDirection: \'H2O.Studio.sync.folder.syncNow({ direction: "chrome-to-desktop" })\'', 'documented direction-specific syncNow');
  assertContains(folderImportFile, 'staleDesktopLatestJsonIgnored: true', 'stale Desktop latest.json cannot masquerade as Chrome export');
  assertContains(folderImportFile, 'exportChromeToSyncFolder: exportChromeToSyncFolder', 'public Chrome export API');
  assertContains(folderSyncFile, 'h2o.studio.sync.chrome-desktop-propagation.v1', 'propagation schema');
  assertContains(folderSyncFile, '0.1.0-f19.2.b', 'propagation version');
  assertContains(folderSyncFile, 'importChromeLatestBundle', 'bundle API');
  assertContains(folderSyncFile, 'importChromeLatestFromFile', 'file API');
  assertContains(folderSyncFile, 'importChromeLatestFromFolder', 'folder API');
  assertContains(folderSyncFile, 'var existingSync = H2O.Studio.sync', 'Desktop sync namespace merge');
  assertContains(folderSyncFile, 'var folderApi = Object.assign', 'Desktop sync.folder facade');
  assertContains(folderSyncFile, 'syncNow: folderSyncNow', 'Desktop folder syncNow facade');
  assertContains(folderSyncFile, 'importChromeFromSyncFolder: importChromeLatestFromFolder', 'Desktop folder Chrome import alias');
  assertContains(folderSyncFile, 'desktopReadsChromeLatestJson: true', 'Desktop chrome-latest read marker');
  assertContains(folderSyncFile, 'allowLibraryShimFallback: false', 'guarded import fallback disable');
  assertContains(folderSyncFile, 'skipExistingFolderMetadata: true', 'folder overwrite guard');
  assertContains(folderSyncFile, 'redactedErrorCategories', 'redacted import error categories');
  assertContains(folderSyncFile, 'folderMetadataFreshness', 'redacted folder metadata freshness summary');
  assertContains(folderSyncFile, 'staleMinimalRowErrorsAreCovered', 'covered stale minimal-row helper');
  assertContains(folderSyncFile, 'minimalRowsSatisfied', 'minimal row satisfied summary');
  assertContains(folderSyncFile, 'function collectPerChatFolderBindings', 'per-chat folder binding coverage helper');
  assertContains(folderSyncFile, 'nextOrg.folderId = org.folderId', 'Desktop supported bundle preserves folderId');
  assertContains(folderSyncFile, 'library-propagation-labels-deferred', 'label deferred taxonomy');
  assertContains(folderSyncFile, 'library-propagation-chat-folder-bindings-deferred', 'folder binding deferred taxonomy');
  assertContains(folderSyncFile, 'fileFingerprintChecked: true', 'file idempotency marker');
  assertContains(importBundleFile, 'shouldSkipExistingFolderMetadata', 'folder overwrite helper');
  assertContains(importBundleFile, 'function folderMetadataTimestampMs', 'folder metadata timestamp helper');
  assertContains(importBundleFile, 'shouldSkipExistingFolderMetadata(options, existing, row)', 'folder metadata freshness gate');
  assertContains(importBundleFile, 'freshness.skippedStale', 'stale folder metadata skip counter');
  assertContains(importBundleFile, 'freshness.refreshed', 'newer folder metadata refresh counter');
  assertContains(importBundleFile, 'updatedAt: incomingMs || (existing && existing.updatedAt)', 'folder metadata preserves source updatedAt');
  assertContains(importBundleFile, 'skipExistingFolderMetadata', 'folder overwrite option');
  assertContains(importBundleFile, 'prepareMinimalLibraryIndexPatch', 'minimal row import helper');
  assertContains(importBundleFile, 'prepareExistingChatEvidencePatch', 'existing chat evidence merge helper');
  assertContains(importBundleFile, 'chrome-desktop-existing-chat-evidence-merged', 'existing chat evidence merge warning');
  assertContains(importBundleFile, 'materializeMinimalLibraryIndexRow', 'minimal row materializer');
  assertContains(importBundleFile, 'authorizedBulkMigrationExecute', 'authorized minimal row SQL path');
  assertContains(importBundleFile, 'f15.bulk-migration', 'authorized bulk migration identity');
  assertContains(importBundleFile, 'chromeMinimalRows', 'minimal row importer summary');
  assertContains(importBundleFile, 'f19ChromeDesktopMaterializedShell', 'minimal row shell marker');
  assertContains(importBundleFile, 'numericCount(patch && patch.messageCount)', 'minimal row message evidence materialization');
  assertContains(importBundleFile, 'numericCount(patch && patch.snapshotCount)', 'minimal row snapshot evidence materialization');
  assertContains(importBundleFile, 'folderId: indexFolderId', 'Desktop chat import preserves folder id patch');
  assertContains(importBundleFile, 'var missingSnapshotPayload = indexHasTranscriptEvidence && !hasSnapshots', 'Desktop import detects transcript metadata without snapshot payload');
  assertContains(importBundleFile, 'function snapshotHasPayloadContent', 'Desktop import validates snapshot payload content');
  assertContains(importBundleFile, 'var payloadSnapshots = snapshotsSortedDesc.filter(snapshotHasPayloadContent)', 'Desktop import derives reader readiness from payload snapshots');
  assertContains(importBundleFile, "warn: 'snapshot payload missing for chat ' + chatId", 'Desktop import skips payloadless snapshot shells');
  assertContains(importBundleFile, 'messageCount: effectiveMessageCount', 'Desktop import preserves message count only when snapshot payload exists');
  assertContains(importBundleFile, 'turnCount: effectiveTurnCount', 'Desktop import preserves turn count only when snapshot payload exists');
  assertContains(importBundleFile, 'userTurnCount: effectiveUserTurnCount', 'Desktop import preserves user turn count only when snapshot payload exists');
  assertContains(importBundleFile, 'assistantTurnCount: effectiveAssistantTurnCount', 'Desktop import preserves assistant turn count only when snapshot payload exists');
  assertContains(importBundleFile, 'sourceMessageCount: indexMessageCount', 'Desktop import records source transcript counts when payload is missing');
  assertContains(importBundleFile, 'f19SnapshotPayloadMissing: missingSnapshotPayload', 'Desktop import marks metadata-only transcript rows as payload-missing');
  assertContains(importBundleFile, 'addBinding(org.folderId || org.folder_id', 'Desktop import binds per-chat folder organization');
  assertContains(importBundleFile, 'indexHasTranscriptEvidence', 'bundle chatIndex transcript evidence normalization');
  assertContains(autoImportFile, 'EXPORT_SNAPSHOT_PAYLOAD_MISSING', 'Chrome export snapshot payload missing blocker');
  assertContains(autoImportFile, 'EXPORT_SNAPSHOT_PAYLOAD_DOWNGRADED', 'Chrome export snapshot payload downgrade warning');
  assertContains(autoImportFile, 'function snapshotPayloadHasContent', 'Chrome export snapshot payload content guard');
  assertContains(autoImportFile, 'async function ensureSnapshotPayloadForProjectedChat', 'Chrome export hydrates snapshot payloads for projected LibraryIndex rows');
  assertContains(autoImportFile, "callArchive('loadSnapshot'", 'Chrome export loads snapshot payload by snapshotId');
  assertContains(autoImportFile, "callArchive('listSnapshots'", 'Chrome export can repair stale snapshot ids via archive index');
  assertContains(autoImportFile, 'function downgradeProjectedChatForMissingPayload', 'Chrome export downgrades stale snapshot metadata to placeholder rows');
  assertContains(autoImportFile, "readerKind: 'placeholder'", 'Chrome export avoids reader-ready rows when snapshot payload is missing');
  assertContains(autoImportFile, 'snapshotPayloadMissingCount', 'Chrome export coverage reports redacted missing snapshot payload count');
  assertContains(autoImportFile, 'snapshotPayloadDowngradedCount', 'Chrome export coverage reports metadata-only downgrades');
  assertContains(autoImportFile, 'missingSnapshotReasons', 'Chrome export coverage reports redacted missing snapshot reasons');
  assertContains(autoImportFile, 'missingSnapshotClasses', 'Chrome export coverage reports redacted missing snapshot classes');
  assertContains(autoImportFile, 'missingSnapshotDetails', 'Chrome export coverage reports redacted missing snapshot details');
  assertContains(autoImportFile, 'effectiveSnapshotSaved', 'Chrome export coverage accounts for downgraded saved rows');
  assertContains(autoImportFile, 'diagnoseSnapshotPayloadCoverage', 'Chrome export exposes latest snapshot payload coverage diagnostics');
  assertContains(autoImportFile, 'refreshNativeSnapshotPayloadsBeforeExport', 'Chrome export refreshes native snapshot payloads before coverage');
  assertContains(autoImportFile, 'nativeSnapshotPayloadRequestsFromRows', 'Chrome export requests native Save-to-Folder payloads before coverage');
  assertContains(autoImportFile, 'requestNativeSnapshotPayloads', 'Chrome export calls Studio native payload request API');
  assertContains(autoImportFile, 'nativeSnapshotPayloadPreflight', 'Chrome export reports native snapshot payload preflight diagnostics');
  assertContains(autoImportFile, 'requestListenerReached', 'Chrome export preflight reports whether native listener was reached');
  assertContains(autoImportFile, 'requestForwardedCount', 'Chrome export preflight reports native payload forwarding count');
  assertContains(autoImportFile, 'var aligned = await alignBundleToLibraryIndex(bundle)', 'Chrome export waits for snapshot payload hydration before writing chrome-latest');
  assertContains(autoImportFile, 'function buildUnindexedArchiveManifest', 'Chrome export builds redacted unindexed archive row manifest');
  assertContains(autoImportFile, "schema: 'h2o.studio.sync.chrome-export-unindexed-rows.v1'", 'Chrome export unindexed row manifest schema');
  assertContains(autoImportFile, 'unindexedArchiveRowCount', 'Chrome export coverage reports unindexed archive row count');
  assertContains(autoImportFile, 'unindexedRowManifestCount', 'Chrome export coverage reports unindexed row manifest length');
  assertContains(autoImportFile, 'unindexedRowReasonCounts', 'Chrome export coverage reports unindexed row reason counts');
  assertContains(autoImportFile, 'unindexedRows', 'Chrome export exposes redacted unindexed row manifest');
  assertContains(autoImportFile, "return 'archived'", 'Chrome export manifest supports archived reason');
  assertContains(autoImportFile, "return 'not-indexed'", 'Chrome export manifest supports not-indexed reason');
  assertContains(autoImportFile, "return 'unknown-unindexed'", 'Chrome export manifest supports unknown unindexed reason');
  assertNotContains(autoImportFile, 'droppedArchiveRowCount', 'legacy dropped archive row count field');
  assertContains(studioSyncFile, 'async function materializeNativeSnapshotPayloads', 'Studio materializes native Save-to-Folder payloads');
  assertContains(studioSyncFile, "await callArchive('importBundle'", 'Studio imports native snapshot payloads into archive backend');
  assertContains(studioSyncFile, 'verifyNativeSnapshotPayloadImports', 'Studio verifies native snapshot payload imports against loadSnapshot');
  assertContains(studioSyncFile, 'requestNativeSnapshotPayloads', 'Studio requests missing native snapshot payloads from native runtime');
  assertContains(studioSyncFile, 'snapshotPayloadRequestPayloadPresent', 'Studio external relay recognizes snapshot payload requests');
  assertContains(studioSyncFile, 'snapshotPayloadResponseCount', 'Studio reports native snapshot payload request response counts');
  assertContains(studioSyncFile, 'waitForNativeSnapshotPayloadMaterialization', 'Studio exposes awaitable native snapshot payload materialization');
  assertContains(studioSyncFile, "scope: 'native-save-to-folder-snapshot-payloads'", 'Studio tags native payload archive imports');
  assertContains(studioSyncFile, 'function redactNativeBroadcastPayload', 'Studio redacts native snapshot payload diagnostics');
  assertContains(studioSyncFile, 'nativeSnapshotPayloadMaterialize', 'Studio exposes native payload materialization diagnostics');
  assertContains(chromeLiveLoaderFile, 'function forwardNativeSnapshotPayloadsToStudioLauncher', 'Native content bridge forwards snapshot payloads to Studio Launcher');
  assertContains(chromeLiveLoaderFile, 'snapshotPayloadRequestIdsFromStudioBroadcast', 'Native content bridge tracks snapshot payload direct relay requests');
  assertContains(chromeLiveLoaderFile, 'request && request.snapshotId', 'Native content bridge direct relay matches snapshot IDs, not only opaque request IDs');
  assertContains(chromeLiveLoaderFile, 'request && request.chatId', 'Native content bridge direct relay matches chat IDs for latest snapshot fallback');
  assertContains(chromeLiveBackgroundFile, 'function handleExternalNativeSnapshotPayloadsMessage', 'Studio Launcher background receives native snapshot payloads');
  assertContains(chromeLiveBackgroundFile, 'MSG_NATIVE_SNAPSHOT_PAYLOADS', 'Background bridge has snapshot payload message type');
  assertContains(chromeLiveBackgroundFile, 'function folderCatalogRowTimestampMs', 'Chrome folder row timestamp helper');
  assertContains(chromeLiveBackgroundFile, 'function mergeFolderCatalogRowByFreshness', 'Chrome folder metadata freshness merge');
  assertContains(chromeLiveBackgroundFile, 'function folderStateMetadataMergeStats', 'Chrome folder metadata merge stats');
  assertContains(chromeLiveBackgroundFile, 'function comparableFolderStateData', 'Chrome folder state idempotent comparison');
  assertContains(chromeLiveBackgroundFile, 'function backgroundFolderMetadataOperationFallback', 'Native owner background has folder metadata operation fallback');
  assertContains(chromeLiveBackgroundFile, 'function previewCreateFolderMetadataOperationInBackground', 'Native owner background can preview create-folder without mutating');
  assertContains(chromeLiveBackgroundFile, 'function applyCreateFolderMetadataOperationInBackground', 'Native owner background can safely apply create-folder when page receiver is absent');
  assertContains(chromeLiveBackgroundFile, 'function previewRenameFolderMetadataOperationInBackground', 'Native owner background can preview rename-folder without mutating');
  assertContains(chromeLiveBackgroundFile, 'function applyRenameFolderMetadataOperationInBackground', 'Native owner background can safely apply rename-folder when page receiver is absent');
  assertContains(chromeLiveBackgroundFile, 'mode !== "preview" && mode !== "apply"', 'Background folder metadata fallback accepts only preview/apply request modes');
  assertContains(chromeLiveBackgroundFile, 'result.previewSource = "native-owner-background-storage-fallback"', 'Preview fallback remains read-only/background sourced');
  assertContains(chromeLiveBackgroundFile, 'result.applySource = "native-owner-background-storage-fallback"', 'Apply fallback reports background apply source');
  assertContains(chromeLiveBackgroundFile, 'operationType !== "create-folder"', 'Background folder metadata fallback is create-folder-only');
  assertContains(chromeLiveBackgroundFile, 'operationType !== "rename-folder"', 'Background folder metadata fallback is rename-folder-only besides create');
  assertContains(chromeLiveBackgroundFile, 'folder-not-found', 'Rename fallback validates target folder existence');
  assertContains(chromeLiveBackgroundFile, 'PROTECTED_CANONICAL_FOLDER_NAME_KEYS', 'Background create fallback rejects protected canonical duplicate names');
  assertContains(chromeLiveBackgroundFile, 'stale-guard-required', 'Background apply fallback requires the preview stale guard');
  assertContains(chromeLiveBackgroundFile, 'stale-source-hash', 'Background apply fallback rejects stale folder state');
  assertContains(chromeLiveBackgroundFile, 'stale-preview-hash', 'Background rename apply fallback rejects stale preview identity');
  assertContains(chromeLiveBackgroundFile, 'const source = "chrome-user-folder-create"', 'Chrome-created folders are stamped as user-created materialized folders');
  assertContains(chromeLiveBackgroundFile, 'materializedUserFolder: true', 'Chrome-created folders are materialized for normal display');
  assertContains(chromeLiveBackgroundFile, 'trustedFolderDisplay: true', 'Chrome-created folders are trusted for normal display');
  assertContains(chromeLiveBackgroundFile, 'shownInNormalMode: true', 'Chrome-created folders are visible in normal mode');
  assertContains(chromeLiveBackgroundFile, 'function forwardBackgroundFolderStateToStudioLauncher', 'Background apply fallback forwards folder state back to Studio Launcher');
  assertContains(chromeLiveBackgroundFile, 'native-owner-page-receiver-unavailable', 'Background fallback reports missing page receiver without raw relay errors');
  assertContains(chromeLiveBackgroundFile, 'background-preview-fallback', 'External native owner response exposes preview fallback status');
  assertContains(chromeLiveBackgroundFile, 'background-apply-fallback', 'External native owner response exposes apply fallback status');
  assertContains(chromeLiveBackgroundFile, 'background-rename-fallback', 'External native owner response exposes rename fallback status');
  assertContains(studioSyncFile, 'fallbackPreviewResultCount', 'Studio folder metadata diagnostics expose fallback preview result count');
  assertContains(studioSyncFile, 'applyFallbackStatus', 'Studio folder metadata diagnostics expose apply fallback status');
  assertContains(studioSyncFile, 'applyResultCount', 'Studio folder metadata diagnostics expose apply fallback result count');
  assertContains(studioSyncFile, 'renameFallbackStatus', 'Studio folder metadata diagnostics expose rename fallback status');
  assertContains(studioSyncFile, 'renameResultCount', 'Studio folder metadata diagnostics expose rename fallback result count');
  assertContains(studioSyncFile, 'folderStateForwardStatus', 'Studio folder metadata diagnostics expose apply folder-state forward status');
  assertContains(studioSyncFile, 'pageReceiverStatus', 'Studio folder metadata diagnostics expose native page receiver status');
  assertContains(studioSyncFile, 'listenerReached', 'Studio folder metadata diagnostics expose direct relay listener reachability');
  assertContains(chromeLiveManifestFile, 'STUDIO_LAUNCHER_EXTENSION_ID', 'Native extension manifest declares the Studio Launcher external sender id');
  assertContains(chromeLiveManifestFile, 'manifest.externally_connectable = { ids: [STUDIO_LAUNCHER_EXTENSION_ID] }', 'Native extension manifest allows Studio Launcher external snapshot payload requests');
  assertContains(importBundleFile, 'var turns = buildTurnsFromSnapshot(snap);', 'Desktop import materializes snapshot payload turns');
  assertContains(importBundleFile, 'await snapStore.create({', 'Desktop import writes snapshot payload to snapshot store');
  assertContains(importBundleFile, 'function shouldRepairExistingSnapshotPayload', 'Desktop import repairs existing payloadless snapshot rows');
  assertContains(importBundleFile, "result.warnings.push({ kind: 'snapshot-store-payload-repaired' })", 'Desktop import reports repaired snapshot payload rows');
  assertContains(importBundleFile, 'await snapStore.upsert({', 'Desktop import upserts repaired snapshot payloads into reader store');
  assertContains(studioArchiveFile, 'function loadDesktopStoreSnapshot', 'Desktop archive loader reads imported snapshot payloads from SQLite store');
  assertContains(studioArchiveFile, 'const desktop = await loadDesktopStoreSnapshot(snapshotId)', 'Desktop archive loadSnapshot uses SQLite store before legacy fallback');
  assertContains(studioArchiveFile, 'desktopStore.listByChat(chatId)', 'Desktop archive list/latest snapshot APIs use SQLite store');
  assertContains(importBundleFile, 'chrome-minimal-row-import', 'minimal row import error taxonomy');
  assertContains(importBundleFile, 'minimal-row-sql-writer-identity-missing', 'minimal row writer identity error taxonomy');
  assertContains(importBundleFile, 'minimal-row-sql-column-mismatch', 'minimal row column mismatch taxonomy');
  assertContains(importBundleFile, 'minimal-row-sql-execute-failed', 'minimal row SQL failure taxonomy');
  assertContains(importBundleFile, 'function deriveChatIdentity(chat)', 'Desktop import derives weak/minimal row identity before write');
  assertContains(importBundleFile, 'function extractChatIdFromUrl(value)', 'Desktop import derives chat identity from ChatGPT hrefs');
  assertContains(importBundleFile, 'function shouldSkipMinimalRowImportFailure(chat, patch, code)', 'Desktop import skips unrecoverable weak minimal rows');
  assertContains(importBundleFile, 'chrome-minimal-row-skipped-unrecoverable', 'Desktop import reports non-blocking unrecoverable minimal row skips');
  assertContains(importBundleFile, 'chatIdHash: redactedImportHash(chatId)', 'Desktop import redacts skipped minimal row identity');
  assertContains(folderSyncFile, 'minimalRowsSkipped', 'Desktop propagation redacted import summary exposes skipped minimal rows');
  assertContains(folderSyncFile, 'chatWriteDiagnostics', 'Desktop propagation redacted import summary exposes chat write diagnostics');
  assertContains(importBundleFile, 'function shouldTryWeakRowShellMaterialization(chat, patch, code)', 'Desktop import routes non-minimal weak rows through safe shell materialization');
  assertContains(importBundleFile, 'chrome-weak-row-materialized-via-shell-insert', 'Desktop import reports non-minimal weak row shell materialization');
  assertContains(importBundleFile, 'chrome-weak-row-skipped-unrecoverable', 'Desktop import skips unrecoverable non-minimal weak rows without blocking');
  assertContains(importBundleFile, 'transcriptBacked: patchHasRealTranscriptEvidence(patch)', 'Desktop import keeps transcript-backed row diagnostics strict');
  assertContains(folderSyncFile, 'weakRowsMaterialized', 'Desktop propagation redacted import summary exposes weak row materialization counts');
  assertContains(importBundleFile, 'function shouldPreemptWeakRowSqlWriter(chat, patch)', 'Desktop import classifies weak rows before store upsert SQL writer calls');
  assertContains(importBundleFile, 'chrome-weak-row-pre-upsert-diagnostic', 'Desktop import reports redacted pre-upsert weak row diagnostics');
  assertContains(importBundleFile, 'chrome-weak-row-skipped-before-store-upsert', 'Desktop import can skip unrecoverable weak rows before store upsert blocks');
  assertContains(importBundleFile, "phase: 'existing-evidence-upsert'", 'Desktop import can skip unrecoverable weak existing evidence merges');
  assertContains(importBundleFile, 'f19.chrome-desktop-existing-evidence', 'Desktop import uses authorized SQL writer for existing evidence merges');
  assertContains(importBundleFile, 'function safeImportChatUpsert', 'Desktop import centralizes chat upsert diagnostics and weak-row handling');
  assertContains(importBundleFile, 'existing-evidence-authorized-writer-unavailable', 'Desktop import does not fall through to unprivileged writer for transcript evidence');
  assertContains(importBundleFile, 'identityFieldNames: importPatchIdentityFieldNames(chat, patch)', 'Desktop import reports identity field names without raw values');
  assertContains(importBundleFile, 'function reconcileUnindexedRowsIntoArchivedBucket', 'Desktop import reconciles Chrome unindexed manifest into archived bucket');
  assertContains(importBundleFile, 'extractUnindexedRowManifest(bundle)', 'Desktop import reads Chrome unindexed manifest diagnostics');
  assertContains(importBundleFile, 'archiveExistingDesktopChat(chatStore, matched)', 'Desktop import archives only matched existing unindexed rows');
  assertContains(importBundleFile, "action: 'reconciled-archived'", 'Desktop import emits reconciled archived chatWriteDiagnostic');
  assertContains(importBundleFile, 'unindexedRowsReceived', 'Desktop import exposes unindexedRowsReceived');
  assertContains(importBundleFile, 'unindexedRowsMatched', 'Desktop import exposes unindexedRowsMatched');
  assertContains(importBundleFile, 'unindexedRowsArchived', 'Desktop import exposes unindexedRowsArchived');
  assertContains(importBundleFile, 'unindexedRowsMissing', 'Desktop import exposes unindexedRowsMissing');
  assertContains(importBundleFile, 'unindexedRowReasonCounts', 'Desktop import exposes unindexed reason counts');
  assertContains(folderSyncFile, 'sanitizeUnindexedManifestForChromeDesktop', 'Desktop folder sync preserves redacted unindexed manifest through supported bundle');
  assertContains(folderSyncFile, 'unindexedRowsArchived', 'Desktop propagation redacted import summary exposes archived reconciliation count');
  assertContains(chatStoreFile, 'function archiveExisting', 'Desktop chat store supports no-create archive update');
  assertContains(chatStoreFile, 'UPDATE chats SET is_archived = 1', 'Desktop chat store archives existing rows without delete');
  assertContains(focusImportFile, 'importChromeLatestFromFolder', 'focus importer guarded path');
  assertContains(contractFile, 'F19.2.b Minimal Chrome -> Desktop Scope', 'F19.2.b doc section');
  assertContains(contractFile, 'Premium Sync remains open', 'premium sync warning');
  assertNotContains(folderSyncFile, 'SKIP_STALENESS_CHECK', 'staleness bypass');
}

if (failures.length === 0) {
  await runVmProof();
  await runUnindexedArchiveReconciliationProof();
  await runImportBundleWeakRowProof();
}

if (failures.length) {
  console.error('F19 Chrome/Desktop propagation validation failed');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('F19 Chrome/Desktop propagation validation passed');
