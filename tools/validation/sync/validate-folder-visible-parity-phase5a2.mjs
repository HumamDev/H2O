#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const chromeImportPath = path.join(root, 'src-surfaces-base/studio/sync/folder-import.mv3.js');
const folderParityPath = path.join(root, 'src-surfaces-base/studio/S0F1b. 🎬 Library Workspace - Studio.js');
const evidencePath = path.join(root, 'release-evidence/2026-06-24/folder-visible-parity-phase5a2-visible-hide.md');

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

for (const file of [chromeImportPath, folderParityPath, evidencePath]) {
  assert(fs.existsSync(file), `${path.relative(root, file)} missing`);
}

const chromeImport = read(chromeImportPath);
const folderParity = read(folderParityPath);
const evidence = read(evidencePath);

[
  'applyDesktopVisibleSetHideOverlay',
  'makeDesktopVisibleSetHideResult',
  'mergeDesktopVisibleSetHideSummary',
  'hiddenByDesktopVisibleSet',
  'desktopVisibleSetMissing',
  'isPendingChromeCreatedForVisibleParity',
  'desktopVisibleSetHide: alreadyDesktopVisibleSetHide',
  'desktopVisibleSetHide: desktopVisibleSetHide',
].forEach((needle) => assertContains(chromeImport, needle, `Chrome visible-set hide support ${needle}`));

const hideBody = functionBody(chromeImport, 'applyDesktopVisibleSetHideOverlay');
[
  'normalizeDesktopVisibleFolderSetSnapshot(snapshotInput)',
  'readKv(FOLDER_STATE_KEY_LOCAL)',
  'writeKv(FOLDER_STATE_KEY_LOCAL, next)',
  'hidden: true',
  'hiddenByDesktopVisibleSet: true',
  'desktopVisibleSetMissing: true',
  'hiddenByDesktopVisibleSetAt',
  'visibleStateOnlyHide: true',
  'noTombstoneApply: true',
  'noTombstoneCreate: true',
  'noHardDelete: true',
  'noPurge: true',
  'noChatDelete: true',
  'noSnapshotDelete: true',
  'isProtectedFolderForVisibleParity(row)',
  'isPendingChromeCreatedForVisibleParity(row, snapshot)',
  'reShownByDesktopVisibleSetAt',
].forEach((needle) => assertContains(hideBody, needle, `hide overlay ${needle}`));

for (const forbidden of [
  'delete nextItems',
  'deleteFolder',
  'purgeFolder',
  'hardDeleteFolder',
  'applyTombstonePropagation',
  'deleteSnapshot',
]) {
  assertNotContains(hideBody, forbidden, 'hide overlay');
}

const resultBody = functionBody(chromeImport, 'makeDesktopVisibleSetHideResult');
[
  "schema: 'h2o.studio.folder-visible-set.desktop-hide.v1'",
  "phase: 'phase5a.2'",
  'hiddenByDesktopVisibleSetCount: 0',
  'hiddenByDesktopVisibleSetRows: []',
  'visibleStateOnlyHide: true',
  'noTombstoneApplyOnChrome: true',
  'noTombstoneCreateOnChrome: true',
  'noHardDelete: true',
  'noPurge: true',
  'noChatDelete: true',
  'noSnapshotDelete: true',
].forEach((needle) => assertContains(resultBody, needle, `hide result ${needle}`));

const diagnosticBody = functionBody(chromeImport, 'diagnoseVisibleFolderParity');
[
  'hiddenByDesktopVisibleSetBag',
  'hiddenByDesktopVisibleSetRows',
  'hiddenByDesktopVisibleSetCount: hiddenByDesktopVisibleSetRows.length',
  'desktopVisibleSetStored: !!storedSnapshot',
  'chromeOnlyVisibleFolders',
  'desktopOnlyVisibleFolders',
  'candidateStaleFolderCount',
  'pendingChromeCreatedCount',
].forEach((needle) => assertContains(diagnosticBody, needle, `diagnostic surfacing ${needle}`));

const displayFilterBody = functionBody(folderParity, 'filterFolderStateForNormalDisplay');
[
  'isHiddenFolderDisplayRow(folder, hiddenFolderIds)',
].forEach((needle) => assertContains(displayFilterBody, needle, `display filter ${needle}`));

const hiddenDisplayBody = functionBody(folderParity, 'isHiddenFolderDisplayRow');
[
  'row?.hidden === true',
  'meta.hidden === true',
  'row?.hiddenByDesktopVisibleSet === true',
  'meta.hiddenByDesktopVisibleSet === true',
].forEach((needle) => assertContains(hiddenDisplayBody, needle, `shared display hidden predicate ${needle}`));

[
  'Phase 5A.2',
  'visible-state-only hide overlay',
  'hiddenByDesktopVisibleSetCount',
  'hiddenByDesktopVisibleSetRows',
  'No real delete',
  'No tombstone create/apply',
  'noTombstoneApplyOnChrome:true',
  'noTombstoneCreateOnChrome:true',
  'noHardDelete:true',
  'noPurge:true',
  'noChatDelete:true',
  'noSnapshotDelete:true',
].forEach((needle) => assertContains(evidence, needle, `evidence ${needle}`));

console.log(JSON.stringify({
  ok: true,
  validator: 'validate-folder-visible-parity-phase5a2',
  overlay: 'hiddenByDesktopVisibleSet',
  visibleStateOnly: true,
  destructiveMutation: false,
}, null, 2));
