#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const sidebarPath = path.join(root, 'src-surfaces-base/studio/S0Z1g. 🎬 Library Sidebar Sections - Studio.js');
const actionsPath = path.join(root, 'src-surfaces-base/studio/S0F3b. 🎬 Folders Actions - Studio.js');
const evidencePath = path.join(root, 'release-evidence/2026-06-25/folder-delete-phase6b2-chrome-delete-ux.md');

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

for (const file of [sidebarPath, actionsPath, evidencePath]) {
  assert(fs.existsSync(file), `${path.relative(root, file)} missing`);
}

const sidebar = read(sidebarPath);
const actions = read(actionsPath);
const evidence = read(evidencePath);
const chromePanelBody = functionBody(sidebar, 'makeChromeFolderDeleteRequestPanel');
const requestBody = functionBody(sidebar, 'requestChromeFolderDelete');
const badgeBody = functionBody(sidebar, 'folderDeleteRequestBadgeNode');
const chromeRequestDeleteBody = functionBody(actions, 'chromeRequestDelete');

[
  "const label = 'Delete'",
  'requestChromeFolderDelete(item, { setStatus })',
  'panel.style.display = \'flex\'',
  'Cannot delete this folder.',
  'Move to Recently Deleted through Desktop review',
].forEach((needle) => assertContains(chromePanelBody, needle, `6B.2 simplified Chrome delete panel ${needle}`));

[
  'confirmText',
  'W.confirm',
  'window.confirm',
  'Delete cancelled.',
  'Request delete (review on Desktop)',
  'Desktop Studio applies the soft delete. Chrome creates a request only; no chats or snapshots are deleted.',
  'Move this folder to Recently Deleted? Desktop Studio will apply the soft delete. No chats or snapshots are deleted.',
  'Desktop review request',
  'Chrome only creates a pending request',
  'Permanent delete',
  'Delete permanently',
  'Restore from Desktop Studio',
  'restoreTombstonedFolder',
  'purgeRecentlyDeletedFolders',
  'previewRecentlyDeletedFolderPurge',
  'clearRecentlyDeletedRestoredHistory',
  'remove(',
  'softDeleteEmptyFolder(',
  'deleteChat(',
  'deleteSnapshot(',
  'DELETE FROM',
].forEach((needle) => assertNotContains(chromePanelBody, needle, `6B.2 forbidden Chrome delete panel ${needle}`));

[
  'actions.requestDelete.bind(actions)',
  'store.requestFolderDelete.bind(store)',
  "reason: 'user-requested-folder-delete'",
  'FOLDER_DELETE_REQUEST_UI_STATE.pendingFolderIds.add(folderId)',
  'Already pending',
  'Delete pending',
].forEach((needle) => assertContains(requestBody, needle, `6B.2 Chrome request path ${needle}`));

[
  'remove(',
  'softDeleteEmptyFolder(',
  'purgeRecentlyDeletedFolders',
  'previewRecentlyDeletedFolderPurge',
  'restoreTombstonedFolder',
  'deleteChat(',
  'deleteSnapshot(',
  'DELETE FROM',
].forEach((needle) => assertNotContains(requestBody, needle, `6B.2 forbidden Chrome request path ${needle}`));

[
  'Delete pending',
  'Delete pending Desktop review',
].forEach((needle) => assertContains(badgeBody, needle, `6B.2 pending badge ${needle}`));

[
  'requestFolderDelete',
  'desktopApplyRequired: true',
  'noHardDelete: true',
  'noChatDelete: true',
  'does not expose remove/delete/apply and does not mutate folders',
].forEach((needle) => assertContains(chromeRequestDeleteBody + actions, needle, `6B.2 actions request-only ${needle}`));

[
  'Phase 6B.2',
  'Chrome folder Delete',
  'no browser/native confirmation popup',
  'Delete pending',
  'Already pending',
  'Cannot delete this folder.',
  'Permanent delete is only available from Desktop Studio.',
  'request-only',
  'no Chrome permanent delete',
  'no Chrome restore action',
  'no tombstone apply/create on Chrome',
  'no hard delete',
  'no chat deletion',
  'no snapshot deletion',
  'no asset deletion',
].forEach((needle) => assertContains(evidence, needle, `6B.2 evidence ${needle}`));

console.log(JSON.stringify({
  ok: true,
  validator: 'validate-folder-delete-phase6b2-chrome-delete-ux',
  ui: path.relative(root, sidebarPath),
  actions: path.relative(root, actionsPath),
  evidence: path.relative(root, evidencePath),
  nativeConfirmRemoved: true,
  requestOnly: true,
  chromePermanentDelete: false,
  chromeRestore: false,
}, null, 2));
