#!/usr/bin/env node
// Validator for Phase D.3C.2 Chrome archive-request delivery Settings UI.
//
// Static checks keep the card a thin manual utility (gesture-bound buttons,
// no read-back, no Desktop/queue/package/CAS/sync/network/Archive-Health paths).
// VM checks prove the module registers its API, builds a gesture-confirmed
// metadata-only test request, and degrades cleanly when delivery APIs are absent.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..', '..', '..');

const UI_REL = 'src-surfaces-base/studio/ingestion/saved-chat-archive-request-delivery-ui.studio.js';
const UI_FILE = 'saved-chat-archive-request-delivery-ui.studio.js';
const STUDIO_HTML_REL = 'src-surfaces-base/studio/studio.html';
const STUDIO_JS_REL = 'src-surfaces-base/studio/studio.js';
const PACK_STUDIO_REL = 'tools/product/studio/pack-studio.mjs';
const RUNTIME_VALIDATOR_REL = 'tools/validation/studio/validate-saved-chat-archive-request-delivery-runtime-v1.mjs';
const CONTRACT_VALIDATOR_REL = 'tools/validation/studio/validate-saved-chat-archive-request-delivery-v1.mjs';

const PASS = [];
const FAIL = [];

function readRepo(rel) {
  return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
}

function check(label, fn) {
  try {
    fn();
    PASS.push(label);
    console.log(`  PASS ${label}`);
  } catch (err) {
    const message = err && err.message ? err.message : String(err);
    FAIL.push({ label, message });
    console.log(`  FAIL ${label}`);
    console.log(`       ${message}`);
  }
}

async function checkAsync(label, fn) {
  try {
    await fn();
    PASS.push(label);
    console.log(`  PASS ${label}`);
  } catch (err) {
    const message = err && err.message ? err.message : String(err);
    FAIL.push({ label, message });
    console.log(`  FAIL ${label}`);
    console.log(`       ${message}`);
  }
}

