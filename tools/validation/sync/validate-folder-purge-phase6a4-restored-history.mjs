#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const foldersPath = path.join(root, 'src-surfaces-base/studio/store/folders.tauri.js');
const tombstonesPath = path.join(root, 'src-surfaces-base/studio/store/tombstones.tauri.js');
const sidebarPath = path.join(root, 'src-surfaces-base/studio/S0Z1g. 🎬 Library Sidebar Sections - Studio.js');
const evidencePath = path.join(root, 'release-evidence/2026-06-24/folder-delete-restore-phase6a4-clear-restored-history.md');

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
  const marker = `function ${name}`;
  const start = source.indexOf(marker);
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

for (const file of [foldersPath, tombstonesPath, sidebarPath, evidencePath]) {
  assert(fs.existsSync(file), `${path.relative(root, file)} missing`);
}

const folders = read(foldersPath);
const tombstones = read(tombstonesPath);
const sidebar = read(sidebarPath);
const evidence = read(evidencePath);

[
  'PHASE6A_RESTORED_HISTORY_CLEAR_PREVIEW_SCHEMA',
  'PHASE6A_RESTORED_HISTORY_CLEAR_RESULT_SCHEMA',
  'previewRecentlyDeletedRestoredHistoryClear',
  'clearRecentlyDeletedRestoredHistory',
  'restoredHistoryClearableCount',
  'operator-confirmed-restored-history-clear',
  'chatDeletedCount: 0',
  'snapshotDeletedCount: 0',
  'assetDeletedCount: 0',
  'hardDeletedFolderRowCount: 0',
  'receiptDeletedCount: 0',
  'desktopOnly: true',
  'chromeAuthority: false',
].forEach((needle) => assertContains(folders, needle, `folders restored history clear ${needle}`));

[
  'clearRestoredFolderTombstonesByIds',
  'restoredRowsOnly: true',
  'activeDeletedRowsRejected: true',
  'activeDeletedSkippedCount',
  'receiptDeletedCount: 0',
  'hardDeletedFolderRowCount: 0',
  'chatDeletedCount: 0',
  'snapshotDeletedCount: 0',
  'assetDeletedCount: 0',
].forEach((needle) => assertContains(tombstones, needle, `tombstone restored history helper ${needle}`));

const tombstoneClearBody = functionBody(tombstones, 'clearRestoredFolderTombstonesByIds');
[
  'opts.dryRun !== false',
  'restored_at IS NULL AND tombstone_id IN',
  'active-deleted-tombstones-rejected',
  "'DELETE FROM ' + TABLE + ' WHERE record_kind = ? AND restored_at IS NOT NULL AND tombstone_id IN ('",
  "['folder'].concat(matched)",
  "recordWrite('clearRestoredFolderTombstonesByIds')",
].forEach((needle) => assertContains(tombstoneClearBody, needle, `restored history exact clear ${needle}`));

[
  'DELETE FROM folders',
  'DELETE FROM folder_bindings',
  'DELETE FROM chats',
  'DELETE FROM snapshots',
  'DELETE FROM sync_tombstone_reviews',
  'deleteChat',
  'deleteSnapshot',
  'remove(',
].forEach((needle) => assertNotContains(tombstoneClearBody, needle, `restored history helper forbidden ${needle}`));

const planBody = functionBody(folders, 'buildRecentlyDeletedRestoredHistoryClearPlan');
[
  "tombstones.list({ recordKind: 'folder', includeRestored: true",
  "row.restoreStatus === 'restored'",
  'activeDeletedSkippedCount',
  'protectedSkippedCount',
  'malformedSkippedCount',
  'folderPurgeProtectionCodes',
  'restoredHistoryCandidateCount',
].forEach((needle) => assertContains(planBody, needle, `restored history plan guard ${needle}`));

const previewBody = functionBody(folders, 'previewRecentlyDeletedRestoredHistoryClear');
[
  'buildRecentlyDeletedRestoredHistoryClearPlan',
  'previewToken',
  'previewExpiresAt',
  'state.phase6a.lastRestoredHistoryClearPreview',
  'candidateTombstoneIds',
].forEach((needle) => assertContains(previewBody, needle, `restored history preview ${needle}`));

