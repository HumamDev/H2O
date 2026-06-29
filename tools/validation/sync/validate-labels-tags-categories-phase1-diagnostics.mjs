#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { TextEncoder } from 'node:util';

const root = process.cwd();
const failures = [];

const moduleFile = 'src-surfaces-base/studio/sync/library/library-metadata-diagnostics.js';
const htmlFile = 'src-surfaces-base/studio/studio.html';
const packFile = 'tools/product/studio/pack-studio.mjs';
const auditFile = 'release-evidence/2026-06-25/labels-tags-categories-sync-audit-plan.md';

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
  assert(!text.includes(needle), `${file}: forbidden ${label}`);
}

function assertOrder(file, before, after) {
  const text = read(file);
  const a = text.indexOf(before);
  const b = text.indexOf(after);
  assert(a !== -1, `${file}: missing order source ${before}`);
  assert(b !== -1, `${file}: missing order target ${after}`);
  if (a !== -1 && b !== -1) assert(a < b, `${file}: ${before} must appear before ${after}`);
}

function makeRows(prefix, count) {
  return Array.from({ length: count }, (_, index) => ({
    chatId: `${prefix}-chat-${index + 1}`,
    snapshotId: `${prefix}-snapshot-${index + 1}`,
    title: `${prefix} Secret Private Title ${index + 1}`,
    view: index === count - 1 ? 'archived' : 'saved',
    labelIds: index < 2 ? [`${prefix}-label-a`] : [],
    labels: index < 2 ? [{ id: `${prefix}-label-a`, name: `${prefix} Secret Label` }] : [],
    tagIds: index === 0 ? [`${prefix}-tag-a`] : [],
    tags: index === 0 ? [{ id: `${prefix}-tag-a`, name: `${prefix} Secret Tag` }] : [],
    categoryId: index < 3 ? `${prefix}-category-a` : '',
    classification: index === 0 ? `${prefix}-secret-classification` : '',
    categoryCandidates: index === 1 ? [{ id: `${prefix}-category-candidate` }] : [],
    projectId: index === 0 ? `${prefix}-project-a` : '',
    updatedAt: 1000 + index
  }));
}

function makeStoreRows(kind, prefix, count) {
  return Array.from({ length: count }, (_, index) => {
    if (kind === 'labels') {
      return {
        labelId: `${prefix}-label-store-${index + 1}`,
        id: `${prefix}-label-store-${index + 1}`,
        name: `${prefix} Secret Label Store ${index + 1}`,
        color: '#112233',
        source: 'fixture'
      };
    }
    if (kind === 'tags') {
      return {
        tagId: `${prefix}-tag-store-${index + 1}`,
        id: `${prefix}-tag-store-${index + 1}`,
        name: `${prefix} Secret Tag Store ${index + 1}`,
        autoDerived: index === 0,
        source: 'fixture'
      };
    }
    return {
      categoryId: `${prefix}-category-store-${index + 1}`,
      id: `${prefix}-category-store-${index + 1}`,
      name: `${prefix} Secret Category Store ${index + 1}`,
      parentId: index === 1 ? `${prefix}-category-store-1` : '',
      source: 'fixture'
    };
  });
}

function makeStore(kind, rows) {
  return {
    __installed: true,
    __version: 'test',
    async getAll() { return rows; },
    async list() { return rows; },
    async count() { return rows.length; },
    diagnose() {
      return {
        installed: true,
        ready: true,
        schemaVersion: 'test',
        backend: 'sqlite',
        dbUrl: 'private-db-url-should-not-leak',
        tables: kind === 'categories' ? ['categories'] : [kind, `${kind.slice(0, -1)}_bindings`],
        writesSinceBoot: 0,
        warnings: [],
        errors: []
      };
    },
    create() {},
    upsert() {},
    patch() {},
    remove() {},
    delete() {},
    bindChat() {},
    unbindChat() {},
    replaceForChat() {},
    assignChat() {},
    clearChat() {}
  };
}

