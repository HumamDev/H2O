#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');

const SCHEMA = 'h2o.studio.local-folder-delete-restore-smoke.result.v1';
const PHASE = 'phase4d.4-delete-restore-smoke-runner';
const CHROME_HELPER = 'tools/smoke/chrome-cdp-studio.mjs';
const DESKTOP_HELPER = 'tools/smoke/desktop-folder-sync-queue-client.mjs';
const DEFAULT_CHROME_PORT = 9247;
const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_COLOR = '#38BDF8';
const VERIFY_RETRY_INTERVAL_MS = 2000;
const LOCAL_SYNC_DIR = '/Users/hobayda/H2O Studio Sync';
const CHROME_LATEST_PATH = path.join(LOCAL_SYNC_DIR, 'chrome-latest.json');

function nowIso() {
  return new Date().toISOString();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
    '  node tools/smoke/local-folder-delete-restore-smoke-runner.mjs --allow-mutation --chrome-port 9247 --timeout-ms 30000',
    '',
    'Runs the local Chrome->Desktop delete request plus Desktop restore receipt lifecycle smoke.',
    'Requires the gated Chrome CDP helper and Desktop file-command queue to be enabled.',
    'Does not run hard delete, purge, raw SQL, chat deletion, snapshot deletion, or Chrome tombstone apply/create.',
  ].join('\n');
}

function parseArgs(argv) {
  const options = {
    allowMutation: false,
    chromePort: DEFAULT_CHROME_PORT,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    folderName: '',
    color: DEFAULT_COLOR,
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
    else if (key === 'timeout-ms') options.timeoutMs = Number(value);
    else if (key === 'folder-name') options.folderName = String(value);
    else if (key === 'color') options.color = normalizeColor(value);
    else if (key === 'allow-mutation') options.allowMutation = value !== 'false';
    else throw new Error(`unknown option: --${key}`);
  }
  if (options.help) return options;
  if (options.allowMutation !== true) throw new Error('delete/restore runner requires --allow-mutation');
  if (!Number.isFinite(options.chromePort) || options.chromePort <= 0) throw new Error('invalid --chrome-port');
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0) throw new Error('invalid --timeout-ms');
  if (!/^#[0-9A-F]{6}$/.test(options.color)) throw new Error('invalid --color');
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

function readJsonFile(filePath) {
  try {
    return {
      ok: true,
      path: filePath,
      value: JSON.parse(fs.readFileSync(filePath, 'utf8')),
    };
  } catch (error) {
    return {
      ok: false,
      path: filePath,
      error: String(error && error.message || error),
      value: null,
    };
  }
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

function rowOf(value) {
  return value && value.row && typeof value.row === 'object' ? value.row : null;
}

function folderIdOf(value) {
  const row = rowOf(value);
  return String(value && (value.folderId || value.id || value.recordId) || row && (row.folderId || row.id) || '').trim();
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
    requestId: String(registry && (registry.requestId || registry.reviewId) || '').trim(),
    reviewId: String(registry && (registry.reviewId || registry.requestId) || '').trim(),
    tombstoneId: String(registry && registry.tombstoneId || '').trim(),
    chatCount: Number(registry && registry.chatCount),
    snapshotCount: Number(registry && registry.snapshotCount),
    folderDeleteRequestExport: registry && registry.folderDeleteRequestExport || null,
    blockers: [...codeList(helper && helper.blockers), ...codeList(registry && registry.blockers)],
    warnings: [...codeList(helper && helper.warnings), ...codeList(registry && registry.warnings)],
    raw: helper,
    registry,
  };
}

function buildChromeArgs(options, op, payload, allowMutation = true) {
  const args = [
    '--mode', 'attach',
    '--port', String(options.chromePort),
    '--op', op,
    '--payload-json', JSON.stringify(payload || {}),
    '--timeout-ms', String(options.timeoutMs),
  ];
  if (allowMutation) args.splice(6, 0, '--allow-mutation');
  return args;
}

function buildDesktopArgs(options, op, payload, allowMutation = true, timeoutMs = options.timeoutMs) {
  const args = [
    '--op', op,
    '--payload-json', JSON.stringify(payload || {}),
    '--timeout-ms', String(timeoutMs),
  ];
  if (allowMutation) args.splice(2, 0, '--allow-mutation');
  return args;
}

function recordStep(stepResults, key, label, surface, runResult, check, retry = null) {
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
    requestId: summary.requestId,
    reviewId: summary.reviewId,
    tombstoneId: summary.tombstoneId,
    chatCount: Number.isFinite(summary.chatCount) ? summary.chatCount : null,
    snapshotCount: Number.isFinite(summary.snapshotCount) ? summary.snapshotCount : null,
    folderDeleteRequestExport: summary.folderDeleteRequestExport,
    diagnostics: checkResult.diagnostics && typeof checkResult.diagnostics === 'object' ? redactValue(checkResult.diagnostics) : null,
    blockers,
    warnings,
    startedAt: runResult.startedAt,
    completedAt: runResult.completedAt,
    helper: summary.raw,
  };
  if (retry) step.retry = retry;
  stepResults.push(step);
  return { runResult, summary, step };
}

