#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const foldersPath = path.join(root, 'src-surfaces-base/studio/store/folders.tauri.js');
const tombstonesPath = path.join(root, 'src-surfaces-base/studio/store/tombstones.tauri.js');
const evidencePath = path.join(root, 'release-evidence/2026-06-24/folder-delete-restore-phase6a-purge-api.md');

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
  const start = source.indexOf(`function ${name}`);
  assert(start >= 0, `${name} missing`);
  const brace = source.indexOf('{', start);
  assert(brace >= 0, `${name} body missing`);
  let depth = 0;
  for (let i = brace; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(brace, i + 1);
    }
  }
  throw new Error(`${name} body parse failed`);
}

for (const file of [foldersPath, tombstonesPath, evidencePath]) {
  assert(fs.existsSync(file), `${path.relative(root, file)} missing`);
}

const folders = read(foldersPath);
const tombstones = read(tombstonesPath);
const evidence = read(evidencePath);

[
  'PHASE6A_PURGE_PREVIEW_SCHEMA',
  'PHASE6A_PURGE_RESULT_SCHEMA',
  'previewRecentlyDeletedFolderPurge',
  'purgeRecentlyDeletedFolders',
  'purgeEligibleCount',
  'operatorPurgeAvailable',
  'automaticPurgeBlocked',
  'operator-confirmed-tombstone-recovery-record-purge',
  'chatDeletedCount: 0',
  'snapshotDeletedCount: 0',
  'assetDeletedCount: 0',
  'hardDeletedFolderRowCount: 0',
  'receiptDeletedCount: 0',
  'desktopOnly: true',
  'chromeAuthority: false',
].forEach((needle) => assertContains(folders, needle, `folders Phase 6A ${needle}`));

[
  'purgeFolderTombstonesByIds',
  'exactTombstoneIdsOnly: true',
  "recordKind: 'folder'",
  'restoredRowsRejected: true',
  'receiptDeletedCount: 0',
  'hardDeletedFolderRowCount: 0',
  'chatDeletedCount: 0',
  'snapshotDeletedCount: 0',
  'assetDeletedCount: 0',
].forEach((needle) => assertContains(tombstones, needle, `tombstone purge helper ${needle}`));

const tombstonePurgeBody = functionBody(tombstones, 'purgeFolderTombstonesByIds');
[
  'opts.dryRun !== false',
  "'DELETE FROM ' + TABLE + ' WHERE record_kind = ? AND restored_at IS NULL AND tombstone_id IN ('",
  "['folder'].concat(matched)",
  "recordWrite('purgeFolderTombstonesByIds')",
].forEach((needle) => assertContains(tombstonePurgeBody, needle, `tombstone exact purge ${needle}`));

[
  'DELETE FROM folders',
  'DELETE FROM folder_bindings',
  'DELETE FROM chats',
  'DELETE FROM snapshots',
  'DELETE FROM sync_tombstone_reviews',
  'deleteChat',
  'deleteSnapshot',
  'remove(',
].forEach((needle) => assertNotContains(tombstonePurgeBody, needle, `tombstone purge forbidden ${needle}`));

const previewBody = functionBody(folders, 'previewRecentlyDeletedFolderPurge');
[
  'buildRecentlyDeletedPurgePlan',
  'previewToken',
  'previewExpiresAt',
  'state.phase6a.lastPreview',
  'candidateTombstoneIds',
].forEach((needle) => assertContains(previewBody, needle, `preview API ${needle}`));

const commitBody = functionBody(folders, 'purgeRecentlyDeletedFolders');
[
  'opts.dryRun !== false',
  'explicit-reason-required',
  'preview-token-required',
  'expected-count-required',
  'invalid-preview-token',
  'preview-token-expired',
  'expected-count-mismatch',
  'preview-candidate-set-changed',
  'tombstones.purgeFolderTombstonesByIds',
  'operatorConfirmedPurge = true',
  "recordWrite('purgeRecentlyDeletedFolders')",
].forEach((needle) => assertContains(commitBody, needle, `commit API ${needle}`));

[
  'remove(',
  'softDeleteEmptyFolder(',
  'restoreTombstonedFolder(',
  'deleteChat',
  'deleteSnapshot',
  'DELETE FROM',
  'folder_bindings',
  'sync_tombstone_reviews',
].forEach((needle) => assertNotContains(commitBody, needle, `commit API forbidden ${needle}`));

const planBody = functionBody(folders, 'buildRecentlyDeletedPurgePlan');
[
  'readVisibleFolderIdSet',
  'tombstones.list({ recordKind: \'folder\', includeRestored: true',
  'restoredSkippedCount',
  'activeVisibleSkippedCount',
  'protectedSkippedCount',
  'folderPurgeProtectionCodes',
  'operatorPurgeAvailable = true',
  'automatic-purge-deferred-operator-confirmation-required',
].forEach((needle) => assertContains(planBody, needle, `purge candidate guard ${needle}`));

[
  'previewRecentlyDeletedFolderPurge: previewRecentlyDeletedFolderPurge',
  'purgeRecentlyDeletedFolders: purgeRecentlyDeletedFolders',
].forEach((needle) => assertContains(folders, needle, `folder API export ${needle}`));

[
  'Phase 6A.1',
  'Desktop-only',
  'previewRecentlyDeletedFolderPurge',
  'purgeRecentlyDeletedFolders',
  'purgeFolderTombstonesByIds',
  'chatDeletedCount:0',
  'snapshotDeletedCount:0',
  'assetDeletedCount:0',
  'hardDeletedFolderRowCount:0',
  'receiptDeletedCount:0',
  'No UI button',
].forEach((needle) => assertContains(evidence, needle, `evidence ${needle}`));

console.log(JSON.stringify({
  ok: true,
  validator: 'validate-folder-purge-phase6a',
  folders: path.relative(root, foldersPath),
  tombstones: path.relative(root, tombstonesPath),
  evidence: path.relative(root, evidencePath),
  desktopOnly: true,
  chromeAuthority: false,
  uiButtonAdded: false,
}, null, 2));
