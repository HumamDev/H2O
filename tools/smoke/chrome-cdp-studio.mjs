#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');

const SCHEMA = 'h2o.studio.chrome-cdp-smoke-helper.result.v1';
const PHASE = 'folder-sync-rc-smoke-chrome-cdp-helper';
const DEFAULT_PORT = 9224;
const DEFAULT_PROFILE = '/private/tmp/h2o-folder-sync-smoke-chrome-profile';
const CHROME_DEV_SMOKE_PORT = 9225;
const CHROME_DEV_SMOKE_PROFILE = '/private/tmp/h2o-folder-sync-smoke-chrome-dev-profile';
const CHROME_DEV_PATH = '/Applications/Google Chrome Dev.app/Contents/MacOS/Google Chrome Dev';
const DEFAULT_EXTENSION_ID = 'bpobkkppdlldlkccaehmpfclmkhiemhg';
const DEFAULT_LOAD_EXTENSION = path.join(repoRoot, 'apps/extensions/chatgpt/chrome/studio-launcher');
const URL_FLAG = 'h2oSmokeBridge';
const REQUIRED_VALUE = 'folder-sync-rc';
const OPT_IN_KEY = 'h2o:studio:smoke-bridge:enabled:v1';
const REGISTRY_PATH_LABEL = 'H2O.Studio.devSmoke.folderSync.run';
const REGISTRY_OBJECT_EXPRESSION = 'globalThis.H2O && globalThis.H2O.Studio && globalThis.H2O.Studio.devSmoke && globalThis.H2O.Studio.devSmoke.folderSync';
const GLOBAL_OBJECT_EXPRESSION = 'globalThis';
const REGISTRY_CALL_WRAPPER = 'function(op, payload) { return this.run(op, payload); }';
const REGISTRY_GATES_WRAPPER = 'function() { return this.diagnoseGates ? this.diagnoseGates() : null; }';
const LOCAL_STORAGE_OPT_IN_WRAPPER = "function() { this.localStorage.setItem('h2o:studio:smoke-bridge:enabled:v1', 'folder-sync-rc'); return { href: String(this.location && this.location.href || ''), optIn: this.localStorage.getItem('h2o:studio:smoke-bridge:enabled:v1') }; }";
const READ_ONLY_OPS = Object.freeze(['diagnoseHealth', 'getFolderModel']);
const READ_ONLY_OP_SET = new Set(READ_ONLY_OPS);

function nowIso() {
  return new Date().toISOString();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safetyFlags() {
  return {
    privacy: { redacted: true },
    registryPath: REGISTRY_PATH_LABEL,
    cdpCall: 'fixed-registry-wrapper',
    readOnly: true,
    noArbitraryJsInput: true,
    noProductionListener: true,
    noRawSql: true,
    noHardDelete: true,
    noPurge: true,
    noTombstonePropagationApply: true,
    noChatDelete: true,
    noSnapshotDelete: true,
  };
}

function result(status, extra = {}) {
  return {
    schema: SCHEMA,
    phase: PHASE,
    ok: extra.ok === true,
    status,
    observedAt: nowIso(),
    ...safetyFlags(),
    ...extra,
  };
}

function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function parseArgs(argv) {
  const options = {
    mode: 'attach',
    port: DEFAULT_PORT,
    profile: DEFAULT_PROFILE,
    extensionId: DEFAULT_EXTENSION_ID,
    loadExtension: DEFAULT_LOAD_EXTENSION,
    chromePath: '',
    studioUrl: '',
    op: 'diagnoseHealth',
    commandId: '',
    timeoutMs: 20000,
    waitAfterNavigateMs: 1200,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }
    if (!arg.startsWith('--')) {
      throw new Error(`unexpected argument: ${arg}`);
    }
    const eq = arg.indexOf('=');
    const key = eq >= 0 ? arg.slice(2, eq) : arg.slice(2);
    const value = eq >= 0 ? arg.slice(eq + 1) : argv[++i];
    if (value == null) throw new Error(`missing value for --${key}`);
    if (key === 'mode') options.mode = value;
    else if (key === 'port') options.port = Number(value);
    else if (key === 'profile' || key === 'profile-dir' || key === 'user-data-dir') options.profile = value;
    else if (key === 'extension-id') options.extensionId = value;
    else if (key === 'load-extension' || key === 'extension-path') options.loadExtension = value;
    else if (key === 'chrome-path') options.chromePath = value;
    else if (key === 'studio-url') options.studioUrl = value;
    else if (key === 'op') options.op = value;
    else if (key === 'command-id') options.commandId = value;
    else if (key === 'timeout-ms') options.timeoutMs = Number(value);
    else if (key === 'wait-after-navigate-ms') options.waitAfterNavigateMs = Number(value);
    else throw new Error(`unknown option: --${key}`);
  }
  if (!Number.isFinite(options.port) || options.port <= 0) throw new Error('invalid --port');
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0) throw new Error('invalid --timeout-ms');
  if (!Number.isFinite(options.waitAfterNavigateMs) || options.waitAfterNavigateMs < 0) {
    throw new Error('invalid --wait-after-navigate-ms');
  }
  if (options.mode !== 'attach' && options.mode !== 'launch') throw new Error('invalid --mode');
  return options;
}

