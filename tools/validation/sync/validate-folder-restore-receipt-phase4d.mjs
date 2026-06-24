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
  smokeBridge: 'src-surfaces-base/studio/dev/folder-sync-rc-smoke-bridge.studio.js',
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
const smokeBridge = read(files.smokeBridge);
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

[
  'FOLDER_RESTORE_RECEIPT_SCHEMA',
  'folderRestoreReceipts',
  'normalizeFolderRestoreReceiptForChromeReShow',
  'reShowFolderByDesktopRestoreReceiptInMirror',
  'importFolderRestoreReceiptsFromDesktopBundle',
  'mergeFolderRestoreReceiptReShowSummary',
  'folderRestoreReceiptImport',
  'visibleStateOnlyReShow: true',
  'noTombstoneApply: true',
  'noTombstoneCreate: true',
  'noHardDelete: true',
  'noChatDelete: true',
  'noBindingMutation: true',
  'noChatMutation: true',
  'noSnapshotMutation: true',
  "tombstonePropagation: 'deferred'",
].forEach((needle) => assertIncludes(chromeImport, needle, `Chrome restore receipt import ${needle}`));

const chromeRestoreNormalizeBody = functionBody(chromeImport, 'normalizeFolderRestoreReceiptForChromeReShow');
[
  'FOLDER_RESTORE_RECEIPT_SCHEMA',
  "receipt.status) !== 'restored'",
  "receipt.decision) !== 'desktop-folder-restored'",
  'receipt.statusOnly !== true',
  'receipt.noTombstoneApply !== true',
  'receipt.noHardDelete !== true',
  'receipt.noChatDelete !== true',
  'restore-receipt-folder-identity-missing',
].forEach((needle) => assertIncludes(chromeRestoreNormalizeBody, needle, `Chrome restore receipt validation ${needle}`));

const chromeRestoreReShowBody = functionBody(chromeImport, 'reShowFolderByDesktopRestoreReceiptInMirror');
[
  'FOLDER_STATE_KEY_LOCAL',
  'hiddenByDesktopReceipt',
  'restoredByDesktopReceipt',
  'folder-restore-receipt-folder-already-visible',
  'folder-restore-receipt-hidden-row-missing',
  'folder-restore-receipt-folder-re-shown',
  'writeKv(FOLDER_STATE_KEY_LOCAL, next)',
].forEach((needle) => assertIncludes(chromeRestoreReShowBody, needle, `Chrome restore re-show mirror ${needle}`));

[
  'softDeleteFolder',
  'softDeleteEmptyFolder',
  'createTombstone',
  'markRestored',
  'DELETE FROM',
  'unbindChat',
  'bindChat',
  'purge',
  'hardDelete',
].forEach((needle) => assertNotIncludes(chromeRestoreReShowBody, needle, `mutation in Chrome restore re-show: ${needle}`));

const chromeRestoreImportBody = functionBody(chromeImport, 'importFolderRestoreReceiptsFromDesktopBundle');
[
  'folderRestoreReceipts',
  'reShownCount',
  'alreadyVisibleCount',
  'malformedCount',
  'blockerCount',
  'warningCount',
  'state.lastFolderRestoreReceiptImport',
].forEach((needle) => assertIncludes(chromeRestoreImportBody, needle, `Chrome restore receipt import result ${needle}`));

[
  'alreadyRestoreReceiptImport = await importFolderRestoreReceiptsFromDesktopBundle(bundle)',
  'mergeFolderRestoreReceiptReShowSummary(alreadyRefreshSummary, alreadyRestoreReceiptImport)',
  'folderRestoreReceiptImport: alreadyRestoreReceiptImport',
  'numberOrZero(alreadyRestoreReceiptImport.reShownCount) > 0',
].forEach((needle) => assertIncludes(chromeImport, needle, `Chrome duplicate import restore receipt replay ${needle}`));

[
  'folderRestoreReceiptImport: safeObject(result.folderRestoreReceiptImport)',
  'lastFolderRestoreReceiptImport',
  'rawDiagnose.folderRestoreReceiptImport',
  'safeObject(rawDiagnose.desktopToChrome).folderRestoreReceiptImport',
].forEach((needle) => assertIncludes(smokeBridge, needle, `smoke restore receipt diagnostics ${needle}`));

assertNotIncludes(chromeReviews, 'folder-restore-receipt', 'Chrome restore receipt review handling is intentionally deferred in 4D.1');

if (failures.length) {
  console.error('validate-folder-restore-receipt-phase4d failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('validate-folder-restore-receipt-phase4d passed');