async function runStep(stepResults, key, label, surface, helperPath, args, timeoutMs, check) {
  const runResult = await execNodeJson(label, helperPath, args, timeoutMs);
  return recordStep(stepResults, key, label, surface, runResult, check);
}

async function runRetriedStep(stepResults, key, label, surface, helperPath, args, timeoutMs, check, options = {}) {
  const startedAt = nowIso();
  const deadline = Date.now() + timeoutMs;
  const attempts = [];
  const perAttemptTimeoutMs = Number.isFinite(options.perAttemptTimeoutMs)
    ? Math.max(1, options.perAttemptTimeoutMs)
    : Math.min(timeoutMs, 10000);
  let finalRunResult = null;
  let finalSummary = null;
  let finalCheckResult = null;
  let attempt = 0;
  while (Date.now() < deadline) {
    attempt += 1;
    finalRunResult = await execNodeJson(`${label} attempt ${attempt}`, helperPath, args, perAttemptTimeoutMs);
    finalSummary = helperSummary(finalRunResult);
    finalCheckResult = typeof check === 'function' ? check(finalSummary) : { ok: finalSummary.helperOk && finalSummary.registryOk };
    attempts.push({
      attempt,
      ok: finalCheckResult.ok === true,
      status: finalSummary.registryStatus || finalSummary.status,
      folderId: finalSummary.folderId,
      name: finalSummary.name,
      color: finalSummary.color,
      blockers: [...finalSummary.blockers, ...codeList(finalCheckResult.blockers)],
      warnings: [...finalSummary.warnings, ...codeList(finalCheckResult.warnings)],
      startedAt: finalRunResult.startedAt,
      completedAt: finalRunResult.completedAt,
    });
    if (finalCheckResult.ok === true) break;
    const remainingMs = deadline - Date.now();
    if (remainingMs <= VERIFY_RETRY_INTERVAL_MS) break;
    await sleep(Math.min(VERIFY_RETRY_INTERVAL_MS, remainingMs));
  }
  return recordStep(stepResults, key, label, surface, finalRunResult, check, {
    startedAt,
    completedAt: nowIso(),
    attemptCount: attempts.length,
    intervalMs: VERIFY_RETRY_INTERVAL_MS,
    perAttemptTimeoutMs,
    attempts,
  });
}

function expectOk(key) {
  return (summary) => {
    if (summary.helperOk && summary.registryOk) return { ok: true };
    return { ok: false, blockers: [`${key}-not-ok`] };
  };
}

function expectDeleteRequestExported(key) {
  return (summary) => {
    const blockers = [];
    if (!summary.helperOk || !summary.registryOk) blockers.push(`${key}-not-ok`);
    const exportSummary = summary.folderDeleteRequestExport || {};
    if (Number(exportSummary.requestCount || 0) < 1) blockers.push('folder-delete-request-export-missing');
    return { ok: blockers.length === 0, blockers };
  };
}

function identityMatches(row, requestId, folderId) {
  if (!row || typeof row !== 'object') return false;
  const rowRequestId = String(row.requestId || row.reviewId || '').trim();
  const rowReviewId = String(row.reviewId || row.requestId || '').trim();
  const rowFolderId = String(row.folderId || row.recordId || '').replace(/^folder:/, '').trim();
  const requestMatches = requestId ? rowRequestId === requestId || rowReviewId === requestId : true;
  const folderMatches = folderId ? rowFolderId === folderId : true;
  return requestMatches && folderMatches;
}

function requestStatusOf(row) {
  if (!row || typeof row !== 'object') return '';
  const payload = row.payload && typeof row.payload === 'object' ? row.payload : null;
  return String(row.status || payload && payload.status || '').trim();
}

function requestDecisionOf(row) {
  if (!row || typeof row !== 'object') return '';
  const payload = row.result && typeof row.result === 'object' ? row.result : null;
  return String(row.decision || payload && payload.decision || '').trim();
}

