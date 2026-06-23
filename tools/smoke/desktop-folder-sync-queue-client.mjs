#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const SCHEMA = 'h2o.studio.desktop-queue-smoke-client.result.v1';
const PHASE = 'folder-sync-rc-smoke-desktop-queue-client';
const SMOKE_ROOT = '/Users/hobayda/H2O Studio Sync/.h2o-smoke';
const COMMAND_PATH = '/Users/hobayda/H2O Studio Sync/.h2o-smoke/desktop-command.json';
const RESULTS_DIR = '/Users/hobayda/H2O Studio Sync/.h2o-smoke/results';
const READ_ONLY_OPS = Object.freeze(['diagnoseHealth', 'getFolderModel']);
const READ_ONLY_OP_SET = new Set(READ_ONLY_OPS);
const DEFAULT_TIMEOUT_MS = 30000;
const POLL_INTERVAL_MS = 250;

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
    commandPathScoped: COMMAND_PATH === `${SMOKE_ROOT}/desktop-command.json`,
    resultPathScoped: RESULTS_DIR === `${SMOKE_ROOT}/results`,
  };
}

function result(status, extra = {}) {
  return {
    schema: SCHEMA,
    phase: PHASE,
    ok: extra.ok === true,
    status,
    observedAt: nowIso(),
    commandPath: COMMAND_PATH,
    resultsDir: RESULTS_DIR,
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
    '  node tools/smoke/desktop-folder-sync-queue-client.mjs --op diagnoseHealth --timeout-ms 30000',
    '  node tools/smoke/desktop-folder-sync-queue-client.mjs --op getFolderModel --timeout-ms 30000',
    '',
    'Slice 4B supports read-only ops only: diagnoseHealth, getFolderModel.',
  ].join('\n');
}

function parseArgs(argv) {
  const options = {
    op: 'diagnoseHealth',
    commandId: '',
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
    if (key === 'op') options.op = String(value);
    else if (key === 'command-id') options.commandId = String(value);
    else if (key === 'timeout-ms') options.timeoutMs = Number(value);
    else throw new Error(`unknown option: --${key}`);
  }
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0) throw new Error('invalid --timeout-ms');
  if (!/^[A-Za-z0-9._:-]{1,120}$/.test(options.op)) throw new Error('invalid --op');
  if (options.commandId && !/^[A-Za-z0-9._:@-]{1,180}$/.test(options.commandId)) {
    throw new Error('invalid --command-id');
  }
  return options;
}

function safeFileToken(value, fallback = 'command') {
  const token = String(value || '').trim().replace(/[^A-Za-z0-9._:@-]/g, '-').slice(0, 180);
  return token || fallback;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resultPathForCommand(commandId) {
  return path.join(RESULTS_DIR, `${safeFileToken(commandId)}.json`);
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
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

function buildCommand(options) {
  const op = String(options.op || '').trim();
  const commandId = options.commandId || `desktop-${op}-${Date.now().toString(36)}`;
  const createdAt = nowIso();
  return {
    commandId,
    op,
    createdAt,
    surface: 'desktop-studio',
    payload: {
      commandId,
      op,
      createdAt,
      expectedSurface: 'desktop-studio',
      reason: 'desktop-queue-smoke-client',
    },
  };
}

async function waitForResult(commandId, timeoutMs, preExistingMtimeMs) {
  const resultPath = resultPathForCommand(commandId);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const stat = fs.statSync(resultPath);
      if (!preExistingMtimeMs || stat.mtimeMs > preExistingMtimeMs) {
        return {
          resultPath,
          result: readJsonFile(resultPath),
        };
      }
    } catch (error) {
      if (error && error.code !== 'ENOENT') throw error;
    }
    await sleep(POLL_INTERVAL_MS);
  }
  return null;
}

async function run(options) {
  if (!READ_ONLY_OP_SET.has(options.op)) {
    return result('op-not-read-only', {
      ok: false,
      op: options.op,
      allowlist: READ_ONLY_OPS,
      blockers: ['op-not-read-only'],
    });
  }

  const command = buildCommand(options);
  const resultPath = resultPathForCommand(command.commandId);
  let preExistingMtimeMs = 0;
  try {
    preExistingMtimeMs = fs.statSync(resultPath).mtimeMs || 0;
  } catch (_) {
    preExistingMtimeMs = 0;
  }

  fs.mkdirSync(SMOKE_ROOT, { recursive: true });
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  fs.writeFileSync(COMMAND_PATH, `${JSON.stringify(command, null, 2)}\n`, 'utf8');

  const observed = await waitForResult(command.commandId, options.timeoutMs, preExistingMtimeMs);
  if (!observed) {
    return result('desktop-queue-timeout', {
      ok: false,
      op: command.op,
      commandId: command.commandId,
      resultPath,
      timeoutMs: options.timeoutMs,
      blockers: ['desktop-queue-timeout'],
      nextAction: 'Open Desktop Studio with ?h2oSmokeBridge=folder-sync-rc, set localStorage h2o:studio:smoke-bridge:enabled:v1 to folder-sync-rc, and confirm H2O.Studio.devSmoke.folderSyncQueue.diagnose().started is true.',
    });
  }

  const queueResult = redactValue(observed.result);
  return result(queueResult && queueResult.status || 'desktop-queue-result', {
    ok: !!(queueResult && queueResult.ok === true),
    op: command.op,
    commandId: command.commandId,
    createdAt: command.createdAt,
    resultPath: observed.resultPath,
    result: queueResult,
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
  printJson(result('desktop-queue-client-threw', {
    ok: false,
    error: String(error && error.message || error),
    blockers: ['desktop-queue-client-threw'],
  }));
  process.exitCode = 1;
});
