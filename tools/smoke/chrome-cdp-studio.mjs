#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import crypto from 'node:crypto';
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
const SMOKE_EXTENSION_COPY_ROOT = '/private/tmp/h2o-folder-sync-smoke-extension-copies';
const CHROME_LOAD_EXTENSION_FEATURE_BYPASS = 'DisableLoadExtensionCommandLineSwitch';
const URL_FLAG = 'h2oSmokeBridge';
const REQUIRED_VALUE = 'folder-sync-rc';
const OPT_IN_KEY = 'h2o:studio:smoke-bridge:enabled:v1';
const REGISTRY_PATH_LABEL = 'H2O.Studio.devSmoke.folderSync.run';
const REGISTRY_OBJECT_EXPRESSION = 'globalThis.H2O && globalThis.H2O.Studio && globalThis.H2O.Studio.devSmoke && globalThis.H2O.Studio.devSmoke.folderSync';
const GLOBAL_OBJECT_EXPRESSION = 'globalThis';
const REGISTRY_CALL_WRAPPER = 'function(op, payload) { return this.run(op, payload); }';
const REGISTRY_GATES_WRAPPER = 'function() { return this.diagnoseGates ? this.diagnoseGates() : null; }';
const SERVICE_WORKER_OPEN_STUDIO_EXPRESSION = "globalThis.__h2oSmokeOpenStudio()";
const LOCAL_STORAGE_OPT_IN_WRAPPER = "function() { this.localStorage.setItem('h2o:studio:smoke-bridge:enabled:v1', 'folder-sync-rc'); return { href: String(this.location && this.location.href || ''), optIn: this.localStorage.getItem('h2o:studio:smoke-bridge:enabled:v1') }; }";
const PAGE_STATUS_WRAPPER = "function() { var body = this.document && this.document.body ? String(this.document.body.innerText || '') : ''; return { href: String(this.location && this.location.href || ''), title: String(this.document && this.document.title || ''), readyState: String(this.document && this.document.readyState || ''), bodyText: body.slice(0, 500) }; }";
const SYNC_FOLDER_DIAGNOSE_WRAPPER = "function() { try { var api = this.H2O && this.H2O.Studio && this.H2O.Studio.sync && this.H2O.Studio.sync.folder; if (!api || typeof api.diagnose !== 'function') return { ok: false, status: 'sync-folder-diagnose-unavailable' }; var raw = api.diagnose() || {}; var blockers = raw.blockers || {}; var desktopToChrome = raw.desktopToChrome || {}; var chromeToDesktop = raw.chromeToDesktop || {}; return { ok: true, status: 'sync-folder-diagnosed', connected: raw.connected === true, permission: String(raw.permission || chromeToDesktop.permission || desktopToChrome.permission || ''), folderName: String(raw.folderName || ''), fileSystemAccessAvailable: raw.fileSystemAccessAvailable === true, chromeWritesSyncFolder: raw.chromeWritesSyncFolder === true || chromeToDesktop.chromeWritesSyncFolder === true, desktopToChromePermission: String(desktopToChrome.permission || ''), chromeToDesktopPermission: String(chromeToDesktop.permission || ''), permissionRequired: blockers.permissionRequired === true, noFolderHandle: blockers.noFolderHandle === true }; } catch (error) { return { ok: false, status: 'sync-folder-diagnose-threw', error: String(error && error.message || error) }; } }";
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
  if (options.loadExtension && options.loadExtension !== 'none') {
    options.loadExtension = path.resolve(repoRoot, options.loadExtension);
  }
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

function studioUrlFor(options, extensionId = options.extensionId) {
  const base = options.studioUrl ||
    `chrome-extension://${extensionId}/surfaces/studio/studio.html#/saved`;
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

function idFromExtensionKey(key) {
  if (!key) return '';
  try {
    const digest = crypto.createHash('sha256').update(Buffer.from(String(key), 'base64')).digest();
    const hex = digest.subarray(0, 16).toString('hex');
    return hex.replace(/[0-9a-f]/g, (char) => String.fromCharCode('a'.charCodeAt(0) + Number.parseInt(char, 16)));
  } catch (_) {
    return '';
  }
}

function manifestRequiredFiles(manifest) {
  const files = ['surfaces/studio/studio.html'];
  const backgroundWorker = manifest && manifest.background && manifest.background.service_worker;
  if (backgroundWorker) files.push(String(backgroundWorker));
  const icons = manifest && manifest.icons && typeof manifest.icons === 'object' ? manifest.icons : {};
  for (const icon of Object.values(icons)) {
    if (icon) files.push(String(icon));
  }
  return [...new Set(files)];
}

function validateExtensionPath(loadExtension) {
  if (!loadExtension || loadExtension === 'none') {
    throw statusError('chrome-extension-path-invalid', {
      extensionPath: String(loadExtension || ''),
    });
  }
  const extensionPath = path.resolve(repoRoot, loadExtension);
  const manifestPath = path.join(extensionPath, 'manifest.json');
  if (!fs.existsSync(extensionPath)) {
    throw statusError('chrome-extension-path-invalid', { extensionPath });
  }
  if (!fs.existsSync(manifestPath)) {
    throw statusError('chrome-extension-manifest-invalid', { extensionPath, manifestPath });
  }
  let manifest = null;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    throw statusError('chrome-extension-manifest-invalid', {
      extensionPath,
      manifestPath,
      rawErrorStatus: String(error && error.message || error),
    });
  }
  const requiredFiles = manifestRequiredFiles(manifest);
  const missingRequiredFiles = requiredFiles.filter((file) => !fs.existsSync(path.join(extensionPath, file)));
  if (missingRequiredFiles.length > 0) {
    throw statusError('chrome-extension-path-invalid', {
      extensionPath,
      manifestPath,
      missingRequiredFiles,
    });
  }
  const expectedExtensionId = idFromExtensionKey(manifest && manifest.key);
  return {
    extensionPath,
    sourceExtensionPath: extensionPath,
    manifestPath,
    manifestName: String(manifest && manifest.name || ''),
    manifestVersion: String(manifest && manifest.version || ''),
    manifestHasKey: !!(manifest && manifest.key),
    expectedExtensionId,
    requiredFiles,
  };
}

