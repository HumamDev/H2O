#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const helperPath = path.join(root, 'tools/smoke/desktop-folder-sync-queue-client.mjs');

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertContains(source, needle, label) {
  assert(source.includes(needle), `${label || 'source'} missing ${needle}`);
}

function assertNotContains(source, needle, label) {
  assert(!source.includes(needle), `${label || 'source'} must not contain ${needle}`);
}

assert(fs.existsSync(helperPath), 'Desktop queue client helper missing');
const helper = read(helperPath);

assertContains(helper, 'h2o.studio.desktop-queue-smoke-client.result.v1', 'client schema');
assertContains(helper, 'folder-sync-rc-smoke-desktop-queue-client', 'client phase');
assertContains(helper, '/Users/hobayda/H2O Studio Sync/.h2o-smoke', 'scoped smoke root');
assertContains(helper, '/Users/hobayda/H2O Studio Sync/.h2o-smoke/desktop-command.json', 'scoped command path');
assertContains(helper, '/Users/hobayda/H2O Studio Sync/.h2o-smoke/results', 'scoped result path');
assertContains(helper, "READ_ONLY_OPS = Object.freeze(['diagnoseHealth', 'getFolderModel'])", 'read-only allowlist');
assertContains(helper, 'READ_ONLY_OP_SET.has(options.op)', 'read-only op guard');
assertContains(helper, 'op-not-read-only', 'read-only rejection status');
assertContains(helper, 'desktop-queue-timeout', 'queue timeout status');
assertContains(helper, "desktop-${op}-${Date.now().toString(36)}", 'default unique commandId');
assertContains(helper, "expectedSurface: 'desktop-studio'", 'Desktop expected surface payload');
assertContains(helper, "reason: 'desktop-queue-smoke-client'", 'client reason payload');
assertContains(helper, 'fs.writeFileSync(COMMAND_PATH', 'single command file writer');
assertContains(helper, 'resultPathForCommand(command.commandId)', 'commandId result path');
assertContains(helper, 'privacy: { redacted: true }', 'redacted privacy flag');
assertContains(helper, 'noArbitraryEval: true', 'arbitrary eval safety flag');
assertContains(helper, 'noRawSql: true', 'raw SQL safety flag');
assertContains(helper, 'noHardDelete: true', 'hard delete safety flag');
assertContains(helper, 'noPurge: true', 'purge safety flag');
assertContains(helper, 'noTombstonePropagationApply: true', 'tombstone propagation safety flag');
assertContains(helper, 'noChatDelete: true', 'chat delete safety flag');
assertContains(helper, 'noSnapshotDelete: true', 'snapshot delete safety flag');
assertContains(helper, 'noBroadFilesystemAccess: true', 'broad filesystem safety flag');
assertContains(helper, 'node tools/smoke/desktop-folder-sync-queue-client.mjs --op diagnoseHealth --timeout-ms 30000', 'diagnoseHealth usage example');
assertContains(helper, 'node tools/smoke/desktop-folder-sync-queue-client.mjs --op getFolderModel --timeout-ms 30000', 'getFolderModel usage example');

assertNotContains(helper, 'eval(', 'Desktop queue client');
assertNotContains(helper, 'new Function', 'Desktop queue client');
assertNotContains(helper, 'Runtime.evaluate', 'Desktop queue client');
assertNotContains(helper, 'DELETE FROM', 'Desktop queue client');
assertNotContains(helper, 'DROP TABLE', 'Desktop queue client');
assertNotContains(helper, 'TRUNCATE TABLE', 'Desktop queue client');
assertNotContains(helper, 'hardDeleteFolder', 'Desktop queue client');
assertNotContains(helper, 'purgeTombstone', 'Desktop queue client');
assertNotContains(helper, 'purgeFolder', 'Desktop queue client');
assertNotContains(helper, 'deleteChat(', 'Desktop queue client');
assertNotContains(helper, 'deleteSnapshot(', 'Desktop queue client');

const allowlistMatch = helper.match(/READ_ONLY_OPS = Object\.freeze\(\[([^\]]+)\]\)/);
assert(allowlistMatch, 'READ_ONLY_OPS declaration missing');
const allowlistBlock = allowlistMatch[1];
for (const op of ['diagnoseHealth', 'getFolderModel']) {
  assert(allowlistBlock.includes(`'${op}'`), `READ_ONLY_OPS missing ${op}`);
}
for (const op of [
  'createFolder',
  'renameFolder',
  'setFolderColor',
  'requestFolderDelete',
  'applyFolderDeleteRequest',
  'hardDelete',
  'purge',
  'rawSql',
  'deleteChat',
  'deleteSnapshot',
]) {
  assert(!allowlistBlock.includes(op), `READ_ONLY_OPS must not include ${op}`);
}

console.log(JSON.stringify({
  ok: true,
  validator: 'validate-folder-sync-rc-smoke-desktop-client',
  helperPath,
  commandPath: '/Users/hobayda/H2O Studio Sync/.h2o-smoke/desktop-command.json',
  resultsDir: '/Users/hobayda/H2O Studio Sync/.h2o-smoke/results',
  allowedOps: ['diagnoseHealth', 'getFolderModel'],
}, null, 2));
