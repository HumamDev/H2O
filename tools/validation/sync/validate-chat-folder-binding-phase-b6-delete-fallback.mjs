#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const bridgePath = path.join(root, 'src-surfaces-base/studio/dev/folder-sync-rc-smoke-bridge.studio.js');
const folderStorePath = path.join(root, 'src-surfaces-base/studio/store/folders.tauri.js');
const exportBundlePath = path.join(root, 'src-surfaces-base/studio/ingestion/export-bundle.tauri.js');
const chromeImportPath = path.join(root, 'src-surfaces-base/studio/sync/folder-import.mv3.js');
const desktopClientPath = path.join(root, 'tools/smoke/desktop-folder-sync-queue-client.mjs');
const chromeClientPath = path.join(root, 'tools/smoke/chrome-cdp-studio.mjs');
const evidencePath = path.join(root, 'release-evidence/2026-06-25/chat-folder-binding-phase-b6-delete-fallback.md');

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

for (const file of [bridgePath, folderStorePath, exportBundlePath, chromeImportPath, desktopClientPath, chromeClientPath, evidencePath]) {
  assert(fs.existsSync(file), `${path.relative(root, file)} missing`);
}

const bridge = read(bridgePath);
const folderStore = read(folderStorePath);
const exportBundle = read(exportBundlePath);
const chromeImport = read(chromeImportPath);
const desktopClient = read(desktopClientPath);
const chromeClient = read(chromeClientPath);
const evidence = read(evidencePath);

const desktopDiagnosticBody = functionBody(bridge, 'diagnoseDesktopChatFolderBindingParity');
const chromeDiagnosticBody = functionBody(bridge, 'diagnoseChromeChatFolderBindingParity');
const fallbackHelperBody = functionBody(bridge, 'softDeleteFolderForBindingFallback');
const dispatchBody = functionBody(bridge, 'dispatchOp');
const exportProjectionBody = functionBody(exportBundle, 'buildDesktopCanonicalChatFolderBindingProjection');
const importNormalizeBody = functionBody(chromeImport, 'normalizeDesktopCanonicalChatFolderBindingSnapshot');
const softDeleteBody = functionBody(folderStore, 'softDeleteEmptyFolder');

[
  "'softDeleteFolderForBindingFallback'",
  'softDeleteFolderForBindingFallback: true',
  'B6 DESKTOP BINDING FALLBACK',
  'confirmation-phrase-required',
  'expected-bound-folder-required',
].forEach((needle) => assertContains(bridge, needle, `B6 bridge registration ${needle}`));

assertContains(dispatchBody, "op === 'softDeleteFolderForBindingFallback'", 'B6 dispatch registration');
assertContains(desktopClient, "'softDeleteFolderForBindingFallback'", 'B6 Desktop queue mutation allowlist');
assertContains(desktopClient, 'B6 DESKTOP BINDING FALLBACK', 'B6 Desktop queue usage');
assertNotContains(chromeClient, "'softDeleteFolderForBindingFallback'", 'B6 Chrome CDP mutation allowlist');
assertNotContains(chromeClient, 'B6 DESKTOP BINDING FALLBACK', 'B6 Chrome CDP usage');

[
  'store.softDeleteEmptyFolder',
  'diagnoseDesktopChatFolderBindingParity',
  'countChatsSnapshots',
  'expectedBindingCountMin',
  'folder-soft-delete-failed',
  'deleted-folder-active-binding-still-visible',
  'chat-count-changed',
  'snapshot-count-changed',
  'active-deleted-binding-exported-as-active',
  'bindingRecoverySnapshotCount',
  'activeDeletedFolderBindingExportedAsActive',
  'deletedFolderBindingsExcludedFromActiveProjection',
  'fallbackUnfiledBindingCount',
  'noChromeDestructiveBindingApply: true',
  'noHardDelete: true',
  'noPurge: true',
  'noChatDelete: true',
  'noSnapshotDelete: true',
  'noAssetDelete: true',
].forEach((needle) => assertContains(fallbackHelperBody, needle, `B6 fallback helper ${needle}`));

[
  'readFolderBindingsForRemoveSafely',
  'buildFolderBindingTombstone',
  'writeFolderRemoveTombstonesSafely',
  'unbindSnapshotBindingsForSoftDelete',
  'restoreBindingsFromRecoverySnapshot',
  'noChatDelete: true',
  'noHardDelete: true',
].forEach((needle) => assertContains(folderStore, needle, `B6 store support ${needle}`));

