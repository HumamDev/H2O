#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const exportPath = path.join(root, 'src-surfaces-base/studio/ingestion/export-bundle.tauri.js');
const importPath = path.join(root, 'src-surfaces-base/studio/sync/folder-import.mv3.js');
const sidebarPath = path.join(root, 'src-surfaces-base/studio/S0Z1g. 🎬 Library Sidebar Sections - Studio.js');
const evidencePath = path.join(root, 'release-evidence/2026-06-25/folder-delete-phase6b5-recently-deleted-parity.md');

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

for (const file of [exportPath, importPath, sidebarPath, evidencePath]) {
  assert(fs.existsSync(file), `${path.relative(root, file)} missing`);
}

const exporter = read(exportPath);
const importer = read(importPath);
const sidebar = read(sidebarPath);
const evidence = read(evidencePath);

const rowProjectionBody = functionBody(exporter, 'canonicalRecentlyDeletedRowFromTombstone');
const payloadBody = functionBody(exporter, 'buildDesktopCanonicalRecentlyDeletedPayloadFromTombstones');
const exportFullBundleBody = functionBody(exporter, 'exportFullBundle');
const normalizeSnapshotBody = functionBody(importer, 'normalizeDesktopCanonicalRecentlyDeletedSnapshot');
const buildSnapshotBody = functionBody(importer, 'buildDesktopCanonicalRecentlyDeletedSnapshot');
const storeSnapshotBody = functionBody(importer, 'storeDesktopCanonicalRecentlyDeletedSnapshot');
const importPropagationBody = functionBody(importer, 'importDesktopBundlePayload');
const canonicalRowsBody = functionBody(sidebar, 'chromeDesktopCanonicalRecentlyDeletedSnapshotFromState');
const companionRowsBody = functionBody(sidebar, 'chromeRecentlyDeletedCompanionRows');
const diagnoseBody = functionBody(sidebar, 'diagnoseChromeRecentlyDeletedCompanion');
const renderBody = functionBody(sidebar, 'renderChromeRecentlyDeletedCompanionPanel');

[
  "cleanString(tombstone.recordKind) !== 'folder'",
  'if (cleanString(tombstone.restoredAt)) return null',
  "source: 'desktop-canonical-recently-deleted'",
  "status: 'deleted'",
  'restoreEligible: true',
  'purgeEligible: true',
  'noChromeTombstoneApply: true',
  'noAssetDelete: true',
].forEach((needle) => assertContains(rowProjectionBody, needle, `6B.5 Desktop canonical row ${needle}`));

[
  'DESKTOP_CANONICAL_RECENTLY_DELETED_SCHEMA',
  'activeDeletedCount: rows.length',
  'restoredExcluded',
  'desktopAuthority: true',
  'chromeAuthority: false',
].forEach((needle) => assertContains(payloadBody, needle, `6B.5 Desktop canonical payload ${needle}`));

[
  'desktopCanonicalRecentlyDeletedFolders: asArray(desktopCanonicalRecentlyDeleted.rows)',
  'desktopCanonicalRecentlyDeleted: desktopCanonicalRecentlyDeleted',
  'desktopCanonicalRecentlyDeletedCount',
  'desktopCanonicalRecentlyDeleted: desktopCanonicalRecentlyDeleted.diagnostics',
].forEach((needle) => assertContains(exportFullBundleBody, needle, `6B.5 latest.json export ${needle}`));

[
  'desktopCanonicalRecentlyDeleted: null',
  'state.desktopCanonicalRecentlyDeleted',
  'normalizeDesktopCanonicalRecentlyDeletedSnapshot(saved.desktopCanonicalRecentlyDeleted)',
].forEach((needle) => assertContains(importer, needle, `6B.5 Chrome import state ${needle}`));

[
  'desktopCanonicalRecentlyDeletedFolderIds',
  'desktopCanonicalRecentlyDeletedCount',
  'desktopCanonicalRecentlyDeleted: true',
  'noChromePurgeAuthority: true',
  'noChromeTombstoneApply: true',
].forEach((needle) => assertContains(normalizeSnapshotBody, needle, `6B.5 Chrome canonical snapshot ${needle}`));

[
  'bundle.desktopCanonicalRecentlyDeleted',
  'bundle.desktopCanonicalRecentlyDeletedFolders',
  "source: 'desktop-canonical-recently-deleted'",
].forEach((needle) => assertContains(buildSnapshotBody, needle, `6B.5 Chrome canonical bundle reader ${needle}`));