const commitBody = functionBody(folders, 'clearRecentlyDeletedRestoredHistory');
[
  'opts.dryRun !== false',
  'explicit-reason-required',
  'preview-token-required',
  'expected-count-required',
  'restored-history-clear-confirmation-required',
  'invalid-preview-token',
  'preview-token-expired',
  'expected-count-mismatch',
  'preview-candidate-set-changed',
  'tombstones.clearRestoredFolderTombstonesByIds',
  'operatorConfirmedHistoryClear = true',
  "recordWrite('clearRecentlyDeletedRestoredHistory')",
].forEach((needle) => assertContains(commitBody, needle, `restored history commit ${needle}`));

[
  'remove(',
  'softDeleteEmptyFolder(',
  'restoreTombstonedFolder(',
  'deleteChat',
  'deleteSnapshot',
  'DELETE FROM',
  'folder_bindings',
  'sync_tombstone_reviews',
].forEach((needle) => assertNotContains(commitBody, needle, `restored history commit forbidden ${needle}`));

[
  'previewRecentlyDeletedRestoredHistoryClear: previewRecentlyDeletedRestoredHistoryClear',
  'clearRecentlyDeletedRestoredHistory: clearRecentlyDeletedRestoredHistory',
].forEach((needle) => assertContains(folders, needle, `folder API export ${needle}`));

const canClearBody = functionBody(sidebar, 'canUseDesktopRestoredHistoryClear');
[
  'studioIsTauri()',
  'previewRecentlyDeletedRestoredHistoryClear',
  'clearRecentlyDeletedRestoredHistory',
].forEach((needle) => assertContains(canClearBody, needle, `Desktop-only restored history capability ${needle}`));

const clearFlowBody = functionBody(sidebar, 'clearRecentlyDeletedRestoredHistory');
[
  'previewRecentlyDeletedRestoredHistoryClear',
  'clearRecentlyDeletedRestoredHistory',
  'CLEAR RESTORED HISTORY',
  'This only removes restored/history entries from Recently Deleted',
  'Folders, chats, snapshots, assets, active folders, and receipts will not be deleted.',
  'dryRun: false',
  'confirmationToken: preview.previewToken',
  'expectedCount',
  'deleteChats: false',
  'deleteSnapshots: false',
  'deleteAssets: false',
  'chatDeletedCount',
  'snapshotDeletedCount',
  'hardDeletedFolderRowCount',
  "refreshAfterNativeFolderMetadataApply('folder-recently-deleted-restored-history-clear')",
].forEach((needle) => assertContains(clearFlowBody, needle, `restored history UI flow ${needle}`));

const renderBody = functionBody(sidebar, 'renderRecentlyDeletedFoldersPanel');
const sidebarEntryBody = functionBody(sidebar, 'renderRecentlyDeletedFoldersSidebarEntry');
[
  'restoredHistoryClearableCount',
  'wbFolderRecentlyDeletedRestoredHistoryHeader',
  'Restored history',
  'Clear restored history',
  'Clears restored/history entries from Recently Deleted only. Folders, chats, snapshots, assets, and receipts are not deleted.',
  'No restored history entries to clear.',
  'Clearable history',
].forEach((needle) => assertContains(renderBody, needle, `main restored history UI ${needle}`));

assertNotContains(sidebarEntryBody, 'Clear restored history', 'compact sidebar restored history clear button');
assertNotContains(sidebarEntryBody, 'wbFolderRecentlyDeletedRestoredHistoryHeader', 'compact sidebar restored history clear header');

[
  'Phase 6A.4',
  'previewRecentlyDeletedRestoredHistoryClear',
  'clearRecentlyDeletedRestoredHistory',
  'clearRestoredFolderTombstonesByIds',
  'restoredHistoryClearableCount',
  'CLEAR RESTORED HISTORY',
  'chatDeletedCount:0',
  'snapshotDeletedCount:0',
  'assetDeletedCount:0',
  'hardDeletedFolderRowCount:0',
  'receiptDeletedCount:0',
].forEach((needle) => assertContains(evidence, needle, `evidence ${needle}`));

console.log(JSON.stringify({
  ok: true,
  validator: 'validate-folder-purge-phase6a4-restored-history',
  folders: path.relative(root, foldersPath),
  tombstones: path.relative(root, tombstonesPath),
  ui: path.relative(root, sidebarPath),
  evidence: path.relative(root, evidencePath),
  desktopOnly: true,
  chromeAuthority: false,
}, null, 2));
