#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const bridgePath = path.join(root, 'src-surfaces-base/studio/dev/folder-sync-rc-smoke-bridge.studio.js');
const folderStorePath = path.join(root, 'src-surfaces-base/studio/store/folders.tauri.js');
const desktopClientPath = path.join(root, 'tools/smoke/desktop-folder-sync-queue-client.mjs');
const chromeClientPath = path.join(root, 'tools/smoke/chrome-cdp-studio.mjs');
const evidencePath = path.join(root, 'release-evidence/2026-06-25/chat-folder-binding-phase-b5-desktop-origin-convergence.md');
const evidenceB5aPath = path.join(root, 'release-evidence/2026-06-25/chat-folder-binding-phase-b5a-canonical-move-persistence.md');

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

for (const file of [bridgePath, folderStorePath, desktopClientPath, chromeClientPath, evidencePath, evidenceB5aPath]) {
  assert(fs.existsSync(file), `${path.relative(root, file)} missing`);
}

const bridge = read(bridgePath);
const folderStore = read(folderStorePath);
const desktopClient = read(desktopClientPath);
const chromeClient = read(chromeClientPath);
const evidence = read(evidencePath);
const evidenceB5a = read(evidenceB5aPath);

const helperBody = functionBody(bridge, 'moveChatFolderBinding');
const dispatchBody = functionBody(bridge, 'dispatchOp');
const delegationGateBody = functionBody(folderStore, 'f15FolderBindingDelegationEnabled');

[
  "'moveChatFolderBinding'",
  'moveChatFolderBinding: true',
  'B5 DESKTOP BINDING CONVERGENCE',
  'confirmation-phrase-required',
  'expected-current-folder-id-required',
  'expected-current-folder-mismatch',
  'folder-binding-move-failed',
].forEach((needle) => assertContains(bridge, needle, `B5 bridge ${needle}`));

assertContains(dispatchBody, "op === 'moveChatFolderBinding'", 'B5 dispatch registration');

[
  'store.bindChat',
  'store.listForChat',
  'store.get',
  'diagnoseDesktopChatFolderBindingParity',
  'forceCanonicalFolderBindingStoreWrite: true',
  'forceLegacyFolderBindingWrite: true',
  "bindingStoreWritePath: 'canonical-folder-bindings-sqlite'",
  'canonical-folder-binding-diagnostic-mismatch',
  'expectedTargetFolderBindingCount',
  'actualTargetFolderBindingCount',
  'expectedCurrentFolderBindingCount',
  'actualCurrentFolderBindingCount',
  'beforeFolderBindingCounts',
  'afterFolderBindingCounts',
  'desktopOnly: true',
  'chromeAuthority: false',
  'noChromeDestructiveBindingApply: true',
  'noChatDelete: true',
  'noSnapshotDelete: true',
  'noHardDelete: true',
  'noPurge: true',
  'noAssetDelete: true',
].forEach((needle) => assertContains(helperBody, needle, `B5 helper ${needle}`));

[
  'forceCanonicalFolderBindingStoreWrite === true',
  'forceLegacyFolderBindingWrite === true',
  'return false',
].forEach((needle) => assertContains(delegationGateBody, needle, `B5 canonical store override ${needle}`));

[
  'deleteChat',
  'deleteSnapshot',
  'purgeRecentlyDeletedFolders',
  'clearRecentlyDeletedRestoredHistory',
  'DELETE FROM',
  'rawSql',
  'createTombstone',
  'markRestored',
].forEach((needle) => assertNotContains(helperBody, needle, `B5 helper forbidden ${needle}`));

assertContains(desktopClient, "'moveChatFolderBinding'", 'B5 Desktop queue mutation allowlist');
assertContains(desktopClient, 'B5 DESKTOP BINDING CONVERGENCE', 'B5 Desktop queue usage');
assertNotContains(chromeClient, "'moveChatFolderBinding'", 'B5 Chrome CDP mutation allowlist');
assertNotContains(chromeClient, 'B5 DESKTOP BINDING CONVERGENCE', 'B5 Chrome CDP usage');

[
  'B5',
  'Desktop-origin',
  'moveChatFolderBinding',
  'B5 DESKTOP BINDING CONVERGENCE',
  'parityOk:true',
  'missingInChromeCount:0',
  'extraInChromeCount:0',
  'folderCountMismatchCount:0',
  'no Chrome destructive binding apply',
  'no chat deletion',
  'no snapshot deletion',
  'no hard delete',
  'no purge',
  'B6',
].forEach((needle) => assertContains(evidence, needle, `B5 evidence ${needle}`));

[
  'B5a',
  'canonical Desktop SQLite `folder_bindings` store',
  'forceCanonicalFolderBindingStoreWrite:true',
  'forceLegacyFolderBindingWrite:true',
  'canonical-folder-binding-diagnostic-mismatch',
  'bindingStoreWritePath:"canonical-folder-bindings-sqlite"',
  'Code `0`',
  'English `1`',
  'Code `1`',
  'English `0`',
  'no Chrome destructive binding apply',
  'no chat deletion',
  'no snapshot deletion',
  'no hard delete',
  'no purge',
].forEach((needle) => assertContains(evidenceB5a, needle, `B5a evidence ${needle}`));

console.log(JSON.stringify({
  ok: true,
  validator: 'validate-chat-folder-binding-phase-b5-desktop-origin-convergence',
  bridge: path.relative(root, bridgePath),
  folderStore: path.relative(root, folderStorePath),
  desktopClient: path.relative(root, desktopClientPath),
  chromeClient: path.relative(root, chromeClientPath),
  evidence: path.relative(root, evidencePath),
  evidenceB5a: path.relative(root, evidenceB5aPath),
  desktopOnlyMutationHelper: true,
  chromeDestructiveBindingAuthority: false,
  noChatDelete: true,
  noSnapshotDelete: true,
  noHardDelete: true,
  noPurge: true,
}, null, 2));
