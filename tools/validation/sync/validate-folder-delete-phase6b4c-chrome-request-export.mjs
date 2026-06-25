#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const sidebarPath = path.join(root, 'src-surfaces-base/studio/S0Z1g. 🎬 Library Sidebar Sections - Studio.js');
const chromeExportPath = path.join(root, 'src-surfaces-base/studio/sync/auto-import.mv3.js');
const actionsPath = path.join(root, 'src-surfaces-base/studio/S0F3b. 🎬 Folders Actions - Studio.js');
const reviewsPath = path.join(root, 'src-surfaces-base/studio/store/tombstone-reviews.mv3.js');
const evidencePath = path.join(root, 'release-evidence/2026-06-25/folder-delete-phase6b4c-chrome-request-export.md');

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

for (const file of [sidebarPath, chromeExportPath, actionsPath, reviewsPath, evidencePath]) {
  assert(fs.existsSync(file), `${path.relative(root, file)} missing`);
}

const sidebar = read(sidebarPath);
const chromeExport = read(chromeExportPath);
const actions = read(actionsPath);
const reviews = read(reviewsPath);
const evidence = read(evidencePath);

const uiDeleteBody = functionBody(sidebar, 'requestChromeFolderDelete');
const companionDiagnosticBody = functionBody(sidebar, 'diagnoseChromeRecentlyDeletedCompanion');
const exportCollectBody = functionBody(chromeExport, 'collectFolderDeleteRequestsForExport');
const repairBody = functionBody(chromeExport, 'repairPendingHiddenFolderDeleteRequestsForExport');
const hiddenReadBody = functionBody(chromeExport, 'readChromePendingDeleteHiddenRowsForExport');
const exportNowBody = functionBody(chromeExport, 'exportNow');
const actionRequestBody = functionBody(actions, 'chromeRequestDelete');
const reviewRequestBody = functionBody(reviews, 'requestFolderDelete');
const hiddenRowsBody = functionBody(chromeExport, 'hiddenPendingFolderDeleteRowsFromState');

[
  'actions.requestDelete.bind(actions)',
  'store.requestFolderDelete.bind(store)',
  'markChromeFolderPendingDeleteHidden(item, result)',
].forEach((needle) => assertContains(uiDeleteBody, needle, `6B.4c Chrome Delete UI request path ${needle}`));

[
  'reviewStore.requestFolderDelete(folderInput, options || {})',
  'payload: result && result.payload || null',
].forEach((needle) => assertContains(actionRequestBody, needle, `6B.4c actions facade request writer ${needle}`));

[
  'createReview(review)',
  'upsertFolderDeleteRequestExportMirror(payload)',
  'upsertFolderDeleteRequestExportMirror(existingPayload || existing)',
  "status: 'pending-created'",
  "status: 'pending-existing'",
].forEach((needle) => assertContains(reviewRequestBody, needle, `6B.4c tombstone request writer ${needle}`));

[
  'FOLDER_STATE_KEY_LOCAL',
  'readKv(FOLDER_STATE_KEY_LOCAL)',
  'localStorage',
].forEach((needle) => assertContains(hiddenReadBody, needle, `6B.4c pending-hide export read ${needle}`));

[
  'hiddenByChromePendingDelete',
  'folderId',
].forEach((needle) => assertContains(hiddenRowsBody, needle, `6B.4c pending-hide row normalization ${needle}`));

[
  'reviews.requestFolderDelete',
  'phase6b4c-repair-pending-hide-export-request',
  'pending-hide-without-exportable-delete-request',
  'repairedRequestCount',
  'hiddenWithoutExportableRequestCount',
].forEach((needle) => assertContains(repairBody, needle, `6B.4c pending-hide repair ${needle}`));

[
  'repairPendingHiddenFolderDeleteRequestsForExport()',
  'pendingDeleteHiddenCount',
  'hiddenWithoutExportableRequestCount',
  'repairedHiddenRequestCount',
  'pendingHiddenRepair',
  "status === 'pending'",
  'pending-export-mirror',
].forEach((needle) => assertContains(exportCollectBody, needle, `6B.4c export collection ${needle}`));

[
  'folderDeleteRequestExport.requestCount',
  'pendingDeleteHiddenCount',
  'hiddenWithoutExportableRequestCount',
  'repairedHiddenRequestCount',
  'pendingHiddenRepair',
].forEach((needle) => assertContains(exportNowBody, needle, `6B.4c export result surfacing ${needle}`));

[
  'pendingDeleteRequestCount',
  'exportableFolderDeleteRequestCount',
  'requestStoreRows',
  'hiddenWithoutExportableRequestCount',
  'hiddenWithoutExportableRequestRows',
  'pending-hide-without-exportable-delete-request',
].forEach((needle) => assertContains(companionDiagnosticBody, needle, `6B.4c companion diagnostic ${needle}`));

[
  'purgeRecentlyDeletedFolders',
  'previewRecentlyDeletedFolderPurge',
  'clearRecentlyDeletedRestoredHistory',
  'DELETE FROM',
  'deleteChat(',
  'deleteSnapshot(',
  'deleteAssets',
].forEach((needle) => assertNotContains(repairBody + exportCollectBody + uiDeleteBody, needle, `6B.4c forbidden Chrome request/export behavior ${needle}`));

[
  'Phase 6B.4c',
  'folderDeleteRequestExport.requestCount',
  'pending-hide-without-exportable-delete-request',
  'Chrome remains request-only',
  'Desktop remains authoritative',
  'no Chrome permanent delete',
  'no Chrome purge authority',
].forEach((needle) => assertContains(evidence, needle, `6B.4c evidence ${needle}`));

console.log(JSON.stringify({
  ok: true,
  validator: 'validate-folder-delete-phase6b4c-chrome-request-export',
  sidebar: path.relative(root, sidebarPath),
  chromeExport: path.relative(root, chromeExportPath),
  actions: path.relative(root, actionsPath),
  reviews: path.relative(root, reviewsPath),
  evidence: path.relative(root, evidencePath),
  chromeAuthority: 'request-only',
  exportRepair: 'pending-hide-to-phase4c-request-writer',
  chromePurgeAuthority: false,
}, null, 2));