function usage() {
  return [
    'Usage:',
    '  node tools/smoke/chrome-cdp-studio.mjs --mode attach --port 9224 --op diagnoseHealth',
    '  node tools/smoke/chrome-cdp-studio.mjs --mode attach --port 9224 --op getFolderModel',
    '  node tools/smoke/chrome-cdp-studio.mjs --mode launch --port 9224 --op diagnoseHealth',
    '',
    'Chrome Dev smoke profile:',
    `  node tools/smoke/chrome-cdp-studio.mjs --mode launch --port ${CHROME_DEV_SMOKE_PORT} --chrome-path "${CHROME_DEV_PATH}" --extension-path "${DEFAULT_LOAD_EXTENSION}" --user-data-dir "${CHROME_DEV_SMOKE_PROFILE}" --op diagnoseHealth`,
    `  node tools/smoke/chrome-cdp-studio.mjs --mode attach --port ${CHROME_DEV_SMOKE_PORT} --op getFolderModel`,
    '',
    'Slice 4A supports read-only ops only: diagnoseHealth, getFolderModel.',
  ].join('\n');
}

function summarizeCdpVersion(version) {
  const v = version && typeof version === 'object' ? version : {};
  return {
    browser: String(v.Browser || ''),
    protocolVersion: String(v['Protocol-Version'] || ''),
    webKitVersion: String(v['WebKit-Version'] || ''),
    userAgent: String(v['User-Agent'] || ''),
    webSocketDebuggerUrl: String(v.webSocketDebuggerUrl || ''),
  };
}

function studioUrlFor(options) {
  const base = options.studioUrl ||
    `chrome-extension://${options.extensionId}/surfaces/studio/studio.html#/saved`;
  const url = new URL(base);
  url.searchParams.set(URL_FLAG, REQUIRED_VALUE);
  return url.toString();
}

