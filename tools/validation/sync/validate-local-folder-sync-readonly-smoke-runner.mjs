#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const runnerPath = path.join(root, 'tools/smoke/local-folder-sync-readonly-smoke-runner.mjs');

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

assert(fs.existsSync(runnerPath), 'combined read-only smoke runner missing');
const runner = read(runnerPath);

assertContains(runner, 'h2o.studio.local-folder-sync-readonly-smoke.result.v1', 'runner schema');
assertContains(runner, 'folder-sync-rc-readonly-smoke-runner', 'runner phase');
assertContains(runner, 'tools/smoke/chrome-cdp-studio.mjs', 'Chrome helper dependency');
assertContains(runner, 'tools/smoke/desktop-folder-sync-queue-client.mjs', 'Desktop helper dependency');
assertContains(runner, 'DEFAULT_CHROME_PORT = 9243', 'default Chrome port');
assertContains(runner, "DEFAULT_CHROME_MODE = 'attach'", 'default Chrome attach mode');
assertContains(runner, 'DEFAULT_TIMEOUT_MS = 30000', 'default timeout');
assertContains(runner, 'execFile(process.execPath', 'execFile helper execution');
assertContains(runner, "['diagnoseHealth', 'getFolderModel']", 'read-only op list');
assertContains(runner, "'--op', 'diagnoseHealth'", 'diagnoseHealth execution plan');
assertContains(runner, "'--op', 'getFolderModel'", 'getFolderModel execution plan');
assertContains(runner, 'chrome-health-permission-required', 'Chrome permission warning behavior');
assertContains(runner, 'permissionOnlyChromeHealthBlocked', 'Chrome permission blocker classifier');
assertContains(runner, 'syncFolderDiagnose', 'live sync folder diagnose summary');
assertContains(runner, 'syncFolderDiagnoseFromHelper', 'helper sync diagnose fallback');
assertContains(runner, 'prepareDiagnostics', 'helper prepare diagnostics summary');
assertContains(runner, 'finalSyncDiagnose', 'final helper sync diagnose fallback');
assertContains(runner, 'afterNavigateSyncDiagnose', 'after navigation sync diagnose fallback');
assertContains(runner, 'targetProbeSummary', 'Chrome target probe summary');
assertContains(runner, 'chromeSyncDiagnosePermissionGranted', 'granted sync permission classifier');
assertContains(runner, 'chromeSyncDiagnosePermissionMissing', 'missing sync permission classifier');
assertContains(runner, 'chromeCdpConnectedTargetMissing', 'missing connected CDP target classifier');
assertContains(runner, "diag.permission === 'granted'", 'granted permission check');
assertContains(runner, "diag.available !== true", 'real diagnose required for missing permission warning');
assertContains(runner, 'chrome-cdp-connected-target-missing', 'connected target missing blocker');
assertContains(runner, 'chrome-health-permission-state-unconfirmed', 'unconfirmed permission blocker');
assertContains(runner, 'row-count-differs', 'row count warning behavior');
assertContains(runner, 'comparisonIsInformational: true', 'informational comparison marker');
assertContains(runner, 'chromeRowCount', 'Chrome row count comparison');
assertContains(runner, 'desktopRowCount', 'Desktop row count comparison');
assertContains(runner, 'commonFolderCount', 'common folder count comparison');
assertContains(runner, 'chromeOnlyCount', 'Chrome-only folder count comparison');
assertContains(runner, 'desktopOnlyCount', 'Desktop-only folder count comparison');
assertContains(runner, 'privacy: { redacted: true }', 'redacted privacy flag');
assertContains(runner, 'readOnly: true', 'read-only safety flag');
assertContains(runner, 'noArbitraryEval: true', 'arbitrary eval safety flag');
assertContains(runner, 'noRawSql: true', 'raw SQL safety flag');
assertContains(runner, 'noHardDelete: true', 'hard delete safety flag');
assertContains(runner, 'noPurge: true', 'purge safety flag');
assertContains(runner, 'noTombstonePropagationApply: true', 'tombstone propagation safety flag');
assertContains(runner, 'noChatDelete: true', 'chat delete safety flag');
assertContains(runner, 'noSnapshotDelete: true', 'snapshot delete safety flag');
assertContains(runner, 'noBroadFilesystemAccess: true', 'broad filesystem safety flag');
assertContains(runner, 'node tools/smoke/local-folder-sync-readonly-smoke-runner.mjs --chrome-port 9243 --timeout-ms 30000', 'CLI usage example');

assertNotContains(runner, 'eval(', 'read-only smoke runner');
assertNotContains(runner, 'new Function', 'read-only smoke runner');
assertNotContains(runner, 'Runtime.evaluate', 'read-only smoke runner');
assertNotContains(runner, "'createFolder'", 'read-only smoke runner');
assertNotContains(runner, "'renameFolder'", 'read-only smoke runner');
assertNotContains(runner, "'setFolderColor'", 'read-only smoke runner');
assertNotContains(runner, "'requestFolderDelete'", 'read-only smoke runner');
assertNotContains(runner, "'applyFolderDeleteRequest'", 'read-only smoke runner');
assertNotContains(runner, 'DELETE FROM', 'read-only smoke runner');
assertNotContains(runner, 'DROP TABLE', 'read-only smoke runner');
assertNotContains(runner, 'TRUNCATE TABLE', 'read-only smoke runner');
assertNotContains(runner, 'hardDeleteFolder', 'read-only smoke runner');
assertNotContains(runner, 'purgeTombstone', 'read-only smoke runner');
assertNotContains(runner, 'purgeFolder', 'read-only smoke runner');
assertNotContains(runner, 'deleteChat(', 'read-only smoke runner');
assertNotContains(runner, 'deleteSnapshot(', 'read-only smoke runner');

const execPlanOps = [...runner.matchAll(/'--op', '([^']+)'/g)].map((match) => match[1]);
assert(execPlanOps.length === 4, `expected four helper op invocations, found ${execPlanOps.length}`);
assert(execPlanOps.filter((op) => op === 'diagnoseHealth').length === 2, 'expected two diagnoseHealth invocations');
assert(execPlanOps.filter((op) => op === 'getFolderModel').length === 2, 'expected two getFolderModel invocations');
for (const op of execPlanOps) {
  assert(op === 'diagnoseHealth' || op === 'getFolderModel', `unexpected op in execution plan: ${op}`);
}

console.log(JSON.stringify({
  ok: true,
  validator: 'validate-local-folder-sync-readonly-smoke-runner',
  runnerPath,
  helpers: [
    'tools/smoke/chrome-cdp-studio.mjs',
    'tools/smoke/desktop-folder-sync-queue-client.mjs',
  ],
  allowedOps: ['diagnoseHealth', 'getFolderModel'],
}, null, 2));
