#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');

const SCHEMA = 'h2o.studio.local-folder-sync-readonly-smoke.result.v1';
const PHASE = 'folder-sync-rc-readonly-smoke-runner';
const DEFAULT_CHROME_PORT = 9243;
const DEFAULT_CHROME_MODE = 'attach';
const DEFAULT_TIMEOUT_MS = 30000;
const CHROME_HELPER = 'tools/smoke/chrome-cdp-studio.mjs';
const DESKTOP_HELPER = 'tools/smoke/desktop-folder-sync-queue-client.mjs';
const READ_ONLY_OPS = Object.freeze(['diagnoseHealth', 'getFolderModel']);

function nowIso() {
  return new Date().toISOString();
}

function safetyFlags() {
  return {
    privacy: { redacted: true },
    readOnly: true,
    noArbitraryEval: true,
    noProductionListener: true,
    noRawSql: true,
    noHardDelete: true,
    noPurge: true,
    noTombstonePropagationApply: true,
    noChatDelete: true,
    noSnapshotDelete: true,
    noBroadFilesystemAccess: true,
  };
}

function result(status, extra = {}) {
  return {
    schema: SCHEMA,
    phase: PHASE,
    ok: extra.ok === true,
    status,
    observedAt: nowIso(),
    helpers: {
      chrome: CHROME_HELPER,
      desktop: DESKTOP_HELPER,
    },
    ...safetyFlags(),
    ...extra,
  };
}

function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function usage() {
  return [
    'Usage:',
    '  node tools/smoke/local-folder-sync-readonly-smoke-runner.mjs --chrome-port 9243 --timeout-ms 30000',
    '',
    'Runs read-only commands only:',
    '  Chrome diagnoseHealth',
    '  Chrome getFolderModel',
    '  Desktop diagnoseHealth',
    '  Desktop getFolderModel',
  ].join('\n');
}

function parseArgs(argv) {
  const options = {
    chromePort: DEFAULT_CHROME_PORT,
    chromeMode: DEFAULT_CHROME_MODE,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }
    if (!arg.startsWith('--')) throw new Error(`unexpected argument: ${arg}`);
    const eq = arg.indexOf('=');
    const key = eq >= 0 ? arg.slice(2, eq) : arg.slice(2);
    const value = eq >= 0 ? arg.slice(eq + 1) : argv[++i];
    if (value == null) throw new Error(`missing value for --${key}`);
    if (key === 'chrome-port') options.chromePort = Number(value);
    else if (key === 'chrome-mode') options.chromeMode = String(value);
    else if (key === 'timeout-ms') options.timeoutMs = Number(value);
    else throw new Error(`unknown option: --${key}`);
  }
  if (!Number.isFinite(options.chromePort) || options.chromePort <= 0) throw new Error('invalid --chrome-port');
  if (options.chromeMode !== 'attach') throw new Error('Slice 4C supports --chrome-mode attach only');
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0) throw new Error('invalid --timeout-ms');
  return options;
}

function parseJsonStdout(stdout) {
  const text = String(stdout || '').trim();
  if (!text) throw new Error('empty-json-stdout');
  try {
    return JSON.parse(text);
  } catch (error) {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1));
    throw error;
  }
}

