#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const sidebarPath = path.join(root, 'src-surfaces-base/studio/S0Z1g. 🎬 Library Sidebar Sections - Studio.js');
const workspacePath = path.join(root, 'src-surfaces-base/studio/S0F1b. 🎬 Library Workspace - Studio.js');
const evidencePath = path.join(root, 'release-evidence/2026-06-25/folder-delete-phase6b3a-chrome-companion-state.md');

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

for (const file of [sidebarPath, workspacePath, evidencePath]) {
  assert(fs.existsSync(file), `${path.relative(root, file)} missing`);
}

const sidebar = read(sidebarPath);
const workspace = read(workspacePath);
const evidence = read(evidencePath);

const readSourcesBody = functionBody(sidebar, 'readChromeFolderStateMirrorSources');
const mergeBody = functionBody(sidebar, 'mergeChromeFolderStateMirror');
const writeMirrorBody = functionBody(sidebar, 'writeChromeFolderStateMirror');
const companionRowsBody = functionBody(sidebar, 'chromeRecentlyDeletedCompanionRows');
const requestRowsBody = functionBody(sidebar, 'loadPendingChromeFolderDeleteRequestRows');
const requestRowToCompanionBody = functionBody(sidebar, 'folderDeleteRequestRowToCompanionRow');
const diagnoseBody = functionBody(sidebar, 'diagnoseChromeRecentlyDeletedCompanion');
const readStorageBody = functionBody(workspace, 'readStorageKey');

[
  'chrome.storage.local+localStorage',
  'hiddenByChromePendingDeleteChromeCount',
  'hiddenByChromePendingDeleteLocalCount',
  'hiddenByChromePendingDeleteMergedCount',
  'desktopReceiptHiddenMergedCount',
].forEach((needle) => assertContains(readSourcesBody, needle, `6B.3a storage source diagnostics ${needle}`));

[
  'hiddenByChromePendingDelete',
  'hiddenByDesktopReceipt',
  'hiddenByDesktopVisibleSet',
].forEach((needle) => {
  assertContains(mergeBody, needle, `6B.3a mirror merge ${needle}`);
  assertContains(readStorageBody, needle, `6B.3a FolderParity storage merge ${needle}`);
});

[
  'const wroteChromeStorage = await chromeStorageSet',
  'const wroteLocalStorage = writeJson',
  'return wroteChromeStorage || wroteLocalStorage',
].forEach((needle) => assertContains(writeMirrorBody, needle, `6B.3a write both storage namespaces ${needle}`));

[
  'listFolderDeleteRequests({ status: \'pending\', limit: 1000 })',
  'folderDeleteRequestRowToCompanionRow',
].forEach((needle) => assertContains(requestRowsBody, needle, `6B.3a request store fallback ${needle}`));

[
  'chrome-folder-delete-request-store',
  'pendingDeleteRequest: true',
  'desktopAuthorityRequired: true',
  'noChromeTombstoneApply: true',
  'noPurge: true',
].forEach((needle) => assertContains(requestRowToCompanionBody, needle, `6B.3a request row companion shape ${needle}`));

[
  'const requestRows = await loadPendingChromeFolderDeleteRequestRows()',
  'pendingDeleteRequest: true',
].forEach((needle) => assertContains(companionRowsBody, needle, `6B.3a companion reads request store ${needle}`));

[
  'chromeProfileSource',
  'extensionId',
  'storageNamespaceSource',
  'hiddenByChromePendingDeleteCount',
  'pendingDeleteRequestCount',
  'companionStateSource',
  'probeName',
  'existsInNormalRows',
  'existsInHiddenPendingRows',
  'existsInRequestStore',
  'existsInCompanionRows',
  'storageDiagnostics',
  'chromePermanentDeleteBlocked: true',
  'noChromePurgeAuthority: true',
  'noChromeTombstoneApply: true',
  'noHardDelete: true',
  'noChatDelete: true',
  'noSnapshotDelete: true',
  'noAssetDelete: true',
].forEach((needle) => assertContains(diagnoseBody, needle, `6B.3a diagnostic field ${needle}`));

[
  'purgeRecentlyDeletedFolders',
  'previewRecentlyDeletedFolderPurge',
  'clearRecentlyDeletedRestoredHistory',
  'restoreTombstonedFolder',
  'deleteChat(',
  'deleteSnapshot(',
  'DELETE FROM',
].forEach((needle) => assertNotContains(companionRowsBody + requestRowsBody + requestRowToCompanionBody, needle, `6B.3a forbidden companion/request behavior ${needle}`));

[
  'Phase 6B.3a',
  'chrome.storage.local+localStorage',
  'pending delete request store',
  'same Chrome profile',
  'separate profiles',
  'native-owner-timeout',
  'Permanent delete is only available from Desktop Studio.',
  'no Chrome purge authority',
].forEach((needle) => assertContains(evidence, needle, `6B.3a evidence ${needle}`));

console.log(JSON.stringify({
  ok: true,
  validator: 'validate-folder-delete-phase6b3a-companion-state',
  ui: path.relative(root, sidebarPath),
  workspace: path.relative(root, workspacePath),
  evidence: path.relative(root, evidencePath),
  mergedStorage: true,
  requestStoreFallback: true,
  chromeAuthority: false,
}, null, 2));