function findExactRequest(rows, requestId, folderId) {
  const list = Array.isArray(rows) ? rows : [];
  return list.find((row) => identityMatches(row, requestId, folderId)) ||
    list.find((row) => identityMatches(row, requestId, '')) ||
    list.find((row) => identityMatches(row, '', folderId)) ||
    null;
}

function collectRequestObjects(value, pathName = '', output = []) {
  if (!value || typeof value !== 'object') return output;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => collectRequestObjects(entry, `${pathName}[${index}]`, output));
    return output;
  }
  const schema = String(value.schema || '').trim();
  if (schema === 'h2o.studio.folder-delete-request.v1' || value.intent === 'folder-soft-delete-request') {
    output.push({ path: pathName || '$', value });
  }
  for (const [key, entry] of Object.entries(value)) {
    if (entry && typeof entry === 'object') collectRequestObjects(entry, pathName ? `${pathName}.${key}` : key, output);
  }
  return output;
}

function inspectChromeLatestForRequest(requestId, folderId) {
  const file = readJsonFile(CHROME_LATEST_PATH);
  const diagnostics = {
    chromeLatestPath: CHROME_LATEST_PATH,
    chromeLatestReadable: file.ok === true,
    chromeLatestHasRequest: false,
    chromeLatestRequestPath: '',
    chromeLatestRequestCount: 0,
    chromeLatestRequestStatus: '',
    chromeLatestRequestDecision: '',
    requestId,
    folderId,
  };
  if (!file.ok) {
    diagnostics.chromeLatestError = file.error;
    return diagnostics;
  }
  const requests = collectRequestObjects(file.value);
  diagnostics.chromeLatestRequestCount = requests.length;
  const exact = requests.find((entry) => identityMatches(entry.value, requestId, folderId)) ||
    requests.find((entry) => identityMatches(entry.value, requestId, '')) ||
    requests.find((entry) => identityMatches(entry.value, '', folderId));
  if (exact) {
    diagnostics.chromeLatestHasRequest = true;
    diagnostics.chromeLatestRequestPath = exact.path;
    diagnostics.chromeLatestRequestStatus = requestStatusOf(exact.value);
    diagnostics.chromeLatestRequestDecision = requestDecisionOf(exact.value);
  }
  return diagnostics;
}

function expectVisible(folderId, expectedName = '', expectedColor = '') {
  return (summary) => {
    const blockers = [];
    if (!summary.helperOk || !summary.registryOk) blockers.push('verify-not-ok');
    if (summary.folderId !== folderId) blockers.push('folder-id-mismatch');
    if (expectedName && summary.name !== expectedName) blockers.push('folder-name-mismatch');
    if (expectedColor && summary.color !== normalizeColor(expectedColor)) blockers.push('folder-color-mismatch');
    return { ok: blockers.length === 0, blockers };
  };
}

function expectHidden(folderId) {
  return (summary) => {
    const blockers = [];
    if (!summary.helperOk || !summary.registryOk) blockers.push('verify-not-ok');
    if (summary.folderId && summary.folderId !== folderId) blockers.push('folder-id-mismatch');
    const visible = summary.registry && summary.registry.visible === true;
    const status = String(summary.registryStatus || summary.status || '');
    const acceptedHiddenStatus = status === 'folder-hidden' || status === 'folder-hidden-or-missing';
    if (visible) blockers.push('folder-still-visible');
    if (!acceptedHiddenStatus && visible !== false) blockers.push('folder-hidden-state-unconfirmed');
    return { ok: blockers.length === 0, blockers };
  };
}

function extractRequests(registry) {
  return asArray(registry && registry.requests);
}

function extractRecentlyDeletedRows(registry) {
  return asArray(registry && (registry.rows || registry.items || registry.list));
}

function findRequest(summary, folderId) {
  return extractRequests(summary.registry).find((row) => {
    return row && (row.folderId === folderId || row.recordId === folderId || row.recordId === `folder:${folderId}`);
  }) || null;
}

function findRecentRow(summary, folderId) {
  return extractRecentlyDeletedRows(summary.registry).find((row) => {
    return row && (row.folderId === folderId || row.recordId === folderId || row.recordId === `folder:${folderId}`);
  }) || null;
}