function patchSmokeLauncherBg(source) {
  let output = String(source || '');
  let autoRestorePatched = false;
  let smokeUrlFlagPatched = false;
  let smokeOpenWrapperPatched = false;
  if (output.includes('const STUDIO_AUTO_RESTORE_ENABLED = false;')) {
    output = output.replace(
      'const STUDIO_AUTO_RESTORE_ENABLED = false;',
      'const STUDIO_AUTO_RESTORE_ENABLED = true;'
    );
    autoRestorePatched = true;
  }
  const studioGetUrl = 'chrome.runtime.getURL("surfaces/studio/studio.html")';
  const smokeStudioGetUrl = `(chrome.runtime.getURL("surfaces/studio/studio.html") + "?${URL_FLAG}=${REQUIRED_VALUE}")`;
  if (output.includes(studioGetUrl)) {
    output = output.split(studioGetUrl).join(smokeStudioGetUrl);
    smokeUrlFlagPatched = true;
  }
  if (!output.includes('__h2oSmokeOpenStudio')) {
    output += '\ntry { globalThis.__h2oSmokeOpenStudio = function() { return openOrFocusStudio("/saved"); }; } catch (_) {}\n';
    smokeOpenWrapperPatched = true;
  }
  return { source: output, autoRestorePatched, smokeUrlFlagPatched, smokeOpenWrapperPatched };
}

function prepareSmokeExtensionCopy(extensionInfo) {
  const sourcePath = extensionInfo && extensionInfo.extensionPath || '';
  const extensionId = extensionInfo && extensionInfo.expectedExtensionId || crypto.createHash('sha256').update(sourcePath).digest('hex').slice(0, 16);
  const copyPath = path.join(SMOKE_EXTENSION_COPY_ROOT, extensionId);
  fs.rmSync(copyPath, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(copyPath), { recursive: true });
  fs.cpSync(sourcePath, copyPath, { recursive: true });

  const bgPath = path.join(copyPath, 'bg.js');
  let studioAutoRestorePatched = false;
  let smokeUrlFlagPatched = false;
  let smokeOpenWrapperPatched = false;
  if (fs.existsSync(bgPath)) {
    const patched = patchSmokeLauncherBg(fs.readFileSync(bgPath, 'utf8'));
    fs.writeFileSync(bgPath, patched.source);
    studioAutoRestorePatched = patched.autoRestorePatched;
    smokeUrlFlagPatched = patched.smokeUrlFlagPatched;
    smokeOpenWrapperPatched = patched.smokeOpenWrapperPatched;
  }

  const copied = validateExtensionPath(copyPath);
  return {
    ...copied,
    sourceExtensionPath: sourcePath,
    smokeExtensionCopy: true,
    smokeExtensionCopyRoot: copyPath,
    studioAutoRestorePatched,
    smokeUrlFlagPatched,
    smokeOpenWrapperPatched,
    cdpLoadPreferred: true,
  };
}

