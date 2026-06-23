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
assertContains(helper, 'build/chrome-ext-studio-launcher', 'Studio Launcher built extension default');
assertContains(helper, 'apps/extensions/chatgpt/chrome/studio-launcher', 'legacy Studio Launcher template diagnostic');
assertContains(helper, 'H2O.Studio.devSmoke.folderSync.run', 'registry path label');
assertContains(helper, 'h2oSmokeBridge', 'URL flag');
assertContains(helper, 'h2o:studio:smoke-bridge:enabled:v1', 'localStorage opt-in');
assertContains(helper, 'folder-sync-rc', 'required smoke gate value');
assertContains(helper, 'VISIBLE_MARKER_WRAPPER', 'visible Studio marker probe');
assertContains(helper, '__H2O_SMOKE_VISIBLE_MARKER', 'visible marker source');
assertContains(helper, 'visibleMarkerSeen', 'visible marker diagnostic');
assertContains(helper, 'Runtime.callFunctionOn', 'fixed CDP callFunctionOn usage');
assertContains(helper, 'function(op, payload) { return this.run(op, payload); }', 'fixed registry wrapper');
assertContains(helper, 'function() { return this.diagnoseGates ? this.diagnoseGates() : null; }', 'fixed registry gates wrapper');
assertContains(helper, 'SYNC_FOLDER_DIAGNOSE_WRAPPER', 'fixed sync folder diagnose wrapper');
assertContains(helper, 'async function() { try { var api = globalThis.H2O && globalThis.H2O.Studio', 'async sync folder diagnose wrapper');
assertContains(helper, 'var raw = await api.diagnose() || {}', 'awaited sync folder diagnose');
assertContains(helper, 'globalThis.H2O.Studio.sync.folder', 'sync folder diagnose wrapper source');
assertContains(helper, "status: 'sync-folder-diagnosed'", 'sync folder diagnose wrapper status');
assertContains(helper, 'SYNC_FOLDER_DIAGNOSE_EVALUATE_EXPRESSION', 'sync folder diagnose evaluate fallback');
assertContains(helper, 'waitForSyncFolderDiagnose', 'bounded sync folder diagnose wait');
assertContains(helper, 'syncFolderDiagnoseGranted', 'granted folder handle classifier');
assertContains(helper, 'syncFolderDiagnoseLost', 'lost folder handle classifier');
assertContains(helper, 'arguments: [{ value: op }, { value: payload }]', 'structured CDP arguments');
assertContains(helper, "READ_ONLY_OPS = Object.freeze(['diagnoseHealth', 'getFolderModel'])", 'Slice 4A read-only allowlist');
assertContains(helper, "MUTATION_OPS = Object.freeze", 'Slice 5A mutation allowlist');
assertContains(helper, 'classifyOp(options.op, options.allowMutation)', 'operation classifier guard');
assertContains(helper, 'mutation-op-requires-allow-mutation', 'mutation opt-in rejection status');
assertContains(helper, 'op-not-allowlisted', 'unknown op rejection status');
assertContains(helper, '--allow-mutation', 'mutation opt-in CLI flag');
assertContains(helper, '--payload-json', 'structured payload JSON CLI');
assertContains(helper, '--payload-file', 'structured payload file CLI');
assertContains(helper, 'JSON.parse(raw)', 'JSON-only payload parser');
assertContains(helper, 'payload-json-object-required', 'payload object-only guard');
assertContains(helper, 'chrome-cdp-unavailable', 'CDP unavailable status');
assertContains(helper, 'chrome-cdp-port-in-use', 'CDP port in use status');
assertContains(helper, 'chrome-cdp-attached-to-wrong-browser', 'wrong browser blocker');
assertContains(helper, 'chrome-extension-not-loaded', 'extension not loaded status');
assertContains(helper, 'chrome-studio-target-missing', 'target missing status');
assertContains(helper, 'cdp-browser-websocket-open-failed', 'browser WebSocket failure status');
assertContains(helper, 'cdp-target-websocket-missing', 'missing target WebSocket status');
assertContains(helper, 'cdp-target-attach-failed', 'target attach failure status');
assertContains(helper, 'chrome-extension-page-blocked', 'blocked extension page status');
assertContains(helper, 'chrome-cdp-navigation-lost-folder-handle', 'lost folder handle blocker');
assertContains(helper, 'smoke-registry-missing', 'missing smoke registry status');
assertContains(helper, 'smoke-registry-disabled', 'disabled smoke registry status');
assertContains(helper, 'chrome-studio-target-url-mismatch', 'Studio target URL mismatch status');
assertContains(helper, 'studio-launcher-extension-not-loaded', 'Studio Launcher extension discovery status');
assertContains(helper, 'chrome-load-extension-ignored', 'load extension ignored status');
assertContains(helper, 'chrome-extension-path-invalid', 'extension path invalid status');
assertContains(helper, 'chrome-extension-manifest-invalid', 'extension manifest invalid status');
assertContains(helper, 'chrome-extension-policy-blocked', 'extension policy blocked status');
assertContains(helper, 'chrome-extension://', 'Chrome Studio extension URL support');
assertContains(helper, '--remote-debugging-port=', 'launch mode remote debugging port');
assertContains(helper, '--user-data-dir=', 'launch mode smoke profile');
assertContains(helper, '--load-extension=', 'optional unpacked extension load');
assertContains(helper, '--disable-extensions-except=', 'launcher-only extension scope');
assertContains(helper, '--enable-unsafe-extension-debugging', 'Chrome Dev unpacked extension debug flag');
assertContains(helper, 'DisableLoadExtensionCommandLineSwitch', 'Chrome Dev load-extension feature bypass');
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
assertContains(helper, 'validateExtensionPath', 'extension path validation');
assertContains(helper, 'manifest.json', 'extension manifest validation');
assertContains(helper, 'manifestRequiredFiles', 'extension required file validation');
assertContains(helper, 'idFromExtensionKey', 'manifest key extension ID derivation');
assertContains(helper, 'expectedExtensionId', 'expected extension ID diagnostic');
assertContains(helper, 'expectedPageProbe', 'expected extension page probe diagnostic');
assertContains(helper, 'discoverExtensionTargets', 'extension target discovery');
assertContains(helper, 'Target.getTargets', 'browser target discovery');
assertContains(helper, 'waitForStudioLauncherExtension', 'extension discovery retry');
assertContains(helper, 'Extensions.loadUnpacked', 'CDP unpacked extension loading');
assertContains(helper, 'Extensions.triggerAction', 'CDP extension action trigger');
assertContains(helper, 'filter: [{ type: \'tab\', exclude: false }]', 'tab target filter for extension action');
assertContains(helper, 'SMOKE_EXTENSION_COPY_ROOT', 'temporary smoke extension copy root');
assertContains(helper, 'prepareSmokeExtensionCopy', 'temporary smoke extension copy preparation');
assertContains(helper, 'SMOKE_REGISTRY_RELATIVE_PATH', 'smoke registry relative path');
assertContains(helper, 'SOURCE_SMOKE_REGISTRY', 'source smoke registry overlay path');
assertContains(helper, 'overlayCurrentSmokeRegistry', 'source smoke registry overlay');
assertContains(helper, 'smokeRegistryOverlayApplied', 'smoke registry overlay diagnostic');
assertContains(helper, 'smokeRegistryWasStale', 'stale smoke registry diagnostic');
assertContains(helper, 'patchSmokeExtensionManifest', 'temporary smoke manifest patch');
assertContains(helper, "resources: ['surfaces/studio/*']", 'smoke copy exposes only Studio resources');
assertContains(helper, "matches: ['<all_urls>']", 'smoke copy web-accessible match for CDP navigation');
assertContains(helper, 'studioWebAccessiblePatched', 'smoke manifest web-accessible diagnostic');
assertContains(helper, 'STUDIO_AUTO_RESTORE_ENABLED = true', 'temporary smoke launcher auto restore patch');
assertContains(helper, '__h2oSmokeOpenStudio', 'temporary smoke launcher open wrapper');
assertContains(helper, 'SMOKE_SERVICE_WORKER_OPEN_STUDIO_WRAPPER', 'self-contained service worker Studio open wrapper');
assertContains(helper, 'smokeServiceWorkerOpenStudioWrapperFor', 'runtime service worker Studio open wrapper');
assertContains(helper, 'smoke-chrome-tabs-api-unavailable', 'service worker tabs API missing diagnostic');
assertContains(helper, 'service-worker-tabs-create', 'service worker tabs.create Studio open method');
assertContains(helper, 'smoke-studio-tab-created', 'service worker Studio tab creation status');
assertContains(helper, 'smoke-studio-tab-create-failed', 'service worker Studio tab create failure status');
assertContains(helper, 'open-studio-service-worker-wrapper-install-threw', 'service worker wrapper install failure diagnostic');
assertContains(helper, 'open-studio-service-worker-wrapper-missing', 'service worker wrapper missing diagnostic');
assertContains(helper, 'wrapperInstalled', 'service worker wrapper install diagnostic output');
assertContains(helper, "typeof globalThis.__h2oSmokeOpenStudio", 'service worker wrapper type check');
assertContains(helper, 'summarizeExceptionDetails', 'service worker open exception diagnostics');
assertContains(helper, 'SERVICE_WORKER_OPEN_STUDIO_EXPRESSION', 'fixed service worker Studio open expression');
assertContains(helper, 'cdpLoadPreferred', 'CDP extension load preference');
assertContains(helper, 'chrome-extension-loaded-via-cdp', 'CDP extension load status');
assertContains(helper, 'chrome-extension-service-worker-open-studio-called', 'service worker Studio open status');
assertContains(helper, 'discoveredExtensionIds', 'discovered extension diagnostics');
assertContains(helper, 'loadedExtensionIds', 'loaded extension diagnostics');
assertContains(helper, 'blockedExtensionTargetCount', 'blocked extension target diagnostics');
assertContains(helper, 'isBlockedExtensionTarget', 'blocked extension target guard');
assertContains(helper, 'isSmokeStudioTarget', 'smoke Studio target guard');
assertContains(helper, 'selectBestStudioTarget', 'best Studio target selector');
assertContains(helper, 'collectStudioTargetCandidates', 'all Studio target candidate collector');
assertContains(helper, 'mergeTargetLists', 'target list merge without URL title dedupe');
assertContains(helper, 'browserTargetInfos', 'browser Target.getTargets candidate source');
assertContains(helper, 'candidates: combined.filter((target) => isStudioTarget', 'all Studio pages are probed before smoke flag navigation');
assertContains(helper, 'history.replaceState', 'same-page smoke URL flag update');
assertContains(helper, 'SMOKE_URL_FLAG_HISTORY_WRAPPER', 'same-page smoke URL flag wrapper');
assertContains(helper, 'replaceSmokeUrlFlagWithoutReload', 'no-reload smoke URL flag helper');
assertContains(helper, 'attach-preserve-existing-target', 'attach mode preserves existing target URL');
assertContains(helper, 'preserve-connected-target-without-smoke-query', 'connected target without smoke query preservation reason');
assertContains(helper, 'attachLocalOptInAllowed', 'attach mode localStorage gate diagnostic');
assertContains(helper, 'urlChanged', 'URL change diagnostic');
assertContains(helper, 'originalHref', 'original href diagnostic');
assertContains(helper, 'finalHref', 'final href diagnostic');
assertContains(helper, 'beforeNavigateSyncDiagnose', 'before navigation sync diagnose');
assertContains(helper, 'afterNavigateSyncDiagnose', 'after navigation sync diagnose');
assertContains(helper, 'finalSyncDiagnose', 'final sync diagnose after prepare');
assertContains(helper, 'boundedWaitForFolderHandle', 'bounded folder handle wait diagnostic');
assertContains(helper, 'probeStudioTarget', 'Studio target probe');
assertContains(helper, 'readSyncFolderDiagnose', 'target sync diagnose probe');
assertContains(helper, 'scoreStudioTargetProbe', 'target score by permission');
assertContains(helper, 'connectedGrantedTargetCount', 'target probe granted count diagnostic');
assertContains(helper, 'selectedTargetSyncPermission', 'selected target permission diagnostic');
assertContains(helper, 'selectedTargetSyncConnected', 'selected target connected diagnostic');
assertContains(helper, 'targetProbeSummary', 'target probe summary output');
assertContains(helper, 'targetProbe', 'target probe output');
assertContains(helper, 'attemptedExtensionId', 'attempted extension diagnostics');
assertContains(helper, 'extensionPath', 'extension path diagnostics');
assertContains(helper, 'stderrTail', 'Chrome stderr tail diagnostics');
assertContains(helper, "launchChrome(options, 'about:blank'", 'launch avoids stale extension URL before discovery');