[
  'readFolderBindingsForRemoveSafely(id)',
  'buildFolderRecoverySnapshot',
  'unbindSnapshotBindingsForSoftDelete',
  "deleteReason: cleanString(options.deleteReason) || (bindingCount > 0 ? 'desktop-local-folder-with-chats-soft-delete'",
  'bindingUnboundCount',
  'bindingSnapshotCount',
  'noChatDelete: true',
  'noHardDelete: true',
].forEach((needle) => assertContains(softDeleteBody, needle, `B6 soft delete binding fallback ${needle}`));

[
  'fallbackUnfiledBindingCount',
  'activeDanglingFolderBindingCount',
  'activeDeletedFolderBindingExportedAsActive: false',
  'deletedFolderBindingsExcludedFromActiveProjection: true',
  'signals.activeDeletedFolderIds[folderId]',
  'folderBindingCounts[folderId] = 0',
].forEach((needle) => assertContains(desktopDiagnosticBody, needle, `B6 Desktop diagnostic ${needle}`));

[
  'tombstones.list({ recordKind: \'folder\', activeOnly: true',
  'activeDeletedFolderIds',
  'fallbackUnfiledBindingCount',
  'activeDanglingFolderBindingCount',
  'activeDeletedFolderBindingExportedAsActive: false',
  'deletedFolderBindingsExcludedFromActiveProjection: true',
  'folderBindingCounts[folderId] = 0',
  'return;',
].forEach((needle) => assertContains(exportProjectionBody, needle, `B6 export projection ${needle}`));

[
  'fallbackUnfiledBindingCount: numberOrZero(input.fallbackUnfiledBindingCount)',
  'activeDanglingFolderBindingCount: numberOrZero(input.activeDanglingFolderBindingCount)',
  'activeDeletedFolderBindingExportedAsActive: input.activeDeletedFolderBindingExportedAsActive === true',
  'deletedFolderBindingsExcludedFromActiveProjection: input.deletedFolderBindingsExcludedFromActiveProjection !== false',
].forEach((needle) => assertContains(importNormalizeBody, needle, `B6 Chrome import ${needle}`));

[
  'fallbackUnfiledBindingCount',
  'activeDanglingFolderBindingCount',
  'activeDeletedFolderBindingExportedAsActive',
  'deletedFolderBindingsExcludedFromActiveProjection',
].forEach((needle) => assertContains(chromeDiagnosticBody, needle, `B6 Chrome diagnostic ${needle}`));

[
  'deleteChat',
  'deleteSnapshot',
  'purgeRecentlyDeletedFolders',
  'clearRecentlyDeletedRestoredHistory',
  'rawSql',
  'hardDelete',
].forEach((needle) => assertNotContains(fallbackHelperBody + chromeDiagnosticBody, needle, `B6 forbidden helper/Chrome diagnostic ${needle}`));

[
  'B6',
  'folder delete binding fallback',
  'softDeleteFolderForBindingFallback',
  'B6 DESKTOP BINDING FALLBACK',
  'fallbackUnfiledBindingCount',
  'deletedFolderBindingsExcludedFromActiveProjection',
  'activeDeletedFolderBindingExportedAsActive:false',
  'no Chrome destructive binding authority',
  'no chat deletion',
  'no snapshot deletion',
  'no asset deletion',
  'no hard delete',
  'no purge',
  'B7',
].forEach((needle) => assertContains(evidence, needle, `B6 evidence ${needle}`));

console.log(JSON.stringify({
  ok: true,
  validator: 'validate-chat-folder-binding-phase-b6-delete-fallback',
  bridge: path.relative(root, bridgePath),
  folderStore: path.relative(root, folderStorePath),
  exportBundle: path.relative(root, exportBundlePath),
  chromeImport: path.relative(root, chromeImportPath),
  desktopClient: path.relative(root, desktopClientPath),
  chromeClient: path.relative(root, chromeClientPath),
  evidence: path.relative(root, evidencePath),
  desktopOnlySoftDeleteFallbackHelper: true,
  chromeDestructiveBindingAuthority: false,
  noChatDelete: true,
  noSnapshotDelete: true,
  noAssetDelete: true,
  noHardDelete: true,
  noPurge: true
}, null, 2));
