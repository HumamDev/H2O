#!/usr/bin/env node
//
// Phase 13 — guarded non-destructive chat-category-clear metadata request.
//
// Proves, in-process through the real Chrome/Desktop sync modules, that:
//   - Chrome can shape a request-only chat-category-clear request.
//   - Desktop applies only chat-category-assign and chat-category-clear.
//   - Desktop clear uses categories.clearChat(chatId), not deletion.
//   - Desktop emits a receipt and replay is idempotent.
//   - Chrome imports the receipt and refreshed projection read-only.
//   - The exact-match carve-out does not unblock other clear/delete shapes.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { TextEncoder, TextDecoder } from 'node:util';

const root = process.cwd();
const failures = [];

const folderImportFile = 'src-surfaces-base/studio/sync/folder-import.mv3.js';
const autoImportFile = 'src-surfaces-base/studio/sync/auto-import.mv3.js';
const folderSyncFile = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const diagnosticsFile = 'src-surfaces-base/studio/sync/library/library-metadata-diagnostics.js';
const projectionFile = 'src-surfaces-base/studio/sync/library/library-metadata-export-projection.tauri.js';
const evidenceFile = 'release-evidence/2026-06-25/labels-tags-categories-phase13-chat-category-clear.md';

const REQUEST_EXPORT_KEY = 'h2o:studio:library-metadata-mutation-requests:pending-export:v1';
const RECEIPT_SCHEMA = 'h2o.studio.library-metadata-mutation-receipt.v1';

const BAD_ACTIONS = [
  'chat-label-clear',
  'chat-tag-clear',
  'category-clear',
  'metadata-clear',
  'chat-category-delete',
  'category-delete',
  'delete',
  'remove',
  'unbind',
  'purge',
  'hard-delete',
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
  if (start < 0) return '';
  const signatureEnd = source.indexOf(')', start);
  const open = source.indexOf('{', signatureEnd === -1 ? start : signatureEnd);
  assert(open >= 0, `${name} body missing`);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  assert(false, `${name} body parse failed`);
  return '';
}

function makeStorage(initial = {}) {
  const values = new Map(Object.entries(initial || {}));
  return {
    __values: values,
    local: {
      get(keys, cb) {
        const out = {};
        const list = Array.isArray(keys) ? keys : [keys];
        for (const key of list) if (values.has(key)) out[key] = values.get(key);
        cb(out);
      },
      set(items, cb) {
        for (const [key, value] of Object.entries(items || {})) values.set(key, value);
        if (cb) cb();
      },
      remove(keys, cb) {
        const list = Array.isArray(keys) ? keys : [keys];
        for (const key of list) values.delete(key);
        if (cb) cb();
      },
    },
  };
}

function baseGlobals(extra = {}) {
  return {
    console, Date, Math, JSON, TextEncoder, TextDecoder, Uint8Array, Promise, Object, Array, String, Number, Boolean, RegExp, Error, Set,
    crypto: {
      subtle: webcrypto.subtle,
      randomUUID: () => '00000000-0000-4000-8000-' + Math.floor(Math.random() * 1e12).toString().padStart(12, '0'),
    },
    setTimeout: () => 1,
    clearTimeout() {},
    setInterval: () => 1,
    clearInterval() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {},
    queueMicrotask: (cb) => Promise.resolve().then(cb),
    ...extra,
  };
}

