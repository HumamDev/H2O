#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const desktopSyncPath = path.join(root, 'src-surfaces-base/studio/sync/folder-sync.tauri.js');
const chromeExportPath = path.join(root, 'src-surfaces-base/studio/sync/auto-import.mv3.js');
const chromeImportPath = path.join(root, 'src-surfaces-base/studio/sync/folder-import.mv3.js');
const sidebarPath = path.join(root, 'src-surfaces-base/studio/S0Z1g. 🎬 Library Sidebar Sections - Studio.js');
const bridgePath = path.join(root, 'src-surfaces-base/studio/dev/folder-sync-rc-smoke-bridge.studio.js');
const evidencePath = path.join(root, 'release-evidence/2026-06-25/folder-delete-phase6b4-chrome-to-desktop-soft-delete.md');

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

for (const file of [desktopSyncPath, chromeExportPath, chromeImportPath, sidebarPath, bridgePath, evidencePath]) {
  assert(fs.existsSync(file), `${path.relative(root, file)} missing`);
}

const desktopSync = read(desktopSyncPath);
const chromeExport = read(chromeExportPath);
const chromeImport = read(chromeImportPath);
const sidebar = read(sidebarPath);
const bridge = read(bridgePath);
const evidence = read(evidencePath);

const desktopIngestBody = functionBody(desktopSync, 'ingestFolderDeleteRequestsFromChromeBundle');
const desktopAutoApplyBody = functionBody(desktopSync, 'autoApplyFolderDeleteRequestsFromChromeBundle');
const desktopImportBody = functionBody(desktopSync, 'importChromeLatestBundle');
const propagationBody = functionBody(desktopSync, 'propagationResult');
const diagnoseBody = functionBody(desktopSync, 'diagnose');
const chromeRequestExportBody = functionBody(chromeExport, 'collectFolderDeleteRequestsForExport');
const chromeExportLatestBody = functionBody(chromeExport, 'exportNow');
const chromeReceiptImportBody = functionBody(chromeImport, 'ingestFolderDeleteReceiptsFromDesktopBundle');
const chromeReceiptHideBody = functionBody(chromeImport, 'hideFoldersAfterFolderDeleteReceipts');
const companionDiagnosticBody = functionBody(sidebar, 'diagnoseChromeRecentlyDeletedCompanion');
const bridgeSyncBody = functionBody(bridge, 'syncNow');
const bridgeHealthBody = functionBody(bridge, 'diagnoseHealth');

[
  'listFolderDeleteRequests({ limit: 1000 })',
  "status === 'pending'",
  'pending-export-mirror',
  'requestCount',
].forEach((needle) => assertContains(chromeRequestExportBody, needle, `6B.4 Chrome pending request export ${needle}`));

[
  'bundle.folderDeleteRequests = folderDeleteRequestExport.requests || []',
  'state.lastFolderDeleteRequestExport = folderDeleteRequestExport',
].forEach((needle) => assertContains(chromeExportLatestBody, needle, `6B.4 chrome-latest request section ${needle}`));

[
  'ingestFolderDeleteRequests',
  'folderDeleteRequests',
  'state.lastFolderDeleteRequestImport = result',
].forEach((needle) => assertContains(desktopIngestBody, needle, `6B.4 Desktop request import ${needle}`));

[
  'schema: FOLDER_DELETE_REQUEST_SCHEMA + \'.desktop-auto-apply.v1\'',
  "phase: 'phase6b.4'",
  "model: 'desktop-auto-apply-safe-chrome-soft-delete'",
  'sanitizeFolderDeleteRequestForChromeDesktop',
  'findFolderDeleteRequestReviewForAutoApply',
  'reviews.applyFolderDeleteRequest',
  "reason: 'phase6b4-auto-apply-chrome-soft-delete'",
  'desktopImportedFolderDeleteRequestCount',
  'desktopAppliedFolderDeleteRequestCount',
  'receiptExportReadyCount',
  'noChromePurgeAuthority: true',
  'noChromeTombstoneApply: true',
  'noHardDelete: true',
  'noChatDelete: true',
  'noSnapshotDelete: true',
  'noAssetDelete: true',
  'noPurge: true',
].forEach((needle) => assertContains(desktopAutoApplyBody, needle, `6B.4 Desktop auto apply ${needle}`));

