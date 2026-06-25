#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const sidebarPath = path.join(root, 'src-surfaces-base/studio/S0Z1g. 🎬 Library Sidebar Sections - Studio.js');
const evidencePath = path.join(root, 'release-evidence/2026-06-24/folder-delete-restore-phase6a2-purge-ui.md');

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

for (const file of [sidebarPath, evidencePath]) {
  assert(fs.existsSync(file), `${path.relative(root, file)} missing`);
}

const sidebar = read(sidebarPath);
const evidence = read(evidencePath);
const canPurgeBody = functionBody(sidebar, 'canUseDesktopFolderPurge');
const purgeBody = functionBody(sidebar, 'permanentlyDeleteRecentlyDeletedFolders');
const renderBody = functionBody(sidebar, 'renderRecentlyDeletedFoldersPanel');
const sidebarEntryBody = functionBody(sidebar, 'renderRecentlyDeletedFoldersSidebarEntry');

[
  'studioIsTauri()',
  'previewRecentlyDeletedFolderPurge',
  'purgeRecentlyDeletedFolders',
].forEach((needle) => assertContains(canPurgeBody, needle, `Desktop-only purge capability ${needle}`));

[
  'previewRecentlyDeletedFolderPurge',
  'purgeRecentlyDeletedFolders',
  'DELETE PERMANENTLY',
  'Restore will no longer be possible',
  'Chats, snapshots, assets, active folders, and receipts will not be deleted.',
  'dryRun: false',
  'confirmationToken,',
  'previewToken: confirmationToken',
  'expectedCount',
  'deleteChats: false',
  'deleteSnapshots: false',
  'deleteAssets: false',
  'chatDeletedCount',
  'snapshotDeletedCount',
  'hardDeletedFolderRowCount',
  "refreshAfterNativeFolderMetadataApply('folder-recently-deleted-purge')",
].forEach((needle) => assertContains(purgeBody, needle, `purge flow ${needle}`));

[
  'Delete permanently',
  'wbFolderRecentlyDeletedPurgeHeader',
  'purgeEligibleCount > 0 && purgeApiAvailable',
  'disabled: purgeEligibleCount > 0 && purgeApiAvailable ? null : \'disabled\'',
  'permanentlyDeleteRecentlyDeletedFolders',
  'placement: \'main\'',
].forEach((needle) => assertContains(renderBody, needle, `main panel button ${needle}`));

assertNotContains(sidebarEntryBody, 'Delete permanently', 'compact sidebar purge button');
assertNotContains(sidebarEntryBody, 'permanentlyDeleteRecentlyDeletedFolders', 'compact sidebar purge action');

[
  'chromeFolderDeleteRequestActions',
  'requestDelete',
  'deleteChat(',
  'deleteSnapshot(',
  'DELETE FROM',
  'remove(',
].forEach((needle) => assertNotContains(purgeBody, needle, `forbidden purge UI action ${needle}`));

[
  'Phase 6A.2',
  'Delete permanently',
  'previewRecentlyDeletedFolderPurge',
  'purgeRecentlyDeletedFolders',
  'DELETE PERMANENTLY',
  'deleteChats:false',
  'deleteSnapshots:false',
  'deleteAssets:false',
  'chatDeletedCount:0',
  'snapshotDeletedCount:0',
  'assetDeletedCount:0',
  'hardDeletedFolderRowCount:0',
  'receiptDeletedCount:0',
].forEach((needle) => assertContains(evidence, needle, `evidence ${needle}`));

console.log(JSON.stringify({
  ok: true,
  validator: 'validate-folder-purge-phase6a2-ui',
  ui: path.relative(root, sidebarPath),
  evidence: path.relative(root, evidencePath),
  desktopOnly: true,
  chromeAuthority: false,
  purgeButtonInSidebar: false,
}, null, 2));
