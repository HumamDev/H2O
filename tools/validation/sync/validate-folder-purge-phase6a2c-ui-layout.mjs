#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const sidebarPath = path.join(root, 'src-surfaces-base/studio/S0Z1g. 🎬 Library Sidebar Sections - Studio.js');
const evidencePath = path.join(root, 'release-evidence/2026-06-24/folder-delete-restore-phase6a2c-premium-ui-layout.md');

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
  const marker = `function ${name}`;
  const start = source.indexOf(marker);
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

for (const file of [sidebarPath, evidencePath]) {
  assert(fs.existsSync(file), `${path.relative(root, file)} missing`);
}

const sidebar = read(sidebarPath);
const evidence = read(evidencePath);
const renderBody = functionBody(sidebar, 'renderRecentlyDeletedFoldersPanel');
const sidebarEntryBody = functionBody(sidebar, 'renderRecentlyDeletedFoldersSidebarEntry');
const purgeFlowBody = functionBody(sidebar, 'permanentlyDeleteRecentlyDeletedFolders');

[
  'summary.textContent = `Recently Deleted · ${formatNumber(rows.length)}`',
  'wbFolderRecentlyDeletedPurgeHeader',
  'wbFolderRecentlyDeletedPurgeCopy',
  'wbFolderRecentlyDeletedPurgeHelper',
  'Permanent delete',
  'Permanently removes restore records for eligible deleted folders. Chats and snapshots are not deleted.',
  'No purge-eligible deleted folders.',
  'Delete permanently',
  'wbSidebarNativeAction--danger',
  'flex-wrap:wrap',
  'max-width:100%',
  'white-space:normal',
  'linear-gradient(180deg,rgba(220,38,38,.36),rgba(127,29,29,.24))',
].forEach((needle) => assertContains(renderBody, needle, `professional purge header ${needle}`));

[
  'wbFolderRecentlyDeletedStatsGrid',
  'repeat(auto-fit,minmax(108px,1fr))',
  'Active',
  'Restored',
  'Purge blocked',
  'Expired',
  'Purge eligible',
  'Retention',
  'wbFolderRecentlyDeletedPolicyChips',
  'Purge deferred',
  'Hard delete blocked',
  'Retention enforcement',
].forEach((needle) => assertContains(renderBody, needle, `stats/chip layout ${needle}`));

[
  'wbFolderRecentlyDeletedRowHeader',
  'wbFolderRecentlyDeletedStatusPill',
  'wbFolderRecentlyDeletedDetailsGrid',
  'repeat(auto-fit,minmax(150px,1fr))',
  'Folder ID',
  'Deleted',
  'Restore available',
  'Affected chats',
  'Purge blocked',
  'Hard delete blocked',
  'wbFolderRecentlyDeletedActionRow',
  'wbFolderRecentlyDeletedRestorePill',
  'Already restored',
  "restoreStatus === 'restored'",
].forEach((needle) => assertContains(renderBody, needle, `row card layout ${needle}`));

[
  'deleteChats: false',
  'deleteSnapshots: false',
  'deleteAssets: false',
].forEach((needle) => assertContains(purgeFlowBody, needle, `purge safety option ${needle}`));

assertNotContains(sidebarEntryBody, 'Delete permanently', 'sidebar purge button');
assertNotContains(sidebarEntryBody, 'wbFolderRecentlyDeletedPurgeHeader', 'sidebar purge header');

[
  'chromeFolderDeleteRequestActions',
  'requestDelete',
  'deleteChat(',
  'deleteSnapshot(',
  'DELETE FROM',
].forEach((needle) => assertNotContains(renderBody, needle, `forbidden UI behavior ${needle}`));

[
  'Phase 6A.2c',
  'premium',
  'Delete permanently (0)',
  'Permanent delete',
  'No purge-eligible deleted folders.',
  'Already restored',
  'no Chrome purge UI',
  'no purge semantics change',
].forEach((needle) => assertContains(evidence, needle, `evidence ${needle}`));

console.log(JSON.stringify({
  ok: true,
  validator: 'validate-folder-purge-phase6a2c-ui-layout',
  ui: path.relative(root, sidebarPath),
  evidence: path.relative(root, evidencePath),
  layoutOnly: true,
  chromePurgeUi: false,
}, null, 2));