assertNotContains(helper, 'eval(', 'Chrome CDP helper');
assertNotContains(helper, 'new Function', 'Chrome CDP helper');
assertNotContains(helper, '--js', 'Chrome CDP helper');
assertNotContains(helper, '--script', 'Chrome CDP helper');
assertNotContains(helper, '--expression', 'Chrome CDP helper');
assertNotContains(helper, 'requestFolderDelete', 'Chrome CDP helper');
assertNotContains(helper, 'applyFolderDeleteRequest', 'Chrome CDP helper');
assertNotContains(helper, 'listFolderDeleteRequests', 'Chrome CDP helper');
assertNotContains(helper, 'listFolderDeleteReceipts', 'Chrome CDP helper');
assertNotContains(helper, 'listActiveFolderTombstones', 'Chrome CDP helper');
assertNotContains(helper, 'deleteFolder', 'Chrome CDP helper');
assertNotContains(helper, 'restoreFolder', 'Chrome CDP helper');
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

const mutationAllowlistMatch = helper.match(/MUTATION_OPS = Object\.freeze\(\[([\s\S]*?)\]\)/);
assert(mutationAllowlistMatch, 'MUTATION_OPS declaration missing');
const mutationAllowlistBlock = mutationAllowlistMatch[1];
for (const op of ['createFolder', 'renameFolder', 'setFolderColor', 'syncNow', 'verifyFolderVisible', 'verifyFolderHidden']) {
  assert(mutationAllowlistBlock.includes(`'${op}'`), `MUTATION_OPS missing ${op}`);
}
for (const op of [
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
]) {
  assert(!mutationAllowlistBlock.includes(op), `MUTATION_OPS must not include ${op}`);
}

console.log(JSON.stringify({
  ok: true,
  validator: 'validate-folder-sync-rc-smoke-runner',
  helperPath,
  defaultPort: 9224,
  defaultProfile: '/private/tmp/h2o-folder-sync-smoke-chrome-profile',
  chromeDevPort: 9225,
  chromeDevProfile: '/private/tmp/h2o-folder-sync-smoke-chrome-dev-profile',
  readOnlyOps: ['diagnoseHealth', 'getFolderModel'],
  mutationOps: ['createFolder', 'renameFolder', 'setFolderColor', 'syncNow', 'verifyFolderVisible', 'verifyFolderHidden'],
}, null, 2));