function buildDesktopSurface() {
  const storage = makeStorage();
  let clearChatCallCount = 0;
  let assignChatCallCount = 0;
  const categories = new Map([
    ['cat-work', { id: 'cat-work', categoryId: 'cat-work', name: 'PRIVATE-CATEGORY-NAME-NOLEAK', color: '#3366ff' }],
  ]);
  const chats = new Map([
    ['chat-1', { id: 'chat-1', chatId: 'chat-1', title: 'PRIVATE-CHAT-TITLE-NOLEAK', category_id: 'cat-work' }],
  ]);
  const store = {
    categories: {
      async get(id) { return categories.get(String(id)) || null; },
      async getAll() { return Array.from(categories.values()); },
      async assignChat(categoryId, chatId) {
        assignChatCallCount += 1;
        const chat = chats.get(String(chatId));
        if (!chat) return false;
        chat.category_id = String(categoryId);
        return true;
      },
      async clearChat(chatId) {
        clearChatCallCount += 1;
        const chat = chats.get(String(chatId));
        if (!chat) return false;
        chat.category_id = '';
        return true;
      },
      async listChats(categoryId) {
        return Array.from(chats.values()).filter((chat) => chat.category_id === String(categoryId));
      },
    },
    chats: {
      async get(id) { return chats.get(String(id)) || null; },
      async getAll() { return Array.from(chats.values()); },
    },
    labels: { async getAll() { return []; }, async listChats() { return []; } },
    tags: { async getAll() { return []; }, async listChats() { return []; } },
  };
  const ctx = baseGlobals({
    __TAURI__: {},
    __TAURI_INTERNALS__: {},
    chrome: { runtime: { id: 'desktop-phase13', lastError: null }, storage: { ...storage, onChanged: { addListener() {}, removeListener() {} } } },
    H2O: {
      LibraryIndex: { async refresh() { return { ok: true }; } },
      Studio: {
        platform: { env: { adapter: 'tauri' } },
        store,
        sync: {},
        ingestion: {
          async importBundle() { return { ok: true, warnings: [], errors: [] }; },
          async dryRunImportBundle() { return { ok: true }; },
        },
      },
    },
    __phase13: {
      getClearChatCallCount: () => clearChatCallCount,
      getAssignChatCallCount: () => assignChatCallCount,
      getChatCategory: (chatId) => (chats.get(String(chatId)) || {}).category_id || '',
    },
  });
  ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx;
  const context = vm.createContext(ctx);
  vm.runInContext(read(projectionFile), context, { filename: projectionFile });
  vm.runInContext(read(folderSyncFile), context, { filename: folderSyncFile });
  return { context, storage };
}

function buildChromeSurface() {
  const storage = makeStorage();
  const ctx = baseGlobals({
    document: { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} },
    chrome: {
      runtime: {
        id: 'chrome-phase13',
        lastError: null,
        sendMessage(_message, callback) {
          if (typeof callback === 'function') callback({ ok: true, result: {} });
          return Promise.resolve({ ok: true, result: {} });
        },
      },
      storage: { ...storage, onChanged: { addListener() {}, removeListener() {} } },
    },
    H2O: {
      LibraryIndex: { async refresh() { return { ok: true }; }, getAll() { return []; } },
      Studio: { platform: { env: { adapter: 'mv3' } }, sync: {} },
    },
  });
  ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx;
  const context = vm.createContext(ctx);
  vm.runInContext(read(folderImportFile), context, { filename: folderImportFile });
  vm.runInContext(read(diagnosticsFile), context, { filename: diagnosticsFile });
  return { context, storage };
}

function makeBundle(fields = {}) {
  return {
    schema: 'h2o.studio.fullBundle.v2',
    exportedAt: '2026-06-29T12:00:00.000Z',
    exportId: 'phase13-chat-category-clear',
    sequenceNumber: 13,
    contentSha256: 'f'.repeat(64),
    sourceSyncPeerId: 'chrome-studio',
    sourcePeerEnvelope: { source: 'chrome-studio' },
    chatArchive: {
      schema: 'h2o.chatArchive.bundle.v1',
      exportedAt: '2026-06-29T12:00:00.000Z',
      chats: [],
      catalogs: { categories: [], labels: [] },
    },
    ...fields,
  };
}

