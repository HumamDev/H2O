#!/usr/bin/env node
//
// Phase 14F — chat-category-clear Desktop apply/receipt consistency.
//
// Proves Desktop emits an applied receipt only after the canonical chat row
// and Desktop projection reflect the clear. Replay is based on current
// canonical state, not merely an older applied receipt.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { TextEncoder, TextDecoder } from 'node:util';

const root = process.cwd();
const failures = [];

const folderSyncFile = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const projectionFile = 'src-surfaces-base/studio/sync/library/library-metadata-export-projection.tauri.js';
const evidenceFile = 'release-evidence/2026-06-25/labels-tags-categories-phase14f-clear-apply-consistency.md';

const RECEIPT_KEY = 'h2o:studio:library-metadata-mutation-receipts:export:v1';
const RECEIPT_SCHEMA = 'h2o.studio.library-metadata-mutation-receipt.v1';
const RECEIPT_MIRROR_SCHEMA = 'h2o.studio.library-metadata-mutation-receipt.export-mirror.v1';
const REQUEST_SCHEMA = 'h2o.studio.library-metadata-mutation-request.v1';
const PRIVATE_CHAT_TITLE = 'PRIVATE-CHAT-TITLE-NOLEAK';
const PRIVATE_CATEGORY_NAME = 'PRIVATE-CATEGORY-NAME-NOLEAK';

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

function exists(file) {
  return fs.existsSync(path.join(root, file));
}

function assert(condition, message) {
  if (!condition) failures.push(message);
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
        for (const key of Array.isArray(keys) ? keys : [keys]) {
          if (values.has(key)) out[key] = values.get(key);
        }
        cb(out);
      },
      set(items, cb) {
        for (const [key, value] of Object.entries(items || {})) values.set(key, value);
        if (cb) cb();
      },
      remove(keys, cb) {
        for (const key of Array.isArray(keys) ? keys : [keys]) values.delete(key);
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

function makeBundle(requests, fields = {}) {
  return {
    schema: 'h2o.studio.fullBundle.v2',
    exportedAt: '2026-06-30T00:00:00.000Z',
    exportId: 'phase14f-clear-apply-consistency',
    sequenceNumber: 14,
    contentSha256: 'f'.repeat(64),
    sourceSyncPeerId: 'chrome-studio',
    sourcePeerEnvelope: { source: 'chrome-studio' },
    chatArchive: {
      schema: 'h2o.chatArchive.bundle.v1',
      exportedAt: '2026-06-30T00:00:00.000Z',
      chats: [],
      catalogs: { categories: [], labels: [] },
    },
    libraryMetadataMutationRequests: requests,
    ...fields,
  };
}

function makeClearRequest({ requestId, chatId, expectedCurrentBasisHash }) {
  const id = requestId || `library-metadata-mutation-request:phase14f:${chatId}`;
  return {
    schema: REQUEST_SCHEMA,
    version: '0.1.0-phase6',
    phase: 'phase6-chrome-request-export',
    requestId: id,
    reviewId: id,
    idempotencyKey: `library-metadata-mutation-request:chat-category-clear:category:${chatId}:-:-:${expectedCurrentBasisHash}`,
    intent: 'library-metadata-mutation-request',
    classification: 'metadata-request',
    requestType: 'chat-category-clear',
    action: 'chat-category-clear',
    operation: 'clear',
    metadataKind: 'category',
    subjectKind: 'chat-category-assignment',
    status: 'pending',
    createdAt: '2026-06-30T00:00:00.000Z',
    requestedAt: '2026-06-30T00:00:00.000Z',
    requestedBy: 'chrome-studio',
    source: 'chrome-studio',
    sourceSurface: 'chrome-studio',
    sourcePeerId: 'chrome-studio',
    expectedCurrentBasisHash,
    expectedCurrentBasis: { projectionHash: expectedCurrentBasisHash },
    payload: {
      chatId,
      conversationId: chatId,
      entityId: null,
      labelId: null,
      tagId: null,
      categoryId: null,
      classificationId: null,
      displayName: null,
    },
    privacy: {
      rawChatContent: false,
      rawChatTitles: false,
      accountLinkedMetadata: false,
      displayNameIncluded: false,
      displayNameSource: '',
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
  };
}

function buildDesktopSurface(options = {}) {
  const storage = makeStorage(options.storage || {});
  let clearChatCallCount = 0;
  let assignChatCallCount = 0;
  const categories = new Map([
    ['cat-work', { id: 'cat-work', categoryId: 'cat-work', name: PRIVATE_CATEGORY_NAME, color: '#3366ff' }],
  ]);
  const chats = new Map([
    ['chat-1', { id: 'chat-1', chatId: 'chat-1', title: PRIVATE_CHAT_TITLE, category_id: options.initialCategoryId || 'cat-work' }],
  ]);
  const clearMode = options.clearMode || 'normal';
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
        if (clearMode === 'reported-success-noop') return true;
        chat.category_id = '';
        return true;
      },
      async getForChat(chatId) {
        const chat = chats.get(String(chatId));
        const categoryId = chat && chat.category_id;
        return categoryId ? categories.get(String(categoryId)) || null : null;
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
    chrome: { runtime: { id: 'desktop-phase14f', lastError: null }, storage: { ...storage, onChanged: { addListener() {}, removeListener() {} } } },
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
    __phase14f: {
      getClearChatCallCount: () => clearChatCallCount,
      getAssignChatCallCount: () => assignChatCallCount,
      getChatCategory: (chatId) => (chats.get(String(chatId)) || {}).category_id || '',
      hasChat: (chatId) => chats.has(String(chatId)),
      hasCategory: (categoryId) => categories.has(String(categoryId)),
    },
  });
  ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx;
  const context = vm.createContext(ctx);
  vm.runInContext(read(projectionFile), context, { filename: projectionFile });
  vm.runInContext(read(folderSyncFile), context, { filename: folderSyncFile });
  return { context, storage };
}

