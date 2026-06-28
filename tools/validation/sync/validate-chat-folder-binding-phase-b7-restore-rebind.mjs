#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const bridgePath = path.join(root, 'src-surfaces-base/studio/dev/folder-sync-rc-smoke-bridge.studio.js');
const folderStorePath = path.join(root, 'src-surfaces-base/studio/store/folders.tauri.js');
const desktopClientPath = path.join(root, 'tools/smoke/desktop-folder-sync-queue-client.mjs');
const chromeClientPath = path.join(root, 'tools/smoke/chrome-cdp-studio.mjs');
const evidencePath = path.join(root, 'release-evidence/2026-06-25/chat-folder-binding-phase-b7-restore-rebind.md');

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

for (const file of [bridgePath, folderStorePath, desktopClientPath, chromeClientPath, evidencePath]) {
  assert(fs.existsSync(file), `${path.relative(root, file)} missing`);
}

const bridge = read(bridgePath);
const folderStore = read(folderStorePath);
const desktopClient = read(desktopClientPath);
const chromeClient = read(chromeClientPath);
const evidence = read(evidencePath);

const helperBody = functionBody(bridge, 'restoreFolderForBindingRebind');
const dispatchBody = functionBody(bridge, 'dispatchOp');
const storeRestoreBody = functionBody(folderStore, 'restoreTombstonedFolder');
const storeRebindBody = functionBody(folderStore, 'restoreBindingsFromRecoverySnapshot');

[
  "'restoreFolderForBindingRebind'",
  'restoreFolderForBindingRebind: true',
  'B7 DESKTOP BINDING REBIND',
  'confirmation-phrase-required',
  'folder-or-tombstone-id-required',
  'folder-restore-failed',
  'restored-folder-binding-count-not-rebound',
  'binding-restore-count-below-expected',
].forEach((needle) => assertContains(bridge, needle, `B7 bridge ${needle}`));

assertContains(dispatchBody, "op === 'restoreFolderForBindingRebind'", 'B7 dispatch registration');

[
  'store.restoreTombstonedFolder || store.restoreFolder',
  'diagnoseDesktopChatFolderBindingParity',
  'countChatsSnapshots',
  'bindingRestoreAttemptedCount',
  'bindingRestoredCount',
  'bindingSkippedCount',
  'restoreWarnings',
  'binding-restore-skipped-count-nonzero',
  'chat-count-changed',
  'snapshot-count-changed',
  'folder-restored-binding-rebind-proven',
  'noChromeDestructiveBindingApply: true',
  'noHardDelete: true',
  'noPurge: true',
  'noChatDelete: true',
  'noSnapshotDelete: true',
  'noAssetDelete: true',
].forEach((needle) => assertContains(helperBody, needle, `B7 helper ${needle}`));

[
  'restoreBindingsFromRecoverySnapshot',
  'bindingRestoreAttemptedCount',
  'bindingRestoredCount',
  'bindingSkippedCount',
  'restoreWarnings',
].forEach((needle) => assertContains(storeRestoreBody, needle, `B7 store restore ${needle}`));

[
  'recoverySnapshotBindings',
  'getChatForBindingRestore',
  'listForChat(chatId)',
  'phase4b-folder-restore-rebind',
  'allowTombstonedFolderRebind: true',
  'noChatDelete: true',
  'restore-binding-skipped-chat-missing',
  'restore-binding-skipped-rebound',
  'restore-binding-skipped-bind-failed',
].forEach((needle) => assertContains(storeRebindBody, needle, `B7 recovery rebind ${needle}`));

[
  'deleteChat',
  'deleteSnapshot',
  'purgeRecentlyDeletedFolders',
  'clearRecentlyDeletedRestoredHistory',
  'rawSql',
  'hardDelete',
].forEach((needle) => assertNotContains(helperBody, needle, `B7 helper forbidden ${needle}`));

assertContains(desktopClient, "'restoreFolderForBindingRebind'", 'B7 Desktop queue mutation allowlist');
assertContains(desktopClient, 'B7 DESKTOP BINDING REBIND', 'B7 Desktop queue usage');
assertNotContains(chromeClient, "'restoreFolderForBindingRebind'", 'B7 Chrome CDP mutation allowlist');
assertNotContains(chromeClient, 'B7 DESKTOP BINDING REBIND', 'B7 Chrome CDP usage');

[
  'B7',
  'restore-rebind',
  'Tech',
  'f_3bf15f43b835d19dbac0fb13',
  'restoreFolderForBindingRebind',
  'B7 DESKTOP BINDING REBIND',
  'bindingRestoredCount',
  'Tech active binding count',
  'no Chrome destructive binding authority',
  'no chat deletion',
  'no snapshot deletion',
  'no asset deletion',
  'no hard delete',
  'no purge',
  'B8',
].forEach((needle) => assertContains(evidence, needle, `B7 evidence ${needle}`));

console.log(JSON.stringify({
  ok: true,
  validator: 'validate-chat-folder-binding-phase-b7-restore-rebind',
  bridge: path.relative(root, bridgePath),
  folderStore: path.relative(root, folderStorePath),
  desktopClient: path.relative(root, desktopClientPath),
  chromeClient: path.relative(root, chromeClientPath),
  evidence: path.relative(root, evidencePath),
  desktopOnlyRestoreRebindHelper: true,
  chromeDestructiveBindingAuthority: false,
  noChatDelete: true,
  noSnapshotDelete: true,
  noAssetDelete: true,
  noHardDelete: true,
  noPurge: true
}, null, 2));
