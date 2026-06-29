#!/usr/bin/env node
//
// Phase 10 — read-only Chrome Studio status/display surface for the safe library metadata sync loop.
//
// Verifies that H2O.Studio.sync.libraryMetadataDiagnostics.captureMetadataSyncStatus aggregates the
// existing Phase 6 request diagnostics and Phase 8 receipt diagnostics into a read-only status model,
// with no side effects, no Chrome canonical mutation, no Desktop apply broadening, and counts/flags
// only (no raw chat content/titles/IDs). Drives the real Chrome modules in-process.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { TextEncoder, TextDecoder } from 'node:util';

const root = process.cwd();
const failures = [];

const diagnosticsFile = 'src-surfaces-base/studio/sync/library/library-metadata-diagnostics.js';
const folderImportFile = 'src-surfaces-base/studio/sync/folder-import.mv3.js';
const evidenceFile = 'release-evidence/2026-06-25/labels-tags-categories-phase10-status-display.md';

const STATUS_SCHEMA = 'h2o.studio.sync.library-metadata-sync-status.v1';
const RECEIPT_SCHEMA = 'h2o.studio.library-metadata-mutation-receipt.v1';
const PRIVATE_CHAT_ID = 'PRIVATE-CHAT-ID-NOLEAK';
const PRIVATE_CATEGORY_ID = 'PRIVATE-CATEGORY-ID-NOLEAK';

function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function exists(file) { return fs.existsSync(path.join(root, file)); }
function assert(condition, message) { if (!condition) failures.push(message); }
function assertContains(file, needle, label = needle) { assert(read(file).includes(needle), `${file}: missing ${label}`); }

