#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const tauriReviewPath = path.join(root, 'src-surfaces-base/studio/store/tombstone-reviews.tauri.js');
const tauriSyncPath = path.join(root, 'src-surfaces-base/studio/sync/folder-sync.tauri.js');
const desktopExportPath = path.join(root, 'src-surfaces-base/studio/ingestion/export-bundle.tauri.js');
const mv3ReviewPath = path.join(root, 'src-surfaces-base/studio/store/tombstone-reviews.mv3.js');
const mv3ImportPath = path.join(root, 'src-surfaces-base/studio/sync/folder-import.mv3.js');
const autoImportPath = path.join(root, 'src-surfaces-base/studio/sync/auto-import.mv3.js');
const bridgePath = path.join(root, 'src-surfaces-base/studio/dev/folder-sync-rc-smoke-bridge.studio.js');
const folderStorePath = path.join(root, 'src-surfaces-base/studio/store/folders.tauri.js');
const evidencePath = path.join(root, 'release-evidence/2026-06-25/chat-folder-binding-phase-b9-desktop-apply-receipt.md');

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

[
  tauriReviewPath,
  tauriSyncPath,
  desktopExportPath,
  mv3ReviewPath,
  mv3ImportPath,
  autoImportPath,
  bridgePath,
  folderStorePath,
  evidencePath,
].forEach((file) => assert(fs.existsSync(file), `${path.relative(root, file)} missing`));

const tauriReview = read(tauriReviewPath);
const tauriSync = read(tauriSyncPath);
const desktopExport = read(desktopExportPath);
const mv3Review = read(mv3ReviewPath);
const mv3Import = read(mv3ImportPath);
const autoImport = read(autoImportPath);
const bridge = read(bridgePath);
const folderStore = read(folderStorePath);
const evidence = read(evidencePath);

const desktopApplyBody = functionBody(tauriReview, 'applyChatFolderBindingRequest');
const desktopUnfileApplyBody = functionBody(tauriReview, 'applyChatFolderBindingUnfileRequest');
const desktopMarkAppliedBody = functionBody(tauriReview, 'markChatFolderBindingRequestApplied');
const desktopRawApplyBody = functionBody(tauriReview, 'chatFolderBindingRequestRawWithApplyResult');
const desktopValidateBody = functionBody(tauriReview, 'validateChatFolderBindingRequestReviewForApply');
const desktopNormalizeBody = functionBody(tauriReview, 'normalizeChatFolderBindingRequest');
const desktopReceiptBody = functionBody(tauriReview, 'chatFolderBindingReceiptFromReview');
const desktopIngestBody = functionBody(tauriReview, 'ingestChatFolderBindingRequests');
const syncIngestBody = functionBody(tauriSync, 'ingestChatFolderBindingRequestsFromChromeBundle');
const syncApplyBody = functionBody(tauriSync, 'autoApplyChatFolderBindingRequestsFromChromeBundle');
const exportReceiptBody = functionBody(desktopExport, 'buildChatFolderBindingReceiptPayloadSafely');
const chromeReceiptIngestBody = functionBody(mv3Review, 'ingestChatFolderBindingReceipts');
const chromeReceiptApplyBody = functionBody(mv3Review, 'applyChatFolderBindingReceipt');
const chromeReceiptApplyResultBody = functionBody(mv3Review, 'makeChatFolderBindingReceiptApplyResult');
const chromeImportBody = functionBody(mv3Import, 'importChatFolderBindingReceiptsFromDesktopBundle');
const bridgeSummaryBody = functionBody(bridge, 'summarizeFolderSyncDiagnose');

[
  "CHAT_FOLDER_BINDING_REQUEST_SCHEMA = 'h2o.studio.chat-folder-binding-request.v1'",
  "CHAT_FOLDER_BINDING_RECEIPT_SCHEMA = 'h2o.studio.chat-folder-binding-receipt.v1'",
  "'binding-request': true",
  'ingestChatFolderBindingRequests: ingestChatFolderBindingRequests',
  'applyChatFolderBindingRequest: applyChatFolderBindingRequest',
  'listChatFolderBindingReceipts: listChatFolderBindingReceipts',
  'chatFolderBindingReceiptSchema: CHAT_FOLDER_BINDING_RECEIPT_SCHEMA',
].forEach((needle) => assertContains(tauriReview, needle, `B9 Desktop review store ${needle}`));

