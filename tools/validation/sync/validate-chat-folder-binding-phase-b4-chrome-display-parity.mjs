#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const workspacePath = path.join(root, 'src-surfaces-base/studio/S0F1b. 🎬 Library Workspace - Studio.js');
const bridgePath = path.join(root, 'src-surfaces-base/studio/dev/folder-sync-rc-smoke-bridge.studio.js');
const evidencePath = path.join(root, 'release-evidence/2026-06-25/chat-folder-binding-phase-b4-chrome-display-parity.md');

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

for (const file of [workspacePath, bridgePath, evidencePath]) {
  assert(fs.existsSync(file), `${path.relative(root, file)} missing`);
}

const workspace = read(workspacePath);
const bridge = read(bridgePath);
const evidence = read(evidencePath);

const normalizeDisplayBody = functionBody(workspace, 'normalizeDesktopCanonicalChatFolderBindingsForDisplay');
const mergeProjectionBody = functionBody(workspace, 'mergeDesktopCanonicalBindingProjectionForDisplay');
const normalizeStateBody = functionBody(workspace, 'normalizeFolderStateForParity');
const diagnoseBody = functionBody(workspace, 'diagnoseFolderParity');
const summarizeFolderModelBody = functionBody(bridge, 'summarizeFolderModel');
const chromeDiagnosticBody = functionBody(bridge, 'diagnoseChromeChatFolderBindingParity');

[
  'normalizeDesktopCanonicalChatFolderBindingsForDisplay',
  'SYNC_FOLDER_IMPORT_STATE_KEY',
  'mergeDesktopCanonicalBindingProjectionForDisplay',
  'h2o.studio.chat-folder-bindings.desktop-canonical.v1',
  'desktopCanonicalChatFolderBindings',
  'readOnlyProjection: true',
  'noChromeDestructiveBindingApply: true',
  'noChatDelete: true',
  'noSnapshotDelete: true',
  'noHardDelete: true',
  'noPurge: true',
  'noAssetDelete: true',
].forEach((needle) => assertContains(workspace, needle, `B4 workspace ${needle}`));

[
  'items[folderId].push(chatId)',
  'folderBindingCounts[folderId]',
  'bindings: rows',
  'authority: \'desktop\'',
  'chromeAuthority: false',
].forEach((needle) => assertContains(normalizeDisplayBody, needle, `B4 display normalizer ${needle}`));

assertContains(normalizeStateBody, 'desktopCanonicalChatFolderBindings: normalizeDesktopCanonicalChatFolderBindingsForDisplay', 'B4 normalized folder state projection');

[
  'sync-folder-import-state',
  'readOnlyProjection: true',
  'noChromeDestructiveBindingApply: true',
  'noChatDelete: true',
  'noSnapshotDelete: true',
  'noHardDelete: true',
  'noPurge: true',
].forEach((needle) => assertContains(mergeProjectionBody, needle, `B4 sync import fallback ${needle}`));

[
  'SYNC_FOLDER_IMPORT_STATE_KEY',
  'mergeDesktopCanonicalBindingProjectionForDisplay',
  'desktopCanonicalBindingDisplayAvailable',
  'desktopCanonicalBindingDisplay.items',
  'chatFolderBindingDisplayProjectionAvailable',
  'chatFolderBindingDisplayBindingCount',
  'chatFolderBindingDisplayFolderBindingCounts',
  'chatFolderBindingDisplayRows',
  'chatFolderBindingDisplayItems',
  'chatFolderBindingDisplayUnfiledCount',
].forEach((needle) => assertContains(diagnoseBody, needle, `B4 diagnose display projection ${needle}`));

[
  'chatFolderBindingDisplayProjectionAvailable',
  'chatFolderBindingDisplayBindingCount',
  'chatFolderBindingDisplayFolderBindingCounts',
  'chatFolderBindingDisplayRows',
  'chatFolderBindingDisplayItems',
  'noChromeDestructiveBindingApply',
].forEach((needle) => assertContains(workspace, needle, `B4 getDisplayModel projection ${needle}`));

[
  'chatFolderBindingDisplayProjectionAvailable',
  'chatFolderBindingDisplayBindingCount',
  'chatFolderBindingDisplayFolderBindingCounts',
  'chatFolderBindingDisplayRows',
  'chatFolderBindingDisplayItems',
  'noChromeDestructiveBindingApply',
].forEach((needle) => assertContains(summarizeFolderModelBody, needle, `B4 bridge folder model summary ${needle}`));

[
  'chatFolderBindingDisplayProjectionAvailable',
  'displayProjectionAvailable',
  'displayBindingRows',
  'displayFolderBindingCounts',
  'chromeReadBindingRows',
  'chromeReadFolderBindingCounts',
  'chromeDisplayBindingCount',
  'chromeReadDisplayProjectionAvailable',
  'missingInChromeCount',
  'folderCountMismatchCount',
  'parityOk',
].forEach((needle) => assertContains(chromeDiagnosticBody, needle, `B4 Chrome diagnostic ${needle}`));

[
  'bindChat(',
  'unbindChat(',
  'INSERT INTO folder_bindings',
  'INSERT OR REPLACE INTO folder_bindings',
  'DELETE FROM folder_bindings',
  'deleteChat',
  'deleteSnapshot',
  'purgeRecentlyDeletedFolders',
  'clearRecentlyDeletedRestoredHistory',
].forEach((needle) => {
  assertNotContains(normalizeDisplayBody + diagnoseBody + chromeDiagnosticBody, needle, `B4 read/display path mutation ${needle}`);
});

[
  'B4',
  'PASS',
  'Chrome display/read-model',
  'imported Desktop canonical',
  'chatFolderBindingDisplayProjectionAvailable',
  'parityOk:true',
  'missingInChromeCount:0',
  'extraInChromeCount:0',
  'folderCountMismatchCount:0',
  'read-only',
  'no chat deletion',
  'no snapshot deletion',
  'no hard delete',
  'no purge',
  'no Chrome destructive binding apply',
  'B5',
].forEach((needle) => assertContains(evidence, needle, `B4 evidence ${needle}`));

console.log(JSON.stringify({
  ok: true,
  validator: 'validate-chat-folder-binding-phase-b4-chrome-display-parity',
  workspace: path.relative(root, workspacePath),
  bridge: path.relative(root, bridgePath),
  evidence: path.relative(root, evidencePath),
  displayProjectionReadOnly: true,
  diagnosticCanUseDisplayProjection: true,
  chromeDestructiveBindingAuthority: false,
  noChatDelete: true,
  noSnapshotDelete: true,
  noHardDelete: true,
  noPurge: true,
}, null, 2));