async function runSuccessfulClearProof() {
  const desktop = buildDesktopSurface();
  const api = desktop.context.H2O.Studio.sync.folder;
  const projection = desktop.context.H2O.Studio.sync.libraryMetadataExportProjection;
  const p0 = await projection.buildDesktopCanonicalMetadataExport({ requestedBy: 'phase14f-before-clear' });
  const request = makeClearRequest({
    requestId: 'library-metadata-mutation-request:phase14f-clear-success',
    chatId: 'chat-1',
    expectedCurrentBasisHash: p0.hashes.projection,
  });
  const first = await api.importChromeLatestBundle(makeBundle([request]), { mode: 'phase14f-clear-success' });
  const autoApply = first.libraryMetadataMutationRequestAutoApply;
  assert(first.ok === true, 'successful clear import should pass');
  assert(autoApply && autoApply.appliedCount === 1, 'successful clear should emit applied count');
  assert(autoApply.rejectedCount === 0 && autoApply.staleBasisCount === 0, 'successful clear should not reject/stale');
  assert(desktop.context.__phase14f.getClearChatCallCount() === 1, 'clearChat should be called once');
  assert(desktop.context.__phase14f.getChatCategory('chat-1') === '', 'canonical chat category should be clear');
  const p1 = await projection.buildDesktopCanonicalMetadataExport({ requestedBy: 'phase14f-after-clear' });
  assert(p1.counts.chatCategoryAssignmentCount === p0.counts.chatCategoryAssignmentCount - 1,
    'projection assignment count should decrement');
  assert(p1.hashes.projection !== p0.hashes.projection, 'projection hash should change after clear');
  const receipts = await api.listLibraryMetadataMutationReceipts({});
  const appliedReceipt = receipts.find((receipt) => receipt.requestId === request.requestId && receipt.status === 'applied');
  assert(appliedReceipt, 'applied receipt missing');
  assert(appliedReceipt.resultingCanonicalHash === p1.hashes.projection, 'applied receipt hash should match current projection');
  assert(appliedReceipt.counts.chatCategoryAssignmentCount === p1.counts.chatCategoryAssignmentCount,
    'applied receipt count should match current projection');
  assert(appliedReceipt.safety.noHardDelete === true && appliedReceipt.safety.noPurge === true &&
    appliedReceipt.safety.noChatDelete === true && appliedReceipt.safety.noCategoryDelete === true &&
    appliedReceipt.safety.noMetadataDelete === true, 'applied receipt safety flags missing');

  const replay = await api.importChromeLatestBundle(makeBundle([request], {
    exportId: 'phase14f-clear-success-replay',
    sequenceNumber: 15,
    contentSha256: 'e'.repeat(64),
  }), { mode: 'phase14f-clear-success-replay' });
  const replayApply = replay.libraryMetadataMutationRequestAutoApply;
  assert(replayApply.appliedCount === 0 && replayApply.skippedDuplicateCount === 1,
    `replay should be canonical skipped_duplicate: ${JSON.stringify(replayApply)}`);
  assert(desktop.context.__phase14f.getClearChatCallCount() === 1, 'replay must not call clearChat again');
  const replayReceipts = await api.listLibraryMetadataMutationReceipts({});
  assert(replayReceipts.some((receipt) => receipt.requestId === request.requestId &&
    receipt.status === 'skipped_duplicate' &&
    receipt.code === 'library-metadata-mutation-request-already-cleared-canonical'),
    'canonical skipped_duplicate receipt missing');
  return { before: p0, after: p1 };
}

