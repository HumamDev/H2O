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
const autoImportFile = "src-surfaces-base/studio/sync/auto-import.mv3.js";
const evidenceFile = "release-evidence/2026-06-25/labels-tags-categories-phase6-chrome-request-export.md";

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
        return "00000000-0000-4000-8000-000000000006";
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
    H2O: {
      Studio: {
        sync: {}
      }
    },
    chrome: {
      runtime: {
        id: "phase6-metadata-request-validator",
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

async function runVmProof() {
  const context = makeContext();
  vm.runInContext(read(folderImportFile), context, { filename: folderImportFile });
  const folderApi = context.H2O.Studio.sync.folder;
  assert(folderApi, "folder sync API missing");
  assert(typeof folderApi.requestLibraryMetadataMutation === "function", "request API missing");
  assert(typeof folderApi.listLibraryMetadataMutationRequests === "function", "list API missing");
  assert(typeof folderApi.diagnoseLibraryMetadataMutationRequests === "function", "diagnostic API missing");

  const createResult = await folderApi.requestLibraryMetadataMutation({
    action: "chat-category-assign",
    chatId: "chat-123",
    categoryId: "cat-456",
    expectedCurrentBasisHash: makeHash("b"),
    rawChatTitle: "Private chat title must not export",
    rawChatContent: "Private chat content must not export",
    accountLinkedMetadata: "private-account"
  }, { sourcePeerId: "chrome-studio" });

  assert(createResult.ok === true, "request creation should pass");
  assert(createResult.status === "pending-created", "request status mismatch");
  assert(createResult.requestOnly === true, "request-only flag missing");
  assert(createResult.desktopApplyRequired === true, "Desktop apply requirement missing");
  assert(createResult.desktopApply === false, "Desktop apply must remain false");
  assert(createResult.noLocalApply === true, "local apply must be disabled");
  assert(createResult.noChromeCanonicalMutation === true, "Chrome canonical mutation guard missing");
  assert(createResult.noDesktopCanonicalMutation === true, "Desktop canonical mutation guard missing");
  assert(createResult.noHardDelete === true, "noHardDelete missing");
  assert(createResult.noPurge === true, "noPurge missing");
  assert(createResult.noChatDelete === true, "noChatDelete missing");
  assert(createResult.noSnapshotDelete === true, "noSnapshotDelete missing");
  assert(createResult.noAssetDelete === true, "noAssetDelete missing");
  assert(createResult.payload?.schema === "h2o.studio.library-metadata-mutation-request.v1", "request schema mismatch");
  assert(createResult.payload?.requestType === "chat-category-assign", "request type mismatch");
  assert(createResult.payload?.payload?.chatId === "chat-123", "chat target id missing");
  assert(createResult.payload?.payload?.categoryId === "cat-456", "category target id missing");
  assert(createResult.payload?.separateFromDesktopCanonicalLibraryMetadata === true, "canonical projection separation missing");

  const duplicateResult = await folderApi.requestLibraryMetadataMutation({
    action: "chat-category-assign",
    chatId: "chat-123",
    categoryId: "cat-456",
    expectedCurrentBasisHash: makeHash("b")
  });
  assert(duplicateResult.ok === true, "duplicate request should pass");
  assert(duplicateResult.status === "pending-existing", "duplicate should reuse pending request");
  assert(duplicateResult.duplicate === true, "duplicate flag missing");

  const list = await folderApi.listLibraryMetadataMutationRequests();
  assert(Array.isArray(list), "request list should be an array");
  assert(list.length === 1, "request list should dedupe duplicate intent");
  assert(list[0].requestType === "chat-category-assign", "listed request type mismatch");

  const diag = await folderApi.diagnoseLibraryMetadataMutationRequests({ includeRows: true });
  assert(diag.ok === true, "diagnostic should pass");
  assert(diag.section === "libraryMetadataMutationRequests", "diagnostic section mismatch");
  assert(diag.pendingCount === 1, "pending count mismatch");
  assert(diag.requestOnly === true, "diagnostic request-only flag missing");
  assert(diag.desktopApply === false, "diagnostic Desktop apply must remain false");
  assert(diag.noChromeCanonicalMutation === true, "diagnostic Chrome mutation guard missing");
  assert(diag.productSyncReady === false, "product sync must remain not ready");

  const blocked = await folderApi.requestLibraryMetadataMutation({
    action: "category-delete",
    categoryId: "cat-456"
  });
  assert(blocked.ok === false, "destructive request should be blocked");
  assert(blocked.status === "library-metadata-mutation-request-destructive-action-deferred",
    "destructive action status mismatch");
  assert(blocked.noCategoryDelete === true, "blocked request must preserve noCategoryDelete");
  assert(blocked.noMetadataDelete === true, "blocked request must preserve noMetadataDelete");

  const mirror = context.__storage["h2o:studio:library-metadata-mutation-requests:pending-export:v1"];
  assert(mirror?.schema === "h2o.studio.library-metadata-mutation-request.pending-export-mirror.v1",
    "pending export mirror schema mismatch");
  assert(mirror?.requestCount === 1, "pending export mirror request count mismatch");
  const mirrorText = JSON.stringify(mirror);
  for (const forbidden of [
    "Private chat title must not export",
    "Private chat content must not export",
    "private-account"
  ]) {
    assert(!mirrorText.includes(forbidden), `mirror leaked ${forbidden}`);
  }
}

for (const file of [folderImportFile, autoImportFile]) {
  assert(exists(file), `${file}: missing`);
}

const folderImport = read(folderImportFile);
const autoImport = read(autoImportFile);
const requestBody = functionBody(folderImport, "requestLibraryMetadataMutation");
const shapeBody = functionBody(folderImport, "shapeLibraryMetadataMutationRequestInput");
const folderSanitizeBody = functionBody(folderImport, "sanitizeLibraryMetadataMutationRequestExportPayload");
const autoSanitizeBody = functionBody(autoImport, "sanitizeLibraryMetadataMutationRequestForExport");
const collectBody = functionBody(autoImport, "collectLibraryMetadataMutationRequestsForExport");

[
  "var LIBRARY_METADATA_MUTATION_REQUEST_SCHEMA = 'h2o.studio.library-metadata-mutation-request.v1'",
  "var LIBRARY_METADATA_MUTATION_REQUEST_EXPORT_KEY = 'h2o:studio:library-metadata-mutation-requests:pending-export:v1'",
  "var LIBRARY_METADATA_MUTATION_REQUEST_EXPORT_MIRROR_SCHEMA = 'h2o.studio.library-metadata-mutation-request.pending-export-mirror.v1'",
  "requestLibraryMetadataMutation: requestLibraryMetadataMutation",
  "listLibraryMetadataMutationRequests: listLibraryMetadataMutationRequests",
  "diagnoseLibraryMetadataMutationRequests: diagnoseLibraryMetadataMutationRequests",
  "libraryMetadataMutationRequestSchema: LIBRARY_METADATA_MUTATION_REQUEST_SCHEMA",
  "libraryMetadataMutationRequestExportKey: LIBRARY_METADATA_MUTATION_REQUEST_EXPORT_KEY"
].forEach((needle) => assertContains(folderImportFile, needle));

[
  "intent: 'library-metadata-mutation-request'",
  "classification: 'metadata-request'",
  "idempotencyKey",
  "expectedCurrentBasisHash",
  "expectedCurrentBasis",
  "sourceSurface: 'chrome-studio'",
  "desktopApplyRequired: true",
  "desktopApply: false",
  "noLocalApply: true",
  "noChromeCanonicalMutation: true",
  "noDesktopCanonicalMutation: true",
  "separateFromDesktopCanonicalLibraryMetadata: true",
  "noHardDelete: true",
  "noPurge: true",
  "noChatDelete: true",
  "noSnapshotDelete: true",
  "noAssetDelete: true",
  "noLabelDelete: true",
  "noTagDelete: true",
  "noCategoryDelete: true",
  "noMetadataDelete: true",
  "displayNameSource: displayName ? 'explicit-user-entered-metadata' : ''"
].forEach((needle) => assert(shapeBody.includes(needle), `shape body missing ${needle}`));

[
  "libraryMetadataMutationDeferredDestructiveAction(action)",
  "library-metadata-mutation-request-destructive-action-deferred",
  "library-metadata-mutation-request-action-unsupported"
].forEach((needle) => assert(folderImport.includes(needle), `request guard missing ${needle}`));

[
  "desktopApply: true",
  "noChromeCanonicalMutation: false",
  "noDesktopCanonicalMutation: false",
  "chromeAuthority: true",
  "deleteChat(",
  "deleteSnapshot(",
  "purgeRecentlyDeletedFolders",
  "hardDelete"
].forEach((needle) => {
  assertNotContainsText(requestBody + shapeBody + folderSanitizeBody + autoSanitizeBody + collectBody, needle, needle);
});

[
  "var LIBRARY_METADATA_MUTATION_REQUEST_SCHEMA = 'h2o.studio.library-metadata-mutation-request.v1'",
  "var LIBRARY_METADATA_MUTATION_REQUEST_EXPORT_KEY = 'h2o:studio:library-metadata-mutation-requests:pending-export:v1'",
  "readLibraryMetadataMutationRequestExportMirror",
  "collectLibraryMetadataMutationRequestsForExport",
  "sanitizeLibraryMetadataMutationRequestForExport",
  "bundle.libraryMetadataMutationRequests = libraryMetadataMutationRequestExport.requests || []",
  "state.lastLibraryMetadataMutationRequestExport = libraryMetadataMutationRequestExport",
  "libraryMetadataMutationRequestExport",
  "requestCount: Number(libraryMetadataMutationRequestExport.requestCount || 0)",
  "pendingRequestCount: Number(libraryMetadataMutationRequestExport.pendingRequestCount || 0)",
  "noChromeCanonicalMutation: true",
  "noDesktopCanonicalMutation: true",
  "separateFromDesktopCanonicalLibraryMetadata: true",
  "noMetadataDelete: true"
].forEach((needle) => assertContains(autoImportFile, needle));

if (exists(evidenceFile)) {
  assertContains(evidenceFile, "libraryMetadataMutationRequests[]", "transport section evidence");
  assertContains(evidenceFile, "h2o.studio.library-metadata-mutation-request.v1", "schema evidence");
}

if (failures.length === 0) await runVmProof();

if (failures.length) {
  console.error("FAIL validate-labels-tags-categories-phase6-chrome-request-export");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("PASS validate-labels-tags-categories-phase6-chrome-request-export");
