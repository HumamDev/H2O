#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';
import { TextEncoder } from 'node:util';
import { webcrypto } from 'node:crypto';

const root = process.cwd();
const failures = [];

const folderImportFile = 'src-surfaces-base/studio/sync/folder-import.mv3.js';
const autoExportFile = 'src-surfaces-base/studio/sync/auto-export.tauri.js';
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

function buildDesktopBundle() {
  return {
    schema: 'h2o.studio.fullBundle.v2',
    exportedAt: '2026-06-14T12:00:00.000Z',
    exportId: 'desktop-export-fixture',
    sequenceNumber: 8,
    previousExportId: 'desktop-export-prev',
    contentSha256: 'desktop-hash-fixture',
    exportedFromSurface: 'desktop-tauri',
    sourcePeerEnvelope: { peerIdHash: 'desktop-peer-hash', installIdHash: 'desktop-install-hash' },
    chatArchive: {
      schema: 'h2o.chatArchive.bundle.v1',
      exportedAt: '2026-06-14T12:00:00.000Z',
      catalogs: {
        categories: [{ id: 'desktop-category-id', name: 'Private Desktop Category', color: '#654321' }],
        labels: [{ id: 'desktop-label-id', name: 'Private Desktop Label' }],
        tags: [{ id: 'desktop-tag-id', name: 'Private Desktop Tag' }]
      },
      chats: [
        {
          chatId: 'desktop-chat-id-1',
          chatIndex: {
            title: 'Private Desktop Saved Title',
            state: { isSaved: true, isPinned: true },
            organization: {
              categoryId: 'desktop-category-id',
              folderId: 'desktop-folder-id',
              folderName: 'Private Desktop Folder',
              labelIds: ['desktop-label-id'],
              tagIds: ['desktop-tag-id'],
              projectId: 'desktop-project-id'
            }
          },
          snapshots: [{ snapshotId: 'desktop-snapshot-id-1', messages: [{ text: 'Private desktop message' }] }]
        },
        {
          chatId: 'desktop-chat-id-2',
          chatIndex: {
            title: 'Private Desktop Linked Title',
            state: { isLinked: true },
            organization: {}
          },
          snapshots: []
        }
      ]
    },
    chromeStorageLocal: {
      'h2o:prm:cgx:fldrs:state:data:v1': {
        schemaVersion: 1,
        exportedFrom: 'desktop-studio',
        folders: [{ id: 'desktop-folder-id', name: 'Private Desktop Folder', color: '#abcdef' }],
        items: { 'desktop-folder-id': ['desktop-chat-id-1'] }
      },
      'unsupported-private-key': { value: 'private unsupported value' }
    },
    libraryKv: [{ key: 'h2o:prm:cgx:library:labels', value: { bindings: { 'desktop-chat-id-1': ['desktop-label-id'] } } }],
    tombstones: [{ id: 'desktop-tombstone-id', chatId: 'desktop-chat-id-3' }],
    syncApplyEvents: { total: 1, events: [{ chatId: 'desktop-chat-id-1' }] },
    projects: [{ id: 'desktop-project-id', name: 'Private Desktop Project' }]
  };
}

