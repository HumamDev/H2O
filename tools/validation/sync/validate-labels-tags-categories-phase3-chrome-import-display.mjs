#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import vm from "node:vm";
import { webcrypto } from "node:crypto";
import { TextEncoder } from "node:util";

const root = process.cwd();
const failures = [];

const folderImportFile = "src-surfaces-base/studio/sync/folder-import.mv3.js";
const diagnosticsFile = "src-surfaces-base/studio/sync/library/library-metadata-diagnostics.js";
const phase2ValidatorFile = "tools/validation/sync/validate-labels-tags-categories-phase2-desktop-export.mjs";
const evidenceFile = "release-evidence/2026-06-25/labels-tags-categories-phase3-chrome-import-display.md";

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

function exists(file) {
  return fs.existsSync(path.join(root, file));
}

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function assertContains(file, needle, label = needle) {
  assert(read(file).includes(needle), `${file}: missing ${label}`);
}

function assertNotContains(file, needle, label = needle) {
  assert(!read(file).includes(needle), `${file}: forbidden ${label}`);
}

function makeHash(seed) {
  return `${seed}`.padEnd(64, "0").slice(0, 64);
}

function makeBundle() {
  return {
    schema: "h2o.studio.fullBundle.v2",
    exportedAt: "2026-06-29T10:45:00.000Z",
    exportedFromSurface: "desktop-tauri",
    chatArchive: {
      schema: "h2o.chatArchive.bundle.v1",
      exportedAt: "2026-06-29T10:45:00.000Z",
      chats: [],
      catalogs: {
        categories: []
      }
    },
    summary: {
      chatCount: 0,
      snapshotCount: 0,
      turnCount: 0,
      categoryCount: 0,
      labelCount: 0,
      folderCount: 0
    },
    desktopCanonicalLibraryMetadata: {
      schema: "h2o.studio.library-metadata.desktop-canonical.v1",
      version: "0.1.0-phase2",
      phase: "phase2-desktop-canonical-export",
      source: {
        surface: "desktop-studio",
        platformAdapter: "tauri",
        authority: "desktop",
        projection: "desktop-canonical-library-metadata"
      },
      privacy: {
        redacted: true,
        hashOnly: true,
        rawChatIds: false,
        rawChatTitles: false,
        rawChatContent: false,
        rawLabelNames: false,
        rawTagNames: false,
        rawCategoryNames: false,
        rawColors: false,
        accountLinkedMetadata: false
      },
      counts: {
        labelCatalogCount: 2,
        tagCatalogCount: 1,
        categoryCatalogCount: 3,
        chatStoreRowCount: 5,
        chatLabelBindingCount: 4,
        chatTagBindingCount: 1,
        chatCategoryAssignmentCount: 3,
        classificationSignalCount: 3
      },
      hashes: {
        labels: makeHash("a1"),
        tags: makeHash("b2"),
        categories: makeHash("c3"),
        chatLabelBindings: makeHash("d4"),
        chatTagBindings: makeHash("e5"),
        chatCategoryAssignments: makeHash("f6"),
        projection: makeHash("99")
      },
      catalogs: {
        labels: [{
          subjectType: "library.catalog",
          catalogKind: "label",
          subjectHash: makeHash("11"),
          nameHash: makeHash("12"),
          colorHash: makeHash("13"),
          rawNameShouldBeDropped: "Secret Label Name"
        }],
        tags: [{
          subjectType: "library.catalog",
          catalogKind: "tag",
          subjectHash: makeHash("21"),
          nameHash: makeHash("22"),
          rawNameShouldBeDropped: "Secret Tag Name"
        }],
        categories: [{
          subjectType: "library.catalog",
          catalogKind: "category",
          subjectHash: makeHash("31"),
          nameHash: makeHash("32"),
          colorHash: makeHash("33"),
          rawNameShouldBeDropped: "Secret Category Name"
        }]
      },
      bindings: {
        chatLabels: [{
          subjectType: "library.binding",
          bindingKind: "chat-label",
          subjectHash: makeHash("41"),
          leftSubjectType: "chat.metadata",
          leftSubjectHash: makeHash("42"),
          rightSubjectType: "library.catalog.label",
          rightSubjectHash: makeHash("43"),
          rawChatIdShouldBeDropped: "secret-chat-id"
        }],
        chatTags: [{
          subjectType: "library.binding",
          bindingKind: "chat-tag",
          subjectHash: makeHash("51"),
          leftSubjectType: "chat.metadata",
          leftSubjectHash: makeHash("52"),
          rightSubjectType: "library.catalog.tag",
          rightSubjectHash: makeHash("53")
        }],
        chatCategories: [{
          subjectType: "library.binding",
          bindingKind: "chat-category",
          subjectHash: makeHash("61"),
          leftSubjectType: "chat.metadata",
          leftSubjectHash: makeHash("62"),
          rightSubjectType: "library.catalog.category",
          rightSubjectHash: makeHash("63")
        }]
      }
    }
  };
}