function findChromeBinary(explicitPath) {
  if (explicitPath) return explicitPath;
  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Google Chrome Dev.app/Contents/MacOS/Google Chrome Dev',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || '';
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 5000);
  try {
    const response = await fetch(url, {
      method: options.method || 'GET',
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function cdpJson(port, route, options = {}) {
  return fetchJson(`http://127.0.0.1:${port}${route}`, options);
}

async function waitForCdp(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      return await cdpJson(port, '/json/version', { timeoutMs: 1500 });
    } catch (error) {
      lastError = error;
      await sleep(250);
    }
  }
  const detail = lastError && lastError.message ? `: ${lastError.message}` : '';
  throw new Error(`chrome-cdp-unavailable${detail}`);
}

async function probeCdpVersion(port, timeoutMs = 800) {
  try {
    return await cdpJson(port, '/json/version', { timeoutMs });
  } catch (_) {
    return null;
  }
}

function launchChrome(options, url) {
  const chromePath = findChromeBinary(options.chromePath);
  if (!chromePath || !fs.existsSync(chromePath)) {
    throw new Error('chrome-binary-missing');
  }
  const args = [
    `--remote-debugging-port=${options.port}`,
    `--user-data-dir=${options.profile}`,
    '--no-first-run',
    '--no-default-browser-check',
  ];
  if (options.loadExtension && options.loadExtension !== 'none' && fs.existsSync(options.loadExtension)) {
    args.push(`--load-extension=${options.loadExtension}`);
  }
  args.push(url);
  const child = spawn(chromePath, args, {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
  return { chromePath, args };
}

function isStudioTarget(target, options) {
  const url = String(target && target.url || '');
  return target && target.type === 'page' &&
    url.includes(`chrome-extension://${options.extensionId}/`) &&
    url.includes('/surfaces/studio/studio.html');
}

function summarizeTarget(target) {
  const t = target && typeof target === 'object' ? target : {};
  return {
    id: String(t.id || ''),
    type: String(t.type || ''),
    title: String(t.title || ''),
    url: String(t.url || ''),
  };
}

function summarizeTargets(targets, options) {
  const rows = Array.isArray(targets) ? targets.map(summarizeTarget) : [];
  const extensionPrefix = `chrome-extension://${options.extensionId}/`;
  const extensionTargets = rows.filter((target) => target.url.startsWith(extensionPrefix));
  const studioTargets = rows.filter((target) => target.url.startsWith(extensionPrefix) &&
    target.url.includes('/surfaces/studio/studio.html'));
  return {
    targetCount: rows.length,
    extensionTargetFound: extensionTargets.length > 0,
    studioTargetFound: studioTargets.length > 0,
    extensionTargetCount: extensionTargets.length,
    studioTargetCount: studioTargets.length,
    studioTargets,
  };
}

async function openStudioTarget(port, url) {
  const route = `/json/new?${encodeURIComponent(url)}`;
  try {
    return await cdpJson(port, route, { method: 'PUT', timeoutMs: 5000 });
  } catch (_) {
    return cdpJson(port, route, { method: 'GET', timeoutMs: 5000 });
  }
}

async function findOrOpenStudioTarget(options, url) {
  const targets = await cdpJson(options.port, '/json/list', { timeoutMs: 5000 });
  const existing = Array.isArray(targets) ? targets.find((target) => isStudioTarget(target, options)) : null;
  if (existing && existing.webSocketDebuggerUrl) {
    return { target: existing, diagnostics: summarizeTargets(targets, options), opened: false };
  }
  const opened = await openStudioTarget(options.port, url);
  if (opened && opened.webSocketDebuggerUrl && isStudioTarget(opened, options)) {
    return { target: opened, diagnostics: summarizeTargets([opened], options), opened: true };
  }
  const refreshedTargets = await cdpJson(options.port, '/json/list', { timeoutMs: 5000 });
  const refreshed = Array.isArray(refreshedTargets) ? refreshedTargets.find((target) => isStudioTarget(target, options)) : null;
  if (refreshed && refreshed.webSocketDebuggerUrl) {
    return { target: refreshed, diagnostics: summarizeTargets(refreshedTargets, options), opened: true };
  }
  const diagnostics = summarizeTargets(refreshedTargets, options);
  const error = new Error(diagnostics.extensionTargetFound ? 'chrome-studio-target-missing' : 'chrome-extension-not-loaded');
  error.status = error.message;
  error.targetDiagnostics = diagnostics;
  throw error;
}

class CdpClient {
  constructor(webSocketUrl) {
    this.webSocketUrl = webSocketUrl;
    this.nextId = 1;
    this.pending = new Map();
    this.ws = null;
  }

  connect(timeoutMs = 10000) {
    if (typeof WebSocket !== 'function') {
      return Promise.reject(new Error('node-websocket-unavailable'));
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('cdp-websocket-timeout')), timeoutMs);
      const ws = new WebSocket(this.webSocketUrl);
      this.ws = ws;
      ws.addEventListener('open', () => {
        clearTimeout(timer);
        resolve();
      });
      ws.addEventListener('message', (event) => {
        this.handleMessage(event.data);
      });
      ws.addEventListener('error', () => {
        clearTimeout(timer);
        reject(new Error('cdp-websocket-error'));
      }, { once: true });
      ws.addEventListener('close', () => {
        for (const pending of this.pending.values()) pending.reject(new Error('cdp-websocket-closed'));
        this.pending.clear();
      });
    });
  }

  handleMessage(data) {
    let message;
    try {
      message = JSON.parse(String(data || '{}'));
    } catch (_) {
      return;
    }
    if (!message.id) return;
    const pending = this.pending.get(message.id);
    if (!pending) return;
    this.pending.delete(message.id);
    if (message.error) {
      pending.reject(new Error(message.error.message || 'cdp-command-failed'));
    } else {
      pending.resolve(message.result || {});
    }
  }

  send(method, params = {}) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('cdp-websocket-not-open'));
    }
    const id = this.nextId++;
    const message = { id, method, params };
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify(message));
    });
  }

  close() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.close();
  }
}

