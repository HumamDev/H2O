#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';
import { TextDecoder, TextEncoder } from 'node:util';
import { webcrypto } from 'node:crypto';

const root = process.cwd();
const failures = [];

const contractFile = 'docs/systems/cross-platform/f19.4-chrome-desktop-sync-hardening-contract.md';
const desktopReceiverFile = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const chromeReceiverFile = 'src-surfaces-base/studio/sync/folder-import.mv3.js';
const studioFile = 'src-surfaces-base/studio/studio.js';
const libraryIndexFile = 'src-surfaces-base/studio/S0F1c. 🎬 Library Index - Studio.js';
const librarySyncFile = 'src-surfaces-base/studio/S0F1h. 🎬 Library Sync - Studio.js';

const propagationSchema = 'h2o.studio.sync.chrome-desktop-propagation.v1';

const hardeningCodes = [
  'sync-folder-missing',
  'permission-denied',
  'transport-file-missing',
  'transport-file-malformed',
  'transport-schema-unsupported',
  'transport-stale',
  'duplicate-import-idempotent',
  'local-newer-conflict',
  'simultaneous-update-conflict',
  'deferred-field-present',
  'unsupported-field-present',
  'source-metadata-missing',
  'parity-peer-snapshot-required'
];

const deferredCodes = [
  'library-propagation-labels-deferred',
  'library-propagation-tags-deferred',
  'library-propagation-projects-deferred',
  'library-propagation-chat-folder-bindings-deferred',
  'library-propagation-tombstones-deferred',
  'library-propagation-apply-events-deferred',
  'library-propagation-unsupported-storage-deferred'
];

const forbiddenNeedles = [
  'Private Chrome Title',
  'Private Desktop Title',
  'Private Folder',
  'Private Category',
  'Private Project',
  'Private message',
  'raw-chat-id',
  'raw-folder-id',
  'raw-category-id',
  'desktop-chat-id',
  'desktop-folder-id',
  'chat_id',
  'folder_id',
  'category_id',
  'chats.category_id'
];

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
    exportId: 'chrome-export-2',
    previousExportId: 'chrome-export-1',
    sourceSurfaceKind: 'chrome-studio',
    sourcePeerEnvelope: { peerIdHash: 'peer-hash' },
    chatArchive: {
      schema: 'h2o.chatArchive.bundle.v1',
      catalogs: {
        categories: [{ id: 'raw-category-id', name: 'Private Category' }],
        labels: [{ id: 'label-id', name: 'Private Label' }],
        tags: [{ id: 'tag-id', name: 'Private Tag' }]
      },
      chats: [
        {
          chatIndex: {
            id: 'raw-chat-id',
            title: 'Private Chrome Title',
            view: 'saved',
            organization: { categoryId: 'raw-category-id', labels: ['label-id'], tags: ['tag-id'] }
          },
          snapshots: [{ content: 'Private message' }]
        }
      ]
    },
    chromeStorageLocal: {
      'h2o:prm:cgx:fldrs:state:data:v1': {
        folders: [{ id: 'raw-folder-id', name: 'Private Folder' }],
        items: { 'raw-folder-id': ['raw-chat-id'] }
      },
      'unsupported-key': { value: 'private unsupported value' }
    },
    projects: [{ id: 'project-id', name: 'Private Project' }]
  };
}

function buildDesktopBundle() {
  return {
    schema: 'h2o.studio.fullBundle.v2',
    exportedAt: '2026-06-14T12:00:00.000Z',
    exportId: 'desktop-export-2',
    previousExportId: 'desktop-export-1',
    exportedFromSurface: 'desktop-tauri',
    sourcePeerEnvelope: { peerIdHash: 'desktop-peer-hash' },
    chatArchive: {
      schema: 'h2o.chatArchive.bundle.v1',
      catalogs: {
        categories: [{ id: 'desktop-category-id', name: 'Private Category' }],
        labels: [{ id: 'desktop-label-id', name: 'Private Label' }],
        tags: [{ id: 'desktop-tag-id', name: 'Private Tag' }]
      },
      chats: [
        {
          chatId: 'desktop-chat-id',
          chatIndex: {
            title: 'Private Desktop Title',
            state: { isSaved: true },
            organization: {
              categoryId: 'desktop-category-id',
              folderId: 'desktop-folder-id',
              folderName: 'Private Folder',
              labelIds: ['desktop-label-id'],
              tagIds: ['desktop-tag-id']
            }
          },
          snapshots: [{ messages: [{ text: 'Private message' }] }]
        }
      ]
    },
    chromeStorageLocal: {
      'h2o:prm:cgx:fldrs:state:data:v1': {
        folders: [{ id: 'desktop-folder-id', name: 'Private Folder' }],
        items: { 'desktop-folder-id': ['desktop-chat-id'] }
      },
      'unsupported-key': { value: 'private unsupported value' }
    },
    libraryKv: [{ key: 'labels', value: { 'desktop-chat-id': ['desktop-label-id'] } }],
    tombstones: [{ chatId: 'desktop-chat-id' }],
    syncApplyEvents: { total: 1 },
    projects: [{ id: 'desktop-project-id', name: 'Private Project' }]
  };
}

