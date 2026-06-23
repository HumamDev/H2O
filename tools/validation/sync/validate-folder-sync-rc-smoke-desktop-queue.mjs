#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const queuePath = path.join(root, 'src-surfaces-base/studio/dev/folder-sync-rc-smoke-desktop-queue.tauri.js');
const registryPath = path.join(root, 'src-surfaces-base/studio/dev/folder-sync-rc-smoke-bridge.studio.js');
const studioHtmlPath = path.join(root, 'src-surfaces-base/studio/studio.html');
const packStudioPath = path.join(root, 'tools/product/studio/pack-studio.mjs');

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertContains(source, needle, label) {
  assert(source.includes(needle), `${label || 'source'} missing ${needle}`);
}

function assertNotContains(source, needle, label) {
  assert(!source.includes(needle), `${label || 'source'} must not contain ${needle}`);
}

const queue = read(queuePath);
const registry = read(registryPath);
const html = read(studioHtmlPath);
const packStudio = read(packStudioPath);

assertContains(queue, 'H2O.Studio.devSmoke.folderSyncQueue', 'queue namespace');
assertContains(queue, 'folder-sync-rc-smoke-desktop-queue', 'queue phase');
assertContains(queue, '/Users/hobayda/H2O Studio Sync/.h2o-smoke', 'scoped smoke root');
assertContains(queue, "SMOKE_ROOT + '/desktop-command.json'", 'scoped command path');
assertContains(queue, "SMOKE_ROOT + '/results'", 'scoped result path');
assertContains(queue, "COMMAND_PATH.indexOf(SMOKE_ROOT + '/') === 0", 'command path scoped guard');
assertContains(queue, "RESULTS_DIR.indexOf(SMOKE_ROOT + '/') === 0", 'result path scoped guard');

assertContains(queue, 'detectTauri()', 'Desktop/Tauri guard');
assertContains(queue, "registryGates.surface !== 'desktop-studio'", 'Desktop surface gate');
assertContains(queue, "registryGates.adapter !== 'tauri'", 'Tauri adapter gate');
assertContains(queue, 'registry.diagnoseGates()', 'shared registry gates');
assertContains(queue, 'smoke-registry-gates-required', 'registry gate blocker');
assertContains(queue, 'registry.run(validation.op, runPayload)', 'registry-only dispatcher');
assertContains(queue, "expectedSurface: 'desktop-studio'", 'Desktop expected surface');

assertContains(queue, 'command-id-required', 'command schema validation');
assertContains(queue, 'created-at-required', 'createdAt schema validation');
assertContains(queue, 'invalid-payload', 'payload schema validation');
assertContains(queue, 'command-json-parse-failed', 'bad JSON handling');
assertContains(queue, 'malformed-command-duplicate-suppressed', 'bad JSON duplicate suppression');
assertContains(queue, 'processedCommandIds', 'duplicate command tracking');
assertContains(queue, 'duplicate-command-id', 'duplicate command result');
assertContains(queue, 'noCommandExecuted: true', 'duplicate no-op proof');

assertContains(queue, 'privacy: { redacted: true }', 'redacted result contract');
assertContains(queue, 'noArbitraryEval: true', 'arbitrary eval safety flag');
assertContains(queue, 'noRawSql: true', 'raw SQL safety flag');
assertContains(queue, 'noHardDelete: true', 'hard delete safety flag');
assertContains(queue, 'noPurge: true', 'purge safety flag');
assertContains(queue, 'noTombstonePropagationApply: true', 'tombstone propagation safety flag');
assertContains(queue, 'noChatDelete: true', 'chat delete safety flag');
assertContains(queue, 'noSnapshotDelete: true', 'snapshot delete safety flag');
assertContains(queue, 'noBroadFilesystemAccess: true', 'broad filesystem safety flag');

assertNotContains(queue, 'eval(', 'queue');
assertNotContains(queue, 'new Function', 'queue');
assertNotContains(queue, 'DELETE FROM', 'queue');
assertNotContains(queue, 'DROP TABLE', 'queue');
assertNotContains(queue, 'TRUNCATE TABLE', 'queue');
assertNotContains(queue, 'hardDeleteFolder', 'queue');
assertNotContains(queue, 'purgeTombstone', 'queue');
assertNotContains(queue, 'purgeFolder', 'queue');
assertNotContains(queue, 'deleteChat', 'queue');
assertNotContains(queue, 'deleteSnapshot', 'queue');

const forbiddenOps = [
  "'eval'",
  "'rawSql'",
  "'hardDelete'",
  "'purge'",
  "'applyTombstonePropagation'",
  "'deleteChat'",
  "'deleteSnapshot'",
];
for (const forbidden of forbiddenOps) {
  assert(!queue.includes(`op === ${forbidden}`), `queue must not dispatch ${forbidden}`);
}

assertContains(registry, 'H2O.Studio.devSmoke.folderSync', 'shared registry still present');
assertContains(registry, 'ALLOWED_OPS', 'shared registry allowlist still present');

assertContains(html, './dev/folder-sync-rc-smoke-desktop-queue.tauri.js', 'Studio loader');
assertContains(packStudio, '"dev/folder-sync-rc-smoke-desktop-queue.tauri.js"', 'Studio packer copy list');
const packEntryCount = (packStudio.match(/"dev\/folder-sync-rc-smoke-desktop-queue\.tauri\.js"/g) || []).length;
assert(packEntryCount === 2, `Studio packer should contain source and output entries exactly once each; found ${packEntryCount}`);

console.log(JSON.stringify({
  ok: true,
  validator: 'validate-folder-sync-rc-smoke-desktop-queue',
  queuePath,
  registryPath,
  studioHtmlPath,
  packStudioPath,
  queuePathScoped: true,
  dispatcher: 'H2O.Studio.devSmoke.folderSync.run',
}, null, 2));
