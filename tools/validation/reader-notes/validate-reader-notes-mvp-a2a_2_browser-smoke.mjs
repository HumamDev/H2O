#!/usr/bin/env node
// Real-browser smoke for Studio Reader & Notes MVP-A2a.2b.
//
// This launches or attaches to Chrome through the Chrome DevTools Protocol and
// opens the local smoke HTML. The page loads the actual A2a resolver source
// files and exercises real browser DOM/Range behavior. No DOM dependencies are
// used from Node.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..', '..', '..');
const SMOKE_HTML_REL = 'tools/validation/reader-notes/reader-notes-a2a2-real-dom-smoke.html';
const CORE_REL = 'src-surfaces-base/studio/reader-notes/anchor-resolver.studio.js';
const DOM_REL = 'src-surfaces-base/studio/reader-notes/anchor-resolver-dom.studio.js';
const STUDIO_HTML_REL = 'src-surfaces-base/studio/studio.html';
const PACK_REL = 'tools/product/studio/pack-studio.mjs';
const DEFAULT_PORT = 9338;
const DEFAULT_TIMEOUT_MS = 30000;
const CHROME_CANDIDATES = [
  '/Applications/Google Chrome Dev.app/Contents/MacOS/Google Chrome Dev',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  'google-chrome',
  'chromium',
  'chromium-browser',
];

function parseArgs(argv) {
  const out = {
    mode: 'launch',
    port: DEFAULT_PORT,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    chromePath: '',
    userDataDir: path.join(os.tmpdir(), 'h2o-reader-notes-a2a2-chrome-profile'),
    keepOpen: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--mode') out.mode = String(argv[++i] || out.mode);
    else if (arg === '--port') out.port = Number(argv[++i] || out.port);
    else if (arg === '--timeout-ms') out.timeoutMs = Number(argv[++i] || out.timeoutMs);
    else if (arg === '--chrome-path') out.chromePath = String(argv[++i] || '');
    else if (arg === '--user-data-dir') out.userDataDir = String(argv[++i] || out.userDataDir);
    else if (arg === '--keep-open') out.keepOpen = true;
    else if (arg === '--help') {
      console.log([
        'Usage:',
        '  node tools/validation/reader-notes/validate-reader-notes-mvp-a2a_2_browser-smoke.mjs',
        '  node tools/validation/reader-notes/validate-reader-notes-mvp-a2a_2_browser-smoke.mjs --mode attach --port 9338',
        '',
        'Options:',
        '  --mode launch|attach',
        '  --port <number>',
        '  --chrome-path <path>',
        '  --user-data-dir <path>',
        '  --timeout-ms <ms>',
        '  --keep-open',
      ].join('\n'));
      process.exit(0);
    }
  }
  return out;
}

function existsExecutable(candidate) {
  if (!candidate || candidate.includes('/')) return fs.existsSync(candidate);
  const paths = String(process.env.PATH || '').split(path.delimiter);
  return paths.some((dir) => fs.existsSync(path.join(dir, candidate)));
}

function findChrome(explicit) {
  if (explicit) return fs.existsSync(explicit) ? explicit : '';
  return CHROME_CANDIDATES.find(existsExecutable) || '';
}

function httpJson(port, requestPath, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1',
      port,
      path: requestPath,
      method,
    }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`HTTP ${res.statusCode}: ${body.slice(0, 300)}`));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(new Error(`invalid JSON from ${requestPath}: ${String(error && error.message || error)}`));
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForCdp(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      return await httpJson(port, '/json/version');
    } catch (error) {
      lastError = error;
      await sleep(250);
    }
  }
  throw new Error(`Chrome CDP not available on port ${port}: ${String(lastError && lastError.message || lastError)}`);
}

async function openTarget(port, url) {
  const encoded = encodeURIComponent(url);
  try {
    return await httpJson(port, `/json/new?${encoded}`, 'PUT');
  } catch (_) {
    return await httpJson(port, `/json/new?${encoded}`, 'GET');
  }
}

