#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const runnerPath = path.join(root, 'tools/smoke/local-folder-delete-restore-smoke-runner.mjs');
const chromeHelperPath = path.join(root, 'tools/smoke/chrome-cdp-studio.mjs');
const desktopHelperPath = path.join(root, 'tools/smoke/desktop-folder-sync-queue-client.mjs');
const registryPath = path.join(root, 'src-surfaces-base/studio/dev/folder-sync-rc-smoke-bridge.studio.js');
const evidencePath = path.join(root, 'release-evidence/2026-06-24/folder-delete-tombstone-phase4d4-delete-restore-smoke.md');

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

function listBlock(source, name) {
  const match = source.match(new RegExp(`${name} = Object\\.freeze\\(\\[([\\s\\S]*?)\\]\\)`));
  assert(match, `${name} declaration missing`);
  return match[1];
}

for (const file of [runnerPath, chromeHelperPath, desktopHelperPath, registryPath, evidencePath]) {
  assert(fs.existsSync(file), `${path.relative(root, file)} missing`);
}

const runner = read(runnerPath);
const chromeHelper = read(chromeHelperPath);
const desktopHelper = read(desktopHelperPath);
const registry = read(registryPath);
const evidence = read(evidencePath);

assertContains(runner, 'h2o.studio.local-folder-delete-restore-smoke.result.v1', 'runner schema');
assertContains(runner, 'phase4d.4-delete-restore-smoke-runner', 'runner phase');
assertContains(runner, '--allow-mutation', 'runner mutation gate');
assertContains(runner, 'zz-4d4-delete-restore-', 'unique smoke folder name');
assertContains(runner, 'requestFolderDelete', 'Chrome delete request step');
assertContains(runner, 'expectDeleteRequestExported', 'Chrome delete request export count gate');
assertContains(runner, 'folder-delete-request-export-missing', 'Chrome delete request export missing blocker');
assertContains(runner, 'applyFolderDeleteRequest', 'Desktop delete apply step');
assertContains(runner, 'restoreFolder', 'Desktop restore step');
assertContains(runner, 'folderDeleteReceiptImport', 'delete receipt import diagnostics');
assertContains(runner, 'folderRestoreReceiptImport', 'restore receipt import diagnostics');
assertContains(runner, 'verifyFolderHidden', 'visible-state hide verification');
assertContains(runner, 'desktopHiddenVerifyTimeoutMs', 'Desktop hidden verification extended timeout');
assertContains(runner, 'Math.max(options.timeoutMs, 60000)', 'Desktop hidden verification minimum timeout');
assertContains(runner, "status === 'folder-hidden-or-missing'", 'Desktop hidden-or-missing accepted as hidden');
assertContains(runner, 'folder-hidden-state-unconfirmed', 'hidden state confirmation blocker');
assertContains(runner, 'verifyFolderVisible', 'visible-state restore verification');
assertContains(runner, 'countChatsSnapshots', 'chat/snapshot count proof');
assertContains(runner, 'noTombstoneApplyOnChrome', 'Chrome tombstone apply safety summary');
assertContains(runner, 'noHardDelete: true', 'hard delete safety flag');
assertContains(runner, 'noPurge: true', 'purge safety flag');
assertContains(runner, 'noChatDelete: true', 'chat delete safety flag');
assertContains(runner, 'noSnapshotDelete: true', 'snapshot delete safety flag');
assertContains(runner, 'noBroadFilesystemAccess: true', 'filesystem safety flag');
assertContains(runner, 'runRetriedStep', 'bounded retry helper');
assertContains(runner, 'firstFailedStep', 'fail-fast diagnostic');

for (const forbidden of [
  'hardDeleteFolder',
  'purgeTombstone',
  'purgeFolder',
  'deleteChat(',
  'deleteSnapshot(',
  'DELETE FROM',
  'DROP TABLE',
  'TRUNCATE TABLE',
  'eval(',
  'new Function',
]) {
  assertNotContains(runner, forbidden, 'runner');
  assertNotContains(registry, forbidden, 'registry');
}

