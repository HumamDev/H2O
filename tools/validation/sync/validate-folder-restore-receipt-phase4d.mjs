#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const failures = [];

const files = {
  desktopExport: 'src-surfaces-base/studio/ingestion/export-bundle.tauri.js',
  desktopSync: 'src-surfaces-base/studio/sync/folder-sync.tauri.js',
  preparedDesktopExport: 'apps/studio/desktop/dist/ingestion/export-bundle.tauri.js',
  chromeImport: 'src-surfaces-base/studio/sync/folder-import.mv3.js',
  chromeReviews: 'src-surfaces-base/studio/store/tombstone-reviews.mv3.js',
};

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

function readIfExists(file) {
  const fullPath = path.join(root, file);
  if (!fs.existsSync(fullPath)) return '';
  return fs.readFileSync(fullPath, 'utf8');
}

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function assertIncludes(source, needle, label = needle) {
  assert(source.includes(needle), `missing ${label}`);
}

function assertNotIncludes(source, needle, label = needle) {
  assert(!source.includes(needle), `unexpected ${label}`);
}

function functionBody(source, name) {
  const marker = `function ${name}`;
  const start = source.indexOf(marker);
  if (start === -1) return '';
  const signatureEnd = source.indexOf(')', start);
  const open = source.indexOf('{', signatureEnd === -1 ? start : signatureEnd);
  if (open === -1) return '';
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  return '';
}

const desktopExport = read(files.desktopExport);
const desktopSync = read(files.desktopSync);
const preparedDesktopExport = readIfExists(files.preparedDesktopExport);
const chromeImport = read(files.chromeImport);
const chromeReviews = read(files.chromeReviews);

[
  'h2o.studio.folder-restore-receipt.v1',
  'FOLDER_RESTORE_RECEIPT_SCHEMA',
  'FOLDER_RESTORE_RECEIPT_LIMIT',
  'emptyFolderRestoreReceiptDiagnostics',
  'folderRestoreReceiptFromTombstone',
  'buildFolderRestoreReceiptPayloadFromTombstones',
  'folderRestoreReceipts: asArray(folderRestoreReceiptExport.receipts)',
  'folderRestoreReceiptCount',
  "status: 'restored'",
  "decision: 'desktop-folder-restored'",
  'statusOnly: true',
  'noTombstoneApply: true',
  'noHardDelete: true',
  'noChatDelete: true',
  'bindingRestoreAttemptedCount',
  'bindingRestoredCount',
  'bindingSkippedCount',
  'restoreWarnings',
  'chromeReShowDeferred: true',
  "tombstonePropagation: 'deferred'",
].forEach((needle) => assertIncludes(desktopExport, needle, `Desktop restore receipt export ${needle}`));

assert(
  desktopExport.includes('folderRestoreReceipts: asArray(folderRestoreReceiptExport.receipts)'),
  'Desktop latest.json export must always include top-level folderRestoreReceipts as an array, including the empty-array case',
);

const receiptProjectionBody = functionBody(desktopExport, 'folderRestoreReceiptFromTombstone');
[
  'cleanString(tombstone.recordKind) !== \'folder\'',
  'cleanString(tombstone.restoredAt)',
  'safeObject(meta.recoverySnapshot)',
  'folderIdFromTombstoneRecordId',
  'folderRestoreReceiptId',
  'FOLDER_RESTORE_RECEIPT_SCHEMA',
  "status: 'restored'",
  "decision: 'desktop-folder-restored'",
  'statusOnly: true',
  'noTombstoneApply: true',
  'chromeReShowDeferred: true',
].forEach((needle) => assertIncludes(receiptProjectionBody, needle, `restore receipt projection ${needle}`));

[
  'softDeleteFolder',
  'softDeleteEmptyFolder',
  'createTombstone',
  'markRestored',
  'DELETE FROM',
  'unbindChat',
  'bindChat',
  'removeFolder',
  'hideFolder',
].forEach((needle) => assertNotIncludes(receiptProjectionBody, needle, `mutation in restore receipt projection: ${needle}`));

const restorePayloadBody = functionBody(desktopExport, 'buildFolderRestoreReceiptPayloadFromTombstones');
[
  'folderRestoreReceiptFromTombstone',
  'FOLDER_RESTORE_RECEIPT_LIMIT',
  'statusOnly: true',
  'noTombstoneApply: true',
  "tombstonePropagation: 'deferred'",
  'chromeReShowDeferred: true',
].forEach((needle) => assertIncludes(restorePayloadBody, needle, `restore receipt payload ${needle}`));

[
  'softDeleteFolder',
  'softDeleteEmptyFolder',
  'createTombstone',
  'markRestored',
  'DELETE FROM',
  'unbindChat',
  'bindChat',
].forEach((needle) => assertNotIncludes(restorePayloadBody, needle, `mutation in restore receipt export: ${needle}`));

assertIncludes(desktopSync, 'folderRestoreReceiptCount', 'Desktop syncNow source summary restore receipt count');

if (preparedDesktopExport) {
  assertIncludes(
    preparedDesktopExport,
    'folderRestoreReceipts: asArray(folderRestoreReceiptExport.receipts)',
    'prepared Desktop dist restore receipt export; run prepare-dist if this is missing',
  );
  assertIncludes(
    preparedDesktopExport,
    'h2o.studio.folder-restore-receipt.v1',
    'prepared Desktop dist restore receipt schema; run prepare-dist if this is missing',
  );
}

assertNotIncludes(chromeImport, 'folderRestoreReceipts', 'Chrome restore receipt import is intentionally deferred in 4D.1');
assertNotIncludes(chromeReviews, 'folder-restore-receipt', 'Chrome restore receipt review handling is intentionally deferred in 4D.1');

if (failures.length) {
  console.error('validate-folder-restore-receipt-phase4d failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('validate-folder-restore-receipt-phase4d passed');
