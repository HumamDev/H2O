#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const exporterPath = path.join(root, 'src-surfaces-base/studio/ingestion/export-bundle.tauri.js');
const importerPath = path.join(root, 'src-surfaces-base/studio/sync/folder-import.mv3.js');
const sidebarPath = path.join(root, 'src-surfaces-base/studio/S0Z1g. 🎬 Library Sidebar Sections - Studio.js');
const evidencePath = path.join(root, 'release-evidence/2026-06-25/folder-delete-phase6b6-purge-resurrection-parity.md');

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

for (const file of [exporterPath, importerPath, sidebarPath, evidencePath]) {
  assert(fs.existsSync(file), `${path.relative(root, file)} missing`);
}

const exporter = read(exporterPath);
const importer = read(importerPath);
const sidebar = read(sidebarPath);
const evidence = read(evidencePath);

const suppressionExportBody = functionBody(exporter, 'buildDesktopPurgedFolderSuppressionPayloadSafely');
const suppressionImportBody = functionBody(importer, 'storeDesktopPurgedFolderSuppressionSnapshot');
const importPropagationBody = functionBody(importer, 'importDesktopBundlePayload');
const companionRowsBody = functionBody(sidebar, 'chromeRecentlyDeletedCompanionRows');
const diagnoseBody = functionBody(sidebar, 'diagnoseChromeRecentlyDeletedCompanion');
const sidebarEntryBody = functionBody(sidebar, 'renderRecentlyDeletedFoldersSidebarEntry');

[
  'DESKTOP_PURGED_FOLDER_SUPPRESSION_SCHEMA',
  'desktopPurgedFolderSuppressions: asArray(desktopPurgedFolderSuppression.rows)',
  'desktopPurgedFolderSuppression: desktopPurgedFolderSuppression',
  'desktopPurgedFolderSuppressionCount',
  'desktopPurgedFolderSuppression: desktopPurgedFolderSuppression.diagnostics',
].forEach((needle) => assertContains(exporter, needle, `6B.6 Desktop export ${needle}`));

[
  'includePermanentlyPurged: true',
  'phase6aPermanentlyPurged',
  "source: 'desktop-purged-folder-suppression'",
  'noChromePurgeAuthority: true',
  'noChromeTombstoneApply: true',
  'noAssetDelete: true',
].forEach((needle) => assertContains(suppressionExportBody, needle, `6B.6 suppression export ${needle}`));

[
  'desktopPurgedFolderSuppression: null',
  'normalizeDesktopPurgedFolderSuppressionSnapshot(saved.desktopPurgedFolderSuppression)',
  'desktopPurgedFolderSuppression: state.desktopPurgedFolderSuppression',
].forEach((needle) => assertContains(importer, needle, `6B.6 Chrome import state ${needle}`));

[
  'buildDesktopPurgedFolderSuppressionSnapshot(bundleInput',
  'storeDesktopPurgedFolderSuppressionSnapshot(desktopPurgedFolderSuppression)',
  'desktop-purged-folder-suppression',
  'desktopPurgedFolderSuppressionImport',
].forEach((needle) => assertContains(importPropagationBody, needle, `6B.6 import propagation ${needle}`));

[
  'delete desktopReceipt[folderId]',
  'delete pendingDelete[folderId]',
  'next.folders = rows.filter',
  'delete nextItems[folderId]',
  'next.desktopPurgedFolderSuppression = snapshot',
  'normalizeDesktopCanonicalRecentlyDeletedSnapshot',
  'noChromeTombstoneApply: true',
  'noAssetDelete: true',
].forEach((needle) => assertContains(suppressionImportBody, needle, `6B.6 import cleanup ${needle}`));

[
  'alreadyDesktopPurgedFolderSuppression',
  'alreadyDesktopPurgedFolderSuppressionImport',
  'desktop-purged-folder-suppression',
].forEach((needle) => assertContains(importer, needle, `6B.6 already-imported reload path ${needle}`));

[
  'chromeDesktopPurgedFolderSuppressionSnapshotFromState',
  'chromeDesktopPurgedFolderSuppressedIdSet',
  'filterRowsNotSuppressedByDesktopPurge',
  'desktopPurgedFolderSuppressionSource',
].forEach((needle) => assertContains(sidebar, needle, `6B.6 Chrome suppression helpers ${needle}`));

[
  'const suppressedIds = chromeDesktopPurgedFolderSuppressedIdSet(state)',
  'if (desktopCanonical) return desktopCanonical.rows',
  'filterRowsNotSuppressedByDesktopPurge(chromePendingDeleteHiddenRowsFromState(state)',
  'filterRowsNotSuppressedByDesktopPurge(chromeDesktopReceiptHiddenRowsFromState(state)',
].forEach((needle) => assertContains(companionRowsBody, needle, `6B.6 companion suppression ${needle}`));

[
  'desktopPurgedFolderSuppressionCount',
  'purgedSuppressedFolderIds',
  'resurrectedAfterPurgeCount',
  'stalePendingDeleteRowCount',
  'extraChromeRows',
  'missingChromeRows',
  'desktopChromeRecentlyDeletedParityOk',
  'chromeSidebarRecentlyDeletedEntryPresent',
  'chromeSidebarRecentlyDeletedEntryRemoved',
  'purged-folder-resurrected-in-chrome-companion',
].forEach((needle) => assertContains(diagnoseBody, needle, `6B.6 diagnostics ${needle}`));

assertContains(sidebarEntryBody, "studioPlatformAdapter() === 'mv3'", '6B.6 Chrome sidebar entry guard');

[
  'purgeRecentlyDeletedFolders',
  'clearRecentlyDeletedRestoredHistory',
  'restoreTombstonedFolder',
  'deleteChat(',
  'deleteSnapshot(',
  'DELETE FROM',
].forEach((needle) => assertNotContains(importer + companionRowsBody + diagnoseBody, needle, `6B.6 forbidden Chrome destructive behavior ${needle}`));

[
  'Phase 6B.6',
  'Desktop purge suppression',
  'Chrome reload',
  'Recently Deleted sidebar row',
  'resurrectedAfterPurgeCount',
  'no Chrome purge authority',
].forEach((needle) => assertContains(evidence, needle, `6B.6 evidence ${needle}`));

console.log(JSON.stringify({
  ok: true,
  validator: 'validate-folder-delete-phase6b6-purge-resurrection-parity',
  exporter: path.relative(root, exporterPath),
  importer: path.relative(root, importerPath),
  companion: path.relative(root, sidebarPath),
  evidence: path.relative(root, evidencePath),
  desktopAuthority: true,
  chromeAuthority: 'read-only-companion',
  noChromePurgeAuthority: true,
}, null, 2));
