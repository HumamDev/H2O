#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const helperPath = path.join(root, 'tools/smoke/chrome-cdp-studio.mjs');

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

const helper = read(helperPath);

assertContains(helper, 'DEFAULT_PORT = 9224', 'default CDP port');
assertContains(helper, "/private/tmp/h2o-folder-sync-smoke-chrome-profile", 'default smoke profile');
assertContains(helper, 'H2O.Studio.devSmoke.folderSync.run', 'registry path label');
assertContains(helper, 'h2oSmokeBridge', 'URL flag');
assertContains(helper, 'h2o:studio:smoke-bridge:enabled:v1', 'localStorage opt-in');
assertContains(helper, 'folder-sync-rc', 'required smoke gate value');
assertContains(helper, 'Runtime.callFunctionOn', 'fixed CDP callFunctionOn usage');
assertContains(helper, 'function(op, payload) { return this.run(op, payload); }', 'fixed registry wrapper');
assertContains(helper, 'arguments: [{ value: op }, { value: payload }]', 'structured CDP arguments');
assertContains(helper, "READ_ONLY_OPS = Object.freeze(['diagnoseHealth', 'getFolderModel'])", 'Slice 4A read-only allowlist');
assertContains(helper, "if (!READ_ONLY_OP_SET.has(options.op))", 'read-only op guard');
assertContains(helper, 'op-not-read-only', 'read-only rejection status');
assertContains(helper, 'chrome-cdp-unavailable', 'CDP unavailable status');
assertContains(helper, 'chrome-studio-target-missing', 'target missing status');
assertContains(helper, 'chrome-extension://', 'Chrome Studio extension URL support');
assertContains(helper, '--remote-debugging-port=', 'launch mode remote debugging port');
assertContains(helper, '--user-data-dir=', 'launch mode smoke profile');
assertContains(helper, '--load-extension=', 'optional unpacked extension load');
assertContains(helper, 'returnByValue: true', 'redacted value result transport');

assertNotContains(helper, 'eval(', 'Chrome CDP helper');
assertNotContains(helper, 'new Function', 'Chrome CDP helper');
assertNotContains(helper, '--js', 'Chrome CDP helper');
assertNotContains(helper, '--script', 'Chrome CDP helper');
assertNotContains(helper, '--expression', 'Chrome CDP helper');
assertNotContains(helper, 'createFolder', 'Chrome CDP helper');
assertNotContains(helper, 'renameFolder', 'Chrome CDP helper');
assertNotContains(helper, 'setFolderColor', 'Chrome CDP helper');
assertNotContains(helper, 'requestFolderDelete', 'Chrome CDP helper');
assertNotContains(helper, 'applyFolderDeleteRequest', 'Chrome CDP helper');
assertNotContains(helper, 'DELETE FROM', 'Chrome CDP helper');
assertNotContains(helper, 'DROP TABLE', 'Chrome CDP helper');
assertNotContains(helper, 'TRUNCATE TABLE', 'Chrome CDP helper');

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
  validator: 'validate-folder-sync-rc-smoke-runner',
  helperPath,
  defaultPort: 9224,
  defaultProfile: '/private/tmp/h2o-folder-sync-smoke-chrome-profile',
  allowedOps: ['diagnoseHealth', 'getFolderModel'],
}, null, 2));
