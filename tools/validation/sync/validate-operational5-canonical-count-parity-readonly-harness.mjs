#!/usr/bin/env node
//
// Operational.5 - canonical count/hash parity read-only harness.
//
// This validator implements a fixture-backed read-only parity engine and checks the real source anchors that expose
// the live data needed by a later Desktop diagnostic. It does not mutate product state and does not claim live READY.

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

const evidencePath = 'release-evidence/2026-07-01/operational5-canonical-count-parity-readonly-harness.md';
const preflightPath = 'release-evidence/2026-07-01/operational5-source-of-truth-canonical-count-parity-preflight.md';
const preflightValidatorPath = 'tools/validation/sync/validate-operational5-source-of-truth-canonical-count-parity-preflight.mjs';
const operational5Path = 'release-evidence/2026-06-30/sync-operational-5-productsyncready-flip-gate.md';
const f1Path = 'release-evidence/2026-06-25/folder-sync-f1-source-of-truth-reconciliation.md';
const f2Path = 'release-evidence/2026-06-25/folder-sync-f2-source-of-truth-drift-detector.md';
const f5DriftProbeValidatorPath = 'tools/validation/sync/validate-folder-sync-f5-desktop-runtime-drift-probe.mjs';
const s9Path = 'release-evidence/2026-07-01/folder-sync-binding-f15-live-restart-survival-closeout.md';
const s10Path = 'release-evidence/2026-07-01/folder-sync-binding-mismatch-reviewed-repair-path-s10.md';
const s11Path = 'release-evidence/2026-07-01/folder-sync-binding-f28-s11-request-submission-proofs.md';
const s12Path = 'release-evidence/2026-07-01/folder-sync-binding-f28-s12-multi-device-import-readonly-proofs.md';
const s13Path = 'release-evidence/2026-07-01/folder-sync-binding-f28-s13-sustained-multi-surface-parity-proof.md';
const s14Path = 'release-evidence/2026-07-01/folder-sync-binding-f28-s14-product-sync-ready-final-review.md';

const foldersStorePath = 'src-surfaces-base/studio/store/folders.tauri.js';
const folderSyncPath = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const folderImportPath = 'src-surfaces-base/studio/sync/folder-import.mv3.js';
const autoImportPath = 'src-surfaces-base/studio/sync/auto-import.mv3.js';
const exportBundlePath = 'src-surfaces-base/studio/ingestion/export-bundle.tauri.js';
const importBundlePath = 'src-surfaces-base/studio/ingestion/import-bundle.tauri.js';
const webdavGatesPath = 'src-surfaces-base/studio/sync/webdav-transport-gates.js';
const settlementWriterPath = 'src-surfaces-base/studio/sync/execute/execute-settlement-writer-library-extension.tauri.js';
const conflictRuntimePath = 'src-surfaces-base/studio/sync/library/library-conflict-runtime.tauri.js';
const chatSavingBoundaryValidatorPath = 'tools/validation/studio/validate-saved-chat-archive-cloud-sync-boundary-v1.mjs';

function repoPath(rel) {
  return path.join(root, rel);
}

function exists(rel) {
  return fs.existsSync(repoPath(rel));
}

function read(rel) {
  return fs.readFileSync(repoPath(rel), 'utf8');
}

function compact(value) {
  return String(value).replace(/\s+/g, ' ');
}

