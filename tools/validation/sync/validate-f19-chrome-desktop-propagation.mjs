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

for (const file of [folderSyncFile, folderImportFile, autoImportFile, focusImportFile, importBundleFile, studioArchiveFile, studioSyncFile, chromeLiveBackgroundFile, chromeLiveLoaderFile, chromeLiveManifestFile, contractFile]) assertExists(file);

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
  assertContains(folderSyncFile, 'staleMinimalRowErrorsAreCovered', 'covered stale minimal-row helper');
  assertContains(folderSyncFile, 'minimalRowsSatisfied', 'minimal row satisfied summary');
  assertContains(folderSyncFile, 'function collectPerChatFolderBindings', 'per-chat folder binding coverage helper');
  assertContains(folderSyncFile, 'nextOrg.folderId = org.folderId', 'Desktop supported bundle preserves folderId');
  assertContains(folderSyncFile, 'library-propagation-labels-deferred', 'label deferred taxonomy');
  assertContains(folderSyncFile, 'library-propagation-chat-folder-bindings-deferred', 'folder binding deferred taxonomy');
  assertContains(folderSyncFile, 'fileFingerprintChecked: true', 'file idempotency marker');
  assertContains(importBundleFile, 'shouldSkipExistingFolderMetadata', 'folder overwrite helper');
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
  assertContains(importBundleFile, 'function shouldTryWeakRowShellMaterialization(chat, patch, code)', 'Desktop import routes non-minimal weak rows through safe shell materialization');
  assertContains(importBundleFile, 'chrome-weak-row-materialized-via-shell-insert', 'Desktop import reports non-minimal weak row shell materialization');
  assertContains(importBundleFile, 'chrome-weak-row-skipped-unrecoverable', 'Desktop import skips unrecoverable non-minimal weak rows without blocking');
  assertContains(importBundleFile, 'transcriptBacked: patchHasRealTranscriptEvidence(patch)', 'Desktop import keeps transcript-backed row diagnostics strict');
  assertContains(folderSyncFile, 'weakRowsMaterialized', 'Desktop propagation redacted import summary exposes weak row materialization counts');
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