async function runNoopClearRejectedProof() {
  const desktop = buildDesktopSurface({ clearMode: 'reported-success-noop' });
  const api = desktop.context.H2O.Studio.sync.folder;
  const projection = desktop.context.H2O.Studio.sync.libraryMetadataExportProjection;
  const p0 = await projection.buildDesktopCanonicalMetadataExport({ requestedBy: 'phase14f-before-noop-clear' });
  const request = makeClearRequest({
    requestId: 'library-metadata-mutation-request:phase14f-clear-noop',
    chatId: 'chat-1',
    expectedCurrentBasisHash: p0.hashes.projection,
  });
  const result = await api.importChromeLatestBundle(makeBundle([request]), { mode: 'phase14f-clear-noop' });
  const autoApply = result.libraryMetadataMutationRequestAutoApply;
  assert(result.ok === true, 'noop clear import should pass through review');
  assert(autoApply.appliedCount === 0, 'noop clear must not emit applied count');
  assert(autoApply.rejectedCount === 1, 'noop clear should be rejected');
  assert(desktop.context.__phase14f.getClearChatCallCount() === 1, 'noop clear should call clearChat once');
  assert(desktop.context.__phase14f.getChatCategory('chat-1') === 'cat-work', 'noop clear should leave canonical category assigned');
  const receipts = await api.listLibraryMetadataMutationReceipts({});
  assert(!receipts.some((receipt) => receipt.requestId === request.requestId && receipt.status === 'applied'),
    'noop clear must not emit applied receipt');
  assert(receipts.some((receipt) => receipt.requestId === request.requestId &&
    receipt.status === 'rejected' &&
    receipt.code === 'library-metadata-mutation-request-category-clear-not-reflected'),
    'noop clear rejected receipt missing');
}

