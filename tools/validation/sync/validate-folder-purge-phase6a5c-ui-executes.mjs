#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const sidebarPath = path.join(root, 'src-surfaces-base/studio/S0Z1g. 🎬 Library Sidebar Sections - Studio.js');
const evidencePath = path.join(root, 'release-evidence/2026-06-25/folder-delete-restore-phase6a5c-purge-button-executes.md');

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

for (const file of [sidebarPath, evidencePath]) {
  assert(fs.existsSync(file), `${path.relative(root, file)} missing`);
}

const sidebar = read(sidebarPath);
const evidence = read(evidencePath);
const purgeBody = functionBody(sidebar, 'permanentlyDeleteRecentlyDeletedFolders');
const renderBody = functionBody(sidebar, 'renderRecentlyDeletedFoldersPanel');
const sidebarEntryBody = functionBody(sidebar, 'renderRecentlyDeletedFoldersSidebarEntry');

[
  "const reason = 'recently-deleted-ui-delete-permanently'",
  "previewFn.call(store, { reason })",
  'preview?.confirmationToken || preview?.previewToken',
  'candidateCount',
  'const confirmResult = window.confirm(confirmText)',
  'confirmResult === false',
  'Delete permanently cancelled.',
  'commitFn.call(store',
  'dryRun: false',
  'confirmationToken,',
  'expectedCount',
  'reason,',
  "confirmationPhrase: 'DELETE PERMANENTLY'",
  "confirmPhrase: 'DELETE PERMANENTLY'",
  "typedConfirmation: 'DELETE PERMANENTLY'",
  'deleteChats: false',
  'deleteSnapshots: false',
  'deleteAssets: false',
  'Deleted permanently:',
  'Delete permanently failed:',
  "logPurgeStep('preview'",
  "logPurgeStep('confirm'",
  "logPurgeStep('commit'",
].forEach((needle) => assertContains(purgeBody, needle, `6A.5c purge execution ${needle}`));

[
  'prompt(',
  'W.prompt',
  'Type DELETE PERMANENTLY',
  'const confirmFn = typeof W.confirm',
  'W.confirm.bind(W)',
  'confirmFn(confirmText)',
  'previewToken: confirmationToken',
  "reason: 'desktop-recently-deleted-ui-delete-permanently'",
  "reason: 'desktop-recently-deleted-ui-preview'",
  'remove(',
  'softDeleteEmptyFolder(',
  'restoreTombstonedFolder(',
  'deleteChat(',
  'deleteSnapshot(',
  'DELETE FROM',
  'folder_bindings',
  'sync_tombstone_reviews',
].forEach((needle) => assertNotContains(purgeBody, needle, `6A.5c forbidden purge execution ${needle}`));

[
  'Delete permanently',
  'purgeEligibleCount > 0 && purgeApiAvailable',
  'permanentlyDeleteRecentlyDeletedFolders',
  'wbSidebarNativeAction--danger',
].forEach((needle) => assertContains(renderBody, needle, `6A.5c main purge button ${needle}`));

assertNotContains(sidebarEntryBody, 'Delete permanently', 'sidebar purge button');
assertNotContains(sidebarEntryBody, 'permanentlyDeleteRecentlyDeletedFolders', 'sidebar purge action');

[
  'Phase 6A.5c',
  'Delete permanently',
  'window.confirm',
  'recently-deleted-ui-delete-permanently',
  'confirmationPhrase:"DELETE PERMANENTLY"',
  'confirmPhrase:"DELETE PERMANENTLY"',
  'typedConfirmation:"DELETE PERMANENTLY"',
  'Deleted permanently: N',
  'chatDeletedCount:0',
  'snapshotDeletedCount:0',
  'assetDeletedCount:0',
  'hardDeletedFolderRowCount:0',
  'receiptDeletedCount:0',
  'Chrome has no purge button',
].forEach((needle) => assertContains(evidence, needle, `6A.5c evidence ${needle}`));

console.log(JSON.stringify({
  ok: true,
  validator: 'validate-folder-purge-phase6a5c-ui-executes',
  ui: path.relative(root, sidebarPath),
  evidence: path.relative(root, evidencePath),
  exactBackendPayload: true,
  nativeConfirm: true,
  promptRemoved: true,
  chromeAuthority: false,
}, null, 2));