function stripComments(src) {
  return String(src)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function createSandbox() {
  const context = {
    console,
    Date,
    JSON,
    Math,
    Number,
    Object,
    Array,
    Promise,
    RegExp,
    String,
    H2O: { Studio: {} },
  };
  context.globalThis = context;
  context.window = context;
  return vm.createContext(context);
}

function loadUi(context) {
  vm.runInContext(readRepo(UI_REL), context, { filename: UI_REL });
  const ui = context.H2O?.Studio?.archiveRequestDeliveryUi;
  assert.ok(ui && ui.__installed, 'archiveRequestDeliveryUi was not installed');
  for (const name of [
    'renderArchiveRequestDeliveryCard',
    'formatDeliveryDiagnostics',
    'formatDeliveryResult',
    'formatReceiptResult',
    'buildTestRequestOptions',
  ]) {
    assert.equal(typeof ui[name], 'function', `UI API ${name} was not registered`);
  }
  return ui;
}

function deepCollectKeys(value, out) {
  if (Array.isArray(value)) { value.forEach((v) => deepCollectKeys(v, out)); return; }
  if (value && typeof value === 'object') {
    Object.keys(value).forEach((k) => { out.add(k); deepCollectKeys(value[k], out); });
  }
}

const uiSource = readRepo(UI_REL);
const uiCode = stripComments(uiSource);
const studioHtml = readRepo(STUDIO_HTML_REL);
const studioJs = readRepo(STUDIO_JS_REL);
const packStudio = readRepo(PACK_STUDIO_REL);

console.log('[saved-chat-archive-request-delivery-ui-v1] static checks');

check('UI module exists and is Studio-scoped', () => {
  assert.ok(fs.existsSync(path.join(REPO_ROOT, UI_REL)));
  assert.match(UI_REL, /\.studio\.js$/);
  assert.match(uiSource, /Phase D\.3C\.2/);
  assert.ok(uiSource.includes('Archive Request Delivery'));
});

check('UI references all four D.3C.1 delivery APIs', () => {
  for (const name of [
    'diagnoseSavedChatArchiveRequestDeliveryV1',
    'connectSavedChatArchiveRequestFolderV1',
    'disconnectSavedChatArchiveRequestFolderV1',
    'deliverSavedChatArchiveRequestV1',
  ]) {
    assert.ok(uiSource.includes(name), `missing delivery API reference: ${name}`);
  }
});

check('UI confirms delivery explicitly (confirmDelivery: true)', () => {
  assert.match(uiSource, /confirmDelivery:\s*true/);
});

check('UI uses manual click handling (gesture-bound)', () => {
  assert.match(uiSource, /addEventListener\(\s*['"]click['"]/);
  assert.ok(uiSource.includes("'arDeliverySend'") || uiSource.includes('arDeliverySend'), 'missing send button id');
});

check('UI wires manual receipt read-back via the delivery API (D.3C.3)', () => {
  assert.ok(uiSource.includes('readSavedChatArchiveRequestReceiptV1'), 'UI must call the read-back API');
  assert.match(uiSource, /Check receipt/, 'UI must expose a Check receipt button');
  assert.ok(uiSource.includes('arDeliveryCheckReceipt'), 'missing check-receipt button id');
  assert.ok(uiSource.includes('lastDeliveredRequestId'), 'read-back must target the last delivered requestId');
  // The UI never reads files directly; it delegates to the delivery module.
  assert.equal(uiCode.includes('getFile('), false, 'UI must not read files directly');
  // Read-back must be manual: no interval/observer driving it.
  assert.doesNotMatch(uiCode, /setInterval/, 'read-back must not run on an interval');
});

check('UI makes no forbidden Desktop/queue/package/CAS calls', () => {
  for (const token of [
    'enqueueSavedChatArchiveRequestV1',
    'materializeSavedChatArchiveRequestV1',
    'writeSavedChatPackageV1',
    'buildSavedChatPackageV1',
    'assetCas',
    'nativeMessaging',
  ]) {
    assert.equal(uiCode.includes(token), false, `forbidden UI token: ${token}`);
  }
  assert.doesNotMatch(uiCode, /fetch\s*\(/, 'must not use network fetch');
  assert.doesNotMatch(uiCode, /localhost|127\.0\.0\.1|WebDAV/i, 'must not reference localhost/WebDAV');
});

check('UI has no polling/watcher behavior', () => {
  assert.doesNotMatch(uiCode, /setInterval/, 'no setInterval');
  assert.doesNotMatch(uiCode, /MutationObserver/, 'no MutationObserver');
});

check('UI does not touch the Archive Health UI', () => {
  for (const token of ['archiveHealthUi', 'renderArchiveHealthCard', 'wbSettingsArchiveHealthBox']) {
    assert.equal(uiCode.includes(token), false, `UI must not reference Archive Health token: ${token}`);
  }
});

check('UI module is loaded in studio.html', () => {
  assert.ok(studioHtml.includes(`./ingestion/${UI_FILE}`), 'delivery UI loader missing from studio.html');
});

check('UI module is in the pack-studio input and output lists', () => {
  const occurrences = [...packStudio.matchAll(new RegExp(UI_FILE.replace(/\./g, '\\.'), 'g'))].length;
  assert.ok(occurrences >= 2, 'delivery UI should appear in pack input and output lists');
});

check('studio.js mounts the delivery card separately from Archive Health', () => {
  assert.match(studioJs, /function mountSettingsArchiveRequestDeliveryCard/);
  assert.match(studioJs, /renderArchiveRequestDeliveryCard/);
  assert.match(studioJs, /wbSettingsArchiveRequestDeliveryBox/);
  assert.match(studioJs, /settingsArchiveRequestDeliveryCardHtml/);
  // Archive Health mount remains intact and untouched.
  assert.match(studioJs, /function mountSettingsArchiveHealthCard/);
});

check('D.3C.1 runtime and D.3C.0 contract validators remain present', () => {
  assert.ok(fs.existsSync(path.join(REPO_ROOT, RUNTIME_VALIDATOR_REL)));
  assert.ok(fs.existsSync(path.join(REPO_ROOT, CONTRACT_VALIDATOR_REL)));
});

console.log('[saved-chat-archive-request-delivery-ui-v1] VM behavior checks');

await checkAsync('buildTestRequestOptions is gesture-confirmed and metadata-only', async () => {
  const ui = loadUi(createSandbox());
  const opts = ui.buildTestRequestOptions();
  assert.equal(opts.confirmDelivery, true);
  assert.ok(opts.builderOptions && typeof opts.builderOptions === 'object');
  assert.match(String(opts.builderOptions.source.title), /D\.3C\.2/);
  const keys = new Set();
  deepCollectKeys(opts, keys);
  for (const forbidden of [
    'transcript', 'messages', 'html', 'outerHTML', 'markdown', 'assets',
    'images', 'blobs', 'casPath', 'packagePath', 'manifest', 'snapshot',
    'contentHash',
  ]) {
    assert.equal(keys.has(forbidden), false, `test request carries forbidden field: ${forbidden}`);
  }
});

await checkAsync('formatDeliveryResult maps delivered/unsafe outcomes', async () => {
  const ui = loadUi(createSandbox());
  const delivered = ui.formatDeliveryResult({
    ok: true, status: 'delivered', requestId: 'req_x', dedupeKey: 'sha256-x',
    fileName: 'req_x.request.json', atomicMethod: 'move',
  });
  assert.equal(delivered.ok, true);
  assert.equal(delivered.tone, 'ok');
  assert.ok(delivered.lines.some((l) => l[0] === 'fileName' && l[1] === 'req_x.request.json'));

  const unsafe = ui.formatDeliveryResult({ ok: false, status: 'unsafe-envelope', blockers: ['assets-not-false'] });
  assert.equal(unsafe.ok, false);
  assert.equal(unsafe.tone, 'block');
  assert.ok(unsafe.blockers.includes('assets-not-false'));
});

await checkAsync('render degrades to a Chrome-only message when APIs are absent', async () => {
  const ui = loadUi(createSandbox());
  let text = '';
  const fakeContainer = {
    querySelector() { return null; },
    set textContent(v) { text = String(v); },
    get textContent() { return text; },
  };
  ui.renderArchiveRequestDeliveryCard(fakeContainer);
  assert.match(text, /Chrome Studio only/);
});

await checkAsync('formatReceiptResult maps awaiting/queued/rejected outcomes', async () => {
  const ui = loadUi(createSandbox());
  const awaiting = ui.formatReceiptResult({ ok: false, status: 'delivered-awaiting-desktop', requestId: 'req_x' });
  assert.equal(awaiting.tone, 'warn');

  const queued = ui.formatReceiptResult({
    ok: true, status: 'queued-on-desktop', requestId: 'req_x',
    receipt: { status: 'validated', enqueueStatus: 'validated', dedupeKey: 'sha256-x' },
  });
  assert.equal(queued.ok, true);
  assert.equal(queued.tone, 'ok');
  assert.ok(queued.lines.some((l) => l[0] === 'receipt.status' && l[1] === 'validated'));

  const rejected = ui.formatReceiptResult({ ok: false, status: 'rejected-by-desktop', requestId: 'req_x', receipt: { status: 'rejected' } });
  assert.equal(rejected.tone, 'block');
});

if (FAIL.length) {
  console.error(`[saved-chat-archive-request-delivery-ui-v1] FAIL ${FAIL.length} checks failed`);
  process.exit(1);
}

console.log(`[saved-chat-archive-request-delivery-ui-v1] PASS ${PASS.length} checks`);