async function runAppliedReceiptCannotMaskUnclearedCanonicalProof() {
  const staleRequestId = 'library-metadata-mutation-request:phase14f-stale-applied-receipt';
  const desktop = buildDesktopSurface({
    storage: {
      [RECEIPT_KEY]: {
        schema: RECEIPT_MIRROR_SCHEMA,
        version: 1,
        updatedAt: '2026-06-30T00:00:00.000Z',
        receiptCount: 1,
        receipts: [{
          schema: RECEIPT_SCHEMA,
          version: '0.1.0-phase7',
          phase: 'phase7-desktop-apply-receipts',
          receiptId: `library-metadata-mutation-receipt:${staleRequestId}:applied`,
          requestId: staleRequestId,
          reviewId: staleRequestId,
          idempotencyKey: '',
          requestAction: 'chat-category-clear',
          requestType: 'chat-category-clear',
          metadataKind: 'category',
          subjectKind: 'chat-category-assignment',
          status: 'applied',
          reason: 'library-metadata-mutation-request-applied',
          code: 'library-metadata-mutation-request-applied',
          reviewedAt: '2026-06-30T00:00:00.000Z',
          appliedAt: '2026-06-30T00:00:00.000Z',
          resultingCanonicalHash: 'a'.repeat(64),
          privacy: { redacted: true, hashOnly: true },
          safety: { noHardDelete: true, noPurge: true, noChatDelete: true, noCategoryDelete: true, noMetadataDelete: true },
          productSyncReady: false,
        }],
      },
    },
  });
  const api = desktop.context.H2O.Studio.sync.folder;
  const projection = desktop.context.H2O.Studio.sync.libraryMetadataExportProjection;
  const p0 = await projection.buildDesktopCanonicalMetadataExport({ requestedBy: 'phase14f-before-stale-receipt' });
  const request = makeClearRequest({
    requestId: staleRequestId,
    chatId: 'chat-1',
    expectedCurrentBasisHash: p0.hashes.projection,
  });
  const result = await api.importChromeLatestBundle(makeBundle([request]), { mode: 'phase14f-stale-receipt' });
  const autoApply = result.libraryMetadataMutationRequestAutoApply;
  assert(autoApply.appliedCount === 1, 'stale applied receipt must not block real clear when canonical is still assigned');
  assert(autoApply.skippedDuplicateCount === 0, 'stale applied receipt must not produce skipped_duplicate');
  assert(autoApply.warnings.includes('library-metadata-mutation-request-applied-receipt-canonical-mismatch'),
    'stale applied receipt mismatch warning missing');
  assert(desktop.context.__phase14f.getChatCategory('chat-1') === '', 'stale receipt rerun should clear canonical state');
}

for (const file of [folderSyncFile, projectionFile, evidenceFile]) {
  assert(exists(file), `${file}: missing`);
}

const folderSync = read(folderSyncFile);
const evidence = exists(evidenceFile) ? read(evidenceFile) : '';
const clearApplyBody = functionBody(folderSync, 'applyChatCategoryClearLibraryMetadataRequest');
const autoApplyBody = functionBody(folderSync, 'autoApplyLibraryMetadataMutationRequestsFromChromeBundle');

[
  'var afterChatRow = await chats.get(chatId)',
  'library-metadata-mutation-request-category-clear-not-reflected',
  'library-metadata-mutation-request-category-clear-projection-not-reflected',
  'afterAssignmentCount !== beforeAssignmentCount - 1',
].forEach((needle) => assert(clearApplyBody.includes(needle), `clear apply missing ${needle}`));

[
  'canonicalLibraryMetadataMutationDuplicateReceiptData',
  'library-metadata-mutation-request-applied-receipt-canonical-mismatch',
  "else if (applied.status === 'stale_basis') result.staleBasisCount += 1",
].forEach((needle) => assert(autoApplyBody.includes(needle), `auto apply missing ${needle}`));

for (const forbidden of ['DELETE FROM', 'remove(', 'purge', 'hardDelete', 'hard-delete', 'unlink']) {
  assert(!clearApplyBody.includes(forbidden), `clear apply must not contain ${forbidden}`);
}

for (const needle of [
  'Phase 14F',
  'category-clear-not-reflected',
  'receipt-ledger',
  'Product metadata sync: NOT READY',
]) {
  assert(evidence.includes(needle), `evidence missing ${needle}`);
}

if (failures.length === 0) {
  try {
    await runSuccessfulClearProof();
    await runNoopClearRejectedProof();
    await runAppliedReceiptCannotMaskUnclearedCanonicalProof();
  } catch (error) {
    failures.push(`runtime proof threw: ${String((error && error.stack) || error)}`);
  }
}

if (failures.length) {
  console.error('FAIL validate-labels-tags-categories-phase14f-clear-apply-consistency');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(JSON.stringify({
  schema: 'h2o.studio.library-metadata.phase14f-clear-apply-consistency-proof.v1',
  appliedReceiptRequiresCanonicalClear: true,
  clearDecrementsProjectionCount: true,
  replayUsesCurrentCanonicalState: true,
  receiptLedgerCannotMaskUnclearedCanonical: true,
  noopClearRejected: true,
  chromeCanonicalMutation: false,
  destructiveBehaviorAdded: false,
  productSyncReady: false,
}, null, 2));
console.log('PASS validate-labels-tags-categories-phase14f-clear-apply-consistency');
