#!/usr/bin/env node
// Validator for Phase D.3C.1 Chrome saved-chat archive request delivery module.
//
// Static checks keep delivery metadata-only and free of Desktop/queue/package/
// CAS/sync/native/network paths. VM checks prove the module registers its API,
// re-asserts envelope safety before any write, and degrades cleanly when the
// File System Access API is unavailable.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { TextEncoder } from 'node:util';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..', '..', '..');

const DELIVERY_REL = 'src-surfaces-base/studio/ingestion/saved-chat-archive-request-delivery.mv3.js';
const DELIVERY_FILE = 'saved-chat-archive-request-delivery.mv3.js';
const STUDIO_HTML_REL = 'src-surfaces-base/studio/studio.html';
const PACK_STUDIO_REL = 'tools/product/studio/pack-studio.mjs';
const CONTRACT_VALIDATOR_REL = 'tools/validation/studio/validate-saved-chat-archive-request-delivery-v1.mjs';
const REQUEST_SCHEMA = 'h2o.savedChatArchiveRequest.v1';

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
    TextEncoder,
    Uint8Array,
    H2O: { Studio: { ingestion: {} } },
  };
  // Deliberately no __TAURI_INTERNALS__ (module installs), no showDirectoryPicker
  // and no indexedDB (File System Access API unavailable path).
  context.globalThis = context;
  context.window = context;
  return vm.createContext(context);
}

function loadDelivery(context) {
  vm.runInContext(readRepo(DELIVERY_REL), context, { filename: DELIVERY_REL });
  const ing = context.H2O?.Studio?.ingestion || {};
  for (const name of [
    'diagnoseSavedChatArchiveRequestDeliveryV1',
    'connectSavedChatArchiveRequestFolderV1',
    'disconnectSavedChatArchiveRequestFolderV1',
    'deliverSavedChatArchiveRequestV1',
    'readSavedChatArchiveRequestReceiptV1',
    'refreshSavedChatArchiveRequestStatusV1',
  ]) {
    assert.equal(typeof ing[name], 'function', `delivery API ${name} was not registered`);
  }
  return ing;
}

function safeEnvelope(overrides = {}) {
  return {
    schema: REQUEST_SCHEMA,
    requestId: 'req_d3c1_test',
    dedupeKey: 'sha256-dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
    createdAt: '2026-06-26T00:00:00.000Z',
    source: { surface: 'chrome-studio', nativeConversationId: 'native_d3c1' },
    desktopResolution: { snapshotId: 'snap_d3c1', requireExistingDesktopSnapshot: true },
    intent: { kind: 'save-to-folder', target: {} },
    payloadPolicy: { containsSnapshotContent: false, containsAssets: false },
    ...overrides,
  };
}

const deliverySource = readRepo(DELIVERY_REL);
const deliveryCode = stripComments(deliverySource);
const studioHtml = readRepo(STUDIO_HTML_REL);
const packStudio = readRepo(PACK_STUDIO_REL);

console.log('[saved-chat-archive-request-delivery-runtime-v1] static checks');

check('delivery module exists and is Chrome/MV3 scoped', () => {
  assert.ok(fs.existsSync(path.join(REPO_ROOT, DELIVERY_REL)));
  assert.match(DELIVERY_REL, /\.mv3\.js$/);
  assert.match(deliverySource, /Chrome \/ MV3/);
});

check('all four delivery APIs are registered under H2O.Studio.ingestion', () => {
  for (const name of [
    'diagnoseSavedChatArchiveRequestDeliveryV1',
    'connectSavedChatArchiveRequestFolderV1',
    'disconnectSavedChatArchiveRequestFolderV1',
    'deliverSavedChatArchiveRequestV1',
  ]) {
    assert.match(deliverySource, new RegExp(`H2O\\.Studio\\.ingestion\\.${name}\\s*=`), `missing API registration ${name}`);
  }
});

check('module references File System Access API surface and constants', () => {
  for (const token of [
    'File System Access API',
    'showDirectoryPicker',
    'indexedDB',
    'h2o.studio.archive-requests.folder.mv3',
    'handles',
    'archive-requests-folder',
    'H2O Studio Archive Requests',
    'inbox',
    '.request.json',
    '.request.json.tmp',
    'move(',
    'removeEntry',
  ]) {
    assert.ok(deliverySource.includes(token), `missing required reference: ${token}`);
  }
});

check('IndexedDB identity is dedicated and separate from Sync', () => {
  assert.match(deliverySource, /IDB_NAME\s*=\s*'h2o\.studio\.archive-requests\.folder\.mv3'/);
  assert.match(deliverySource, /IDB_STORE\s*=\s*'handles'/);
  assert.match(deliverySource, /IDB_KEY\s*=\s*'archive-requests-folder'/);
  assert.equal(deliveryCode.includes('h2o.studio.sync.folder.mv3'), false, 'must not reference the Sync folder IDB');
});

