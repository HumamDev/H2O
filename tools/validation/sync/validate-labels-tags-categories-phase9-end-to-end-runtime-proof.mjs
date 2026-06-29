#!/usr/bin/env node
//
// Phase 9 — Labels / Tags / Categories metadata sync end-to-end runtime proof.
//
// Drives the full safe metadata sync loop in-process through the REAL production
// modules on both surfaces, limited strictly to the chat-category-assign request type:
//
//   Chrome  folder-import.mv3.js                     (request create, receipt import, resolution, projection display)
//   Desktop folder-sync.tauri.js                     (import + validate + apply + receipt via importChromeLatestBundle)
//   Desktop library-metadata-export-projection.tauri (canonical before/after projection hashes)
//
// The only Desktop boundary mock is H2O.Studio.ingestion.importBundle -> { ok:true } (stands in for
// the chat-archive import so the real metadata apply branch in importChromeLatestBundle runs). The
// canonical store (categories/chats) is a small in-memory store that matches the real
// categories.tauri.js assignChat contract (resolves true when a row is updated) and the projection's
// chat.category_id read contract, so a real assignChat genuinely changes the projection hash.
//
// No live Chrome/Desktop surfaces are required; the proof is deterministic and CI-runnable.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { TextEncoder, TextDecoder } from 'node:util';

const root = process.cwd();
const failures = [];
const steps = [];

const folderImportFile = 'src-surfaces-base/studio/sync/folder-import.mv3.js';
const folderSyncFile = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const projectionFile = 'src-surfaces-base/studio/sync/library/library-metadata-export-projection.tauri.js';
const evidenceFile = 'release-evidence/2026-06-25/labels-tags-categories-phase9-end-to-end-runtime-proof.md';

const REQUEST_EXPORT_KEY = 'h2o:studio:library-metadata-mutation-requests:pending-export:v1';
const RECEIPT_SCHEMA = 'h2o.studio.library-metadata-mutation-receipt.v1';

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
function step(name, ok, detail) {
  steps.push({ step: name, ok: ok === true, ...(detail ? { detail } : {}) });
  assert(ok === true, `step failed: ${name}${detail ? ` (${JSON.stringify(detail)})` : ''}`);
}

function makeStorage(initial = {}) {
  const values = new Map(Object.entries(initial || {}));
  return {
    __values: values,
    local: {
      get(keys, cb) {
        const out = {};
        for (const k of Array.isArray(keys) ? keys : [keys]) if (values.has(k)) out[k] = values.get(k);
        cb(out);
      },
      set(items, cb) { for (const [k, v] of Object.entries(items || {})) values.set(k, v); if (cb) cb(); },
      remove(keys, cb) { for (const k of Array.isArray(keys) ? keys : [keys]) values.delete(k); if (cb) cb(); },
    },
  };
}

// In-memory Desktop canonical store. Mirrors the real categories.tauri.js / chats contract that the
// projection and apply paths consume: assignChat resolves true when a chat row is updated, and the
// projection derives chat->category assignments from chat.category_id.
function makeDesktopStore() {
  const categories = new Map([
    ['cat-work', { id: 'cat-work', categoryId: 'cat-work', name: PRIVATE_CATEGORY_NAME, color: '#3366FF', source: 'desktop-sqlite' }],
  ]);
  const chats = new Map([
    ['chat-1', { id: 'chat-1', chatId: 'chat-1', title: PRIVATE_CHAT_TITLE, category_id: '' }],
  ]);
  return {
    __categories: categories,
    __chats: chats,
    categories: {
      async get(id) { return categories.get(String(id)) || null; },
      async getAll() { return Array.from(categories.values()); },
      async assignChat(categoryId, chatId) {
        const c = chats.get(String(chatId));
        if (!c) return false; // real store: rowsAffected > 0
        c.category_id = String(categoryId);
        return true;
      },
      async listChats(catId) { return Array.from(chats.values()).filter((c) => c.category_id === String(catId)); },
    },
    chats: {
      async get(id) { return chats.get(String(id)) || null; },
      async getAll() { return Array.from(chats.values()); },
    },
    labels: { async getAll() { return []; }, async listChats() { return []; } },
    tags: { async getAll() { return []; }, async listChats() { return []; } },
  };
}