function makeContext() {
  const storage = Object.create(null);
  const archiveOps = [];
  const timers = [];
  const context = {
    console,
    Date,
    TextEncoder,
    Uint8Array,
    crypto: webcrypto,
    CustomEvent: class CustomEvent {
      constructor(type, init = {}) {
        this.type = type;
        this.detail = init.detail;
      }
    },
    dispatchEvent() {},
    addEventListener() {},
    removeEventListener() {},
    setTimeout(fn, delay) {
      timers.push({ fn, delay });
      return timers.length;
    },
    clearTimeout() {},
    document: { visibilityState: "visible", addEventListener() {} },
    H2O: {
      LibraryIndex: {
        getAll() { return []; },
        async refresh() { return true; }
      },
      Studio: {
        platform: {
          env: { adapter: "mv3", isTauri: false },
          messaging: null
        },
        sync: {
          libraryParity: {
            async captureSnapshot() {
              return {
                schema: "h2o.studio.sync.library-parity-snapshot.v1",
                surface: "chrome-studio",
                counts: {
                  total: 0,
                  saved: 0,
                  linked: 0,
                  pinned: 0,
                  archived: 0,
                  folders: 0,
                  categories: 0
                }
              };
            }
          }
        },
        store: {}
      }
    },
    chrome: {
      runtime: {
        id: "phase3-validator-extension",
        lastError: null,
        async sendMessage(message) {
          const op = message && message.req && message.req.op;
          archiveOps.push(op);
          if (op === "dryRunImportFullBundle") {
            return {
              ok: true,
              result: {
                ok: true,
                plan: {
                  chats: { incoming: 0, incomingSnapshots: 0, willImport: 0, willSkipDuplicates: 0 },
                  chromeStorageLocal: { incoming: 0, willImport: 0, deniedByPolicy: 0 },
                  libraryKv: { incoming: 0, willImport: 0, deniedByPolicy: 0 }
                }
              }
            };
          }
          if (op === "importFullBundle") {
            return {
              ok: true,
              result: {
                schema: "h2o.studio.fullBundle.v2",
                mode: "merge",
                chats: { importedChats: 0, importedSnapshots: 0 },
                chromeStorageLocal: { written: 0, skipped: 0, folderStateMergeStats: {} },
                libraryKv: { written: 0, skipped: 0 }
              }
            };
          }
          return { ok: false, error: `unexpected archive op ${op}` };
        }
      },
      storage: {
        local: {
          get(keys, callback) {
            const out = {};
            const list = Array.isArray(keys) ? keys : [keys];
            for (const key of list) {
              if (Object.prototype.hasOwnProperty.call(storage, key)) out[key] = storage[key];
            }
            callback(out);
          },
          set(items, callback) {
            Object.assign(storage, items || {});
            if (typeof callback === "function") callback();
          }
        }
      }
    },
    __storage: storage,
    __archiveOps: archiveOps
  };
  context.window = context;
  context.globalThis = context;
  return vm.createContext(context);
}

function assertNoRawLeak(value, label) {
  const text = JSON.stringify(value);
  for (const forbidden of [
    "Secret Label Name",
    "Secret Tag Name",
    "Secret Category Name",
    "secret-chat-id"
  ]) {
    assert(!text.includes(forbidden), `${label}: leaked ${forbidden}`);
  }
}