function cdpConnect(wsUrl) {
  assert.equal(typeof WebSocket, 'function', 'Node global WebSocket is required for CDP smoke');
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const pending = new Map();
    let nextId = 1;
    let opened = false;

    ws.addEventListener('open', () => {
      opened = true;
      resolve({
        send(method, params = {}) {
          const id = nextId;
          nextId += 1;
          const payload = { id, method, params };
          return new Promise((res, rej) => {
            pending.set(id, { resolve: res, reject: rej });
            ws.send(JSON.stringify(payload));
          });
        },
        close() {
          try { ws.close(); } catch (_) { /* ignore */ }
        },
      });
    }, { once: true });

    ws.addEventListener('message', (event) => {
      let message;
      try { message = JSON.parse(String(event.data)); } catch { return; }
      if (!message || !message.id || !pending.has(message.id)) return;
      const item = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) item.reject(new Error(JSON.stringify(message.error)));
      else item.resolve(message.result);
    });

    ws.addEventListener('error', (event) => {
      const err = new Error(`CDP WebSocket error${opened ? '' : ' before open'}`);
      if (!opened) reject(err);
      for (const item of pending.values()) item.reject(err);
      pending.clear();
    });
  });
}

async function readSmokeResult(client, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const evaluated = await client.send('Runtime.evaluate', {
      expression: 'JSON.stringify(window.__H2O_READER_NOTES_A2A2_SMOKE_RESULT || null)',
      returnByValue: true,
    });
    const value = evaluated && evaluated.result && evaluated.result.value;
    if (value && value !== 'null') return JSON.parse(value);
    await sleep(250);
  }
  throw new Error('timed out waiting for browser smoke result');
}

function staticBoundaryChecks() {
  const core = fs.readFileSync(path.join(REPO_ROOT, CORE_REL), 'utf8');
  const dom = fs.readFileSync(path.join(REPO_ROOT, DOM_REL), 'utf8');
  const html = fs.readFileSync(path.join(REPO_ROOT, STUDIO_HTML_REL), 'utf8');
  const pack = fs.readFileSync(path.join(REPO_ROOT, PACK_REL), 'utf8');
  assert.ok(!dom.includes('document.evaluate'), 'DOM wrapper must not use document.evaluate');
  assert.ok(!core.includes('document.evaluate'), 'core must not use document.evaluate');
  for (const token of ['chrome.', 'localStorage', 'sessionStorage', 'indexedDB']) {
    assert.ok(!dom.includes(token), `DOM wrapper must not use ${token}`);
    assert.ok(!core.includes(token), `core must not use ${token}`);
  }
  assert.ok(html.includes('reader-notes/library-item-view.studio.js'), 'studio.html must still load A1.1');
  assert.ok(html.includes('reader-notes/annotation-facade.studio.js'), 'studio.html must still load A1.2');
  assert.ok(pack.includes('reader-notes/library-item-view.studio.js'), 'pack-studio must still include A1.1');
  assert.ok(pack.includes('reader-notes/annotation-facade.studio.js'), 'pack-studio must still include A1.2');
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const smokeHtml = path.join(REPO_ROOT, SMOKE_HTML_REL);
  assert.ok(fs.existsSync(smokeHtml), `${SMOKE_HTML_REL} must exist`);
  staticBoundaryChecks();

  const chromePath = findChrome(options.chromePath);
  if (options.mode === 'launch' && !chromePath) {
    throw new Error('Chrome executable not found; pass --chrome-path or run in --mode attach');
  }

  let chrome = null;
  if (options.mode === 'launch') {
    fs.mkdirSync(options.userDataDir, { recursive: true });
    chrome = spawn(chromePath, [
      `--remote-debugging-port=${options.port}`,
      `--user-data-dir=${options.userDataDir}`,
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      'about:blank',
    ], { stdio: ['ignore', 'ignore', 'pipe'] });
  }

  let client = null;
  try {
    await waitForCdp(options.port, options.timeoutMs);
    const target = await openTarget(options.port, pathToFileURL(smokeHtml).href);
    assert.ok(target.webSocketDebuggerUrl, 'target must expose webSocketDebuggerUrl');
    client = await cdpConnect(target.webSocketDebuggerUrl);
    await client.send('Runtime.enable');
    const result = await readSmokeResult(client, options.timeoutMs);
    result.runner = {
      mode: options.mode,
      port: options.port,
      chromePath: options.mode === 'launch' ? chromePath : '',
      smokeHtml: SMOKE_HTML_REL,
      core: CORE_REL,
      dom: DOM_REL,
      cdp: true,
    };
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  } finally {
    if (client) client.close();
    if (chrome && !options.keepOpen) {
      try { chrome.kill('SIGTERM'); } catch (_) { /* ignore */ }
    }
  }
}

main().catch((error) => {
  console.error(JSON.stringify({
    schema: 'h2o.readerNotes.a2a2.realDomSmoke.result.v1',
    phase: 'MVP-A2a.2b',
    ok: false,
    status: 'real-dom-smoke-runner-failed',
    error: String(error && (error.stack || error.message) || error),
  }, null, 2));
  process.exitCode = 1;
});