function checkNoForbidden(output, label) {
  const text = JSON.stringify(output);
  for (const needle of forbiddenNeedles) {
    assert(!text.includes(needle), `${label}: leaked forbidden value ${needle}`);
  }
}

function buildDesktopContext() {
  const imported = [];
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
              written: { chats: 1, snapshots: 1, categories: 1, folders: 1 },
              skipped: { chats: 0, snapshots: 0, categories: 0, folders: 0 },
              warnings: [],
              errors: []
            };
          }
        },
        sync: {}
      },
      LibraryIndex: {
        async refresh() { return { ok: true }; }
      }
    },
    chrome: {
      storage: makeStorage(),
      runtime: { lastError: null }
    },
    __TAURI_INTERNALS__: { invoke() { throw new Error('fs unavailable in VM'); } },
    __imported: imported
  };
  context.window = context;
  context.globalThis = context;
  return vm.createContext(context);
}

function buildChromeContext() {
  const archiveCalls = [];
  const context = {
    console,
    TextEncoder,
    crypto: webcrypto,
    Date,
    setTimeout(callback) {
      if (typeof callback === 'function') callback();
      return 1;
    },
    clearTimeout() {},
    addEventListener() {},
    removeEventListener() {},
    CustomEvent: class CustomEvent {
      constructor(type, init) {
        this.type = type;
        this.detail = init && init.detail;
      }
    },
    H2O: {
      Studio: {
        platform: {
          env: { adapter: 'mv3' },
          messaging: {
            async send(channel, message) {
              archiveCalls.push({ channel, message });
              const op = message?.req?.op;
              const payload = message?.req?.payload || {};
              if (op === 'dryRunImportFullBundle') {
                return {
                  ok: true,
                  result: {
                    ok: true,
                    schema: 'h2o.studio.fullBundle.v2',
                    plan: {
                      chats: { incoming: payload.bundle.chatArchive.chats.length, incomingSnapshots: 1, willImport: 1, willSkipDuplicates: 0 },
                      chromeStorageLocal: { incoming: Object.keys(payload.bundle.chromeStorageLocal || {}).length, willImport: 1, deniedByPolicy: 0 },
                      libraryKv: { incoming: 0, willImport: 0, deniedByPolicy: 0 }
                    }
                  }
                };
              }
              if (op === 'importFullBundle') {
                return {
                  ok: true,
                  result: {
                    schema: 'h2o.studio.fullBundle.v2',
                    mode: payload.mode,
                    chats: { importedChats: payload.bundle.chatArchive.chats.length, importedSnapshots: 1 },
                    chromeStorageLocal: { written: 1, skipped: 0 },
                    libraryKv: { written: 0, skipped: 0 }
                  }
                };
              }
              return { ok: false, error: `unexpected op ${op}` };
            }
          }
        },
        sync: {
          libraryParity: {
            async captureSnapshot() {
              return {
                schema: 'h2o.studio.sync.library-parity-snapshot.v1',
                surface: 'chrome-studio',
                hashes: { rows: 'hash-only' }
              };
            }
          }
        }
      },
      LibraryIndex: {
        async refresh() { return { ok: true }; },
        getAll() { return [{ id: 'row' }]; }
      }
    },
    chrome: {
      runtime: { id: 'chrome-extension-fixture', lastError: null },
      storage: makeStorage()
    },
    __archiveCalls: archiveCalls,
    dispatchEvent() {}
  };
  context.window = context;
  context.globalThis = context;
  return vm.createContext(context);
}

