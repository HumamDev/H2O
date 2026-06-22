#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const failures = [];

const files = {
  folderStore: 'src-surfaces-base/studio/store/folders.tauri.js',
  folderActions: 'src-surfaces-base/studio/S0F3b. 🎬 Folders Actions - Studio.js',
  sidebarSections: 'src-surfaces-base/studio/S0Z1g. 🎬 Library Sidebar Sections - Studio.js',
  autoExport: 'src-surfaces-base/studio/sync/auto-export.tauri.js',
  folderSync: 'src-surfaces-base/studio/sync/folder-sync.tauri.js',
};

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function assertContains(file, needle, label = needle) {
  assert(read(file).includes(needle), `${file}: missing ${label}`);
}

function functionBody(source, name) {
  const marker = `function ${name}`;
  const start = source.indexOf(marker);
  if (start === -1) return '';
  const open = source.indexOf('{', start);
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

const folderStore = read(files.folderStore);
const actions = read(files.folderActions);
const sidebarSections = read(files.sidebarSections);

[
  'PHASE4A_FOLDER_SOFT_DELETE_PHASE',
  'softDeleteEmptyFolder',
  'restoreTombstonedFolder',
  'recoverySnapshot',
  'folder-not-empty',
  'protected-folder',
  'system-folder',
  'unfiled-folder',
  'local-review-folder-not-editable',
  'tombstone-store-unavailable',
  'already-tombstoned',
  'noHardDelete: true',
  'noChatDelete: true',
  'removeFolderFromStateMirror',
  'restoreFolderToStateMirror',
  'remove: softDeleteEmptyFolder',
  "'delete': softDeleteEmptyFolder",
].forEach((needle) => assertContains(files.folderStore, needle));

const softDeleteBody = functionBody(folderStore, 'softDeleteEmptyFolder');
assert(softDeleteBody.includes('createTombstone'), 'softDeleteEmptyFolder must create a tombstone');
assert(!softDeleteBody.includes('DELETE FROM folders'), 'softDeleteEmptyFolder must not hard-delete folder rows');
assert(!softDeleteBody.includes('DELETE FROM chats'), 'softDeleteEmptyFolder must not delete chats');
assert(!softDeleteBody.includes('DELETE FROM snapshots'), 'softDeleteEmptyFolder must not delete snapshots');

const restoreBody = functionBody(folderStore, 'restoreTombstonedFolder');
assert(restoreBody.includes('markRestored'), 'restoreTombstonedFolder must mark the tombstone restored');
assert(restoreBody.includes('folderPatchFromRecoverySnapshot'), 'restoreTombstonedFolder must use recoverySnapshot');
assert(restoreBody.includes('alreadyRestored: true'), 'restoreTombstonedFolder must treat already-restored visible folders as ok');
assert(restoreBody.includes('verifiedRow'), 'restoreTombstonedFolder must verify restored folder visibility before success');
assert(!restoreBody.includes('DELETE FROM folders'), 'restoreTombstonedFolder must not hard-delete folder rows');

[
  'softDeleteEmptyFolder',
  'restoreTombstonedFolder',
  'noHardDelete: true',
  'noChatDelete: true',
  "crossPlatformSync: 'deferred'",
].forEach((needle) => assertContains(files.folderActions, needle));

const actionRemoveBody = functionBody(actions, 'remove');
assert(actionRemoveBody.includes('store.softDeleteEmptyFolder'), 'actions.folders.remove must route to softDeleteEmptyFolder');
assert(!actionRemoveBody.includes('store.remove'), 'actions.folders.remove must not call store.remove');

[
  'canUseDesktopFolderSoftDelete',
  'desktopFolderSoftDeleteBlockers',
  'requestDesktopFolderSoftDelete',
  'makeDesktopFolderSoftDeletePanel',
  'Move to Recently Deleted',
  'desktop-folder-soft-delete-panel',
  'folder-not-empty',
  'protected-folder',
  'system-folder',
  'unfiled-folder',
  'local-review-folder-not-editable',
  'tombstone-store-unavailable',
].forEach((needle) => assert(sidebarSections.includes(needle), `${files.sidebarSections}: missing ${needle}`));

const desktopSoftDeleteRequestBody = functionBody(sidebarSections, 'requestDesktopFolderSoftDelete');
assert(sidebarSections.includes('actions?.delete'), 'Desktop sidebar soft delete must call actions.folders.delete');
assert(!sidebarSections.includes('store.remove'), 'Desktop sidebar soft delete must not call store.remove');

[
  "source === 'desktop-local-soft-delete'",
  "op === 'softDeleteEmptyFolder'",
  "op === 'restoreTombstonedFolder'",
].forEach((needle) => assertContains(files.autoExport, needle));

[
  'tombstoneLocalDelete',
  "phase: 'desktop-local-soft-delete'",
  'tombstoneStoreAvailable',
  'activeTombstoneCount',
  'restoreAvailableCount',
  'purgeBlocked: true',
  "chromeDeleteSync: 'deferred'",
  "tombstoneSync: 'deferred'",
].forEach((needle) => assertContains(files.folderSync, needle));

if (failures.length) {
  console.error('[folder-delete-tombstone-phase4a] FAIL');
  failures.forEach((failure) => console.error(` - ${failure}`));
  process.exit(1);
}

console.log('[folder-delete-tombstone-phase4a] PASS');
console.log(JSON.stringify({
  schema: 'h2o.studio.sync.folder-delete-tombstone-phase4a-validation.v1',
  ok: true,
  desktopOnly: true,
  softDeleteOnly: true,
  hardDeletePublicPathDisabled: true,
  chromeDeleteSyncDeferred: true,
  observedAtIso: new Date().toISOString(),
}, null, 2));
