#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import vm from "node:vm";
import { webcrypto } from "node:crypto";
import { TextEncoder } from "node:util";

const root = process.cwd();
const failures = [];

const folderSyncFile = "src-surfaces-base/studio/sync/folder-sync.tauri.js";
const exportBundleFile = "src-surfaces-base/studio/ingestion/export-bundle.tauri.js";
const chromeFolderImportFile = "src-surfaces-base/studio/sync/folder-import.mv3.js";
const chromeAutoImportFile = "src-surfaces-base/studio/sync/auto-import.mv3.js";
const evidenceFile = "release-evidence/2026-06-25/labels-tags-categories-phase7-desktop-apply-receipts.md";

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
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

function functionBody(source, name) {
  const match = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`).exec(source);
  const start = match ? match.index : -1;
  assert(start >= 0, `${name} missing`);
  if (start < 0) return "";
  const signatureEnd = source.indexOf(")", start);
  const open = source.indexOf("{", signatureEnd === -1 ? start : signatureEnd);
  assert(open >= 0, `${name} body missing`);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  assert(false, `${name} body parse failed`);
  return "";
}

function makeHash(seed) {
  return `${seed}`.padEnd(64, "0").slice(0, 64);
}

function makeRequest(action, overrides = {}) {
  const requestId = overrides.requestId || `library-metadata-mutation-request:${action}:phase7`;
  const metadataKind = overrides.metadataKind || (action.includes("category") ? "category" : "label");
  const subjectKind = overrides.subjectKind || (action === "chat-category-assign" ? "chat-category-assignment" : "catalog");
  const payload = {
    chatId: overrides.chatId || null,
    conversationId: overrides.chatId || null,
    entityId: overrides.categoryId || overrides.labelId || null,
    labelId: overrides.labelId || null,
    tagId: overrides.tagId || null,
    categoryId: overrides.categoryId || null,
    classificationId: overrides.classificationId || null,
    displayName: overrides.displayName || null
  };
  return {
    schema: "h2o.studio.library-metadata-mutation-request.v1",
    version: "0.1.0-phase6",
    phase: "phase6-chrome-request-export",
    requestId,
    reviewId: requestId,
    idempotencyKey: overrides.idempotencyKey || `${requestId}:idem:${overrides.expectedCurrentBasisHash || makeHash("b")}`,
    intent: "library-metadata-mutation-request",
    classification: "metadata-request",
    requestType: action,
    action,
    operation: action === "chat-category-assign" ? "assign" : "create",
    metadataKind,
    subjectKind,
    status: "pending",
    createdAt: "2026-06-29T00:00:00.000Z",
    requestedAt: "2026-06-29T00:00:00.000Z",
    requestedBy: "chrome-studio",
    source: "chrome-studio",
    sourceSurface: "chrome-studio",
    sourcePeerId: "chrome-studio",
    expectedCurrentBasisHash: overrides.expectedCurrentBasisHash || makeHash("b"),
    expectedCurrentBasis: { projectionHash: overrides.expectedCurrentBasisHash || makeHash("b") },
    payload,
    privacy: {
      rawChatContent: false,
      rawChatTitles: false,
      accountLinkedMetadata: false,
      displayNameIncluded: !!payload.displayName,
      displayNameSource: payload.displayName ? "explicit-user-entered-metadata" : ""
    },
    desktopApplyRequired: true,
    desktopApply: false,
    noLocalApply: true,
    noChromeCanonicalMutation: true,
    noDesktopCanonicalMutation: true,
    chromeAuthority: false,
    desktopAuthority: true,
    requestOnly: true,
    separateFromDesktopCanonicalLibraryMetadata: true,
    noHardDelete: true,
    noPurge: true,
    noChatDelete: true,
    noSnapshotDelete: true,
    noAssetDelete: true,
    noLabelDelete: true,
    noTagDelete: true,
    noCategoryDelete: true,
    noMetadataDelete: true,
    advisory: {
      productSyncReady: false,
      desktopApplyDeferred: true,
      chromeCanonicalMutationAllowed: false,
      destructiveMetadataActionsDeferred: true
    }
  };
}

function makeBundle(requests) {
  return {
    schema: "h2o.studio.fullBundle.v2",
    exportedAt: "2026-06-29T00:00:00.000Z",
    exportId: "phase7-validator-export",
    sequenceNumber: 7,
    contentSha256: makeHash("e"),
    sourceSyncPeerId: "chrome-studio",
    sourcePeerEnvelope: { source: "chrome-studio" },
    chatArchive: {
      schema: "h2o.chatArchive.bundle.v1",
      exportedAt: "2026-06-29T00:00:00.000Z",
      chats: [],
      catalogs: { categories: [], labels: [] }
    },
    libraryMetadataMutationRequests: requests
  };
}

function makeContext() {
  const storage = Object.create(null);
  const chatRows = {
    "chat-123": { id: "chat-123", categoryId: "cat-old" }
  };
  let assignCount = 0;
  const context = vm.createContext({
    console,
    Date,
    Math,
    TextEncoder,
    Uint8Array,
    crypto: { subtle: webcrypto.subtle },
    __TAURI_INTERNALS__: {},
    setTimeout() { return 1; },
    clearTimeout() {},
    setInterval() { return 1; },
    clearInterval() {},
    addEventListener() {},
    removeEventListener() {},
    document: {
      visibilityState: "visible",
      addEventListener() {},
      removeEventListener() {}
    },
    chrome: {
      runtime: { lastError: null },
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
    H2O: {
      LibraryIndex: {
        async refresh() { return { ok: true }; }
      },
      Studio: {
        ingestion: {
          async importBundle() {
            return { ok: true, written: {}, skipped: {}, warnings: [], errors: [] };
          }
        },
        store: {
          chats: {
            async get(chatId) {
              return chatRows[chatId] || null;
            }
          },
          categories: {
            async get(categoryId) {
              return categoryId === "cat-456" ? { categoryId: "cat-456", id: "cat-456" } : null;
            },
            async assignChat(categoryId, chatId) {
              assignCount += 1;
              if (!chatRows[chatId]) return false;
              chatRows[chatId].categoryId = categoryId;
              return true;
            }
          }
        },
        sync: {
          libraryMetadataExportProjection: {
            async buildDesktopCanonicalMetadataExport() {
              const assigned = chatRows["chat-123"].categoryId === "cat-456";
              return {
                schema: "h2o.studio.library-metadata.desktop-canonical.v1",
                version: "0.1.0-phase2",
                phase: "phase2-desktop-canonical-export",
                counts: {
                  labelCatalogCount: 16,
                  tagCatalogCount: 0,
                  categoryCatalogCount: 12,
                  chatStoreRowCount: 41,
                  chatCategoryAssignmentCount: assigned ? 28 : 27,
                  classificationSignalCount: assigned ? 28 : 27
                },
                hashes: { projection: assigned ? makeHash("c") : makeHash("b") },
                privacy: { redacted: true, hashOnly: true },
                safety: { noHardDelete: true, noPurge: true, noChatDelete: true }
              };
            }
          }
        }
      }
    },
    __storage: storage,
    __getAssignCount() {
      return assignCount;
    }
  });
  return context;
}

async function runVmProof() {
  const context = makeContext();
  vm.runInContext(read(folderSyncFile), context, { filename: folderSyncFile });
  const folderApi = context.H2O.Studio.sync.folder;
  assert(folderApi, "Desktop folder sync API missing");
  assert(typeof folderApi.importChromeLatestBundle === "function", "importChromeLatestBundle missing");
  assert(typeof folderApi.listLibraryMetadataMutationReceipts === "function", "receipt list helper missing");

  const applyRequest = makeRequest("chat-category-assign", {
    requestId: "library-metadata-mutation-request:phase7-assign",
    chatId: "chat-123",
    categoryId: "cat-456",
    expectedCurrentBasisHash: makeHash("b")
  });
  const first = await folderApi.importChromeLatestBundle(makeBundle([applyRequest]), { mode: "phase7-validator" });
  assert(first.ok === true, "first import should pass");
  assert(first.libraryMetadataMutationRequestImport?.requestCount === 1, "metadata request import count mismatch");
  assert(first.libraryMetadataMutationRequestAutoApply?.appliedCount === 1, "metadata request applied count mismatch");
  assert(first.libraryMetadataMutationRequestAutoApply?.receiptExportReadyCount === 1, "receipt ready count mismatch");
  assert(context.__getAssignCount() === 1, "category assignment should apply once");

  const receiptsAfterFirst = await folderApi.listLibraryMetadataMutationReceipts();
  assert(receiptsAfterFirst.some((receipt) => receipt.status === "applied" &&
    receipt.requestId === "library-metadata-mutation-request:phase7-assign"), "applied receipt missing");
  const appliedReceipt = receiptsAfterFirst.find((receipt) => receipt.status === "applied");
  assert(appliedReceipt?.schema === "h2o.studio.library-metadata-mutation-receipt.v1", "receipt schema mismatch");
  assert(appliedReceipt?.privacy?.redacted === true, "receipt privacy redaction missing");
  assert(appliedReceipt?.privacy?.hashOnly === true, "receipt hash-only flag missing");
  assert(appliedReceipt?.safety?.noCategoryDelete === true, "receipt noCategoryDelete missing");
  assert(appliedReceipt?.resultingCanonicalHash === makeHash("c"), "receipt resulting hash mismatch");

  const replay = await folderApi.importChromeLatestBundle(makeBundle([applyRequest]), { mode: "phase7-validator-replay" });
  assert(replay.ok === true, "duplicate import should pass");
  assert(replay.libraryMetadataMutationRequestAutoApply?.skippedDuplicateCount === 1, "duplicate replay should be skipped");
  assert(context.__getAssignCount() === 1, "duplicate replay must not apply again");

  const deferredRequest = makeRequest("label-create", {
    requestId: "library-metadata-mutation-request:phase7-label-create",
    labelId: "label-123",
    displayName: "User Label",
    metadataKind: "label",
    subjectKind: "catalog",
    expectedCurrentBasisHash: makeHash("c")
  });
  const deferred = await folderApi.importChromeLatestBundle(makeBundle([deferredRequest]), { mode: "phase7-validator-deferred" });
  assert(deferred.ok === true, "deferred import should pass");
  assert(deferred.libraryMetadataMutationRequestAutoApply?.deferredCount === 1, "label create should be deferred");
  const allReceipts = await folderApi.listLibraryMetadataMutationReceipts();
  assert(allReceipts.some((receipt) => receipt.status === "deferred" &&
    receipt.code === "library-metadata-mutation-request-action-deferred-phase7"), "deferred receipt missing");

  const mirror = context.__storage["h2o:studio:library-metadata-mutation-receipts:export:v1"];
  assert(mirror?.schema === "h2o.studio.library-metadata-mutation-receipt.export-mirror.v1",
    "receipt export mirror schema mismatch");
  const mirrorText = JSON.stringify(mirror);
  for (const forbidden of ["User Label", "Private chat title", "Private chat content"]) {
    assert(!mirrorText.includes(forbidden), `receipt mirror leaked ${forbidden}`);
  }
}

for (const file of [folderSyncFile, exportBundleFile, chromeFolderImportFile, chromeAutoImportFile, evidenceFile]) {
  assert(fs.existsSync(path.join(root, file)), `${file}: missing`);
}

const folderSync = read(folderSyncFile);
const exportBundle = read(exportBundleFile);
const chromeFolderImport = read(chromeFolderImportFile);
const chromeAutoImport = read(chromeAutoImportFile);
const evidence = read(evidenceFile);

const autoApplyBody = functionBody(folderSync, "autoApplyLibraryMetadataMutationRequestsFromChromeBundle");
const applyBody = functionBody(folderSync, "applyChatCategoryAssignLibraryMetadataRequest");
const validateBody = functionBody(folderSync, "validateLibraryMetadataMutationRequestForDesktopApply");
const receiptBody = functionBody(folderSync, "libraryMetadataMutationReceiptFromRequest");
const duplicateBody = functionBody(folderSync, "duplicateChromeLatestBundleHasRequestLanes");
const exportReceiptBody = functionBody(exportBundle, "buildLibraryMetadataMutationReceiptPayloadSafely");

[
  "var LIBRARY_METADATA_MUTATION_REQUEST_SCHEMA = 'h2o.studio.library-metadata-mutation-request.v1'",
  "var LIBRARY_METADATA_MUTATION_RECEIPT_SCHEMA = 'h2o.studio.library-metadata-mutation-receipt.v1'",
  "var LIBRARY_METADATA_MUTATION_RECEIPT_EXPORT_KEY = 'h2o:studio:library-metadata-mutation-receipts:export:v1'",
  "'library-metadata-mutation-requests'",
  "sanitizeLibraryMetadataMutationRequestsForChromeDesktop",
  "summarizeLibraryMetadataMutationRequestsFromChromeBundle",
  "autoApplyLibraryMetadataMutationRequestsFromChromeBundle",
  "libraryMetadataMutationRequestImport",
  "libraryMetadataMutationRequestAutoApply",
  "listLibraryMetadataMutationReceipts: listLibraryMetadataMutationReceipts",
  "libraryMetadataMutationReceiptSchema: LIBRARY_METADATA_MUTATION_RECEIPT_SCHEMA",
  "libraryMetadataMutationReceiptExportKey: LIBRARY_METADATA_MUTATION_RECEIPT_EXPORT_KEY"
].forEach((needle) => assertContains(folderSyncFile, needle));

[
  "APPLIED_LIBRARY_METADATA_MUTATION_REQUEST_ACTIONS[action] !== true",
  "library-metadata-mutation-request-action-deferred-phase7",
  "libraryMetadataMutationRequestDestructiveAction(action)",
  "library-metadata-mutation-request-destructive-action-deferred",
  "expectedHash && currentHash && expectedHash !== currentHash",
  "library-metadata-mutation-request-stale-basis",
  "request.noHardDelete !== true",
  "privacy.rawChatContent !== false",
  "sourceSurface) !== 'chrome-studio'"
].forEach((needle) => assert(validateBody.includes(needle), `validation missing ${needle}`));

[
  "categories.assignChat(categoryId, chatId)",
  "chats.get(chatId)",
  "categories.get(categoryId)",
  "library-metadata-mutation-request-chat-not-found",
  "library-metadata-mutation-request-category-not-found",
  "library-metadata-mutation-request-already-applied-canonical",
  "library-metadata-mutation-request-category-assign-failed"
].forEach((needle) => assert(applyBody.includes(needle), `apply body missing ${needle}`));

[
  "existingReceipts.find",
  "status) === 'applied'",
  "skipped_duplicate",
  "upsertLibraryMetadataMutationReceipts(receipts)",
  "receiptExportReadyCount",
  "productSyncReady: false",
  "noChromeCanonicalMutation: true",
  "noHardDelete: true",
  "noPurge: true",
  "noChatDelete: true",
  "noSnapshotDelete: true",
  "noAssetDelete: true",
  "noCategoryDelete: true",
  "noMetadataDelete: true"
].forEach((needle) => assert(autoApplyBody.includes(needle), `auto-apply body missing ${needle}`));

[
  "schema: LIBRARY_METADATA_MUTATION_RECEIPT_SCHEMA",
  "status: cleanStatus",
  "reviewedAt",
  "appliedAt",
  "resultingCanonicalHash",
  "redacted: true",
  "hashOnly: true",
  "rawChatIds: false",
  "rawChatTitles: false",
  "rawChatContent: false",
  "rawLabelNames: false",
  "rawTagNames: false",
  "rawCategoryNames: false",
  "accountLinkedMetadata: false",
  "displayNameIncluded: false",
  "displayNameReceiptRedacted: !!payload.displayName"
].forEach((needle) => assert(receiptBody.includes(needle), `receipt body missing ${needle}`));

assert(duplicateBody.includes("Array.isArray(bundle.libraryMetadataMutationRequests)"), "duplicate replay must include metadata requests");

[
  "libraryMetadataMutationReceipts: asArray(libraryMetadataMutationReceiptExport.receipts)",
  "libraryMetadataMutationReceipts: libraryMetadataMutationReceiptDiagnostics",
  "libraryMetadataMutationReceiptCount",
  "libraryMetadataMutationReceiptExport",
  "buildLibraryMetadataMutationReceiptPayloadSafely"
].forEach((needle) => assertContains(exportBundleFile, needle));

[
  "receipt.productSyncReady === false",
  "receipt.privacy.redacted === true",
  "receipt.privacy.hashOnly === true",
  "receipt.safety.desktopAuthority === true",
  "receipt.safety.chromeAuthority === false",
  "receipt.safety.noChromeCanonicalMutation === true",
  "receipt.safety.noCategoryDelete === true",
  "receipt.safety.noMetadataDelete === true"
].forEach((needle) => assert(exportReceiptBody.includes(needle), `receipt export guard missing ${needle}`));

// Chrome receipt import now lands in Phase 8 (folder-import.mv3.js); it is validated by
// validate-labels-tags-categories-phase8-chrome-receipt-import.mjs. The auto-import (Chrome->Desktop
// export) lane must still never read/import receipts — it remains request-export-only.
assertNotContains(chromeAutoImportFile, "libraryMetadataMutationReceipts", "Chrome receipt export/import must remain absent from the auto-import export lane");

[
  "Phase 7",
  "chat-category-assign",
  "libraryMetadataMutationReceipts[]",
  "h2o.studio.library-metadata-mutation-receipt.v1",
  "label-create",
  "tag-create",
  "category-create",
  "label-rename",
  "tag-rename",
  "category-rename",
  "chat-label-bind",
  "chat-tag-bind",
  "classification-set",
  "Product metadata sync: NOT READY"
].forEach((needle) => assert(evidence.includes(needle), `evidence missing ${needle}`));

await runVmProof();

if (failures.length) {
  console.error("Phase 7 labels/tags/categories Desktop apply + receipt validation failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Phase 7 labels/tags/categories Desktop apply + receipt validation passed.");
