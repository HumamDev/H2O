#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const repoRoot = process.cwd();
const projectionPath = path.join(repoRoot, "src-surfaces-base/studio/sync/library/library-metadata-export-projection.tauri.js");
const exportBundlePath = path.join(repoRoot, "src-surfaces-base/studio/ingestion/export-bundle.tauri.js");
const studioHtmlPath = path.join(repoRoot, "src-surfaces-base/studio/studio.html");
const packStudioPath = path.join(repoRoot, "tools/product/studio/pack-studio.mjs");

const projectionSource = fs.readFileSync(projectionPath, "utf8");
const exportBundleSource = fs.readFileSync(exportBundlePath, "utf8");
const studioHtmlSource = fs.readFileSync(studioHtmlPath, "utf8");
const packStudioSource = fs.readFileSync(packStudioPath, "utf8");

const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function makeMockContext() {
  const writes = [];
  const context = {
    console,
    TextEncoder,
    __TAURI__: { core: { invoke: () => { throw new Error("invoke must not be called"); } } },
    __TAURI_INTERNALS__: {},
    H2O: {
      Studio: {
        sync: {},
        store: {
          labels: {
            getAll: async () => [
              { labelId: "label-secret-alpha", name: "Secret Legal Label", color: "#ff00aa", source: "desktop-sqlite" },
            ],
            listChats: async (labelId) => labelId === "label-secret-alpha"
              ? [{ id: "chat-secret-one", title: "Private title must not leak", content: "Private body must not leak" }]
              : [],
          },
          tags: {
            getAll: async () => [
              { tagId: "tag-secret-beta", name: "Secret Tag", autoDerived: true, source: "desktop-sqlite" },
            ],
            listChats: async (tagId) => tagId === "tag-secret-beta"
              ? [{ id: "chat-secret-one", title: "Another private title" }]
              : [],
          },
          categories: {
            getAll: async () => [
              { categoryId: "category-secret-gamma", name: "Secret Category", color: "#00ffaa", source: "desktop-sqlite" },
            ],
          },
          chats: {
            getAll: async () => [
              { id: "chat-secret-one", title: "Private title must not leak", categoryId: "category-secret-gamma" },
              { id: "chat-secret-two", title: "Other private title", categoryId: "" },
            ],
          },
        },
      },
    },
    crypto: {
      subtle: {
        digest: async (_algorithm, bytes) => {
          let h1 = 0x811c9dc5;
          for (const byte of new Uint8Array(bytes)) {
            h1 ^= byte;
            h1 = Math.imul(h1, 0x01000193) >>> 0;
          }
          const out = new Uint8Array(32);
          out[0] = (h1 >>> 24) & 255;
          out[1] = (h1 >>> 16) & 255;
          out[2] = (h1 >>> 8) & 255;
          out[3] = h1 & 255;
          return out.buffer;
        },
      },
    },
    writes,
  };
  context.window = context;
  context.globalThis = context;
  return vm.createContext(context);
}

const context = makeMockContext();
vm.runInContext(projectionSource, context, { filename: projectionPath });

const api = context.H2O.Studio.sync.libraryMetadataExportProjection;
assert(api && api.__installed === true, "projection API should install on Tauri-like runtime");
assert(typeof api.buildDesktopCanonicalMetadataExport === "function", "buildDesktopCanonicalMetadataExport should be exposed");

const projection = await api.buildDesktopCanonicalMetadataExport({ requestedBy: "validator" });
const projectionJson = JSON.stringify(projection, null, 2);

