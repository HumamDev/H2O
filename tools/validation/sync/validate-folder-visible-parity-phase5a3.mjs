#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const folderParityPath = path.join(root, 'src-surfaces-base/studio/S0F1b. 🎬 Library Workspace - Studio.js');
const chromeImportPath = path.join(root, 'src-surfaces-base/studio/sync/folder-import.mv3.js');
const evidencePath = path.join(root, 'release-evidence/2026-06-24/folder-visible-parity-phase5a3-display-filter.md');

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

const hiddenDisplayBody = functionBody(folderParity, 'isHiddenFolderDisplayRow');
[
  'folderMetaOf(row)',
  'row?.hidden === true',
  'meta.hidden === true',
  'row?.hiddenByDesktopVisibleSet === true',
  'meta.hiddenByDesktopVisibleSet === true',
  'row?.desktopVisibleSetMissing === true',
  'meta.desktopVisibleSetMissing === true',
  'row?.hiddenByDesktopReceipt === true',
  'meta.hiddenByDesktopReceipt === true',
  'row?.deletedByDesktopReceipt === true',
  'meta.deletedByDesktopReceipt === true',
  'hiddenFolderIds instanceof Set',
  'hiddenFolderIds.has(id)',
].forEach((needle) => assertContains(hiddenDisplayBody, needle, `hidden display predicate ${needle}`));

const normalizeStateBody = functionBody(folderParity, 'normalizeFolderStateForParity');
[
  'hiddenByDesktopVisibleSetIds = new Set()',
  'src.hiddenByDesktopVisibleSet',
  'hiddenByDesktopVisibleSetIds.add(id)',
  'return { folders, items, hiddenByDesktopVisibleSet, hiddenByDesktopVisibleSetIds }',
].forEach((needle) => assertContains(normalizeStateBody, needle, `stored hidden marker normalization ${needle}`));

const normalizeBody = functionBody(folderParity, 'normalizeFolderRow');
[
  'out.hidden = true',
  'out.hiddenByDesktopVisibleSet = true',
  'out.desktopVisibleSetMissing = true',
  'out.hiddenByDesktopReceipt = true',
  'out.deletedByDesktopReceipt = true',
].forEach((needle) => assertContains(normalizeBody, needle, `normalize hidden marker ${needle}`));

const materializedBody = functionBody(folderParity, 'isMaterializedUserFolder');
assertContains(materializedBody, 'if (isHiddenFolderDisplayRow(row)) return false;', 'materialized folder hidden exclusion');

const canonicalBody = functionBody(folderParity, 'isCanonicalDisplayFolder');
assertContains(canonicalBody, 'if (isHiddenFolderDisplayRow(row)) return false;', 'canonical folder hidden exclusion');

const displayFilterBody = functionBody(folderParity, 'filterFolderStateForNormalDisplay');
assertContains(displayFilterBody, 'isHiddenFolderDisplayRow(folder, hiddenFolderIds)', 'stored display hidden exclusion');
assertContains(displayFilterBody, 'src.hiddenByDesktopVisibleSetIds instanceof Set', 'stored display marker bag exclusion');

[
  'canonicalRows.filter((folder) => !isHiddenFolderDisplayRow(folder, hiddenFolderIds) && isCanonicalDisplayFolder(folder))',
  'hiddenDisplayFolderIds',
  '!hiddenFolderIds.has(id)',
  'isMaterializedUserFolder(folder)',
].forEach((needle) => assertContains(folderParity, needle, `display row eligibility ${needle}`));

[
  'hiddenByDesktopVisibleSetCount',
  'chromeVisibleFolderCount',
  'chromeOnlyVisibleFolders',
  'candidateStaleFolderCount',
  'noTombstoneApplyOnChrome: true',
  'noTombstoneCreateOnChrome: true',
  'noHardDelete: true',
  'noPurge: true',
  'noChatDelete: true',
  'noSnapshotDelete: true',
].forEach((needle) => assertContains(chromeImport, needle, `visible parity diagnostic ${needle}`));

for (const forbidden of [
  'delete nextItems',
  'deleteFolder',
  'purgeFolder',
  'hardDeleteFolder',
  'applyTombstonePropagation',
  'deleteSnapshot',
]) {
  assertNotContains(hiddenDisplayBody, forbidden, 'hidden display predicate');
  assertNotContains(displayFilterBody, forbidden, 'display filter');
  assertNotContains(materializedBody, forbidden, 'materialized folder predicate');
  assertNotContains(canonicalBody, forbidden, 'canonical folder predicate');
}

[
  'Phase 5A.3',
  'display/filtering only',
  'hiddenByDesktopVisibleSet',
  'hiddenByDesktopReceipt',
  'No storage deletion',
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
  validator: 'validate-folder-visible-parity-phase5a3',
  displayFilter: 'hidden desktop visible set rows excluded',
  storageMutation: false,
  destructiveMutation: false,
}, null, 2));
