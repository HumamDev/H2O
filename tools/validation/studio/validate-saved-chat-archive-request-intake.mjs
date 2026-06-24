#!/usr/bin/env node
// Validator for Phase D.2A saved-chat archive request intake.
//
// Static checks prove the module is Desktop-only and read-only. VM checks prove
// request validation/resolution behavior without touching real Chrome, Desktop
// SQLite, package writer, CAS, Sync, import/recovery, capabilities, or UI.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..', '..', '..');

const MODULE_REL = 'src-surfaces-base/studio/ingestion/saved-chat-archive-requests.tauri.js';
const STUDIO_HTML_REL = 'src-surfaces-base/studio/studio.html';
const PACK_STUDIO_REL = 'tools/product/studio/pack-studio.mjs';
const CONTRACT_REL = 'docs/systems/archive/saved-chat-archive-request-v1.md';
const D1_VALIDATOR_REL = 'tools/validation/studio/validate-saved-chat-archive-request-contract.mjs';
const MODULE_NAME = 'saved-chat-archive-requests.tauri.js';
const REQUEST_SCHEMA = 'h2o.savedChatArchiveRequest.v1';
const RESOLUTION_SCHEMA = 'h2o.savedChatArchiveRequestResolution.v1';

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

function validEnvelope(overrides = {}) {
  const base = {
    schema: REQUEST_SCHEMA,
    requestId: 'req_d2a_valid',
    dedupeKey: 'sha256-1111111111111111111111111111111111111111111111111111111111111111',
    createdAt: '2026-06-24T00:00:00.000Z',
    source: {
      surface: 'chrome-studio',
      nativeConversationId: 'native_d2a',
      href: 'https://chatgpt.com/c/native_d2a',
      title: 'D2A request',
      capturedAt: '2026-06-24T00:00:00.000Z',
      captureDigest: 'sha256-2222222222222222222222222222222222222222222222222222222222222222',
      messageCount: 3,
    },
    desktopResolution: {
      studioChatId: 'chat_d2a',
      snapshotId: 'snap_d2a',
      requireExistingDesktopSnapshot: true,
    },
    intent: {
      kind: 'save-to-folder',
      target: {
        folderIdAtRequest: '',
        categoryIdAtRequest: '',
        projectIdAtRequest: '',
        labelIdsAtRequest: [],
        tagIdsAtRequest: [],
      },
    },
    payloadPolicy: {
      containsSnapshotContent: false,
      containsAssets: false,
    },
  };
  return merge(base, overrides);
}