async function runRuntimeProof() {
  const desktop = buildDesktopSurface();
  const desktopApi = desktop.context.H2O.Studio.sync.folder;
  const projection = desktop.context.H2O.Studio.sync.libraryMetadataExportProjection;
  assert(desktopApi && typeof desktopApi.importChromeLatestBundle === 'function', 'Desktop import API missing');
  assert(projection && typeof projection.buildDesktopCanonicalMetadataExport === 'function', 'Desktop projection API missing');
  if (failures.length) return null;

  const p0 = await projection.buildDesktopCanonicalMetadataExport({ requestedBy: 'phase13-before-clear' });
  assert(p0.counts.chatCategoryAssignmentCount === 1, 'Desktop projection should start with one category assignment');

  const chrome = buildChromeSurface();
  const chromeApi = chrome.context.H2O.Studio.sync.folder;
  assert(chromeApi && typeof chromeApi.requestLibraryMetadataMutation === 'function', 'Chrome request API missing');
  assert(typeof chromeApi.importLatestBundle === 'function', 'Chrome latest import API missing');
  assert(typeof chromeApi.importLibraryMetadataMutationReceiptsFromDesktopBundle === 'function', 'Chrome receipt import API missing');
  if (failures.length) return null;

  await chromeApi.importLatestBundle(makeBundle({ desktopCanonicalLibraryMetadata: p0 }), {
    fileFingerprint: 'phase13-canonical-p0',
  });
  const requestResult = await chromeApi.requestLibraryMetadataMutation({
    action: 'chat-category-clear',
    chatId: 'chat-1',
    categoryId: 'cat-work',
    expectedCurrentBasisHash: p0.hashes.projection,
    rawChatTitle: 'PRIVATE-CHAT-TITLE-NOLEAK',
    rawChatContent: 'PRIVATE-CHAT-CONTENT-NOLEAK',
  });
  assert(requestResult.ok === true, 'Chrome chat-category-clear request should be created');
  assert(requestResult.requestType === 'chat-category-clear', 'request type mismatch');
  assert(requestResult.payload?.payload?.categoryId === null, 'clear payload categoryId must be null');
  assert(requestResult.payload?.payload?.entityId === null, 'clear payload entityId must be null');
  assert(requestResult.payload?.payload?.displayName === null, 'clear payload displayName must be null');
  assert(requestResult.payload?.desktopApply === false && requestResult.payload?.noChromeCanonicalMutation === true,
    'Chrome request must remain request-only/no-mutation');

  const mirror = chrome.storage.__values.get(REQUEST_EXPORT_KEY);
  assert(mirror && mirror.requests && mirror.requests.length === 1, 'Chrome pending request mirror missing');
  assert(JSON.stringify(mirror).includes('chat-category-clear'), 'Chrome pending mirror should contain clear request');
  assertNotContainsText(JSON.stringify(mirror), 'PRIVATE-CHAT-TITLE-NOLEAK', 'raw chat title');
  assertNotContainsText(JSON.stringify(mirror), 'PRIVATE-CHAT-CONTENT-NOLEAK', 'raw chat content');

  for (const action of BAD_ACTIONS) {
    const blocked = await chromeApi.requestLibraryMetadataMutation({
      action,
      chatId: 'chat-1',
      categoryId: 'cat-work',
      expectedCurrentBasisHash: p0.hashes.projection,
    });
    assert(blocked.ok === false, `Chrome should block ${action}`);
    assert(blocked.status === 'library-metadata-mutation-request-destructive-action-deferred' ||
      blocked.status === 'library-metadata-mutation-request-action-unsupported',
      `unexpected block status for ${action}: ${blocked.status}`);
  }
  const mirrorAfterBad = chrome.storage.__values.get(REQUEST_EXPORT_KEY);
  assert(mirrorAfterBad.requests.length === 1, 'bad actions must not add pending requests');

  const chromeRequest = JSON.parse(JSON.stringify(mirror.requests[0]));
  const desktopResult = await desktopApi.importChromeLatestBundle(makeBundle({
    libraryMetadataMutationRequests: [chromeRequest],
  }), { mode: 'phase13-chat-category-clear' });
  assert(desktopResult.ok === true, 'Desktop import/apply should pass');
  const autoApply = desktopResult.libraryMetadataMutationRequestAutoApply;
  assert(autoApply && autoApply.appliedCount === 1, 'Desktop should apply one clear request');
  assert(autoApply.receiptExportReadyCount === 1, 'Desktop should prepare one receipt');
  assert(desktop.context.__phase13.getClearChatCallCount() === 1, 'Desktop clearChat should be called once');
  assert(desktop.context.__phase13.getAssignChatCallCount() === 0, 'Desktop assignChat must not be called for clear');
  assert(desktop.context.__phase13.getChatCategory('chat-1') === '', 'chat category should be cleared');

  const p1 = await projection.buildDesktopCanonicalMetadataExport({ requestedBy: 'phase13-after-clear' });
  assert(p1.counts.chatCategoryAssignmentCount === 0, 'Desktop projection assignment count should decrement to zero');
  assert(p1.counts.classificationSignalCount === 0, 'classification signal count should decrement to zero');
  assert(p1.hashes.projection !== p0.hashes.projection, 'Desktop projection hash should change after clear');

  const receipts = await desktopApi.listLibraryMetadataMutationReceipts({});
  const appliedReceipt = receipts.find((receipt) => receipt.requestId === requestResult.requestId && receipt.status === 'applied');
  assert(appliedReceipt, 'Desktop applied receipt missing');
  assert(appliedReceipt.requestType === 'chat-category-clear', 'Desktop receipt request type mismatch');
  assert(appliedReceipt.resultingCanonicalHash === p1.hashes.projection, 'receipt resulting hash should match cleared projection');
  assert(appliedReceipt.privacy.redacted === true && appliedReceipt.privacy.hashOnly === true, 'receipt privacy flags missing');
  assert(appliedReceipt.safety.noHardDelete === true && appliedReceipt.safety.noPurge === true &&
    appliedReceipt.safety.noChatDelete === true && appliedReceipt.safety.noSnapshotDelete === true &&
    appliedReceipt.safety.noAssetDelete === true && appliedReceipt.safety.noCategoryDelete === true &&
    appliedReceipt.safety.noMetadataDelete === true, 'receipt no-delete flags missing');
  assertNotContainsText(JSON.stringify(appliedReceipt), 'PRIVATE-CHAT-TITLE-NOLEAK', 'receipt raw chat title');
  assertNotContainsText(JSON.stringify(appliedReceipt), 'PRIVATE-CATEGORY-NAME-NOLEAK', 'receipt raw category name');

  await chromeApi.importLatestBundle(makeBundle({
    desktopCanonicalLibraryMetadata: p1,
    libraryMetadataMutationReceipts: [appliedReceipt],
  }), { fileFingerprint: 'phase13-canonical-p1-with-receipt' });
  const receiptDiag = await chromeApi.diagnoseLibraryMetadataMutationReceipts({ includeRows: true });
  assert(receiptDiag.importedReceiptCount === 1 || receiptDiag.receiptCount === 1, 'Chrome receipt diagnostic should see receipt');
  assert(receiptDiag.statusCounts.applied === 1, 'Chrome receipt diagnostic should count applied receipt');
  assert(receiptDiag.resolvedRequestCount === 1, 'Chrome should resolve the pending clear request');
  assert(receiptDiag.noChromeCanonicalMutation === true, 'Chrome receipt import must be read-only/no canonical mutation');
  const projectionDiag = await chromeApi.diagnoseDesktopCanonicalLibraryMetadata();
  assert(projectionDiag.available === true, 'Chrome projection should be available after refresh');
  assert(projectionDiag.projectionHash === p1.hashes.projection, 'Chrome projection hash should match Desktop after clear');
  const projectionDiagCounts = projectionDiag.counts || projectionDiag;
  assert(projectionDiagCounts.chatCategoryAssignmentCount === 0, 'Chrome projection assignment count should match Desktop after clear');

  const replayResult = await desktopApi.importChromeLatestBundle(makeBundle({
    exportId: 'phase13-chat-category-clear-replay',
    sequenceNumber: 14,
    contentSha256: 'e'.repeat(64),
    libraryMetadataMutationRequests: [chromeRequest],
  }), { mode: 'phase13-chat-category-clear-replay' });
  assert(replayResult.ok === true, 'Desktop replay should pass');
  assert(replayResult.libraryMetadataMutationRequestAutoApply.skippedDuplicateCount === 1,
    `Desktop replay should produce skipped_duplicate: ${JSON.stringify(replayResult.libraryMetadataMutationRequestAutoApply)}`);
  assert(desktop.context.__phase13.getClearChatCallCount() === 1, 'Desktop replay must not call clearChat again');

  const status = await chrome.context.H2O.Studio.sync.libraryMetadataDiagnostics.captureMetadataSyncStatus();
  assert(status.appliedRequestTypes.includes('chat-category-assign'), 'status should include chat-category-assign');
  assert(status.appliedRequestTypes.includes('chat-category-clear'), 'status should include chat-category-clear');
  assert(!status.deferredDestructiveShapes.includes('chat-category-clear'), 'status must not list chat-category-clear as deferred destructive');
  for (const action of BAD_ACTIONS) {
    assert(status.deferredDestructiveShapes.includes(action) || ['category-delete'].includes(action),
      `status should keep destructive action deferred: ${action}`);
  }
  assert(status.productSyncReady === false, 'product sync must remain not ready');

  return {
    schema: 'h2o.studio.library-metadata.phase13-chat-category-clear-proof.v1',
    requestType: 'chat-category-clear',
    desktopAppliedCount: autoApply.appliedCount,
    desktopReplaySkippedDuplicateCount: replayResult.libraryMetadataMutationRequestAutoApply.skippedDuplicateCount,
    beforeChatCategoryAssignmentCount: p0.counts.chatCategoryAssignmentCount,
    afterChatCategoryAssignmentCount: p1.counts.chatCategoryAssignmentCount,
    chromeProjectionHashMatchesDesktop: projectionDiag.projectionHash === p1.hashes.projection,
    chromeReceiptResolvedRequestCount: receiptDiag.resolvedRequestCount,
    exactMatchNegativeActionsChecked: BAD_ACTIONS.length,
    productSyncReady: false,
  };
}

