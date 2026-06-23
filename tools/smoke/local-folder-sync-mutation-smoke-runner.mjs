#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');

const SCHEMA = 'h2o.studio.local-folder-sync-mutation-smoke.result.v1';
const PHASE = 'folder-sync-rc-mutation-smoke-runner';
const DEFAULT_CHROME_PORT = 9247;
const DEFAULT_CHROME_MODE = 'attach';
const DEFAULT_TIMEOUT_MS = 30000;
const CHROME_HELPER = 'tools/smoke/chrome-cdp-studio.mjs';
const DESKTOP_HELPER = 'tools/smoke/desktop-folder-sync-queue-client.mjs';
const DEFAULT_INITIAL_COLOR = '#FF4C4C';
const DEFAULT_CHROME_COLOR = '#22C55E';
const DEFAULT_DESKTOP_COLOR = '#A855F7';

function nowIso() {
  return new Date().toISOString();
}

function safetyFlags() {
  return {
    privacy: { redacted: true },
    readOnly: false,
    allowMutation: true,
    mutationAllowed: true,
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
    '  node tools/smoke/local-folder-sync-mutation-smoke-runner.mjs --allow-mutation --chrome-port 9247 --timeout-ms 30000',
    '',
    'Runs create/rename/color local Chrome<->Desktop folder sync smoke only.',
    'Does not run delete, tombstone, restore, purge, raw SQL, chat delete, or snapshot delete operations.',
  ].join('\n');
}

function parseArgs(argv) {
  const options = {
    chromePort: DEFAULT_CHROME_PORT,
    chromeMode: DEFAULT_CHROME_MODE,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    allowMutation: false,
    createdName: '',
    renamedName: '',
    initialColor: DEFAULT_INITIAL_COLOR,
    chromeColor: DEFAULT_CHROME_COLOR,
    desktopColor: DEFAULT_DESKTOP_COLOR,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }
    if (arg === '--allow-mutation') {
      options.allowMutation = true;
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
    else if (key === 'created-name') options.createdName = String(value);
    else if (key === 'renamed-name') options.renamedName = String(value);
    else if (key === 'initial-color') options.initialColor = normalizeColor(value);
    else if (key === 'chrome-color') options.chromeColor = normalizeColor(value);
    else if (key === 'desktop-color') options.desktopColor = normalizeColor(value);
    else if (key === 'allow-mutation') options.allowMutation = value !== 'false';
    else throw new Error(`unknown option: --${key}`);
  }
  if (options.help === true) return options;
  if (options.allowMutation !== true) throw new Error('mutation runner requires --allow-mutation');
  if (!Number.isFinite(options.chromePort) || options.chromePort <= 0) throw new Error('invalid --chrome-port');
  if (options.chromeMode !== 'attach') throw new Error('mutation runner supports --chrome-mode attach only');
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0) throw new Error('invalid --timeout-ms');
  for (const [key, value] of Object.entries({
    initialColor: options.initialColor,
    chromeColor: options.chromeColor,
    desktopColor: options.desktopColor,
  })) {
    if (!/^#[0-9A-F]{6}$/.test(value)) throw new Error(`invalid --${key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}`);
  }
  return options;
}

function normalizeColor(value) {
  const color = String(value || '').trim();
  return /^#[0-9A-Fa-f]{6}$/.test(color) ? color.toUpperCase() : color;
}