function buildContext(kind) {
  const isDesktop = kind === 'desktop';
  const prefix = isDesktop ? 'desktop' : 'chrome';
  const rows = makeRows(prefix, isDesktop ? 5 : 4);
  const labelRows = makeStoreRows('labels', prefix, isDesktop ? 3 : 1);
  const tagRows = makeStoreRows('tags', prefix, isDesktop ? 2 : 1);
  const categoryRows = makeStoreRows('categories', prefix, isDesktop ? 2 : 1);
  const chatRows = rows.map((row) => ({
    chatId: row.chatId,
    title: row.title,
    categoryId: row.categoryId,
    classification: row.classification
  }));
  const context = {
    console,
    Date,
    TextEncoder,
    Uint8Array,
    crypto: webcrypto,
    H2O: {
      Library: {
        LibraryIndexCore: {
          canonicalActiveRows(inputRows) {
            return inputRows.filter((row) => row.view !== 'archived' && row.view !== 'deleted');
          }
        }
      },
      LibraryIndex: {
        getAll() { return rows; },
        diagnose() { return { ready: true, source: `${prefix}-fixture` }; }
      },
      LibraryWorkspace: {
        async getLabels() { return labelRows; },
        async getTags() { return tagRows; },
        async getCategories() { return categoryRows; }
      },
      Studio: {
        platform: {
          env: {
            adapter: isDesktop ? 'tauri' : 'mv3',
            isTauri: isDesktop
          }
        },
        ingestion: isDesktop ? {
          exportLatestSyncBundle() {
            throw new Error('exportLatestSyncBundle must not be invoked');
          }
        } : {},
        sync: {
          libraryParity: { __installed: true },
          autoExport: isDesktop ? { __installed: true } : null,
          folder: {
            async diagnose() {
              return {
                warnings: [
                  'library-propagation-labels-deferred',
                  'library-propagation-tags-deferred',
                  'library-propagation-unsupported-storage-deferred'
                ],
                deferredFields: [
                  'library-propagation-labels-deferred',
                  'library-propagation-tags-deferred'
                ]
              };
            },
            syncNow() {
              throw new Error('syncNow must not be invoked');
            },
            importLatestBundle() {
              throw new Error('importLatestBundle must not be invoked');
            },
            exportChromeToSyncFolder() {
              throw new Error('exportChromeToSyncFolder must not be invoked');
            }
          }
        },
        store: {
          labels: makeStore('labels', labelRows),
          tags: makeStore('tags', tagRows),
          categories: makeStore('categories', categoryRows),
          chats: {
            __installed: true,
            async getAll() { return chatRows; },
            async list() { return chatRows; },
            async count() { return chatRows.length; },
            diagnose() {
              return {
                installed: true,
                ready: true,
                schemaVersion: 'test',
                backend: 'sqlite',
                dbUrl: 'private-chat-db-url-should-not-leak',
                table: 'chats',
                writesSinceBoot: 0,
                warnings: [],
                errors: []
              };
            },
            upsert() {},
            patch() {},
            remove() {},
            delete() {}
          }
        }
      },
      Desktop: isDesktop ? {
        Sync: {
          canonicalizeLibraryCatalog() {},
          canonicalizeLibraryBinding() {},
          diagnoseLibraryCatalog() {},
          diagnoseLibraryBinding() {},
          proveSQLiteWriterIdentitySentinel() {
            throw new Error('writer identity proof must not be invoked');
          },
          executeSettlementSqlite() {
            throw new Error('settlement SQL must not be invoked');
          },
          __libraryStoreCutoverShimsInstalled: true,
          __libraryStoreCutoverShimsVersion: '0.1.0-f15.8.f',
          __sqliteWriterIdentitySentinelInstalled: true,
          __sqliteWriterIdentitySentinelVersion: '0.2.0-f16.4.c',
          __f15CutoverAllowedWriterIdentities: [
            'f15.execute-settlement-writer',
            'f15.bulk-migration',
            'f15.debug-bypass',
            'f15.emergency-repair'
          ]
        }
      } : undefined
    },
    chrome: isDesktop ? undefined : { runtime: { id: 'chrome-extension-id' } },
    __TAURI_INTERNALS__: isDesktop ? { invoke() {} } : undefined
  };
  context.globalThis = context;
  return vm.createContext(context);
}

function assertNoRawLeak(value, label) {
  const text = JSON.stringify(value);
  for (const forbidden of [
    'Secret',
    'Private Title',
    'desktop-chat-1',
    'chrome-chat-1',
    'desktop-label-a',
    'chrome-label-a',
    'desktop-tag-a',
    'chrome-tag-a',
    'desktop-category-a',
    'chrome-category-a',
    'private-db-url-should-not-leak',
    'private-chat-db-url-should-not-leak'
  ]) {
    assert(!text.includes(forbidden), `${label}: leaked ${forbidden}`);
  }
}

function assertAllSideEffectsFalse(summary, label) {
  for (const [key, value] of Object.entries(summary || {})) {
    assert(value === false, `${label}: side effect flag ${key} should be false`);
  }
}

