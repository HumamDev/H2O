#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const chromeImportPath = path.join(root, 'src-surfaces-base/studio/sync/folder-import.mv3.js');
const evidencePath = path.join(root, 'release-evidence/2026-06-24/folder-visible-parity-phase5a1-desktop-visible-set.md');

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

for (const file of [chromeImportPath, evidencePath]) {
  assert(fs.existsSync(file), `${path.relative(root, file)} missing`);
}

const chromeImport = read(chromeImportPath);
const evidence = read(evidencePath);

[
  'desktopVisibleFolderSet: null',
  'state.desktopVisibleFolderSet = normalizeDesktopVisibleFolderSetSnapshot(saved.desktopVisibleFolderSet)',
  'desktopVisibleFolderSet: state.desktopVisibleFolderSet',
  'importDesktopVisibleFolderSetSnapshot(bundle',
  'desktopVisibleFolderSet: desktopVisibleFolderSet',
  'desktopVisibleFolderSet: alreadyDesktopVisibleFolderSet',
].forEach((needle) => assertContains(chromeImport, needle, `desktop visible set persistence ${needle}`));

const normalizeBody = functionBody(chromeImport, 'normalizeDesktopVisibleFolderSetSnapshot');
[
  "schema: 'h2o.studio.folder-visible-set.desktop.v1'",
  "source: cleanString(input.source || 'desktop-latest-visible-set')",
  "status: cleanString(input.status || 'imported')",
  'desktopVisibleFolderIds: ids',
  'desktopVisibleFolderCount: ids.length',
  'rows: safeRows',
  'noTombstoneApplyOnChrome: true',
  'noTombstoneCreateOnChrome: true',
  'noHardDelete: true',
  'noPurge: true',
  'noChatDelete: true',
  'noSnapshotDelete: true',
].forEach((needle) => assertContains(normalizeBody, needle, `visible set snapshot ${needle}`));

const buildBody = functionBody(chromeImport, 'buildDesktopVisibleFolderSetSnapshot');
[
  'folderMetadataRowsFromBundle(bundle)',
  'visibleParityRowMap(rowsInfo.rows)',
  "source: 'desktop-latest-visible-set'",
  "status: 'imported'",
  'sourceExportedAt: cleanString(bundle && bundle.exportedAt)',
  'sourceKind: rowsInfo.sourceKind',
].forEach((needle) => assertContains(buildBody, needle, `build visible set snapshot ${needle}`));

const importBody = functionBody(chromeImport, 'importDesktopVisibleFolderSetSnapshot');
[
  'buildDesktopVisibleFolderSetSnapshot(bundle, importedAt)',
  'state.desktopVisibleFolderSet = snapshot',
  'return snapshot',
].forEach((needle) => assertContains(importBody, needle, `import visible set snapshot ${needle}`));

const diagnosticBody = functionBody(chromeImport, 'diagnoseVisibleFolderParity');
[
  'var latestSnapshot = buildDesktopVisibleFolderSetSnapshot(bundle, \'\')',
  'var storedSnapshot = normalizeDesktopVisibleFolderSetSnapshot(state.desktopVisibleFolderSet)',
  'var desktopSnapshot = storedSnapshot || latestSnapshot',
  'desktopVisibleSetStored: !!storedSnapshot',
  'desktopVisibleSetImportedAt',
  'desktopVisibleSetSourceExportedAt',
  'desktopVisibleFolderIds',
  'hiddenByDesktopVisibleSetCount',
  'noTombstoneApplyOnChrome: true',
  'noTombstoneCreateOnChrome: true',
].forEach((needle) => assertContains(diagnosticBody, needle, `visible parity diagnostic stored set ${needle}`));

for (const forbidden of [
  'hideByDesktopVisibleSet',
  'hiddenByDesktopVisibleSet: true',
  'deleteFolder',
  'purgeFolder',
  'hardDeleteFolder',
  'applyTombstonePropagation',
]) {
  assertNotContains(buildBody, forbidden, 'build visible set snapshot');
  assertNotContains(importBody, forbidden, 'import visible set snapshot');
}

[
  'Phase 5A.1',
  'desktopVisibleFolderSet',
  'desktopVisibleFolderIds[]',
  'desktopVisibleFolderCount',
  'No hide/prune behavior',
  'hiddenByDesktopVisibleSetCount:0',
  'noTombstoneApplyOnChrome:true',
  'noTombstoneCreateOnChrome:true',
].forEach((needle) => assertContains(evidence, needle, `evidence ${needle}`));

console.log(JSON.stringify({
  ok: true,
  validator: 'validate-folder-visible-parity-phase5a1',
  persistedSnapshot: 'desktopVisibleFolderSet',
  readOnlyImportMetadata: true,
  behaviorChange: false,
}, null, 2));
