#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const folderImportPath = path.join(root, 'src-surfaces-base/studio/sync/folder-import.mv3.js');
const reviewsPath = path.join(root, 'src-surfaces-base/studio/store/tombstone-reviews.mv3.js');
const sidebarPath = path.join(root, 'src-surfaces-base/studio/S0Z1g. 🎬 Library Sidebar Sections - Studio.js');
const evidencePath = path.join(root, 'release-evidence/2026-06-25/folder-delete-phase6b4e-chrome-receipt-import.md');

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertContains(source, needle, label) {
  assert(source.includes(needle), `${label} missing ${needle}`);
}

function assertNotContains(source, needle, label) {
  assert(!source.includes(needle), `${label} must not contain ${needle}`);
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

for (const file of [folderImportPath, reviewsPath, sidebarPath, evidencePath]) {
  assert(fs.existsSync(file), `${path.relative(root, file)} missing`);
}

const folderImport = read(folderImportPath);
const reviews = read(reviewsPath);
const sidebar = read(sidebarPath);
const evidence = read(evidencePath);

const normalizeReceiptBody = functionBody(folderImport, 'normalizeFolderDeleteReceiptForChromeHide');
const validateHideBody = functionBody(folderImport, 'validateFolderDeleteReceiptHideTarget');
const hideMirrorBody = functionBody(folderImport, 'hideFolderByDesktopReceiptFromMirror');
const makeHideResultBody = functionBody(folderImport, 'makeFolderDeleteReceiptHideResult');
const hideReceiptsBody = functionBody(folderImport, 'hideFoldersAfterFolderDeleteReceipts');
const mergeHideBody = functionBody(folderImport, 'mergeFolderDeleteReceiptHideResult');
const normalizeImportBody = functionBody(folderImport, 'normalizeFolderDeleteReceiptImportResult');
const applyReceiptBody = functionBody(reviews, 'applyFolderDeleteReceipt');
const makeImportResultBody = functionBody(reviews, 'makeFolderDeleteReceiptImportResult');
const ingestReceiptBody = functionBody(reviews, 'ingestFolderDeleteReceipts');
const diagnoseCompanionBody = functionBody(sidebar, 'diagnoseChromeRecentlyDeletedCompanion');

[
  "cleanString(receipt.schema) !== FOLDER_DELETE_RECEIPT_SCHEMA",
  "cleanString(receipt.status) !== 'applied'",
  "cleanString(receipt.decision) !== 'applied-folder-delete-request'",
  'receipt.statusOnly !== true',
  'receipt.noTombstoneApply !== true',
  'receipt.noHardDelete !== true',
  'receipt.noChatDelete !== true',
  "cleanString(receipt.tombstonePropagation) !== 'deferred'",
].forEach((needle) => assertContains(normalizeReceiptBody, needle, `6B.4e trusted receipt gate ${needle}`));

[
  "found.code) === 'receipt-no-matching-request'",
  'trustedDesktopReceipt: true',
  'trustedDesktopReceiptWithoutLocalRequest: true',
  "warning: 'receipt-no-matching-request'",
].forEach((needle) => assertContains(validateHideBody, needle, `6B.4e trusted no-local-request fallback ${needle}`));

[
  'current.hiddenByChromePendingDelete',
  'pendingDeleteConfirmedByDesktopReceipt',
  'delete nextPending[folderId]',
  'receipt.folderName || receipt.folderNameAtRequest',
  'trustedDesktopReceiptWithoutLocalRequest',
  'noTombstoneCreate: true',
  'noAssetDelete: true',
].forEach((needle) => assertContains(hideMirrorBody, needle, `6B.4e pending-to-receipt hide marker ${needle}`));

assertNotContains(hideMirrorBody, 'removedRow.name || removedRow.title', '6B.4e hide marker must not dereference missing removedRow');

[
  'receiptRows: []',
  'skippedReceipts: []',
  'trustedDesktopReceiptWithoutLocalRequestCount: 0',
  'noAssetDelete: true',
].forEach((needle) => assertContains(makeHideResultBody, needle, `6B.4e hide result diagnostics ${needle}`));

[
  'result.skippedReceipts.push',
  'folderDeleteReceiptHideDiagnosticRow',
  'result.receiptRows.push',
  'target.warning',
  'trustedDesktopReceiptWithoutLocalRequestCount',
].forEach((needle) => assertContains(hideReceiptsBody, needle, `6B.4e hide receipt row accounting ${needle}`));

[
  'base.receiptRows',
  'base.skippedReceipts',
  'base.trustedDesktopReceiptWithoutLocalRequestCount',
  'base.noAssetDelete = true',
].forEach((needle) => assertContains(mergeHideBody, needle, `6B.4e merged import diagnostics ${needle}`));

[
  'receiptRows: Array.isArray(r.receiptRows)',
  'skippedReceipts: Array.isArray(r.skippedReceipts)',
  'trustedDesktopReceiptWithoutLocalRequestCount',
  'noAssetDelete: true',
].forEach((needle) => assertContains(normalizeImportBody, needle, `6B.4e normalized import diagnostics ${needle}`));

[
  'noMatch.warningOnly = true',
  'noMatch.trustedDesktopReceiptWithoutLocalRequest = true',
].forEach((needle) => assertContains(applyReceiptBody, needle, `6B.4e warning-only no local request ${needle}`));

[
  'receiptRows: []',
  'skippedReceipts: []',
  'trustedDesktopReceiptWithoutLocalRequestCount: 0',
  'noAssetDelete: true',
].forEach((needle) => assertContains(makeImportResultBody, needle, `6B.4e store import diagnostics ${needle}`));

[
  'singleWarningOnly',
  'result.receiptRows.push',
  'result.skippedReceipts.push',
  'trustedDesktopReceiptWithoutLocalRequestCount',
  'addReceiptImportCode(result.warnings, blocker && blocker.code)',
  'addReceiptImportCode(result.blockers, blocker && blocker.code)',
].forEach((needle) => assertContains(ingestReceiptBody, needle, `6B.4e warning-only blocker handling ${needle}`));

[
  'const receiptRows = chromeDesktopReceiptHiddenRowsFromState(storageSources.merged)',
  'receiptImportedCount',
  'probeFolderId',
  'probeRequestId',
  'receiptProbeRows',
  'existsInReceiptRows',
  'receiptRows: receiptRows.slice(0, 80)',
].forEach((needle) => assertContains(diagnoseCompanionBody, needle, `6B.4e companion receipt diagnostics ${needle}`));

[
  'purgeRecentlyDeletedFolders',
  'clearRecentlyDeletedRestoredHistory',
  'previewRecentlyDeletedFolderPurge',
  'deleteChat(',
  'deleteSnapshot(',
  'deleteAssets',
  'hardDelete',
].forEach((needle) => assertNotContains(folderImport + reviews + diagnoseCompanionBody, needle, `6B.4e forbidden destructive behavior ${needle}`));

[
  'Phase 6B.4e',
  'trusted Desktop',
  'receipt-no-matching-request',
  'visible-state-only',
  'no Chrome tombstone apply',
  'no Chrome purge authority',
].forEach((needle) => assertContains(evidence, needle, `6B.4e evidence ${needle}`));

console.log(JSON.stringify({
  ok: true,
  validator: 'validate-folder-delete-phase6b4e-chrome-receipt-import',
  folderImport: path.relative(root, folderImportPath),
  reviews: path.relative(root, reviewsPath),
  companion: path.relative(root, sidebarPath),
  evidence: path.relative(root, evidencePath),
  chromeAuthority: 'visible-state-only-receipt-import',
  noChromeTombstoneApply: true,
  noChromePurgeAuthority: true,
}, null, 2));
