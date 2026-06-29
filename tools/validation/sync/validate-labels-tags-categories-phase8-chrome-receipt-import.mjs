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
const folderSyncFile = "src-surfaces-base/studio/sync/folder-sync.tauri.js";
const exportBundleFile = "src-surfaces-base/studio/ingestion/export-bundle.tauri.js";
const evidenceFile = "release-evidence/2026-06-25/labels-tags-categories-phase8-chrome-receipt-import.md";

const RECEIPT_SCHEMA = "h2o.studio.library-metadata-mutation-receipt.v1";
const IMPORT_KEY = "h2o:studio:library-metadata-mutation-receipts:chrome-imported:v1";
const IMPORT_MIRROR_SCHEMA = "h2o.studio.library-metadata-mutation-receipt.chrome-imported-mirror.v1";
const REQUEST_EXPORT_KEY = "h2o:studio:library-metadata-mutation-requests:pending-export:v1";

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
  assert(!text.includes(needle), `forbidden ${label}`);
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

function makeContext() {
  const storage = Object.create(null);
  const context = vm.createContext({
    console,
    Date,
    Math,
    TextEncoder,
    Uint8Array,
    crypto: {
      subtle: webcrypto.subtle,
      randomUUID() {
        return `00000000-0000-4000-8000-${Math.floor(Math.random() * 1e12).toString().padStart(12, "0")}`;
      }
    },
    setTimeout() { return 1; },
    clearTimeout() {},
    addEventListener() {},
    removeEventListener() {},
    document: {
      visibilityState: "visible",
      addEventListener() {},
      removeEventListener() {}
    },
    H2O: { Studio: { sync: {} } },
    chrome: {
      runtime: {
        id: "phase8-metadata-receipt-validator",
        lastError: null,
        sendMessage(_message, callback) {
          if (typeof callback === "function") callback({ ok: true, result: {} });
          return Promise.resolve({ ok: true, result: {} });
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
    __storage: storage
  });
  return context;
}

// Build a Desktop-issued receipt that satisfies the Phase 7 export trust contract.
function makeDesktopReceipt(requestId, idempotencyKey, status, overrides = {}) {
  const base = {
    schema: RECEIPT_SCHEMA,
    version: "0.1.0-phase7",
    phase: "phase7-desktop-apply-receipts",
    receiptId: `library-metadata-mutation-receipt:${requestId}:${status}`,
    requestId,
    reviewId: requestId,
    idempotencyKey,
    requestAction: "chat-category-assign",
    requestType: "chat-category-assign",
    metadataKind: "category",
    subjectKind: "chat-category-assignment",
    status,
    reason: status,
    code: status,
    reviewedAt: "2026-06-29T12:00:00.000Z",
    appliedAt: status === "applied" ? "2026-06-29T12:00:00.000Z" : null,
    source: { surface: "desktop-studio", platformAdapter: "tauri", authority: "desktop", requestedBy: "phase7-desktop-apply-receipts" },
    requestSource: { surface: "chrome-studio", peerId: "chrome-studio" },
    target: { chatIdHash: makeHash("chat"), entityIdHash: makeHash("entity"), metadataKind: "category" },
    expectedCurrentBasisHash: makeHash("b"),
    beforeProjectionHash: makeHash("before"),
    resultingCanonicalHash: makeHash("after"),
    beforeAssignmentHash: makeHash("ba"),
    afterAssignmentHash: makeHash("aa"),
    counts: {},
    privacy: {
      redacted: true, hashOnly: true, rawChatIds: false, rawChatTitles: false, rawChatContent: false,
      rawLabelNames: false, rawTagNames: false, rawCategoryNames: false, rawColors: false, accountLinkedMetadata: false,
      displayNameIncluded: false, displayNameReceiptRedacted: false
    },
    safety: {
      desktopAuthority: true, chromeAuthority: false, requestOnly: false, chromeCanonicalMutation: false,
      noChromeCanonicalMutation: true, noDesktopCanonicalMutationFromChrome: true,
      noHardDelete: true, noPurge: true, noChatDelete: true, noSnapshotDelete: true, noAssetDelete: true,
      noLabelDelete: true, noTagDelete: true, noCategoryDelete: true, noMetadataDelete: true,
      destructiveMetadataActionsDeferred: true
    },
    separateFromDesktopCanonicalLibraryMetadata: true,
    productSyncReady: false
  };
  return Object.assign(base, overrides);
}

async function runVmProof() {
  const context = makeContext();
  vm.runInContext(read(folderImportFile), context, { filename: folderImportFile });
  const folderApi = context.H2O.Studio.sync.folder;
  assert(folderApi, "folder sync API missing");
  assert(typeof folderApi.importLibraryMetadataMutationReceiptsFromDesktopBundle === "function", "receipt import API missing");
  assert(typeof folderApi.listLibraryMetadataMutationReceipts === "function", "receipt list API missing");
  assert(typeof folderApi.diagnoseLibraryMetadataMutationReceipts === "function", "receipt diagnostic API missing");
  if (failures.length) return;

  // Create a pending chat-category-assign request (the safe, applied type).
  const created = await folderApi.requestLibraryMetadataMutation({
    action: "chat-category-assign",
    chatId: "chat-applied-1",
    categoryId: "cat-applied-1",
    expectedCurrentBasisHash: makeHash("b")
  });
  assert(created.ok === true && created.status === "pending-created", "applied-type request should be created");
  const appliedRequestId = created.requestId;
  const appliedIdem = created.idempotencyKey;

  // Create a pending label-create request (a deferred type on Desktop).
  const deferredReq = await folderApi.requestLibraryMetadataMutation({
    action: "label-create",
    displayName: "Quarterly Review"
  });
  assert(deferredReq.ok === true && deferredReq.status === "pending-created", "deferred-type request should be created");
  const deferredRequestId = deferredReq.requestId;
  const deferredIdem = deferredReq.idempotencyKey;

  // Desktop bundle: 1 applied receipt (matches), 1 deferred receipt (matches), 2 unsafe receipts (must reject).
  const appliedReceipt = makeDesktopReceipt(appliedRequestId, appliedIdem, "applied");
  const deferredReceipt = makeDesktopReceipt(deferredRequestId, deferredIdem, "deferred", {
    requestAction: "label-create", requestType: "label-create", metadataKind: "label", subjectKind: "catalog"
  });
  const chromeAuthorityReceipt = makeDesktopReceipt("library-metadata-mutation-request:unsafe-auth", "k-unsafe-auth", "applied", {
    receiptId: "library-metadata-mutation-receipt:unsafe-auth:applied",
    safety: Object.assign({}, makeDesktopReceipt("x", "y", "applied").safety, { chromeAuthority: true, noChromeCanonicalMutation: false })
  });
  const leakyReceipt = makeDesktopReceipt("library-metadata-mutation-request:leaky", "k-leaky", "applied", {
    receiptId: "library-metadata-mutation-receipt:leaky:applied",
    rawChatTitle: "SECRET CHAT TITLE MUST NOT IMPORT",
    privacy: Object.assign({}, makeDesktopReceipt("x", "y", "applied").privacy, { rawChatTitles: true, hashOnly: false })
  });

  const bundle = {
    schema: "h2o.studio.fullBundle.v2",
    exportedAt: "2026-06-29T12:05:00.000Z",
    libraryMetadataMutationReceipts: [appliedReceipt, deferredReceipt, chromeAuthorityReceipt, leakyReceipt]
  };

  const imp1 = await folderApi.importLibraryMetadataMutationReceiptsFromDesktopBundle(bundle);
  assert(imp1.ok === true, "first receipt import should succeed");
  assert(imp1.found === 4, "receipt import should observe all incoming receipts");
  assert(imp1.importedReceiptCount === 2, "only the 2 trusted receipts should be imported");
  assert(imp1.skippedMalformedCount === 2, "the 2 unsafe receipts should be skipped");
  assert(imp1.statusCounts.applied === 1, "applied status count mismatch");
  assert(imp1.statusCounts.deferred === 1, "deferred status count mismatch");
  assert(imp1.matchedPendingRequestCount === 2, "both pending requests should match a receipt");
  assert(imp1.resolvedPendingRequestCount === 1, "only the applied (terminal) request should resolve");
  assert(imp1.observedDeferredRequestCount === 1, "the deferred request should be observed but not resolved");
  assert(imp1.chromeReadOnly === true, "receipt import must declare chrome-read-only");
  assert(imp1.noChromeCanonicalMutation === true, "receipt import must declare no chrome canonical mutation");
  assert(imp1.productSyncReady === false, "receipt import must keep product sync not-ready");
  assert(imp1.noHardDelete === true && imp1.noPurge === true && imp1.noChatDelete === true &&
    imp1.noSnapshotDelete === true && imp1.noAssetDelete === true, "receipt import must preserve no-delete flags");

  // Request mirror: applied request resolved (off pending), deferred request still pending.
  const reqMirror1 = context.__storage[REQUEST_EXPORT_KEY];
  const appliedRow1 = reqMirror1.requests.find((r) => r.requestId === appliedRequestId);
  const deferredRow1 = reqMirror1.requests.find((r) => r.requestId === deferredRequestId);
  assert(appliedRow1 && appliedRow1.status === "resolved", "applied request row should be marked resolved");
  assert(appliedRow1 && appliedRow1.resolvedByReceiptId === appliedReceipt.receiptId, "applied request should record resolving receipt id");
  assert(deferredRow1 && deferredRow1.status === "pending", "deferred request row should stay pending for a future phase");
  assert(deferredRow1 && deferredRow1.observedByReceiptId === deferredReceipt.receiptId, "deferred request should record observation");
  assert(reqMirror1.requests.length === 2, "no request history should be deleted");

  // Receipt mirror present and read-only.
  const receiptMirror1 = context.__storage[IMPORT_KEY];
  assert(receiptMirror1 && receiptMirror1.schema === IMPORT_MIRROR_SCHEMA, "chrome receipt import mirror schema mismatch");
  assert(receiptMirror1.receipts.length === 2, "receipt mirror should hold the 2 trusted receipts");

  // Idempotency: re-import the same bundle.
  const imp2 = await folderApi.importLibraryMetadataMutationReceiptsFromDesktopBundle(bundle);
  assert(imp2.ok === true, "second receipt import should succeed");
  assert(imp2.importedReceiptCount === 2, "re-import should re-observe the same 2 trusted receipts");
  assert(imp2.duplicateReceiptCount === 2, "re-import should treat both receipts as duplicates");
  assert(imp2.newReceiptCount === 0, "re-import should add no new receipts");
  assert(imp2.resolvedPendingRequestCount === 0, "re-import must not re-resolve an already-resolved request");
  assert(imp2.alreadyResolvedRequestCount === 1, "re-import should report the already-resolved request");

  const receiptMirror2 = context.__storage[IMPORT_KEY];
  assert(receiptMirror2.receipts.length === 2, "re-import must not duplicate receipt rows");
  const reqMirror2 = context.__storage[REQUEST_EXPORT_KEY];
  assert(reqMirror2.requests.filter((r) => r.status === "resolved").length === 1, "re-import must not double-resolve");
  assert(reqMirror2.requests.length === 2, "re-import must not delete request history");

  // List + diagnose read APIs.
  const list = await folderApi.listLibraryMetadataMutationReceipts();
  assert(Array.isArray(list) && list.length === 2, "receipt list should return the 2 trusted receipts");
  const appliedList = await folderApi.listLibraryMetadataMutationReceipts({ status: "applied" });
  assert(appliedList.length === 1 && appliedList[0].status === "applied", "status-filtered receipt list mismatch");

  const diag = await folderApi.diagnoseLibraryMetadataMutationReceipts({ includeRows: true });
  assert(diag.ok === true, "receipt diagnostic should pass");
  assert(diag.section === "libraryMetadataMutationReceipts", "receipt diagnostic section mismatch");
  assert(diag.receiptCount === 2, "receipt diagnostic count mismatch");
  assert(diag.appliedCount === 1, "receipt diagnostic applied count mismatch");
  assert(diag.deferredCount === 1, "receipt diagnostic deferred count mismatch");
  assert(diag.rejectedCount === 0 && diag.skippedDuplicateCount === 0 && diag.staleBasisCount === 0 && diag.invalidCount === 0,
    "receipt diagnostic status taxonomy mismatch");
  assert(diag.resolvedRequestCount === 1, "receipt diagnostic resolved-request count mismatch");
  assert(diag.pendingRequestCount === 1, "receipt diagnostic pending-request count mismatch");
  assert(diag.chromeReadOnly === true, "receipt diagnostic must be chrome-read-only");
  assert(diag.desktopApply === false, "receipt diagnostic must keep desktop apply false");
  assert(diag.noChromeCanonicalMutation === true, "receipt diagnostic must guard chrome canonical mutation");
  assert(diag.productSyncReady === false, "receipt diagnostic must keep product sync not-ready");
  assert(diag.importMirrorKey === IMPORT_KEY, "receipt diagnostic mirror key mismatch");

  // Privacy: no raw leak from unsafe/leaky receipts into either mirror.
  const mirrorText = JSON.stringify(context.__storage);
  for (const forbidden of ["SECRET CHAT TITLE MUST NOT IMPORT"]) {
    assert(!mirrorText.includes(forbidden), `mirror leaked ${forbidden}`);
  }

  // Stale-basis + rejected + invalid + skipped_duplicate are recognized terminal statuses.
  const staleReq = await folderApi.requestLibraryMetadataMutation({
    action: "chat-category-assign", chatId: "chat-stale", categoryId: "cat-stale", expectedCurrentBasisHash: makeHash("s")
  });
  const staleReceipt = makeDesktopReceipt(staleReq.requestId, staleReq.idempotencyKey, "stale_basis");
  const impStale = await folderApi.importLibraryMetadataMutationReceiptsFromDesktopBundle({
    libraryMetadataMutationReceipts: [staleReceipt]
  });
  assert(impStale.statusCounts.stale_basis === 1, "stale_basis status should be recognized");
  assert(impStale.resolvedPendingRequestCount === 1, "stale_basis is terminal and should resolve the request instance");
  const reqMirrorStale = context.__storage[REQUEST_EXPORT_KEY];
  const staleRow = reqMirrorStale.requests.find((r) => r.requestId === staleReq.requestId);
  assert(staleRow && staleRow.status === "resolved", "stale_basis request should be marked resolved");
}

for (const file of [folderImportFile, folderSyncFile, exportBundleFile]) {
  assert(exists(file), `${file}: missing`);
}

if (failures.length === 0) {
  const folderImport = read(folderImportFile);

  [
    "var LIBRARY_METADATA_MUTATION_RECEIPT_SCHEMA = 'h2o.studio.library-metadata-mutation-receipt.v1'",
    "var LIBRARY_METADATA_MUTATION_RECEIPT_IMPORT_KEY = 'h2o:studio:library-metadata-mutation-receipts:chrome-imported:v1'",
    "var LIBRARY_METADATA_MUTATION_RECEIPT_IMPORT_MIRROR_SCHEMA = 'h2o.studio.library-metadata-mutation-receipt.chrome-imported-mirror.v1'",
    "importLibraryMetadataMutationReceiptsFromDesktopBundle: importLibraryMetadataMutationReceiptsFromDesktopBundle",
    "listLibraryMetadataMutationReceipts: listLibraryMetadataMutationReceipts",
    "diagnoseLibraryMetadataMutationReceipts: diagnoseLibraryMetadataMutationReceipts",
    "libraryMetadataMutationReceiptSchema: LIBRARY_METADATA_MUTATION_RECEIPT_SCHEMA",
    "libraryMetadataMutationReceiptImportKey: LIBRARY_METADATA_MUTATION_RECEIPT_IMPORT_KEY",
    "var libraryMetadataMutationReceiptImport = await importLibraryMetadataMutationReceiptsFromDesktopBundle(bundleInput)",
    "var alreadyLibraryMetadataMutationReceiptImport = await importLibraryMetadataMutationReceiptsFromDesktopBundle(bundle)",
    "library-metadata-mutation-receipt-import-blocked"
  ].forEach((needle) => assert(folderImport.includes(needle), `${folderImportFile}: missing ${needle}`));

  const sanitizeBody = functionBody(folderImport, "sanitizeImportedLibraryMetadataMutationReceipt");
  [
    "library-metadata-mutation-receipt-schema-invalid",
    "library-metadata-mutation-receipt-privacy-invalid",
    "library-metadata-mutation-receipt-safety-invalid",
    "chromeReadOnly: true",
    "chromeAuthority: false"
  ].forEach((needle) => assert(sanitizeBody.includes(needle), `sanitize body missing ${needle}`));

  const resolveBody = functionBody(folderImport, "markLibraryMetadataMutationRequestsResolvedByReceipts");
  [
    "resolvedByReceiptId",
    "resolutionSource = 'desktop-receipt-import'",
    "observedByReceiptId"
  ].forEach((needle) => assert(resolveBody.includes(needle), `resolve body missing ${needle}`));

  const importBody = functionBody(folderImport, "importLibraryMetadataMutationReceiptsFromDesktopBundle");
  const diagBody = functionBody(folderImport, "diagnoseLibraryMetadataMutationReceipts");
  const listBody = functionBody(folderImport, "listLibraryMetadataMutationReceipts");
  // Chrome receipt import must never mutate canonical metadata or delete anything.
  [
    "chromeAuthority: true",
    "noChromeCanonicalMutation: false",
    "desktopApply: true",
    "assignChat",
    "deleteChat(",
    "deleteSnapshot(",
    "hardDelete",
    "purgeRecentlyDeleted"
  ].forEach((needle) => {
    assertNotContainsText(sanitizeBody + resolveBody + importBody + diagBody + listBody, needle, needle);
  });

  if (exists(evidenceFile)) {
    assertContains(evidenceFile, "libraryMetadataMutationReceipts[]", "transport section evidence");
    assertContains(evidenceFile, RECEIPT_SCHEMA, "receipt schema evidence");
    assertContains(evidenceFile, IMPORT_KEY, "chrome receipt mirror key evidence");
  }
}

if (failures.length === 0) await runVmProof();

if (failures.length) {
  console.error("FAIL validate-labels-tags-categories-phase8-chrome-receipt-import");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("PASS validate-labels-tags-categories-phase8-chrome-receipt-import");
