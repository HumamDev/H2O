#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const bridgePath = path.join(root, 'src-surfaces-base/studio/dev/folder-sync-rc-smoke-bridge.studio.js');
const importerPath = path.join(root, 'src-surfaces-base/studio/sync/folder-import.mv3.js');
const evidencePath = path.join(root, 'release-evidence/2026-06-25/chat-folder-binding-phase-b3-chrome-import-parity.md');

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

for (const file of [bridgePath, importerPath, evidencePath]) {
  assert(fs.existsSync(file), `${path.relative(root, file)} missing`);
}

const bridge = read(bridgePath);
const importer = read(importerPath);
const evidence = read(evidencePath);

const chromeDiagnosticBody = functionBody(bridge, 'diagnoseChromeChatFolderBindingParity');
const compareRowsBody = functionBody(bridge, 'compareBindingRows');
const mismatchBody = functionBody(bridge, 'countFolderBindingMismatches');
const normalizeSnapshotBody = functionBody(importer, 'normalizeDesktopCanonicalChatFolderBindingSnapshot');
const storeSnapshotBody = functionBody(importer, 'storeDesktopCanonicalChatFolderBindingSnapshot');
const importBundleBody = functionBody(importer, 'importDesktopBundlePayload');
const syncNowBody = functionBody(importer, 'syncNow');

const localBindingRowsDeclaration = chromeDiagnosticBody.indexOf('var localBindingRows = []');
const localBindingRowsPush = chromeDiagnosticBody.indexOf('localBindingRows.push');
assert(localBindingRowsDeclaration >= 0, 'B3 Chrome diagnostic must declare localBindingRows');
assert(localBindingRowsPush >= 0, 'B3 Chrome diagnostic must populate localBindingRows');
assert(
  localBindingRowsDeclaration < localBindingRowsPush,
  'B3 Chrome diagnostic must declare localBindingRows before use'
);

[
  'compareBindingRows',
  'countFolderBindingMismatches',
  'bindingCompareKey',
  'bindingDiagnosticRow',
  'missingInChromeCount',
  'extraInChromeCount',
  'folderCountMismatchCount',
  'parityComparable',
  'parityOk',
].forEach((needle) => assertContains(bridge, needle, `B3 bridge ${needle}`));

[
  'importedDesktopCanonicalBindingCount',
  'importedDesktopCanonicalFolderBindingCounts',
  'importedDesktopCanonicalUnfiledCount',
  'localBindingCount',
  'chromeBindingCount',
  'localFolderBindingCounts',
  'chromeFolderBindingCounts',
  'comparableBindingCount',
  'missingInChromeCount',
  'extraInChromeCount',
  'folderCountMismatchCount',
  'comparisonMode',
  'parityComparable: parityComparable',
  'parityOk: parityOk',
  'chrome-binding-import-deferred',
  'desktop-canonical-binding-projection-not-imported',
].forEach((needle) => assertContains(chromeDiagnosticBody, needle, `B3 Chrome diagnostic ${needle}`));

[
  'missingInChrome',
  'extraInChrome',
  'missingInChromeCount',
  'extraInChromeCount',
  'desktopInvalidBindingCount',
  'chromeInvalidBindingCount',
  'chat-folder-map',
  'folder-counts-only',
].forEach((needle) => assertContains(compareRowsBody, needle, `B3 compare rows ${needle}`));

[
  'folderId',
  'desktopCount',
  'chromeCount',
  'delta',
].forEach((needle) => assertContains(mismatchBody, needle, `B3 folder-count mismatch ${needle}`));

[
  'desktopCanonicalChatFolderBindings',
  'bindingCount',
  'folderBindingCounts',
  'readOnlyProjection: true',
  'noChromeDestructiveBindingApply: true',
  'noChatDelete: true',
  'noSnapshotDelete: true',
  'noHardDelete: true',
  'noPurge: true',
].forEach((needle) => assertContains(normalizeSnapshotBody + storeSnapshotBody, needle, `B3 read-only import snapshot ${needle}`));

assertContains(importBundleBody, 'desktopCanonicalChatFolderBindingImport', 'B3 Desktop-to-Chrome import result');
assertContains(importBundleBody, 'importedDesktopCanonicalBindingCount', 'B3 Desktop-to-Chrome imported count');
assertContains(syncNowBody, 'importedDesktopCanonicalBindingCount', 'B3 syncNow imported count');

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
  assertNotContains(chromeDiagnosticBody + compareRowsBody + mismatchBody, needle, `B3 diagnostic mutation ${needle}`);
  assertNotContains(normalizeSnapshotBody + storeSnapshotBody, needle, `B3 import mutation ${needle}`);
});

[
  'B3',
  'desktopCanonicalChatFolderBindings',
  'importedDesktopCanonicalBindingCount',
  'parityComparable',
  'parityOk',
  'missingInChromeCount',
  'extraInChromeCount',
  'folderCountMismatchCount',
  'read-only',
  'no chat deletion',
  'no snapshot deletion',
  'no hard delete',
  'no purge',
  'no Chrome destructive binding apply',
  'B4',
].forEach((needle) => assertContains(evidence, needle, `B3 evidence ${needle}`));

console.log(JSON.stringify({
  ok: true,
  validator: 'validate-chat-folder-binding-phase-b3-chrome-import-parity',
  bridge: path.relative(root, bridgePath),
  importer: path.relative(root, importerPath),
  evidence: path.relative(root, evidencePath),
  chromeProjectionImport: true,
  diagnosticParityComparableWhenProjectionExists: true,
  diagnosticMismatchDetails: true,
  chromeDestructiveBindingAuthority: false,
  noChatDelete: true,
  noSnapshotDelete: true,
  noHardDelete: true,
  noPurge: true,
}, null, 2));