function countDiagnostics(before, after, surface) {
  const chatBefore = Number.isFinite(before && before.chatCount) ? before.chatCount : null;
  const chatAfter = Number.isFinite(after && after.chatCount) ? after.chatCount : null;
  const snapshotBefore = Number.isFinite(before && before.snapshotCount) ? before.snapshotCount : null;
  const snapshotAfter = Number.isFinite(after && after.snapshotCount) ? after.snapshotCount : null;
  const chatDelta = chatBefore === null || chatAfter === null ? null : chatAfter - chatBefore;
  const snapshotDelta = snapshotBefore === null || snapshotAfter === null ? null : snapshotAfter - snapshotBefore;
  return {
    surface,
    chatCountBefore: chatBefore,
    chatCountAfter: chatAfter,
    snapshotCountBefore: snapshotBefore,
    snapshotCountAfter: snapshotAfter,
    chatCountDelta: chatDelta,
    snapshotCountDelta: snapshotDelta,
    chatCountDecreased: chatDelta !== null && chatDelta < 0,
    chatCountIncreased: chatDelta !== null && chatDelta > 0,
    snapshotCountDecreased: snapshotDelta !== null && snapshotDelta < 0,
    snapshotCountIncreased: snapshotDelta !== null && snapshotDelta > 0,
    noChatDelete: chatDelta === null || chatDelta >= 0,
    noSnapshotDelete: snapshotDelta === null || snapshotDelta >= 0,
  };
}

