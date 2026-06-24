#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const foldersPath = path.join(root, 'src-surfaces-base/studio/store/folders.tauri.js');
const clientPath = path.join(root, 'tools/smoke/desktop-folder-sync-queue-client.mjs');
const evidencePath = path.join(root, 'release-evidence/2026-06-24/folder-delete-restore-phase6a1c-resurrection-repair.md');

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

for (const file of [foldersPath, clientPath, evidencePath]) {
  assert(fs.existsSync(file), `${path.relative(root, file)} missing`);
}

const folders = read(foldersPath);
const client = read(clientPath);
const evidence = read(evidencePath);

[
  'PHASE6A_REPAIR_PREVIEW_SCHEMA',
  'PHASE6A_REPAIR_RESULT_SCHEMA',
  'PHASE6A_REPAIR_SOURCE',
  'previewPurgedFolderResurrectionRepair',
  'repairPurgedFolderResurrections',
  'buildPurgedFolderResurrectionRepairPlan',
  'phase6aPermanentlyPurged',
  'phase6aPurgeRepair: true',
  'activeRealUserSkippedCount',
  'repairedCount',
  'permanentlyHiddenFolderRowCount',
  'chatDeletedCount: 0',
  'snapshotDeletedCount: 0',
  'assetDeletedCount: 0',
  'hardDeletedFolderRowCount: 0',
  'receiptDeletedCount: 0',
].forEach((needle) => assertContains(folders, needle, `folders 6A.1c ${needle}`));

const patternBody = functionBody(folders, 'looksLikeResurrectedPurgeCandidate');
[
  '^zz-4d4-delete-restore-',
  '^zz-5c-',
  '^zz-delete-',
  '^F5D',
  '^New 9$',
].forEach((needle) => assertContains(patternBody, needle, `repair pattern ${needle}`));

const planBody = functionBody(folders, 'buildPurgedFolderResurrectionRepairPlan');
[
  'listFolders({ limit: limit })',
  '!looksLikeResurrectedPurgeCandidate(folder)',
  'activeRealUserSkippedCount += 1',
  'folderPurgeProtectionCodes',
  'protectedSkippedCount',
  'alreadySuppressedSkippedCount',
  'result.candidates.push',
].forEach((needle) => assertContains(planBody, needle, `repair plan guard ${needle}`));

const previewBody = functionBody(folders, 'previewPurgedFolderResurrectionRepair');
[
  'previewToken',
  'previewExpiresAt',
  'state.phase6a.lastRepairPreview',
  'candidateFolderIds',
].forEach((needle) => assertContains(previewBody, needle, `repair preview ${needle}`));

const repairBody = functionBody(folders, 'repairPurgedFolderResurrections');
[
  'opts.dryRun !== false',
  'explicit-reason-required',
  'preview-token-required',
  'expected-count-required',
  'invalid-preview-token',
  'preview-token-expired',
  'expected-count-mismatch',
  'preview-candidate-set-changed',
  'looksLikeResurrectedPurgeCandidate(folder)',
  'folderPurgeProtectionCodes',
  'patchOne(folderId',
  'phase6aPermanentlyPurged: true',
  'phase6aPurgeSource: PHASE6A_REPAIR_SOURCE',
  'operatorConfirmedRepair = true',
].forEach((needle) => assertContains(repairBody, needle, `repair commit ${needle}`));

[
  'DELETE FROM',
  'DELETE FROM folders',
  'DELETE FROM folder_bindings',
  'DELETE FROM chats',
  'DELETE FROM snapshots',
  'deleteChat',
  'deleteSnapshot',
  'purgeFolderTombstonesByIds',
  'softDeleteEmptyFolder(',
  'remove(',
].forEach((needle) => assertNotContains(repairBody, needle, `repair forbidden ${needle}`));

[
  'previewPurgedFolderResurrectionRepair: previewPurgedFolderResurrectionRepair',
  'repairPurgedFolderResurrections: repairPurgedFolderResurrections',
].forEach((needle) => assertContains(folders, needle, `folder API export ${needle}`));

assertNotContains(client, "'repairPurgedFolderResurrections'", 'desktop smoke queue');
assertNotContains(client, "'previewPurgedFolderResurrectionRepair'", 'desktop smoke queue');

[
  'Phase 6A.1c',
  'previewPurgedFolderResurrectionRepair',
  'repairPurgedFolderResurrections',
  'phase6aPermanentlyPurged',
  'activeRealUserSkippedCount',
  'chatDeletedCount:0',
  'snapshotDeletedCount:0',
  'assetDeletedCount:0',
  'hardDeletedFolderRowCount:0',
  'receiptDeletedCount:0',
].forEach((needle) => assertContains(evidence, needle, `evidence ${needle}`));

console.log(JSON.stringify({
  ok: true,
  validator: 'validate-folder-purge-phase6a1c',
  folders: path.relative(root, foldersPath),
  evidence: path.relative(root, evidencePath),
  repairUsesPermanentSuppression: true,
  hardDelete: false,
  smokeQueueCommitExposed: false,
}, null, 2));