function functionBody(source, name) {
  const match = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`).exec(source);
  const start = match ? match.index : -1;
  assert(start >= 0, `${name} missing`);
  if (start < 0) return '';
  const open = source.indexOf('{', source.indexOf(')', start));
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') { depth -= 1; if (depth === 0) return source.slice(open + 1, i); }
  }
  return '';
}

function makeStorage(initial = {}) {
  const values = new Map(Object.entries(initial || {}));
  return {
    __values: values,
    local: {
      get(keys, cb) { const out = {}; for (const k of Array.isArray(keys) ? keys : [keys]) if (values.has(k)) out[k] = values.get(k); cb(out); },
      set(items, cb) { for (const [k, v] of Object.entries(items || {})) values.set(k, v); if (cb) cb(); },
      remove(keys, cb) { for (const k of Array.isArray(keys) ? keys : [keys]) values.delete(k); if (cb) cb(); },
    },
  };
}

function baseGlobals(extra = {}) {
  return {
    console, Date, Math, JSON, TextEncoder, TextDecoder, Uint8Array, Promise, Object, Array, String, Number, Boolean, RegExp, Error,
    crypto: { subtle: webcrypto.subtle, randomUUID: () => '00000000-0000-4000-8000-' + Math.floor(Math.random() * 1e12).toString().padStart(12, '0') },
    setTimeout: () => 1, clearTimeout: () => {}, setInterval: () => 1, clearInterval: () => {},
    addEventListener() {}, removeEventListener() {}, dispatchEvent() {},
    queueMicrotask: (cb) => Promise.resolve().then(cb),
    ...extra,
  };
}

function makeHash(seed) { return `${seed}`.padEnd(64, '0').slice(0, 64); }

function makeDesktopReceipt(requestId, idempotencyKey, status) {
  return {
    schema: RECEIPT_SCHEMA, version: '0.1.0-phase7', phase: 'phase7-desktop-apply-receipts',
    receiptId: `library-metadata-mutation-receipt:${requestId}:${status}`,
    requestId, reviewId: requestId, idempotencyKey,
    requestAction: 'chat-category-assign', requestType: 'chat-category-assign',
    metadataKind: 'category', subjectKind: 'chat-category-assignment',
    status, reason: status, code: status,
    reviewedAt: '2026-06-29T12:00:00.000Z', appliedAt: status === 'applied' ? '2026-06-29T12:00:00.000Z' : null,
    source: { surface: 'desktop-studio', authority: 'desktop' },
    requestSource: { surface: 'chrome-studio', peerId: 'chrome-studio' },
    target: { chatIdHash: makeHash('chat'), entityIdHash: makeHash('entity'), metadataKind: 'category' },
    expectedCurrentBasisHash: makeHash('b'), beforeProjectionHash: makeHash('before'),
    resultingCanonicalHash: makeHash('after'), beforeAssignmentHash: makeHash('ba'), afterAssignmentHash: makeHash('aa'),
    counts: {},
    privacy: { redacted: true, hashOnly: true, rawChatIds: false, rawChatTitles: false, rawChatContent: false, rawLabelNames: false, rawTagNames: false, rawCategoryNames: false, rawColors: false, accountLinkedMetadata: false },
    safety: { desktopAuthority: true, chromeAuthority: false, noChromeCanonicalMutation: true, noDesktopCanonicalMutationFromChrome: true, noHardDelete: true, noPurge: true, noChatDelete: true, noSnapshotDelete: true, noAssetDelete: true, noLabelDelete: true, noTagDelete: true, noCategoryDelete: true, noMetadataDelete: true, destructiveMetadataActionsDeferred: true },
    separateFromDesktopCanonicalLibraryMetadata: true, productSyncReady: false,
  };
}

function buildChromeSurface() {
  const storage = makeStorage();
  const ctx = baseGlobals({
    document: { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} },
    chrome: { runtime: { id: 'chrome-fixture', lastError: null, sendMessage(_m, cb) { if (typeof cb === 'function') cb({ ok: true, result: {} }); return Promise.resolve({ ok: true, result: {} }); } }, storage: { ...storage, onChanged: { addListener() {}, removeListener() {} } } },
    H2O: { Studio: { platform: { env: { adapter: 'mv3' } }, sync: {} }, Library: {}, LibraryIndex: { async refresh() { return { ok: true }; }, getAll() { return []; } } },
  });
  ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx;
  const context = vm.createContext(ctx);
  vm.runInContext(read(folderImportFile), context, { filename: folderImportFile });
  vm.runInContext(read(diagnosticsFile), context, { filename: diagnosticsFile });
  return { context, storage };
}

async function runRuntimeProof() {
  const chrome = buildChromeSurface();
  const folder = chrome.context.H2O.Studio.sync.folder;
  const diagnostics = chrome.context.H2O.Studio.sync.libraryMetadataDiagnostics;
  assert(folder && typeof folder.requestLibraryMetadataMutation === 'function', 'Phase 6/8 folder API missing');
  assert(diagnostics && typeof diagnostics.captureMetadataSyncStatus === 'function', 'captureMetadataSyncStatus missing');
  assert(typeof chrome.context.H2O.Studio.sync.captureLibraryMetadataSyncStatus === 'function', 'global status alias missing');
  if (failures.length) return null;

  // Populate state through the real Phase 6/8 APIs: one request, resolved by one applied receipt.
  const created = await folder.requestLibraryMetadataMutation({
    action: 'chat-category-assign', chatId: PRIVATE_CHAT_ID, categoryId: PRIVATE_CATEGORY_ID, expectedCurrentBasisHash: makeHash('b'),
  });
  assert(created.ok === true && created.status === 'pending-created', 'request seed failed');
  const receipt = makeDesktopReceipt(created.requestId, created.idempotencyKey, 'applied');
  const recImport = await folder.importLibraryMetadataMutationReceiptsFromDesktopBundle({
    schema: 'h2o.studio.fullBundle.v2', libraryMetadataMutationReceipts: [receipt],
  });
  assert(recImport.resolvedPendingRequestCount === 1, 'receipt seed should resolve the request');
  if (failures.length) return null;

  // Snapshot KV before the status call to prove read-only (no side effects).
  const kvBefore = JSON.stringify([...chrome.storage.__values.entries()].sort());

  const status = await diagnostics.captureMetadataSyncStatus();
  const kvAfter = JSON.stringify([...chrome.storage.__values.entries()].sort());

  assert(status.schema === STATUS_SCHEMA, 'status schema mismatch');
  assert(status.surface === 'chrome-studio', 'status surface should be chrome-studio');
  assert(status.readOnly === true && status.statusOnly === true && status.mutationWorkflow === false, 'status must be read-only/status-only');
  assert(status.apisAvailable && status.apisAvailable.requests === true && status.apisAvailable.requestDiagnostics === true &&
    status.apisAvailable.receipts === true && status.apisAvailable.receiptDiagnostics === true, 'status should see all Phase 6/8 APIs');

  // Counts reflect the seeded state.
  assert(status.requestCounts.pending === 0 && status.requestCounts.resolved === 1 && status.requestCounts.total === 1,
    `request counts mismatch: ${JSON.stringify(status.requestCounts)}`);
  assert(status.receiptCounts.applied === 1 && status.receiptCounts.total === 1 &&
    status.receiptCounts.rejected === 0 && status.receiptCounts.deferred === 0 &&
    status.receiptCounts.skipped_duplicate === 0 && status.receiptCounts.stale_basis === 0 && status.receiptCounts.invalid === 0,
    `receipt counts mismatch: ${JSON.stringify(status.receiptCounts)}`);
  assert(status.resolvedRequestCount === 1 && status.pendingRequestCount === 0, 'resolved/pending request counts mismatch');

  // Only chat-category-assign is proven/applied; everything else deferred.
  assert(status.onlyRuntimeProvenAppliedType === 'chat-category-assign', 'only-proven-applied-type mismatch');
  assert(Array.isArray(status.appliedRequestTypes) && status.appliedRequestTypes.length === 1 &&
    status.appliedRequestTypes[0] === 'chat-category-assign', 'appliedRequestTypes must be exactly chat-category-assign');
  assert(Array.isArray(status.deferredRequestTypes) && status.deferredRequestTypes.includes('label-create') &&
    status.deferredRequestTypes.includes('classification-set') && !status.deferredRequestTypes.includes('chat-category-assign'),
    'deferredRequestTypes must list broader types and exclude chat-category-assign');

  // Authority + read-only canonical posture.
  assert(status.authority.desktopAuthority === true && status.authority.chromeAuthority === false &&
    status.authority.chromeCanonicalMutation === false && status.authority.chromeReadOnlyCanonical === true,
    'authority posture mismatch');

  // Privacy/safety.
  assert(status.privacy.rawContentReturned === false && status.privacy.rawTitlesReturned === false &&
    status.privacy.accountLinkedMetadataReturned === false && status.privacy.hashOnly === true, 'privacy posture mismatch');
  assert(status.safety.noHardDelete === true && status.safety.noPurge === true && status.safety.noChatDelete === true &&
    status.safety.noSnapshotDelete === true && status.safety.noAssetDelete === true && status.safety.noMetadataDelete === true,
    'safety no-delete flags mismatch');
  assert(status.sideEffectSummary && status.sideEffectSummary.applyExecuted === false &&
    status.sideEffectSummary.chromeRequestExported === false && status.sideEffectSummary.canonicalMutationAttempted === false &&
    status.sideEffectSummary.deleteExecuted === false, 'side-effect summary must show no side effects');
  assert(status.productSyncReady === false, 'product sync must remain not-ready');

  // Display rows present and status-oriented.
  assert(status.display && Array.isArray(status.display.rows) && status.display.rows.length >= 12, 'display rows missing');
  const rowLabels = status.display.rows.map((r) => r.label);
  for (const label of ['Requests pending', 'Requests resolved', 'Receipts applied', 'Only proven applied type', 'Broader metadata types']) {
    assert(rowLabels.includes(label), `display row missing: ${label}`);
  }

  // READ-ONLY: KV storage unchanged by the status call.
  assert(kvBefore === kvAfter, 'captureMetadataSyncStatus mutated chrome.storage (must be read-only)');

  // PRIVACY: opaque chat/category IDs never leak into the status model output.
  const statusText = JSON.stringify(status);
  assert(!statusText.includes(PRIVATE_CHAT_ID) && !statusText.includes(PRIVATE_CATEGORY_ID),
    'status model leaked a raw chat/category id');

  // Stable across repeated reads.
  const status2 = await diagnostics.captureMetadataSyncStatus();
  assert(status2.requestCounts.resolved === 1 && status2.receiptCounts.applied === 1, 'status not stable across reads');
  assert(JSON.stringify([...chrome.storage.__values.entries()].sort()) === kvAfter, 'second status read mutated storage');

  // Graceful degradation when the folder API is absent (no throw, well-formed, warnings present).
  const bare = baseGlobals({ H2O: { Studio: { platform: { env: { adapter: 'mv3' } }, sync: {} } } });
  bare.window = bare; bare.globalThis = bare; bare.self = bare;
  const bareCtx = vm.createContext(bare);
  vm.runInContext(read(diagnosticsFile), bareCtx, { filename: diagnosticsFile });
  const bareStatus = await bareCtx.H2O.Studio.sync.libraryMetadataDiagnostics.captureMetadataSyncStatus();
  assert(bareStatus.schema === STATUS_SCHEMA && bareStatus.readOnly === true &&
    bareStatus.requestCounts.total === 0 && bareStatus.receiptCounts.total === 0 &&
    bareStatus.warnings.includes('library-metadata-sync-status-folder-api-unavailable'),
    'degraded status (no folder API) should be well-formed with warnings');

  return {
    schema: 'h2o.studio.library-metadata.phase10-status-display-proof.v1',
    phase: 'phase10-status-display',
    surface: status.surface,
    displaySurfaceName: status.displaySurfaceName,
    onlyRuntimeProvenAppliedType: status.onlyRuntimeProvenAppliedType,
    requestCounts: status.requestCounts,
    receiptCounts: status.receiptCounts,
    authority: status.authority,
    readOnlyStorageUnchanged: kvBefore === kvAfter,
    privacyNoRawIdLeak: !statusText.includes(PRIVATE_CHAT_ID) && !statusText.includes(PRIVATE_CATEGORY_ID),
    degradedGraceful: bareStatus.warnings.length > 0,
    productSyncReady: false,
  };
}

// ---- Static guards ----
for (const file of [diagnosticsFile, folderImportFile]) assert(exists(file), `${file}: missing`);

if (failures.length === 0) {
  const diagnostics = read(diagnosticsFile);
  for (const needle of [
    "var STATUS_SCHEMA = 'h2o.studio.sync.library-metadata-sync-status.v1'",
    "var ONLY_PROVEN_APPLIED_TYPE = 'chat-category-assign'",
    'async function captureMetadataSyncStatus(',
    'captureMetadataSyncStatus: captureMetadataSyncStatus',
    'metadataSyncStatusSchema: STATUS_SCHEMA',
    'H2O.Studio.sync.captureLibraryMetadataSyncStatus = captureMetadataSyncStatus',
  ]) assert(diagnostics.includes(needle), `${diagnosticsFile}: missing ${needle}`);

  // The status method must only call read-only list/diagnose APIs — never any mutation/sync/apply/export.
  const body = functionBody(diagnostics, 'captureMetadataSyncStatus');
  assert(body.includes('diagnoseLibraryMetadataMutationRequests') && body.includes('diagnoseLibraryMetadataMutationReceipts') &&
    body.includes('listLibraryMetadataMutationRequests') && body.includes('listLibraryMetadataMutationReceipts'),
    'status method must call the read-only Phase 6/8 APIs');
  for (const forbidden of [
    'requestLibraryMetadataMutation(', 'importLibraryMetadataMutationReceiptsFromDesktopBundle(',
    'importLatestBundle(', 'exportChromeToSyncFolder(', 'syncNow(', 'assignChat(',
    'writeKv(', 'storage.set', 'chromeAuthority: true', 'desktopApply: true',
  ]) assert(!body.includes(forbidden), `status method must not contain ${forbidden}`);

  if (exists(evidenceFile)) {
    const evidence = read(evidenceFile);
    for (const needle of ['chat-category-assign', STATUS_SCHEMA, 'captureMetadataSyncStatus',
      'libraryMetadataSyncStatus', 'read-only']) {
      assert(evidence.includes(needle), `${evidenceFile}: missing ${needle}`);
    }
  }
}

let proof = null;
if (failures.length === 0) {
  try { proof = await runRuntimeProof(); }
  catch (e) { failures.push(`runtime proof threw: ${String((e && e.stack) || e)}`); }
}

if (failures.length) {
  console.error('FAIL validate-labels-tags-categories-phase10-status-display');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(JSON.stringify(proof, null, 2));
console.log('PASS validate-labels-tags-categories-phase10-status-display');