[
  'autoApplyFolderDeleteRequestsFromChromeBundle',
  'folderDeleteRequestAutoApply',
  'folderDeleteRequestImport',
  'blockers: blockers',
].forEach((needle) => assertContains(desktopImportBody, needle, `6B.4 import orchestration ${needle}`));

assertContains(propagationBody, 'folderDeleteRequestAutoApply: f.folderDeleteRequestAutoApply || null', '6B.4 propagation result surfaces auto apply');

[
  'lastFolderDeleteRequestAutoApply',
  'desktopImportedFolderDeleteRequestCount',
  'desktopAppliedFolderDeleteRequestCount',
  'noChromePurgeAuthority',
  'noChromeTombstoneApply',
].forEach((needle) => assertContains(diagnoseBody, needle, `6B.4 Desktop diagnose ${needle}`));

[
  'folderDeleteRequestImport: safeObject(result.folderDeleteRequestImport)',
  'folderDeleteRequestAutoApply: safeObject(result.folderDeleteRequestAutoApply)',
].forEach((needle) => assertContains(bridgeSyncBody, needle, `6B.4 smoke sync surfacing ${needle}`));

[
  'lastFolderDeleteRequestImport',
  'lastFolderDeleteRequestAutoApply',
].forEach((needle) => assertContains(bridgeHealthBody, needle, `6B.4 smoke health surfacing ${needle}`));

[
  'folderDeleteReceipts',
  'folderDeleteReceiptImport',
  'noTombstoneApply',
].forEach((needle) => assertContains(chromeReceiptImportBody + chromeReceiptHideBody, needle, `6B.4 Chrome receipt import ${needle}`));

[
  'chromeRecentlyDeletedCount',
  'pendingDeleteHiddenCount',
  'desktopReceiptHiddenCount',
  'chromeReceiptImportedCount',
  'chromePendingStillWaitingCount',
  'chromePermanentDeleteBlocked: true',
  'noChromePurgeAuthority: true',
  'noChromeTombstoneApply: true',
  'noHardDelete: true',
  'noChatDelete: true',
  'noSnapshotDelete: true',
  'noAssetDelete: true',
].forEach((needle) => assertContains(companionDiagnosticBody, needle, `6B.4 Chrome companion diagnostic ${needle}`));

[
  'purgeRecentlyDeletedFolders',
  'previewRecentlyDeletedFolderPurge',
  'clearRecentlyDeletedRestoredHistory',
  'DELETE FROM',
  'deleteChat(',
  'deleteSnapshot(',
].forEach((needle) => assertNotContains(desktopAutoApplyBody, needle, `6B.4 forbidden Desktop auto apply ${needle}`));

[
  'Phase 6B.4',
  'Desktop auto-applies safe Chrome soft-delete requests',
  'Chrome remains request-only',
  'Desktop Recently Deleted',
  'Chrome imports the Desktop delete receipt',
  'Permanent delete is only available from Desktop Studio.',
  'no Chrome purge authority',
  'no Chrome tombstone apply/create',
  'no hard delete',
  'no chat deletion',
  'no snapshot deletion',
  'no asset deletion',
].forEach((needle) => assertContains(evidence, needle, `6B.4 evidence ${needle}`));

console.log(JSON.stringify({
  ok: true,
  validator: 'validate-folder-delete-phase6b4-chrome-to-desktop-soft-delete',
  desktopSync: path.relative(root, desktopSyncPath),
  chromeExport: path.relative(root, chromeExportPath),
  chromeImport: path.relative(root, chromeImportPath),
  bridge: path.relative(root, bridgePath),
  evidence: path.relative(root, evidencePath),
  desktopApplyModel: 'auto-apply-safe-chrome-soft-delete',
  chromeAuthority: 'request-only',
  chromePurgeAuthority: false,
  hardDelete: false,
}, null, 2));
