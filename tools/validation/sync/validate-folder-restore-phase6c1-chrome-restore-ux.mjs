#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const sidebarPath = path.join(root, 'src-surfaces-base/studio/S0Z1g. 🎬 Library Sidebar Sections - Studio.js');
const reviewStorePath = path.join(root, 'src-surfaces-base/studio/store/tombstone-reviews.mv3.js');
const evidencePath = path.join(root, 'release-evidence/2026-06-25/folder-restore-phase6c1-chrome-restore-ux.md');

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

for (const file of [sidebarPath, reviewStorePath, evidencePath]) {
  assert(fs.existsSync(file), `${path.relative(root, file)} missing`);
}

const sidebar = read(sidebarPath);
const reviewStore = read(reviewStorePath);
const evidence = read(evidencePath);

const companionBody = functionBody(sidebar, 'renderChromeRecentlyDeletedCompanionPanel');
const diagnoseBody = functionBody(sidebar, 'diagnoseChromeRecentlyDeletedCompanion');
const restoreApiBody = functionBody(sidebar, 'chromeFolderRestoreRequestApi');
const restoreUxBody = functionBody(sidebar, 'chromeRestoreRequestUxAvailable');
const pendingRowsBody = functionBody(sidebar, 'loadPendingChromeFolderRestoreRequestRows');

[
  "const CHROME_RESTORE_REQUEST_LABEL = 'Request Restore'",
  "const CHROME_RESTORE_REQUEST_EXPORT_DEFERRED_MESSAGE = 'Restore request export will be added in 6C.2.'",
  "const CHROME_RESTORE_REQUEST_EXPORT_DEFERRED_BLOCKER = 'chrome-restore-request-export-deferred-phase6c2'",
].forEach((needle) => assertContains(sidebar, needle, `6C.1 restore UX constant ${needle}`));

[
  'tombstoneReviews',
].forEach((needle) => assertContains(restoreApiBody, needle, `6C.1 restore request API probe ${needle}`));

[
  'requestFolderRestore',
  'listFolderRestoreRequests',
].forEach((needle) => assertContains(restoreUxBody, needle, `6C.1 restore request availability ${needle}`));
assertContains(pendingRowsBody, 'listFolderRestoreRequests', '6C.1 pending restore request reader listFolderRestoreRequests');

[
  'CHROME_RESTORE_REQUEST_LABEL',
  'CHROME_RESTORE_REQUEST_EXPORT_DEFERRED_MESSAGE',
  'data-h2o-chrome-restore-request-only',
  'data-h2o-chrome-restore-request-deferred',
  'data-h2o-chrome-restore-direct-apply-blocked',
  'data-h2o-chrome-restore-request-6c2-blocker',
  "disabled: 'disabled'",
  'chromeRestoreRequestUxAvailable',
  'chromeRestoreDirectApplyBlocked: true',
  'noChromeRestoreAuthority: true',
  'noChromeTombstoneApply: true',
  'noChromeTombstoneCreate: true',
  'noHardDelete: true',
  'noChatDelete: true',
  'noSnapshotDelete: true',
  'noAssetDelete: true',
].forEach((needle) => assertContains(companionBody, needle, `6C.1 Chrome companion restore UX ${needle}`));

[
  'chromeRestoreRequestUxAvailable',
  'chromeRestoreRequestExportDeferred',
  'chromeRestoreRequestBlocker',
  'chromeRestoreRequestPendingCount',
  'pendingRestoreCount',
  'chromeRestoreDirectApplyBlocked: true',
  'noChromeRestoreAuthority: true',
  'restoreRequestRows',
  'CHROME_RESTORE_REQUEST_EXPORT_DEFERRED_BLOCKER',
].forEach((needle) => assertContains(diagnoseBody, needle, `6C.1 restore diagnostics ${needle}`));

[
  'restoreTombstonedFolder',
  'restoreFolder(',
  'purgeRecentlyDeletedFolders',
  'clearRecentlyDeletedRestoredHistory',
  'deleteChat(',
  'deleteSnapshot(',
  'DELETE FROM',
].forEach((needle) => assertNotContains(companionBody + pendingRowsBody, needle, `6C.1 forbidden Chrome restore behavior ${needle}`));

[
  'requestFolderDelete',
  'listFolderDeleteRequests',
  'diagnoseFolderDeleteRequests',
].forEach((needle) => assertContains(reviewStore, needle, `6C.1 existing delete request store still present ${needle}`));

[
  'Phase 6C.1',
  'Request Restore',
  'Restore request export will be added in 6C.2.',
  'chrome-restore-request-export-deferred-phase6c2',
  'no Chrome restore authority',
  'no Chrome tombstone apply/create',
  'no hard delete',
  'no chat deletion',
  'no snapshot deletion',
  'no asset deletion',
].forEach((needle) => assertContains(evidence, needle, `6C.1 evidence ${needle}`));

console.log(JSON.stringify({
  ok: true,
  validator: 'validate-folder-restore-phase6c1-chrome-restore-ux',
  companion: path.relative(root, sidebarPath),
  reviewStore: path.relative(root, reviewStorePath),
  evidence: path.relative(root, evidencePath),
  chromeRestoreAuthority: false,
  requestExportDeferredTo6C2: true,
  noChromeTombstoneApply: true,
  noHardDelete: true,
}, null, 2));
