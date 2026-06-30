#!/usr/bin/env node
//
// Phase 14H — live apply receipt/canonical consistency.
//
// Proves stale Chrome category metadata cannot rehydrate a chat category
// after Desktop has emitted an applied chat-category-clear receipt.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { TextEncoder, TextDecoder } from 'node:util';

const root = process.cwd();
const failures = [];

const importBundleFile = 'src-surfaces-base/studio/ingestion/import-bundle.tauri.js';
const folderSyncFile = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const evidenceFile = 'release-evidence/2026-06-25/labels-tags-categories-phase14h-live-apply-receipt-canonical-consistency.md';

const RECEIPT_KEY = 'h2o:studio:library-metadata-mutation-receipts:export:v1';
const RECEIPT_MIRROR_SCHEMA = 'h2o.studio.library-metadata-mutation-receipt.export-mirror.v1';
const RECEIPT_SCHEMA = 'h2o.studio.library-metadata-mutation-receipt.v1';

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

function assert(condition, message) {
  if (!condition) failures.push(message);
}

async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(String(text || ''));
  const hash = await webcrypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
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
  const values = new Map(Object.entries(initial));
  return {
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
    },
    values,
  };
}

function makeBundle(chatId, categoryId) {
  return {
    schema: 'h2o.studio.fullBundle.v2',
    exportId: 'phase14h-stale-category-rehydration',
    sourceSyncPeerId: 'chrome-studio',
    chatArchive: {
      schema: 'h2o.chatArchive.bundle.v1',
      chats: [{
        chatId,
        chatIndex: {
          organization: { categoryId },
        },
        snapshots: [],
      }],
      catalogs: {
        categories: [{ id: categoryId, name: 'PRIVATE-CATEGORY-NAME-NOLEAK' }],
        labels: [],
      },
    },
    chromeStorageLocal: {},
    libraryKv: [],
  };
}

async function buildReceiptMirror(chatId) {
  const chatIdHash = await sha256Hex(`chat:${chatId}`);
  return {
    schema: RECEIPT_MIRROR_SCHEMA,
    version: 1,
    updatedAt: '2026-06-30T00:00:00.000Z',
    receiptCount: 1,
    receipts: [{
      schema: RECEIPT_SCHEMA,
      version: '0.1.0-phase7',
      phase: 'phase7-desktop-apply-receipts',
      receiptId: 'library-metadata-mutation-receipt:library-metadata-mutation-request:phase14h:applied',
      requestId: 'library-metadata-mutation-request:phase14h',
      requestAction: 'chat-category-clear',
      requestType: 'chat-category-clear',
      status: 'applied',
      code: 'library-metadata-mutation-request-applied',
      appliedAt: '2026-06-30T00:00:00.000Z',
      target: { chatIdHash, entityIdHash: '', metadataKind: 'category' },
      privacy: { redacted: true, hashOnly: true },
      safety: {
        noHardDelete: true,
        noPurge: true,
        noChatDelete: true,
        noCategoryDelete: true,
        noMetadataDelete: true,
        noChromeCanonicalMutation: true,
      },
      separateFromDesktopCanonicalLibraryMetadata: true,
      productSyncReady: false,
    }],
  };
}

function makeStore(chatId, categoryId) {
  const categories = new Map([[categoryId, { id: categoryId, categoryId, name: 'PRIVATE-CATEGORY-NAME-NOLEAK' }]]);
  const chats = new Map([[chatId, { id: chatId, chatId, title: 'PRIVATE-CHAT-TITLE-NOLEAK', categoryId: '' }]]);
  return {
    categories: {
      async get(id) { return categories.get(String(id)) || null; },
      async getAll() { return Array.from(categories.values()); },
      async reload() {},
    },
    chats: {
      async get(id) { return chats.get(String(id)) || null; },
      async getAll() { return Array.from(chats.values()); },
      async reload() {},
      async upsert(patch) {
        const id = String(patch.chatId || patch.id || '');
        const existing = chats.get(id) || { id, chatId: id };
        const next = Object.assign({}, existing, patch);
        chats.set(id, next);
        return next;
      },
    },
    labels: { async get() { return null; }, async getAll() { return []; }, async reload() {} },
    tags: { async get() { return null; }, async getAll() { return []; }, async reload() {} },
  };
}

async function runImportProof({ withReceipt }) {
  const chatId = 'phase14h-chat';
  const categoryId = 'cat_general_misc';
  const bulkCalls = [];
  const storage = makeStorage(withReceipt ? { [RECEIPT_KEY]: await buildReceiptMirror(chatId) } : {});
  const store = makeStore(chatId, categoryId);
  const context = vm.createContext({
    console,
    Date,
    Math,
    JSON,
    Object,
    Array,
    String,
    Number,
    Boolean,
    RegExp,
    Error,
    Promise,
    TextEncoder,
    TextDecoder,
    Uint8Array,
    crypto: { subtle: webcrypto.subtle },
    setTimeout: () => 1,
    clearTimeout() {},
    chrome: {
      runtime: { lastError: null },
      storage,
    },
    H2O: {
      Desktop: {
        Sync: {
          async executeLibraryBulkMigration(input) {
            bulkCalls.push(JSON.parse(JSON.stringify(input)));
            return { ok: true, status: 'ok', counts: { chatCategories: (input.chatCategories || []).length } };
          },
        },
      },
      Studio: {
        store,
      },
    },
    __TAURI__: {},
    __TAURI_INTERNALS__: {},
  });
  context.window = context;
  context.globalThis = context;
  context.self = context;
  vm.runInContext(read(importBundleFile), context, { filename: importBundleFile });
  const result = await context.H2O.Studio.ingestion.importBundle(makeBundle(chatId, categoryId), 'merge', {
    sourceSurface: 'chrome-studio',
    targetSurface: 'desktop-studio',
    transport: 'chrome-latest.json',
    f19ChromeDesktopPropagation: true,
    allowLibraryShimFallback: false,
  });
  const bindingCall = bulkCalls.find((call) => call.phase === 'bindings') || null;
  return { result, bindingCall, bulkCalls };
}

