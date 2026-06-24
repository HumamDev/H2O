#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const foldersPath = path.join(root, 'src-surfaces-base/studio/store/folders.tauri.js');
const bridgePath = path.join(root, 'src-surfaces-base/studio/dev/folder-sync-rc-smoke-bridge.studio.js');
const clientPath = path.join(root, 'tools/smoke/desktop-folder-sync-queue-client.mjs');
const evidencePath = path.join(root, 'release-evidence/2026-06-24/folder-delete-restore-phase6a1b-purge-resurrection-fix.md');

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

for (const file of [foldersPath, bridgePath, clientPath, evidencePath]) {
  assert(fs.existsSync(file), `${path.relative(root, file)} missing`);
}

const folders = read(foldersPath);
const bridge = read(bridgePath);
const client = read(clientPath);
const evidence = read(evidencePath);

[
  'PHASE6A_PERMANENT_PURGE_META_KEY',
  'phase6aPermanentlyPurged',
  'PHASE6A_PERMANENT_PURGE_SOURCE',
  'phase6aPermanentPurgeWhereClause',
  'phase6aPermanentPurgeWhereValues',
  'permanentlySuppressPurgedFolderRows',
  'diagnosePurgedFolderResurrectionCandidates',
  'permanentlyHiddenFolderRowCount',
  'purgedTombstoneCount',
  'purgedFolderRowCount',
  'folderRowAlreadyMissingCount',
  'folderRowAlreadySuppressedCount',
  'purgePermanentlySuppressesFolderRows: true',
  'purgeDeletesFolderRows: false',
].forEach((needle) => assertContains(folders, needle, `folders 6A.1b ${needle}`));

const listBody = functionBody(folders, 'listFolders');
[
  'includePurged',
  'phase6aPermanentPurgeWhereClause()',
  'phase6aPermanentPurgeWhereValues()',
  'sqlSelect(sql, values)',
].forEach((needle) => assertContains(listBody, needle, `listFolders permanent purge filter ${needle}`));

const countBody = functionBody(folders, 'countFolders');
[
  'phase6aPermanentPurgeWhereClause()',
  'phase6aPermanentPurgeWhereValues()',
].forEach((needle) => assertContains(countBody, needle, `countFolders permanent purge filter ${needle}`));

const suppressionBody = functionBody(folders, 'permanentlySuppressPurgedFolderRows');
[
  'readVisibleFolderIdSet',
  'folderPurgeProtectionCodes',
  'patchOne(folderId',
  'phase6aPermanentlyPurged: true',
  'phase6aPurgeTombstoneId',
  'hardDeletedFolderRowCount: 0',
  'chatDeletedCount: 0',
  'snapshotDeletedCount: 0',
  'assetDeletedCount: 0',
  'receiptDeletedCount: 0',
].forEach((needle) => assertContains(suppressionBody, needle, `folder-row suppression safety ${needle}`));

[
  'DELETE FROM folders',
  'DELETE FROM folder_bindings',
  'DELETE FROM chats',
  'DELETE FROM snapshots',
  'deleteChat',
  'deleteSnapshot',
  'softDeleteEmptyFolder(',
  'remove(',
].forEach((needle) => assertNotContains(suppressionBody, needle, `folder-row suppression forbidden ${needle}`));

const commitBody = functionBody(folders, 'purgeRecentlyDeletedFolders');
const suppressIndex = commitBody.indexOf('permanentlySuppressPurgedFolderRows');
const tombstoneIndex = commitBody.indexOf('tombstones.purgeFolderTombstonesByIds');
assert(suppressIndex >= 0, 'purgeRecentlyDeletedFolders must suppress folder rows');
assert(tombstoneIndex >= 0, 'purgeRecentlyDeletedFolders must purge exact tombstones');
assert(suppressIndex < tombstoneIndex, 'folder row suppression must happen before tombstone purge');
[
  'folder-row-suppression-failed',
  'folderRowSuppression',
  'permanentlyHiddenFolderRowCount',
  'purgedTombstoneCount',
].forEach((needle) => assertContains(commitBody, needle, `commit handoff ${needle}`));

[
  'DELETE FROM',
  'deleteChat',
  'deleteSnapshot',
  'sync_tombstone_reviews',
].forEach((needle) => assertNotContains(commitBody, needle, `commit forbidden ${needle}`));

[
  'zz-4d4-delete-restore-*',
  'zz-5c-*',
  'F5D Test Folder*',
  'zz-delete-*',
  'readOnly: true',
].forEach((needle) => assertContains(folders, needle, `resurrection diagnostic ${needle}`));

[
  'diagnosePurgedFolderResurrectionCandidates',
  'noHardDelete: true',
  'noPurge: true',
  'noChatDelete: true',
  'noSnapshotDelete: true',
].forEach((needle) => assertContains(bridge, `bridge ${needle}`.replace('bridge ', ''), `bridge ${needle}`));

assertContains(client, "'diagnosePurgedFolderResurrectionCandidates'", 'desktop queue read-only op');
assert(!client.includes("'purgeRecentlyDeletedFolders'"), 'desktop queue must not expose purge commit op');

[
  'Phase 6A.1b',
  'phase6aPermanentlyPurged',
  'permanentlyHiddenFolderRowCount',
  'purgedTombstoneCount',
  'chatDeletedCount:0',
  'snapshotDeletedCount:0',
  'assetDeletedCount:0',
  'hardDeletedFolderRowCount:0',
  'diagnosePurgedFolderResurrectionCandidates',
].forEach((needle) => assertContains(evidence, needle, `evidence ${needle}`));

console.log(JSON.stringify({
  ok: true,
  validator: 'validate-folder-purge-phase6a1b',
  folders: path.relative(root, foldersPath),
  bridge: path.relative(root, bridgePath),
  client: path.relative(root, clientPath),
  evidence: path.relative(root, evidencePath),
  folderRowsHardDeleted: false,
  permanentSuppression: true,
  chromeAuthority: false,
}, null, 2));