async function runVmProof() {
  const source = read(moduleFile);
  const chromeContext = buildContext('chrome');
  const desktopContext = buildContext('desktop');
  vm.runInContext(source, chromeContext, { filename: moduleFile });
  vm.runInContext(source, desktopContext, { filename: moduleFile });

  const chromeApi = chromeContext.H2O.Studio.sync.libraryMetadataDiagnostics;
  const desktopApi = desktopContext.H2O.Studio.sync.libraryMetadataDiagnostics;
  assert(chromeApi?.__installed === true, 'Chrome metadata diagnostic API marker missing');
  assert(desktopApi?.__installed === true, 'Desktop metadata diagnostic API marker missing');
  assert(chromeApi.version === '0.1.0-phase1', 'API version mismatch');
  assert(chromeApi.snapshotSchema === 'h2o.studio.sync.library-metadata-diagnostics-snapshot.v1', 'snapshot schema mismatch');
  assert(chromeApi.comparisonSchema === 'h2o.studio.sync.library-metadata-diagnostics-comparison.v1', 'comparison schema mismatch');
  assert(typeof chromeContext.H2O.Studio.sync.runLibraryMetadataDiagnostics === 'function', 'run alias missing');

  const deferredCodes = chromeApi.listDeferredWarningCodes();
  for (const code of [
    'library-propagation-labels-deferred',
    'library-propagation-tags-deferred',
    'library-propagation-unsupported-storage-deferred'
  ]) {
    assert(deferredCodes.includes(code), `deferred code missing: ${code}`);
  }

  const chromeSnapshot = await chromeApi.captureSnapshot();
  const desktopSnapshot = await desktopApi.captureSnapshot();
  assert(chromeSnapshot.surface === 'chrome-studio', 'Chrome snapshot surface mismatch');
  assert(desktopSnapshot.surface === 'desktop-studio', 'Desktop snapshot surface mismatch');
  assert(chromeSnapshot.phase === 'phase1-read-only-diagnostics', 'Chrome phase marker mismatch');
  assert(desktopSnapshot.phase === 'phase1-read-only-diagnostics', 'Desktop phase marker mismatch');
  assert(chromeSnapshot.counts.rowsWithLabels > 0, 'Chrome label row count missing');
  assert(chromeSnapshot.counts.rowsWithTags > 0, 'Chrome tag row count missing');
  assert(chromeSnapshot.counts.rowsWithCategories > 0, 'Chrome category row count missing');
  assert(chromeSnapshot.counts.rowsWithClassificationSignals > 0, 'Chrome classification count missing');
  assert(desktopSnapshot.stores.labels.rowCount === 3, 'Desktop label store count mismatch');
  assert(desktopSnapshot.stores.tags.rowCount === 2, 'Desktop tag store count mismatch');
  assert(desktopSnapshot.stores.categories.rowCount === 2, 'Desktop category store count mismatch');
  assert(desktopSnapshot.stores.chats.categoryAssignmentCount > 0, 'Desktop chat category cache count missing');
  assert(desktopSnapshot.f15.storeCutoverShimsInstalled === true, 'Desktop shim state missing');
  assert(desktopSnapshot.f15.sqliteWriterIdentitySentinelInstalled === true, 'Desktop sentinel state missing');
  assert(desktopSnapshot.f15.runtimeProofInvoked === false, 'runtime proof should not be invoked');
  assert(desktopSnapshot.propagation.metadataProductSyncWritesAdded === false, 'product sync writes must remain false');
  assert(desktopSnapshot.propagation.chromeCanonicalMutationAllowed === false, 'Chrome canonical mutation must remain false');
  assert(desktopSnapshot.propagation.productSyncReady === false, 'product sync must remain not ready');
  assert(desktopSnapshot.propagation.phase1DiagnosticsReady === true, 'diagnostics readiness missing');
  assert(desktopSnapshot.deferredWarnings.labelsDeferredObserved === true, 'labels deferred warning not observed');
  assert(desktopSnapshot.deferredWarnings.tagsDeferredObserved === true, 'tags deferred warning not observed');
  assert(desktopSnapshot.deferredWarnings.unsupportedStorageDeferredObserved === true, 'unsupported storage deferred warning not observed');
  assert(desktopSnapshot.privacy.hashOnly === true, 'hash-only privacy marker missing');
  assertAllSideEffectsFalse(desktopSnapshot.sideEffectSummary, 'desktop snapshot');
  assertAllSideEffectsFalse(chromeSnapshot.sideEffectSummary, 'chrome snapshot');
  assertNoRawLeak(desktopSnapshot, 'desktop snapshot');
  assertNoRawLeak(chromeSnapshot, 'chrome snapshot');

  const comparison = chromeApi.compareSnapshots(chromeSnapshot, desktopSnapshot);
  assert(comparison.schema === 'h2o.studio.sync.library-metadata-diagnostics-comparison.v1', 'comparison schema mismatch');
  assert(comparison.ok === false, 'comparison should detect fixture divergence');
  const mismatchCodes = new Set(comparison.mismatches.map((entry) => entry.code));
  for (const code of [
    'library-metadata-diagnostics-label-mismatch',
    'library-metadata-diagnostics-tag-mismatch',
    'library-metadata-diagnostics-category-mismatch',
    'library-metadata-diagnostics-classification-mismatch'
  ]) {
    assert(mismatchCodes.has(code), `comparison missing ${code}`);
  }
  assertNoRawLeak(comparison, 'comparison');
  assertAllSideEffectsFalse(comparison.sideEffectSummary, 'comparison');

  const clone = JSON.parse(JSON.stringify(chromeSnapshot));
  const match = chromeApi.compareSnapshots(chromeSnapshot, {
    ...clone,
    surface: 'desktop-studio',
    sourceType: 'desktop-metadata-read-model'
  });
  assert(match.ok === true, 'matching snapshots should pass');

  const localOnly = await chromeApi.runDiagnostic();
  assert(localOnly.ok === false, 'local-only diagnostic should not pass');
  assert(localOnly.blockers.includes('library-metadata-diagnostics-peer-snapshot-required'), 'peer-required blocker missing');
  assertAllSideEffectsFalse(localOnly.sideEffectSummary, 'local-only diagnostic');
}

