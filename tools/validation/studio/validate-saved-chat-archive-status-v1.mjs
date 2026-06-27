#!/usr/bin/env node
// Validator for Phase E.2.1 saved-chat archive status model + on-save accessors.
//
// Static checks keep the status model pure (no DOM/timer/polling/storage/
// delivery/Desktop) and confirm the on-save read-only accessors and the
// backward-compatible delivered-map shape. VM checks prove the 10 product states
// and the saved-wins / link-only / missing-snapshot rules.

import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..', '..', '..');

const STATUS_REL = 'src-surfaces-base/studio/ingestion/saved-chat-archive-status.studio.js';
const STATUS_FILE = 'saved-chat-archive-status.studio.js';
const ONSAVE_REL = 'src-surfaces-base/studio/ingestion/saved-chat-archive-on-save.mv3.js';
const STUDIO_HTML_REL = 'src-surfaces-base/studio/studio.html';
const PACK_STUDIO_REL = 'tools/product/studio/pack-studio.mjs';
const STUDIO_JS_REL = 'src-surfaces-base/studio/studio.js';
const CORE_REL = 'src-surfaces-base/studio/S0F0j. 🎬 Library Actions Core - Studio.js';
const FACADE_REL = 'src-surfaces-base/studio/S0F1j. 🎬 Library Actions - Studio.js';

const STATES = [
  'archive-off', 'folder-not-connected', 'ready', 'archive-requested',
  'waiting-for-desktop', 'needs-desktop-snapshot', 'archived', 'already-archived',
  'failed', 'unknown-check-status',
];

const PASS = [];
const FAIL = [];

