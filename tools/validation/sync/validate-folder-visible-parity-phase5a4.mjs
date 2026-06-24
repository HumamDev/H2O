#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const folderParityPath = path.join(root, 'src-surfaces-base/studio/S0F1b. 🎬 Library Workspace - Studio.js');
const chromeImportPath = path.join(root, 'src-surfaces-base/studio/sync/folder-import.mv3.js');
const evidencePath = path.join(root, 'release-evidence/2026-06-24/folder-visible-parity-phase5a4-desktop-visible-adoption.md');

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

for (const file of [folderParityPath, chromeImportPath, evidencePath]) {
  assert(fs.existsSync(file), `${path.relative(root, file)} missing`);
}

const folderParity = read(folderParityPath);
const chromeImport = read(chromeImportPath);
const evidence = read(evidencePath);

const normalizeStateBody = functionBody(folderParity, 'normalizeFolderStateForParity');
[
  'desktopVisibleFolderSet: normalizeDesktopVisibleSetForDisplay(src.desktopVisibleFolderSet)',
  'hiddenByDesktopVisibleSetIds',
].forEach((needle) => assertContains(normalizeStateBody, needle, `desktop visible set normalization ${needle}`));

const normalizeDesktopVisibleSetBody = functionBody(folderParity, 'normalizeDesktopVisibleSetForDisplay');
[
  'h2o.studio.folder-visible-set.desktop.v1',
  'desktopVisibleSetImported: true',
  'desktopDerivedDisplay: true',
  'visibleStateOnlyAdoption: true',
  'trustedFolderDisplay: true',
  'shownInNormalMode: true',
  'sourceKind: \'desktop-visible-set-display-adoption\'',
  'noTombstoneApply: true',
  'noTombstoneCreate: true',
  'noHardDelete: true',
  'noPurge: true',
  'noChatDelete: true',
  'noSnapshotDelete: true',
].forEach((needle) => assertContains(normalizeDesktopVisibleSetBody, needle, `desktop visible set display row ${needle}`));

const adoptionBody = functionBody(folderParity, 'buildDesktopVisibleSetAdoptionRows');
[
  'existingIds.has(id)',
  'hiddenIds.has(id)',
  'isHiddenFolderDisplayRow(row, hiddenIds)',
  'desktop-visible-set-display-adoption',
  'materializedUserFolder: true',
  'trustedFolderDisplay: true',
  'shownInNormalMode: true',
  'isCanonical: true',
].forEach((needle) => assertContains(adoptionBody, needle, `desktop visible adoption ${needle}`));

const hideOverlayBody = functionBody(chromeImport, 'applyDesktopVisibleSetHideOverlay');
[
  'desktopVisibleFolderSet: snapshot',
  'desktopVisibleSetStored = true',
  'changed || snapshotChanged',
].forEach((needle) => assertContains(hideOverlayBody, needle, `folder-state visible set persistence ${needle}`));

[
  'desktopVisibleSetAdoptionRows',
  'buildDesktopVisibleSetAdoptionRows(',
  '...desktopVisibleSetAdoptionRows',
  'importedDesktopVisibleDisplayRows',
  'importedDesktopVisibleRowsFromDisplay',
  'importedDesktopVisibleRowsFromReport',
  'folderDisplayRows.filter((row) => {',
  'desktopVisibleSetStored',
  'desktopVisibleSetImportedAt',
  'importedDesktopVisibleFolderCount',
  'importedDesktopVisibleFolders',
].forEach((needle) => assertContains(folderParity, needle, `folder parity display diagnostics ${needle}`));

[
  'importedDesktopVisibleFolderCount',
  'importedDesktopVisibleFolders',
  'desktopOnlyVisibleFolderCount',
  'chromeVisibleFolderCount',
  'noTombstoneApplyOnChrome: true',
  'noTombstoneCreateOnChrome: true',
  'noHardDelete: true',
  'noPurge: true',
  'noChatDelete: true',
  'noSnapshotDelete: true',
].forEach((needle) => assertContains(chromeImport, needle, `chrome parity diagnostic ${needle}`));

for (const forbidden of [
  'delete nextItems',
  'deleteFolder',
  'purgeFolder',
  'hardDeleteFolder',
  'applyTombstonePropagation',
  'deleteSnapshot',
  'requestFolderDelete',
  'applyFolderDeleteRequest',
]) {
  assertNotContains(normalizeDesktopVisibleSetBody, forbidden, 'desktop visible set normalizer');
  assertNotContains(adoptionBody, forbidden, 'desktop visible set adoption');
}

[
  'Phase 5A.4',
  'display/adoption only',
  'desktop-visible-set-display-adoption',
  'importedDesktopVisibleFolderCount',
  'No tombstone create/apply',
  'No storage deletion',
  'noTombstoneApplyOnChrome:true',
  'noTombstoneCreateOnChrome:true',
  'noHardDelete:true',
  'noPurge:true',
  'noChatDelete:true',
  'noSnapshotDelete:true',
].forEach((needle) => assertContains(evidence, needle, `evidence ${needle}`));

console.log(JSON.stringify({
  ok: true,
  validator: 'validate-folder-visible-parity-phase5a4',
  displayAdoption: 'desktop visible set rows are adopted for Chrome display only',
  storageDeletion: false,
  destructiveMutation: false,
}, null, 2));
