#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const failures = [];

const sidebarPath = 'src-surfaces-base/studio/S0Z1g. 🎬 Library Sidebar Sections - Studio.js';
const evidencePath = 'release-evidence/2026-06-24/folder-delete-restore-recently-deleted-ui-polish.md';

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

const sidebar = read(sidebarPath);
const renderBody = functionBody(sidebar, 'renderRecentlyDeletedFoldersPanel');
const restoreBody = functionBody(sidebar, 'restoreRecentlyDeletedFolder');

[
  'canUseDesktopRecentlyDeletedFolders',
  'canUseDesktopFolderRestore',
  'renderRecentlyDeletedFoldersPanel(host)',
  'await renderRecentlyDeletedFoldersPanel(host)',
  'listRecentlyDeletedFolders',
  'diagnoseRecentlyDeletedFolders',
  'restoreTombstonedFolder',
  'restoreFolder',
].forEach((needle) => assertIncludes(sidebar, needle, `Recently Deleted UI wiring ${needle}`));

[
  'folderName',
  'folderId',
  'deletedAt',
  'restoreStatus',
  'restoreAvailable',
  'affectedChatCount',
  'retentionCountdownStatus',
  'retentionExpiresAt',
  'retentionEnforcement',
  'purgeBlocked',
  'hardDeleteBlocked',
  'activeRetentionCount',
  'expiredRetentionCount',
  'restoredRetentionCount',
  'purgeEligibleCount',
  'purgeBlockedCount',
  'retentionDays',
  'Purge deferred',
  'Hard delete blocked',
  'Retention enforcement',
].forEach((needle) => assertIncludes(renderBody, needle, `Recently Deleted rendered field ${needle}`));

[
  'restoreAvailable && restoreApiAvailable',
  'Safe restore API unavailable',
  'Restore this folder safely',
  'This restores the folder metadata and eligible bindings. It does not purge, hard-delete, or delete chats.',
  "refreshAfterNativeFolderMetadataApply('folder-recently-deleted-restore')",
].forEach((needle) => assertIncludes(renderBody + restoreBody, needle, `Recently Deleted restore safety ${needle}`));

[
  'purgeTombstone',
  'purgeFolder',
  'hardDeleteFolder',
  'deleteChat',
  'deleteSnapshot',
  'DELETE FROM',
].forEach((needle) => assertNotIncludes(renderBody + restoreBody, needle, `forbidden UI action ${needle}`));

assert(fs.existsSync(path.join(root, evidencePath)), 'evidence file must exist');

if (failures.length) {
  console.error('validate-folder-recently-deleted-ui-polish failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('validate-folder-recently-deleted-ui-polish passed');
