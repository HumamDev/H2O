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
const PAGE_STATUS_WRAPPER = "function() { var body = this.document && this.document.body ? String(this.document.body.innerText || '') : ''; return { href: String(this.location && this.location.href || ''), title: String(this.document && this.document.title || ''), readyState: String(this.document && this.document.readyState || ''), bodyText: body.slice(0, 500) }; }";
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

function statusError(status, extra = {}) {
  const error = new Error(status);
  error.status = status;
  Object.assign(error, extra);
  return error;
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
  if (existing) {
    return { target: existing, diagnostics: summarizeTargets(targets, options), opened: false };
  }
  const opened = await openStudioTarget(options.port, url);
  if (opened && isStudioTarget(opened, options)) {
    return { target: opened, diagnostics: summarizeTargets([opened], options), opened: true };
  }
  const refreshedTargets = await cdpJson(options.port, '/json/list', { timeoutMs: 5000 });
  const refreshed = Array.isArray(refreshedTargets) ? refreshedTargets.find((target) => isStudioTarget(target, options)) : null;
  if (refreshed) {
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
      let settled = false;
      const finish = (fn, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        fn(value);
      };
      const timer = setTimeout(() => finish(reject, new Error('cdp-websocket-timeout')), timeoutMs);
      const ws = new WebSocket(this.webSocketUrl);
      this.ws = ws;
      ws.addEventListener('open', () => {
        if (this.isOpen()) finish(resolve);
        else finish(reject, new Error(`cdp-websocket-not-open:${ws.readyState}`));
      });
      ws.addEventListener('message', (event) => {
        this.handleMessage(event.data);
      });
      ws.addEventListener('error', () => {
        finish(reject, new Error('cdp-websocket-error'));
      }, { once: true });
      ws.addEventListener('close', () => {
        for (const pending of this.pending.values()) pending.reject(new Error('cdp-websocket-closed'));
        this.pending.clear();
      });
    });
  }

  isOpen() {
    return !!this.ws && this.ws.readyState === WebSocket.OPEN;
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

  send(method, params = {}, sessionId = '') {
    if (!this.isOpen()) {
      const state = this.ws ? this.ws.readyState : 'missing';
      return Promise.reject(new Error(`cdp-websocket-not-open:${state}`));
    }
    const id = this.nextId++;
    const message = { id, method, params };
    if (sessionId) message.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify(message));
    });
  }

  close() {
    if (this.isOpen()) this.ws.close();
  }
}

async function connectDirectTarget(target, options) {
  if (!target || !target.webSocketDebuggerUrl) {
    throw statusError('cdp-target-websocket-missing');
  }
  const client = new CdpClient(target.webSocketDebuggerUrl);
  try {
    await client.connect(options.timeoutMs);
    const control = {
      transport: 'target-websocket',
      sessionId: '',
      send(method, params = {}) {
        return client.send(method, params);
      },
      close() {
        client.close();
      },
    };
    await control.send('Runtime.enable');
    return control;
  } catch (error) {
    client.close();
    throw statusError('cdp-target-websocket-open-failed', {
      rawErrorStatus: String(error && error.message || error),
    });
  }
}

async function connectBrowserAttachedTarget(cdpVersion, target, options) {
  const browserWs = cdpVersion && cdpVersion.webSocketDebuggerUrl;
  if (!browserWs) throw statusError('cdp-browser-websocket-missing');
  const client = new CdpClient(browserWs);
  try {
    await client.connect(options.timeoutMs);
  } catch (error) {
    client.close();
    throw statusError('cdp-browser-websocket-open-failed', {
      rawErrorStatus: String(error && error.message || error),
    });
  }
  let sessionId = '';
  try {
    const attached = await client.send('Target.attachToTarget', {
      targetId: target.id,
      flatten: true,
    });
    sessionId = String(attached && attached.sessionId || '');
    if (!sessionId) throw new Error('missing sessionId');
    const control = {
      transport: 'browser-target-attach',
      sessionId,
      send(method, params = {}) {
        return client.send(method, params, sessionId);
      },
      close() {
        client.send('Target.detachFromTarget', { sessionId }).catch(() => {}).finally(() => client.close());
      },
    };
    await control.send('Runtime.enable');
    return control;
  } catch (error) {
    client.close();
    throw statusError('cdp-target-attach-failed', {
      rawErrorStatus: String(error && error.message || error),
    });
  }
}

async function connectTargetControl(cdpVersion, target, options) {
  const diagnostics = {
    targetWebSocketPresent: !!(target && target.webSocketDebuggerUrl),
    cdpTransport: '',
    directTargetError: '',
    browserAttachFallback: false,
  };
  if (diagnostics.targetWebSocketPresent) {
    try {
      const control = await connectDirectTarget(target, options);
      diagnostics.cdpTransport = control.transport;
      return { control, diagnostics };
    } catch (error) {
      diagnostics.directTargetError = String(error && (error.status || error.message) || error);
      diagnostics.browserAttachFallback = true;
    }
  } else {
    diagnostics.directTargetError = 'cdp-target-websocket-missing';
    diagnostics.browserAttachFallback = true;
  }
  const control = await connectBrowserAttachedTarget(cdpVersion, target, options);
  diagnostics.cdpTransport = control.transport;
  return { control, diagnostics };
}

