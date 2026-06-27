#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const exporterPath = path.join(root, 'src-surfaces-base/studio/ingestion/export-bundle.tauri.js');
const importerPath = path.join(root, 'src-surfaces-base/studio/sync/folder-import.mv3.js');
const bridgePath = path.join(root, 'src-surfaces-base/studio/dev/folder-sync-rc-smoke-bridge.studio.js');
const evidencePath = path.join(root, 'release-evidence/2026-06-25/chat-folder-binding-phase-b2-desktop-export.md');

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

for (const file of [exporterPath, importerPath, bridgePath, evidencePath]) {
  assert(fs.existsSync(file), `${path.relative(root, file)} missing`);
}

const exporter = read(exporterPath);
const importer = read(importerPath);
const bridge = read(bridgePath);
const evidence = read(evidencePath);

const exportProjectionBody = functionBody(exporter, 'buildDesktopCanonicalChatFolderBindingProjection');
const exportFullBody = functionBody(exporter, 'exportFullBundle');
const exportLatestBody = functionBody(exporter, 'exportLatestSyncBundle');
const normalizeSnapshotBody = functionBody(importer, 'normalizeDesktopCanonicalChatFolderBindingSnapshot');
const buildSnapshotBody = functionBody(importer, 'buildDesktopCanonicalChatFolderBindingSnapshot');
const storeSnapshotBody = functionBody(importer, 'storeDesktopCanonicalChatFolderBindingSnapshot');
const propagationBody = functionBody(importer, 'importDesktopBundlePayload');
const desktopDiagnosticBody = functionBody(bridge, 'diagnoseDesktopChatFolderBindingParity');
const chromeDiagnosticBody = functionBody(bridge, 'diagnoseChromeChatFolderBindingParity');

[
  'DESKTOP_CANONICAL_CHAT_FOLDER_BINDING_SCHEMA',
  'h2o.studio.chat-folder-bindings.desktop-canonical.v1',
  'buildDesktopCanonicalChatFolderBindingProjection',
  'desktopCanonicalChatFolderBindings',
  'chatFolderBindings',
  'desktopCanonicalChatFolderBindingCount',
  'chatFolderBindingExport',
].forEach((needle) => assertContains(exporter, needle, `B2 Desktop exporter ${needle}`));

[
  'api.listChats(folderId)',
  'listFromStore(api)',
  'projectFolder',
  'folderBindingCounts',
  'unfiledCount',
  'missingFolderBindingCount',
  'deletedFolderBindingCount',
  'restoredFolderBindingCount',
  'readOnlyProjection: true',
  'desktopAuthority: true',
  'chromeAuthority: false',
  'noChromeDestructiveBindingApply: true',
  'noChatDelete: true',
  'noSnapshotDelete: true',
  'noHardDelete: true',
  'noPurge: true',
].forEach((needle) => assertContains(exportProjectionBody, needle, `B2 projection ${needle}`));

[
  'folderState.desktopCanonicalChatFolderBindings = desktopCanonicalChatFolderBindings',
  'desktopCanonicalChatFolderBindings: desktopCanonicalChatFolderBindings',
  'chatFolderBindings: asArray(desktopCanonicalChatFolderBindings.bindings)',
  'chatFolderBindings: desktopCanonicalChatFolderBindings.diagnostics',
].forEach((needle) => assertContains(exportFullBody, needle, `B2 bundle ${needle}`));

[
  'chatFolderBindingExport',
  'bindingCount',
  'folderBindingCounts',
  'unfiledCount',
  'missingFolderBindingCount',
  'deletedFolderBindingCount',
  'restoredFolderBindingCount',
  'blockers',
  'warnings',
  'readOnlyProjection: true',
].forEach((needle) => assertContains(exportLatestBody, needle, `B2 export result ${needle}`));

[
  'desktopCanonicalChatFolderBindings',
  'normalizeDesktopCanonicalChatFolderBindingSnapshot',
  'buildDesktopCanonicalChatFolderBindingSnapshot',
  'storeDesktopCanonicalChatFolderBindingSnapshot',
].forEach((needle) => assertContains(importer, needle, `B2 Chrome read-only snapshot ${needle}`));

[
  'bindings',
  'folderBindingCounts',
  'readOnlyProjection: true',
  'desktopAuthority: true',
  'chromeAuthority: false',
  'noChromeDestructiveBindingApply: true',
].forEach((needle) => assertContains(normalizeSnapshotBody, needle, `B2 normalize snapshot ${needle}`));

assertContains(buildSnapshotBody, 'bundle.desktopCanonicalChatFolderBindings', 'B2 build snapshot top-level payload');
assertContains(buildSnapshotBody, 'bundle.chatFolderBindings', 'B2 build snapshot row alias');
assertContains(storeSnapshotBody, 'readKv(FOLDER_STATE_KEY_LOCAL)', 'B2 snapshot store read-only cache read');
assertContains(storeSnapshotBody, 'writeKv(FOLDER_STATE_KEY_LOCAL, next)', 'B2 snapshot store read-only cache write');
assertContains(storeSnapshotBody, 'noChromeDestructiveBindingApply: true', 'B2 snapshot store safety flag');
assertContains(propagationBody, 'desktopCanonicalChatFolderBindingImport', 'B2 propagation import result');
assertContains(propagationBody, 'desktop-canonical-chat-folder-bindings', 'B2 propagation changed-field marker');

[
  'desktopCanonicalBindingProjectionAvailable',
  'desktopCanonicalBindingProjectionSchema',
].forEach((needle) => assertContains(desktopDiagnosticBody, needle, `B2 Desktop diagnostic ${needle}`));

[
  'desktop-canonical-chat-folder-bindings',
  'chromeCanonicalBindingProjectionAvailable',
  'chromeCanonicalBindingCount',
  'chrome-binding-import-deferred',
  'desktop-canonical-binding-projection-not-imported',
].forEach((needle) => assertContains(chromeDiagnosticBody, needle, `B2 Chrome diagnostic ${needle}`));

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
  assertNotContains(exportProjectionBody, needle, `B2 Desktop projection mutation ${needle}`);
  assertNotContains(normalizeSnapshotBody + buildSnapshotBody + storeSnapshotBody, needle, `B2 Chrome snapshot mutation ${needle}`);
});

[
  'B2',
  'desktopCanonicalChatFolderBindings',
  'chatFolderBindingExport',
  'read-only',
  'no chat deletion',
  'no snapshot deletion',
  'no hard delete',
  'no purge',
  'no Chrome destructive binding apply',
  'B3',
].forEach((needle) => assertContains(evidence, needle, `B2 evidence ${needle}`));

console.log(JSON.stringify({
  ok: true,
  validator: 'validate-chat-folder-binding-phase-b2-desktop-export',
  exporter: path.relative(root, exporterPath),
  importer: path.relative(root, importerPath),
  bridge: path.relative(root, bridgePath),
  evidence: path.relative(root, evidencePath),
  desktopProjectionExported: true,
  chromeSnapshotReadOnly: true,
  chromeDestructiveBindingAuthority: false,
  noChatDelete: true,
  noSnapshotDelete: true,
  noHardDelete: true,
  noPurge: true,
}, null, 2));