[
  'cleanScalar(payload.schema) !== CHAT_FOLDER_BINDING_REQUEST_SCHEMA',
  "cleanScalar(payload.recordKind) !== 'folderBinding'",
  "cleanScalar(payload.classification) !== 'binding-request'",
  "cleanScalar(payload.status) !== 'pending'",
  "sourceSurface !== 'chrome-studio'",
  'payload.desktopApplyRequired !== true',
  'payload.noLocalApply !== true',
].forEach((needle) => assertContains(desktopNormalizeBody, needle, `B9 Desktop request normalize ${needle}`));

[
  "cleanScalar(review.classification) !== 'binding-request'",
  "cleanScalar(review.recordKind) !== 'folderBinding'",
  "currentStatus !== 'pending'",
  'normalizeChatFolderBindingRequest',
  'request.chatId',
  'request.targetFolderId',
].forEach((needle) => assertContains(desktopValidateBody, needle, `B9 Desktop validation ${needle}`));

[
  'folders.moveCanonicalChatFolderBinding',
  'expectedCurrentFolderId',
  'phase-b9-auto-apply-chrome-chat-folder-binding-request',
  'markChatFolderBindingRequestApplied',
].forEach((needle) => assertContains(desktopApplyBody, needle, `B9 Desktop apply ${needle}`));

[
  'applied-chat-folder-binding-request',
  'already-applied-chat-folder-binding-request',
  'appliedAt',
].forEach((needle) => assertContains(desktopMarkAppliedBody, needle, `B9 Desktop applied marker ${needle}`));

[
  'noChromeBindingAuthority: true',
  'noChromeDestructiveBindingApply: true',
  'noHardDelete: true',
  'noChatDelete: true',
  'noSnapshotDelete: true',
  'noAssetDelete: true',
].forEach((needle) => assertContains(desktopRawApplyBody, needle, `B9 Desktop raw apply payload ${needle}`));

[
  'folders.unbindChat',
  'expectedCurrentFolderId',
  'phase-b9-auto-apply-chrome-chat-folder-binding-request',
  'noHardDelete: true',
  'noChatDelete: true',
  'noSnapshotDelete: true',
  'noAssetDelete: true',
].forEach((needle) => assertContains(desktopUnfileApplyBody, needle, `B9 Desktop unfile apply ${needle}`));

[
  "schema: CHAT_FOLDER_BINDING_RECEIPT_SCHEMA",
  "decision === 'already-applied-chat-folder-binding-request' ? 'already-applied' : 'applied'",
  'appliedAt',
  'requestId',
  'chatId',
  'beforeFolderId',
  'afterFolderId',
  'expectedCurrentFolderId',
  'sourceSurface',
  'noChromeBindingAuthority: true',
  'noHardDelete: true',
  'noChatDelete: true',
].forEach((needle) => assertContains(desktopReceiptBody, needle, `B9 Desktop receipt ${needle}`));

[
  'chatFolderBindingRequests',
  'found',
  'inserted',
  'updated',
  'invalid',
  'failed',
].forEach((needle) => assertContains(desktopIngestBody, needle, `B9 Desktop ingest ${needle}`));

[
  "'chat-folder-binding-requests'",
  'sanitizeChatFolderBindingRequestsForChromeDesktop',
  'ingestChatFolderBindingRequestsFromChromeBundle',
  'autoApplyChatFolderBindingRequestsFromChromeBundle',
  'chatFolderBindingRequestImport',
  'chatFolderBindingRequestAutoApply',
  'desktopAppliedChatFolderBindingRequestCount',
].forEach((needle) => assertContains(tauriSync, needle, `B9 Desktop sync ${needle}`));

[
  'bundle.chatFolderBindingRequests',
  'reviews.ingestChatFolderBindingRequests',
].forEach((needle) => assertContains(syncIngestBody + syncApplyBody, needle, `B9 Desktop sync lane ${needle}`));

[
  'CHAT_FOLDER_BINDING_RECEIPT_SCHEMA',
  'buildChatFolderBindingReceiptPayloadSafely',
  'listChatFolderBindingReceipts',
  'chatFolderBindingReceipts',
  'chatFolderBindingReceiptExport',
  'chatFolderBindingReceiptCount',
  'noChromeRestoreAuthority: true',
  'noHardDelete: true',
  'noChatDelete: true',
].forEach((needle) => assertContains(desktopExport, needle, `B9 Desktop export ${needle}`));