async function getGlobalObjectId(cdp) {
  const evaluated = await cdp.send('Runtime.evaluate', {
    expression: GLOBAL_OBJECT_EXPRESSION,
    objectGroup: 'h2o-folder-sync-smoke',
    returnByValue: false,
  });
  return evaluated && evaluated.result && evaluated.result.objectId;
}

async function setSmokeOptIn(cdp, globalObjectId) {
  return cdp.send('Runtime.callFunctionOn', {
    objectId: globalObjectId,
    functionDeclaration: LOCAL_STORAGE_OPT_IN_WRAPPER,
    arguments: [],
    awaitPromise: false,
    returnByValue: true,
  });
}

async function getRegistryObjectId(cdp) {
  const evaluated = await cdp.send('Runtime.evaluate', {
    expression: REGISTRY_OBJECT_EXPRESSION,
    objectGroup: 'h2o-folder-sync-smoke',
    returnByValue: false,
  });
  return evaluated && evaluated.result && evaluated.result.objectId;
}

async function waitForRegistryObject(cdp, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const objectId = await getRegistryObjectId(cdp);
    if (objectId) return objectId;
    await sleep(300);
  }
  throw new Error('smoke-registry-unavailable');
}

async function prepareTarget(cdp, url, options) {
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');
  await cdp.send('Page.navigate', { url });
  await sleep(options.waitAfterNavigateMs);
  const globalObjectId = await getGlobalObjectId(cdp);
  if (!globalObjectId) throw new Error('chrome-global-object-missing');
  await setSmokeOptIn(cdp, globalObjectId);
  await cdp.send('Page.navigate', { url });
  await sleep(options.waitAfterNavigateMs);
  return waitForRegistryObject(cdp, options.timeoutMs);
}

async function runReadOnlyRegistryOp(cdp, registryObjectId, op, payload) {
  const called = await cdp.send('Runtime.callFunctionOn', {
    objectId: registryObjectId,
    functionDeclaration: REGISTRY_CALL_WRAPPER,
    arguments: [{ value: op }, { value: payload }],
    awaitPromise: true,
    returnByValue: true,
  });
  if (called.exceptionDetails) throw new Error('smoke-registry-call-threw');
  return called && called.result ? called.result.value : null;
}