function baseGlobals(extra = {}) {
  return {
    console, Date, Math, JSON, TextEncoder, TextDecoder, Uint8Array, Promise, Object, Array, String, Number, Boolean, RegExp, Error,
    crypto: {
      subtle: webcrypto.subtle,
      randomUUID: () => '00000000-0000-4000-8000-' + Math.floor(Math.random() * 1e12).toString().padStart(12, '0'),
    },
    setTimeout: () => 1, clearTimeout: () => {}, setInterval: () => 1, clearInterval: () => {},
    addEventListener() {}, removeEventListener() {}, dispatchEvent() {},
    queueMicrotask: (cb) => Promise.resolve().then(cb),
    ...extra,
  };
}

function buildDesktopSurface() {
  const store = makeDesktopStore();
  const storage = makeStorage();
  const ctx = baseGlobals({
    __TAURI__: {},
    __TAURI_INTERNALS__: {},
    chrome: { runtime: { id: 'desktop-fixture', lastError: null }, storage: { ...storage, onChanged: { addListener() {}, removeListener() {} } } },
    H2O: {
      Studio: {
        platform: { env: { adapter: 'tauri' } },
        store,
        sync: {},
        // Single Desktop boundary mock: stands in for the chat-archive import so the REAL metadata
        // apply branch of importChromeLatestBundle runs. The metadata apply itself is real.
        ingestion: {
          async importBundle() { return { ok: true, schema: 'h2o.studio.fullBundle.v2', chats: { importedChats: 0, importedSnapshots: 0 } }; },
          async dryRunImportBundle() { return { ok: true }; },
        },
      },
    },
  });
  ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx;
  const context = vm.createContext(ctx);
  vm.runInContext(read(projectionFile), context, { filename: projectionFile });
  vm.runInContext(read(folderSyncFile), context, { filename: folderSyncFile });
  return { context, store, storage };
}

function buildChromeSurface() {
  const storage = makeStorage();
  const ctx = baseGlobals({
    document: { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} },
    chrome: {
      runtime: {
        id: 'chrome-fixture',
        lastError: null,
        sendMessage(_m, cb) { if (typeof cb === 'function') cb({ ok: true, result: {} }); return Promise.resolve({ ok: true, result: {} }); },
      },
      storage: { ...storage, onChanged: { addListener() {}, removeListener() {} } },
    },
    H2O: { Studio: { platform: { env: { adapter: 'mv3' } }, sync: {} }, Library: {}, LibraryIndex: { async refresh() { return { ok: true }; }, getAll() { return []; } } },
  });
  ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx;
  const context = vm.createContext(ctx);
  vm.runInContext(read(folderImportFile), context, { filename: folderImportFile });
  return { context, storage };
}