async function run(options) {
  const token = uniqueToken();
  const folderName = options.folderName || `zz-4d4-delete-restore-${token}`;
  const stepResults = [];
  const blockers = [];
  const warnings = [];
  let firstFailedStep = '';
  let folderId = '';
  let reviewId = '';
  let requestId = '';
  let tombstoneId = '';
  let baselineChromeCounts = null;
  let baselineDesktopCounts = null;
  let finalChromeCounts = null;
  let finalDesktopCounts = null;
  let chromeLatestRequestDiagnostics = null;
  let desktopDeleteRequestDiagnostics = null;

  function finish() {
    for (const step of stepResults) {
      for (const blocker of step.blockers || []) blockers.push(blocker);
      for (const warning of step.warnings || []) warnings.push(warning);
    }
    const chromeCounts = countDiagnostics(baselineChromeCounts, finalChromeCounts, 'chrome-studio');
    const desktopCounts = countDiagnostics(baselineDesktopCounts, finalDesktopCounts, 'desktop-studio');
    if (!chromeCounts.noChatDelete || !desktopCounts.noChatDelete) blockers.push('chat-count-changed');
    if (!chromeCounts.noSnapshotDelete || !desktopCounts.noSnapshotDelete) blockers.push('snapshot-count-changed');
    if (chromeCounts.chatCountIncreased) warnings.push('chrome-chat-count-increased');
    if (desktopCounts.chatCountIncreased) warnings.push('desktop-chat-count-increased');
    if (chromeCounts.snapshotCountIncreased) warnings.push('chrome-snapshot-count-increased');
    if (desktopCounts.snapshotCountIncreased) warnings.push('desktop-snapshot-count-increased');
    const deleteImportStep = stepResults.find((step) => step.key === 'chrome-import-delete-receipt');
    const restoreImportStep = stepResults.find((step) => step.key === 'chrome-import-restore-receipt');
    const deleteImport = registryResult(deleteImportStep && deleteImportStep.helper);
    const restoreImport = registryResult(restoreImportStep && restoreImportStep.helper);
    const deleteReceiptImport = deleteImport && deleteImport.folderDeleteReceiptImport || {};
    const restoreReceiptImport = restoreImport && restoreImport.folderRestoreReceiptImport || {};
    const noTombstoneApplyOnChrome = deleteReceiptImport.noTombstoneApply === true &&
      deleteReceiptImport.noTombstoneCreate === true &&
      restoreReceiptImport.noTombstoneApply === true &&
      restoreReceiptImport.noTombstoneCreate === true;
    if (deleteImportStep && deleteImportStep.ok && noTombstoneApplyOnChrome !== true) blockers.push('chrome-tombstone-apply-not-proven-blocked');

    const uniqueBlockers = [...new Set(blockers.filter(Boolean))];
    const uniqueWarnings = [...new Set(warnings.filter(Boolean))];
    const finalChromeVisibleStep = stepResults.find((step) => step.key === 'chrome-verify-restored-visible');
    const finalDesktopVisibleStep = stepResults.find((step) => step.key === 'desktop-verify-restored-visible');
    const chromeHiddenStep = stepResults.find((step) => step.key === 'chrome-verify-hidden');
    const desktopHiddenStep = stepResults.find((step) => step.key === 'desktop-verify-hidden');
    const restoreStep = stepResults.find((step) => step.key === 'desktop-restore-folder');
    const ok = uniqueBlockers.length === 0;
    return result(ok ? 'delete-restore-smoke-passed' : 'delete-restore-smoke-blocked', {
      ok,
      folderId,
      createdOrSelectedFolderName: folderName,
      requestId,
      reviewId,
      tombstoneId,
      deleteRequestCreated: !!requestId || !!reviewId,
      desktopDeleteApplied: !!(desktopHiddenStep && desktopHiddenStep.ok),
      chromeHidden: !!(chromeHiddenStep && chromeHiddenStep.ok),
      desktopRestoreApplied: !!(restoreStep && restoreStep.ok),
      restoreReceiptExported: !!(stepResults.find((step) => step.key === 'desktop-export-restore-receipt') || {}).ok,
      chromeReShown: !!(finalChromeVisibleStep && finalChromeVisibleStep.ok),
      finalChromeVisible: !!(finalChromeVisibleStep && finalChromeVisibleStep.ok),
      finalDesktopVisible: !!(finalDesktopVisibleStep && finalDesktopVisibleStep.ok),
      folderIdMatch: !!(finalChromeVisibleStep && finalDesktopVisibleStep &&
        finalChromeVisibleStep.folderId === folderId &&
        finalDesktopVisibleStep.folderId === folderId),
      noHardDelete: true,
      noPurge: true,
      noChatDelete: chromeCounts.noChatDelete && desktopCounts.noChatDelete,
      noSnapshotDelete: chromeCounts.noSnapshotDelete && desktopCounts.noSnapshotDelete,
      noTombstoneApplyOnChrome,
      chromeLatestHasRequest: !!(chromeLatestRequestDiagnostics && chromeLatestRequestDiagnostics.chromeLatestHasRequest),
      chromeLatestRequestPath: String(chromeLatestRequestDiagnostics && chromeLatestRequestDiagnostics.chromeLatestRequestPath || ''),
      chromeLatestRequestCount: Number(chromeLatestRequestDiagnostics && chromeLatestRequestDiagnostics.chromeLatestRequestCount || 0),
      chromeLatestRequestDiagnostics: chromeLatestRequestDiagnostics || {},
      desktopDeleteRequestImported: !!(desktopDeleteRequestDiagnostics && desktopDeleteRequestDiagnostics.desktopDeleteRequestImported),
      desktopDeleteRequestStatus: String(desktopDeleteRequestDiagnostics && desktopDeleteRequestDiagnostics.desktopDeleteRequestStatus || ''),
      desktopDeleteRequestDecision: String(desktopDeleteRequestDiagnostics && desktopDeleteRequestDiagnostics.desktopDeleteRequestDecision || ''),
      desktopDeleteRequestDiagnostics: desktopDeleteRequestDiagnostics || {},
      baselineChromeChatCount: chromeCounts.chatCountBefore,
      baselineDesktopChatCount: desktopCounts.chatCountBefore,
      finalChromeChatCount: chromeCounts.chatCountAfter,
      finalDesktopChatCount: desktopCounts.chatCountAfter,
      baselineChromeSnapshotCount: chromeCounts.snapshotCountBefore,
      baselineDesktopSnapshotCount: desktopCounts.snapshotCountBefore,
      finalChromeSnapshotCount: chromeCounts.snapshotCountAfter,
      finalDesktopSnapshotCount: desktopCounts.snapshotCountAfter,
      chromeChatCountDelta: chromeCounts.chatCountDelta,
      desktopChatCountDelta: desktopCounts.chatCountDelta,
      chromeSnapshotCountDelta: chromeCounts.snapshotCountDelta,
      desktopSnapshotCountDelta: desktopCounts.snapshotCountDelta,
      chromeCounts,
      desktopCounts,
      folderDeleteReceiptImport: deleteReceiptImport,
      folderRestoreReceiptImport: restoreReceiptImport,
      blockers: uniqueBlockers,
      warnings: uniqueWarnings,
      firstFailedStep,
      steps: stepResults,
      stepResults,
      inputs: {
        chromePort: options.chromePort,
        timeoutMs: options.timeoutMs,
        allowMutation: options.allowMutation,
        verifyRetryIntervalMs: VERIFY_RETRY_INTERVAL_MS,
      },
    });
  }

  function requireStep(completed) {
    if (completed && completed.step && completed.step.ok === true) return false;
    firstFailedStep = completed && completed.step && completed.step.key || 'unknown-step';
    return true;
  }

  const create = await runStep(stepResults, 'chrome-create-folder', 'Chrome create safe smoke folder', 'chrome-studio', CHROME_HELPER,
    buildChromeArgs(options, 'createFolder', { name: folderName, color: options.color, reason: 'phase4d4-delete-restore-chrome-create' }),
    options.timeoutMs,
    expectOk('chrome-create-folder'));
  folderId = create.summary.folderId;
  if (!folderId) blockers.push('created-folder-id-missing');
  if (requireStep(create) || !folderId) return finish();

  const chromeBaseline = await runStep(stepResults, 'chrome-baseline-counts', 'Chrome baseline chat/snapshot counts', 'chrome-studio', CHROME_HELPER,
    buildChromeArgs(options, 'countChatsSnapshots', { reason: 'phase4d4-baseline-chrome-counts' }, false),
    options.timeoutMs,
    expectOk('chrome-baseline-counts'));
  if (chromeBaseline.step.ok) baselineChromeCounts = chromeBaseline.summary;

  const desktopBaseline = await runStep(stepResults, 'desktop-baseline-counts', 'Desktop baseline chat/snapshot counts', 'desktop-studio', DESKTOP_HELPER,
    buildDesktopArgs(options, 'countChatsSnapshots', { reason: 'phase4d4-baseline-desktop-counts' }, false),
    options.timeoutMs,
    expectOk('desktop-baseline-counts'));
  if (desktopBaseline.step.ok) baselineDesktopCounts = desktopBaseline.summary;

  const chromeExportCreated = await runStep(stepResults, 'chrome-export-created', 'Chrome export safe smoke folder', 'chrome-studio', CHROME_HELPER,
    buildChromeArgs(options, 'syncNow', { direction: 'chrome-to-desktop', reason: 'phase4d4-export-created-folder' }),
    options.timeoutMs,
    expectOk('chrome-export-created'));
  if (requireStep(chromeExportCreated)) return finish();

  await runStep(stepResults, 'desktop-import-created', 'Desktop import safe smoke folder', 'desktop-studio', DESKTOP_HELPER,
    buildDesktopArgs(options, 'syncNow', { direction: 'chrome-to-desktop', reason: 'phase4d4-import-created-folder' }),
    options.timeoutMs,
    expectOk('desktop-import-created'));

  const desktopVerifyCreated = await runRetriedStep(stepResults, 'desktop-verify-created-visible', 'Desktop verify safe smoke folder visible', 'desktop-studio', DESKTOP_HELPER,
    buildDesktopArgs(options, 'verifyFolderVisible', { folderId, name: folderName }),
    options.timeoutMs,
    expectVisible(folderId, folderName, options.color));
  if (requireStep(desktopVerifyCreated)) return finish();

  const deleteRequest = await runStep(stepResults, 'chrome-request-delete', 'Chrome request folder delete', 'chrome-studio', CHROME_HELPER,
    buildChromeArgs(options, 'requestFolderDelete', { folderId, folderName, reason: 'phase4d4-delete-restore-request-delete' }),
    options.timeoutMs,
    expectOk('chrome-request-delete'));
  requestId = deleteRequest.summary.requestId;
  reviewId = deleteRequest.summary.reviewId;
  if (requireStep(deleteRequest)) return finish();

  const chromeExportDeleteRequest = await runStep(stepResults, 'chrome-export-delete-request', 'Chrome export delete request', 'chrome-studio', CHROME_HELPER,
    buildChromeArgs(options, 'syncNow', { direction: 'chrome-to-desktop', reason: 'phase4d4-export-delete-request' }),
    options.timeoutMs,
    (summary) => {
      const base = expectDeleteRequestExported('chrome-export-delete-request')(summary);
      chromeLatestRequestDiagnostics = inspectChromeLatestForRequest(requestId || reviewId, folderId);
      const blockers = [...codeList(base.blockers)];
      if (chromeLatestRequestDiagnostics.chromeLatestHasRequest !== true) blockers.push('chrome-delete-request-not-exported');
      return {
        ok: blockers.length === 0,
        blockers,
        warnings: codeList(base.warnings),
        diagnostics: {
          ...chromeLatestRequestDiagnostics,
          folderDeleteRequestExport: summary.folderDeleteRequestExport || {},
        },
      };
    });
  if (requireStep(chromeExportDeleteRequest)) return finish();

  await runStep(stepResults, 'desktop-import-delete-request', 'Desktop import delete request', 'desktop-studio', DESKTOP_HELPER,
    buildDesktopArgs(options, 'syncNow', { direction: 'chrome-to-desktop', reason: 'phase4d4-import-delete-request' }),
    options.timeoutMs,
    expectOk('desktop-import-delete-request'));

  const listRequests = await runRetriedStep(stepResults, 'desktop-list-delete-request', 'Desktop list pending delete request', 'desktop-studio', DESKTOP_HELPER,
    buildDesktopArgs(options, 'listFolderDeleteRequests', { folderId, requestId: requestId || reviewId, status: 'pending', limit: 100 }),
    options.timeoutMs,
    (summary) => {
      const rows = extractRequests(summary.registry);
      const row = findExactRequest(rows, requestId || reviewId, folderId);
      const status = requestStatusOf(row);
      const decision = requestDecisionOf(row);
      desktopDeleteRequestDiagnostics = {
        desktopDeleteRequestImported: !!row,
        desktopDeleteRequestStatus: status,
        desktopDeleteRequestDecision: decision,
        desktopDeleteRequestId: String(row && (row.requestId || row.reviewId) || ''),
        desktopDeleteRequestReviewId: String(row && (row.reviewId || row.requestId) || ''),
        desktopDeleteRequestFolderId: String(row && (row.folderId || row.recordId) || '').replace(/^folder:/, ''),
        requestId: requestId || reviewId,
        folderId,
        listedRequestCount: rows.length,
      };
      const blockers = [];
      if (!summary.helperOk || !summary.registryOk) blockers.push('list-delete-requests-not-ok');
      if (!row) blockers.push('desktop-delete-request-not-imported');
      else if (status !== 'pending') blockers.push('desktop-delete-request-wrong-status');
      return { ok: blockers.length === 0, blockers, diagnostics: desktopDeleteRequestDiagnostics };
    });
  if (requireStep(listRequests)) return finish();
  const matchingRequest = findExactRequest(extractRequests(listRequests.summary.registry), requestId || reviewId, folderId);
  reviewId = reviewId || String(matchingRequest && (matchingRequest.reviewId || matchingRequest.requestId) || '');
  requestId = requestId || String(matchingRequest && (matchingRequest.requestId || matchingRequest.reviewId) || '');

  const desktopApplyDelete = await runStep(stepResults, 'desktop-apply-delete-request', 'Desktop apply delete request', 'desktop-studio', DESKTOP_HELPER,
    buildDesktopArgs(options, 'applyFolderDeleteRequest', { reviewId: reviewId || requestId, requestId: requestId || reviewId, reason: 'phase4d4-apply-delete-request' }),
    options.timeoutMs,
    expectOk('desktop-apply-delete-request'));
  tombstoneId = desktopApplyDelete.summary.tombstoneId;
  if (requireStep(desktopApplyDelete)) return finish();

  const desktopHiddenVerifyTimeoutMs = Math.max(options.timeoutMs, 60000);
  const desktopVerifyHidden = await runRetriedStep(stepResults, 'desktop-verify-hidden', 'Desktop verify folder hidden after soft delete', 'desktop-studio', DESKTOP_HELPER,
    buildDesktopArgs(options, 'verifyFolderHidden', { folderId }, true, desktopHiddenVerifyTimeoutMs),
    desktopHiddenVerifyTimeoutMs,
    expectHidden(folderId),
    { perAttemptTimeoutMs: desktopHiddenVerifyTimeoutMs });
  if (requireStep(desktopVerifyHidden)) return finish();

  const recentlyDeleted = await runRetriedStep(stepResults, 'desktop-list-recently-deleted', 'Desktop list Recently Deleted row', 'desktop-studio', DESKTOP_HELPER,
    buildDesktopArgs(options, 'listRecentlyDeletedFolders', { folderId, limit: 500 }, false),
    options.timeoutMs,
    (summary) => {
      const row = findRecentRow(summary, folderId);
      const blockers = [];
      if (!summary.helperOk || !summary.registryOk) blockers.push('recently-deleted-not-ok');
      if (!row) blockers.push('recently-deleted-row-missing');
      if (row && row.restoreAvailable !== true && row.restoreStatus !== 'active') blockers.push('restore-not-available');
      return { ok: blockers.length === 0, blockers };
    });
  if (requireStep(recentlyDeleted)) return finish();
  const recentRow = findRecentRow(recentlyDeleted.summary, folderId);
  tombstoneId = tombstoneId || String(recentRow && recentRow.tombstoneId || '');

  const desktopExportDeleteReceipt = await runStep(stepResults, 'desktop-export-delete-receipt', 'Desktop export delete receipt', 'desktop-studio', DESKTOP_HELPER,
    buildDesktopArgs(options, 'syncNow', { direction: 'desktop-to-chrome', reason: 'phase4d4-export-delete-receipt' }),
    options.timeoutMs,
    expectOk('desktop-export-delete-receipt'));
  if (requireStep(desktopExportDeleteReceipt)) return finish();

  const chromeImportDeleteReceipt = await runStep(stepResults, 'chrome-import-delete-receipt', 'Chrome import delete receipt and hide', 'chrome-studio', CHROME_HELPER,
    buildChromeArgs(options, 'syncNow', {
      direction: 'desktop-to-chrome',
      reason: 'phase4d4-import-delete-receipt-hide',
      conflictDecision: 'approve-merge',
    }),
    options.timeoutMs,
    expectOk('chrome-import-delete-receipt'));
  if (requireStep(chromeImportDeleteReceipt)) return finish();

  const chromeVerifyHidden = await runRetriedStep(stepResults, 'chrome-verify-hidden', 'Chrome verify visible-state hide', 'chrome-studio', CHROME_HELPER,
    buildChromeArgs(options, 'verifyFolderHidden', { folderId }),
    options.timeoutMs,
    expectHidden(folderId));
  if (requireStep(chromeVerifyHidden)) return finish();

  const desktopRestore = await runStep(stepResults, 'desktop-restore-folder', 'Desktop restore folder from tombstone', 'desktop-studio', DESKTOP_HELPER,
    buildDesktopArgs(options, 'restoreFolder', { tombstoneId, folderId, reason: 'phase4d4-restore-folder' }),
    options.timeoutMs,
    expectOk('desktop-restore-folder'));
  if (requireStep(desktopRestore)) return finish();

  const desktopVerifyRestored = await runRetriedStep(stepResults, 'desktop-verify-restored-visible', 'Desktop verify restored folder visible', 'desktop-studio', DESKTOP_HELPER,
    buildDesktopArgs(options, 'verifyFolderVisible', { folderId, name: folderName }),
    options.timeoutMs,
    expectVisible(folderId, folderName));
  if (requireStep(desktopVerifyRestored)) return finish();

  const desktopExportRestoreReceipt = await runStep(stepResults, 'desktop-export-restore-receipt', 'Desktop export restore receipt', 'desktop-studio', DESKTOP_HELPER,
    buildDesktopArgs(options, 'syncNow', { direction: 'desktop-to-chrome', reason: 'phase4d4-export-restore-receipt' }),
    options.timeoutMs,
    expectOk('desktop-export-restore-receipt'));
  if (requireStep(desktopExportRestoreReceipt)) return finish();

  const chromeImportRestoreReceipt = await runStep(stepResults, 'chrome-import-restore-receipt', 'Chrome import restore receipt and re-show', 'chrome-studio', CHROME_HELPER,
    buildChromeArgs(options, 'syncNow', {
      direction: 'desktop-to-chrome',
      reason: 'phase4d4-import-restore-receipt-reshow',
      conflictDecision: 'approve-merge',
    }),
    options.timeoutMs,
    expectOk('chrome-import-restore-receipt'));
  if (requireStep(chromeImportRestoreReceipt)) return finish();

  const chromeVerifyRestored = await runRetriedStep(stepResults, 'chrome-verify-restored-visible', 'Chrome verify visible-state re-show', 'chrome-studio', CHROME_HELPER,
    buildChromeArgs(options, 'verifyFolderVisible', { folderId, name: folderName }),
    options.timeoutMs,
    expectVisible(folderId, folderName));
  if (requireStep(chromeVerifyRestored)) return finish();

  const chromeFinalCounts = await runStep(stepResults, 'chrome-final-counts', 'Chrome final chat/snapshot counts', 'chrome-studio', CHROME_HELPER,
    buildChromeArgs(options, 'countChatsSnapshots', { reason: 'phase4d4-final-chrome-counts' }, false),
    options.timeoutMs,
    expectOk('chrome-final-counts'));
  if (chromeFinalCounts.step.ok) finalChromeCounts = chromeFinalCounts.summary;

  const desktopFinalCounts = await runStep(stepResults, 'desktop-final-counts', 'Desktop final chat/snapshot counts', 'desktop-studio', DESKTOP_HELPER,
    buildDesktopArgs(options, 'countChatsSnapshots', { reason: 'phase4d4-final-desktop-counts' }, false),
    options.timeoutMs,
    expectOk('desktop-final-counts'));
  if (desktopFinalCounts.step.ok) finalDesktopCounts = desktopFinalCounts.summary;

  return finish();
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
  printJson(result('delete-restore-smoke-runner-threw', {
    ok: false,
    error: String(error && error.message || error),
    blockers: ['delete-restore-smoke-runner-threw'],
  }));
  process.exitCode = 1;
});