function uniqueToken() {
  return Date.now().toString(36);
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
  return new Promise((resolve) => {
    const startedAt = nowIso();
    execFile(process.execPath, [helperPath, ...args], {
      cwd: repoRoot,
      timeout: timeoutMs + 5000,
      maxBuffer: 16 * 1024 * 1024,
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

function codeList(value) {
  return asArray(value).map((entry) => {
    if (typeof entry === 'string') return entry;
    return String(entry && (entry.code || entry.status || entry.reason) || '');
  }).filter(Boolean);
}

function folderIdOf(value) {
  return String(value && (value.folderId || value.id || (value.row && (value.row.folderId || value.row.id))) || '').trim();
}

function rowOf(value) {
  return value && value.row && typeof value.row === 'object' ? value.row : null;
}

function nameOf(value) {
  const row = rowOf(value);
  return String(value && (value.name || value.folderName) || row && (row.name || row.title) || '').trim();
}

function colorOf(value) {
  const row = rowOf(value);
  return normalizeColor(value && (value.color || value.iconColor) || row && (row.color || row.iconColor) || '');
}

function helperSummary(runResult) {
  const helper = runResult && runResult.output || null;
  const registry = registryResult(helper);
  return {
    helperReachable: !!(runResult && runResult.stdoutJsonParsed),
    helperOk: !!(helper && helper.ok === true),
    registryOk: !!(registry && registry.ok === true),
    status: String(helper && helper.status || registry && registry.status || runResult && runResult.parseError || 'helper-output-missing'),
    registryStatus: String(registry && registry.status || ''),
    folderId: folderIdOf(registry),
    name: nameOf(registry),
    color: colorOf(registry),
    blockers: [...codeList(helper && helper.blockers), ...codeList(registry && registry.blockers)],
    warnings: [...codeList(helper && helper.warnings), ...codeList(registry && registry.warnings)],
    raw: helper,
  };
}

function buildChromeArgs(options, op, payload) {
  return [
    '--mode', options.chromeMode,
    '--port', String(options.chromePort),
    '--op', op,
    '--allow-mutation',
    '--payload-json', JSON.stringify(payload || {}),
    '--timeout-ms', String(options.timeoutMs),
  ];
}

function buildDesktopArgs(options, op, payload) {
  return [
    '--op', op,
    '--allow-mutation',
    '--payload-json', JSON.stringify(payload || {}),
    '--timeout-ms', String(options.timeoutMs),
  ];
}

async function runStep(stepResults, key, label, surface, helperPath, args, timeoutMs, check) {
  const runResult = await execNodeJson(label, helperPath, args, timeoutMs);
  const summary = helperSummary(runResult);
  const checkResult = typeof check === 'function' ? check(summary) : { ok: summary.helperOk && summary.registryOk };
  const ok = checkResult.ok === true;
  const blockers = [
    ...(!runResult.stdoutJsonParsed ? [`${key}-invalid-json`] : []),
    ...(runResult.timedOut ? [`${key}-timeout`] : []),
    ...summary.blockers.map((blocker) => `${key}:${blocker}`),
    ...codeList(checkResult.blockers),
  ].filter(Boolean);
  const warnings = [
    ...summary.warnings.map((warning) => `${key}:${warning}`),
    ...codeList(checkResult.warnings),
  ].filter(Boolean);
  const step = {
    key,
    label,
    surface,
    ok,
    status: summary.registryStatus || summary.status,
    folderId: summary.folderId,
    name: summary.name,
    color: summary.color,
    blockers,
    warnings,
    startedAt: runResult.startedAt,
    completedAt: runResult.completedAt,
    helper: summary.raw,
  };
  stepResults.push(step);
  return { runResult, summary, step };
}

function expectOk(key) {
  return (summary) => {
    if (summary.helperOk && summary.registryOk) return { ok: true };
    return { ok: false, blockers: [`${key}-not-ok`] };
  };
}

function expectVisible(folderId, expectedName, expectedColor = '') {
  return (summary) => {
    const blockers = [];
    if (!summary.helperOk || !summary.registryOk) blockers.push('verify-not-ok');
    if (summary.folderId !== folderId) blockers.push('folder-id-mismatch');
    if (expectedName && summary.name !== expectedName) blockers.push('folder-name-mismatch');
    if (expectedColor && summary.color !== normalizeColor(expectedColor)) blockers.push('folder-color-mismatch');
    return { ok: blockers.length === 0, blockers };
  };
}

function collectDeferredWarnings(stepResults) {
  return stepResults.flatMap((step) => step.warnings || []).filter((warning) => {
    const lower = String(warning || '').toLowerCase();
    return lower.includes('deferred');
  });
}

function finalComparison(chromeStep, desktopStep) {
  const chrome = chromeStep || {};
  const desktop = desktopStep || {};
  return {
    folderIdMatch: !!chrome.folderId && chrome.folderId === desktop.folderId,
    nameMatch: !!chrome.name && chrome.name === desktop.name,
    colorMatch: !!chrome.color && chrome.color === desktop.color,
    chrome: {
      folderId: chrome.folderId || '',
      name: chrome.name || '',
      color: chrome.color || '',
    },
    desktop: {
      folderId: desktop.folderId || '',
      name: desktop.name || '',
      color: desktop.color || '',
    },
  };
}

function folderRowsFromRegistry(registry) {
  return asArray(registry && registry.folders).filter((row) => row && typeof row === 'object');
}

function compareFolderModels(chromeHelper, desktopHelper) {
  const chromeRegistry = registryResult(chromeHelper);
  const desktopRegistry = registryResult(desktopHelper);
  const chromeRows = folderRowsFromRegistry(chromeRegistry);
  const desktopRows = folderRowsFromRegistry(desktopRegistry);
  const chromeIds = new Set(chromeRows.map(folderIdOf).filter(Boolean));
  const desktopIds = new Set(desktopRows.map(folderIdOf).filter(Boolean));
  let commonFolderCount = 0;
  for (const id of chromeIds) {
    if (desktopIds.has(id)) commonFolderCount += 1;
  }
  const chromeRowCount = Number(chromeRegistry && chromeRegistry.rowCount || chromeRows.length || 0);
  const desktopRowCount = Number(desktopRegistry && desktopRegistry.rowCount || desktopRows.length || 0);
  return {
    chromeRowCount,
    desktopRowCount,
    rowCountMatch: chromeRowCount === desktopRowCount,
    commonFolderCount,
    chromeOnlyCount: [...chromeIds].filter((id) => !desktopIds.has(id)).length,
    desktopOnlyCount: [...desktopIds].filter((id) => !chromeIds.has(id)).length,
  };
}

async function run(options) {
  const token = uniqueToken();
  const createdName = options.createdName || `zz-5c-mutation-${token}`;
  const renamedName = options.renamedName || `zz-5c-desktop-renamed-${token}`;
  const stepResults = [];
  const warnings = [];
  const blockers = [];

  const create = await runStep(stepResults, 'chrome-create-folder', 'Chrome createFolder', 'chrome-studio', CHROME_HELPER,
    buildChromeArgs(options, 'createFolder', { name: createdName, color: options.initialColor, reason: 'mutation-smoke-chrome-create' }),
    options.timeoutMs,
    expectOk('chrome-create-folder'));
  const folderId = create.summary.folderId;
  if (!folderId) blockers.push('created-folder-id-missing');

  await runStep(stepResults, 'chrome-export-created', 'Chrome export created folder', 'chrome-studio', CHROME_HELPER,
    buildChromeArgs(options, 'syncNow', { direction: 'chrome-to-desktop', reason: 'mutation-smoke-chrome-export-created' }),
    options.timeoutMs,
    expectOk('chrome-export-created'));

  if (folderId) {
    await runStep(stepResults, 'desktop-verify-created', 'Desktop verify Chrome-created folder', 'desktop-studio', DESKTOP_HELPER,
      buildDesktopArgs(options, 'verifyFolderVisible', { folderId, name: createdName }),
      options.timeoutMs,
      expectVisible(folderId, createdName, options.initialColor));

    await runStep(stepResults, 'desktop-rename-folder', 'Desktop rename folder', 'desktop-studio', DESKTOP_HELPER,
      buildDesktopArgs(options, 'renameFolder', { folderId, name: renamedName, reason: 'mutation-smoke-desktop-rename' }),
      options.timeoutMs,
      expectOk('desktop-rename-folder'));

    await runStep(stepResults, 'desktop-export-rename', 'Desktop export rename', 'desktop-studio', DESKTOP_HELPER,
      buildDesktopArgs(options, 'syncNow', { direction: 'desktop-to-chrome', reason: 'mutation-smoke-desktop-export-rename' }),
      options.timeoutMs,
      expectOk('desktop-export-rename'));

    await runStep(stepResults, 'chrome-import-rename', 'Chrome import rename', 'chrome-studio', CHROME_HELPER,
      buildChromeArgs(options, 'syncNow', { direction: 'desktop-to-chrome', reason: 'mutation-smoke-chrome-import-rename' }),
      options.timeoutMs,
      expectOk('chrome-import-rename'));

    await runStep(stepResults, 'chrome-verify-rename', 'Chrome verify rename', 'chrome-studio', CHROME_HELPER,
      buildChromeArgs(options, 'verifyFolderVisible', { folderId, name: renamedName }),
      options.timeoutMs,
      expectVisible(folderId, renamedName, options.initialColor));

    await runStep(stepResults, 'chrome-set-color', 'Chrome set color', 'chrome-studio', CHROME_HELPER,
      buildChromeArgs(options, 'setFolderColor', { folderId, color: options.chromeColor, reason: 'mutation-smoke-chrome-set-color' }),
      options.timeoutMs,
      expectVisible(folderId, renamedName, options.chromeColor));

    await runStep(stepResults, 'chrome-export-color', 'Chrome export color', 'chrome-studio', CHROME_HELPER,
      buildChromeArgs(options, 'syncNow', { direction: 'chrome-to-desktop', reason: 'mutation-smoke-chrome-export-color' }),
      options.timeoutMs,
      expectOk('chrome-export-color'));

    await runStep(stepResults, 'desktop-verify-chrome-color', 'Desktop verify Chrome color', 'desktop-studio', DESKTOP_HELPER,
      buildDesktopArgs(options, 'verifyFolderVisible', { folderId, name: renamedName }),
      options.timeoutMs,
      expectVisible(folderId, renamedName, options.chromeColor));

    await runStep(stepResults, 'desktop-set-color', 'Desktop set color', 'desktop-studio', DESKTOP_HELPER,
      buildDesktopArgs(options, 'setFolderColor', { folderId, color: options.desktopColor, reason: 'mutation-smoke-desktop-set-color' }),
      options.timeoutMs,
      expectOk('desktop-set-color'));

    await runStep(stepResults, 'desktop-verify-local-color', 'Desktop verify local color', 'desktop-studio', DESKTOP_HELPER,
      buildDesktopArgs(options, 'verifyFolderVisible', { folderId, name: renamedName }),
      options.timeoutMs,
      expectVisible(folderId, renamedName, options.desktopColor));

    await runStep(stepResults, 'desktop-export-final-color', 'Desktop export final color', 'desktop-studio', DESKTOP_HELPER,
      buildDesktopArgs(options, 'syncNow', { direction: 'desktop-to-chrome', reason: 'mutation-smoke-desktop-export-final-color' }),
      options.timeoutMs,
      expectOk('desktop-export-final-color'));

    await runStep(stepResults, 'chrome-import-final-color', 'Chrome import final color', 'chrome-studio', CHROME_HELPER,
      buildChromeArgs(options, 'syncNow', { direction: 'desktop-to-chrome', reason: 'mutation-smoke-chrome-import-final-color' }),
      options.timeoutMs,
      expectOk('chrome-import-final-color'));

    await runStep(stepResults, 'chrome-verify-final-color', 'Chrome verify final color', 'chrome-studio', CHROME_HELPER,
      buildChromeArgs(options, 'verifyFolderVisible', { folderId, name: renamedName }),
      options.timeoutMs,
      expectVisible(folderId, renamedName, options.desktopColor));

    const finalDesktop = await runStep(stepResults, 'desktop-final-parity-check', 'Desktop final parity check', 'desktop-studio', DESKTOP_HELPER,
      buildDesktopArgs(options, 'verifyFolderVisible', { folderId, name: renamedName }),
      options.timeoutMs,
      expectVisible(folderId, renamedName, options.desktopColor));
    const finalChrome = stepResults.find((step) => step.key === 'chrome-verify-final-color');
    const comparison = finalComparison(finalChrome, finalDesktop.step);
    if (!comparison.folderIdMatch) blockers.push('final-folder-id-mismatch');
    if (!comparison.nameMatch) blockers.push('final-folder-name-mismatch');
    if (!comparison.colorMatch) blockers.push('final-folder-color-mismatch');

    const chromeFinalModel = await runStep(stepResults, 'chrome-final-folder-model', 'Chrome final getFolderModel', 'chrome-studio', CHROME_HELPER,
      buildChromeArgs(options, 'getFolderModel', { reason: 'mutation-smoke-final-chrome-model' }),
      options.timeoutMs,
      expectOk('chrome-final-folder-model'));
    const desktopFinalModel = await runStep(stepResults, 'desktop-final-folder-model', 'Desktop final getFolderModel', 'desktop-studio', DESKTOP_HELPER,
      buildDesktopArgs(options, 'getFolderModel', { reason: 'mutation-smoke-final-desktop-model' }),
      options.timeoutMs,
      expectOk('desktop-final-folder-model'));
    comparison.model = compareFolderModels(chromeFinalModel.summary.raw, desktopFinalModel.summary.raw);
    if (!comparison.model.rowCountMatch) blockers.push('final-row-count-mismatch');
    if (comparison.model.chromeOnlyCount !== 0) blockers.push('final-chrome-only-folders');
    if (comparison.model.desktopOnlyCount !== 0) blockers.push('final-desktop-only-folders');
  }

  for (const step of stepResults) {
    for (const blocker of step.blockers || []) blockers.push(blocker);
    for (const warning of step.warnings || []) warnings.push(warning);
  }
  const deferredWarnings = collectDeferredWarnings(stepResults);
  const uniqueBlockers = [...new Set(blockers.filter(Boolean))];
  const uniqueWarnings = [...new Set(warnings.filter(Boolean))];
  const ok = uniqueBlockers.length === 0;
  return result(ok ? 'mutation-smoke-passed' : 'mutation-smoke-blocked', {
    ok,
    folderId: folderId || '',
    createdName,
    renamedName,
    initialColor: options.initialColor,
    chromeColor: options.chromeColor,
    desktopColor: options.desktopColor,
    blockers: uniqueBlockers,
    warnings: uniqueWarnings,
    deferredWarnings,
    deferredWarningsNonBlocking: deferredWarnings.length > 0 && uniqueBlockers.length === 0,
    stepResults,
    inputs: {
      chromePort: options.chromePort,
      chromeMode: options.chromeMode,
      timeoutMs: options.timeoutMs,
      allowMutation: options.allowMutation,
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
      allowMutation: false,
      mutationAllowed: false,
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
  printJson(result('mutation-smoke-runner-threw', {
    ok: false,
    error: String(error && error.message || error),
    blockers: ['mutation-smoke-runner-threw'],
  }));
  process.exitCode = 1;
});