const chromeReadOnly = listBlock(chromeHelper, 'READ_ONLY_OPS');
for (const op of ['diagnoseHealth', 'getFolderModel', 'countChatsSnapshots']) {
  assert(chromeReadOnly.includes(`'${op}'`), `Chrome READ_ONLY_OPS missing ${op}`);
}
const chromeMutation = listBlock(chromeHelper, 'MUTATION_OPS');
for (const op of ['createFolder', 'syncNow', 'requestFolderDelete', 'verifyFolderVisible', 'verifyFolderHidden']) {
  assert(chromeMutation.includes(`'${op}'`), `Chrome MUTATION_OPS missing ${op}`);
}
for (const op of ['applyFolderDeleteRequest', 'restoreFolder', 'listActiveFolderTombstones']) {
  assert(!chromeMutation.includes(op), `Chrome MUTATION_OPS must not include ${op}`);
}

const desktopReadOnly = listBlock(desktopHelper, 'READ_ONLY_OPS');
for (const op of [
  'diagnoseHealth',
  'getFolderModel',
  'listFolderDeleteRequests',
  'listFolderDeleteReceipts',
  'listActiveFolderTombstones',
  'listRecentlyDeletedFolders',
  'countChatsSnapshots',
]) {
  assert(desktopReadOnly.includes(`'${op}'`), `Desktop READ_ONLY_OPS missing ${op}`);
}
const desktopMutation = listBlock(desktopHelper, 'MUTATION_OPS');
for (const op of ['syncNow', 'applyFolderDeleteRequest', 'restoreFolder', 'verifyFolderVisible', 'verifyFolderHidden']) {
  assert(desktopMutation.includes(`'${op}'`), `Desktop MUTATION_OPS missing ${op}`);
}
assert(!desktopMutation.includes('requestFolderDelete'), 'Desktop MUTATION_OPS must not include requestFolderDelete');

assertContains(registry, "'restoreFolder'", 'registry allowlist restore op');
assertContains(registry, 'folderDeleteRequestExport', 'registry syncNow delete request export diagnostics');
assertContains(registry, 'preExportFolderModel', 'registry syncNow pre-export folder model diagnostics');
assertContains(registry, 'folder-sync-rc-smoke-sync-export-refresh', 'registry Chrome export refresh marker');
assertContains(registry, 'restoreFolder: true', 'Desktop-only restore op');
assertContains(registry, 'store.restoreTombstonedFolder || store.restoreFolder', 'existing restore API delegation');
assertContains(registry, "if (op === 'restoreFolder') return restoreFolder(payload);", 'restore dispatch');
assertContains(registry, 'noHardDelete: true', 'registry hard delete safety');
assertContains(registry, 'noChatDelete: true', 'registry chat delete safety');
assertContains(registry, 'noSnapshotDelete: true', 'registry snapshot delete safety');

assertContains(evidence, 'Phase 4D.4', 'evidence title');
assertContains(evidence, 'local-folder-delete-restore-smoke-runner.mjs', 'evidence runner path');
const evidenceLower = evidence.toLowerCase();
assertContains(evidenceLower, 'no hard delete', 'evidence hard delete statement');
assertContains(evidenceLower, 'no purge', 'evidence purge statement');
assertContains(evidenceLower, 'no chat deletion', 'evidence chat safety statement');
assertContains(evidenceLower, 'no snapshot deletion', 'evidence snapshot safety statement');

console.log(JSON.stringify({
  ok: true,
  validator: 'validate-folder-delete-restore-phase4d4',
  runner: path.relative(root, runnerPath),
  evidence: path.relative(root, evidencePath),
  chromeMutationOps: ['createFolder', 'syncNow', 'requestFolderDelete', 'verifyFolderVisible', 'verifyFolderHidden'],
  desktopMutationOps: ['syncNow', 'applyFolderDeleteRequest', 'restoreFolder', 'verifyFolderVisible', 'verifyFolderHidden'],
}, null, 2));
