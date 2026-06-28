#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const bridgePath = path.join(root, 'src-surfaces-base/studio/dev/folder-sync-rc-smoke-bridge.studio.js');
const desktopClientPath = path.join(root, 'tools/smoke/desktop-folder-sync-queue-client.mjs');
const chromeClientPath = path.join(root, 'tools/smoke/chrome-cdp-studio.mjs');
const evidencePath = path.join(root, 'release-evidence/2026-06-25/chat-folder-binding-phase-b5-desktop-origin-convergence.md');

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

for (const file of [bridgePath, desktopClientPath, chromeClientPath, evidencePath]) {
  assert(fs.existsSync(file), `${path.relative(root, file)} missing`);
}

const bridge = read(bridgePath);
const desktopClient = read(desktopClientPath);
const chromeClient = read(chromeClientPath);
const evidence = read(evidencePath);

const helperBody = functionBody(bridge, 'moveChatFolderBinding');
const dispatchBody = functionBody(bridge, 'dispatchOp');

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

console.log(JSON.stringify({
  ok: true,
  validator: 'validate-chat-folder-binding-phase-b5-desktop-origin-convergence',
  bridge: path.relative(root, bridgePath),
  desktopClient: path.relative(root, desktopClientPath),
  chromeClient: path.relative(root, chromeClientPath),
  evidence: path.relative(root, evidencePath),
  desktopOnlyMutationHelper: true,
  chromeDestructiveBindingAuthority: false,
  noChatDelete: true,
  noSnapshotDelete: true,
  noHardDelete: true,
  noPurge: true,
}, null, 2));