async function runRuntimeProof() {
  const desktop = buildDesktopSurface();
  const desktopApi = desktop.context.H2O.Studio.sync.folder;
  const projection = desktop.context.H2O.Studio.sync.libraryMetadataExportProjection;
  step('desktop-modules-boot', !!desktopApi && typeof desktopApi.importChromeLatestBundle === 'function' &&
    !!projection && typeof projection.buildDesktopCanonicalMetadataExport === 'function');
  if (failures.length) return null;

  // Desktop canonical projection P0 (chat unassigned).
  const p0 = await projection.buildDesktopCanonicalMetadataExport({ requestedBy: 'phase9-before-apply' });
  step('desktop-projection-p0', p0 && p0.counts && p0.counts.chatCategoryAssignmentCount === 0, {
    chatCategoryAssignmentCount: p0.counts.chatCategoryAssignmentCount,
    projectionHash: p0.hashes.projection.slice(0, 16),
  });

  const chrome = buildChromeSurface();
  const chromeApi = chrome.context.H2O.Studio.sync.folder;
  step('chrome-module-boot', !!chromeApi &&
    typeof chromeApi.requestLibraryMetadataMutation === 'function' &&
    typeof chromeApi.importLibraryMetadataMutationReceiptsFromDesktopBundle === 'function' &&
    typeof chromeApi.importLatestBundle === 'function');
  if (failures.length) return null;

  // Chrome first imports the Desktop canonical projection P0 (Phase 3 import path), so its read-model
  // basis hash equals the Desktop projection hash.
  await chromeApi.importLatestBundle(
    { schema: 'h2o.studio.fullBundle.v2', exportedAt: new Date().toISOString(), desktopCanonicalLibraryMetadata: p0 },
    { fileFingerprint: 'sha256:phase9-canonical-p0', reason: 'phase9-canonical-import-p0' },
  );
  const chromeBasisDiag = await chromeApi.diagnoseDesktopCanonicalLibraryMetadata();
  step('chrome-imports-p0-basis', chromeBasisDiag.available === true &&
    chromeBasisDiag.projectionHash === p0.hashes.projection, {
    chromeProjectionHash: (chromeBasisDiag.projectionHash || '').slice(0, 16),
    desktopProjectionHash: p0.hashes.projection.slice(0, 16),
  });

  // STEP 1 — Chrome creates a chat-category-assign request bound to the P0 basis and exports it.
  const created = await chromeApi.requestLibraryMetadataMutation({
    action: 'chat-category-assign',
    chatId: 'chat-1',
    categoryId: 'cat-work',
    expectedCurrentBasisHash: p0.hashes.projection,
  });
  step('chrome-request-create-export', created.ok === true && created.status === 'pending-created' &&
    created.requestType === 'chat-category-assign' && created.requestOnly === true &&
    created.desktopApply === false && created.noChromeCanonicalMutation === true, {
    status: created.status, requestType: created.requestType,
  });
  const requestId = created.requestId;
  const idempotencyKey = created.idempotencyKey;

  const reqMirror = chrome.storage.__values.get(REQUEST_EXPORT_KEY);
  step('chrome-request-export-mirror', reqMirror && Array.isArray(reqMirror.requests) && reqMirror.requests.length === 1 &&
    reqMirror.requests[0].requestType === 'chat-category-assign' && reqMirror.requests[0].status === 'pending', {
    requestCount: reqMirror ? reqMirror.requests.length : 0,
  });
  // The real Chrome->Desktop transport serializes the bundle to chrome-latest.json. Snapshot the
  // pending request bundle as serialized JSON so the later Chrome resolution (which annotates the
  // shared request rows in the Chrome mirror) cannot retroactively mutate what Desktop imported.
  const chromeToDesktopBundle = JSON.parse(JSON.stringify({
    schema: 'h2o.studio.fullBundle.v2',
    exportedAt: new Date().toISOString(),
    libraryMetadataMutationRequests: reqMirror.requests,
  }));

  // STEPS 2-4 — Desktop imports, validates, applies through Desktop-authoritative stores, emits receipt.
  const dImport = await desktopApi.importChromeLatestBundle(chromeToDesktopBundle, {
    fileFingerprint: 'sha256:phase9-request', reason: 'phase9-desktop-apply',
  });
  const autoApply = (dImport.propagation && dImport.propagation.libraryMetadataMutationRequestAutoApply) ||
    dImport.libraryMetadataMutationRequestAutoApply || null;
  step('desktop-import-apply', dImport.status === 'imported' && autoApply &&
    autoApply.appliedCount === 1 && autoApply.rejectedCount === 0 && autoApply.deferredCount === 0 &&
    autoApply.staleBasisCount === 0, {
    importStatus: dImport.status,
    applied: autoApply && autoApply.appliedCount,
    rejected: autoApply && autoApply.rejectedCount,
    deferred: autoApply && autoApply.deferredCount,
    staleBasis: autoApply && autoApply.staleBasisCount,
  });
  step('desktop-store-mutated', desktop.store.__chats.get('chat-1').category_id === 'cat-work');
  step('desktop-apply-safety-flags', autoApply && autoApply.desktopAuthority === true &&
    autoApply.chromeAuthority === false && autoApply.noChromeCanonicalMutation === true &&
    autoApply.noHardDelete === true && autoApply.noPurge === true && autoApply.noChatDelete === true &&
    autoApply.noSnapshotDelete === true && autoApply.noAssetDelete === true &&
    autoApply.noMetadataDelete === true && autoApply.productSyncReady === false);

  const desktopReceipts = await desktopApi.listLibraryMetadataMutationReceipts();
  const appliedReceipt = desktopReceipts.find((r) => r.requestId === requestId);
  step('desktop-emits-receipt', desktopReceipts.length === 1 && appliedReceipt &&
    appliedReceipt.schema === RECEIPT_SCHEMA && appliedReceipt.status === 'applied' &&
    appliedReceipt.idempotencyKey === idempotencyKey, {
    receiptCount: desktopReceipts.length,
    status: appliedReceipt && appliedReceipt.status,
  });

  // STEP 7 — Desktop canonical export reflects the assignment (P1).
  const p1 = await projection.buildDesktopCanonicalMetadataExport({ requestedBy: 'phase9-after-apply' });
  step('desktop-projection-p1-reflects-assignment',
    p1.counts.chatCategoryAssignmentCount === 1 &&
    p1.counts.classificationSignalCount === 1 &&
    p1.hashes.projection !== p0.hashes.projection, {
    before: p0.counts.chatCategoryAssignmentCount,
    after: p1.counts.chatCategoryAssignmentCount,
    hashChanged: p1.hashes.projection !== p0.hashes.projection,
  });

  // Desktop -> Chrome bundle carrying the real receipt(s) and the real canonical projection P1.
  const desktopToChromeBundle = {
    schema: 'h2o.studio.fullBundle.v2',
    exportedAt: new Date().toISOString(),
    libraryMetadataMutationReceipts: desktopReceipts,
    desktopCanonicalLibraryMetadata: p1,
  };

  // STEPS 5-6 — Chrome imports Desktop receipts read-only and resolves the pending request.
  const recImport = await chromeApi.importLibraryMetadataMutationReceiptsFromDesktopBundle(desktopToChromeBundle);
  step('chrome-receipt-import-resolve', recImport.ok === true &&
    recImport.importedReceiptCount === 1 && recImport.statusCounts.applied === 1 &&
    recImport.matchedPendingRequestCount === 1 && recImport.resolvedPendingRequestCount === 1 &&
    recImport.chromeReadOnly === true && recImport.noChromeCanonicalMutation === true, {
    imported: recImport.importedReceiptCount,
    applied: recImport.statusCounts.applied,
    resolved: recImport.resolvedPendingRequestCount,
  });
  const recDiag = await chromeApi.diagnoseLibraryMetadataMutationReceipts();
  step('chrome-request-resolved-readmodel', recDiag.resolvedRequestCount === 1 &&
    recDiag.pendingRequestCount === 0 && recDiag.appliedCount === 1, {
    resolvedRequestCount: recDiag.resolvedRequestCount,
    pendingRequestCount: recDiag.pendingRequestCount,
  });
  // Resolution is read-model/outbox only: the request row is annotated resolved (not deleted).
  const reqMirrorAfter = chrome.storage.__values.get(REQUEST_EXPORT_KEY);
  const resolvedRow = reqMirrorAfter.requests.find((r) => r.requestId === requestId);
  step('chrome-resolution-non-destructive', reqMirrorAfter.requests.length === 1 &&
    resolvedRow && resolvedRow.status === 'resolved' && resolvedRow.resolvedByReceiptId === appliedReceipt.receiptId);

  // STEP 8 — Chrome imports/refreshes the Desktop projection P1 and shows matching sanitized counts/hash.
  await chromeApi.importLatestBundle(desktopToChromeBundle,
    { fileFingerprint: 'sha256:phase9-canonical-p1', reason: 'phase9-canonical-import-p1' });
  const canonDiag = await chromeApi.diagnoseDesktopCanonicalLibraryMetadata();
  step('chrome-projection-refresh-parity', canonDiag.available === true &&
    canonDiag.projectionHash === p1.hashes.projection &&
    canonDiag.chatCategoryAssignmentCount === p1.counts.chatCategoryAssignmentCount &&
    canonDiag.categoryCatalogCount === p1.counts.categoryCatalogCount &&
    canonDiag.classificationSignalCount === p1.counts.classificationSignalCount, {
    chromeProjectionHash: (canonDiag.projectionHash || '').slice(0, 16),
    desktopProjectionHash: p1.hashes.projection.slice(0, 16),
    chromeAssignmentCount: canonDiag.chatCategoryAssignmentCount,
    desktopAssignmentCount: p1.counts.chatCategoryAssignmentCount,
  });

  // IDEMPOTENCY — replay Desktop import + Chrome receipt import; nothing duplicates or double-applies.
  const dImport2 = await desktopApi.importChromeLatestBundle(chromeToDesktopBundle, {
    fileFingerprint: 'sha256:phase9-request-replay', reason: 'phase9-desktop-apply-replay',
  });
  const autoApply2 = (dImport2.propagation && dImport2.propagation.libraryMetadataMutationRequestAutoApply) ||
    dImport2.libraryMetadataMutationRequestAutoApply || null;
  step('desktop-apply-idempotent', autoApply2 && autoApply2.appliedCount === 0 &&
    autoApply2.skippedDuplicateCount === 1, {
    appliedOnReplay: autoApply2 && autoApply2.appliedCount,
    skippedDuplicate: autoApply2 && autoApply2.skippedDuplicateCount,
  });
  const desktopReceipts2 = await desktopApi.listLibraryMetadataMutationReceipts();
  step('desktop-receipt-store-stable', desktopReceipts2.filter((r) => r.status === 'applied' && r.requestId === requestId).length === 1);

  const recImport2 = await chromeApi.importLibraryMetadataMutationReceiptsFromDesktopBundle(desktopToChromeBundle);
  step('chrome-receipt-import-idempotent', recImport2.resolvedPendingRequestCount === 0 &&
    recImport2.alreadyResolvedRequestCount === 1 && recImport2.duplicateReceiptCount === 1, {
    resolvedOnReplay: recImport2.resolvedPendingRequestCount,
    alreadyResolved: recImport2.alreadyResolvedRequestCount,
  });

  // PRIVACY — no raw chat title / category name leaks into the Desktop->Chrome bundle or the Chrome mirrors.
  const exposedSurfaces = JSON.stringify({
    desktopToChromeBundle,
    chromeReceiptMirror: chrome.storage.__values.get('h2o:studio:library-metadata-mutation-receipts:chrome-imported:v1'),
    chromeCanonicalDiag: canonDiag,
    desktopReceiptMirror: desktop.storage.__values.get('h2o:studio:library-metadata-mutation-receipts:export:v1'),
  });
  step('privacy-no-raw-leak', !exposedSurfaces.includes(PRIVATE_CHAT_TITLE) && !exposedSurfaces.includes(PRIVATE_CATEGORY_NAME), {
    chatTitleLeak: exposedSurfaces.includes(PRIVATE_CHAT_TITLE),
    categoryNameLeak: exposedSurfaces.includes(PRIVATE_CATEGORY_NAME),
  });

  // NO DESTRUCTIVE BEHAVIOR — store still holds the chat + category; nothing deleted; flags preserved.
  step('no-destructive-behavior', desktop.store.__chats.size === 1 && desktop.store.__categories.size === 1 &&
    appliedReceipt.safety && appliedReceipt.safety.noHardDelete === true && appliedReceipt.safety.noPurge === true &&
    appliedReceipt.safety.noChatDelete === true && appliedReceipt.safety.noSnapshotDelete === true &&
    appliedReceipt.safety.noAssetDelete === true && appliedReceipt.safety.noMetadataDelete === true);

  // NO CHROME CANONICAL MUTATION — the Chrome surface never wrote the Desktop store; the only store
  // mutation was the Desktop apply. Chrome receipt import + canonical display are read-only.
  step('no-chrome-canonical-mutation', recImport.noChromeCanonicalMutation === true &&
    recImport.noDesktopCanonicalMutationFromChrome === true && canonDiag.canonicalMutation === false &&
    canonDiag.chromeAuthority === false && canonDiag.desktopAuthority === true);

  return {
    schema: 'h2o.studio.library-metadata.phase9-end-to-end-runtime-proof.v1',
    phase: 'phase9-end-to-end-runtime-proof',
    requestType: 'chat-category-assign',
    surfaces: ['chrome:folder-import.mv3.js', 'desktop:folder-sync.tauri.js', 'desktop:library-metadata-export-projection.tauri.js'],
    projection: {
      beforeAssignmentCount: p0.counts.chatCategoryAssignmentCount,
      afterAssignmentCount: p1.counts.chatCategoryAssignmentCount,
      beforeProjectionHash: p0.hashes.projection,
      afterProjectionHash: p1.hashes.projection,
      chromeDisplayedProjectionHash: canonDiag.projectionHash,
    },
    receipts: { desktopApplied: 1, chromeImported: 1, chromeResolvedRequests: 1 },
    idempotency: { desktopReplayApplied: 0, desktopReplaySkippedDuplicate: 1, chromeReplayResolved: 0, chromeReplayAlreadyResolved: 1 },
    privacy: { rawChatTitleLeak: false, rawCategoryNameLeak: false, hashOnly: true },
    safety: { noHardDelete: true, noPurge: true, noChatDelete: true, noSnapshotDelete: true, noAssetDelete: true, noMetadataDelete: true },
    chromeCanonicalMutation: false,
    desktopAuthority: true,
    productSyncReady: false,
    steps,
  };
}