for (const file of [moduleFile, htmlFile, packFile, auditFile]) assertExists(file);

if (failures.length === 0) {
  assertContains(auditFile, 'Implement Phase 1 only', 'Phase 1 recommendation');
  assertContains(moduleFile, 'No product sync writes', 'no product sync writes safety text');
  assertContains(moduleFile, 'No import/export/sync/apply method is invoked', 'no sync method invocation safety text');
  assertContains(moduleFile, 'library-propagation-labels-deferred', 'labels deferred taxonomy');
  assertContains(moduleFile, 'library-propagation-tags-deferred', 'tags deferred taxonomy');
  assertContains(moduleFile, 'library-propagation-unsupported-storage-deferred', 'unsupported storage deferred taxonomy');
  assertContains(moduleFile, 'metadataProductSyncWritesAdded: false', 'product sync write guard');
  assertContains(moduleFile, 'chromeCanonicalMutationAllowed: false', 'Chrome mutation guard');
  assertContains(moduleFile, 'rawLabelNamesReturned: false', 'label privacy marker');
  assertContains(moduleFile, 'rawTagNamesReturned: false', 'tag privacy marker');
  assertContains(moduleFile, 'rawCategoryNamesReturned: false', 'category privacy marker');
  assertContains(htmlFile, './sync/library/library-metadata-diagnostics.js', 'studio loader');
  assertContains(packFile, 'sync/library/library-metadata-diagnostics.js', 'pack loader');
  assertOrder(htmlFile, './sync/library/library-chrome-desktop-parity-diagnostic.js', './sync/library/library-metadata-diagnostics.js');
  assertOrder(htmlFile, './sync/library/library-metadata-diagnostics.js', './sync/library/library-sync-operator-ui.tauri.js');
  assertOrder(packFile, '"sync/library/library-chrome-desktop-parity-diagnostic.js"', '"sync/library/library-metadata-diagnostics.js"');
  assertOrder(packFile, '"sync/library/library-metadata-diagnostics.js"', '"sync/library/library-sync-operator-ui.tauri.js"');

  for (const forbidden of [
    '.syncNow(',
    '.importLatestBundle(',
    '.exportLatestSyncBundle(',
    '.exportChromeToSyncFolder(',
    '.executeSettlementSqlite(',
    '.executeAuthorizedSqlite(',
    '.withSQLiteWriterIdentity(',
    'chrome.storage.local.set',
    'localStorage.setItem',
    'indexedDB.open',
    'DELETE FROM',
    'UPDATE labels',
    'UPDATE tags',
    'UPDATE categories',
    'UPDATE chats',
    'INSERT INTO labels',
    'INSERT INTO tags',
    'INSERT INTO categories'
  ]) {
    assertNotContains(moduleFile, forbidden, forbidden);
  }
}

if (failures.length === 0) {
  await runVmProof();
}

if (failures.length) {
  console.error('Labels/tags/categories Phase 1 diagnostics validation failed');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Labels/tags/categories Phase 1 diagnostics validation passed');
