#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const registryPath = path.join(root, 'src-surfaces-base/studio/dev/folder-sync-rc-smoke-bridge.studio.js');
const studioHtmlPath = path.join(root, 'src-surfaces-base/studio/studio.html');

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

const registry = read(registryPath);
const html = read(studioHtmlPath);

assertContains(registry, 'H2O.Studio.devSmoke.folderSync', 'registry namespace');
assertContains(registry, 'h2o:studio:smoke-bridge:enabled:v1', 'localStorage gate');
assertContains(registry, 'h2oSmokeBridge', 'URL gate');
assertContains(registry, 'folder-sync-rc', 'required gate value');
assertContains(registry, 'knownLocalDevSurface', 'local/dev surface gate');
assertContains(registry, 'public-release', 'public release gate');
assertContains(registry, 'ALLOWED_OPS', 'allowlist');
assertContains(registry, 'FORBIDDEN_OPS', 'forbidden op documentation');
assertContains(registry, 'privacy: { redacted: true }', 'redacted result contract');
assertContains(registry, 'noArbitraryEval: true', 'arbitrary eval safety flag');
assertContains(registry, 'noRawSql: true', 'raw SQL safety flag');
assertContains(registry, 'noHardDelete: true', 'hard delete safety flag');
assertContains(registry, 'noPurge: true', 'purge safety flag');
assertContains(registry, 'noTombstonePropagationApply: true', 'tombstone propagation safety flag');
assertContains(registry, 'noChatDelete: true', 'chat delete safety flag');
assertContains(registry, 'noSnapshotDelete: true', 'snapshot delete safety flag');

const expectedOps = [
  'getFolderModel',
  'createFolder',
  'renameFolder',
  'setFolderColor',
  'syncNow',
  'diagnoseHealth',
  'requestFolderDelete',
  'listFolderDeleteRequests',
  'applyFolderDeleteRequest',
  'listFolderDeleteReceipts',
  'listActiveFolderTombstones',
  'countChatsSnapshots',
  'verifyFolderVisible',
  'verifyFolderHidden',
];
for (const op of expectedOps) {
  assertContains(registry, `'${op}'`, `allowlisted op ${op}`);
}

const forbiddenOps = [
  "'eval'",
  "'rawSql'",
  "'hardDelete'",
  "'purge'",
  "'applyTombstonePropagation'",
  "'deleteChat'",
  "'deleteSnapshot'",
];
const allowlistMatch = registry.match(/var ALLOWED_OPS = Object\.freeze\(\[([\s\S]*?)\]\);/);
assert(allowlistMatch, 'ALLOWED_OPS block missing or malformed');
const allowlistBlock = allowlistMatch[1];
for (const forbidden of forbiddenOps) {
  assert(!allowlistBlock.includes(forbidden), `${forbidden} must not be in ALLOWED_OPS`);
}

assertContains(registry, "DESKTOP_ONLY_OPS[envelope.op] && surface.kind !== 'desktop-studio'", 'Desktop-only apply guard');
assertContains(registry, "CHROME_ONLY_OPS[envelope.op] && surface.kind !== 'chrome-studio'", 'Chrome-only request guard');
assertContains(registry, 'restoredAt || r.restored_at', 'active tombstone restored filter');
assertContains(registry, '!cleanString(r.restoredAt || r.restored_at)', 'active tombstone filter');

assertNotContains(registry, 'eval(', 'registry');
assertNotContains(registry, 'new Function', 'registry');
assertNotContains(registry, 'DELETE FROM', 'registry');
assertNotContains(registry, 'DROP TABLE', 'registry');
assertNotContains(registry, 'TRUNCATE TABLE', 'registry');

assertContains(html, './dev/folder-sync-rc-smoke-bridge.studio.js', 'Studio loader');

console.log(JSON.stringify({
  ok: true,
  validator: 'validate-folder-sync-rc-smoke-bridge',
  registryPath,
  studioHtmlPath,
  allowedOpCount: expectedOps.length,
}, null, 2));