check('module re-asserts metadata-only payload policy false/false', () => {
  assert.match(deliverySource, /containsSnapshotContent\s*!==\s*false/);
  assert.match(deliverySource, /containsAssets\s*!==\s*false/);
  assert.ok(deliverySource.includes('FORBIDDEN_KEYS'));
  assert.ok(deliverySource.includes('collectForbiddenKeys'));
});

check('module creates inbox only and never creates/writes receipts', () => {
  assert.match(deliverySource, /getDirectoryHandle\(INBOX_DIR,\s*\{\s*create:\s*true\s*\}\)/);
  // Receipts folder is Desktop-owned: opened read-only, never with create:true.
  assert.ok(deliverySource.includes('getDirectoryHandle(RECEIPTS_DIR)'), 'receipts dir should be opened read-only');
  assert.doesNotMatch(deliveryCode, /getDirectoryHandle\(RECEIPTS_DIR,\s*\{\s*create:\s*true\s*\}\)/, 'must not create receipts/');
  assert.doesNotMatch(deliveryCode, /getFileHandle\(receiptFileName,\s*\{\s*create:\s*true\s*\}\)/, 'must not create receipt files');
  assert.equal(deliveryCode.includes('writeReceipt'), false, 'must not write receipts');
});

check('module reads receipts read-only (D.3C.3) and validates them', () => {
  assert.match(deliverySource, /H2O\.Studio\.ingestion\.readSavedChatArchiveRequestReceiptV1\s*=/);
  assert.ok(deliverySource.includes('h2o.savedChatArchiveRequestReceipt.v1'), 'receipt schema must be checked');
  assert.ok(deliverySource.includes('.receipt.json'), 'receipt file suffix must be referenced');
  assert.ok(deliverySource.includes('getFile()'), 'read-back must read the receipt file');
  assert.ok(deliverySource.includes('receipt.requestId'), 'read-back must check the receipt requestId');
  assert.match(deliverySource, /MAX_RECEIPT_BYTES/, 'read-back must enforce a size cap');
});

check('module finalizes via move() with copy-then-delete fallback', () => {
  assert.match(deliverySource, /tmpHandle\.move\(fileName\)/);
  assert.match(deliverySource, /removeEntry\(tmpFileName\)/);
});

