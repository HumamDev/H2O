#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const bridgePath = path.join(root, 'src-surfaces-base/studio/dev/folder-sync-rc-smoke-bridge.studio.js');
const desktopClientPath = path.join(root, 'tools/smoke/desktop-folder-sync-queue-client.mjs');
const chromeClientPath = path.join(root, 'tools/smoke/chrome-cdp-studio.mjs');
const evidencePath = path.join(root, 'release-evidence/2026-06-25/chat-folder-binding-phase-b1-diagnostics.md');

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

const desktopBody = functionBody(bridge, 'diagnoseDesktopChatFolderBindingParity');
const chromeBody = functionBody(bridge, 'diagnoseChromeChatFolderBindingParity');
const dispatchBody = functionBody(bridge, 'dispatchOp');
const publicBody = functionBody(bridge, 'diagnoseChatFolderBindingParity');
const combinedDiagnosticBodies = [desktopBody, chromeBody, publicBody].join('\n');

[
  "'diagnoseChatFolderBindingParity'",
  'diagnoseDesktopChatFolderBindingParity',
  'diagnoseChromeChatFolderBindingParity',
  'chat-folder-binding-parity-diagnosed',
  'chat-folder-binding-diagnostic-unavailable',
  'parityComparable: false',
  'parityOk: null',
  'noChatDelete: true',
  'noSnapshotDelete: true',
  'noHardDelete: true',
  'noPurge: true',
  'noChromeDestructiveBindingApply: true',
].forEach((needle) => assertContains(bridge, needle, `B1 smoke bridge ${needle}`));

assertContains(dispatchBody, "op === 'diagnoseChatFolderBindingParity'", 'B1 dispatch registration');
assertContains(publicBody, "surface.kind === 'desktop-studio'", 'B1 Desktop surface branch');
assertContains(publicBody, "surface.kind === 'chrome-studio'", 'B1 Chrome surface branch');

[
  'store.listChats',
  'readFolderRowsForBindingDiagnostic',
  'countKnownChatsForBindingDiagnostic',
  'readRecentlyDeletedBindingSignals',
  'chrome-binding-mirror-missing-for-parity',
  'desktop-orphan-binding-scan-unavailable',
  'bindingRecoverySnapshotCount',
].forEach((needle) => assertContains(desktopBody, needle, `B1 Desktop diagnostic ${needle}`));

[
  'chromeStorageGet(FOLDER_STATE_DATA_KEY)',
  'readLocalFolderStateMirror',
  'mergeFolderStateMirrors',
  'chrome-canonical-binding-projection-missing',
  'chat-folder-binding-transport-deferred',
  'chromeCanonicalBindingProjectionAvailable',
].forEach((needle) => assertContains(chromeBody, needle, `B1 Chrome diagnostic ${needle}`));

[
  'diagnoseChatFolderBindingParity',
  'Read-only ops work without extra flags',
].forEach((needle) => {
  assertContains(desktopClient, needle, `B1 Desktop queue client ${needle}`);
  assertContains(chromeClient, needle, `B1 Chrome CDP client ${needle}`);
});

[
  'bindChat(',
  'unbindChat(',
  'purgeRecentlyDeletedFolders',
  'clearRecentlyDeletedRestoredHistory',
  'restoreTombstonedFolder',
  'createTombstone',
  'markRestored',
  'deleteChat',
  'deleteSnapshot',
  'DELETE FROM',
  'INSERT INTO folder_bindings',
  'INSERT OR REPLACE INTO folder_bindings',
].forEach((needle) => assertNotContains(combinedDiagnosticBodies, needle, `B1 forbidden mutation ${needle}`));

[
  'B1',
  'diagnoseChatFolderBindingParity',
  'PARTIAL',
  'parityComparable:false',
  'no chat deletion',
  'no snapshot deletion',
  'no hard delete',
  'no purge',
  'no Chrome destructive binding apply',
  'B2',
].forEach((needle) => assertContains(evidence, needle, `B1 evidence ${needle}`));

console.log(JSON.stringify({
  ok: true,
  validator: 'validate-chat-folder-binding-phase-b1-diagnostics',
  bridge: path.relative(root, bridgePath),
  desktopClient: path.relative(root, desktopClientPath),
  chromeClient: path.relative(root, chromeClientPath),
  evidence: path.relative(root, evidencePath),
  readOnlyDiagnostic: true,
  chromeDestructiveBindingAuthority: false,
  parityComparableMayBeFalse: true,
  noChatDelete: true,
  noSnapshotDelete: true,
  noHardDelete: true,
  noPurge: true,
}, null, 2));
