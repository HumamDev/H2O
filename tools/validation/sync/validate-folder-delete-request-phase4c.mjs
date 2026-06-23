#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const failures = [];

const files = {
  reviews: 'src-surfaces-base/studio/store/tombstone-reviews.mv3.js',
  desktopReviews: 'src-surfaces-base/studio/store/tombstone-reviews.tauri.js',
  chromeExport: 'src-surfaces-base/studio/sync/auto-import.mv3.js',
  chromeImport: 'src-surfaces-base/studio/sync/folder-import.mv3.js',
  desktopExport: 'src-surfaces-base/studio/ingestion/export-bundle.tauri.js',
  desktopImport: 'src-surfaces-base/studio/sync/folder-sync.tauri.js',
  actions: 'src-surfaces-base/studio/S0F3b. 🎬 Folders Actions - Studio.js',
  sidebar: 'src-surfaces-base/studio/S0Z1g. 🎬 Library Sidebar Sections - Studio.js',
};

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

function assert(condition, message) {
  if (!condition) failures.push(message);
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

function assertIncludes(source, needle, label = needle) {
  assert(source.includes(needle), `missing ${label}`);
}

const reviews = read(files.reviews);
const desktopReviews = read(files.desktopReviews);
const chromeExport = read(files.chromeExport);
const chromeImport = read(files.chromeImport);
const desktopExport = read(files.desktopExport);
const desktopImport = read(files.desktopImport);
const actions = read(files.actions);
const sidebar = read(files.sidebar);

[
  'h2o.studio.folder-delete-request.v1',
  "'delete-request': true",
  'requestFolderDelete',
  'findPendingFolderDeleteRequest',
  'listFolderDeleteRequests',
  'diagnoseFolderDeleteRequests',
  'folderDeleteRequestPendingCount',
  'desktopApplyRequired: true',
  'noHardDelete: true',
  'noChatDelete: true',
  'noFolderMutation: true',
  'noBindingMutation: true',
  'noChatMutation: true',
  'noSnapshotMutation: true',
].forEach((needle) => assertIncludes(reviews, needle, `review store ${needle}`));

const requestBody = functionBody(reviews, 'requestFolderDelete');
assert(requestBody.includes('findPendingFolderDeleteRequest'), 'requestFolderDelete must dedupe pending requests by folder');
assert(requestBody.includes('createReview'), 'requestFolderDelete must create a review row');
assert(requestBody.includes("classification: 'delete-request'"), 'requestFolderDelete must classify rows as delete-request');
assert(requestBody.includes("status: 'pending'"), 'requestFolderDelete must create pending rows');
assert(!requestBody.includes('softDeleteFolder'), 'Chrome request must not call Desktop soft delete');
assert(!requestBody.includes('softDeleteEmptyFolder'), 'Chrome request must not call Desktop soft delete alias');
assert(!requestBody.includes('createTombstone'), 'Chrome request must not create tombstones');
assert(!requestBody.includes('deleteFolder'), 'Chrome request must not call folder delete helpers');
assert(!requestBody.includes('unbindChat'), 'Chrome request must not unbind chats');
assert(!requestBody.includes('bindChat'), 'Chrome request must not bind chats');

[
  'FOLDER_DELETE_REQUEST_SCHEMA',
  'collectFolderDeleteRequestsForExport',
  'sanitizeFolderDeleteRequestForExport',
  'listFolderDeleteRequests',
  'bundle.folderDeleteRequests',
  'desktopApplyRequired',
  'noHardDelete: true',
  'noChatDelete: true',
  'noFolderMutation: true',
  'noBindingMutation: true',
  'noChatMutation: true',
  'noSnapshotMutation: true',
].forEach((needle) => assertIncludes(chromeExport, needle, `Chrome export ${needle}`));

const collectExportBody = functionBody(chromeExport, 'collectFolderDeleteRequestsForExport');
assert(collectExportBody.includes('listFolderDeleteRequests'), 'Chrome export must source requests from review store');
assert(!collectExportBody.includes('softDeleteFolder'), 'Chrome export must not apply soft delete');
assert(!collectExportBody.includes('createTombstone'), 'Chrome export must not create tombstones');
assert(!collectExportBody.includes('unbindChat'), 'Chrome export must not unbind chats');
assert(!collectExportBody.includes('bindChat'), 'Chrome export must not bind chats');

[
  'h2o.studio.folder-delete-request.v1',
  "'delete-request': true",
  'folderDeleteRequestDedupeKey',
  'findPendingFolderDeleteRequest',
  'listFolderDeleteRequests',
  'ingestFolderDeleteRequests',
  'applyFolderDeleteRequest',
  'listFolderDeleteReceipts',
  'validateFolderDeleteRequestReviewForApply',
  'desktop-approved-chrome-folder-delete-request',
  'applied-folder-delete-request',
  'h2o.studio.folder-delete-receipt.v1',
  'folder-delete-request-imported-not-applied',
  'desktopApplyRequired: true',
  'noApply: true',
  'noHardDelete: true',
  'noChatDelete: true',
  'noFolderMutation: true',
  'noBindingMutation: true',
  'noChatMutation: true',
  'noSnapshotMutation: true',
].forEach((needle) => assertIncludes(desktopReviews, needle, `Desktop review store ${needle}`));

const desktopRequestIngestBody = functionBody(desktopReviews, 'ingestFolderDeleteRequests');
assert(desktopRequestIngestBody.includes('folderDeleteRequests'), 'Desktop request ingest must read folderDeleteRequests section');
assert(desktopRequestIngestBody.includes('ingestFolderDeleteRequestRow'), 'Desktop request ingest must route rows through request-only row handler');
assert(!desktopRequestIngestBody.includes('applyFolderDeleteRequest'), 'Desktop request ingest must not auto-apply delete requests');
assert(!desktopRequestIngestBody.includes('softDeleteFolder'), 'Desktop request ingest must not apply soft delete');
assert(!desktopRequestIngestBody.includes('softDeleteEmptyFolder'), 'Desktop request ingest must not apply empty-folder delete');
assert(!desktopRequestIngestBody.includes('createTombstone'), 'Desktop request ingest must not create tombstones');
assert(!desktopRequestIngestBody.includes('unbindChat'), 'Desktop request ingest must not unbind chats');
assert(!desktopRequestIngestBody.includes('bindChat'), 'Desktop request ingest must not bind chats');

const desktopApplyBody = functionBody(desktopReviews, 'applyFolderDeleteRequest');
assert(desktopApplyBody.includes('validateFolderDeleteRequestReviewForApply'), 'Desktop apply must validate request review before mutation');
assert(desktopApplyBody.includes("folders.softDeleteFolder"), 'Desktop apply must call the safe softDeleteFolder path');
assert(desktopApplyBody.includes("status !== 'pending'") || desktopReviews.includes("currentStatus !== 'pending'"), 'Desktop apply must block non-pending reviews');
assert(desktopApplyBody.includes('desktop-approved-chrome-folder-delete-request'), 'Desktop apply must use the approved Chrome request delete reason');
assert(desktopApplyBody.includes('noHardDelete: true'), 'Desktop apply result must preserve noHardDelete');
assert(desktopApplyBody.includes('noChatDelete: true'), 'Desktop apply result must preserve noChatDelete');
assert(!desktopApplyBody.includes('createTombstone'), 'Desktop apply must not create tombstones directly');
assert(!desktopApplyBody.includes('DELETE FROM'), 'Desktop apply must not use raw SQL DELETE');
assert(!desktopApplyBody.includes('removeFolderFromStateMirror'), 'Desktop apply must not bypass folder store mirror handling');
assert(!desktopApplyBody.includes('unbindChat'), 'Desktop apply must not unbind chats directly');
assert(!desktopApplyBody.includes('bindChat'), 'Desktop apply must not bind chats directly');

const receiptProjectionBody = functionBody(desktopReviews, 'folderDeleteReceiptFromReview');
[
  'FOLDER_DELETE_RECEIPT_SCHEMA',
  'applied-folder-delete-request',
  "status: 'applied'",
  'statusOnly: true',
  'noTombstoneApply: true',
  "tombstonePropagation: 'deferred'",
  'chromeHideDeferred: true',
  'noHardDelete: true',
  'noChatDelete: true',
].forEach((needle) => assertIncludes(receiptProjectionBody, needle, `Desktop receipt projection ${needle}`));
assert(!receiptProjectionBody.includes('softDeleteFolder'), 'Receipt projection must not apply soft delete');
assert(!receiptProjectionBody.includes('createTombstone'), 'Receipt projection must not create tombstones');
assert(!receiptProjectionBody.includes('DELETE FROM'), 'Receipt projection must not use raw SQL DELETE');
assert(!receiptProjectionBody.includes('unbindChat'), 'Receipt projection must not unbind chats');
assert(!receiptProjectionBody.includes('bindChat'), 'Receipt projection must not bind chats');

const receiptListBody = functionBody(desktopReviews, 'listFolderDeleteReceipts');
assert(receiptListBody.includes("status: 'resolved'"), 'Receipt list must read resolved reviews only');
assert(receiptListBody.includes("classification: 'delete-request'"), 'Receipt list must read delete-request reviews only');
assert(receiptListBody.includes('folderDeleteReceiptFromReview'), 'Receipt list must route rows through receipt projection');

[
  'FOLDER_DELETE_RECEIPT_SCHEMA',
  'buildFolderDeleteReceiptPayloadSafely',
  'listFolderDeleteReceipts',
  'folderDeleteReceipts: asArray(folderDeleteReceiptExport.receipts)',
  'folderDeleteReceiptCount',
  'statusOnly: true',
  'noTombstoneApply: true',
  "tombstonePropagation: 'deferred'",
  'chromeHideDeferred: true',
].forEach((needle) => assertIncludes(desktopExport, needle, `Desktop receipt export ${needle}`));

const receiptExportBody = functionBody(desktopExport, 'buildFolderDeleteReceiptPayloadSafely');
assert(receiptExportBody.includes('listFolderDeleteReceipts'), 'Desktop export must source receipts from review store');
assert(receiptExportBody.includes('folderDeleteReceipts'), 'Desktop export diagnostics must name the receipt section');
assert(!receiptExportBody.includes('softDeleteFolder'), 'Desktop receipt export must not apply soft delete');
assert(!receiptExportBody.includes('createTombstone'), 'Desktop receipt export must not create tombstones');
assert(!receiptExportBody.includes('DELETE FROM'), 'Desktop receipt export must not use raw SQL DELETE');
assert(!receiptExportBody.includes('unbindChat'), 'Desktop receipt export must not unbind chats');
assert(!receiptExportBody.includes('bindChat'), 'Desktop receipt export must not bind chats');

assert(!chromeImport.includes('folderDeleteReceipts'), 'Chrome import must not consume folderDeleteReceipts in Phase 4C.4a');
assert(!chromeImport.includes('folder-delete-receipt'), 'Chrome import must not implement folder delete receipts in Phase 4C.4a');

const desktopApplyValidationBody = functionBody(desktopReviews, 'validateFolderDeleteRequestReviewForApply');
[
  "classification) !== 'delete-request'",
  "recordKind) !== 'folder'",
  "currentStatus !== 'pending'",
  'folder-soft-delete-request',
  'desktopApplyRequired',
  'folder-identity-missing',
].forEach((needle) => assertIncludes(desktopApplyValidationBody, needle, `Desktop apply validation ${needle}`));

[
  'folder-delete-requests',
  'sanitizeFolderDeleteRequestsForChromeDesktop',
  'folderDeleteRequests: folderDeleteRequests',
  'folderDeleteRequestCount',
  'ingestFolderDeleteRequestsFromChromeBundle',
  'reviews.ingestFolderDeleteRequests',
  'folderDeleteRequestImport',
].forEach((needle) => assertIncludes(desktopImport, needle, `Desktop import ${needle}`));

const desktopImportBody = functionBody(desktopImport, 'ingestFolderDeleteRequestsFromChromeBundle');
assert(desktopImportBody.includes('reviews.ingestFolderDeleteRequests'), 'Desktop import must call review-store request ingest');
assert(desktopImportBody.includes('noApply'), 'Desktop import must mark request import as no-apply');
assert(!desktopImportBody.includes('applyFolderDeleteRequest'), 'Desktop import must not auto-apply pending requests');
assert(!desktopImportBody.includes('softDeleteFolder'), 'Desktop import must not call softDeleteFolder');
assert(!desktopImportBody.includes('softDeleteEmptyFolder'), 'Desktop import must not call softDeleteEmptyFolder');
assert(!desktopImportBody.includes('createTombstone'), 'Desktop import must not create tombstones');
assert(!desktopImportBody.includes('unbindChat'), 'Desktop import must not unbind chats');
assert(!desktopImportBody.includes('bindChat'), 'Desktop import must not bind chats');

const chromeInstallBody = functionBody(actions, 'installChromeFolderDeleteRequestActions');
assert(chromeInstallBody.includes('requestDelete'), 'Chrome actions facade must expose requestDelete');
assert(chromeInstallBody.includes('listDeleteRequests'), 'Chrome actions facade must expose listDeleteRequests');
assert(chromeInstallBody.includes('diagnoseDeleteRequests'), 'Chrome actions facade must expose diagnoseDeleteRequests');
assert(!chromeInstallBody.includes("existing.delete"), 'Chrome actions facade must not expose delete');
assert(!chromeInstallBody.includes('existing.remove'), 'Chrome actions facade must not expose remove');

[
  'makeChromeFolderDeleteRequestPanel',
  'Request delete (review on Desktop)',
  'requestChromeFolderDelete',
  'chromeFolderDeleteRequestBlockers',
  'folderDeleteRequestBadgeNode',
  'delete requested',
  'loadPendingChromeFolderDeleteRequestIds',
].forEach((needle) => assertIncludes(sidebar, needle, `sidebar ${needle}`));

const chromeBlockers = functionBody(sidebar, 'chromeFolderDeleteRequestBlockers');
[
  'folder-identity-missing',
  'local-review-folder-not-editable',
  'unfiled-folder',
  'system-folder',
  'protected-folder',
  'tombstone-review-store-unavailable',
].forEach((needle) => assertIncludes(chromeBlockers, needle, `sidebar blocker ${needle}`));

const chromeRequestUiBody = functionBody(sidebar, 'requestChromeFolderDelete');
assert(chromeRequestUiBody.includes('requestDelete') || chromeRequestUiBody.includes('requestFolderDelete'), 'Chrome UI must call the request API');
assert(!chromeRequestUiBody.includes('requestCanonicalFolderDeleteApply'), 'Chrome request UI must not call native delete apply');
assert(!chromeRequestUiBody.includes('requestDesktopFolderSoftDelete'), 'Chrome request UI must not call Desktop soft delete');
assert(!chromeRequestUiBody.includes('softDeleteFolder'), 'Chrome request UI must not call softDeleteFolder');
assert(!chromeRequestUiBody.includes('unbindChat'), 'Chrome request UI must not unbind chats');

if (failures.length) {
  console.error('[folder-delete-request-phase4c] FAIL');
  failures.forEach((failure) => console.error(` - ${failure}`));
  process.exit(1);
}

console.log('[folder-delete-request-phase4c] PASS');
console.log(JSON.stringify({
  schema: 'h2o.studio.sync.folder-delete-request-phase4c-validation.v1',
  ok: true,
  requestOnly: true,
  transportRequestOnly: true,
  desktopIngestReviewOnly: true,
  desktopApplyExplicitOnly: true,
  desktopReceiptExportStatusOnly: true,
  chromeReceiptImportDeferred: true,
  noHardDelete: true,
  noChatDelete: true,
  chromeReceiptDeferred: true,
  observedAtIso: new Date().toISOString(),
}, null, 2));