function launchChrome(options, url, extensionInfo = null) {
  const chromePath = findChromeBinary(options.chromePath);
  if (!chromePath || !fs.existsSync(chromePath)) {
    throw statusError('chrome-binary-missing', { chromePath });
  }
  const args = [
    `--remote-debugging-port=${options.port}`,
    `--user-data-dir=${options.profile}`,
    '--no-first-run',
    '--no-default-browser-check',
  ];
  if (extensionInfo && extensionInfo.extensionPath) {
    args.push('--enable-unsafe-extension-debugging');
    if (!extensionInfo.cdpLoadPreferred) {
      args.push(`--disable-features=${CHROME_LOAD_EXTENSION_FEATURE_BYPASS}`);
      args.push(`--disable-extensions-except=${extensionInfo.extensionPath}`);
      args.push(`--load-extension=${extensionInfo.extensionPath}`);
    }
  }
  args.push(url);
  const stdoutTail = [];
  const stderrTail = [];
  const captureTail = (stream, bucket) => {
    if (!stream) return;
    stream.setEncoding('utf8');
    stream.on('data', (chunk) => {
      const lines = String(chunk || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      bucket.push(...lines);
      while (bucket.length > 12) bucket.shift();
    });
    if (typeof stream.unref === 'function') stream.unref();
  };
  const child = spawn(chromePath, args, {
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  captureTail(child.stdout, stdoutTail);
  captureTail(child.stderr, stderrTail);
  child.unref();
  return { chromePath, args, pid: child.pid || 0, stdoutTail, stderrTail };
}

function isStudioTarget(target, options, extensionId = options.extensionId) {
  const url = String(target && target.url || '');
  return target && target.type === 'page' &&
    url.includes(`chrome-extension://${extensionId}/`) &&
    url.includes('/surfaces/studio/studio.html');
}

function isSmokeStudioTarget(target, options, extensionId = options.extensionId) {
  const url = String(target && target.url || '');
  return isStudioTarget(target, options, extensionId) &&
    url.includes(`${URL_FLAG}=${REQUIRED_VALUE}`);
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

function extensionIdFromUrl(url) {
  const match = String(url || '').match(/^chrome-extension:\/\/([a-z]{32})\//);
  return match ? match[1] : '';
}

function isBlockedExtensionTarget(target) {
  const title = String(target && target.title || '').toLowerCase();
  const url = String(target && target.url || '').toLowerCase();
  return title.includes(' is blocked') ||
    title.includes('blocked by client') ||
    title.includes('err_blocked_by_client') ||
    url.startsWith('chrome-error://');
}

function summarizeAnyExtensionTargets(targets) {
  const rows = Array.isArray(targets) ? targets.map(summarizeTarget) : [];
  const extensionTargets = rows.filter((target) => extensionIdFromUrl(target.url));
  const loadedExtensionTargets = extensionTargets.filter((target) => !isBlockedExtensionTarget(target));
  const blockedExtensionTargets = extensionTargets.filter((target) => isBlockedExtensionTarget(target));
  const discoveredExtensionIds = [...new Set(extensionTargets.map((target) => extensionIdFromUrl(target.url)).filter(Boolean))];
  const loadedExtensionIds = [...new Set(loadedExtensionTargets.map((target) => extensionIdFromUrl(target.url)).filter(Boolean))];
  const studioTargets = extensionTargets.filter((target) => target.url.includes('/surfaces/studio/studio.html'));
  return {
    targetCount: rows.length,
    extensionTargetFound: extensionTargets.length > 0,
    extensionTargetCount: extensionTargets.length,
    discoveredExtensionIds,
    loadedExtensionIds,
    extensionTargets,
    loadedExtensionTargets,
    blockedExtensionTargetCount: blockedExtensionTargets.length,
    blockedExtensionTargets,
    studioTargetFound: studioTargets.length > 0,
    studioTargetCount: studioTargets.length,
    studioTargets,
  };
}

async function browserTargetInfos(cdpVersion, timeoutMs) {
  const browserWs = cdpVersion && cdpVersion.webSocketDebuggerUrl;
  if (!browserWs) return [];
  const client = new CdpClient(browserWs);
  try {
    await client.connect(timeoutMs);
    const listed = await client.send('Target.getTargets');
    return Array.isArray(listed && listed.targetInfos) ? listed.targetInfos : [];
  } finally {
    client.close();
  }
}

async function discoverExtensionTargets(options, cdpVersion) {
  const jsonTargets = await cdpJson(options.port, '/json/list', { timeoutMs: 5000 }).catch(() => []);
  const browserTargets = await browserTargetInfos(cdpVersion, Math.min(options.timeoutMs, 5000)).catch(() => []);
  const combined = [
    ...(Array.isArray(jsonTargets) ? jsonTargets : []),
    ...(Array.isArray(browserTargets) ? browserTargets : []),
  ];
  return summarizeAnyExtensionTargets(combined);
}

async function loadUnpackedExtensionViaCdp(cdpVersion, extensionInfo, options) {
  const browserWs = cdpVersion && cdpVersion.webSocketDebuggerUrl;
  if (!browserWs) throw statusError('cdp-browser-websocket-missing');
  const client = new CdpClient(browserWs);
  try {
    await client.connect(Math.min(options.timeoutMs, 10000));
    const loaded = await client.send('Extensions.loadUnpacked', {
      path: extensionInfo.extensionPath,
    });
    const extensionId = String(loaded && (loaded.id || loaded.extensionId) || '');
    return {
      ok: !!extensionId,
      status: extensionId ? 'chrome-extension-loaded-via-cdp' : 'chrome-extension-load-unpacked-no-id',
      extensionId,
      extensionPath: extensionInfo.extensionPath,
    };
  } catch (error) {
    return {
      ok: false,
      status: 'chrome-extension-load-unpacked-failed',
      extensionPath: extensionInfo && extensionInfo.extensionPath || '',
      rawErrorStatus: String(error && error.message || error),
    };
  } finally {
    client.close();
  }
}

async function triggerStudioLauncherActionViaCdp(cdpVersion, extensionId, options) {
  const browserWs = cdpVersion && cdpVersion.webSocketDebuggerUrl;
  if (!browserWs) throw statusError('cdp-browser-websocket-missing');
  const client = new CdpClient(browserWs);
  try {
    await client.connect(Math.min(options.timeoutMs, 10000));
    const listed = await client.send('Target.getTargets', {
      filter: [{ type: 'tab', exclude: false }],
    });
    const targets = Array.isArray(listed && listed.targetInfos) ? listed.targetInfos : [];
    let tabTarget = targets.find((target) => target.type === 'tab' && String(target.url || '') === 'about:blank') ||
      targets.find((target) => target.type === 'tab');
    if (!tabTarget) {
      const created = await client.send('Target.createTarget', { url: 'about:blank' });
      const createdTargetId = String(created && created.targetId || '');
      const refreshed = await client.send('Target.getTargets', {
        filter: [{ type: 'tab', exclude: false }],
      });
      const refreshedTargets = Array.isArray(refreshed && refreshed.targetInfos) ? refreshed.targetInfos : [];
      tabTarget = refreshedTargets.find((target) => target.type === 'tab' && String(target.targetId || '') === createdTargetId) ||
        refreshedTargets.find((target) => target.type === 'tab' && String(target.url || '') === 'about:blank') ||
        refreshedTargets.find((target) => target.type === 'tab');
    }
    const targetId = String(tabTarget && (tabTarget.targetId || tabTarget.id) || '');
    if (!targetId) throw statusError('chrome-extension-action-target-missing');
    await client.send('Extensions.triggerAction', {
      id: extensionId,
      targetId,
    });
    return {
      ok: true,
      status: 'chrome-extension-action-triggered',
      extensionId,
      targetId,
    };
  } catch (error) {
    return {
      ok: false,
      status: 'chrome-extension-action-trigger-failed',
      extensionId,
      rawErrorStatus: String(error && (error.status || error.message) || error),
    };
  } finally {
    client.close();
  }
}

async function openStudioViaLauncherServiceWorker(cdpVersion, extensionId, options) {
  const targets = await browserTargetInfos(cdpVersion, Math.min(options.timeoutMs, 10000)).catch(() => []);
  const serviceWorker = targets.find((target) => target.type === 'service_worker' &&
    String(target.url || '') === `chrome-extension://${extensionId}/bg.js`);
  if (!serviceWorker) {
    return {
      ok: false,
      status: 'chrome-extension-service-worker-missing',
      extensionId,
    };
  }
  let control = null;
  try {
    control = await connectBrowserAttachedTarget(cdpVersion, {
      id: String(serviceWorker.targetId || serviceWorker.id || ''),
    }, options);
    const evaluated = await control.send('Runtime.evaluate', {
      expression: SERVICE_WORKER_OPEN_STUDIO_EXPRESSION,
      objectGroup: 'h2o-folder-sync-smoke',
      awaitPromise: true,
      returnByValue: true,
    });
    if (evaluated.exceptionDetails) throw new Error('open-studio-service-worker-call-threw');
    return {
      ok: !!(evaluated && evaluated.result && evaluated.result.value && evaluated.result.value.ok),
      status: 'chrome-extension-service-worker-open-studio-called',
      extensionId,
      targetId: String(serviceWorker.targetId || serviceWorker.id || ''),
      result: evaluated && evaluated.result ? evaluated.result.value || null : null,
    };
  } catch (error) {
    return {
      ok: false,
      status: 'chrome-extension-service-worker-open-studio-failed',
      extensionId,
      rawErrorStatus: String(error && (error.status || error.message) || error),
    };
  } finally {
    if (control) control.close();
  }
}

function selectDiscoveredExtensionId(discovery, options, extensionInfo = null) {
  const ids = Array.isArray(discovery && discovery.loadedExtensionIds)
    ? discovery.loadedExtensionIds
    : [];
  const expectedExtensionId = extensionInfo && extensionInfo.expectedExtensionId || '';
  if (expectedExtensionId && ids.includes(expectedExtensionId)) return expectedExtensionId;
  if (expectedExtensionId) return '';
  if (options.extensionId && ids.includes(options.extensionId)) return options.extensionId;
  if (options.extensionId) return '';
  if (ids.length === 1) return ids[0];
  const studioTarget = Array.isArray(discovery && discovery.studioTargets)
    ? discovery.studioTargets.find((target) => extensionIdFromUrl(target.url) && !isBlockedExtensionTarget(target))
    : null;
  if (studioTarget) return extensionIdFromUrl(studioTarget.url);
  return '';
}

async function waitForStudioLauncherExtension(options, cdpVersion, extensionInfo = null) {
  const deadline = Date.now() + Math.max(1000, options.timeoutMs);
  let lastDiscovery = null;
  let expectedPageProbe = null;
  while (Date.now() < deadline) {
    lastDiscovery = await discoverExtensionTargets(options, cdpVersion);
    const extensionId = selectDiscoveredExtensionId(lastDiscovery, options, extensionInfo);
    if (extensionId) {
      return {
        extensionId,
        extensionDiscovery: lastDiscovery,
        attemptedExtensionId: options.extensionId,
        expectedExtensionId: extensionInfo && extensionInfo.expectedExtensionId || '',
        extensionPath: extensionInfo && extensionInfo.extensionPath || '',
        extensionManifest: extensionInfo || null,
        expectedPageProbe,
      };
    }
    const expectedExtensionId = extensionInfo && extensionInfo.expectedExtensionId || '';
    if (expectedExtensionId && !expectedPageProbe && !(extensionInfo && extensionInfo.studioAutoRestorePatched)) {
      const probeOptions = { ...options, extensionId: expectedExtensionId };
      const probeUrl = studioUrlFor(probeOptions, expectedExtensionId);
      try {
        expectedPageProbe = summarizeTarget(await openStudioTarget(options.port, probeUrl));
      } catch (error) {
        expectedPageProbe = {
          url: probeUrl,
          error: String(error && error.message || error),
        };
      }
    }
    await sleep(300);
  }
  const blockedCount = Number(lastDiscovery && lastDiscovery.blockedExtensionTargetCount || 0);
  const status = blockedCount > 0 ? 'chrome-extension-policy-blocked' : 'chrome-load-extension-ignored';
  throw statusError(status, {
    blockers: [status, 'studio-launcher-extension-not-loaded'],
    attemptedExtensionId: options.extensionId,
    expectedExtensionId: extensionInfo && extensionInfo.expectedExtensionId || '',
    extensionPath: extensionInfo && extensionInfo.extensionPath || '',
    extensionManifest: extensionInfo || null,
    extensionDiscovery: lastDiscovery,
    expectedPageProbe,
  });
}

async function openStudioTarget(port, url) {
  const route = `/json/new?${encodeURIComponent(url)}`;
  try {
    return await cdpJson(port, route, { method: 'PUT', timeoutMs: 5000 });
  } catch (_) {
    return cdpJson(port, route, { method: 'GET', timeoutMs: 5000 });
  }
}

async function findOrOpenStudioTarget(options, url, extensionId = options.extensionId) {
  const deadline = Date.now() + Math.min(Math.max(1000, options.timeoutMs), 12000);
  let targets = [];
  while (Date.now() < deadline) {
    targets = await cdpJson(options.port, '/json/list', { timeoutMs: 5000 });
    const existing = Array.isArray(targets)
      ? targets.filter((target) => isSmokeStudioTarget(target, options, extensionId))
      : [];
    if (existing.length > 0) {
      const selected = await selectBestStudioTarget(existing, options, extensionId);
      return {
        target: selected.target,
        diagnostics: summarizeTargets(targets, options),
        targetProbe: selected.probe,
        targetProbeSummary: selected.summary,
        opened: false,
      };
    }
    if (options.externalStudioOpenAllowed === false) {
      await sleep(300);
      continue;
    }
    break;
  }
  if (options.externalStudioOpenAllowed === false) {
    const diagnostics = summarizeTargets(targets, options);
    const error = new Error('chrome-studio-target-missing');
    error.status = 'chrome-studio-target-missing';
    error.targetDiagnostics = diagnostics;
    throw error;
  }
  const opened = await openStudioTarget(options.port, url);
  if (opened && isSmokeStudioTarget(opened, options, extensionId)) {
    return { target: opened, diagnostics: summarizeTargets([opened], options), opened: true };
  }
  const refreshedTargets = await cdpJson(options.port, '/json/list', { timeoutMs: 5000 });
  const refreshed = Array.isArray(refreshedTargets)
    ? refreshedTargets.filter((target) => isSmokeStudioTarget(target, options, extensionId))
    : [];
  if (refreshed.length > 0) {
    const selected = await selectBestStudioTarget(refreshed, options, extensionId);
    return {
      target: selected.target,
      diagnostics: summarizeTargets(refreshedTargets, options),
      targetProbe: selected.probe,
      targetProbeSummary: selected.summary,
      opened: true,
    };
  }
  const diagnostics = summarizeTargets(refreshedTargets, options);
  const error = new Error(diagnostics.extensionTargetFound ? 'chrome-studio-target-missing' : 'chrome-extension-not-loaded');
  error.status = error.message;
  error.targetDiagnostics = diagnostics;
  throw error;
}

async function readSyncFolderDiagnose(cdp, globalObjectId) {
  const called = await cdp.send('Runtime.callFunctionOn', {
    objectId: globalObjectId,
    functionDeclaration: SYNC_FOLDER_DIAGNOSE_WRAPPER,
    arguments: [],
    awaitPromise: false,
    returnByValue: true,
  });
  if (called.exceptionDetails) {
    return { ok: false, status: 'sync-folder-diagnose-call-threw' };
  }
  return called && called.result ? called.result.value || null : null;
}

function scoreStudioTargetProbe(probe) {
  if (!probe || probe.ok !== true) return 0;
  const syncDiag = probe.syncFolderDiagnose || {};
  let score = 10;
  if (probe.smokeUrlFlagPresent === true) score += 10;
  if (probe.readyState === 'complete') score += 5;
  if (probe.registryPresent === true) score += 10;
  if (probe.registryGatesEnabled === true) score += 10;
  if (syncDiag.ok === true) score += 10;
  if (syncDiag.connected === true) score += 25;
  if (syncDiag.permission === 'granted') score += 25;
  if (syncDiag.permissionRequired === false) score += 5;
  if (syncDiag.noFolderHandle === false) score += 5;
  if (syncDiag.chromeWritesSyncFolder === true) score += 5;
  return score;
}

function summarizeTargetProbe(probes) {
  const rows = Array.isArray(probes) ? probes : [];
  return {
    probedTargetCount: rows.length,
    connectedGrantedTargetCount: rows.filter((row) => {
      const syncDiag = row && row.syncFolderDiagnose || {};
      return row && row.ok === true && syncDiag.connected === true && syncDiag.permission === 'granted';
    }).length,
    selectedTargetScore: rows.length ? Number(rows[0].score || 0) : 0,
    selectedTargetSyncPermission: rows.length ? String(rows[0].syncFolderDiagnose && rows[0].syncFolderDiagnose.permission || '') : '',
    selectedTargetSyncConnected: rows.length ? rows[0].syncFolderDiagnose && rows[0].syncFolderDiagnose.connected === true : false,
  };
}

async function probeStudioTarget(target, options) {
  let control = null;
  try {
    control = await connectTargetControl(await cdpJson(options.port, '/json/version', { timeoutMs: 3000 }), target, {
      ...options,
      timeoutMs: Math.min(options.timeoutMs, 5000),
    });
    const globalObjectId = await getGlobalObjectId(control.control);
    if (!globalObjectId) throw new Error('chrome-global-object-missing');
    const pageStatus = await inspectPageStatus(control.control, globalObjectId);
    await setSmokeOptIn(control.control, globalObjectId).catch(() => null);
    const registryObjectId = await getRegistryObjectId(control.control);
    let registryGates = null;
    if (registryObjectId) {
      registryGates = await diagnoseRegistryGates(control.control, registryObjectId).catch(() => null);
    }
    const syncFolderDiagnose = await readSyncFolderDiagnose(control.control, globalObjectId).catch((error) => ({
      ok: false,
      status: 'sync-folder-diagnose-failed',
      error: String(error && error.message || error),
    }));
    return {
      ok: true,
      targetId: String(target && target.id || ''),
      targetUrl: String(target && target.url || ''),
      readyState: String(pageStatus && pageStatus.readyState || ''),
      smokeUrlFlagPresent: String(pageStatus && pageStatus.href || target && target.url || '').includes(`${URL_FLAG}=${REQUIRED_VALUE}`),
      registryPresent: !!registryObjectId,
      registryGatesEnabled: registryGates && registryGates.enabled === true,
      syncFolderDiagnose,
    };
  } catch (error) {
    return {
      ok: false,
      targetId: String(target && target.id || ''),
      targetUrl: String(target && target.url || ''),
      status: String(error && (error.status || error.message) || error),
    };
  } finally {
    if (control && control.control) control.control.close();
  }
}

async function selectBestStudioTarget(candidates, options) {
  const rows = [];
  for (const target of candidates) {
    const probe = await probeStudioTarget(target, options);
    probe.score = scoreStudioTargetProbe(probe);
    rows.push(probe);
  }
  rows.sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
  const selectedProbe = rows[0] || null;
  const target = candidates.find((candidate) => String(candidate && candidate.id || '') === String(selectedProbe && selectedProbe.targetId || '')) ||
    candidates[0];
  return {
    target,
    probe: selectedProbe,
    summary: summarizeTargetProbe(rows),
  };
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
  const globalObjectId = await getGlobalObjectId(cdp);
  if (!globalObjectId) throw new Error('chrome-global-object-missing');
  const initialPageStatus = await inspectPageStatus(cdp, globalObjectId);
  const currentHref = String(initialPageStatus && initialPageStatus.href || '');
  if (!currentHref.includes('/surfaces/studio/studio.html') ||
      !currentHref.includes(`${URL_FLAG}=${REQUIRED_VALUE}`)) {
    throw statusError('chrome-studio-target-url-mismatch', {
      pageStatus: initialPageStatus,
      expectedUrl: url,
    });
  }
  await setSmokeOptIn(cdp, globalObjectId);
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

  let url = '';
  let launch = null;
  let cdpVersion = null;
  let extensionInfo = null;
  let extensionBundle = null;
  let extensionLoad = null;
  let extensionAction = null;
  let extensionServiceWorkerOpen = null;
  let effectiveOptions = options;
  try {
    if (options.mode === 'launch') {
      extensionInfo = validateExtensionPath(options.loadExtension);
      extensionInfo = prepareSmokeExtensionCopy(extensionInfo);
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
      launch = launchChrome(options, 'about:blank', extensionInfo);
    }
    cdpVersion = await waitForCdp(options.port, options.timeoutMs);
    if (options.mode === 'launch' && extensionInfo) {
      extensionLoad = await loadUnpackedExtensionViaCdp(cdpVersion, extensionInfo, options);
      if (extensionLoad && extensionLoad.extensionId) {
        extensionInfo = {
          ...extensionInfo,
          expectedExtensionId: extensionLoad.extensionId,
          cdpLoadExtensionId: extensionLoad.extensionId,
        };
        if (extensionInfo.smokeUrlFlagPatched) {
          extensionAction = await triggerStudioLauncherActionViaCdp(cdpVersion, extensionLoad.extensionId, {
            ...options,
            extensionId: extensionLoad.extensionId,
          });
        }
      }
    }
  } catch (error) {
    const status = error && error.status || 'chrome-cdp-unavailable';
    return result(status, {
      ok: false,
      mode: options.mode,
      port: options.port,
      error: String(error && error.message || error),
      extensionPath: error && error.extensionPath || extensionInfo && extensionInfo.extensionPath || '',
      extensionManifest: extensionInfo,
      extensionLoad,
      launch,
      browser: cdpVersion ? summarizeCdpVersion(cdpVersion) : null,
      blockers: error && Array.isArray(error.blockers) ? error.blockers : [status],
    });
  }

  try {
    extensionBundle = await waitForStudioLauncherExtension(options, cdpVersion, extensionInfo);
    effectiveOptions = {
      ...options,
      extensionId: extensionBundle.extensionId,
      externalStudioOpenAllowed: !(extensionInfo && extensionInfo.studioAutoRestorePatched),
    };
    url = studioUrlFor(effectiveOptions, extensionBundle.extensionId);
    if (options.mode === 'launch' && extensionInfo && extensionInfo.smokeUrlFlagPatched && !(extensionAction && extensionAction.ok)) {
      extensionAction = await triggerStudioLauncherActionViaCdp(cdpVersion, extensionBundle.extensionId, effectiveOptions);
    }
    if (options.mode === 'launch' && extensionInfo && extensionInfo.smokeUrlFlagPatched) {
      extensionServiceWorkerOpen = await openStudioViaLauncherServiceWorker(cdpVersion, extensionBundle.extensionId, effectiveOptions);
    }
  } catch (error) {
    const status = error && error.status || error && error.message || 'studio-launcher-extension-not-loaded';
    return result(status, {
      ok: false,
      mode: options.mode,
      port: options.port,
      browser: summarizeCdpVersion(cdpVersion),
      error: String(error && error.message || error),
      blockers: error && Array.isArray(error.blockers) ? error.blockers : [status],
      attemptedExtensionId: error && error.attemptedExtensionId || options.extensionId,
      expectedExtensionId: error && error.expectedExtensionId || extensionInfo && extensionInfo.expectedExtensionId || '',
      discoveredExtensionIds: error && error.extensionDiscovery && error.extensionDiscovery.discoveredExtensionIds || [],
      loadedExtensionIds: error && error.extensionDiscovery && error.extensionDiscovery.loadedExtensionIds || [],
      extensionPath: error && error.extensionPath || extensionInfo && extensionInfo.extensionPath || '',
      extensionManifest: error && error.extensionManifest || extensionInfo,
      extensionLoad,
      extensionAction,
      extensionServiceWorkerOpen,
      extensionDiscovery: error && error.extensionDiscovery || null,
      expectedPageProbe: error && error.expectedPageProbe || null,
      launch,
      nextAction: status === 'chrome-load-extension-ignored'
        ? `Chrome did not expose the unpacked extension. Confirm Chrome Dev accepts --load-extension with --disable-features=${CHROME_LOAD_EXTENSION_FEATURE_BYPASS}, or create a fresh --user-data-dir and retry.`
        : status === 'chrome-extension-policy-blocked'
          ? 'Chrome exposed only blocked extension targets. Check chrome://policy and remove extension-blocking policy/client settings for the smoke profile.'
          : 'Confirm Chrome Dev loaded the Studio Launcher unpacked extension from --extension-path and that the smoke profile is not reusing a stale/blocked profile.',
    });
  }

  let targetBundle;
  let target;
  let controlBundle = null;
  try {
    targetBundle = await findOrOpenStudioTarget(effectiveOptions, url, extensionBundle.extensionId);
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
      attemptedExtensionId: options.extensionId,
      expectedExtensionId: extensionBundle && extensionBundle.expectedExtensionId || extensionInfo && extensionInfo.expectedExtensionId || '',
      discoveredExtensionId: extensionBundle && extensionBundle.extensionId || '',
      discoveredExtensionIds: extensionBundle && extensionBundle.extensionDiscovery && extensionBundle.extensionDiscovery.discoveredExtensionIds || [],
      loadedExtensionIds: extensionBundle && extensionBundle.extensionDiscovery && extensionBundle.extensionDiscovery.loadedExtensionIds || [],
      extensionPath: extensionBundle && extensionBundle.extensionPath || extensionInfo && extensionInfo.extensionPath || '',
      extensionManifest: extensionBundle && extensionBundle.extensionManifest || extensionInfo,
      extensionLoad,
      extensionAction,
      extensionServiceWorkerOpen,
      extensionDiscovery: extensionBundle && extensionBundle.extensionDiscovery || null,
      expectedPageProbe: extensionBundle && extensionBundle.expectedPageProbe || null,
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
        attemptedExtensionId: options.extensionId,
        expectedExtensionId: extensionBundle && extensionBundle.expectedExtensionId || extensionInfo && extensionInfo.expectedExtensionId || '',
        discoveredExtensionId: extensionBundle && extensionBundle.extensionId || '',
        discoveredExtensionIds: extensionBundle && extensionBundle.extensionDiscovery && extensionBundle.extensionDiscovery.discoveredExtensionIds || [],
        loadedExtensionIds: extensionBundle && extensionBundle.extensionDiscovery && extensionBundle.extensionDiscovery.loadedExtensionIds || [],
        extensionPath: extensionBundle && extensionBundle.extensionPath || extensionInfo && extensionInfo.extensionPath || '',
        extensionManifest: extensionBundle && extensionBundle.extensionManifest || extensionInfo,
        extensionLoad,
        extensionAction,
        extensionServiceWorkerOpen,
        extensionDiscovery: extensionBundle && extensionBundle.extensionDiscovery || null,
        expectedPageProbe: extensionBundle && extensionBundle.expectedPageProbe || null,
        registryGatesEnabled: false,
        registryGates,
        targetDiagnostics: targetBundle && targetBundle.diagnostics || null,
        targetProbe: targetBundle && targetBundle.targetProbe || null,
        targetProbeSummary: targetBundle && targetBundle.targetProbeSummary || null,
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
      attemptedExtensionId: options.extensionId,
      expectedExtensionId: extensionBundle && extensionBundle.expectedExtensionId || extensionInfo && extensionInfo.expectedExtensionId || '',
      discoveredExtensionId: extensionBundle && extensionBundle.extensionId || '',
      discoveredExtensionIds: extensionBundle && extensionBundle.extensionDiscovery && extensionBundle.extensionDiscovery.discoveredExtensionIds || [],
      loadedExtensionIds: extensionBundle && extensionBundle.extensionDiscovery && extensionBundle.extensionDiscovery.loadedExtensionIds || [],
      extensionPath: extensionBundle && extensionBundle.extensionPath || extensionInfo && extensionInfo.extensionPath || '',
      extensionManifest: extensionBundle && extensionBundle.extensionManifest || extensionInfo,
      extensionLoad,
      extensionAction,
      extensionServiceWorkerOpen,
      extensionDiscovery: extensionBundle && extensionBundle.extensionDiscovery || null,
      expectedPageProbe: extensionBundle && extensionBundle.expectedPageProbe || null,
      registryGatesEnabled: registryGates && registryGates.enabled === true,
      registryGates,
      targetDiagnostics: targetBundle && targetBundle.diagnostics || null,
      targetProbe: targetBundle && targetBundle.targetProbe || null,
      targetProbeSummary: targetBundle && targetBundle.targetProbeSummary || null,
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
      attemptedExtensionId: options.extensionId,
      expectedExtensionId: extensionBundle && extensionBundle.expectedExtensionId || extensionInfo && extensionInfo.expectedExtensionId || '',
      discoveredExtensionId: extensionBundle && extensionBundle.extensionId || '',
      discoveredExtensionIds: extensionBundle && extensionBundle.extensionDiscovery && extensionBundle.extensionDiscovery.discoveredExtensionIds || [],
      loadedExtensionIds: extensionBundle && extensionBundle.extensionDiscovery && extensionBundle.extensionDiscovery.loadedExtensionIds || [],
      extensionPath: extensionBundle && extensionBundle.extensionPath || extensionInfo && extensionInfo.extensionPath || '',
      extensionManifest: extensionBundle && extensionBundle.extensionManifest || extensionInfo,
      extensionLoad,
      extensionAction,
      extensionServiceWorkerOpen,
      extensionDiscovery: extensionBundle && extensionBundle.extensionDiscovery || null,
      expectedPageProbe: extensionBundle && extensionBundle.expectedPageProbe || null,
      targetDiagnostics: targetBundle && targetBundle.diagnostics || null,
      targetProbe: targetBundle && targetBundle.targetProbe || null,
      targetProbeSummary: targetBundle && targetBundle.targetProbeSummary || null,
      cdpControlDiagnostics: controlBundle && controlBundle.diagnostics || null,
      pageStatus: error && error.pageStatus || null,
      navigationStage: error && error.navigationStage || '',
      navigationErrorText: error && error.navigationErrorText || '',
      blockers,
      rawErrorStatus: error && error.rawErrorStatus || rawStatus,
      error: String(error && error.message || error),
      launch,
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