assert(projection.schema === "h2o.studio.library-metadata.desktop-canonical.v1", "projection schema mismatch");
assert(projection.version === "0.1.0-phase2", "projection version mismatch");
assert(projection.phase === "phase2-desktop-canonical-export", "projection phase mismatch");
assert(projection.source.surface === "desktop-studio", "projection source surface mismatch");
assert(projection.source.authority === "desktop", "projection should declare Desktop authority");
assert(projection.privacy.redacted === true, "projection should be redacted");
assert(projection.privacy.hashOnly === true, "projection should be hash-only");
assert(projection.privacy.rawChatTitles === false, "raw chat titles must be disabled");
assert(projection.privacy.rawChatContent === false, "raw chat content must be disabled");
assert(projection.privacy.rawLabelNames === false, "raw label names must be disabled");
assert(projection.privacy.rawTagNames === false, "raw tag names must be disabled");
assert(projection.privacy.rawCategoryNames === false, "raw category names must be disabled");
assert(projection.privacy.rawColors === false, "raw colors must be disabled");
assert(projection.sideEffectSummary.readOnly === true, "projection should declare read-only behavior");
assert(projection.sideEffectSummary.sqliteWrites === false, "projection must not write SQLite");
assert(projection.sideEffectSummary.chromeStorageWrites === false, "projection must not write Chrome storage");
assert(projection.sideEffectSummary.importInvoked === false, "projection must not invoke import");
assert(projection.sideEffectSummary.exportInvoked === false, "projection must not invoke export");
assert(projection.sideEffectSummary.desktopApply === false, "projection must not add Desktop apply");
assert(projection.sideEffectSummary.chromeRequestExport === false, "projection must not add Chrome request export");
assert(projection.sideEffectSummary.canonicalMutation === false, "projection must not mutate canonical metadata");
assert(projection.sideEffectSummary.deletes === false, "projection must not delete");
assert(projection.safety.noHardDelete === true, "noHardDelete invariant missing");
assert(projection.safety.noPurge === true, "noPurge invariant missing");
assert(projection.safety.noChatDelete === true, "noChatDelete invariant missing");
assert(projection.safety.noSnapshotDelete === true, "noSnapshotDelete invariant missing");
assert(projection.safety.noAssetDelete === true, "noAssetDelete invariant missing");
assert(projection.counts.labelCatalogCount === 1, "label catalog count mismatch");
assert(projection.counts.tagCatalogCount === 1, "tag catalog count mismatch");
assert(projection.counts.categoryCatalogCount === 1, "category catalog count mismatch");
assert(projection.counts.chatStoreRowCount === 2, "chat store row count mismatch");
assert(projection.counts.chatLabelBindingCount === 1, "chat-label binding count mismatch");
assert(projection.counts.chatTagBindingCount === 1, "chat-tag binding count mismatch");
assert(projection.counts.chatCategoryAssignmentCount === 1, "chat-category assignment count mismatch");
assert(projection.counts.classificationSignalCount === 1, "classification signal count mismatch");
assert(Array.isArray(projection.catalogs.labels), "label catalogs should be an array");
assert(Array.isArray(projection.catalogs.tags), "tag catalogs should be an array");
assert(Array.isArray(projection.catalogs.categories), "category catalogs should be an array");
assert(Array.isArray(projection.bindings.chatLabels), "chat label bindings should be an array");
assert(Array.isArray(projection.bindings.chatTags), "chat tag bindings should be an array");
assert(Array.isArray(projection.bindings.chatCategories), "chat category bindings should be an array");
assert(typeof projection.hashes.projection === "string" && projection.hashes.projection.length > 0, "projection hash missing");
assert(projection.diagnostics.productSyncReady === false, "product sync should remain not ready");
assert(projection.diagnostics.phase2DesktopExportReady === true, "Phase 2 Desktop export should be ready");
assert(projection.diagnostics.chromeImportDisplayParityImplemented === false, "Chrome import/display parity must remain false");
assert(projection.diagnostics.chromeRequestExportImplemented === false, "Chrome request export must remain false");
assert(projection.diagnostics.desktopApplyImplemented === false, "Desktop apply must remain false");

for (const secret of [
  "label-secret-alpha",
  "tag-secret-beta",
  "category-secret-gamma",
  "chat-secret-one",
  "chat-secret-two",
  "Secret Legal Label",
  "Secret Tag",
  "Secret Category",
  "Private title must not leak",
  "Private body must not leak",
  "#ff00aa",
  "#00ffaa",
]) {
  assert(!projectionJson.includes(secret), `raw private value leaked: ${secret}`);
}

assert(exportBundleSource.includes("DESKTOP_CANONICAL_LIBRARY_METADATA_SCHEMA"), "export bundle should declare metadata schema constant");
assert(exportBundleSource.includes("buildDesktopCanonicalLibraryMetadataProjectionSafely"), "export bundle should include safe metadata projection hook");
assert(exportBundleSource.includes("desktopCanonicalLibraryMetadata"), "export bundle should include desktopCanonicalLibraryMetadata section");
assert(exportBundleSource.includes("libraryMetadataExport"), "latest export result should include compact metadata summary");
assert(studioHtmlSource.includes("sync/library/library-metadata-export-projection.tauri.js"), "studio.html loader missing metadata export projection");
assert(packStudioSource.includes("sync/library/library-metadata-export-projection.tauri.js"), "pack-studio source list missing metadata export projection");

const forbiddenProjectionCalls = [
  ".upsert(",
  ".saveNow(",
  ".bindChat(",
  ".unbindChat(",
  ".replaceForChat(",
  ".assignChat(",
  ".clearChat(",
  ".remove(",
  ".delete(",
  ".syncNow(",
  ".import",
  ".apply",
];
for (const call of forbiddenProjectionCalls) {
  assert(!projectionSource.includes(call), `projection source should not contain forbidden mutator call ${call}`);
}

if (failures.length) {
  console.error("FAIL validate-labels-tags-categories-phase2-desktop-export");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("PASS validate-labels-tags-categories-phase2-desktop-export");
console.log(JSON.stringify({
  schema: projection.schema,
  version: projection.version,
  phase: projection.phase,
  section: "desktopCanonicalLibraryMetadata",
  counts: projection.counts,
  privacy: projection.privacy,
  sideEffectSummary: projection.sideEffectSummary,
}, null, 2));
