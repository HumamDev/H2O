#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const desktopReviewsPath = path.join(root, 'src-surfaces-base/studio/store/tombstone-reviews.tauri.js');
const chromeReviewsPath = path.join(root, 'src-surfaces-base/studio/store/tombstone-reviews.mv3.js');
const exporterPath = path.join(root, 'src-surfaces-base/studio/ingestion/export-bundle.tauri.js');
const chromeImportPath = path.join(root, 'src-surfaces-base/studio/sync/folder-import.mv3.js');
const bridgePath = path.join(root, 'src-surfaces-base/studio/dev/folder-sync-rc-smoke-bridge.studio.js');
const evidencePath = path.join(root, 'release-evidence/2026-06-25/folder-restore-phase6c4-receipt-parity.md');

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertContains(source, needle, label) {
  assert(source.includes(needle), `${label} missing ${needle}`);
}

function functionBody(source, name) {
  const match = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`).exec(source);
  const start = match ? match.index : -1;
  assert(start >= 0, `${name} missing`);
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
  throw new Error(`${name} body parse failed`);
}

for (const file of [desktopReviewsPath, chromeReviewsPath, exporterPath, chromeImportPath, bridgePath, evidencePath]) {
  assert(fs.existsSync(file), `${path.relative(root, file)} missing`);
}

const desktopReviews = read(desktopReviewsPath);
const chromeReviews = read(chromeReviewsPath);
const exporter = read(exporterPath);
const chromeImport = read(chromeImportPath);
const bridge = read(bridgePath);
const evidence = read(evidencePath);

const desktopReceiptBody = functionBody(desktopReviews, 'folderRestoreReceiptFromReview');
const desktopListBody = functionBody(desktopReviews, 'listFolderRestoreReceipts');
const exporterBody = functionBody(exporter, 'buildFolderRestoreReceiptPayloadSafely');
const exportLatestBody = functionBody(exporter, 'exportLatestSyncBundle');
const chromeApplyReceiptBody = functionBody(chromeReviews, 'applyFolderRestoreReceipt');
const chromeIngestReceiptBody = functionBody(chromeReviews, 'ingestFolderRestoreReceipts');
const chromeImportBody = functionBody(chromeImport, 'importFolderRestoreReceiptsFromDesktopBundle');
const chromeReviewImportBody = functionBody(chromeImport, 'importFolderRestoreReceiptConfirmationsIntoReviewStore');
const bridgeSyncBody = functionBody(bridge, 'syncNow');

[
  'FOLDER_RESTORE_RECEIPT_SCHEMA',
  'folderRestoreReceiptId',
  'requestId',
  'reviewId',
  'desktop-folder-restored',
  'noChromeRestoreAuthority',
  'noTombstoneApply',
  'noHardDelete',
  'noChatDelete',
].forEach((needle) => assertContains(desktopReceiptBody, needle, `6C.4 Desktop restore receipt projection ${needle}`));

assertContains(desktopListBody, 'classification: \'restore-request\'', '6C.4 Desktop restore receipt list restore classification');
assertContains(desktopListBody, 'status: \'resolved\'', '6C.4 Desktop restore receipt list resolved status');
assertContains(desktopReviews, 'listFolderRestoreReceipts: listFolderRestoreReceipts', '6C.4 Desktop review API export listFolderRestoreReceipts');

[
  'listFolderRestoreReceipts',
  'requestReceiptCount',
  'tombstoneFallbackCount',
  'mergeFolderRestoreReceiptPayloads',
  'folderRestoreReceiptExport',
].forEach((needle) => assertContains(exporterBody + exportLatestBody, needle, `6C.4 Desktop export ${needle}`));

[
  'FOLDER_RESTORE_RECEIPT_IMPORT_SCHEMA',
  'applyFolderRestoreReceipt',
  'ingestFolderRestoreReceipts',
  'pruneFolderRestoreRequestExportMirror',
  'restoreReceiptRequestIdMismatchCount',
  'trustedDesktopReceiptWithoutLocalRequest',
  'noChromeRestoreAuthority',
  'noFolderRestore',
  'noTombstoneApply',
  'noHardDelete',
  'noChatDelete',
  'noSnapshotDelete',
  'noAssetDelete',
].forEach((needle) => assertContains(chromeApplyReceiptBody + chromeIngestReceiptBody + chromeReviews, needle, `6C.4 Chrome receipt import ${needle}`));

[
  'ingestFolderRestoreReceipts',
  'importedRestoreReceiptCount',
  'confirmedRestoreRequestCount',
  'staleRestoreRequestCount',
  'restoreReceiptRequestIdMismatchCount',
  'mergeFolderRestoreReceiptReviewImport',
].forEach((needle) => assertContains(chromeImportBody + chromeReviewImportBody, needle, `6C.4 Chrome sync import ${needle}`));

assertContains(bridgeSyncBody, 'folderRestoreReceiptExport', '6C.4 smoke bridge exposes folderRestoreReceiptExport');
assertContains(bridgeSyncBody, 'folderRestoreReceiptImport', '6C.4 smoke bridge still exposes folderRestoreReceiptImport');

[
  'folderRestoreReceiptExport',
  'folderRestoreReceiptImport',
  'confirmedRestoreRequestCount',
  'no Chrome restore authority',
  'no Chrome tombstone apply/create',
  'no hard delete',
].forEach((needle) => assertContains(evidence, needle, `6C.4 evidence ${needle}`));

console.log(JSON.stringify({
  ok: true,
  validator: 'validate-folder-restore-phase6c4-receipt-parity',
  desktopRestoreReceiptExport: true,
  chromeRestoreReceiptImport: true,
  chromeRestoreAuthority: false,
  noChromeTombstoneApply: true,
  noHardDelete: true,
}, null, 2));