async function runVmProofs() {
  const desktopContext = buildDesktopContext();
  vm.runInContext(read(desktopReceiverFile), desktopContext, { filename: desktopReceiverFile });
  const desktopApi = desktopContext.H2O.Studio.sync;
  assert(desktopApi.chromeDesktopHardeningTaxonomy?.transportStale === 'transport-stale', 'Desktop hardening taxonomy marker missing');
  const desktopHealth = desktopApi.folder?.health?.diagnose?.();
  assert(desktopHealth?.schema === 'h2o.studio.sync.folder-health.v1', 'Desktop folder health schema missing');
  assert(desktopHealth?.surface === 'desktop-studio', 'Desktop folder health surface mismatch');
  assert(desktopHealth?.privacy?.redacted === true, 'Desktop folder health must be redacted');
  assert(desktopHealth?.deferred?.deleteTombstone === 'deferred', 'Desktop folder health delete/tombstone deferral missing');
  assert(desktopHealth?.deferred?.webdav === 'deferred', 'Desktop folder health WebDAV deferral missing');
  assert(typeof desktopApi.folder?.diagnoseHealth === 'function', 'Desktop folder diagnoseHealth API missing');
  assert(!desktopHealth?.statusCodes?.includes('scheduler-not-fired'), 'Desktop idle folder health must not report scheduler-not-fired');
  const desktopInvalid = await desktopApi.importChromeLatestBundle({ schema: 'unsupported' }, { proofMode: true });
  assert(desktopInvalid.ok === false, 'Desktop invalid schema should fail closed');
  assert(desktopInvalid.blockers.includes('transport-schema-unsupported'), 'Desktop invalid schema missing normalized blocker');
  const desktopResult = await desktopApi.importChromeLatestBundle(buildChromeBundle(), { proofMode: true });
  assert(desktopResult.schema === propagationSchema, 'Desktop propagation schema mismatch');
  assert(desktopResult.ok === true, 'Desktop Chrome->Desktop proof should pass');
  assert(desktopResult.warnings.includes('deferred-field-present'), 'Desktop deferred fields not explicit');
  assert(desktopResult.warnings.includes('unsupported-field-present'), 'Desktop unsupported fields not explicit');
  assert(desktopResult.hardening.deferredFieldsExplicit === true, 'Desktop hardening summary missing deferred flag');
  checkNoForbidden(desktopResult, 'Desktop propagation result');

  const chromeContext = buildChromeContext();
  vm.runInContext(read(chromeReceiverFile), chromeContext, { filename: chromeReceiverFile });
  const chromeApi = chromeContext.H2O.Studio.sync.folder;
  assert(chromeApi.desktopChromeHardeningTaxonomy?.transportStale === 'transport-stale', 'Chrome hardening taxonomy marker missing');
  const chromeHealth = chromeApi.health?.diagnose?.();
  assert(chromeHealth?.schema === 'h2o.studio.sync.folder-health.v1', 'Chrome folder health schema missing');
  assert(chromeHealth?.surface === 'chrome-studio', 'Chrome folder health surface mismatch');
  assert(chromeHealth?.privacy?.redacted === true, 'Chrome folder health must be redacted');
  assert(chromeHealth?.deferred?.deleteTombstone === 'deferred', 'Chrome folder health delete/tombstone deferral missing');
  assert(chromeHealth?.deferred?.webdav === 'deferred', 'Chrome folder health WebDAV deferral missing');
  assert(typeof chromeApi.diagnoseHealth === 'function', 'Chrome folder diagnoseHealth API missing');
  assert(!chromeHealth?.statusCodes?.includes('scheduler-not-fired'), 'Chrome idle folder health must not report scheduler-not-fired');
  const chromeInvalid = await chromeApi.importLatestBundle({ schema: 'unsupported' }, { proofMode: true });
  assert(chromeInvalid.ok === false, 'Chrome invalid schema should fail closed');
  assert(chromeInvalid.blockers.includes('transport-schema-unsupported'), 'Chrome invalid schema missing normalized blocker');
  const chromeResult = await chromeApi.importLatestBundle(buildDesktopBundle(), { fileFingerprint: 'sha256:fixture', proofMode: true });
  assert(chromeResult.schema === propagationSchema, 'Chrome propagation schema mismatch');
  assert(chromeResult.ok === true, 'Chrome Desktop->Chrome proof should pass');
  assert(chromeResult.warnings.includes('deferred-field-present'), 'Chrome deferred fields not explicit');
  assert(chromeResult.warnings.includes('unsupported-field-present'), 'Chrome unsupported fields not explicit');
  assert(chromeResult.hardening.deferredFieldsExplicit === true, 'Chrome hardening summary missing deferred flag');
  checkNoForbidden(chromeResult, 'Chrome propagation result');
}