async function diagnoseRegistryGates(cdp, registryObjectId) {
  const called = await cdp.send('Runtime.callFunctionOn', {
    objectId: registryObjectId,
    functionDeclaration: REGISTRY_GATES_WRAPPER,
    arguments: [],
    awaitPromise: false,
    returnByValue: true,
  });
  if (called.exceptionDetails) return null;
  return called && called.result ? called.result.value : null;
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

  const url = studioUrlFor(options);
  let launch = null;
  let cdpVersion = null;
  try {
    if (options.mode === 'launch') {
      const existingVersion = await probeCdpVersion(options.port);
      if (existingVersion) {
        return result('chrome-cdp-port-in-use', {
          ok: false,
          mode: options.mode,
          port: options.port,
          browser: summarizeCdpVersion(existingVersion),
          blockers: ['chrome-cdp-port-in-use'],
          nextAction: `Use a free port such as ${CHROME_DEV_SMOKE_PORT}, or run --mode attach if this is the intended browser.`,
        });
      }
      launch = launchChrome(options, url);
    }
    cdpVersion = await waitForCdp(options.port, options.timeoutMs);
  } catch (error) {
    return result('chrome-cdp-unavailable', {
      ok: false,
      mode: options.mode,
      port: options.port,
      error: String(error && error.message || error),
      launch,
      browser: cdpVersion ? summarizeCdpVersion(cdpVersion) : null,
      blockers: ['chrome-cdp-unavailable'],
    });
  }

  let targetBundle;
  let target;
  try {
    targetBundle = await findOrOpenStudioTarget(options, url);
    target = targetBundle.target;
  } catch (error) {
    const status = error && error.status || error && error.message || 'chrome-studio-target-missing';
    const blockers = [status];
    if (status === 'chrome-extension-not-loaded' && options.mode === 'attach') blockers.push('chrome-cdp-attached-to-wrong-browser');
    return result(status, {
      ok: false,
      mode: options.mode,
      port: options.port,
      browser: summarizeCdpVersion(cdpVersion),
      error: String(error && error.message || error),
      blockers,
      targetDiagnostics: error && error.targetDiagnostics || null,
      nextAction: status === 'chrome-extension-not-loaded'
        ? 'Launch Chrome Dev with --extension-path apps/extensions/chatgpt/chrome/studio-launcher and a separate --user-data-dir, or attach to that smoke profile port.'
        : 'Confirm the Studio extension page is open and the extension ID/path are correct.',
    });
  }

  const cdp = new CdpClient(target.webSocketDebuggerUrl);
  try {
    await cdp.connect(options.timeoutMs);
    const registryObjectId = await prepareTarget(cdp, url, options);
    const registryGates = await diagnoseRegistryGates(cdp, registryObjectId);
    const commandId = options.commandId || `chrome-${options.op}-${Date.now().toString(36)}`;
    const payload = {
      commandId,
      createdAt: nowIso(),
      expectedSurface: 'chrome-studio',
      reason: 'chrome-cdp-smoke-helper',
    };
    const registryResult = await runReadOnlyRegistryOp(cdp, registryObjectId, options.op, payload);
    return result(registryResult && registryResult.status || 'registry-result', {
      ok: !!(registryResult && registryResult.ok === true),
      mode: options.mode,
      port: options.port,
      browser: summarizeCdpVersion(cdpVersion),
      op: options.op,
      commandId,
      targetId: target.id || '',
      targetUrl: target.url || url,
      studioTargetFound: true,
      smokeUrlFlagPresent: url.includes(`${URL_FLAG}=${REQUIRED_VALUE}`),
      registryGatesEnabled: registryGates && registryGates.enabled === true,
      registryGates,
      targetDiagnostics: targetBundle && targetBundle.diagnostics || null,
      result: registryResult,
      launch,
    });
  } catch (error) {
    const rawStatus = String(error && error.message || error) || 'chrome-cdp-helper-failed';
    const status = rawStatus === 'smoke-registry-unavailable' ? 'chrome-extension-not-loaded' : rawStatus;
    const blockers = [status];
    if (status === 'chrome-extension-not-loaded' && options.mode === 'attach') blockers.push('chrome-cdp-attached-to-wrong-browser');
    return result(status, {
      ok: false,
      mode: options.mode,
      port: options.port,
      browser: summarizeCdpVersion(cdpVersion),
      op: options.op,
      targetId: target && target.id || '',
      targetUrl: target && target.url || url,
      studioTargetFound: !!target,
      smokeUrlFlagPresent: url.includes(`${URL_FLAG}=${REQUIRED_VALUE}`),
      targetDiagnostics: targetBundle && targetBundle.diagnostics || null,
      blockers,
      rawErrorStatus: rawStatus,
      error: String(error && error.message || error),
      nextAction: status === 'chrome-extension-not-loaded'
        ? 'Confirm Chrome Dev was launched with --extension-path and the prepared Studio Launcher extension bundle.'
        : '',
    });
  } finally {
    cdp.close();
  }
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
  printJson(result('chrome-cdp-helper-threw', {
    ok: false,
    error: String(error && error.message || error),
    blockers: ['chrome-cdp-helper-threw'],
  }));
  process.exitCode = 1;
});
