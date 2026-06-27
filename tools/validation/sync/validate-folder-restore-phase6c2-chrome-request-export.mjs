#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const sidebarPath = path.join(root, 'src-surfaces-base/studio/S0Z1g. 🎬 Library Sidebar Sections - Studio.js');
const reviewStorePath = path.join(root, 'src-surfaces-base/studio/store/tombstone-reviews.mv3.js');
const autoImportPath = path.join(root, 'src-surfaces-base/studio/sync/auto-import.mv3.js');
const bridgePath = path.join(root, 'src-surfaces-base/studio/dev/folder-sync-rc-smoke-bridge.studio.js');
const cdpPath = path.join(root, 'tools/smoke/chrome-cdp-studio.mjs');
const evidencePath = path.join(root, 'release-evidence/2026-06-25/folder-restore-phase6c2-chrome-request-export.md');

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

for (const file of [sidebarPath, reviewStorePath, autoImportPath, bridgePath, cdpPath, evidencePath]) {
  assert(fs.existsSync(file), `${path.relative(root, file)} missing`);
}

const sidebar = read(sidebarPath);
const reviewStore = read(reviewStorePath);
const autoImport = read(autoImportPath);
const bridge = read(bridgePath);
const cdp = read(cdpPath);
const evidence = read(evidencePath);

const requestBody = functionBody(reviewStore, 'requestFolderRestore');
const listBody = functionBody(reviewStore, 'listFolderRestoreRequests');
const diagnoseBody = functionBody(reviewStore, 'diagnoseFolderRestoreRequests');
const sanitizeBody = functionBody(autoImport, 'sanitizeFolderRestoreRequestForExport');
const collectBody = functionBody(autoImport, 'collectFolderRestoreRequestsForExport');
const exportBody = functionBody(autoImport, 'exportNow');
const companionBody = functionBody(sidebar, 'renderChromeRecentlyDeletedCompanionPanel');
const companionRequestBody = functionBody(sidebar, 'requestChromeFolderRestoreFromCompanion');
const companionDiagnosticBody = functionBody(sidebar, 'diagnoseChromeRecentlyDeletedCompanion');

[
  'FOLDER_RESTORE_REQUEST_SCHEMA',
  'h2o.studio.folder-restore-request.v1',
  'FOLDER_RESTORE_REQUEST_EXPORT_KEY',
  'h2o:studio:folder-restore-requests:pending-export:v1',
  'FOLDER_RESTORE_REQUEST_EXPORT_MIRROR_SCHEMA',
  'restore-request',
].forEach((needle) => assertContains(reviewStore + autoImport, needle, `6C.2 restore schema/export constant ${needle}`));

[
  'folder-restore-request',
  'desktopRestoreRequired: true',
  'noChromeRestoreAuthority: true',
  'noTombstoneApply: true',
  'noTombstoneCreate: true',
  'noHardDelete: true',
  'noPurge: true',
  'noChatDelete: true',
  'noSnapshotDelete: true',
  'noAssetDelete: true',
].forEach((needle) => assertContains(requestBody, needle, `6C.2 restore request writer ${needle}`));

[
  'folder-restore-request-blocked-purged',
  'folder-restore-request-non-canonical-row',
  'findPendingFolderRestoreRequest(folderId)',
  'pending-existing',
  'upsertFolderRestoreRequestExportMirror',
].forEach((needle) => assertContains(requestBody, needle, `6C.2 restore request guard/idempotency ${needle}`));

[
  "classification: 'restore-request'",
  'parseFolderRestoreRequestPayload',
].forEach((needle) => assertContains(listBody, needle, `6C.2 restore request list ${needle}`));

[
  'pendingCount',
  'totalCount',
  'noChromeRestoreAuthority: true',
  'desktopRestoreRequired: true',
  'duplicatesSinceBoot',
].forEach((needle) => assertContains(diagnoseBody, needle, `6C.2 restore request diagnostics ${needle}`));

[
  'requestFolderRestore: requestFolderRestore',
  'listFolderRestoreRequests: listFolderRestoreRequests',
  'diagnoseFolderRestoreRequests: diagnoseFolderRestoreRequests',
  'folderRestoreRequestSchema',
].forEach((needle) => assertContains(reviewStore, needle, `6C.2 restore request public API ${needle}`));