function assertNoSideEffectFlags(value, label) {
  const text = JSON.stringify(value);
  for (const forbidden of [
    "\"chromeAuthority\":true",
    "\"chromeRequestExport\":true",
    "\"desktopApply\":true",
    "\"canonicalMutation\":true",
    "\"noHardDelete\":false",
    "\"noPurge\":false",
    "\"noChatDelete\":false",
    "\"noSnapshotDelete\":false",
    "\"noAssetDelete\":false"
  ]) {
    assert(!text.includes(forbidden), `${label}: unsafe flag ${forbidden}`);
  }
}

async function runVmProof() {
  const context = makeContext();
  vm.runInContext(read(folderImportFile), context, { filename: folderImportFile });
  vm.runInContext(read(diagnosticsFile), context, { filename: diagnosticsFile });

  const folderApi = context.H2O.Studio.sync.folder;
  assert(folderApi, "Chrome folder import API missing");
  assert(typeof folderApi.importLatestBundle === "function", "importLatestBundle missing");
  assert(typeof folderApi.getDesktopCanonicalLibraryMetadata === "function", "metadata getter missing");
  assert(typeof folderApi.diagnoseDesktopCanonicalLibraryMetadata === "function", "metadata diagnostic missing");

  const result = await folderApi.importLatestBundle(makeBundle(), { reason: "phase3-validator" });
  assert(result.ok === true, "importLatestBundle should pass");
  assert(result.desktopCanonicalLibraryMetadataImport?.ok === true, "metadata import summary should pass");
  assert(result.desktopCanonicalLibraryMetadataImport?.sourceName === "desktopCanonicalLibraryMetadata", "source name mismatch");
  assert(result.desktopCanonicalLibraryMetadataImport?.readOnlyProjection === true, "read-only projection flag missing");
  assert(result.desktopCanonicalLibraryMetadataImport?.chromeAuthority === false, "Chrome authority must be false");
  assert(result.desktopCanonicalLibraryMetadataImport?.chromeRequestExport === false, "Chrome request export must be false");
  assert(result.desktopCanonicalLibraryMetadataImport?.desktopApply === false, "Desktop apply must be false");
  assert(result.desktopCanonicalLibraryMetadataImport?.canonicalMutation === false, "canonical mutation must be false");

  const folderState = context.__storage["h2o:prm:cgx:fldrs:state:data:v1"];
  assert(folderState?.desktopCanonicalLibraryMetadata, "metadata projection missing from Chrome mirror state");
  const mirror = folderState.desktopCanonicalLibraryMetadata;
  assert(mirror.schema === "h2o.studio.library-metadata.desktop-canonical.v1", "mirror schema mismatch");
  assert(mirror.available === true, "mirror availability missing");
  assert(mirror.counts.labelCatalogCount === 2, "label count mismatch");
  assert(mirror.counts.tagCatalogCount === 1, "tag count mismatch");
  assert(mirror.counts.categoryCatalogCount === 3, "category count mismatch");
  assert(mirror.counts.chatCategoryAssignmentCount === 3, "chat-category assignment count mismatch");
  assert(mirror.hashes.projection === makeHash("99"), "projection hash mismatch");
  assert(mirror.privacy.redacted === true, "redacted privacy flag missing");
  assert(mirror.privacy.hashOnly === true, "hash-only privacy flag missing");
  assert(mirror.readOnlyProjection === true, "mirror read-only flag missing");
  assert(mirror.desktopAuthority === true, "Desktop authority flag missing");
  assert(mirror.chromeAuthority === false, "Chrome authority must stay false");

  const getter = folderApi.getDesktopCanonicalLibraryMetadata();
  assert(getter?.hashes?.projection === makeHash("99"), "getter projection hash mismatch");
  const metadataDiag = folderApi.diagnoseDesktopCanonicalLibraryMetadata();
  assert(metadataDiag.ok === true, "metadata diagnostic should pass");
  assert(metadataDiag.displayMode === "hash-count-read-model", "display mode mismatch");
  assert(metadataDiag.labelCatalogCount === 2, "diagnostic label count mismatch");
  assert(metadataDiag.projectionHash === makeHash("99"), "diagnostic projection hash mismatch");

  const diag = await folderApi.diagnose();
  assert(diag.desktopCanonicalLibraryMetadataImport?.ok === true, "folder diagnose should include metadata import");
  assert(diag.desktopToChrome?.desktopCanonicalLibraryMetadataImport?.ok === true, "desktopToChrome diagnose should include metadata import");
  assert(diag.chromeDesktopExport?.transport === "chrome-latest.json", "Chrome export transport should remain chrome-latest.json");
  assert(diag.chromeDesktopExport?.writesLatestJson === false, "Chrome must not write latest.json");

  const metadataApi = context.H2O.Studio.sync.libraryMetadataDiagnostics;
  const snapshot = await metadataApi.captureSnapshot();
  assert(snapshot.surface === "chrome-studio", "metadata diagnostic surface mismatch");
  assert(snapshot.sourceAvailable === true, "Chrome source should be available from imported Desktop projection");
  assert(snapshot.desktopCanonicalLibraryMetadata?.available === true, "snapshot metadata projection missing");
  assert(snapshot.desktopCanonicalLibraryMetadata?.hashes?.projection === makeHash("99"), "snapshot projection hash mismatch");
  assert(snapshot.counts.desktopCanonicalMetadataLabelCount === 2, "snapshot label projection count mismatch");
  assert(snapshot.propagation.chromeRequestExportAdded === false, "metadata diagnostics must keep Chrome request export false");
  assert(snapshot.propagation.desktopApplyBehaviorAdded === false, "metadata diagnostics must keep Desktop apply false");
  assert(snapshot.propagation.chromeCanonicalMutationAllowed === false, "metadata diagnostics must keep Chrome canonical mutation false");

  assert(context.__archiveOps.includes("dryRunImportFullBundle"), "dry-run import should use existing path");
  assert(context.__archiveOps.includes("importFullBundle"), "merge import should use existing path");
  assertNoRawLeak(result, "import result");
  assertNoRawLeak(mirror, "mirror");
  assertNoRawLeak(getter, "getter");
  assertNoRawLeak(snapshot, "metadata snapshot");
  assertNoSideEffectFlags(result, "import result");
  assertNoSideEffectFlags(mirror, "mirror");
  assertNoSideEffectFlags(snapshot, "metadata snapshot");
}

