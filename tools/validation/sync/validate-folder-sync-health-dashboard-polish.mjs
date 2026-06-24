#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const failures = [];
const studioPath = 'src-surfaces-base/studio/studio.js';
const evidencePath = 'release-evidence/2026-06-24/folder-sync-health-dashboard-polish.md';

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function assertIncludes(source, needle, label = needle) {
  assert(source.includes(needle), `missing ${label}`);
}

function assertNotIncludes(source, needle, label = needle) {
  assert(!source.includes(needle), `unexpected ${label}`);
}

function functionBody(source, name) {
  const marker = `function ${name}`;
  const start = source.indexOf(marker);
  if (start === -1) return '';
  const signatureEnd = source.indexOf(')', start);
  const open = source.indexOf('{', signatureEnd === -1 ? start : signatureEnd);
  if (open === -1) return '';
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  return '';
}

const studio = read(studioPath);
const renderBody = functionBody(studio, 'settingsFolderSyncHealthRender');
const unavailableBody = functionBody(studio, 'settingsFolderSyncHealthUnavailable');
const refreshBody = functionBody(studio, 'refreshSettingsSync');

[
  'wbSettingsFolderSyncHealthDashboard',
  'settingsFolderSyncHealthRender',
  'settingsFolderSyncHealthUnavailable',
  'Folder Sync Health',
  'diagnoseHealth',
  'listRecentlyDeletedFolders',
  'diagnoseRecentlyDeletedFolders',
].forEach((needle) => assertIncludes(studio, needle, `health dashboard wiring ${needle}`));

[
  'Create / Rename / Color',
  'Delete / Restore Lifecycle',
  'Desktop Authority',
  'Chrome Receipts',
  'Recently Deleted',
  'Retention Policy',
  'retentionEnforcement',
  'retentionDays',
  'purgeEligibleCount',
  'purgeBlockedCount',
  'hardDeleteBlockedCount',
  'activeRetentionCount',
  'expiredRetentionCount',
  'restoredRetentionCount',
].forEach((needle) => assertIncludes(renderBody, needle, `health dashboard field ${needle}`));

[
  'noHardDelete',
  'noPurge',
  'noChatDelete',
  'noSnapshotDelete',
  'noTombstoneApplyOnChrome',
  'visible-state-only delete/restore receipts',
].forEach((needle) => assertIncludes(renderBody + unavailableBody, needle, `health dashboard safety ${needle}`));

[
  'purge design deferred',
  'WebDAV/cloud/relay deferred',
  'full chat-folder binding sync deferred',
  'cross-device retention ledger deferred',
].forEach((needle) => assertIncludes(studio, needle, `health dashboard deferred ${needle}`));

[
  'exportLatestSyncBundle(',
  'syncNow(',
  'restoreTombstonedFolder(',
  'softDeleteEmptyFolder(',
  'requestFolderDelete(',
  'purgeTombstone',
  'purgeFolder',
  'hardDeleteFolder',
  'deleteChat',
  'deleteSnapshot',
  'DELETE FROM',
].forEach((needle) => assertNotIncludes(renderBody + unavailableBody, needle, `forbidden dashboard action ${needle}`));

assertIncludes(refreshBody, 'settingsFolderSyncHealthRender(panel', 'refresh path renders dashboard');
assertIncludes(refreshBody, 'source: "folder-sync-health-dashboard"', 'read-only recently deleted source marker');
assert(fs.existsSync(path.join(root, evidencePath)), 'evidence file must exist');

if (failures.length) {
  console.error('validate-folder-sync-health-dashboard-polish failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('validate-folder-sync-health-dashboard-polish passed');