[
  'desktopRestoreRequired',
  'noChromeRestoreAuthority',
  'noTombstoneApply',
  'noHardDelete',
  'noChatDelete',
  'noSnapshotDelete',
  'noAssetDelete',
].forEach((needle) => assertContains(sanitizeBody, needle, `6C.2 restore export sanitizer ${needle}`));
assertContains(autoImport, 'sanitizeFolderRestoreRequestForExport', '6C.2 restore export sanitizer function');
assertContains(exportBody, 'folderRestoreRequests', '6C.2 restore export top-level folderRestoreRequests');

[
  'collectFolderRestoreRequestsForExport',
  'folderRestoreRequestExport',
  'requestCount',
  'pendingRestoreRequestCount',
  'skippedCount',
  'purgedRestoreBlockedCount',
  'invalidCount',
  'reviewRequestCount',
  'mirrorRequestCount',
  'staleMirrorSkippedCount',
  'blockers',
].forEach((needle) => assertContains(collectBody + exportBody, needle, `6C.2 restore export summary ${needle}`));

[
  'bundle.folderRestoreRequests = folderRestoreRequestExport.requests || []',
  'state.lastFolderRestoreRequestExport = folderRestoreRequestExport',
  'folderRestoreRequestExport: {',
  'desktopRestoreRequired: true',
].forEach((needle) => assertContains(exportBody, needle, `6C.2 chrome-latest export ${needle}`));

[
  'api.requestFolderRestore',
  'Restore pending',
  'Restore already pending',
  'folder-restore-request-blocked-purged',
  'folder-restore-request-non-canonical-row',
].forEach((needle) => assertContains(companionRequestBody, needle, `6C.2 companion request handler ${needle}`));
assertContains(sidebar, 'requestChromeFolderRestoreFromCompanion', '6C.2 companion request handler function');

[
  'restoreRequestEligible',
  'data-h2o-chrome-restore-request-only',
  'CHROME_RESTORE_REQUEST_LABEL',
  'Request-only. Desktop Studio must apply restore before this folder returns.',
  'Restore pending. Desktop Studio must apply it before this folder returns.',
].forEach((needle) => assertContains(companionBody, needle, `6C.2 companion enabled UX ${needle}`));

[
  'chromeRestoreRequestUxAvailable',
  'chromeRestoreRequestExportAvailable',
  'chromeRestoreRequestPendingCount',
  'folderRestoreRequestExportableCount',
  'pendingRestoreCount',
  'restoreRequestRows',
  'chromeRestoreDirectApplyBlocked: true',
  'noChromeRestoreAuthority: true',
].forEach((needle) => assertContains(companionDiagnosticBody, needle, `6C.2 companion diagnostics ${needle}`));

[
  'requestFolderRestore',
  'listFolderRestoreRequests',
  'folderRestoreRequestExport',
].forEach((needle) => assertContains(bridge + cdp, needle, `6C.2 smoke support ${needle}`));

[
  'restoreTombstonedFolder',
  'restoreFolder(',
  'purgeRecentlyDeletedFolders',
  'clearRecentlyDeletedRestoredHistory',
  'deleteChat(',
  'deleteSnapshot(',
  'DELETE FROM',
].forEach((needle) => assertNotContains(requestBody + companionRequestBody + sanitizeBody + collectBody, needle, `6C.2 forbidden Chrome restore/export behavior ${needle}`));

[
  'Phase 6C.2',
  'folderRestoreRequests[]',
  'requestFolderRestore',
  'folderRestoreRequestExport.requestCount',
  'Desktop remains canonical',
  'no Chrome restore authority',
  'no Chrome tombstone apply/create',
  'no hard delete',
  'no chat deletion',
  'no snapshot deletion',
  'no asset deletion',
].forEach((needle) => assertContains(evidence, needle, `6C.2 evidence ${needle}`));

console.log(JSON.stringify({
  ok: true,
  validator: 'validate-folder-restore-phase6c2-chrome-request-export',
  reviewStore: path.relative(root, reviewStorePath),
  autoImport: path.relative(root, autoImportPath),
  companion: path.relative(root, sidebarPath),
  bridge: path.relative(root, bridgePath),
  cdp: path.relative(root, cdpPath),
  evidence: path.relative(root, evidencePath),
  chromeRestoreAuthority: false,
  chromeRestoreRequestExport: true,
  noChromeTombstoneApply: true,
  noHardDelete: true,
}, null, 2));
