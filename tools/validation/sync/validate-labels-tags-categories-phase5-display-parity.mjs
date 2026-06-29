#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import vm from "node:vm";
import { webcrypto } from "node:crypto";
import { TextEncoder } from "node:util";

const root = process.cwd();
const failures = [];

const diagnosticsFile = "src-surfaces-base/studio/sync/library/library-metadata-diagnostics.js";
const evidenceFile = "release-evidence/2026-06-25/labels-tags-categories-phase5-display-parity.md";

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

function assertNotContainsText(text, needle, label = needle) {
  assert(!text.includes(needle), `raw leak: ${label}`);
}

function makeHash(seed) {
  return `${seed}`.padEnd(64, "0").slice(0, 64);
}

function makeProjectionSummary() {
  return {
    schema: "h2o.studio.library-metadata.desktop-canonical.v1",
    version: "0.1.0-phase2",
    phase: "phase2-desktop-canonical-export",
    sourceName: "desktopCanonicalLibraryMetadata",
    displayMode: "hash-count-read-model",
    uiDisplayNamesAvailable: false,
    uiDisplayDeferred: true,
    counts: {
      labelCatalogCount: 16,
      tagCatalogCount: 0,
      categoryCatalogCount: 12,
      chatStoreRowCount: 41,
      chatLabelBindingCount: 0,
      chatTagBindingCount: 0,
      chatCategoryAssignmentCount: 28,
      classificationSignalCount: 28
    },
    hashes: {
      labels: makeHash("l"),
      tags: makeHash("t"),
      categories: makeHash("c"),
      chatCategoryAssignments: makeHash("a"),
      projection: makeHash("p")
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
    readOnlyProjection: true,
    desktopAuthority: true,
    chromeAuthority: false,
    secretChatIdShouldNeverAppear: "secret-chat-id",
    secretLabelNameShouldNeverAppear: "Secret Label",
    secretCategoryNameShouldNeverAppear: "Secret Category"
  };
}

function makeContext() {
  const projection = makeProjectionSummary();
  return vm.createContext({
    console,
    Date,
    TextEncoder,
    Uint8Array,
    crypto: webcrypto,
    H2O: {
      LibraryIndex: {
        getAll() {
          return [];
        }
      },
      Library: {},
      Studio: {
        platform: {
          env: { adapter: "mv3", isTauri: false }
        },
        sync: {
          folder: {
            async diagnose() {
              return {
                warnings: [],
                desktopCanonicalLibraryMetadataImport: {
                  ok: true,
                  sourceName: "desktopCanonicalLibraryMetadata"
                }
              };
            },
            async diagnoseDesktopCanonicalLibraryMetadata() {
              return projection;
            }
          }
        }
      }
    },
    chrome: {
      runtime: { id: "phase5-display-parity-validator" }
    }
  });
}

function assertNoSideEffects(model) {
  const sideEffects = model.sideEffectSummary || {};
  for (const field of [
    "productSyncWritesAdded",
    "storageWritten",
    "sqliteWritten",
    "chromeStorageWritten",
    "importInvoked",
    "exportInvoked",
    "syncNowInvoked",
    "applyExecuted",
    "desktopApplyExecuted",
    "chromeRequestExported",
    "canonicalMutationAttempted",
    "deleteExecuted",
    "purgeExecuted",
    "chatDeleted",
    "snapshotDeleted",
    "assetDeleted"
  ]) {
    assert(sideEffects[field] === false, `${field} must remain false`);
  }
}

async function runVmProof() {
  const context = makeContext();
  vm.runInContext(read(diagnosticsFile), context, { filename: diagnosticsFile });
  const api = context.H2O.Studio.sync.libraryMetadataDiagnostics;
  assert(api, "libraryMetadataDiagnostics API missing");
  assert(typeof api.captureDisplayParityModel === "function", "captureDisplayParityModel missing");
  assert(typeof api.buildDisplayParityModel === "function", "buildDisplayParityModel missing");
  assert(context.H2O.Studio.sync.captureLibraryMetadataDisplayParityModel === api.captureDisplayParityModel,
    "display parity alias mismatch");

  const model = await api.captureDisplayParityModel();
  assert(model.schema === "h2o.studio.sync.library-metadata-display-parity.v1", "display parity schema mismatch");
  assert(model.version === "0.1.0-phase5", "display parity version mismatch");
  assert(model.phase === "phase5-read-only-display-parity", "display parity phase mismatch");
  assert(model.ok === true, "display model should be ready");
  assert(model.status === "desktop-canonical-library-metadata-display-ready", "display status mismatch");
  assert(model.surface === "chrome-studio", "surface mismatch");
  assert(model.sourceName === "desktopCanonicalLibraryMetadata", "source name mismatch");
  assert(model.projectionSchema === "h2o.studio.library-metadata.desktop-canonical.v1", "projection schema mismatch");
  assert(model.projectionVersion === "0.1.0-phase2", "projection version mismatch");
  assert(model.projectionPhase === "phase2-desktop-canonical-export", "projection phase mismatch");
  assert(model.displayMode === "hash-count-read-model", "display mode mismatch");
  assert(model.displaySurface === "library-metadata-diagnostics-display-parity-model", "display surface mismatch");
  assert(model.uiDisplayNamesAvailable === false, "display names must remain unavailable");
  assert(model.uiDisplayDeferred === true, "display names should be deferred");
  assert(model.counts.labelCatalogCount === 16, "label count mismatch");
  assert(model.counts.tagCatalogCount === 0, "tag count mismatch");
  assert(model.counts.categoryCatalogCount === 12, "category count mismatch");
  assert(model.counts.chatCategoryAssignmentCount === 28, "chat-category count mismatch");
  assert(model.counts.classificationSignalCount === 28, "classification count mismatch");
  assert(model.projectionHash === makeHash("p"), "projection hash mismatch");
  assert(model.flags.desktopAuthority === true, "Desktop authority missing");
  assert(model.flags.chromeAuthority === false, "Chrome authority must be false");
  assert(model.flags.readOnlyProjection === true, "read-only projection missing");
  assert(model.flags.chromeRequestExport === false, "Chrome request export must be false");
  assert(model.flags.desktopApply === false, "Desktop apply must be false");
  assert(model.flags.canonicalMutation === false, "canonical mutation must be false");
  assert(model.flags.productSyncReady === false, "product sync readiness must remain false");
  assert(model.privacy.redacted === true, "redacted privacy flag missing");
  assert(model.privacy.hashOnly === true, "hash-only privacy flag missing");
  assert(model.privacy.rawChatIds === false, "raw chat IDs must be false");
  assert(model.privacy.rawLabelNames === false, "raw label names must be false");
  assert(model.privacy.rawCategoryNames === false, "raw category names must be false");
  assert(model.safety.noHardDelete === true, "noHardDelete missing");
  assert(model.safety.noPurge === true, "noPurge missing");
  assert(model.safety.noChatDelete === true, "noChatDelete missing");
  assert(model.safety.noSnapshotDelete === true, "noSnapshotDelete missing");
  assert(model.safety.noAssetDelete === true, "noAssetDelete missing");
  assertNoSideEffects(model);

  const text = JSON.stringify(model);
  for (const forbidden of [
    "secret-chat-id",
    "Secret Label",
    "Secret Category",
    "secretChatIdShouldNeverAppear",
    "secretLabelNameShouldNeverAppear",
    "secretCategoryNameShouldNeverAppear"
  ]) {
    assertNotContainsText(text, forbidden);
  }
}

assert(exists(diagnosticsFile), `${diagnosticsFile}: missing`);
assertContains(diagnosticsFile, "captureDisplayParityModel", "display parity API");
assertContains(diagnosticsFile, "h2o.studio.sync.library-metadata-display-parity.v1", "display parity schema");
assertContains(diagnosticsFile, "phase5-read-only-display-parity", "display parity phase");
assertContains(diagnosticsFile, "Desktop-origin metadata names and details are deferred", "deferred display note");
assertContains(diagnosticsFile, "chromeRequestExport: false", "Chrome request export guard");
assertContains(diagnosticsFile, "desktopApply: false", "Desktop apply guard");
assertContains(diagnosticsFile, "canonicalMutation: false", "canonical mutation guard");

if (exists(evidenceFile)) {
  assertContains(evidenceFile, "Path B", "Path B evidence");
  assertContains(evidenceFile, "library-metadata-diagnostics-display-parity-model", "display surface evidence");
}

if (failures.length === 0) await runVmProof();

if (failures.length) {
  console.error("FAIL validate-labels-tags-categories-phase5-display-parity");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("PASS validate-labels-tags-categories-phase5-display-parity");