function assertIncludes(source, token, label) {
  assert.ok(String(source).includes(token), `${label}: missing ${token}`);
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function hash(value) {
  return `sha256:${crypto.createHash('sha256').update(stableStringify(value)).digest('hex')}`;
}

function clean(value) {
  return String(value || '').trim();
}

function numberOrZero(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function folderId(row) {
  return clean(row && (row.id || row.folderId || row.folder_id));
}

function chatId(row) {
  return clean(row && (row.chatId || row.chat_id || row.conversationId));
}

function sortOrder(row) {
  if (row && row.sortOrder !== undefined) return numberOrZero(row.sortOrder);
  if (row && row.sort_order !== undefined) return numberOrZero(row.sort_order);
  return 0;
}

function sortedRows(rows, mapper, idKey = 'id') {
  return (Array.isArray(rows) ? rows : [])
    .map(mapper)
    .filter((row) => row && clean(row[idKey]))
    .sort((a, b) => stableStringify(a).localeCompare(stableStringify(b)));
}

function summarizeFolders(rows) {
  const normalized = sortedRows(rows, (row) => ({
    id: folderId(row),
    sortOrder: sortOrder(row),
    deleted: row && (row.deleted === true || row.tombstoned === true || !!row.deletedAt || !!row.tombstoneId),
  }));
  const visible = normalized.filter((row) => row.deleted !== true);
  return {
    count: normalized.length,
    visibleCount: visible.length,
    hash: hash(normalized),
    visibleHash: hash(visible),
    ids: normalized.map((row) => row.id),
  };
}

function summarizeBindings(rows) {
  const normalized = sortedRows(rows, (row) => ({
    chatId: chatId(row),
    folderId: folderId(row),
  }), 'chatId');
  return {
    count: normalized.length,
    hash: hash(normalized),
    rows: normalized,
  };
}

function summarizeTombstones(rows) {
  const normalized = sortedRows(rows, (row) => ({
    folderId: folderId(row),
    tombstoneId: clean(row && (row.tombstoneId || row.recordId || row.id)),
    active: row && row.restoredAt ? false : row && row.active === false ? false : true,
  }), 'folderId');
  return {
    count: normalized.length,
    activeCount: normalized.filter((row) => row.active).length,
    hash: hash(normalized),
  };
}

function mirrorBindingRows(items) {
  const rows = [];
  const object = items && typeof items === 'object' ? items : {};
  for (const fid of Object.keys(object).sort()) {
    for (const cid of Array.isArray(object[fid]) ? object[fid] : []) {
      rows.push({ chatId: clean(cid), folderId: clean(fid) });
    }
  }
  return rows;
}

function summarizeMirror(mirror) {
  const folders = summarizeFolders(mirror && mirror.folders);
  const bindings = summarizeBindings(mirrorBindingRows(mirror && mirror.items));
  const folderSet = new Set(folders.ids);
  const orphanItemBuckets = Object.keys((mirror && mirror.items) || {}).filter((fid) => !folderSet.has(fid)).sort();
  return {
    folderCount: folders.count,
    visibleFolderCount: folders.visibleCount,
    folderHash: folders.hash,
    visibleFolderHash: folders.visibleHash,
    bindingProjectionCount: bindings.count,
    bindingProjectionHash: bindings.hash,
    orphanItemBucketCount: orphanItemBuckets.length,
    orphanItemBucketHash: hash(orphanItemBuckets),
  };
}

function summarizeExportBundle(bundle) {
  const summary = bundle && bundle.summary ? bundle.summary : {};
  const canonicalBindings = bundle && bundle.desktopCanonicalChatFolderBindings ? bundle.desktopCanonicalChatFolderBindings : {};
  const receipts = Array.isArray(bundle && bundle.chatFolderBindingReceipts) ? bundle.chatFolderBindingReceipts : [];
  const applyEvents = bundle && bundle.syncApplyEvents ? bundle.syncApplyEvents : {};
  return {
    schema: clean(bundle && bundle.schema),
    folderCount: numberOrZero(summary.folderCount),
    folderBindingCount: numberOrZero(summary.folderBindingCount),
    tombstoneCount: numberOrZero(summary.tombstoneCount),
    activeTombstoneCount: numberOrZero(summary.activeTombstoneCount),
    desktopCanonicalChatFolderBindingCount: numberOrZero(summary.desktopCanonicalChatFolderBindingCount),
    chatFolderBindingReceiptCount: numberOrZero(summary.chatFolderBindingReceiptCount),
    applyEventCount: numberOrZero(summary.applyEventCount),
    activeCanonicalBindingCount: numberOrZero(canonicalBindings.bindingCount),
    activeDanglingFolderBindingCount: numberOrZero(canonicalBindings.activeDanglingFolderBindingCount),
    deletedFolderBindingCount: numberOrZero(canonicalBindings.deletedFolderBindingCount),
    receiptHash: hash(receipts.map((receipt) => ({
      schema: clean(receipt && receipt.schema),
      status: clean(receipt && receipt.status),
      reason: clean(receipt && receipt.reason),
      resultingBindingHash: clean(receipt && receipt.resultingBindingHash),
    })).sort((a, b) => stableStringify(a).localeCompare(stableStringify(b)))),
    applyEventHash: hash((Array.isArray(applyEvents.events) ? applyEvents.events : []).map((event) => ({
      kind: clean(event && (event.operationKind || event.kind || event.type)),
      digest: clean(event && (event.eventDigest || event.digest || event.id)),
    })).sort((a, b) => stableStringify(a).localeCompare(stableStringify(b)))),
  };
}

function summarizeLedger(ledger) {
  const receipts = Array.isArray(ledger && ledger.receipts) ? ledger.receipts : [];
  const consumed = Array.isArray(ledger && ledger.consumedOperations) ? ledger.consumedOperations : [];
  return {
    receiptCount: receipts.length,
    consumedOperationCount: consumed.length,
    receiptHash: hash(receipts.map((row) => ({
      schema: clean(row && row.schema),
      status: clean(row && row.status),
      reason: clean(row && row.reason),
      resultingBindingHash: clean(row && row.resultingBindingHash),
    })).sort((a, b) => stableStringify(a).localeCompare(stableStringify(b)))),
    consumedHash: hash(consumed.map((row) => ({
      operationKind: clean(row && row.operationKind),
      consumedStatus: clean(row && row.consumedStatus),
      dedupeKeyHash: hash(clean(row && row.dedupeKey)).slice(0, 24),
    })).sort((a, b) => stableStringify(a).localeCompare(stableStringify(b)))),
  };
}

function summarizeConvergence(value) {
  return {
    journalVerifiedCount: numberOrZero(value && value.journalVerifiedCount),
    alreadyCurrentCount: numberOrZero(value && value.alreadyCurrentCount),
    convergedCount: numberOrZero(value && value.convergedCount),
    blockerCount: Array.isArray(value && value.blockers) ? value.blockers.length : 0,
    warningCount: Array.isArray(value && value.warnings) ? value.warnings.length : 0,
    hash: hash({
      journalVerifiedCount: numberOrZero(value && value.journalVerifiedCount),
      alreadyCurrentCount: numberOrZero(value && value.alreadyCurrentCount),
      convergedCount: numberOrZero(value && value.convergedCount),
      blockers: Array.isArray(value && value.blockers) ? value.blockers.slice().sort() : [],
      warnings: Array.isArray(value && value.warnings) ? value.warnings.slice().sort() : [],
    }),
  };
}

function compareSurface(name, actual, expected) {
  const mismatches = [];
  for (const key of Object.keys(expected)) {
    if (actual[key] !== expected[key]) {
      mismatches.push({ key, actual: actual[key], expected: expected[key] });
    }
  }
  return {
    surface: name,
    status: mismatches.length ? 'mismatch' : 'match',
    mismatchCount: mismatches.length,
    mismatches,
  };
}

function buildParityReport(input) {
  const canonicalFolders = summarizeFolders(input.canonicalFolders);
  const canonicalBindings = summarizeBindings(input.canonicalBindings);
  const tombstones = summarizeTombstones(input.tombstones);
  const mirror = summarizeMirror(input.renderMirror);
  const exportBundle = summarizeExportBundle(input.exportBundle);
  const ledger = summarizeLedger(input.ledger);
  const convergence = summarizeConvergence(input.restartConvergence);

  const surfaces = [
    compareSurface('render-mirror-folders', {
      folderCount: mirror.folderCount,
      visibleFolderCount: mirror.visibleFolderCount,
      folderHash: mirror.folderHash,
      visibleFolderHash: mirror.visibleFolderHash,
    }, {
      folderCount: canonicalFolders.count,
      visibleFolderCount: canonicalFolders.visibleCount,
      folderHash: canonicalFolders.hash,
      visibleFolderHash: canonicalFolders.visibleHash,
    }),
    compareSurface('render-mirror-bindings', {
      bindingProjectionCount: mirror.bindingProjectionCount,
      bindingProjectionHash: mirror.bindingProjectionHash,
      orphanItemBucketCount: mirror.orphanItemBucketCount,
    }, {
      bindingProjectionCount: canonicalBindings.count,
      bindingProjectionHash: canonicalBindings.hash,
      orphanItemBucketCount: 0,
    }),
    compareSurface('fullBundle.v2-summary', {
      schema: exportBundle.schema,
      folderCount: exportBundle.folderCount,
      folderBindingCount: exportBundle.folderBindingCount,
      tombstoneCount: exportBundle.tombstoneCount,
      activeTombstoneCount: exportBundle.activeTombstoneCount,
      desktopCanonicalChatFolderBindingCount: exportBundle.desktopCanonicalChatFolderBindingCount,
      activeCanonicalBindingCount: exportBundle.activeCanonicalBindingCount,
    }, {
      schema: 'h2o.studio.fullBundle.v2',
      folderCount: canonicalFolders.count,
      folderBindingCount: mirror.bindingProjectionCount,
      tombstoneCount: tombstones.count,
      activeTombstoneCount: tombstones.activeCount,
      desktopCanonicalChatFolderBindingCount: canonicalBindings.count,
      activeCanonicalBindingCount: canonicalBindings.count,
    }),
    compareSurface('request-receipt-ledger', {
      receiptCount: ledger.receiptCount,
      consumedOperationCount: ledger.consumedOperationCount,
      receiptHash: ledger.receiptHash,
    }, {
      receiptCount: exportBundle.chatFolderBindingReceiptCount,
      consumedOperationCount: exportBundle.applyEventCount,
      receiptHash: exportBundle.receiptHash,
    }),
    compareSurface('restart-convergence', {
      blockerCount: convergence.blockerCount,
      warningCount: convergence.warningCount,
      alreadyCurrentEqualsJournal: convergence.alreadyCurrentCount === convergence.journalVerifiedCount,
    }, {
      blockerCount: 0,
      warningCount: 0,
      alreadyCurrentEqualsJournal: true,
    }),
  ];

  return {
    canonical: { folders: canonicalFolders, bindings: canonicalBindings, tombstones },
    mirror,
    exportBundle,
    ledger,
    convergence,
    surfaces,
    status: surfaces.every((surface) => surface.status === 'match') ? 'match' : 'mismatch',
    mismatchSurfaces: surfaces.filter((surface) => surface.status === 'mismatch').map((surface) => surface.surface),
  };
}

const sharedRows = {
  folders: [
    { id: 'folder-a', sortOrder: 0 },
    { id: 'folder-b', sortOrder: 1 },
  ],
  bindings: [
    { chatId: 'chat-1', folderId: 'folder-a' },
    { chatId: 'chat-2', folderId: 'folder-b' },
  ],
  tombstones: [
    { folderId: 'folder-z', tombstoneId: 'tomb-z', active: true },
  ],
  receipts: [
    { schema: 'h2o.studio.chat-folder-binding-receipt.v1', status: 'applied', reason: 'binding-repair-applied', resultingBindingHash: 'sha256:fixture-bindings' },
  ],
  consumedOperations: [
    { operationKind: 'chat-folder-binding-repair', consumedStatus: 'consumed', dedupeKey: 'dedupe-1' },
  ],
};

function matchingFixture() {
  return {
    canonicalFolders: sharedRows.folders,
    canonicalBindings: sharedRows.bindings,
    tombstones: sharedRows.tombstones,
    renderMirror: {
      folders: sharedRows.folders,
      items: { 'folder-a': ['chat-1'], 'folder-b': ['chat-2'] },
    },
    exportBundle: {
      schema: 'h2o.studio.fullBundle.v2',
      summary: {
        folderCount: 2,
        folderBindingCount: 2,
        tombstoneCount: 1,
        activeTombstoneCount: 1,
        desktopCanonicalChatFolderBindingCount: 2,
        chatFolderBindingReceiptCount: 1,
        applyEventCount: 1,
      },
      desktopCanonicalChatFolderBindings: { bindingCount: 2 },
      chatFolderBindingReceipts: sharedRows.receipts,
      syncApplyEvents: { events: [{ operationKind: 'chat-folder-binding-repair', eventDigest: 'digest-1' }] },
    },
    ledger: {
      receipts: sharedRows.receipts,
      consumedOperations: sharedRows.consumedOperations,
    },
    restartConvergence: {
      journalVerifiedCount: 2,
      alreadyCurrentCount: 2,
      convergedCount: 0,
      blockers: [],
      warnings: [],
    },
  };
}

function mismatchFixture() {
  const fixture = matchingFixture();
  fixture.renderMirror = {
    folders: [{ id: 'folder-a', sortOrder: 0 }, { id: 'folder-extra', sortOrder: 5 }],
    items: { 'folder-a': ['chat-1'], 'folder-orphan': ['chat-orphan'] },
  };
  fixture.exportBundle.summary.folderCount = 3;
  fixture.exportBundle.summary.desktopCanonicalChatFolderBindingCount = 1;
  fixture.exportBundle.desktopCanonicalChatFolderBindings.bindingCount = 1;
  fixture.ledger.receipts = [];
  fixture.restartConvergence = {
    journalVerifiedCount: 2,
    alreadyCurrentCount: 1,
    convergedCount: 1,
    blockers: ['fixture-diverged'],
    warnings: [],
  };
  return fixture;
}

const surfaceExposure = [
  {
    surface: 'Desktop SQLite canonical folders',
    sourceStatus: 'source-exposed-read-only',
    currentStatus: 'requires live diagnostic',
    anchors: ['function listFolders', 'function countFolders', 'getAll: getAll'],
  },
  {
    surface: 'Canonical `folder_bindings`',
    sourceStatus: 'source-exposed-read-only',
    currentStatus: 'requires live diagnostic',
    anchors: ['function listCanonicalChatFolderBindings', 'bindingHash: chatFolderBindingHashFromRows'],
  },
  {
    surface: 'tombstones/recently deleted',
    sourceStatus: 'source-exposed-read-only',
    currentStatus: 'requires live diagnostic',
    anchors: ['function listRecentlyDeletedFolders', 'tombstoneDiagnostics'],
  },
  {
    surface: 'render mirror',
    sourceStatus: 'source-exposed-read-only',
    currentStatus: 'requires live diagnostic',
    anchors: ['FOLDER_STATE_DATA_KEY', 'chromeStorageGet(FOLDER_STATE_DATA_KEY)'],
  },
  {
    surface: 'Chrome/MV3 projection',
    sourceStatus: 'source-exposed-read-only',
    currentStatus: 'requires live diagnostic',
    anchors: ['readOnlyProjection: true', 'desktopApplyRequired: true'],
  },
  {
    surface: '`fullBundle.v2` export/import projection',
    sourceStatus: 'source-exposed-read-only',
    currentStatus: 'requires live diagnostic',
    anchors: ["FULL_BUNDLE_SCHEMA = 'h2o.studio.fullBundle.v2'", 'summary', 'desktopCanonicalChatFolderBindings'],
  },
  {
    surface: 'request/receipt ledgers',
    sourceStatus: 'source-exposed-read-only',
    currentStatus: 'requires live diagnostic',
    anchors: ['chatFolderBindingReceipts', 'syncApplyEvents', 'bindingRepairAlreadyConsumed'],
  },
  {
    surface: 'Restart convergence records',
    sourceStatus: 'source-exposed-read-only',
    currentStatus: 'requires live diagnostic',
    anchors: ['runF15SettledBindingRestartConvergence', 'whenF15SettledBindingRestartConvergenceReady'],
  },
];

for (const rel of [
  evidencePath,
  preflightPath,
  preflightValidatorPath,
  operational5Path,
  f1Path,
  f2Path,
  f5DriftProbeValidatorPath,
  s9Path,
  s10Path,
  s11Path,
  s12Path,
  s13Path,
  s14Path,
  foldersStorePath,
  folderSyncPath,
  folderImportPath,
  autoImportPath,
  exportBundlePath,
  importBundlePath,
  webdavGatesPath,
  settlementWriterPath,
  conflictRuntimePath,
  chatSavingBoundaryValidatorPath,
]) {
  assert.ok(exists(rel), `${rel} must exist`);
}

const evidence = read(evidencePath);
const flat = compact(evidence);
const preflight = read(preflightPath);
const operational5 = read(operational5Path);
const f1 = read(f1Path);
const f2 = read(f2Path);
const f5Probe = read(f5DriftProbeValidatorPath);
const s9 = read(s9Path);
const s10 = read(s10Path);
const s11 = read(s11Path);
const s12 = read(s12Path);
const s13 = read(s13Path);
const s14 = read(s14Path);
const foldersStore = read(foldersStorePath);
const folderSync = read(folderSyncPath);
const folderImport = read(folderImportPath);
const autoImport = read(autoImportPath);
const exportBundleSource = read(exportBundlePath);
const importBundleSource = read(importBundlePath);
const webdavGates = read(webdavGatesPath);
const settlementWriter = read(settlementWriterPath);
const conflictRuntime = read(conflictRuntimePath);

const runtimeCombined = [
  foldersStore,
  folderSync,
  folderImport,
  autoImport,
  exportBundleSource,
  importBundleSource,
  webdavGates,
  settlementWriter,
  conflictRuntime,
].join('\n');

for (const token of [
  'OPERATIONAL.5 CANONICAL COUNT/HASH PARITY READ-ONLY HARNESS IMPLEMENTED - LIVE DIAGNOSTIC STILL REQUIRED',
  '4f76cfbbc557f9898d6b8d2b9adf2b4e33e2564f',
  '138f7e120e385b6b5f4dccccc97a73d5868fd112',
  '69e5a33d946f078761b4344b7ab35cda5b4a3bdb',
  'c9fcc08b3ed3ccab01f7923e68115d0524d52a60',
  'df0323e2369a3ff72b42e585a71dc9a924601a80',
  'f0d19294d958cc0a66a2c13c7f567e1a9a422039',
  'ceba8239b5d347024aca23aab55a92f4006fefc0',
  'source-exposed; live hash requires diagnostic',
  'requires live diagnostic',
  'folderState.items` orphan bucket',
  'No product source edited',
  'No product state mutated',
  'No `productSyncReady` flip',
  'No WebDAV/cloud/relay/`fullBundle.v3`',
  'No Chat Saving WebDAV/cloud/archive CAS',
]) {
  assertIncludes(flat, token, `evidence token ${token}`);
}

assertIncludes(preflight, 'OPERATIONAL.5 SOURCE-OF-TRUTH / CANONICAL COUNT PARITY PREFLIGHT REQUIRED',
  'Operational.5 preflight exists');
assertIncludes(operational5, 'canonical count parity proven', 'Operational.5 parity gate exists');
assertIncludes(f1, 'Folder sync readiness: NOT READY', 'F1 source-of-truth still historical not-ready');
assertIncludes(f2, 'stale-deferred-propagation', 'F2 drift class retained');
assertIncludes(f5Probe, 'mirror.items', 'F5/F2 drift probe can inspect mirror items buckets');
assertIncludes(f5Probe, 'binding-mismatch', 'F5 drift probe detects binding mismatch');

assertIncludes(s9, 'reconcileSurvivalProven:true', 'S9 restart survival complete');
assertIncludes(s10, 'bindingMismatchRoutedToReviewedRepairPath: true', 'S10 reviewed repair route complete');
assertIncludes(s11, 'F28 S11 PROVEN', 'S11 request submission complete');
assertIncludes(s12, 'F28 S12 PROVEN', 'S12 import read-only complete');
assertIncludes(s13, 'F28 S13 SUSTAINED MULTI-SURFACE PARITY PROVEN', 'S13 complete');
assertIncludes(s14, 'KEEP `productSyncReady:false` / NOT FLIPPED', 'S14 keeps productSyncReady false');

for (const exposure of surfaceExposure) {
  assertIncludes(flat, exposure.surface, `evidence surface ${exposure.surface}`);
  assertIncludes(flat, exposure.currentStatus, `evidence current status ${exposure.surface}`);
  for (const anchor of exposure.anchors) {
    assertIncludes(runtimeCombined, anchor, `source anchor ${anchor}`);
  }
}

const matchReport = buildParityReport(matchingFixture());
assert.equal(matchReport.status, 'match', 'matching fixture must match');
assert.deepEqual(matchReport.mismatchSurfaces, [], 'matching fixture has no mismatch surfaces');
for (const surface of matchReport.surfaces) {
  assert.equal(surface.status, 'match', `${surface.surface} should match in positive fixture`);
}

const mismatchReport = buildParityReport(mismatchFixture());
assert.equal(mismatchReport.status, 'mismatch', 'negative fixture must mismatch');
for (const surfaceName of [
  'render-mirror-folders',
  'render-mirror-bindings',
  'fullBundle.v2-summary',
  'request-receipt-ledger',
  'restart-convergence',
]) {
  assert.ok(mismatchReport.mismatchSurfaces.includes(surfaceName), `negative fixture must detect ${surfaceName}`);
}
assert.equal(mismatchReport.mirror.orphanItemBucketCount, 1, 'negative fixture detects one orphan folderState.items bucket');
assert.notEqual(mismatchReport.canonical.bindings.hash, mismatchReport.mirror.bindingProjectionHash,
  'negative fixture separates raw canonical binding hash from mirror projection hash');
assert.notEqual(mismatchReport.exportBundle.activeCanonicalBindingCount, mismatchReport.canonical.bindings.count,
  'negative fixture separates exported active canonical binding count from raw canonical count');

assertIncludes(foldersStore, 'function listFolders', 'folder list read API');
assertIncludes(foldersStore, 'function countFolders', 'folder count read API');
assertIncludes(foldersStore, 'function listCanonicalChatFolderBindings', 'canonical binding list API');
assertIncludes(foldersStore, 'function listRecentlyDeletedFolders', 'recently deleted read API');
assertIncludes(foldersStore, "var FOLDER_STATE_DATA_KEY = 'h2o:prm:cgx:fldrs:state:data:v1'", 'mirror key');
assertIncludes(foldersStore, 'chromeStorageGet(FOLDER_STATE_DATA_KEY)', 'mirror read API');
assertIncludes(foldersStore, 'async function runF15SettledBindingRestartConvergence', 'restart convergence API');
assertIncludes(folderSync, 'bindingHash: chatFolderBindingHashFromRows', 'binding hash helper exposed');
assertIncludes(folderSync, 'bindingRepairAlreadyConsumed', 'consumed ledger read helper');
assertIncludes(exportBundleSource, 'var summary = {', 'export summary exists');
assertIncludes(exportBundleSource, 'desktopCanonicalChatFolderBindingCount', 'export canonical binding count');
assertIncludes(exportBundleSource, 'chatFolderBindingReceiptCount', 'export binding receipt count');
assertIncludes(exportBundleSource, 'applyEventCount', 'export apply event count');
assertIncludes(exportBundleSource, 'folderParity: folderParity', 'export folder parity diagnostics');
assertIncludes(folderImport, 'readOnlyProjection: true', 'folder import read-only projection');
assertIncludes(folderImport, 'chatFolderBindingReceipts', 'folder import receipt projection');

const productSyncReadyFalseCount = (runtimeCombined.match(/productSyncReady\s*:\s*false/g) || []).length;
assert.ok(productSyncReadyFalseCount >= 20, `expected productSyncReady false markers; found ${productSyncReadyFalseCount}`);
assert.ok(!runtimeCombined.includes('productSyncReady: true'), 'productSyncReady must not be true');
assert.ok(!runtimeCombined.includes('productSyncReady = true'), 'productSyncReady assignment must not be true');
assert.doesNotMatch(runtimeCombined, /fullBundle\.v3|h2o\.studio\.fullBundle\.v3/i, 'fullBundle.v3 must not be present');
assertIncludes(folderSync, "webdav: 'deferred'", 'folder sync WebDAV deferred');
assertIncludes(folderImport, "webdav: 'deferred'", 'folder import WebDAV deferred');
assertIncludes(webdavGates, 'product-sync-ready-false-guard', 'WebDAV productSyncReady false guard');
assertIncludes(webdavGates, 'webdavDisabledByDefault: true', 'WebDAV disabled by default');
assert.doesNotMatch(runtimeCombined, /allowF7Fallback\s*:\s*true|f15AllowF7Fallback\s*:\s*true|explicitF7Fallback\s*:\s*true/,
  'fallback flags must not be enabled');
assertIncludes(foldersStore, 'if (fence && fence.durable === true && result.matchesRequested === true)',
  'durable/hash gate remains strict');
assertIncludes(settlementWriter, 'requireContext: true', 'settlement context requirement remains');
assertIncludes(conflictRuntime, 'library-conflict-runtime-context-missing', 'conflict runtime context guard remains');
assertIncludes(folderSync, 'post-apply-binding-hash-mismatch', 'post-apply hash gate remains');
assertIncludes(foldersStore, 'noBindingRepair: true', 'F11 render mirror remains no-write for binding repair');

const result = {
  schema: 'h2o.studio.operational5.canonical-count-parity-readonly-harness.validator.v1',
  verdict: 'OPERATIONAL5_CANONICAL_COUNT_HASH_PARITY_READONLY_HARNESS_IMPLEMENTED_LIVE_DIAGNOSTIC_REQUIRED',
  evidence: evidencePath,
  productSyncReady: false,
  productSyncReadyFlipped: false,
  productSyncReadyFalseLiteralCount: productSyncReadyFalseCount,
  matchFixtureStatus: matchReport.status,
  mismatchFixtureStatus: mismatchReport.status,
  mismatchSurfacesDetected: mismatchReport.mismatchSurfaces,
  orphanFolderStateItemsBucketDetected: mismatchReport.mirror.orphanItemBucketCount === 1,
  surfaceExposure: surfaceExposure.map(({ surface, sourceStatus, currentStatus }) => ({ surface, sourceStatus, currentStatus })),
  readOnlyExposureGaps: surfaceExposure
    .filter((surface) => surface.currentStatus === 'requires live diagnostic')
    .map((surface) => surface.surface),
  liveMismatchesFound: 'not-run',
  nextRequiredAction: 'live-read-only-operational5-parity-diagnostic',
  webdavCloudRelayStarted: false,
  chatSavingCasBlocked: true,
};

console.log(JSON.stringify(result, null, 2));
console.log('PASS validate-operational5-canonical-count-parity-readonly-harness');