async function getGlobalObjectId(cdp) {
  const evaluated = await cdp.send('Runtime.evaluate', {
    expression: GLOBAL_OBJECT_EXPRESSION,
    objectGroup: 'h2o-folder-sync-smoke',
    returnByValue: false,
  });
  return evaluated && evaluated.result && evaluated.result.objectId;
}

async function inspectPageStatus(cdp, globalObjectId) {
  const called = await cdp.send('Runtime.callFunctionOn', {
    objectId: globalObjectId,
    functionDeclaration: PAGE_STATUS_WRAPPER,
    arguments: [],
    awaitPromise: false,
    returnByValue: true,
  });
  const pageStatus = called && called.result ? called.result.value || null : null;
  const text = JSON.stringify(pageStatus || {}).toLowerCase();
  const blocked = text.includes('err_blocked_by_client') ||
    text.includes(' is blocked') ||
    text.includes('blocked by client') ||
    text.includes('chrome-error://');
  if (blocked) {
    throw statusError('chrome-extension-page-blocked', { pageStatus });
  }
  if (pageStatus && pageStatus.bodyText) pageStatus.bodyText = '';
  return pageStatus;
}

function assertNavigationOk(navigation, stage) {
  const errorText = String(navigation && navigation.errorText || '');
  if (!errorText) return;
  if (errorText.includes('ERR_BLOCKED_BY_CLIENT') || errorText.toLowerCase().includes('blocked')) {
    throw statusError('chrome-extension-page-blocked', {
      navigationStage: stage,
      navigationErrorText: errorText,
    });
  }
  throw statusError('chrome-page-navigation-failed', {
    navigationStage: stage,
    navigationErrorText: errorText,
  });
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
  throw statusError('smoke-registry-missing');
}

async function prepareTarget(cdp, url, options) {
  await cdp.send('Page.enable');
  assertNavigationOk(await cdp.send('Page.navigate', { url }), 'initial');
  await sleep(options.waitAfterNavigateMs);
  const globalObjectId = await getGlobalObjectId(cdp);
  if (!globalObjectId) throw new Error('chrome-global-object-missing');
  const initialPageStatus = await inspectPageStatus(cdp, globalObjectId);
  await setSmokeOptIn(cdp, globalObjectId);
  assertNavigationOk(await cdp.send('Page.navigate', { url }), 'after-opt-in');
  await sleep(options.waitAfterNavigateMs);
  const registryObjectId = await waitForRegistryObject(cdp, options.timeoutMs);
  return { registryObjectId, initialPageStatus };
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
  let controlBundle = null;
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

  try {
    controlBundle = await connectTargetControl(cdpVersion, target, options);
    const cdp = controlBundle.control;
    const prepared = await prepareTarget(cdp, url, options);
    const registryObjectId = prepared.registryObjectId;
    const registryGates = await diagnoseRegistryGates(cdp, registryObjectId);
    if (registryGates && registryGates.enabled !== true) {
      return result('smoke-registry-disabled', {
        ok: false,
        mode: options.mode,
        port: options.port,
        browser: summarizeCdpVersion(cdpVersion),
        op: options.op,
        targetId: target.id || '',
        targetUrl: target.url || url,
        studioTargetFound: true,
        smokeUrlFlagPresent: url.includes(`${URL_FLAG}=${REQUIRED_VALUE}`),
        registryGatesEnabled: false,
        registryGates,
        targetDiagnostics: targetBundle && targetBundle.diagnostics || null,
        cdpControlDiagnostics: controlBundle && controlBundle.diagnostics || null,
        pageStatus: prepared.initialPageStatus || null,
        blockers: ['smoke-registry-disabled'],
        launch,
      });
    }
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
      cdpControlDiagnostics: controlBundle && controlBundle.diagnostics || null,
      pageStatus: prepared.initialPageStatus || null,
      result: registryResult,
      launch,
    });
  } catch (error) {
    const rawStatus = String(error && (error.status || error.message) || error) || 'chrome-cdp-helper-failed';
    const status = rawStatus;
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
      cdpControlDiagnostics: controlBundle && controlBundle.diagnostics || null,
      pageStatus: error && error.pageStatus || null,
      navigationStage: error && error.navigationStage || '',
      navigationErrorText: error && error.navigationErrorText || '',
      blockers,
      rawErrorStatus: error && error.rawErrorStatus || rawStatus,
      error: String(error && error.message || error),
      nextAction: status === 'chrome-extension-not-loaded'
        ? 'Confirm Chrome Dev was launched with --extension-path and the prepared Studio Launcher extension bundle.'
        : status === 'chrome-extension-page-blocked'
          ? 'Open the smoke profile extension page and disable the client/policy/extension blocker that is blocking the Studio extension URL.'
          : status === 'smoke-registry-missing'
            ? 'Confirm the prepared Studio bundle includes the smoke registry file and reload the Studio target.'
            : '',
    });
  } finally {
    if (controlBundle && controlBundle.control) controlBundle.control.close();
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