check('module makes no forbidden Desktop/queue/package/CAS calls', () => {
  for (const token of [
    'enqueueSavedChatArchiveRequestV1',
    'materializeSavedChatArchiveRequestV1',
    'writeSavedChatPackageV1',
    'buildSavedChatPackageV1',
    'assetCas',
    'nativeMessaging',
    'H2O.Studio.store',
    'autoImport',
    'folderImport',
  ]) {
    assert.equal(deliveryCode.includes(token), false, `forbidden delivery token: ${token}`);
  }
  assert.doesNotMatch(deliveryCode, /fetch\s*\(/, 'must not use network fetch');
  assert.doesNotMatch(deliveryCode, /localhost|127\.0\.0\.1|WebDAV/i, 'must not reference localhost/WebDAV');
});

check('module does not reference Sync / smoke / archive-store surfaces', () => {
  for (const token of [
    'H2O Studio Sync',
    '.h2o-smoke',
    'latest.json',
    'archive/packages',
    '$APPLOCALDATA/archive',
  ]) {
    assert.equal(deliveryCode.includes(token), false, `forbidden surface reference: ${token}`);
  }
});

check('module has no polling/watcher/background behavior', () => {
  assert.doesNotMatch(deliveryCode, /setInterval/, 'no setInterval');
  assert.doesNotMatch(deliveryCode, /setTimeout/, 'no setTimeout');
  assert.doesNotMatch(deliveryCode, /MutationObserver/, 'no MutationObserver');
});

check('delivery module is loaded after the builder in studio.html', () => {
  const builderIndex = studioHtml.indexOf('./ingestion/saved-chat-archive-request-builder.mv3.js');
  const deliveryIndex = studioHtml.indexOf(`./ingestion/${DELIVERY_FILE}`);
  const intakeIndex = studioHtml.indexOf('./ingestion/saved-chat-archive-requests.tauri.js');
  assert.ok(builderIndex > 0, 'builder loader missing from studio.html');
  assert.ok(deliveryIndex > builderIndex, 'delivery should load after the builder');
  assert.ok(intakeIndex > deliveryIndex, 'Desktop intake should load after delivery');
});

check('delivery module is in the pack-studio input and output lists', () => {
  const occurrences = [...packStudio.matchAll(new RegExp(DELIVERY_FILE.replace(/\./g, '\\.'), 'g'))].length;
  assert.ok(occurrences >= 2, 'delivery should appear in pack input and output lists');
});

check('D.3C.0 contract validator remains present', () => {
  assert.ok(fs.existsSync(path.join(REPO_ROOT, CONTRACT_VALIDATOR_REL)));
});

console.log('[saved-chat-archive-request-delivery-runtime-v1] VM behavior checks');

await checkAsync('diagnose returns a structured result when FSA is unavailable', async () => {
  const sandbox = createSandbox();
  const ing = loadDelivery(sandbox);
  const result = await ing.diagnoseSavedChatArchiveRequestDeliveryV1();
  assert.equal(result.schema, 'h2o.studio.archive-request-delivery-diagnostics.v1');
  assert.equal(result.fileSystemAccessAvailable, false);
  assert.equal(result.indexedDbAvailable, false);
  assert.equal(result.folderConnected, false);
  assert.equal(result.automaticDeliveryEnabled, false);
  assert.equal(result.backgroundDeliveryEnabled, false);
  assert.equal(result.readBackImplemented, true);
  assert.equal(result.readBackAutomatic, false);
  assert.equal(result.expectedFolderName, 'H2O Studio Archive Requests');
});

await checkAsync('unsafe envelope with payloadPolicy true/true is rejected before write', async () => {
  const sandbox = createSandbox();
  const ing = loadDelivery(sandbox);
  const result = await ing.deliverSavedChatArchiveRequestV1({
    confirmDelivery: true,
    envelope: safeEnvelope({ payloadPolicy: { containsSnapshotContent: true, containsAssets: true } }),
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'unsafe-envelope');
  assert.ok(result.blockers.includes('snapshot-content-not-false'));
  assert.ok(result.blockers.includes('assets-not-false'));
});

await checkAsync('envelope carrying contentHash is rejected before write', async () => {
  const sandbox = createSandbox();
  const ing = loadDelivery(sandbox);
  const result = await ing.deliverSavedChatArchiveRequestV1({
    confirmDelivery: true,
    envelope: safeEnvelope({ source: { contentHash: 'sha256-eeee' } }),
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'unsafe-envelope');
  assert.ok(result.blockers.some((b) => b.indexOf('forbidden-payload-fields') === 0));
});

await checkAsync('safe envelope without confirmDelivery is delivery-disabled (no silent write)', async () => {
  const sandbox = createSandbox();
  const ing = loadDelivery(sandbox);
  const result = await ing.deliverSavedChatArchiveRequestV1({ envelope: safeEnvelope() });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'delivery-disabled');
  assert.equal(result.requestId, 'req_d3c1_test');
});

await checkAsync('confirmed delivery with no connected folder reports not-connected', async () => {
  const sandbox = createSandbox();
  const ing = loadDelivery(sandbox);
  const result = await ing.deliverSavedChatArchiveRequestV1({ confirmDelivery: true, envelope: safeEnvelope() });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'archive-request-folder-not-connected');
  assert.equal(result.fileName, 'req_d3c1_test.request.json');
  assert.equal(result.tmpFileName, 'req_d3c1_test.request.json.tmp');
});

await checkAsync('disconnect with no stored handle reports not-connected', async () => {
  const sandbox = createSandbox();
  const ing = loadDelivery(sandbox);
  const result = await ing.disconnectSavedChatArchiveRequestFolderV1();
  assert.equal(result.status, 'not-connected');
  assert.equal(result.folderConnected, false);
});

await checkAsync('connect without File System Access API reports unavailable', async () => {
  const sandbox = createSandbox();
  const ing = loadDelivery(sandbox);
  const result = await ing.connectSavedChatArchiveRequestFolderV1();
  assert.equal(result.status, 'file-system-access-unavailable');
});

await checkAsync('receipt read-back is registered and read-only', async () => {
  const sandbox = createSandbox();
  const ing = loadDelivery(sandbox);
  assert.equal(typeof ing.readSavedChatArchiveRequestReceiptV1, 'function');
  assert.equal(typeof ing.refreshSavedChatArchiveRequestStatusV1, 'function');
});

await checkAsync('receipt read-back with no connected folder reports not-connected', async () => {
  const sandbox = createSandbox();
  const ing = loadDelivery(sandbox);
  const result = await ing.readSavedChatArchiveRequestReceiptV1({ requestId: 'req_d3c1_test' });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'archive-request-folder-not-connected');
  assert.equal(result.receiptFileName, 'req_d3c1_test.receipt.json');
});

await checkAsync('receipt read-back rejects an unsafe/empty requestId', async () => {
  const sandbox = createSandbox();
  const ing = loadDelivery(sandbox);
  const empty = await ing.readSavedChatArchiveRequestReceiptV1({});
  assert.equal(empty.status, 'receipt-request-id-mismatch');
  const unsafe = await ing.readSavedChatArchiveRequestReceiptV1({ requestId: '../escape' });
  assert.equal(unsafe.status, 'receipt-request-id-mismatch');
});

if (FAIL.length) {
  console.error(`[saved-chat-archive-request-delivery-runtime-v1] FAIL ${FAIL.length} checks failed`);
  process.exit(1);
}

console.log(`[saved-chat-archive-request-delivery-runtime-v1] PASS ${PASS.length} checks`);
