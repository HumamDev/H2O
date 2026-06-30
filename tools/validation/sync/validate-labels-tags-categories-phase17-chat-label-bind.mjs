#!/usr/bin/env node
//
// Phase 17 — non-destructive chat-label-bind metadata request.
//
// Proves, in-process through the real Chrome/Desktop sync modules, that:
//   - Chrome can shape/export a request-only chat-label-bind request.
//   - Desktop applies only the approved safe request types.
//   - Desktop bind uses labels.bindChat(labelId, chatId), not delete/clear/unbind.
//   - Desktop emits applied only after canonical label binding + projection verification.
//   - Replay is idempotent based on current canonical state.
//   - Chrome imports the receipt and refreshed projection read-only.

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
const projectionFile = 'src-surfaces-base/studio/sync/library/library-metadata-export-projection.tauri.js';
const evidenceFile = 'release-evidence/2026-06-25/labels-tags-categories-phase17-chat-label-bind.md';

const REQUEST_EXPORT_KEY = 'h2o:studio:library-metadata-mutation-requests:pending-export:v1';

const DESTRUCTIVE_NEGATIVE_ACTIONS = [
  'chat-label-clear',
  'chat-label-remove',
  'chat-label-unbind',
  'label-delete',
  'label-clear',
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

function objectLiteralBody(source, name) {
  const idx = source.indexOf(`var ${name}`);
  assert(idx >= 0, `${name} missing`);
  if (idx < 0) return '';
  const open = source.indexOf('{', idx);
  assert(open >= 0, `${name} object missing`);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  assert(false, `${name} object parse failed`);
  return '';
}

function appliedActionNames(source) {
  const body = objectLiteralBody(source, 'APPLIED_LIBRARY_METADATA_MUTATION_REQUEST_ACTIONS');
  return Array.from(body.matchAll(/'([^']+)'\s*:\s*true/g)).map((match) => match[1]).sort();
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
  let bindChatCallCount = 0;
  let categoryAssignCallCount = 0;
  let categoryClearCallCount = 0;
  const labels = new Map([
    ['lbl-safe', { id: 'lbl-safe', labelId: 'lbl-safe', name: 'PRIVATE-LABEL-NAME-NOLEAK', color: '#ffcc00' }],
  ]);
  const labelBindings = new Set();
  const chats = new Map([
    ['chat-1', { id: 'chat-1', chatId: 'chat-1', title: 'PRIVATE-CHAT-TITLE-NOLEAK', category_id: '' }],
  ]);
  const store = {
    categories: {
      async get() { return null; },
      async getAll() { return []; },
      async assignChat() { categoryAssignCallCount += 1; return false; },
      async clearChat() { categoryClearCallCount += 1; return false; },
      async listChats() { return []; },
    },
    chats: {
      async get(id) { return chats.get(String(id)) || null; },
      async getAll() { return Array.from(chats.values()); },
    },
    labels: {
      async get(id) { return labels.get(String(id)) || null; },
      async getAll() { return Array.from(labels.values()); },
      async bindChat(labelId, chatId) {
        bindChatCallCount += 1;
        if (!labels.has(String(labelId)) || !chats.has(String(chatId))) return false;
        labelBindings.add(`${chatId}:${labelId}`);
        return true;
      },
      async listForChat(chatId) {
        const out = [];
        for (const key of Array.from(labelBindings.values())) {
          const [cid, lid] = key.split(':');
          if (cid === String(chatId) && labels.has(lid)) out.push(labels.get(lid));
        }
        return out;
      },
      async listChats(labelId) {
        const out = [];
        for (const key of Array.from(labelBindings.values())) {
          const [cid, lid] = key.split(':');
          if (lid === String(labelId) && chats.has(cid)) out.push(chats.get(cid));
        }
        return out;
      },
    },
    tags: { async getAll() { return []; }, async listChats() { return []; } },
  };
  const ctx = baseGlobals({
    __TAURI__: {},
    __TAURI_INTERNALS__: {},
    chrome: { runtime: { id: 'desktop-phase17', lastError: null }, storage: { ...storage, onChanged: { addListener() {}, removeListener() {} } } },
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
    __phase17: {
      getBindChatCallCount: () => bindChatCallCount,
      getCategoryAssignCallCount: () => categoryAssignCallCount,
      getCategoryClearCallCount: () => categoryClearCallCount,
      hasLabelBinding: (chatId, labelId) => labelBindings.has(`${chatId}:${labelId}`),
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
        id: 'chrome-phase17',
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
  return { context, storage };
}

function makeBundle(fields = {}) {
  return {
    schema: 'h2o.studio.fullBundle.v2',
    exportedAt: '2026-06-30T12:00:00.000Z',
    exportId: 'phase17-chat-label-bind',
    sequenceNumber: 17,
    contentSha256: 'd'.repeat(64),
    sourceSyncPeerId: 'chrome-studio',
    sourcePeerEnvelope: { source: 'chrome-studio' },
    chatArchive: {
      schema: 'h2o.chatArchive.bundle.v1',
      exportedAt: '2026-06-30T12:00:00.000Z',
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

  const p0 = await projection.buildDesktopCanonicalMetadataExport({ requestedBy: 'phase17-before-label-bind' });
  assert(p0.counts.labelCatalogCount === 1, 'Desktop projection should start with one label catalog row');
  assert(p0.counts.chatLabelBindingCount === 0, 'Desktop projection should start with zero label bindings');

  const chrome = buildChromeSurface();
  const chromeApi = chrome.context.H2O.Studio.sync.folder;
  assert(chromeApi && typeof chromeApi.requestLibraryMetadataMutation === 'function', 'Chrome request API missing');
  assert(typeof chromeApi.importLatestBundle === 'function', 'Chrome latest import API missing');
  assert(typeof chromeApi.importLibraryMetadataMutationReceiptsFromDesktopBundle === 'function', 'Chrome receipt import API missing');
  if (failures.length) return null;

  await chromeApi.importLatestBundle(makeBundle({ desktopCanonicalLibraryMetadata: p0 }), {
    fileFingerprint: 'phase17-canonical-p0',
  });
  const requestResult = await chromeApi.requestLibraryMetadataMutation({
    action: 'chat-label-bind',
    chatId: 'chat-1',
    labelId: 'lbl-safe',
    expectedCurrentBasisHash: p0.hashes.projection,
    rawChatTitle: 'PRIVATE-CHAT-TITLE-NOLEAK',
    rawChatContent: 'PRIVATE-CHAT-CONTENT-NOLEAK',
    labelName: 'PRIVATE-LABEL-NAME-NOLEAK',
  });
  assert(requestResult.ok === true, 'Chrome chat-label-bind request should be created');
  assert(requestResult.requestType === 'chat-label-bind', 'request type mismatch');
  assert(requestResult.payload?.payload?.labelId === 'lbl-safe', 'bind payload labelId mismatch');
  assert(requestResult.payload?.desktopApply === false && requestResult.payload?.noChromeCanonicalMutation === true,
    'Chrome request must remain request-only/no-mutation');
  assert(requestResult.payload?.privacy?.rawChatContent === false &&
    requestResult.payload?.privacy?.rawChatTitles === false, 'Chrome request privacy flags missing');

  const mirror = chrome.storage.__values.get(REQUEST_EXPORT_KEY);
  assert(mirror && mirror.requests && mirror.requests.length === 1, 'Chrome pending request mirror missing');
  assert(JSON.stringify(mirror).includes('chat-label-bind'), 'Chrome pending mirror should contain bind request');
  assertNotContainsText(JSON.stringify(mirror), 'PRIVATE-CHAT-TITLE-NOLEAK', 'raw chat title');
  assertNotContainsText(JSON.stringify(mirror), 'PRIVATE-CHAT-CONTENT-NOLEAK', 'raw chat content');
  assertNotContainsText(JSON.stringify(mirror), 'PRIVATE-LABEL-NAME-NOLEAK', 'raw label name');

  for (const action of DESTRUCTIVE_NEGATIVE_ACTIONS) {
    const blocked = await chromeApi.requestLibraryMetadataMutation({
      action,
      chatId: 'chat-1',
      labelId: 'lbl-safe',
      expectedCurrentBasisHash: p0.hashes.projection,
    });
    assert(blocked.ok === false, `Chrome should block ${action}`);
  }
  const mirrorAfterBad = chrome.storage.__values.get(REQUEST_EXPORT_KEY);
  assert(mirrorAfterBad.requests.length === 1, 'bad actions must not add pending requests');

  const chromeRequest = JSON.parse(JSON.stringify(mirror.requests[0]));
  const desktopResult = await desktopApi.importChromeLatestBundle(makeBundle({
    libraryMetadataMutationRequests: [chromeRequest],
  }), { mode: 'phase17-chat-label-bind' });
  assert(desktopResult.ok === true, 'Desktop import/apply should pass');
  const autoApply = desktopResult.libraryMetadataMutationRequestAutoApply;
  assert(autoApply && autoApply.appliedCount === 1, 'Desktop should apply one label bind request');
  assert(autoApply.receiptExportReadyCount === 1, 'Desktop should prepare one receipt');
  assert(desktop.context.__phase17.getBindChatCallCount() === 1, 'Desktop bindChat should be called once');
  assert(desktop.context.__phase17.getCategoryAssignCallCount() === 0, 'Desktop assignChat must not be called');
  assert(desktop.context.__phase17.getCategoryClearCallCount() === 0, 'Desktop clearChat must not be called');
  assert(desktop.context.__phase17.hasLabelBinding('chat-1', 'lbl-safe'), 'canonical label binding should exist');

  const p1 = await projection.buildDesktopCanonicalMetadataExport({ requestedBy: 'phase17-after-label-bind' });
  assert(p1.counts.chatLabelBindingCount === 1, 'Desktop projection label binding count should increment to one');
  assert(p1.hashes.chatLabelBindings !== p0.hashes.chatLabelBindings, 'label binding hash should change after bind');
  assert(p1.hashes.projection !== p0.hashes.projection, 'Desktop projection hash should change after bind');

  const receipts = await desktopApi.listLibraryMetadataMutationReceipts({});
  const appliedReceipt = receipts.find((receipt) => receipt.requestId === requestResult.requestId && receipt.status === 'applied');
  assert(appliedReceipt, 'Desktop applied receipt missing');
  assert(appliedReceipt.requestType === 'chat-label-bind', 'Desktop receipt request type mismatch');
  assert(appliedReceipt.resultingCanonicalHash === p1.hashes.projection, 'receipt resulting hash should match bound projection');
  assert(appliedReceipt.privacy.redacted === true && appliedReceipt.privacy.hashOnly === true, 'receipt privacy flags missing');
  assert(appliedReceipt.safety.noHardDelete === true && appliedReceipt.safety.noPurge === true &&
    appliedReceipt.safety.noChatDelete === true && appliedReceipt.safety.noSnapshotDelete === true &&
    appliedReceipt.safety.noAssetDelete === true && appliedReceipt.safety.noLabelDelete === true &&
    appliedReceipt.safety.noMetadataDelete === true, 'receipt no-delete flags missing');
  assertNotContainsText(JSON.stringify(appliedReceipt), 'PRIVATE-CHAT-TITLE-NOLEAK', 'receipt raw chat title');
  assertNotContainsText(JSON.stringify(appliedReceipt), 'PRIVATE-LABEL-NAME-NOLEAK', 'receipt raw label name');

  await chromeApi.importLatestBundle(makeBundle({
    desktopCanonicalLibraryMetadata: p1,
    libraryMetadataMutationReceipts: [appliedReceipt],
  }), { fileFingerprint: 'phase17-canonical-p1-with-receipt' });
  const receiptDiag = await chromeApi.diagnoseLibraryMetadataMutationReceipts({ includeRows: true });
  assert(receiptDiag.statusCounts.applied === 1, 'Chrome receipt diagnostic should count applied receipt');
  assert(receiptDiag.resolvedRequestCount === 1, 'Chrome should resolve the pending bind request');
  assert(receiptDiag.noChromeCanonicalMutation === true, 'Chrome receipt import must be read-only/no canonical mutation');
  const projectionDiag = await chromeApi.diagnoseDesktopCanonicalLibraryMetadata();
  assert(projectionDiag.available === true, 'Chrome projection should be available after refresh');
  assert(projectionDiag.projectionHash === p1.hashes.projection, 'Chrome projection hash should match Desktop after bind');
  const directChromeProjection = chromeApi.getDesktopCanonicalLibraryMetadata();
  assert(directChromeProjection?.counts?.chatLabelBindingCount === 1,
    'Chrome direct read-only projection label binding count should match Desktop after bind');

  const replayResult = await desktopApi.importChromeLatestBundle(makeBundle({
    exportId: 'phase17-chat-label-bind-replay',
    sequenceNumber: 18,
    contentSha256: 'c'.repeat(64),
    libraryMetadataMutationRequests: [chromeRequest],
  }), { mode: 'phase17-chat-label-bind-replay' });
  assert(replayResult.ok === true, 'Desktop replay should pass');
  assert(replayResult.libraryMetadataMutationRequestAutoApply.skippedDuplicateCount === 1,
    `Desktop replay should produce skipped_duplicate: ${JSON.stringify(replayResult.libraryMetadataMutationRequestAutoApply)}`);
  assert(desktop.context.__phase17.getBindChatCallCount() === 1, 'Desktop replay must not call bindChat again');

  return {
    schema: 'h2o.studio.library-metadata.phase17-chat-label-bind-proof.v1',
    requestType: 'chat-label-bind',
    desktopAppliedCount: autoApply.appliedCount,
    desktopReplaySkippedDuplicateCount: replayResult.libraryMetadataMutationRequestAutoApply.skippedDuplicateCount,
    beforeChatLabelBindingCount: p0.counts.chatLabelBindingCount,
    afterChatLabelBindingCount: p1.counts.chatLabelBindingCount,
    chromeProjectionHashMatchesDesktop: projectionDiag.projectionHash === p1.hashes.projection,
    chromeReceiptResolvedRequestCount: receiptDiag.resolvedRequestCount,
    destructiveNegativeActionsChecked: DESTRUCTIVE_NEGATIVE_ACTIONS.length,
    productSyncReady: false,
  };
}

for (const file of [folderImportFile, autoImportFile, folderSyncFile, projectionFile, evidenceFile]) {
  assert(exists(file), `${file}: missing`);
}

const folderImport = read(folderImportFile);
const autoImport = read(autoImportFile);
const folderSync = read(folderSyncFile);
const evidence = exists(evidenceFile) ? read(evidenceFile) : '';

const allowedActions = appliedActionNames(folderSync);
assert(JSON.stringify(allowedActions) === JSON.stringify(['chat-category-assign', 'chat-category-clear', 'chat-label-bind']),
  `Desktop applied request allowlist must be exact: ${JSON.stringify(allowedActions)}`);

for (const file of [folderImportFile, autoImportFile, folderSyncFile]) {
  const source = read(file);
  assert(source.includes("NON_DESTRUCTIVE_CLEAR_ALLOWLIST = new Set(['chat-category-clear'])"),
    `${file}: exact clear allowlist missing`);
  assert(source.includes('!NON_DESTRUCTIVE_CLEAR_ALLOWLIST.has(normalized)'),
    `${file}: destructive guard carve-out missing`);
}

for (const file of [folderImportFile, autoImportFile, folderSyncFile]) {
  assert(read(file).includes("'chat-label-bind': { metadataKind: 'label', subjectKind: 'chat-label-binding', operation: 'bind', requiresChatId: true, requiresId: true }"),
    `${file}: chat-label-bind action spec missing`);
}

const validateBody = functionBody(folderSync, 'validateLibraryMetadataMutationRequestForDesktopApply');
assert(validateBody.includes("action === 'chat-label-bind' && !labelId"), 'Desktop validation must require labelId for chat-label-bind');
assert(validateBody.includes('APPLIED_LIBRARY_METADATA_MUTATION_REQUEST_ACTIONS[action] !== true'), 'Desktop validation must use applied allowlist');

const labelBindBody = functionBody(folderSync, 'applyChatLabelBindLibraryMetadataRequest');
[
  'labels.bindChat(labelId, chatId)',
  'labels.listForChat(chatId)',
  'library-metadata-mutation-request-label-not-found',
  'library-metadata-mutation-request-label-bind-not-reflected',
  'library-metadata-mutation-request-label-bind-projection-not-reflected',
  'chatLabelBindingCount',
  'phase17-chat-label-bind-after-apply',
].forEach((needle) => assert(labelBindBody.includes(needle), `label bind apply missing ${needle}`));
for (const forbidden of ['unbindChat', 'remove(', 'delete(', 'purge', 'hardDelete', 'hard-delete', 'clearChat']) {
  assert(!labelBindBody.includes(forbidden), `label bind apply must not contain ${forbidden}`);
}

const duplicateBody = functionBody(folderSync, 'canonicalLibraryMetadataMutationDuplicateReceiptData');
assert(duplicateBody.includes("action !== 'chat-category-assign' && action !== 'chat-category-clear' && action !== 'chat-label-bind'"),
  'duplicate detection must include chat-label-bind and no other extra actions');
assert(duplicateBody.includes('labelRowsContainLabelId(labelRows, labelId)'), 'duplicate detection must use current canonical label binding state');
assert(duplicateBody.includes('library-metadata-mutation-request-already-bound-canonical'), 'duplicate code missing');

const autoApplyBody = functionBody(folderSync, 'autoApplyLibraryMetadataMutationRequestsFromChromeBundle');
assert(autoApplyBody.includes('applyChatLabelBindLibraryMetadataRequest'), 'auto-apply must route chat-label-bind');
assert(autoApplyBody.includes('applyChatCategoryAssignLibraryMetadataRequest'), 'auto-apply must preserve category assign');
assert(autoApplyBody.includes('applyChatCategoryClearLibraryMetadataRequest'), 'auto-apply must preserve category clear');

for (const action of DESTRUCTIVE_NEGATIVE_ACTIONS) {
  assert(!allowedActions.includes(action), `applied allowlist must not include ${action}`);
}

for (const needle of [
  'chat-label-bind',
  'H2O.Studio.store.labels.bindChat(labelId, chatId)',
  'labels.listForChat(chatId)',
  'chatLabelBindingCount',
  'skipped_duplicate',
  'Product metadata sync: NOT READY globally',
  'No Chrome canonical mutation',
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
  console.error('FAIL validate-labels-tags-categories-phase17-chat-label-bind');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(JSON.stringify(proof, null, 2));
console.log('PASS validate-labels-tags-categories-phase17-chat-label-bind');