for (const file of [folderImportFile, autoImportFile, folderSyncFile, diagnosticsFile, projectionFile, evidenceFile]) {
  assert(exists(file), `${file}: missing`);
}

const folderImport = read(folderImportFile);
const autoImport = read(autoImportFile);
const folderSync = read(folderSyncFile);
const diagnostics = read(diagnosticsFile);
const evidence = exists(evidenceFile) ? read(evidenceFile) : '';

for (const file of [folderImportFile, autoImportFile, folderSyncFile]) {
  assertContains(file, "NON_DESTRUCTIVE_CLEAR_ALLOWLIST = new Set(['chat-category-clear'])", 'exact clear allowlist');
  assertContains(file, '!NON_DESTRUCTIVE_CLEAR_ALLOWLIST.has(normalized)', 'destructive guard carve-out');
  assertContains(file, "'chat-category-clear': { metadataKind: 'category', subjectKind: 'chat-category-assignment', operation: 'clear', requiresChatId: true, requiresId: false }",
    'chat-category-clear action spec');
}

const chromeShapeBody = functionBody(folderImport, 'shapeLibraryMetadataMutationRequestInput');
assert(chromeShapeBody.includes("action === 'chat-category-clear'"), 'Chrome shaping must special-case clear target');
assert(chromeShapeBody.includes("categoryId: spec.metadataKind === 'category' && action !== 'chat-category-clear' ? entityId || null : null"),
  'Chrome clear payload must export categoryId null');