function runStaticAssertions() {
  for (const file of [contractFile, desktopReceiverFile, chromeReceiverFile, studioFile, libraryIndexFile, librarySyncFile]) assertExists(file);
  for (const code of hardeningCodes) {
    assertContains(contractFile, code);
    assertContains(desktopReceiverFile, code);
    assertContains(chromeReceiverFile, code);
  }
  for (const code of deferredCodes) {
    assertContains(contractFile, code);
  }
  for (const needle of [
    'classifyIncomingChromeTransport',
    'FOLDER_SYNC_HEALTH_SCHEMA',
    'function diagnoseHealth()',
    'shouldReportDesktopSchedulerNotFired',
    "surface: 'desktop-studio'",
    "privacy: {",
    "redacted: true",
    "deleteTombstone: 'deferred'",
    "webdav: 'deferred'",
    "'permission-required'",
    'latestPropagationLedgerEntry',
    'bundleExportedAt',
    'previousExportId',
    'sequenceNumber',
    'exportId',
    'chrome-latest.json',
    'library-propagation-transport-stale',
    'library-propagation-simultaneous-update-conflict'
  ]) {
    assertContains(desktopReceiverFile, needle);
  }
  for (const needle of [
    'classifyIncomingDesktopTransport',
    'FOLDER_SYNC_HEALTH_SCHEMA',
    'function diagnoseHealth()',
    'shouldReportChromeSchedulerNotFired',
    "surface: 'chrome-studio'",
    "privacy: {",
    "redacted: true",
    "deleteTombstone: 'deferred'",
    "webdav: 'deferred'",
    "'permission-required'",
    "'no-op-refresh-suppressed'",
    'lastAppliedExportedAt',
    'sync-folder-latest-missing',
    'sync-folder-latest-malformed',
    'sync-folder-latest-schema-unsupported',
    'latest.json',
    'library-propagation-transport-stale',
    'library-propagation-simultaneous-update-conflict'
  ]) {
    assertContains(chromeReceiverFile, needle);
  }
  for (const needle of [
    'VM fixture imports remain privacy-safe',
    'Validator/proof mode must use VM fixtures',
    'F19.5 can close Premium Sync only after live Chrome and Desktop surfaces demonstrate'
  ]) {
    assertContains(contractFile, needle);
  }
  for (const needle of [
    'function rowsSignature(rows)',
    'function applyRowsIfChanged(nextRows, reason, source, refreshSources)',
    'refresh.skip-unchanged',
    'unchanged-row-signature',
    'dataHashBefore',
    'dataHashAfter',
    'skippedUpdateEvents',
    'updateEventCount10s',
    'if (!changed) return state.rows;',
    'emitUpdated(reason);'
  ]) {
    assertContains(libraryIndexFile, needle, `F19.7x no-op library refresh guard: ${needle}`);
  }
  for (const needle of [
    'parseHash().name === "read"',
    'state.rowsCacheInvalidatedWhileReading = true',
    'scheduleNativeMetaRefresh',
    'scheduleLibraryIndexWorkbenchRefresh',
    'subscribeLibraryIndexToWorkbenchCache',
    'refreshFromForeground'
  ]) {
    assertContains(studioFile, needle, `F19.7x reader remount guard: ${needle}`);
  }
  for (const needle of [
    'function nativeBroadcastSignature(payload)',
    'unchanged-native-broadcast-signature',
    'lastNativeBroadcastSkippedCount',
    'lastNativeBroadcastChanged',
    'native-broadcast.skip-unchanged'
  ]) {
    assertContains(librarySyncFile, needle, `F19.7x native broadcast no-op guard: ${needle}`);
  }
}

async function main() {
  runStaticAssertions();
  await runVmProofs();

  if (failures.length > 0) {
    console.error('[f19-sync-hardening] FAIL');
    for (const failure of failures) console.error(` - ${failure}`);
    process.exit(1);
  }
  console.log('[f19-sync-hardening] PASS');
  console.log(JSON.stringify({
    schema: 'h2o.studio.sync.chrome-desktop-hardening-validation.v1',
    ok: true,
    taxonomyCount: hardeningCodes.length,
    validatedDirections: ['chrome-to-desktop', 'desktop-to-chrome'],
    proofModeMutatesRealData: false,
    observedAtIso: new Date().toISOString()
  }, null, 2));
}

main().catch((error) => {
  console.error('[f19-sync-hardening] ERROR');
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