function merge(base, overrides) {
  if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) return base;
  const out = Array.isArray(base) ? base.slice() : { ...base };
  for (const [key, value] of Object.entries(overrides)) {
    if (value && typeof value === 'object' && !Array.isArray(value) && base && typeof base[key] === 'object' && !Array.isArray(base[key])) {
      out[key] = merge(base[key], value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

function loadModule({ missingStore = false, missingChat = false, missingSnapshot = false, throwStore = false } = {}) {
  const chats = {
    get: async (chatId) => {
      if (throwStore) throw new Error('chat store unavailable');
      return missingChat ? null : { chatId, title: 'chat' };
    },
  };
  const snapshots = {
    get: async (snapshotId) => {
      if (throwStore) throw new Error('snapshot store unavailable');
      return missingSnapshot ? null : { snapshot: { snapshotId, chatId: 'chat_d2a', title: 'snapshot' }, turns: [] };
    },
    listByChat: async (chatId) => [{ snapshotId: `latest_${chatId}`, chatId }],
  };
  const context = {
    console,
    Date,
    JSON,
    H2O: { Studio: missingStore ? {} : { store: { chats, snapshots } } },
    __TAURI_INTERNALS__: { invoke: async () => { throw new Error('fs/sql invoke must not be called by request intake'); } },
  };
  context.globalThis = context;
  context.window = context;
  const sandbox = vm.createContext(context);
  vm.runInContext(readRepo(MODULE_REL), sandbox, { filename: MODULE_REL });
  return sandbox.H2O.Studio.ingestion;
}

const moduleSource = readRepo(MODULE_REL);
const moduleCode = stripComments(moduleSource);
const studioHtml = readRepo(STUDIO_HTML_REL);
const packStudio = readRepo(PACK_STUDIO_REL);
const contract = readRepo(CONTRACT_REL);

console.log('[saved-chat-archive-request-intake] static checks');

check('request intake module exists', () => {
  assert.ok(fs.existsSync(path.join(REPO_ROOT, MODULE_REL)));
});

check('D.1 contract and validator remain present', () => {
  assert.ok(fs.existsSync(path.join(REPO_ROOT, CONTRACT_REL)));
  assert.ok(fs.existsSync(path.join(REPO_ROOT, D1_VALIDATOR_REL)));
  assert.ok(contract.includes(REQUEST_SCHEMA));
});

check('module registers required H2O.Studio.ingestion APIs', () => {
  for (const api of [
    'validateSavedChatArchiveRequestV1',
    'resolveSavedChatArchiveRequestV1',
    'diagnoseSavedChatArchiveRequestIntakeV1',
  ]) {
    assert.match(moduleSource, new RegExp(`H2O\\.Studio\\.ingestion\\.${api}`));
  }
});

check('module is Desktop/Tauri gated', () => {
  assert.match(moduleSource, /function detectTauri/);
  assert.match(moduleSource, /__TAURI_INTERNALS__/);
  assert.match(moduleSource, /if \(!detectTauri\(\)\) return/);
});

check('module enforces request and resolution schemas', () => {
  assert.ok(moduleSource.includes(REQUEST_SCHEMA));
  assert.ok(moduleSource.includes(RESOLUTION_SCHEMA));
  assert.match(moduleSource, /envelope\.schema !== REQUEST_SCHEMA/);
});

check('module enforces D.2A payload policy', () => {
  assert.ok(moduleSource.includes('payloadPolicy.containsSnapshotContent must be false for D.2A'));
  assert.ok(moduleSource.includes('payloadPolicy.containsAssets must be false for D.2A'));
  assert.match(moduleSource, /containsSnapshotContent/);
  assert.match(moduleSource, /containsAssets/);
});

check('module exposes rejected / needs-desktop-snapshot / validated statuses', () => {
  for (const status of ['rejected', 'needs-desktop-snapshot', 'validated', 'db-unavailable', 'unsupported']) {
    assert.ok(moduleSource.includes(status), `missing status: ${status}`);
  }
});

check('module references only read-only store APIs', () => {
  assert.match(moduleSource, /\.chats/);
  assert.match(moduleSource, /\.get\b/);
  assert.match(moduleSource, /\.snapshots/);
  assert.match(moduleSource, /listByChat/);
  for (const banned of ['upsert', 'update', 'delete', 'remove', 'insert', 'write']) {
    const re = new RegExp(`\\.(chats|snapshots|assets)\\.${banned}\\s*\\(`);
    assert.ok(!re.test(moduleCode), `store mutation referenced: ${banned}`);
  }
});

check('module has no package writer, CAS write-back, fs mutation, queue persistence, or runtime coupling', () => {
  for (const banned of [
    'writeSavedChatPackageV1',
    'buildSavedChatPackageV1',
    'putAssetBytes',
    'plugin:fs|write_file',
    'plugin:fs|remove',
    'plugin:fs|mkdir',
    'plugin:fs|rename',
    'plugin:sql|execute',
    'chrome.runtime',
    'serviceWorker',
    'H2O.Studio.sync',
    'importBundle',
    'recover',
    'archiveHealthUi',
  ]) {
    assert.ok(!moduleCode.includes(banned), `forbidden runtime coupling present: ${banned}`);
  }
  assert.ok(moduleSource.includes('queueDeferred: true'));
  assert.ok(moduleSource.includes('packageWriteDeferred: true'));
  assert.ok(!moduleCode.includes('localStorage'));
  assert.ok(!moduleCode.includes('indexedDB'));
});

check('studio.html loads request intake module after archive diagnostics', () => {
  const diagIdx = studioHtml.indexOf('./ingestion/saved-chat-archive-diagnostics.tauri.js');
  const reqIdx = studioHtml.indexOf(`./ingestion/${MODULE_NAME}`);
  assert.ok(diagIdx >= 0, 'archive diagnostics script missing');
  assert.ok(reqIdx > diagIdx, 'request intake script missing or loaded before diagnostics');
});

check('pack-studio includes request intake in source and mirror lists', () => {
  const matches = packStudio.match(new RegExp(`ingestion/${MODULE_NAME}`, 'g')) || [];
  assert.ok(matches.length >= 2, `expected at least two pack entries, got ${matches.length}`);
});

console.log('[saved-chat-archive-request-intake] behavioral checks');

await checkAsync('valid envelope with mock chat and snapshot resolves validated', async () => {
  const ingestion = loadModule();
  const result = await ingestion.resolveSavedChatArchiveRequestV1(validEnvelope());
  assert.equal(result.status, 'validated');
  assert.equal(result.ok, true);
  assert.equal(result.schema, RESOLUTION_SCHEMA);
  assert.equal(result.requestId, 'req_d2a_valid');
  assert.equal(result.dedupeKey, validEnvelope().dedupeKey);
  assert.equal(result.resolution.checked, true);
  assert.equal(result.resolution.storeAvailable, true);
  assert.equal(result.resolution.chatExists, true);
  assert.equal(result.resolution.snapshotExists, true);
  assert.equal(result.resolution.canMaterializeFromDesktopStore, true);
  assert.equal(result.resolution.packageWriteDeferred, true);
  assert.equal(result.resolution.queueDeferred, true);
});

await checkAsync('valid envelope with missing snapshot resolves needs-desktop-snapshot', async () => {
  const ingestion = loadModule({ missingSnapshot: true });
  const result = await ingestion.resolveSavedChatArchiveRequestV1(validEnvelope());
  assert.equal(result.status, 'needs-desktop-snapshot');
  assert.equal(result.ok, false);
  assert.equal(result.resolution.snapshotExists, false);
  assert.equal(result.resolution.canMaterializeFromDesktopStore, false);
  assert.ok(result.warnings.some((issue) => issue.code === 'desktop-snapshot-missing'));
});

await checkAsync('valid envelope without snapshotId resolves needs-desktop-snapshot', async () => {
  const ingestion = loadModule();
  const envelope = validEnvelope({ desktopResolution: { snapshotId: '' } });
  const result = await ingestion.resolveSavedChatArchiveRequestV1(envelope);
  assert.equal(result.status, 'needs-desktop-snapshot');
  assert.equal(result.ok, false);
  assert.equal(result.resolution.snapshotId, null);
  assert.ok(result.warnings.some((issue) => issue.code === 'snapshot-id-missing'));
});

await checkAsync('containsSnapshotContent true is rejected', async () => {
  const ingestion = loadModule();
  const result = ingestion.validateSavedChatArchiveRequestV1(validEnvelope({ payloadPolicy: { containsSnapshotContent: true } }));
  assert.equal(result.status, 'rejected');
  assert.equal(result.ok, false);
  assert.ok(result.blockers.some((issue) => issue.code === 'snapshot-content-payload-forbidden'));
});

await checkAsync('containsAssets true is rejected', async () => {
  const ingestion = loadModule();
  const result = ingestion.validateSavedChatArchiveRequestV1(validEnvelope({ payloadPolicy: { containsAssets: true } }));
  assert.equal(result.status, 'rejected');
  assert.equal(result.ok, false);
  assert.ok(result.blockers.some((issue) => issue.code === 'asset-payload-forbidden'));
});

await checkAsync('missing requestId and dedupeKey are rejected', async () => {
  const ingestion = loadModule();
  const result = ingestion.validateSavedChatArchiveRequestV1(validEnvelope({ requestId: '', dedupeKey: '' }));
  assert.equal(result.status, 'rejected');
  assert.equal(result.ok, false);
  assert.ok(result.blockers.some((issue) => issue.code === 'request-id-missing'));
  assert.ok(result.blockers.some((issue) => issue.code === 'dedupe-key-missing'));
});

await checkAsync('authoritative package payload fields are rejected', async () => {
  const ingestion = loadModule();
  const result = ingestion.validateSavedChatArchiveRequestV1(validEnvelope({ contentHash: 'sha256-bad', manifest: {}, packagePath: 'archive/packages/x.h2ochat' }));
  assert.equal(result.status, 'rejected');
  assert.equal(result.ok, false);
  assert.ok(result.blockers.some((issue) => issue.code === 'content-hash-payload-forbidden'));
  assert.ok(result.blockers.some((issue) => issue.code === 'package-manifest-payload-forbidden'));
  assert.ok(result.blockers.some((issue) => issue.code === 'archive-package-path-payload-forbidden'));
});

await checkAsync('missing store API returns db-unavailable without crash', async () => {
  const ingestion = loadModule({ missingStore: true });
  const result = await ingestion.resolveSavedChatArchiveRequestV1(validEnvelope());
  assert.equal(result.status, 'db-unavailable');
  assert.equal(result.ok, false);
  assert.equal(result.resolution.storeAvailable, false);
  assert.ok(result.warnings.some((issue) => issue.code === 'db-api-missing'));
});

await checkAsync('diagnostic reports Desktop-only read-only deferred queue/write boundaries', async () => {
  const ingestion = loadModule();
  const result = ingestion.diagnoseSavedChatArchiveRequestIntakeV1();
  assert.equal(result.installed, true);
  assert.equal(result.desktopOnly, true);
  assert.equal(result.readOnly, true);
  assert.equal(Array.isArray(result.supportedSchemas), true);
  assert.equal(result.supportedSchemas[0], REQUEST_SCHEMA);
  assert.equal(result.storeApis.chatsGet, true);
  assert.equal(result.storeApis.snapshotsGet, true);
  assert.equal(result.storeApis.snapshotsListByChat, true);
  assert.equal(result.boundaries.queuePersistence, false);
  assert.equal(result.boundaries.statusPersistence, false);
  assert.equal(result.boundaries.packageMaterialization, false);
  assert.equal(result.boundaries.packageWriteDeferred, true);
  assert.equal(result.boundaries.queueDeferred, true);
  assert.equal(result.boundaries.chromeRuntime, false);
  assert.equal(result.boundaries.syncTransport, false);
  assert.equal(result.boundaries.importRecovery, false);
  assert.equal(result.boundaries.casWrites, false);
  assert.equal(result.boundaries.dbWrites, false);
  assert.equal(result.boundaries.ui, false);
});

if (FAIL.length) {
  console.error(`[saved-chat-archive-request-intake] ${FAIL.length} failed, ${PASS.length} passed`);
  process.exit(1);
}

console.log(`[saved-chat-archive-request-intake] all ${PASS.length} checks passed`);