const desktopValidateBody = functionBody(folderSync, 'validateLibraryMetadataMutationRequestForDesktopApply');
assert(desktopValidateBody.includes('APPLIED_LIBRARY_METADATA_MUTATION_REQUEST_ACTIONS[action] !== true'),
  'Desktop validation must use the two-action allowlist');
assert(desktopValidateBody.includes("action === 'chat-category-assign' && !categoryId"),
  'Desktop validation must not require categoryId for clear');

const desktopClearApplyBody = functionBody(folderSync, 'applyChatCategoryClearLibraryMetadataRequest');
[
  'categories.clearChat(chatId)',
  'chats.get(chatId)',
  'library-metadata-mutation-request-already-cleared-canonical',
  'library-metadata-mutation-request-category-clear-failed',
  "categoryHash: ''",
].forEach((needle) => assert(desktopClearApplyBody.includes(needle), `clear apply missing ${needle}`));
for (const forbidden of ['remove(', 'delete(', 'purge', 'hardDelete', 'hard-delete', 'unlink', 'clearStore']) {
  assert(!desktopClearApplyBody.includes(forbidden), `clear apply must not contain ${forbidden}`);
}

const desktopAutoApplyBody = functionBody(folderSync, 'autoApplyLibraryMetadataMutationRequestsFromChromeBundle');
assert(desktopAutoApplyBody.includes('applyChatCategoryClearLibraryMetadataRequest'), 'auto-apply must route clear request');
assert(desktopAutoApplyBody.includes('applyChatCategoryAssignLibraryMetadataRequest'), 'auto-apply must preserve assign request');

assert(diagnostics.includes("var RUNTIME_PROVEN_APPLIED_TYPES = ['chat-category-assign', 'chat-category-clear']"),
  'status surface must list both proven applied types');
assert(diagnostics.includes("'chat-label-clear'") && diagnostics.includes("'metadata-clear'") &&
  diagnostics.includes("'chat-category-delete'"), 'status surface must keep broader destructive clear/delete shapes deferred');
assert(!functionBody(diagnostics, 'captureMetadataSyncStatus').includes('requestLibraryMetadataMutation('),
  'status surface must not create requests');

for (const action of BAD_ACTIONS) {
  assert(!folderImport.includes(`NON_DESTRUCTIVE_CLEAR_ALLOWLIST = new Set(['chat-category-clear', '${action}'])`),
    `allowlist must not include ${action}`);
}

for (const needle of [
  'chat-category-clear',
  'NON_DESTRUCTIVE_CLEAR_ALLOWLIST',
  'libraryMetadataMutationReceipts[]',
  'Projection decrement proof',
  'Product metadata sync: NOT READY',
]) {
  assert(evidence.includes(needle), `evidence missing ${needle}`);
}

let proof = null;
if (failures.length === 0) {
  try {
    proof = await runRuntimeProof();
  } catch (error) {
    failures.push(`runtime proof threw: ${String((error && error.stack) || error)}`);
  }
}

if (failures.length) {
  console.error('FAIL validate-labels-tags-categories-phase13-chat-category-clear');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(JSON.stringify(proof, null, 2));
console.log('PASS validate-labels-tags-categories-phase13-chat-category-clear');
