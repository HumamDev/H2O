#!/usr/bin/env node
// Validator for Phase E.1.1 Chrome saved-chat archive delivery companion on save.
//
// Static checks keep the listener flag-gated, deliver-only, deduped, and free of
// Desktop/queue/package/CAS/store/network paths and of the byte-locked monolith.
// VM checks prove the helper gates on the flag, selects only saved snapshot-backed
// rows, dedupes per chatId|snapshotId, and delivers metadata-only requests.

import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..', '..', '..');

const MODULE_REL = 'src-surfaces-base/studio/ingestion/saved-chat-archive-on-save.mv3.js';
const MODULE_FILE = 'saved-chat-archive-on-save.mv3.js';
const STUDIO_HTML_REL = 'src-surfaces-base/studio/studio.html';
const PACK_STUDIO_REL = 'tools/product/studio/pack-studio.mjs';
const AMENDMENT_REL = 'release-evidence/2026-06-24/saved-chat-archive-main-save-action-e1a-contract-amendment.md';
const DELIVERY_RUNTIME_VALIDATOR_REL = 'tools/validation/studio/validate-saved-chat-archive-request-delivery-runtime-v1.mjs';
const CORE_REL = 'src-surfaces-base/studio/S0F0j. 🎬 Library Actions Core - Studio.js';
const FACADE_REL = 'src-surfaces-base/studio/S0F1j. 🎬 Library Actions - Studio.js';

const PASS = [];
const FAIL = [];