function redactValue(value, depth = 0) {
  if (depth > 8) return '[redacted-depth]';
  if (value == null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return value.length > 2000 ? `${value.slice(0, 2000)}...` : value;
  if (Array.isArray(value)) return value.slice(0, 200).map((item) => redactValue(item, depth + 1));
  if (typeof value !== 'object') return null;
  const output = {};
  for (const [key, entry] of Object.entries(value)) {
    const lower = key.toLowerCase();
    if (lower.includes('token') || lower.includes('secret') || lower.includes('password')) {
      output[key] = '[redacted]';
      continue;
    }
    if (lower === 'content' || lower === 'rawcontent' || lower === 'snapshotpayload') {
      output[key] = '[redacted]';
      continue;
    }
    output[key] = redactValue(entry, depth + 1);
  }
  return output;
}

function execNodeJson(label, helperPath, args, timeoutMs) {
  const commandArgs = [helperPath, ...args];
  return new Promise((resolve) => {
    const startedAt = nowIso();
    execFile(process.execPath, commandArgs, {
      cwd: repoRoot,
      timeout: timeoutMs + 5000,
      maxBuffer: 12 * 1024 * 1024,
    }, (error, stdout, stderr) => {
      const completedAt = nowIso();
      let parsed = null;
      let parseError = '';
      try {
        parsed = parseJsonStdout(stdout);
      } catch (parseErr) {
        parseError = String(parseErr && parseErr.message || parseErr);
      }
      resolve({
        label,
        helperPath,
        args,
        startedAt,
        completedAt,
        exitCode: error && typeof error.code === 'number' ? error.code : 0,
        signal: error && error.signal || '',
        timedOut: !!(error && error.killed),
        stdoutJsonParsed: !!parsed,
        parseError,
        stderrTail: String(stderr || '').split(/\r?\n/).filter(Boolean).slice(-8),
        output: parsed ? redactValue(parsed) : null,
      });
    });
  });
}

function registryResult(helperOutput) {
  if (!helperOutput || typeof helperOutput !== 'object') return null;
  const first = helperOutput.result;
  if (!first || typeof first !== 'object') return null;
  if (first.result && typeof first.result === 'object') return first.result;
  return first;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function blockersOf(value) {
  return asArray(value && value.blockers).map(String).filter(Boolean);
}

function warningsOf(value) {
  return asArray(value && value.warnings).map(String).filter(Boolean);
}

function folderRowsFromRegistry(registry) {
  return asArray(registry && registry.folders).filter((row) => row && typeof row === 'object');
}

function folderIdOf(row) {
  return String(row && (row.folderId || row.id) || '').trim();
}

function commandSummary(runResult) {
  const helper = runResult && runResult.output || null;
  const registry = registryResult(helper);
  return {
    helperReachable: !!(runResult && runResult.stdoutJsonParsed),
    helperOk: !!(helper && helper.ok === true),
    status: String(helper && helper.status || runResult && runResult.parseError || 'helper-output-missing'),
    exitCode: runResult && runResult.exitCode || 0,
    timedOut: !!(runResult && runResult.timedOut),
    registryOk: !!(registry && registry.ok === true),
    registryStatus: String(registry && registry.status || ''),
    registryVerdict: String(registry && registry.verdict || ''),
    registryGatesEnabled: helper && helper.registryGatesEnabled === true ||
      helper && helper.result && helper.result.registryGatesEnabled === true,
    blockers: [...blockersOf(helper), ...blockersOf(registry)],
    warnings: [...warningsOf(helper), ...warningsOf(registry)],
    syncFolderDiagnose: registry && registry.syncFolderDiagnose && typeof registry.syncFolderDiagnose === 'object'
      ? registry.syncFolderDiagnose
      : null,
    targetProbeSummary: helper && helper.targetProbeSummary && typeof helper.targetProbeSummary === 'object'
      ? helper.targetProbeSummary
      : null,
    rowCount: Number(registry && registry.rowCount || 0),
    canonicalRowCount: Number(registry && registry.canonicalRowCount || 0),
    displayModelAvailable: registry && registry.displayModelAvailable === true,
  };
}

function permissionOnlyChromeHealthBlocked(summary) {
  const blockers = new Set((summary && summary.blockers || []).map(String));
  if (!blockers.has('permission-required') && !blockers.has('no-folder-handle')) return false;
  for (const blocker of blockers) {
    if (blocker !== 'permission-required' && blocker !== 'no-folder-handle') return false;
  }
  return true;
}

function chromeSyncDiagnosePermissionGranted(summary) {
  const diag = summary && summary.syncFolderDiagnose || {};
  return diag.connected === true &&
    diag.permission === 'granted' &&
    diag.permissionRequired !== true &&
    diag.noFolderHandle !== true;
}

function chromeSyncDiagnosePermissionMissing(summary) {
  const diag = summary && summary.syncFolderDiagnose || {};
  if (!diag || diag.available !== true) return false;
  if (diag.connected === false || diag.noFolderHandle === true) return true;
  if (diag.permissionRequired === true) return true;
  if (diag.permission && diag.permission !== 'granted') return true;
  return false;
}

function chromeCdpConnectedTargetMissing(summary) {
  const probe = summary && summary.targetProbeSummary || {};
  if (!probe || typeof probe !== 'object') return false;
  return Number(probe.probedTargetCount || 0) > 0 &&
    Number(probe.connectedGrantedTargetCount || 0) === 0;
}

function compareFolders(chromeModelOutput, desktopModelOutput) {
  const chromeRegistry = registryResult(chromeModelOutput);
  const desktopRegistry = registryResult(desktopModelOutput);
  const chromeRows = folderRowsFromRegistry(chromeRegistry);
  const desktopRows = folderRowsFromRegistry(desktopRegistry);
  const chromeIds = new Set(chromeRows.map(folderIdOf).filter(Boolean));
  const desktopIds = new Set(desktopRows.map(folderIdOf).filter(Boolean));
  let commonFolderCount = 0;
  for (const id of chromeIds) {
    if (desktopIds.has(id)) commonFolderCount += 1;
  }
  return {
    chromeRowCount: Number(chromeRegistry && chromeRegistry.rowCount || chromeRows.length || 0),
    desktopRowCount: Number(desktopRegistry && desktopRegistry.rowCount || desktopRows.length || 0),
    rowCountMatch: Number(chromeRegistry && chromeRegistry.rowCount || chromeRows.length || 0) ===
      Number(desktopRegistry && desktopRegistry.rowCount || desktopRows.length || 0),
    commonFolderCount,
    chromeOnlyCount: [...chromeIds].filter((id) => !desktopIds.has(id)).length,
    desktopOnlyCount: [...desktopIds].filter((id) => !chromeIds.has(id)).length,
    comparisonIsInformational: true,
  };
}

function addRunBlockers(blockers, key, runResult, summary) {
  if (!runResult.stdoutJsonParsed) blockers.push(`${key}-invalid-json`);
  if (runResult.timedOut) blockers.push(`${key}-helper-timeout`);
  if (summary.status === 'desktop-queue-timeout') blockers.push(`${key}-desktop-queue-timeout`);
  if (summary.status === 'smoke-registry-disabled' || summary.blockers.includes('smoke-registry-disabled')) {
    blockers.push(`${key}-registry-gates-missing`);
  }
}

async function run(options) {
  const chromeDiagnose = await execNodeJson('chrome.diagnoseHealth', CHROME_HELPER, [
    '--mode', options.chromeMode,
    '--port', String(options.chromePort),
    '--op', 'diagnoseHealth',
    '--timeout-ms', String(options.timeoutMs),
  ], options.timeoutMs);
  const chromeModel = await execNodeJson('chrome.getFolderModel', CHROME_HELPER, [
    '--mode', options.chromeMode,
    '--port', String(options.chromePort),
    '--op', 'getFolderModel',
    '--timeout-ms', String(options.timeoutMs),
  ], options.timeoutMs);
  const desktopDiagnose = await execNodeJson('desktop.diagnoseHealth', DESKTOP_HELPER, [
    '--op', 'diagnoseHealth',
    '--timeout-ms', String(options.timeoutMs),
  ], options.timeoutMs);
  const desktopModel = await execNodeJson('desktop.getFolderModel', DESKTOP_HELPER, [
    '--op', 'getFolderModel',
    '--timeout-ms', String(options.timeoutMs),
  ], options.timeoutMs);

  const chromeDiagnoseSummary = commandSummary(chromeDiagnose);
  const chromeModelSummary = commandSummary(chromeModel);
  const desktopDiagnoseSummary = commandSummary(desktopDiagnose);
  const desktopModelSummary = commandSummary(desktopModel);
  const comparison = compareFolders(chromeModel.output, desktopModel.output);
  const blockers = [];
  const warnings = [];

  addRunBlockers(blockers, 'chrome-diagnoseHealth', chromeDiagnose, chromeDiagnoseSummary);
  addRunBlockers(blockers, 'chrome-getFolderModel', chromeModel, chromeModelSummary);
  addRunBlockers(blockers, 'desktop-diagnoseHealth', desktopDiagnose, desktopDiagnoseSummary);
  addRunBlockers(blockers, 'desktop-getFolderModel', desktopModel, desktopModelSummary);

  if (!chromeDiagnoseSummary.helperReachable) blockers.push('chrome-helper-unreachable');
  if (!chromeModelSummary.helperOk || !chromeModelSummary.registryOk) blockers.push('chrome-folder-model-unavailable');
  if (!desktopDiagnoseSummary.helperOk || !desktopDiagnoseSummary.registryOk) blockers.push('desktop-health-unavailable');
  if (!desktopModelSummary.helperOk || !desktopModelSummary.registryOk) blockers.push('desktop-folder-model-unavailable');
  if (!chromeDiagnoseSummary.registryGatesEnabled && !chromeModelSummary.registryGatesEnabled) blockers.push('chrome-registry-gates-missing');
  if (!desktopDiagnoseSummary.registryGatesEnabled && !desktopModelSummary.registryGatesEnabled) blockers.push('desktop-registry-gates-missing');

  if (permissionOnlyChromeHealthBlocked(chromeDiagnoseSummary) &&
      chromeModelSummary.registryOk &&
      chromeSyncDiagnosePermissionGranted(chromeDiagnoseSummary)) {
    // The real sync diagnostic has the live File System Access handle; do not
    // downgrade the read-only smoke because an older health projection lagged.
  } else if (permissionOnlyChromeHealthBlocked(chromeDiagnoseSummary) &&
      chromeModelSummary.registryOk &&
      chromeSyncDiagnosePermissionMissing(chromeDiagnoseSummary)) {
    warnings.push('chrome-health-permission-required');
    for (let i = blockers.length - 1; i >= 0; i -= 1) {
      if (blockers[i] === 'chrome-health-unavailable') blockers.splice(i, 1);
    }
  } else if (permissionOnlyChromeHealthBlocked(chromeDiagnoseSummary) &&
      chromeModelSummary.registryOk &&
      chromeCdpConnectedTargetMissing(chromeDiagnoseSummary)) {
    blockers.push('chrome-cdp-connected-target-missing');
  } else if (permissionOnlyChromeHealthBlocked(chromeDiagnoseSummary) && chromeModelSummary.registryOk) {
    blockers.push('chrome-health-permission-state-unconfirmed');
  } else if (!chromeDiagnoseSummary.helperOk || !chromeDiagnoseSummary.registryOk) {
    blockers.push('chrome-health-unavailable');
  }

  for (const warning of chromeDiagnoseSummary.warnings) warnings.push(`chrome-diagnoseHealth:${warning}`);
  for (const warning of chromeModelSummary.warnings) warnings.push(`chrome-getFolderModel:${warning}`);
  for (const warning of desktopDiagnoseSummary.warnings) warnings.push(`desktop-diagnoseHealth:${warning}`);
  for (const warning of desktopModelSummary.warnings) warnings.push(`desktop-getFolderModel:${warning}`);
  if (!comparison.rowCountMatch) warnings.push('row-count-differs');

  const uniqueBlockers = [...new Set(blockers.filter(Boolean))];
  const uniqueWarnings = [...new Set(warnings.filter(Boolean))];
  const ok = uniqueBlockers.length === 0;
  return result(ok ? 'readonly-smoke-passed' : 'readonly-smoke-blocked', {
    ok,
    chrome: {
      diagnoseHealth: chromeDiagnoseSummary,
      getFolderModel: chromeModelSummary,
      raw: {
        diagnoseHealth: chromeDiagnose.output,
        getFolderModel: chromeModel.output,
      },
    },
    desktop: {
      diagnoseHealth: desktopDiagnoseSummary,
      getFolderModel: desktopModelSummary,
      raw: {
        diagnoseHealth: desktopDiagnose.output,
        getFolderModel: desktopModel.output,
      },
    },
    comparison,
    blockers: uniqueBlockers,
    warnings: uniqueWarnings,
    inputs: {
      chromePort: options.chromePort,
      chromeMode: options.chromeMode,
      timeoutMs: options.timeoutMs,
      readOnlyOps: READ_ONLY_OPS,
    },
  });
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    printJson(result('invalid-cli-arguments', {
      ok: false,
      error: String(error && error.message || error),
      usage: usage(),
      blockers: ['invalid-cli-arguments'],
    }));
    process.exitCode = 2;
    return;
  }
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  const output = await run(options);
  printJson(output);
  if (output.ok !== true) process.exitCode = 1;
}

main().catch((error) => {
  printJson(result('readonly-smoke-runner-threw', {
    ok: false,
    error: String(error && error.message || error),
    blockers: ['readonly-smoke-runner-threw'],
  }));
  process.exitCode = 1;
});
