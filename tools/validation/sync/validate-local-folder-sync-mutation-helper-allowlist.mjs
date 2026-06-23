#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const helperPaths = [
  path.join(root, 'tools/smoke/chrome-cdp-studio.mjs'),
  path.join(root, 'tools/smoke/desktop-folder-sync-queue-client.mjs'),
];
const readOnlyOps = ['diagnoseHealth', 'getFolderModel'];
const mutationOps = [
  'createFolder',
  'renameFolder',
  'setFolderColor',
  'syncNow',
  'verifyFolderVisible',
  'verifyFolderHidden',
];
const forbiddenOps = [
  'requestFolderDelete',
  'applyFolderDeleteRequest',
  'listFolderDeleteRequests',
  'listFolderDeleteReceipts',
  'listActiveFolderTombstones',
  'restoreFolder',
  'deleteFolder',
  'hardDelete',
  'purge',
  'rawSql',
  'deleteChat',
  'deleteSnapshot',
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function read(file) {
  return fs.readFileSync(file, 'utf8');
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

for (const helperPath of helperPaths) {
  assert(fs.existsSync(helperPath), `${helperPath} missing`);
  const source = read(helperPath);
  const label = path.relative(root, helperPath);
  assertContains(source, '--allow-mutation', label);
  assertContains(source, '--payload-json', label);
  assertContains(source, '--payload-file', label);
  assertContains(source, 'JSON.parse(raw)', label);
  assertContains(source, 'payload-json-object-required', label);
  assertContains(source, 'payload-source-conflict', label);
  assertContains(source, 'payloadAccepted', label);
  assertContains(source, 'mutationAllowed', label);
  assertContains(source, 'allowMutation', label);
  assertContains(source, 'noArbitraryEval: true', label);
  assertContains(source, 'noRawSql: true', label);
  assertContains(source, 'noHardDelete: true', label);
  assertContains(source, 'noPurge: true', label);
  assertContains(source, 'noTombstonePropagationApply: true', label);
  assertContains(source, 'noChatDelete: true', label);
  assertContains(source, 'noSnapshotDelete: true', label);
  assertContains(source, 'noBroadFilesystemAccess: true', label);
  assertContains(source, 'mutation-op-requires-allow-mutation', label);
  assertContains(source, 'op-not-allowlisted', label);
  assertNotContains(source, 'eval(', label);
  assertNotContains(source, 'new Function', label);
  assertNotContains(source, 'DELETE FROM', label);
  assertNotContains(source, 'DROP TABLE', label);
  assertNotContains(source, 'TRUNCATE TABLE', label);

  const readOnlyBlock = listBlock(source, 'READ_ONLY_OPS');
  for (const op of readOnlyOps) assert(readOnlyBlock.includes(`'${op}'`), `${label} READ_ONLY_OPS missing ${op}`);
  for (const op of [...mutationOps, ...forbiddenOps]) {
    assert(!readOnlyBlock.includes(op), `${label} READ_ONLY_OPS must not include ${op}`);
  }

  const mutationBlock = listBlock(source, 'MUTATION_OPS');
  for (const op of mutationOps) assert(mutationBlock.includes(`'${op}'`), `${label} MUTATION_OPS missing ${op}`);
  for (const op of forbiddenOps) {
    assert(!mutationBlock.includes(op), `${label} MUTATION_OPS must not include ${op}`);
  }
}

console.log(JSON.stringify({
  ok: true,
  validator: 'validate-local-folder-sync-mutation-helper-allowlist',
  helpers: helperPaths.map((file) => path.relative(root, file)),
  readOnlyOps,
  mutationOps,
  forbiddenOps,
}, null, 2));
