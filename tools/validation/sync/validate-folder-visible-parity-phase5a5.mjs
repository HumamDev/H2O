#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const folderParityPath = path.join(root, 'src-surfaces-base/studio/S0F1b. 🎬 Library Workspace - Studio.js');
const exportBundlePath = path.join(root, 'src-surfaces-base/studio/ingestion/export-bundle.tauri.js');
const smokeBridgePath = path.join(root, 'src-surfaces-base/studio/dev/folder-sync-rc-smoke-bridge.studio.js');
const chromeHelperPath = path.join(root, 'tools/smoke/chrome-cdp-studio.mjs');
const desktopClientPath = path.join(root, 'tools/smoke/desktop-folder-sync-queue-client.mjs');
const evidencePath = path.join(root, 'release-evidence/2026-06-24/folder-visible-parity-phase5a5-canonical-visible-set.md');

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
  const start = source.indexOf(`function ${name}`);
  assert(start >= 0, `${name} missing`);
  const brace = source.indexOf('{', start);
  assert(brace >= 0, `${name} body missing`);
  let depth = 0;
  for (let i = brace; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(brace, i + 1);
    }
  }
  throw new Error(`${name} body parse failed`);
}

[
  folderParityPath,
  exportBundlePath,
  smokeBridgePath,
  chromeHelperPath,
  desktopClientPath,
  evidencePath,
].forEach((file) => assert(fs.existsSync(file), `${path.relative(root, file)} missing`));

const folderParity = read(folderParityPath);
const exportBundle = read(exportBundlePath);
const smokeBridge = read(smokeBridgePath);
const chromeHelper = read(chromeHelperPath);
const desktopClient = read(desktopClientPath);
const evidence = read(evidencePath);

const desktopStoreBody = functionBody(folderParity, 'buildDesktopStoreVisibleFolderState');
[
  'desktop-store-visible',
  'desktopAuthoritativeVisible: true',
  'isUnfiledSystemFolder(row)',
  'isHiddenFolderDisplayRow(row, hiddenIds)',
].forEach((needle) => assertContains(desktopStoreBody, needle, `Desktop store visible source ${needle}`));
assertContains(folderParity, 'H2O.Studio.store.folders.list', 'Desktop store visible diagnostic source label');

[
  'desktopStoreVisibleAuthoritative',
  'desktopStoreVisibleState',
  '? desktopStoreVisibleState',
  '? []',
  'Desktop canonical visible folders are using the live Desktop store',
  'canonicalSource',
  'desktop-store-visible',
].forEach((needle) => assertContains(folderParity, needle, `FolderParity desktop precedence ${needle}`));

[
  'canonical-visible-folder-set-diagnosed',
  'desktopStoreVisibleCount',
  'desktopUiDisplayCount',
  'desktopLatestVisibleCount',
  'chromeDisplayCount',
  'chromeStoredDesktopVisibleSetCount',
  'desktopUiOnly',
  'desktopExportOnly',
  'chromeOnly',
  'latestOnly',
  'duplicateNamesDifferentIds',
  'hiddenButExported',
  'visibleButNotExported',
  'noTombstoneApplyOnChrome: true',
  'noTombstoneCreateOnChrome: true',
  'noHardDelete: true',
  'noPurge: true',
  'noChatDelete: true',
  'noSnapshotDelete: true',
].forEach((needle) => assertContains(folderParity, needle, `canonical visible diagnostic ${needle}`));

const mergeBody = functionBody(exportBundle, 'mergeFolderStates');
[
  'skippedFallbackVisibleFolderCount',
  'fallbackVisibleAuthority: false',
  'addedFolderCount: 0',
  'addItems(fallback.items, primaryFolderIds)',
  'if (allowedFolderIds instanceof Set && !allowedFolderIds.has(folderId)) return;',
].forEach((needle) => assertContains(mergeBody, needle, `latest export fallback policy ${needle}`));
assertNotContains(mergeBody, 'byId[id] = mergeFolderRows(null, folder);', 'latest export fallback policy');
assertNotContains(mergeBody, 'order.push(id);\\n        addedFolderCount += 1;', 'latest export fallback policy');

[
  'diagnoseCanonicalVisibleFolderSet',
  'noTombstoneApplyOnChrome: true',
  'noTombstoneCreateOnChrome: true',
  'noHardDelete: true',
  'noPurge: true',
  'noChatDelete: true',
  'noSnapshotDelete: true',
].forEach((needle) => assertContains(smokeBridge, needle, `smoke bridge ${needle}`));

[
  'diagnoseCanonicalVisibleFolderSet',
  'Read-only ops work without extra flags',
].forEach((needle) => {
  assertContains(chromeHelper, needle, `Chrome helper ${needle}`);
  assertContains(desktopClient, needle, `Desktop queue client ${needle}`);
});

for (const forbidden of [
  'hardDeleteFolder',
  'purgeFolder',
  'applyTombstonePropagation',
  'deleteSnapshot',
  'deleteChat',
]) {
  assertNotContains(desktopStoreBody, forbidden, 'Desktop store visible source');
}

[
  'Phase 5A.5',
  'Desktop UI was under-showing',
  'Desktop store visible rows are authoritative',
  'fallback cache metadata fill only',
  'diagnoseCanonicalVisibleFolderSet',
  'No Chrome delete/restore authority',
  'No tombstone create/apply',
  'noHardDelete:true',
  'noPurge:true',
  'noChatDelete:true',
  'noSnapshotDelete:true',
].forEach((needle) => assertContains(evidence, needle, `evidence ${needle}`));

console.log(JSON.stringify({
  ok: true,
  validator: 'validate-folder-visible-parity-phase5a5',
  desktopVisibleAuthority: 'H2O.Studio.store.folders.list',
  fallbackVisibleAuthority: false,
  destructiveMutation: false,
}, null, 2));
