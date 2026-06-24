#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const failures = [];

const sidebarPath = 'src-surfaces-base/studio/S0Z1g. 🎬 Library Sidebar Sections - Studio.js';
const studioPath = 'src-surfaces-base/studio/studio.js';
const evidencePath = 'release-evidence/2026-06-24/folder-delete-restore-recently-deleted-ui-polish.md';
const placementEvidencePath = 'release-evidence/2026-06-24/folder-delete-restore-recently-deleted-ui-placement.md';

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
const studio = read(studioPath);
const renderBody = functionBody(sidebar, 'renderRecentlyDeletedFoldersPanel');
const sidebarEntryBody = functionBody(sidebar, 'renderRecentlyDeletedFoldersSidebarEntry');
const restoreBody = functionBody(sidebar, 'restoreRecentlyDeletedFolder');
const renderFoldersBody = functionBody(sidebar, 'renderFolders');
const mainHostBody = functionBody(studio, 'appendVisibleStudioRecentlyDeletedFoldersPanel');
const foldersPageBody = functionBody(studio, 'renderVisibleStudioFoldersPageBody');

[
  'canUseDesktopRecentlyDeletedFolders',
  'canUseDesktopFolderRestore',
  'renderRecentlyDeletedFoldersPanel(host, opts = {})',
  'renderRecentlyDeletedFoldersSidebarEntry(host)',
  'listRecentlyDeletedFolders',
  'diagnoseRecentlyDeletedFolders',
  'restoreTombstonedFolder',
  'restoreFolder',
].forEach((needle) => assertIncludes(sidebar, needle, `Recently Deleted UI wiring ${needle}`));

[
  'data-h2o-recently-deleted-folders-sidebar-entry',
  'Recently Deleted ·',
  '#/library/folders',
  'desktop-recently-deleted-sidebar-counter',
].forEach((needle) => assertIncludes(sidebarEntryBody, needle, `compact sidebar Recently Deleted entry ${needle}`));

[
  'appendVisibleStudioRecentlyDeletedFoldersPanel(page)',
  'wbFolderPageRecentlyDeletedHost',
  'data-h2o-recently-deleted-folders="main"',
  'api.renderRecentlyDeletedFoldersPanel(host, { placement: "main" })',
].forEach((needle) => assertIncludes(studio, needle, `main Folders page Recently Deleted placement ${needle}`));

assertIncludes(foldersPageBody, 'await appendVisibleStudioRecentlyDeletedFoldersPanel(page)', 'Folders page appends Recently Deleted panel');
assertIncludes(renderFoldersBody, 'await renderRecentlyDeletedFoldersSidebarEntry(host)', 'sidebar renders compact Recently Deleted entry');
assertNotIncludes(renderFoldersBody, 'await renderRecentlyDeletedFoldersPanel(host)', 'sidebar must not render full Recently Deleted panel');

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
assert(fs.existsSync(path.join(root, placementEvidencePath)), 'placement evidence file must exist');

if (failures.length) {
  console.error('validate-folder-recently-deleted-ui-polish failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('validate-folder-recently-deleted-ui-polish passed');
