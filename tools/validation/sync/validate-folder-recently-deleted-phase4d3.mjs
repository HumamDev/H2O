#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const failures = [];

const files = {
  folders: 'src-surfaces-base/studio/store/folders.tauri.js',
  smokeBridge: 'src-surfaces-base/studio/dev/folder-sync-rc-smoke-bridge.studio.js',
  desktopClient: 'tools/smoke/desktop-folder-sync-queue-client.mjs',
};

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
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

const folders = read(files.folders);
const smokeBridge = read(files.smokeBridge);
const desktopClient = read(files.desktopClient);

[
  'h2o.studio.folder-recently-deleted-diagnostics.v1',
  'PHASE4D3_RETENTION_DAYS = 30',
  'listRecentlyDeletedFolders',
  'diagnoseRecentlyDeletedFolders',
  'recentlyDeletedRowFromTombstone',
  'retentionCountdownStatus',
  'restoreAvailable',
  'restoreStatus',
  'activeTombstoneCount',
  'restoredTombstoneCount',
  'folderTombstoneCount',
  'restoreAvailableCount',
  'purgeBlockedCount',
  'hardDeleteBlockedCount',
  'noHardDelete: true',
  'noPurge: true',
  'noChatDelete: true',
  'noSnapshotDelete: true',
].forEach((needle) => assertIncludes(folders, needle, `Desktop recently deleted diagnostics ${needle}`));

const listBody = functionBody(folders, 'listRecentlyDeletedFolders');
[
  'tombstones.list({ recordKind: \'folder\', includeRestored: true',
  'rows: []',
  'purgeBlockedCount',
  'hardDeleteBlockedCount',
  'restoreAvailableCount',
  'recently-deleted-folders-listed',
].forEach((needle) => assertIncludes(listBody, needle, `Recently Deleted list body ${needle}`));

const rowBody = functionBody(folders, 'recentlyDeletedRowFromTombstone');
[
  'tombstoneId',
  'folderId',
  'folderName',
  'recordKind: \'folder\'',
  'deletedAt',
  'deletedBy',
  'deletedBySurface',
  'restoredAt',
  'restoreAvailable',
  'restoreStatus',
  'affectedChatCount',
  'bindingRestoreAttemptedCount',
  'bindingRestoredCount',
  'bindingSkippedCount',
  'restoreWarnings',
  'purgeBlocked: true',
  'hardDeleteBlocked: true',
  'retentionDays: PHASE4D3_RETENTION_DAYS',
  'retentionExpiresAt',
  'retentionCountdownStatus',
].forEach((needle) => assertIncludes(rowBody, needle, `Recently Deleted row projection ${needle}`));

[
  'softDeleteFolder',
  'softDeleteEmptyFolder',
  'restoreTombstonedFolder',
  'createTombstone',
  'markRestored',
  'DELETE FROM',
  'unbindChat',
  'bindChat',
  'purgeFolder',
  'purgeTombstone',
  'hardDeleteFolder',
].forEach((needle) => assertNotIncludes(listBody + rowBody, needle, `mutation in Recently Deleted diagnostics ${needle}`));

[
  "'listRecentlyDeletedFolders'",
  'ALLOWED_OPS',
  'DESKTOP_ONLY_OPS',
  'recently-deleted-diagnostics-unavailable',
  'listRecentlyDeletedFolders(payload)',
  'recentlyDeletedDiagnostics',
  'items: rows',
  'list: rows',
  'activeTombstoneCount',
  'restoredTombstoneCount',
  'folderTombstoneCount',
  'restoreAvailableCount',
  'purgeBlockedCount',
  'hardDeleteBlockedCount',
  'retentionDays',
  'noHardDelete: true',
  'noPurge: true',
  'noChatDelete: true',
  'noSnapshotDelete: true',
].forEach((needle) => assertIncludes(smokeBridge, needle, `smoke Recently Deleted ${needle}`));

const allowedOpsMatch = smokeBridge.match(/ALLOWED_OPS = Object\.freeze\(\[([\s\S]*?)\]\)/);
assert(allowedOpsMatch && allowedOpsMatch[1].includes("'listRecentlyDeletedFolders'"), 'smoke registry ALLOWED_OPS must include listRecentlyDeletedFolders');

[
  "READ_ONLY_OPS = Object.freeze(['diagnoseHealth', 'getFolderModel', 'listRecentlyDeletedFolders'])",
  'node tools/smoke/desktop-folder-sync-queue-client.mjs --op listRecentlyDeletedFolders --timeout-ms 30000',
].forEach((needle) => assertIncludes(desktopClient, needle, `Desktop queue client Recently Deleted ${needle}`));

if (failures.length) {
  console.error('validate-folder-recently-deleted-phase4d3 failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('validate-folder-recently-deleted-phase4d3 passed');
