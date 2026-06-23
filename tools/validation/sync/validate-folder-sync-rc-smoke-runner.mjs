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
assertContains(helper, 'CHROME_DEV_SMOKE_PORT = 9225', 'Chrome Dev smoke port');
assertContains(helper, "/private/tmp/h2o-folder-sync-smoke-chrome-dev-profile", 'Chrome Dev smoke profile');
assertContains(helper, '/Applications/Google Chrome Dev.app/Contents/MacOS/Google Chrome Dev', 'Chrome Dev binary example');
assertContains(helper, 'apps/extensions/chatgpt/chrome/studio-launcher', 'Studio Launcher extension default');
assertContains(helper, 'H2O.Studio.devSmoke.folderSync.run', 'registry path label');
assertContains(helper, 'h2oSmokeBridge', 'URL flag');
assertContains(helper, 'h2o:studio:smoke-bridge:enabled:v1', 'localStorage opt-in');
assertContains(helper, 'folder-sync-rc', 'required smoke gate value');
assertContains(helper, 'Runtime.callFunctionOn', 'fixed CDP callFunctionOn usage');
assertContains(helper, 'function(op, payload) { return this.run(op, payload); }', 'fixed registry wrapper');
assertContains(helper, 'function() { return this.diagnoseGates ? this.diagnoseGates() : null; }', 'fixed registry gates wrapper');
assertContains(helper, 'arguments: [{ value: op }, { value: payload }]', 'structured CDP arguments');
assertContains(helper, "READ_ONLY_OPS = Object.freeze(['diagnoseHealth', 'getFolderModel'])", 'Slice 4A read-only allowlist');
assertContains(helper, "if (!READ_ONLY_OP_SET.has(options.op))", 'read-only op guard');
assertContains(helper, 'op-not-read-only', 'read-only rejection status');
assertContains(helper, 'chrome-cdp-unavailable', 'CDP unavailable status');
assertContains(helper, 'chrome-cdp-port-in-use', 'CDP port in use status');
assertContains(helper, 'chrome-cdp-attached-to-wrong-browser', 'wrong browser blocker');
assertContains(helper, 'chrome-extension-not-loaded', 'extension not loaded status');
assertContains(helper, 'chrome-studio-target-missing', 'target missing status');
assertContains(helper, 'cdp-browser-websocket-open-failed', 'browser WebSocket failure status');
assertContains(helper, 'cdp-target-websocket-missing', 'missing target WebSocket status');
assertContains(helper, 'cdp-target-attach-failed', 'target attach failure status');
assertContains(helper, 'chrome-extension-page-blocked', 'blocked extension page status');
assertContains(helper, 'smoke-registry-missing', 'missing smoke registry status');
assertContains(helper, 'smoke-registry-disabled', 'disabled smoke registry status');
assertContains(helper, 'chrome-extension://', 'Chrome Studio extension URL support');
assertContains(helper, '--remote-debugging-port=', 'launch mode remote debugging port');
assertContains(helper, '--user-data-dir=', 'launch mode smoke profile');
assertContains(helper, '--load-extension=', 'optional unpacked extension load');
assertContains(helper, "key === 'user-data-dir'", 'user-data-dir alias');
assertContains(helper, "key === 'profile-dir'", 'profile-dir alias');
assertContains(helper, "key === 'extension-path'", 'extension-path alias');
assertContains(helper, 'registryGatesEnabled', 'registry gate diagnostic output');
assertContains(helper, 'smokeUrlFlagPresent', 'smoke URL flag diagnostic output');
assertContains(helper, 'summarizeCdpVersion', 'browser version diagnostic output');
assertContains(helper, 'returnByValue: true', 'redacted value result transport');
assertContains(helper, 'connectBrowserAttachedTarget', 'browser-level attach fallback');
assertContains(helper, 'connectTargetControl', 'target control selector');
assertContains(helper, 'Target.attachToTarget', 'browser-level target attach command');
assertContains(helper, 'flatten: true', 'flattened target session');
assertContains(helper, 'PAGE_STATUS_WRAPPER', 'page status check wrapper');
assertContains(helper, 'ERR_BLOCKED_BY_CLIENT', 'blocked page detection');
assertContains(helper, 'cdpControlDiagnostics', 'CDP control diagnostic output');

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
  chromeDevPort: 9225,
  chromeDevProfile: '/private/tmp/h2o-folder-sync-smoke-chrome-dev-profile',
  allowedOps: ['diagnoseHealth', 'getFolderModel'],
}, null, 2));