function readRepo(rel) { return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'); }
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
function createSandbox() {
  const context = { console, Date, JSON, Math, Number, Object, Array, Promise, RegExp, String, H2O: { Studio: { ingestion: {} } } };
  context.globalThis = context; context.window = context;
  return vm.createContext(context);
}
function loadStatus(context) {
  vm.runInContext(readRepo(STATUS_REL), context, { filename: STATUS_REL });
  const fn = context.H2O?.Studio?.ingestion?.computeSavedChatArchiveStatusV1;
  assert.equal(typeof fn, 'function', 'computeSavedChatArchiveStatusV1 not registered');
  return fn;
}
function savedRow(over = {}) {
  return { chatId: 'chat_e21', snapshotId: 'snap_e21', title: 'Saved chat', isSaved: true, displayView: 'saved', badgeKind: 'Saved', ...over };
}

const statusSrc = readRepo(STATUS_REL);
const statusCode = stripComments(statusSrc);
const onsaveSrc = readRepo(ONSAVE_REL);
const onsaveCode = stripComments(onsaveSrc);
const studioHtml = readRepo(STUDIO_HTML_REL);
const packStudio = readRepo(PACK_STUDIO_REL);
const studioJs = readRepo(STUDIO_JS_REL);

console.log('[saved-chat-archive-status-v1] static checks');

check('status model exists and registers computeSavedChatArchiveStatusV1', () => {
  assert.ok(fs.existsSync(path.join(REPO_ROOT, STATUS_REL)));
  assert.match(statusSrc, /H2O\.Studio\.ingestion\.computeSavedChatArchiveStatusV1\s*=/);
});

check('status model enumerates all 10 product states', () => {
  for (const s of STATES) assert.ok(statusSrc.includes(`'${s}'`), `missing state literal: ${s}`);
});

check('status model is pure (no DOM/timer/polling/storage/delivery/Desktop)', () => {
  for (const token of [
    'document', 'window.', 'setTimeout', 'setInterval', 'MutationObserver',
    'addEventListener', 'chrome.storage', 'localStorage', 'fetch(',
    'deliverSavedChatArchiveRequestV1', 'enqueueSavedChatArchiveRequestV1',
    'materializeSavedChatArchiveRequestV1', 'writeSavedChatPackageV1',
    'assetCas', 'plugin:sql', '__TAURI', 'nativeMessaging', 'localhost',
  ]) {
    assert.equal(statusCode.includes(token), false, `status model must not reference: ${token}`);
  }
});

check('status model inspects no authoritative content fields', () => {
  for (const token of ['transcript', 'outerHTML', 'markdown', 'contentHash', 'casPath', 'packagePath']) {
    assert.equal(statusCode.includes(token), false, `status model must not inspect: ${token}`);
  }
  assert.doesNotMatch(statusCode, /\bmessages\b/, 'no messages content');
  assert.doesNotMatch(statusCode, /\bassets\b/, 'no assets content');
});

check('status model reuses the listener saved-wins eligibility predicate', () => {
  assert.ok(statusSrc.includes('isSavedChatArchiveEligibleRowV1'), 'must prefer the exported eligibility predicate');
});

check('on-save module exports read-only accessors', () => {
  assert.match(onsaveSrc, /H2O\.Studio\.ingestion\.isSavedChatArchiveEligibleRowV1\s*=/);
  assert.match(onsaveSrc, /H2O\.Studio\.ingestion\.getSavedChatArchiveLocalDeliveryMetaV1\s*=/);
});

check('on-save delivered map is backward-compatible { requestId, deliveredAt }', () => {
  assert.ok(onsaveSrc.includes('normalizeDeliveredEntry'), 'must normalize legacy + new entry shapes');
  assert.match(onsaveSrc, /requestId:\s*cleanString\(requestId\)\s*\|\|\s*null,\s*deliveredAt:\s*nowIso\(\)/);
  assert.match(onsaveSrc, /markDelivered\(key,\s*cleanString\(result && result\.requestId\)/, 'must persist requestId on delivery');
});

check('module is loaded in studio.html and shipped in pack-studio (both lists)', () => {
  assert.ok(studioHtml.includes(`./ingestion/${STATUS_FILE}`), 'loader missing from studio.html');
  const occurrences = [...packStudio.matchAll(new RegExp(STATUS_FILE.replace(/\./g, '\\.'), 'g'))].length;
  assert.ok(occurrences >= 2, 'status module must appear in pack input and output lists');
});

check('no studio.js / S0F0j / S0F1j edits in this change set', () => {
  assert.ok(fs.existsSync(path.join(REPO_ROOT, CORE_REL)) && fs.existsSync(path.join(REPO_ROOT, FACADE_REL)));
  // The status model must not embed the monolith renderer or its basenames.
  assert.equal(statusCode.includes('renderRow'), false, 'status model must not touch renderRow');
  assert.equal(statusCode.includes('Library Actions'), false, 'status model must not reference the locked monoliths');
  let stagedLines = [];
  try { stagedLines = execSync('git diff --cached --name-only', { cwd: REPO_ROOT }).toString().split('\n').map((l) => l.trim()).filter(Boolean); }
  catch (_) { stagedLines = []; }
  assert.equal(stagedLines.some((l) => /S0F0j\. /.test(l)), false, 'S0F0j must not be staged');
  assert.equal(stagedLines.some((l) => /S0F1j\. /.test(l)), false, 'S0F1j must not be staged');
  assert.equal(stagedLines.includes('src-surfaces-base/studio/studio.js'), false, 'studio.js must not be staged');
});

console.log('[saved-chat-archive-status-v1] VM behavior checks');

await checkAsync('archive flag off => archive-off', async () => {
  const compute = loadStatus(createSandbox());
  const r = compute({ row: savedRow(), local: {}, diagnostics: { enabled: false, folderConnected: true }, receipt: {} });
  assert.equal(r.state, 'archive-off');
});

await checkAsync('folder not connected => folder-not-connected (offers connect)', async () => {
  const compute = loadStatus(createSandbox());
  const r = compute({ row: savedRow(), local: {}, diagnostics: { enabled: true, folderConnected: false }, receipt: {} });
  assert.equal(r.state, 'folder-not-connected');
  assert.equal(r.canConnectFolder, true);
});

await checkAsync('eligible, flag on, folder connected, not delivered => ready', async () => {
  const compute = loadStatus(createSandbox());
  const r = compute({ row: savedRow(), local: {}, diagnostics: { enabled: true, folderConnected: true }, receipt: {} });
  assert.equal(r.state, 'ready');
});

await checkAsync('legacy local delivery (no requestId) => archive-requested, not archived', async () => {
  const compute = loadStatus(createSandbox());
  const r = compute({ row: savedRow(), local: { delivered: true, requestId: null }, diagnostics: { enabled: true, folderConnected: true }, receipt: {} });
  assert.equal(r.state, 'archive-requested');
  assert.equal(r.canCheckStatus, false);
  assert.notEqual(r.state, 'archived');
});

await checkAsync('local delivery with requestId, no receipt => waiting-for-desktop', async () => {
  const compute = loadStatus(createSandbox());
  const r = compute({ row: savedRow(), local: { delivered: true, requestId: 'req_e21' }, diagnostics: { enabled: true, folderConnected: true }, receipt: {} });
  assert.equal(r.state, 'waiting-for-desktop');
  assert.equal(r.requestId, 'req_e21');
  assert.equal(r.canCheckStatus, true);
});

await checkAsync('receipt validated/queued => archived; duplicate => already-archived', async () => {
  const compute = loadStatus(createSandbox());
  const archived = compute({ row: savedRow(), local: { delivered: true, requestId: 'req_e21' }, diagnostics: {}, receipt: { status: 'queued-on-desktop' } });
  assert.equal(archived.state, 'archived');
  const dup = compute({ row: savedRow(), local: { delivered: true, requestId: 'req_e21' }, diagnostics: {}, receipt: { status: 'already-queued-duplicate' } });
  assert.equal(dup.state, 'already-archived');
});

await checkAsync('receipt needs-desktop-snapshot => needs-desktop-snapshot; rejected => failed', async () => {
  const compute = loadStatus(createSandbox());
  const needs = compute({ row: savedRow(), local: {}, diagnostics: {}, receipt: { status: 'needs-desktop-snapshot' } });
  assert.equal(needs.state, 'needs-desktop-snapshot');
  const failed = compute({ row: savedRow(), local: {}, diagnostics: {}, receipt: { status: 'rejected-by-desktop' } });
  assert.equal(failed.state, 'failed');
});

await checkAsync('saved + snapshot-backed + isLinked:true is eligible (ready/archived path, never not-eligible)', async () => {
  const compute = loadStatus(createSandbox());
  const r = compute({ row: savedRow({ isLinked: true }), local: {}, diagnostics: { enabled: true, folderConnected: true }, receipt: {} });
  assert.equal(r.state, 'ready', 'linked saved row must be eligible');
});

await checkAsync('true link-only row is ineligible and never shows archived', async () => {
  const compute = loadStatus(createSandbox());
  const r = compute({ row: { chatId: 'c', isSaved: false, isLinked: true, displayView: 'link', badgeKind: 'Link' }, local: { delivered: true, requestId: 'x' }, diagnostics: { enabled: true, folderConnected: true }, receipt: { status: 'queued-on-desktop' } });
  assert.equal(r.state, 'unknown-check-status');
  assert.equal(r.reason, 'not-eligible');
  for (const archivedish of ['archived', 'already-archived']) assert.notEqual(r.state, archivedish);
});

await checkAsync('eligible row with no snapshot (flag on, connected, not delivered) => needs-desktop-snapshot', async () => {
  const compute = loadStatus(createSandbox());
  const r = compute({ row: savedRow({ snapshotId: '', lastSnapshotId: '', latestSnapshotId: '' }), local: {}, diagnostics: { enabled: true, folderConnected: true }, receipt: {} });
  assert.equal(r.state, 'needs-desktop-snapshot');
  assert.notEqual(r.state, 'archived');
});

if (FAIL.length) {
  console.error(`[saved-chat-archive-status-v1] FAIL ${FAIL.length} checks failed`);
  process.exit(1);
}
console.log(`[saved-chat-archive-status-v1] PASS ${PASS.length} checks`);
