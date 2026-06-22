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
  folderSync: 'src-surfaces-base/studio/sync/folder-sync.tauri.js',
  tombstoneReviews: 'src-surfaces-base/studio/store/tombstone-reviews.mv3.js',
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

function sliceBetween(source, startNeedle, endNeedle) {
  const start = source.indexOf(startNeedle);
  if (start === -1) return '';
  const end = source.indexOf(endNeedle, start + startNeedle.length);
  return end === -1 ? source.slice(start) : source.slice(start, end);
}

function assertIncludes(source, needle, label = needle) {
  assert(source.includes(needle), `missing ${label}`);
}

const folderStore = read(files.folderStore);
const folderActions = read(files.folderActions);
const sidebarSections = read(files.sidebarSections);
const folderSync = read(files.folderSync);
const tombstoneReviews = read(files.tombstoneReviews);

[
  'readFolderBindingsForRemoveSafely',
  'recoverySnapshot.bindings',
  'bindings: bindingSnapshots',
  'bindingCaptureOk',
  'affectedChatCount',
  'unbindSnapshotBindingsForSoftDelete',
  'restoreBindingsFromRecoverySnapshot',
  'restore-binding-skipped-rebound',
  'restore-binding-skipped-chat-missing',
  'restore-binding-skipped-bind-failed',
  'folder-tombstoned',
  'allowTombstonedFolderRebind',
  'noHardDelete: true',
  'noChatDelete: true',
  "crossPlatformSync: 'deferred'",
].forEach((needle) => assertIncludes(folderStore, needle));

const softDeleteBody = functionBody(folderStore, 'softDeleteEmptyFolder');
assert(softDeleteBody.includes('readFolderBindingsForRemoveSafely'), 'soft delete must pre-read folder bindings');
assert(softDeleteBody.includes('unbindSnapshotBindingsForSoftDelete'), 'soft delete must unbind captured bindings to Unfiled');
assert(softDeleteBody.includes('createTombstone'), 'soft delete must create folder tombstone');
assert(!softDeleteBody.includes("addBlocker(base.blockers, 'folder-not-empty')"), 'Phase 4B soft delete must not hard-block folders with bindings');
assert(!softDeleteBody.includes('DELETE FROM folder_bindings'), 'soft delete must not raw-delete folder bindings');
assert(!softDeleteBody.includes('DELETE FROM folders'), 'soft delete must not hard-delete folder rows');
assert(!softDeleteBody.includes('DELETE FROM chats'), 'soft delete must not delete chat rows');

const unbindBody = functionBody(folderStore, 'unbindSnapshotBindingsForSoftDelete');
assert(unbindBody.includes('unbindChat('), 'Phase 4B unbind must use unbindChat');
assert(!unbindBody.includes('DELETE FROM folder_bindings'), 'Phase 4B unbind helper must not raw-delete bindings');

const restoreBody = functionBody(folderStore, 'restoreTombstonedFolder');
assert(restoreBody.includes('restoreBindingsFromRecoverySnapshot'), 'restore must rebind eligible snapshot bindings');
assert(restoreBody.includes('bindingRestoreAttemptedCount'), 'restore must report attempted binding restore count');
assert(restoreBody.includes('bindingRestoredCount'), 'restore must report restored binding count');
assert(restoreBody.includes('bindingSkippedCount'), 'restore must report skipped binding count');
assert(!restoreBody.includes('DELETE FROM folder_bindings'), 'restore must not raw-delete folder bindings');
assert(!restoreBody.includes('DELETE FROM chats'), 'restore must not delete chat rows');

const restoreBindingsBody = functionBody(folderStore, 'restoreBindingsFromRecoverySnapshot');
assert(restoreBindingsBody.includes('getChatForBindingRestore'), 'restore binding path must verify chat existence');
assert(restoreBindingsBody.includes('listForChat'), 'restore binding path must inspect current binding');
assert(restoreBindingsBody.includes('bindChat('), 'restore binding path must use bindChat');
assert(restoreBindingsBody.includes('restore-binding-skipped-rebound'), 'restore must skip chats moved elsewhere');
assert(restoreBindingsBody.includes('restore-binding-skipped-chat-missing'), 'restore must skip missing chats');
assert(!restoreBindingsBody.includes('INSERT INTO folder_bindings'), 'restore binding path must not raw-insert bindings');

const bindChatBody = sliceBetween(folderStore, 'function bindChat(folderIdInput, chatIdInput, opts)', 'function unbindChat(folderIdInput, chatIdInput, opts)');
assert(bindChatBody.includes('getActiveFolderTombstone'), 'bindChat must guard tombstoned folders');
assert(bindChatBody.includes('folder-tombstoned'), 'bindChat must expose folder-tombstoned blocker');

[
  'affectedChatCount',
  'bindingUnboundCount',
  'bindingUnbindSkippedCount',
  'bindingRestoreAttemptedCount',
  'bindingRestoredCount',
  'bindingSkippedCount',
  'restoreWarnings',
].forEach((needle) => assertIncludes(folderActions, needle, `actions ${needle}`));

const desktopBlockers = sliceBetween(sidebarSections, 'function desktopFolderSoftDeleteBlockers', 'function desktopFolderSoftDeleteBlocker');
assert(desktopBlockers, 'sidebar must define desktopFolderSoftDeleteBlockers');
assert(!desktopBlockers.includes('folder-not-empty'), 'Desktop menu must not disable folder-with-chats soft delete');
assert(sidebarSections.includes('No chats are deleted'), 'Desktop menu must state that chats are not deleted');
assert(sidebarSections.includes('chats move') || sidebarSections.includes('chat moves'), 'Desktop menu must explain chats move to Unfiled');

[
  'affectedChatCount',
  'lastAffectedChatCount',
  'lastBindingRestoreAttemptedCount',
  'lastBindingRestoredCount',
  'lastBindingSkippedCount',
  'lastRestoreWarnings',
  "chromeDeleteSync: 'deferred'",
  "tombstoneSync: 'deferred'",
].forEach((needle) => assertIncludes(folderSync, needle, `health ${needle}`));

assert(!tombstoneReviews.includes('applyFolderDeleteTombstonePhase4B'), 'Chrome tombstone reviews must remain non-applying in Phase 4B');

if (failures.length) {
  console.error('[folder-delete-tombstone-phase4b] FAIL');
  failures.forEach((failure) => console.error(` - ${failure}`));
  process.exit(1);
}

console.log('[folder-delete-tombstone-phase4b] PASS');
console.log(JSON.stringify({
  schema: 'h2o.studio.sync.folder-delete-tombstone-phase4b-validation.v1',
  ok: true,
  desktopOnly: true,
  softDeleteWithBindings: true,
  noHardDelete: true,
  noChatDelete: true,
  chromeDeleteSyncDeferred: true,
  observedAtIso: new Date().toISOString(),
}, null, 2));