for (const file of [folderImportFile, diagnosticsFile, phase2ValidatorFile]) {
  assert(exists(file), `${file}: missing`);
}

assertContains(folderImportFile, "DESKTOP_CANONICAL_LIBRARY_METADATA_SCHEMA", "metadata schema constant");
assertContains(folderImportFile, "desktopCanonicalLibraryMetadata", "metadata mirror field");
assertContains(folderImportFile, "getDesktopCanonicalLibraryMetadata", "metadata getter");
assertContains(folderImportFile, "diagnoseDesktopCanonicalLibraryMetadata", "metadata diagnostic");
assertContains(folderImportFile, "readOnlyProjection: true", "read-only projection flag");
assertContains(folderImportFile, "chromeRequestExport: false", "Chrome request export guard");
assertContains(folderImportFile, "desktopApply: false", "Desktop apply guard");
assertContains(diagnosticsFile, "desktopCanonicalLibraryMetadata", "metadata diagnostic snapshot field");
assertContains(diagnosticsFile, "library-metadata-diagnostics-desktop-canonical-projection-mismatch", "projection mismatch code");
assertNotContains(folderImportFile, "desktopCanonicalLibraryMetadataRequests", "metadata request export lane");
assertNotContains(folderImportFile, "applyDesktopCanonicalLibraryMetadata", "Desktop metadata apply lane");

if (failures.length === 0) await runVmProof();

if (failures.length) {
  console.error("FAIL validate-labels-tags-categories-phase3-chrome-import-display");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("PASS validate-labels-tags-categories-phase3-chrome-import-display");