for (const file of [importBundleFile, folderSyncFile, evidenceFile]) {
  assert(fs.existsSync(path.join(root, file)), `${file} missing`);
}

const importBundleSource = read(importBundleFile);
const folderSyncSource = read(folderSyncFile);
const evidence = read(evidenceFile);

for (const needle of [
  'LIBRARY_METADATA_MUTATION_RECEIPT_EXPORT_KEY',
  'appliedChatCategoryClearReceiptChatHashes',
  "cleanString(receipt.status) !== 'applied'",
  "cleanString(receipt.requestAction || receipt.requestType) !== 'chat-category-clear'",
  "await sha256Hex('chat:' + id)",
  'library-metadata-category-rehydration-suppressed-after-clear',
  'desktop-applied-chat-category-clear-receipt',
]) {
  assert(importBundleSource.includes(needle), `import guard missing ${needle}`);
}

const importLibraryBindingsBody = functionBody(importBundleSource, 'importLibraryBindingsBulk');
assert(
  importLibraryBindingsBody.indexOf('appliedClearChatHashes') < importLibraryBindingsBody.indexOf('chatCategories.push'),
  'category rehydration guard must run before chatCategories.push'
);

const clearApplyBody = functionBody(folderSyncSource, 'applyChatCategoryClearLibraryMetadataRequest');
for (const needle of [
  'var afterChatRow = await chats.get(chatId)',
  'library-metadata-mutation-request-category-clear-not-reflected',
  'library-metadata-mutation-request-category-clear-projection-not-reflected',
]) {
  assert(clearApplyBody.includes(needle), `Phase 14F clear verification missing ${needle}`);
}

for (const forbidden of ['DELETE FROM', 'remove(', 'purge', 'hardDelete', 'hard-delete', 'unlink']) {
  assert(!importLibraryBindingsBody.includes(forbidden), `category rehydration guard must not contain ${forbidden}`);
  assert(!clearApplyBody.includes(forbidden), `clear apply must not contain ${forbidden}`);
}

for (const needle of [
  'Phase 14H',
  'stale Chrome category metadata',
  'library-metadata-category-rehydration-suppressed-after-clear',
  'Product metadata sync: NOT READY',
]) {
  assert(evidence.includes(needle), `evidence missing ${needle}`);
}

if (failures.length === 0) {
  try {
    const unprotected = await runImportProof({ withReceipt: false });
    const unprotectedBindings = (unprotected.bindingCall && unprotected.bindingCall.chatCategories) || [];
    assert(unprotectedBindings.length === 1, 'without applied clear receipt, category binding should import normally');
    assert(!unprotected.result.libraryMetadataMutationCategoryRehydrationGuard,
      'without receipt, rehydration guard should not be present');

    const protectedRun = await runImportProof({ withReceipt: true });
    const protectedBindings = (protectedRun.bindingCall && protectedRun.bindingCall.chatCategories) || [];
    assert(protectedBindings.length === 0, 'with applied clear receipt, stale category binding must be suppressed');
    assert(protectedRun.result.libraryMetadataMutationCategoryRehydrationGuard &&
      protectedRun.result.libraryMetadataMutationCategoryRehydrationGuard.suppressedCount === 1,
      'suppression diagnostic missing');
    assert(protectedRun.result.warnings.some((warning) =>
      warning && warning.kind === 'library-metadata-category-rehydration-suppressed-after-clear'
    ), 'suppression warning missing');
    const resultText = JSON.stringify(protectedRun.result);
    assert(!resultText.includes('PRIVATE-CHAT-TITLE-NOLEAK'), 'private chat title leaked');
    assert(!resultText.includes('PRIVATE-CATEGORY-NAME-NOLEAK'), 'private category name leaked in guard result');
  } catch (error) {
    failures.push(`runtime import proof threw: ${String((error && error.stack) || error)}`);
  }
}

if (failures.length) {
  console.error('FAIL validate-labels-tags-categories-phase14h-live-apply-receipt-canonical-consistency');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(JSON.stringify({
  schema: 'h2o.studio.library-metadata.phase14h-live-apply-receipt-canonical-consistency-proof.v1',
  staleChromeCategoryRehydrationSuppressedAfterAppliedClear: true,
  unprotectedCategoryBindingStillImports: true,
  receiptTargetUsesHashOnly: true,
  appliedRequestTypes: ['chat-category-assign', 'chat-category-clear'],
  chromeCanonicalMutation: false,
  destructiveBehaviorAdded: false,
  productSyncReady: false,
}, null, 2));
console.log('PASS validate-labels-tags-categories-phase14h-live-apply-receipt-canonical-consistency');