function buildContext() {
  const archiveCalls = [];
  const refreshReasons = [];
  const registryRecords = new Map();
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
              const op = message && message.req && message.req.op;
              const payload = message && message.req && message.req.payload;
              if (op === 'dryRunImportFullBundle') {
                return {
                  ok: true,
                  result: {
                    schema: 'h2o.studio.fullBundle.v2',
                    mode: 'dry-run',
                    plan: {
                      chats: { incoming: payload.bundle.chatArchive.chats.length, incomingSnapshots: 1, willImport: 2, willSkipDuplicates: 0 },
                      chromeStorageLocal: { incoming: Object.keys(payload.bundle.chromeStorageLocal).length, willImport: 1, deniedByPolicy: 0 },
                      libraryKv: { incoming: payload.bundle.libraryKv.length, willImport: 0, deniedByPolicy: 0 }
                    },
                    sample: {
                      newChatIds: ['should-not-leak']
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
        sync: {}
      },
      LibraryIndex: {
        async refresh(reason) {
          refreshReasons.push(reason);
          return { ok: true };
        },
        getAll() {
          return [{ id: 'row-1' }, { id: 'row-2' }];
        }
      }
    },
    chrome: {
      runtime: { id: 'chrome-extension-fixture', lastError: null },
      storage: makeStorage()
    },
    __archiveCalls: archiveCalls,
    __refreshReasons: refreshReasons,
    dispatchEvent() {}
  };
  context.H2O.ChatRegistry = {
    ready: Promise.resolve(),
    getRecord(chatId) {
      return registryRecords.get(String(chatId || '')) || null;
    },
    upsertRecord(record) {
      if (!record || !record.chatId) return null;
      const next = JSON.parse(JSON.stringify(record));
      registryRecords.set(String(record.chatId), next);
      return next;
    },
    listRecords() {
      return Array.from(registryRecords.values());
    }
  };
  context.H2O.Library = { ChatRegistry: context.H2O.ChatRegistry };
  context.__registryRecords = registryRecords;
  context.H2O.Studio.sync.libraryParity = {
    async captureSnapshot() {
      return {
        schema: 'h2o.studio.sync.library-parity-snapshot.v1',
        surface: 'chrome-studio',
        counts: { total: 2, saved: 1, linked: 1, pinned: 1, archived: 0, folders: 1, categories: 1 },
        fingerprints: { chats: 'hash-only-fixture' }
      };
    }
  };
  context.window = context;
  context.globalThis = context;
  return vm.createContext(context);
}

async function runVmProof() {
  const source = read(folderImportFile);
  const context = buildContext();
  vm.runInContext(source, context, { filename: folderImportFile });
  const api = context.H2O.Studio.sync.folder;

  assert(api, 'Chrome folder sync API missing');
  assert(api.desktopChromePropagationSchema === 'h2o.studio.sync.chrome-desktop-propagation.v1', 'propagation schema marker mismatch');
  assert(api.desktopChromePropagationVersion === '0.1.0-f19.2.c', 'propagation version marker mismatch');
  assert(typeof api.importLatestBundle === 'function', 'importLatestBundle missing');

  const result = await api.importLatestBundle(buildDesktopBundle(), { fileFingerprint: 'sha256:test-fixture' });
  assert(result.schema === 'h2o.studio.sync.chrome-desktop-propagation.v1', 'result schema mismatch');
  assert(result.version === '0.1.0-f19.2.c', 'result version mismatch');
  assert(result.direction === 'desktop-to-chrome', 'direction mismatch');
  assert(result.transport === 'latest.json', 'transport mismatch');
  assert(result.ok === true, 'propagation proof should pass');
  assert(result.status === 'imported', 'propagation status should be imported');
  assert(result.sourceSummary.chatCount === 2, 'source chat count mismatch');
  assert(result.sourceSummary.savedCount === 1, 'source saved count mismatch');
  assert(result.sourceSummary.linkedCount === 1, 'source linked count mismatch');
  assert(result.sourceSummary.pinnedCount === 1, 'source pinned count mismatch');
  assert(result.sourceSummary.shellRowCount === 1, 'source shell row count mismatch');
  assert(result.sourceSummary.linkedOnlyCount === 1, 'source linked-only shell count mismatch');
  assert(result.importSummary.shellRowsIncoming === 1, 'shell row incoming count mismatch');
  assert(result.importSummary.shellRowsMaterialized === 1, 'shell row materialized count mismatch');
  assert(result.importSummary.shellRowsFailed === 0, 'shell row failure count mismatch');
  assert(result.convergence && result.convergence.ok === true, 'desktop-to-chrome convergence should be proven');
  assert(Array.isArray(result.redactedErrorCategories), 'redacted error categories missing');
  assert(result.redactedErrorCategories.length === 0, 'redacted error categories should be empty on success');
  assert(result.supportedFields.includes('saved-chat-records'), 'saved chats not marked supported');
  assert(result.supportedFields.includes('linked-chat-records'), 'linked chats not marked supported');
  assert(result.supportedFields.includes('folder-metadata'), 'folder metadata not marked supported');
  assert(result.supportedFields.includes('category-metadata'), 'category metadata not marked supported');
  for (const code of [
    'library-propagation-labels-deferred',
    'library-propagation-tags-deferred',
    'library-propagation-projects-deferred',
    'library-propagation-chat-folder-bindings-deferred',
    'library-propagation-tombstones-deferred',
    'library-propagation-apply-events-deferred',
    'library-propagation-unsupported-storage-deferred'
  ]) {
    assert(result.warnings.includes(code), `result missing warning ${code}`);
  }
  assert(result.privacy.rawIdsReturned === false, 'raw ID privacy flag should remain false');
  assert(result.privacy.rawTitlesReturned === false, 'raw title privacy flag should remain false');
  assert(result.privacy.rawContentReturned === false, 'raw content privacy flag should remain false');
  assert(result.sideEffects.desktopSqliteWritten === false, 'Desktop SQLite should not be written by Chrome import');
  assert(result.sideEffects.nativeCalled === false, 'Native should not be called by propagation proof');
  assert(result.parity.snapshotCaptured === true, 'parity snapshot should be captured');
  assert(context.__registryRecords.has('desktop-chat-id-2'), 'Desktop shell row was not materialized into ChatRegistry');

  const approved = await api.importLatestBundle(buildDesktopBundle(), {
    fileFingerprint: 'sha256:test-fixture-approval',
    conflictDecision: 'approve-merge',
    conflictApproved: true,
    approvedConflictBlockers: ['library-propagation-simultaneous-update-conflict']
  });
  assert(approved.ok === true, 'operator-approved merge fixture should still pass');
  assert(approved.conflictDecision === 'approve-merge', 'approved merge conflictDecision missing');
  assert(approved.conflictApproved === true, 'approved merge conflictApproved missing');
  assert(approved.conflictApproval?.staleTransportStillBlocks === true, 'approved merge must preserve stale blocking');
  assert(approved.conflictApproval?.duplicateIdempotencyPreserved === true, 'approved merge must preserve duplicate idempotency');
  assert(approved.warnings.includes('library-propagation-simultaneous-conflict-approved'), 'approved merge warning missing');

  const importCall = context.__archiveCalls.find((entry) => entry.message.req.op === 'importFullBundle');
  assert(importCall, 'importFullBundle was not called');
  const payload = importCall.message.req.payload;
  assert(payload.mode === 'merge', 'import mode must be merge');
  assert(payload.bundle.chatArchive.chats.length === 2, 'chat count should be preserved');
  assert(payload.bundle.chatArchive.catalogs.categories.length === 1, 'category count should be preserved');
  assert(payload.bundle.chatArchive.catalogs.labels.length === 0, 'labels must be stripped');
  assert(payload.bundle.libraryKv.length === 0, 'libraryKv must be stripped');
  assert(Object.keys(payload.bundle.chromeStorageLocal).length === 1, 'unsupported chromeStorageLocal keys must be stripped');
  const folderState = payload.bundle.chromeStorageLocal['h2o:prm:cgx:fldrs:state:data:v1'];
  assert(folderState.folders.length === 1, 'folder metadata should be preserved');
  assert(Object.keys(folderState.items).length === 0, 'chat-folder bindings must be deferred');
  const org = payload.bundle.chatArchive.chats[0].chatIndex.organization;
  assert(org.categoryId === 'desktop-category-id', 'chat category binding should be preserved for importer');
  assert(!Object.prototype.hasOwnProperty.call(org, 'folderId'), 'folderId must be stripped from chat organization');
  assert(!Object.prototype.hasOwnProperty.call(org, 'folderName'), 'folderName must be stripped from chat organization');
  assert(!Object.prototype.hasOwnProperty.call(org, 'labelIds'), 'labels must be stripped from chat organization');
  assert(!Object.prototype.hasOwnProperty.call(org, 'tagIds'), 'tags must be stripped from chat organization');
  assert(!Object.prototype.hasOwnProperty.call(org, 'projectId'), 'project must be stripped from chat organization');
  assert(context.__refreshReasons.includes('desktop-chrome-propagation-import'), 'LibraryIndex refresh was not requested');

  const publicResult = JSON.stringify(result);
  for (const forbidden of [
    'desktop-chat-id-1',
    'desktop-snapshot-id-1',
    'desktop-folder-id',
    'desktop-category-id',
    'Private Desktop Saved Title',
    'Private desktop message',
    'Private Desktop Folder',
    'Private Desktop Label',
    'Private Desktop Category',
    'Private Desktop Project',
    'chat_id',
    'folder_id',
    'category_id',
    'should-not-leak'
  ]) {
    assert(!publicResult.includes(forbidden), `public result leaked ${forbidden}`);
  }
}

for (const file of [folderImportFile, autoExportFile, contractFile]) assertExists(file);

if (failures.length === 0) {
  assertContains(folderImportFile, 'h2o.studio.sync.chrome-desktop-propagation.v1', 'propagation schema');
  assertContains(folderImportFile, '0.1.0-f19.2.c', 'propagation version');
  assertContains(folderImportFile, 'importLatestBundle', 'bundle API');
  assertContains(folderImportFile, 'dryRunImportFullBundle', 'dry run archive API');
  assertContains(folderImportFile, 'importFullBundle', 'import archive API');
  assertContains(folderImportFile, "mode: 'merge'", 'merge import mode');
  assertContains(folderImportFile, 'library-propagation-labels-deferred', 'label deferred taxonomy');
  assertContains(folderImportFile, 'library-propagation-chat-folder-bindings-deferred', 'folder binding deferred taxonomy');
  assertContains(folderImportFile, 'library-propagation-tombstones-deferred', 'tombstone deferred taxonomy');
  assertContains(folderImportFile, 'library-propagation-apply-events-deferred', 'apply events deferred taxonomy');
  assertContains(folderImportFile, 'chromeStorageMayWriteSupportedRows', 'Chrome side-effect marker');
  assertContains(folderImportFile, 'desktop-shell-row-import-unsupported', 'Desktop shell row blocker');
  assertContains(folderImportFile, 'desktop-to-chrome-convergence-not-proven', 'Desktop to Chrome convergence blocker');
  assertContains(folderImportFile, 'conflictDecision', 'operator conflict decision');
  assertContains(folderImportFile, 'approve-merge', 'operator-approved merge decision');
  assertContains(folderImportFile, 'library-propagation-simultaneous-conflict-approved', 'operator-approved merge warning');
  assertContains(folderImportFile, 'redactedErrorCategories', 'redacted import error categories');
  assertContains(autoExportFile, 'exportLatestSyncBundle', 'Desktop latest.json exporter');
  assertContains(contractFile, 'F19.2.c Minimal Desktop -> Chrome Scope', 'F19.2.c doc section');
  assertContains(contractFile, 'Premium Sync remains open', 'premium sync warning');
  assertNotContains(folderImportFile, 'SKIP_STALENESS_CHECK', 'staleness bypass');
}

if (failures.length === 0) {
  await runVmProof();
}

if (failures.length) {
  console.error('F19 Desktop/Chrome propagation validation failed');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('F19 Desktop/Chrome propagation validation passed');