// ---- Static guards ----
for (const file of [folderImportFile, folderSyncFile, projectionFile]) {
  assert(exists(file), `${file}: missing`);
}
if (failures.length === 0) {
  // The loop must remain limited to chat-category-assign and must not introduce broadened apply or
  // destructive metadata behavior in the Desktop apply path.
  const folderSync = read(folderSyncFile);
  assert(folderSync.includes("if (action !== 'chat-category-assign')"),
    `${folderSyncFile}: Desktop apply must remain limited to chat-category-assign`);
  assert(folderSync.includes('library-metadata-mutation-request-action-deferred-phase7'),
    `${folderSyncFile}: broader metadata actions must remain deferred`);
  if (exists(evidenceFile)) {
    const evidence = read(evidenceFile);
    for (const needle of ['chat-category-assign', 'desktopCanonicalLibraryMetadata',
      'libraryMetadataMutationReceipts[]', 'libraryMetadataMutationRequests[]', RECEIPT_SCHEMA]) {
      assert(evidence.includes(needle), `${evidenceFile}: missing ${needle}`);
    }
  }
}

let proof = null;
if (failures.length === 0) {
  try {
    proof = await runRuntimeProof();
  } catch (e) {
    failures.push(`runtime proof threw: ${String((e && e.stack) || e)}`);
  }
}

if (failures.length) {
  console.error('FAIL validate-labels-tags-categories-phase9-end-to-end-runtime-proof');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(JSON.stringify(proof, null, 2));
console.log('PASS validate-labels-tags-categories-phase9-end-to-end-runtime-proof');