function readRepo(rel) {
  return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
}
function check(label, fn) {
  try { fn(); PASS.push(label); console.log(`  PASS ${label}`); }
  catch (err) { const m = err && err.message ? err.message : String(err); FAIL.push({ label, message: m }); console.log(`  FAIL ${label}`); console.log(`       ${m}`); }
}
async function checkAsync(label, fn) {
  try { await fn(); PASS.push(label); console.log(`  PASS ${label}`); }
  catch (err) { const m = err && err.message ? err.message : String(err); FAIL.push({ label, message: m }); console.log(`  FAIL ${label}`); console.log(`       ${m}`); }
}
function stripComments(src) {
  return String(src).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function createSandbox(opts = {}) {
  const flagOn = opts.flagOn === true;
  const deliverCalls = opts.deliverCalls || [];
  const context = {
    console, Date, JSON, Math, Number, Object, Array, Promise, RegExp, String,
    setTimeout: () => 0,
    clearTimeout: () => {},
    addEventListener: () => {},
    H2O: {
      flags: { get: (key, dflt) => (key === 'archive.deliverOnSaveToFolder' ? flagOn : dflt) },
      Studio: { ingestion: {
        deliverSavedChatArchiveRequestV1: async (options) => {
          deliverCalls.push(options);
          return { ok: true, status: 'delivered', requestId: 'req_e11', dedupeKey: 'sha256-e11' };
        },
      } },
    },
  };
  context.globalThis = context;
  context.window = context;
  context.__deliverCalls = deliverCalls;
  return vm.createContext(context);
}
function loadModule(context) {
  vm.runInContext(readRepo(MODULE_REL), context, { filename: MODULE_REL });
  const ing = context.H2O?.Studio?.ingestion || {};
  assert.equal(typeof ing.maybeDeliverSavedChatArchiveOnSaveToFolderV1, 'function', 'helper not registered');
  assert.equal(typeof ing.diagnoseSavedChatArchiveOnSaveToFolderV1, 'function', 'diagnose not registered');
  return ing;
}
function savedRow(over = {}) {
  return {
    chatId: 'chat_e11', snapshotId: 'snap_e11', title: 'A saved chat',
    isSaved: true, displayView: 'saved', badgeKind: 'Saved',
    folderId: 'folder_e11', categoryId: 'cat_e11', projectId: 'proj_e11',
    labels: ['l1'], tags: ['t1'], messageCount: 4, href: 'https://chatgpt.com/c/native_e11',
    ...over,
  };
}

const src = readRepo(MODULE_REL);
const code = stripComments(src);
const studioHtml = readRepo(STUDIO_HTML_REL);
const packStudio = readRepo(PACK_STUDIO_REL);

console.log('[saved-chat-archive-on-save-v1] static checks');

check('module exists and is Chrome/MV3 scoped with Tauri bail', () => {
  assert.ok(fs.existsSync(path.join(REPO_ROOT, MODULE_REL)));
  assert.match(MODULE_REL, /\.mv3\.js$/);
  assert.match(src, /Chrome \/ MV3/);
  assert.ok(src.includes('__TAURI_INTERNALS__'), 'must bail on Tauri/Desktop');
});

check('flag archive.deliverOnSaveToFolder defaults false via H2O.flags.get', () => {
  assert.match(src, /FLAG_KEY\s*=\s*'archive\.deliverOnSaveToFolder'/);
  assert.match(src, /flags\.get\(\s*FLAG_KEY\s*,\s*false\s*\)/);
  assert.ok(src.includes('H2O.flags'), 'must read H2O.flags');
});

check('listener uses the real index-update event and reads getAll()', () => {
  assert.ok(src.includes("evt:h2o:library-index:updated"), 'must listen on library-index:updated');
  assert.ok(src.includes('H2O.LibraryIndex') && src.includes('getAll('), 'must read H2O.LibraryIndex.getAll()');
});

check('candidate selection requires saved/snapshot-backed and excludes link-only', () => {
  assert.ok(src.includes('isSavedSnapshotBackedRow'), 'must gate on saved snapshot-backed rows');
  assert.ok(src.includes('isLinkOnlyRow'), 'must exclude link-only/Add-to-Library rows');
  assert.ok(src.includes('deriveSnapshotId'), 'must derive snapshotId');
  assert.ok(src.includes('missing-snapshot-id'), 'missing snapshotId must be a skip reason');
});

check('persistent chrome.storage.local dedupe keyed by chatId|snapshotId', () => {
  assert.ok(src.includes('chrome.storage') || src.includes('getChromeStorageLocal'), 'must use chrome.storage.local');
  assert.ok(src.includes('DEDUPE_STORAGE_KEY'), 'must persist a dedupe set');
  assert.match(src, /chatId\s*\+\s*'\|'\s*\+\s*snapshotId/, 'dedupe key must combine chatId|snapshotId');
  assert.ok(src.includes('markDelivered') && src.includes('isDelivered'), 'must mark/check delivered');
});

check('delivery uses only deliverSavedChatArchiveRequestV1', () => {
  assert.ok(src.includes('deliverSavedChatArchiveRequestV1'), 'must call the delivery API');
});

check('no forbidden Desktop/queue/package/CAS/store calls', () => {
  for (const token of [
    'enqueueSavedChatArchiveRequestV1',
    'materializeSavedChatArchiveRequestV1',
    'writeSavedChatPackageV1',
    'buildSavedChatPackageV1',
    'assetCas',
    'H2O.Studio.store',
    'nativeMessaging',
  ]) {
    assert.equal(code.includes(token), false, `forbidden token: ${token}`);
  }
  assert.doesNotMatch(code, /fetch\s*\(/, 'no network fetch');
  assert.doesNotMatch(code, /localhost|127\.0\.0\.1|WebDAV/i, 'no localhost/WebDAV');
});

check('no authoritative content fields are referenced', () => {
  for (const token of ['transcript', 'outerHTML', 'markdown', 'chatHtml', 'contentHash', 'casPath', 'packagePath']) {
    assert.equal(code.includes(token), false, `forbidden content token: ${token}`);
  }
  // word-boundary checks so messageCount / messages are not confused
  assert.doesNotMatch(code, /\bmessages\b/, 'no messages content');
  assert.doesNotMatch(code, /\bassets\b/, 'no assets content');
  assert.doesNotMatch(code, /\bhtml\b/i, 'no html content');
});

check('no polling/watcher/background loop', () => {
  assert.doesNotMatch(code, /setInterval/, 'no setInterval');
  assert.doesNotMatch(code, /MutationObserver/, 'no MutationObserver');
  // setTimeout is permitted only as a single one-shot debounce.
  assert.ok((code.match(/setTimeout/g) || []).length <= 1, 'at most one setTimeout (debounce), no timer loop');
});

check('no app-wide floating button/overlay (no DOM injection)', () => {
  assert.doesNotMatch(code, /createElement/, 'must not build DOM');
  assert.doesNotMatch(code, /position:\s*fixed/i, 'no fixed/floating overlay');
  assert.doesNotMatch(code, /appendChild/, 'no DOM injection');
});

check('module is loaded in studio.html and shipped in pack-studio (both lists)', () => {
  assert.ok(studioHtml.includes(`./ingestion/${MODULE_FILE}`), 'loader missing from studio.html');
  const occurrences = [...packStudio.matchAll(new RegExp(MODULE_FILE.replace(/\./g, '\\.'), 'g'))].length;
  assert.ok(occurrences >= 2, 'module must appear in pack input and output lists');
});

check('byte-locked S0F0j and the S0F1j facade exist and are not staged in this commit', () => {
  assert.ok(fs.existsSync(path.join(REPO_ROOT, CORE_REL)), 'S0F0j must exist');
  assert.ok(fs.existsSync(path.join(REPO_ROOT, FACADE_REL)), 'S0F1j must exist');
  // The module must not embed/reference those monolith basenames.
  assert.equal(code.includes('Library Actions Core'), false, 'module must not reference the core monolith');
  // Confirm neither monolith is part of this commit's staged change set.
  let staged = '';
  try { staged = execSync('git diff --cached --name-only', { cwd: REPO_ROOT }).toString(); }
  catch (_) { staged = ''; }
  assert.equal(/S0F0j\. /.test(staged), false, 'S0F0j must not be staged');
  assert.equal(/S0F1j\. /.test(staged), false, 'S0F1j must not be staged');
});

check('E.1.0a amendment and D.3C delivery runtime validator are present', () => {
  assert.ok(fs.existsSync(path.join(REPO_ROOT, AMENDMENT_REL)), 'E.1.0a amendment must exist');
  const amend = readRepo(AMENDMENT_REL);
  assert.ok(amend.includes('evt:h2o:library-index:updated'), 'amendment must reference the corrected trigger');
  assert.ok(fs.existsSync(path.join(REPO_ROOT, DELIVERY_RUNTIME_VALIDATOR_REL)), 'D.3C runtime validator must exist');
});

console.log('[saved-chat-archive-on-save-v1] VM behavior checks');

await checkAsync('flag OFF: helper is a no-op (skipped-flag-off), no delivery', async () => {
  const sandbox = createSandbox({ flagOn: false });
  const ing = loadModule(sandbox);
  const res = await ing.maybeDeliverSavedChatArchiveOnSaveToFolderV1({ row: savedRow() });
  assert.equal(res.status, 'skipped-flag-off');
  assert.equal(sandbox.__deliverCalls.length, 0);
});

await checkAsync('flag ON: saved snapshot-backed row delivers a metadata-only request', async () => {
  const sandbox = createSandbox({ flagOn: true });
  const ing = loadModule(sandbox);
  const res = await ing.maybeDeliverSavedChatArchiveOnSaveToFolderV1({ row: savedRow() });
  assert.equal(res.status, 'delivered');
  assert.equal(sandbox.__deliverCalls.length, 1);
  const opts = sandbox.__deliverCalls[0];
  assert.equal(opts.confirmDelivery, true);
  assert.equal(opts.builderOptions.desktopResolution.studioChatId, 'chat_e11');
  assert.equal(opts.builderOptions.desktopResolution.snapshotId, 'snap_e11');
  assert.equal(opts.builderOptions.intent.kind, 'save-to-folder');
  const text = JSON.stringify(opts);
  for (const forbidden of ['transcript', 'outerHTML', 'contentHash', '"messages"', '"assets"', '"html"']) {
    assert.equal(text.includes(forbidden), false, `delivered options carry forbidden field: ${forbidden}`);
  }
});

await checkAsync('dedupe: second delivery of the same row is skipped locally', async () => {
  const sandbox = createSandbox({ flagOn: true });
  const ing = loadModule(sandbox);
  await ing.maybeDeliverSavedChatArchiveOnSaveToFolderV1({ row: savedRow() });
  const again = await ing.maybeDeliverSavedChatArchiveOnSaveToFolderV1({ row: savedRow() });
  assert.equal(again.status, 'already-delivered-locally');
  assert.equal(sandbox.__deliverCalls.length, 1, 'must not re-deliver');
});

await checkAsync('missing snapshotId is skipped (not delivered, not marked)', async () => {
  const sandbox = createSandbox({ flagOn: true });
  const ing = loadModule(sandbox);
  const res = await ing.maybeDeliverSavedChatArchiveOnSaveToFolderV1({ row: savedRow({ snapshotId: '', lastSnapshotId: '', latestSnapshotId: '' }) });
  assert.equal(res.status, 'missing-snapshot-id');
  assert.equal(sandbox.__deliverCalls.length, 0);
});

await checkAsync('link-only / Add-to-Library row is not delivered', async () => {
  const sandbox = createSandbox({ flagOn: true });
  const ing = loadModule(sandbox);
  const linked = await ing.maybeDeliverSavedChatArchiveOnSaveToFolderV1({ row: savedRow({ isSaved: false, isLinked: true, displayView: 'link', badgeKind: 'Link' }) });
  assert.equal(linked.status, 'skipped-not-saved-row');
  assert.equal(sandbox.__deliverCalls.length, 0);
});

await checkAsync('diagnose reports flag/dedupe/event wiring without delivering', async () => {
  const sandbox = createSandbox({ flagOn: false });
  const ing = loadModule(sandbox);
  const d = ing.diagnoseSavedChatArchiveOnSaveToFolderV1();
  assert.equal(d.flagKey, 'archive.deliverOnSaveToFolder');
  assert.equal(d.enabled, false);
  assert.equal(d.eventIndexUpdated, 'evt:h2o:library-index:updated');
  assert.equal(d.automaticMaterialization, false);
  assert.equal(d.pollingEnabled, false);
  assert.equal(sandbox.__deliverCalls.length, 0);
});

if (FAIL.length) {
  console.error(`[saved-chat-archive-on-save-v1] FAIL ${FAIL.length} checks failed`);
  process.exit(1);
}
console.log(`[saved-chat-archive-on-save-v1] PASS ${PASS.length} checks`);