[
  'api.listChatFolderBindingReceipts',
  'receiptCount',
  'exportedCount',
].forEach((needle) => assertContains(exportReceiptBody, needle, `B9 receipt export body ${needle}`));

[
  "CHAT_FOLDER_BINDING_RECEIPT_SCHEMA = 'h2o.studio.chat-folder-binding-receipt.v1'",
  'ingestChatFolderBindingReceipts: ingestChatFolderBindingReceipts',
  'applyChatFolderBindingReceipt: applyChatFolderBindingReceipt',
  'chatFolderBindingReceiptSchema: CHAT_FOLDER_BINDING_RECEIPT_SCHEMA',
].forEach((needle) => assertContains(mv3Review, needle, `B9 Chrome receipt store ${needle}`));

[
  'chatFolderBindingReceipts',
  'receiptCount',
  'confirmedChatFolderBindingRequestCount',
  'requestIdMismatchCount',
].forEach((needle) => assertContains(chromeReceiptIngestBody, needle, `B9 Chrome receipt ingest ${needle}`));

[
  'applied-chat-folder-binding-request',
  'chat-folder-binding-receipt-applied',
  'noBindingMutation: true',
].forEach((needle) => assertContains(chromeReceiptApplyBody, needle, `B9 Chrome receipt apply ${needle}`));

[
  'noChromeDestructiveBindingApply: true',
  'noBindingMutation: true',
  'noChatDelete: true',
  'noSnapshotDelete: true',
].forEach((needle) => assertContains(chromeReceiptApplyResultBody, needle, `B9 Chrome receipt result ${needle}`));

[
  'CHAT_FOLDER_BINDING_RECEIPT_SCHEMA',
  'lastChatFolderBindingReceiptImport',
  'importChatFolderBindingReceiptsFromDesktopBundle',
  'chatFolderBindingReceiptImport',
  'chat-folder-binding-receipt-import-blocked',
].forEach((needle) => assertContains(mv3Import, needle, `B9 Chrome import ${needle}`));

[
  'chatFolderBindingReceiptImport',
  'chatFolderBindingRequestImport',
  'chatFolderBindingRequestAutoApply',
  'chatFolderBindingReceiptExport',
].forEach((needle) => assertContains(bridgeSummaryBody + bridge, needle, `B9 smoke bridge ${needle}`));

[
  'CHAT_FOLDER_BINDING_REQUEST_SCHEMA',
  'chatFolderBindingRequests',
  'noChromeBindingAuthority: true',
  'noDesktopCanonicalMutation: true',
].forEach((needle) => assertContains(autoImport, needle, `B8 request export remains ${needle}`));

assertContains(folderStore, 'function moveCanonicalChatFolderBinding', 'B9 canonical binding writer');
assertContains(folderStore, 'function listCanonicalChatFolderBindings', 'B9 canonical binding reader');

[
  'moveCanonicalChatFolderBinding',
  'bindChat(',
  'unbindChat(',
  'rawSql',
  'deleteChat',
  'deleteSnapshot',
  'purgeRecentlyDeletedFolders',
].forEach((needle) => assertNotContains(mv3Review + autoImport + mv3Import, needle, `Chrome must stay request-only ${needle}`));

[
  'B9',
  'chat-folder binding',
  'requestId',
  'chatFolderBindingRequests',
  'chatFolderBindingReceipts',
  'Desktop',
  'Chrome remains request-only',
  'no chat deletion',
  'no snapshot deletion',
  'no asset deletion',
].forEach((needle) => assertContains(evidence, needle, `B9 evidence ${needle}`));

console.log(JSON.stringify({
  ok: true,
  validator: 'validate-chat-folder-binding-phase-b9-desktop-apply-receipt',
  desktopImportApply: path.relative(root, tauriSyncPath),
  desktopReviewStore: path.relative(root, tauriReviewPath),
  desktopReceiptExport: path.relative(root, desktopExportPath),
  chromeReceiptImport: path.relative(root, mv3ImportPath),
  chromeRequestOnly: true,
  noHardDelete: true,
  noPurge: true,
  noChatDelete: true,
  noSnapshotDelete: true,
  noAssetDelete: true
}, null, 2));