[
  'current.desktopCanonicalRecentlyDeleted',
  'next.desktopCanonicalRecentlyDeleted = snapshot',
  'desktopCanonicalRecentlyDeletedCount',
  'noChromePurgeAuthority: true',
].forEach((needle) => assertContains(storeSnapshotBody, needle, `6B.5 Chrome canonical store ${needle}`));

[
  'buildDesktopCanonicalRecentlyDeletedSnapshot(bundleInput',
  'storeDesktopCanonicalRecentlyDeletedSnapshot(desktopCanonicalRecentlyDeleted)',
  'desktop-canonical-recently-deleted',
  'desktopCanonicalRecentlyDeletedImport',
].forEach((needle) => assertContains(importPropagationBody, needle, `6B.5 import propagation ${needle}`));

[
  'desktopCanonicalRecentlyDeleted: propagation && propagation.desktopCanonicalRecentlyDeleted',
  'desktopCanonicalRecentlyDeletedImport: propagation && propagation.desktopCanonicalRecentlyDeletedImport',
].forEach((needle) => assertContains(importer, needle, `6B.5 sync result surfaces canonical import ${needle}`));

[
  'desktopCanonicalRecentlyDeleted',
  "source: 'desktop-canonical-recently-deleted'",
  'companionStatusLabel',
  'pendingDeleteRequest: false',
  'noChromePurgeAuthority: true',
].forEach((needle) => assertContains(canonicalRowsBody, needle, `6B.5 Chrome companion canonical rows ${needle}`));

[
  'FOLDER_SYNC_STATE_KEY_LOCAL',
  'desktopCanonicalRecentlyDeletedSource',
  'sync-import-state',
  'hasChromeDesktopCanonicalRecentlyDeletedSnapshot',
].forEach((needle) => assertContains(sidebar, needle, `6B.5 Chrome canonical storage recovery ${needle}`));

[
  'const desktopCanonical = chromeDesktopCanonicalRecentlyDeletedSnapshotFromState(state)',
  'if (desktopCanonical) return desktopCanonical.rows',
].forEach((needle) => assertContains(companionRowsBody, needle, `6B.5 Chrome companion canonical precedence ${needle}`));

[
  'desktopCanonicalRecentlyDeletedCount',
  'chromeCanonicalRecentlyDeletedCount',
  'chromeCompanionRecentlyDeletedCount',
  'desktopCanonicalRecentlyDeletedProjectionPresent',
  'desktopCanonicalRecentlyDeletedSource',
  'staleReceiptRowCount',
  'pendingLocalDeleteCount',
  'desktopChromeRecentlyDeletedParityOk',
  'mismatchedFolderIds',
  'extraChromeRows',
  'missingChromeRows',
].forEach((needle) => assertContains(diagnoseBody, needle, `6B.5 parity diagnostics ${needle}`));

[
  'const canonicalProjectionPresent = !!desktopCanonicalSnapshot',
  ': companionRows.slice()',
  ': receiptRows.slice()',
].forEach((needle) => assertContains(diagnoseBody, needle, `6B.5 stale fallback diagnostics ${needle}`));

[
  'Restore is available from Desktop Studio.',
  'Permanent delete is only available from Desktop Studio.',
  "disabled: 'disabled'",
].forEach((needle) => assertContains(renderBody + sidebar, needle, `6B.5 Chrome read-only authority copy ${needle}`));

[
  'purgeRecentlyDeletedFolders',
  'clearRecentlyDeletedRestoredHistory',
  'restoreTombstonedFolder',
  'deleteChat(',
  'deleteSnapshot(',
  'DELETE FROM',
].forEach((needle) => assertNotContains(importer + companionRowsBody + renderBody, needle, `6B.5 forbidden Chrome behavior ${needle}`));

[
  'Phase 6B.5',
  'Desktop canonical Recently Deleted',
  'Chrome no longer counts historical receipt rows as active Recently Deleted',
  'desktopChromeRecentlyDeletedParityOk',
  'no Chrome purge authority',
].forEach((needle) => assertContains(evidence, needle, `6B.5 evidence ${needle}`));

console.log(JSON.stringify({
  ok: true,
  validator: 'validate-folder-delete-phase6b5-recently-deleted-parity',
  exporter: path.relative(root, exportPath),
  importer: path.relative(root, importPath),
  companion: path.relative(root, sidebarPath),
  evidence: path.relative(root, evidencePath),
  canonicalSource: 'desktop-canonical-recently-deleted',
  chromeAuthority: 'read-only-companion',
  noChromePurgeAuthority: true,
}, null, 2));
