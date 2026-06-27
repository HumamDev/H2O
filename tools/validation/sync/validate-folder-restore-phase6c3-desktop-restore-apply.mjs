#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const desktopSyncPath = path.join(root, 'src-surfaces-base/studio/sync/folder-sync.tauri.js');
const reviewStorePath = path.join(root, 'src-surfaces-base/studio/store/tombstone-reviews.tauri.js');
const foldersStorePath = path.join(root, 'src-surfaces-base/studio/store/folders.tauri.js');
const bridgePath = path.join(root, 'src-surfaces-base/studio/dev/folder-sync-rc-smoke-bridge.studio.js');
const evidencePath = path.join(root, 'release-evidence/2026-06-25/folder-restore-phase6c3-desktop-restore-apply.md');

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertContains(source, needle, label) {
  assert(source.includes(needle), `${label} missing ${needle}`);
}

function functionBody(source, name) {
  const match = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`).exec(source);
  const start = match ? match.index : -1;
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

for (const file of [desktopSyncPath, reviewStorePath, foldersStorePath, bridgePath, evidencePath]) {
  assert(fs.existsSync(file), `${path.relative(root, file)} missing`);
}

const desktopSync = read(desktopSyncPath);
const reviewStore = read(reviewStorePath);
const foldersStore = read(foldersStorePath);
const bridge = read(bridgePath);
const evidence = read(evidencePath);

const normalizeBody = functionBody(reviewStore, 'normalizeFolderRestoreRequest');
const ingestBody = functionBody(reviewStore, 'ingestFolderRestoreRequests');
const applyBody = functionBody(reviewStore, 'applyFolderRestoreRequest');
const markAppliedBody = functionBody(reviewStore, 'markFolderRestoreRequestApplied');
const syncSanitizeBody = functionBody(desktopSync, 'sanitizeFolderRestoreRequestForChromeDesktop');
const syncIngestBody = functionBody(desktopSync, 'ingestFolderRestoreRequestsFromChromeBundle');
const syncAutoApplyBody = functionBody(desktopSync, 'autoApplyFolderRestoreRequestsFromChromeBundle');
const importBody = functionBody(desktopSync, 'importChromeLatestBundle');
const propagationBody = functionBody(desktopSync, 'propagationResult');
const bridgeSyncBody = functionBody(bridge, 'syncNow');
const bridgeApplyBody = functionBody(bridge, 'applyFolderRestoreRequest');

[
  'FOLDER_RESTORE_REQUEST_SCHEMA',
  'h2o.studio.folder-restore-request.v1',
  "'restore-request': true",
  'folderRestoreRequestSchema',
].forEach((needle) => assertContains(reviewStore + desktopSync, needle, `6C.3 restore schema ${needle}`));

[
  "intent) !== 'folder-restore-request'",
  'desktopRestoreRequired !== true && payload.desktopApplyRequired !== true',
  'noChromeRestoreAuthority: true',
  'noTombstoneApply: true',
  'noTombstoneCreate: true',
  'noHardDelete: true',
  'noPurge: true',
  'noChatDelete: true',
  'noSnapshotDelete: true',
  'noAssetDelete: true',
].forEach((needle) => assertContains(normalizeBody, needle, `6C.3 normalize guard ${needle}`));

[
  'folderRestoreRequests',
  'ingestFolderRestoreRequestRow',
  'buildReviewRecordFromFolderRestoreRequest',
  'folder-restore-request-imported',
  'state.lastFolderRestoreRequestIngest = result',
].forEach((needle) => assertContains(ingestBody + reviewStore, needle, `6C.3 restore ingest ${needle}`));

[
  'validateFolderRestoreRequestReviewForApply',
  'restoreTombstonedFolder || folders.restoreFolder',
  'phase6c3-auto-apply-chrome-folder-restore',
  'folder-restore-request-no-active-tombstone',
  'alreadyRestored: true',
  'markFolderRestoreRequestApplied',
].forEach((needle) => assertContains(applyBody, needle, `6C.3 restore apply ${needle}`));
assertContains(reviewStore, 'folder-restore-request-blocked-purged', '6C.3 restore apply purged blocker');
[
  'noChromeRestoreAuthority: true',
  'noChromeTombstoneApply: true',
  'noHardDelete: true',
  'noChatDelete: true',
  'noSnapshotDelete: true',
  'noAssetDelete: true',
].forEach((needle) => assertContains(reviewStore, needle, `6C.3 restore apply safety ${needle}`));

[
  'applied-folder-restore-request',
  'already-restored-folder-restore-request',
  'bindingRestoreAttemptedCount',
  'localTombstoneRestored',
].forEach((needle) => assertContains(markAppliedBody, needle, `6C.3 resolved restore request ${needle}`));

[
  'desktopRestoreRequired: true',
  'noChromeRestoreAuthority: true',
  'noTombstoneApply: true',
  'noHardDelete: true',
  'noChatDelete: true',
  'noSnapshotDelete: true',
  'noAssetDelete: true',
].forEach((needle) => assertContains(syncSanitizeBody, needle, `6C.3 Desktop restore request sanitizer ${needle}`));
assertContains(desktopSync, 'folderRestoreRequests', '6C.3 Desktop restore request bundle section');

[
  'reviews.ingestFolderRestoreRequests',
  'state.lastFolderRestoreRequestImport = result',
  'desktopRestoreDeferred = true',
].forEach((needle) => assertContains(syncIngestBody, needle, `6C.3 Desktop restore import ${needle}`));

[
  "phase: 'phase6c.3'",
  "model: 'desktop-auto-apply-safe-chrome-folder-restore'",
  'reviews.applyFolderRestoreRequest',
  'appliedCount',
  'alreadyAppliedCount',
  'purgedBlockedCount',
  'noActiveTombstoneBlockedCount',
  'desktopImportedFolderRestoreRequestCount',
  'desktopAppliedFolderRestoreRequestCount',
  'noChromeRestoreAuthority: true',
  'noChromeTombstoneApply: true',
  'noHardDelete: true',
  'noChatDelete: true',
  'noSnapshotDelete: true',
  'noAssetDelete: true',
].forEach((needle) => assertContains(syncAutoApplyBody, needle, `6C.3 Desktop restore auto apply ${needle}`));

[
  'ingestFolderRestoreRequestsFromChromeBundle',
  'autoApplyFolderRestoreRequestsFromChromeBundle',
  'folderRestoreRequestImport',
  'folderRestoreRequestAutoApply',
].forEach((needle) => assertContains(importBody + propagationBody + bridgeSyncBody, needle, `6C.3 orchestration ${needle}`));

[
  'applyFolderRestoreRequest',
  'folder-restore-apply-api-unavailable',
  'noChromeRestoreAuthority: true',
  'noChromeTombstoneApply: true',
  'noHardDelete: true',
].forEach((needle) => assertContains(bridgeApplyBody + bridge, needle, `6C.3 smoke bridge apply ${needle}`));

[
  'restoreTombstonedFolder',
  'noHardDelete: true',
  'noChatDelete: true',
].forEach((needle) => assertContains(foldersStore, needle, `6C.3 canonical folder restore primitive ${needle}`));

[
  'folderRestoreRequestImport.found',
  'folderRestoreRequestAutoApply.appliedCount',
  'purgedBlockedCount',
  'noActiveTombstoneBlockedCount',
  'no hard delete',
  'no chat',
  'no snapshot',
  'no asset',
].forEach((needle) => assertContains(evidence, needle, `6C.3 evidence ${needle}`));

console.log('validate-folder-restore-phase6c3-desktop-restore-apply: ok');
