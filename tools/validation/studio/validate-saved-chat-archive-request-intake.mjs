#!/usr/bin/env node
// Validator for Phase D.2A saved-chat archive request intake.
//
// Static checks prove the module is Desktop-only and read-only. VM checks prove
// request validation/resolution behavior without touching real Chrome, Desktop
// SQLite, package writer, CAS, Sync, import/recovery, capabilities, or UI.

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..', '..', '..');

const MODULE_REL = 'src-surfaces-base/studio/ingestion/saved-chat-archive-requests.tauri.js';
const INBOX_REL = 'src-surfaces-base/studio/ingestion/saved-chat-archive-request-inbox.tauri.js';
const STUDIO_HTML_REL = 'src-surfaces-base/studio/studio.html';
const PACK_STUDIO_REL = 'tools/product/studio/pack-studio.mjs';
const CONTRACT_REL = 'docs/systems/archive/saved-chat-archive-request-v1.md';
const D1_VALIDATOR_REL = 'tools/validation/studio/validate-saved-chat-archive-request-contract.mjs';
const TAURI_LIB_REL = 'apps/studio/desktop/src-tauri/src/lib.rs';
const MODULE_NAME = 'saved-chat-archive-requests.tauri.js';
const REQUEST_SCHEMA = 'h2o.savedChatArchiveRequest.v1';
const RESOLUTION_SCHEMA = 'h2o.savedChatArchiveRequestResolution.v1';
const QUEUE_SCHEMA = 'h2o.savedChatArchiveRequestQueue.v1';
const QUEUE_TABLE = 'saved_chat_archive_requests';

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

function loadModule({ missingStore = false, missingChat = false, missingSnapshot = false, throwStore = false, projection = null } = {}) {
  const queueRows = [];
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
    __TAURI_INTERNALS__: {
      invoke: async (cmd, args = {}) => {
        const query = String(args.query || '');
        const values = Array.isArray(args.values) ? args.values : [];
        assert.equal(args.db, 'sqlite:studio-v1.db', 'queue SQL must use studio-v1.db');
        assert.ok(query.includes(QUEUE_TABLE), `queue SQL must be scoped to ${QUEUE_TABLE}`);
        assert.ok(!/archive\/packages|writeSavedChatPackageV1|buildSavedChatPackageV1|assets\b|chats\b|snapshots\b|snapshot_turns\b/i.test(query.replaceAll(QUEUE_TABLE, '')), `queue SQL leaked outside request table: ${query}`);
        if (cmd === 'plugin:sql|select') {
          if (/WHERE dedupe_key = \?/.test(query)) return queueRows.filter((row) => row.dedupe_key === values[0]).slice(0, 1);
          if (/WHERE request_id = \?/.test(query)) return queueRows.filter((row) => row.request_id === values[0]).slice(0, 1);
          if (/WHERE status = \?/.test(query)) return queueRows.filter((row) => row.status === values[0]).slice().reverse();
          if (/GROUP BY status/.test(query)) {
            const counts = new Map();
            for (const row of queueRows) counts.set(row.status, (counts.get(row.status) || 0) + 1);
            return [...counts.entries()].map(([status, n]) => ({ status, n }));
          }
          return queueRows.slice().reverse();
        }
        if (cmd === 'plugin:sql|execute') {
          assert.ok(/^INSERT INTO saved_chat_archive_requests/.test(query), `only queue INSERT is allowed: ${query}`);
          if (queueRows.some((row) => row.dedupe_key === values[1])) throw new Error('UNIQUE constraint failed: saved_chat_archive_requests.dedupe_key');
          queueRows.push({
            request_id: values[0],
            dedupe_key: values[1],
            schema: values[2],
            status: values[3],
            source_surface: values[4],
            native_conversation_id: values[5],
            source_href: values[6],
            source_title: values[7],
            studio_chat_id: values[8],
            snapshot_id: values[9],
            can_materialize_from_desktop_store: values[10],
            normalized_request_json: values[11],
            resolution_json: values[12],
            created_at: values[13],
            received_at: values[14],
            updated_at: values[15],
            meta_json: values[16],
          });
          return [1, 0];
        }
        throw new Error(`unexpected invoke command: ${cmd}`);
      },
    },
  };
  context.globalThis = context;
  context.window = context;
  // M05 Phase 3: the governed probe + codec supply the Desktop-derived
  // projection half of the effective dedupe identity. Injected here so the
  // intake suite can vary the projection without touching the real archive.
  const probeCalls = [];
  if (projection) {
    context.H2O.Studio = context.H2O.Studio || {};
    context.H2O.Studio.ingestion = Object.assign({}, context.H2O.Studio.ingestion, {
      probeCurrentSavedChatProjectionV1: async (opts) => {
        probeCalls.push(opts);
        return typeof projection === 'function' ? projection(probeCalls.length) : projection;
      },
      savedChatPackageCodec: {
        sha256PrefixedBytes: async (bytes) => 'sha256-' + crypto.createHash('sha256').update(Buffer.from(bytes)).digest('hex'),
      },
    });
  }
  context.TextEncoder = TextEncoder;
  const sandbox = vm.createContext(context);
  vm.runInContext(readRepo(MODULE_REL), sandbox, { filename: MODULE_REL });
  sandbox.H2O.Studio.ingestion.__probeCalls = probeCalls;
  sandbox.H2O.Studio.ingestion.__queueRows = queueRows;
  return sandbox.H2O.Studio.ingestion;
}

const moduleSource = readRepo(MODULE_REL);
const moduleCode = stripComments(moduleSource);
const studioHtml = readRepo(STUDIO_HTML_REL);
const packStudio = readRepo(PACK_STUDIO_REL);
const contract = readRepo(CONTRACT_REL);
const tauriLib = readRepo(TAURI_LIB_REL);

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
    'enqueueSavedChatArchiveRequestV1',
    'getSavedChatArchiveRequestStatusV1',
    'listSavedChatArchiveRequestsV1',
    'diagnoseSavedChatArchiveRequestQueueV1',
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

check('module has D.2B queue persistence APIs and duplicate status', () => {
  for (const marker of [
    'enqueueSavedChatArchiveRequestV1',
    'getSavedChatArchiveRequestStatusV1',
    'listSavedChatArchiveRequestsV1',
    'diagnoseSavedChatArchiveRequestQueueV1',
    'saved_chat_archive_requests',
    'duplicate',
    'dedupe_key',
    'queueEnabled: true',
    'packageWriteDeferred: true',
  ]) {
    assert.ok(moduleSource.includes(marker), `missing queue marker: ${marker}`);
  }
  assert.match(moduleSource, /await resolveSavedChatArchiveRequestV1\(envelope, options\)/);
});

check('queue table migration exists with unique dedupe key and indexes', () => {
  assert.ok(tauriLib.includes('version: 17'));
  assert.ok(tauriLib.includes('description: "init saved chat archive request queue"'));
  assert.ok(tauriLib.includes('CREATE TABLE IF NOT EXISTS saved_chat_archive_requests'));
  assert.ok(tauriLib.includes('request_id                          TEXT    PRIMARY KEY'));
  assert.ok(tauriLib.includes('dedupe_key                          TEXT    NOT NULL UNIQUE'));
  for (const index of [
    'idx_saved_chat_archive_requests_dedupe_key',
    'idx_saved_chat_archive_requests_status',
    'idx_saved_chat_archive_requests_snapshot_id',
    'idx_saved_chat_archive_requests_studio_chat_id',
    'idx_saved_chat_archive_requests_updated_at',
  ]) assert.ok(tauriLib.includes(index), `missing migration index: ${index}`);
});

check('module has no package writer, CAS write-back, fs mutation, forbidden store mutation, or runtime coupling', () => {
  for (const banned of [
    'writeSavedChatPackageV1',
    'buildSavedChatPackageV1',
    'putAssetBytes',
    'plugin:fs|write_file',
    'plugin:fs|remove',
    'plugin:fs|mkdir',
    'plugin:fs|rename',
    'chrome.runtime',
    'serviceWorker',
    'H2O.Studio.sync',
    'importBundle',
    'recover',
    'archiveHealthUi',
  ]) {
    assert.ok(!moduleCode.includes(banned), `forbidden runtime coupling present: ${banned}`);
  }
  assert.ok(moduleSource.includes("INSERT INTO ' + QUEUE_TABLE"));
  assert.ok(moduleSource.includes('plugin:sql|execute'));
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
  assert.equal(result.boundaries.queuePersistence, true);
  assert.equal(result.boundaries.statusPersistence, true);
  assert.equal(result.boundaries.packageMaterialization, false);
  assert.equal(result.boundaries.packageWriteDeferred, true);
  assert.equal(result.boundaries.queueDeferred, false);
  assert.equal(result.boundaries.chromeRuntime, false);
  assert.equal(result.boundaries.syncTransport, false);
  assert.equal(result.boundaries.importRecovery, false);
  assert.equal(result.boundaries.casWrites, false);
  assert.equal(result.boundaries.dbWrites, 'saved_chat_archive_requests-only');
  assert.equal(result.boundaries.ui, false);
});

await checkAsync('enqueue persists validated request and get returns persisted status', async () => {
  const ingestion = loadModule();
  const envelope = validEnvelope({ requestId: 'req_queue_valid', dedupeKey: 'sha256-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' });
  const enq = await ingestion.enqueueSavedChatArchiveRequestV1(envelope);
  assert.equal(enq.status, 'validated');
  assert.equal(enq.ok, true);
  assert.equal(enq.persisted, true);
  assert.equal(enq.packageWriteDeferred, true);
  assert.equal(enq.queueEnabled, true);
  assert.equal(ingestion.__queueRows.length, 1);
  const got = await ingestion.getSavedChatArchiveRequestStatusV1({ requestId: 'req_queue_valid' });
  assert.equal(got.found, true);
  assert.equal(got.status, 'validated');
  assert.equal(got.requestId, 'req_queue_valid');
});

await checkAsync('same dedupeKey returns duplicate without second row', async () => {
  const ingestion = loadModule();
  const dedupeKey = 'sha256-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
  await ingestion.enqueueSavedChatArchiveRequestV1(validEnvelope({ requestId: 'req_queue_dup_a', dedupeKey }));
  const duplicate = await ingestion.enqueueSavedChatArchiveRequestV1(validEnvelope({ requestId: 'req_queue_dup_b', dedupeKey }));
  assert.equal(duplicate.status, 'duplicate');
  assert.equal(duplicate.persisted, false);
  assert.equal(duplicate.duplicateOf, 'req_queue_dup_a');
  assert.equal(ingestion.__queueRows.length, 1);
});

await checkAsync('enqueue persists needs-desktop-snapshot when snapshot is missing', async () => {
  const ingestion = loadModule({ missingSnapshot: true });
  const enq = await ingestion.enqueueSavedChatArchiveRequestV1(validEnvelope({ requestId: 'req_queue_missing_snapshot', dedupeKey: 'sha256-cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc' }));
  assert.equal(enq.status, 'needs-desktop-snapshot');
  assert.equal(enq.persisted, true);
  assert.equal(enq.resolution.status, 'needs-desktop-snapshot');
  assert.equal(ingestion.__queueRows.length, 1);
});

await checkAsync('bad payload policy persists rejected but never writes package', async () => {
  const ingestion = loadModule();
  const enq = await ingestion.enqueueSavedChatArchiveRequestV1(validEnvelope({
    requestId: 'req_queue_rejected',
    dedupeKey: 'sha256-dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
    payloadPolicy: { containsAssets: true },
  }));
  assert.equal(enq.status, 'rejected');
  assert.equal(enq.persisted, true);
  assert.equal(enq.packageWriteDeferred, true);
  assert.equal(ingestion.__queueRows.length, 1);
});

await checkAsync('list returns persisted requests and diagnose queue returns counts', async () => {
  const ingestion = loadModule({ missingSnapshot: true });
  await ingestion.enqueueSavedChatArchiveRequestV1(validEnvelope({ requestId: 'req_queue_list_a', dedupeKey: 'sha256-eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' }));
  await ingestion.enqueueSavedChatArchiveRequestV1(validEnvelope({ requestId: 'req_queue_list_b', dedupeKey: 'sha256-ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' }));
  const list = await ingestion.listSavedChatArchiveRequestsV1({ limit: 10 });
  assert.equal(list.ok, true);
  assert.equal(list.schema, QUEUE_SCHEMA);
  assert.equal(list.requests.length, 2);
  const diag = await ingestion.diagnoseSavedChatArchiveRequestQueueV1();
  assert.equal(diag.installed, true);
  assert.equal(diag.queueEnabled, true);
  assert.equal(diag.packageWriteDeferred, true);
  assert.equal(diag.table, QUEUE_TABLE);
  assert.equal(diag.counts.total, 2);
  assert.equal(diag.counts.needsDesktopSnapshot, 2);
  assert.equal(diag.boundaries.packageWriter, false);
  assert.equal(diag.boundaries.archivePackageMutation, false);
  assert.equal(diag.boundaries.chromeRuntime, false);
  assert.equal(diag.boundaries.syncTransport, false);
});





// ── M05 Phase 3: projection-aware refresh identity ──────────────────────────

const okProjection = (contentHash, schemaVersion = 2) => ({
  status: 'ok', reason: '', contentHash, snapshotId: 'snap_d2a', schemaVersion,
  payloadVersion: schemaVersion === 3 ? 3 : 2, assetShas: [],
});
const PROJ_A = 'sha256-' + 'a'.repeat(64);
const PROJ_B = 'sha256-' + 'b'.repeat(64);

await checkAsync('P3F-1/2 unchanged projection dedupes; CHANGED projection admits a refresh', async () => {
  // One module instance, one queue: the ONLY thing that varies between calls
  // is the authoritative projection, which is exactly the metadata-only
  // refresh case the browser-side dedupe key cannot see.
  const ingestion = loadModule({ projection: (n) => okProjection(n <= 2 ? PROJ_A : PROJ_B) });
  const key = 'sha256-' + '3'.repeat(64);

  const first = await ingestion.enqueueSavedChatArchiveRequestV1(validEnvelope({ requestId: 'req_p3f_a', dedupeKey: key }));
  assert.equal(first.persisted, true, 'the first request is admitted');
  assert.notEqual(first.dedupeKey, key, 'the persisted key carries the projection half');

  const same = await ingestion.enqueueSavedChatArchiveRequestV1(validEnvelope({ requestId: 'req_p3f_b', dedupeKey: key }));
  assert.equal(same.status, 'duplicate', 'an unchanged projection must still dedupe');
  assert.equal(same.persisted, false);

  // Same browser request identity, same snapshotId — only the projection moved.
  const refreshed = await ingestion.enqueueSavedChatArchiveRequestV1(validEnvelope({ requestId: 'req_p3f_c', dedupeKey: key }));
  assert.notEqual(refreshed.status, 'duplicate', 'a changed projection must be refreshable');
  assert.equal(refreshed.persisted, true);
  assert.notEqual(refreshed.dedupeKey, first.dedupeKey, 'a different projection yields a different identity');
});

await checkAsync('P3F-3 an INDETERMINATE projection never fabricates a refresh identity', async () => {
  const ingestion = loadModule({ projection: { status: 'indeterminate', reason: 'store-not-ready', contentHash: '' } });
  const key = 'sha256-' + '5'.repeat(64);
  const first = await ingestion.enqueueSavedChatArchiveRequestV1(validEnvelope({ requestId: 'req_p3f_3a', dedupeKey: key }));
  assert.equal(first.persisted, true);
  assert.equal(first.dedupeKey, key,
    'the base key is used UNCHANGED: a partial current state must never manufacture an identity');
  const second = await ingestion.enqueueSavedChatArchiveRequestV1(validEnvelope({ requestId: 'req_p3f_3b', dedupeKey: key }));
  assert.equal(second.status, 'duplicate', 'and behaviour is unchanged from before');
});

await checkAsync('P3F-4 the projection half is Desktop-derived, never caller-supplied', async () => {
  // A caller trying to supply projection hash material must be refused
  // outright by the forbidden-payload guard.
  const ingestion = loadModule({ projection: okProjection(PROJ_A) });
  const forged = validEnvelope({ requestId: 'req_p3f_4', dedupeKey: 'sha256-' + '6'.repeat(64) });
  forged.projectionContentHash = PROJ_B;
  const r = await ingestion.resolveSavedChatArchiveRequestV1(forged);
  const codes = (r.blockers || []).map((b) => b.code || b);
  assert.ok(codes.includes('content-hash-payload-forbidden'), `caller-supplied projection hash must be refused: ${JSON.stringify(codes)}`);
});

await checkAsync('P3F-5 the probe is consulted with the resolved chatId', async () => {
  const ingestion = loadModule({ projection: okProjection(PROJ_A) });
  await ingestion.enqueueSavedChatArchiveRequestV1(validEnvelope({ requestId: 'req_p3f_5', dedupeKey: 'sha256-' + '7'.repeat(64) }));
  assert.equal(ingestion.__probeCalls.length, 1, 'the governed probe is the projection authority');
  assert.equal(ingestion.__probeCalls[0].chatId, 'chat_d2a');
});

await checkAsync('M09 P2.3 v3 request dedupe consumes the active projection contentHash', async () => {
  const v3Hash = 'sha256-' + '9'.repeat(64);
  const ingestion = loadModule({ projection: okProjection(v3Hash, 3) });
  const key = 'sha256-' + '8'.repeat(64);
  const first = await ingestion.enqueueSavedChatArchiveRequestV1(validEnvelope({ requestId: 'req_p23_v3_a', dedupeKey: key }));
  const second = await ingestion.enqueueSavedChatArchiveRequestV1(validEnvelope({ requestId: 'req_p23_v3_b', dedupeKey: key }));
  assert.notEqual(first.dedupeKey, key, 'active v3 projection identity must become the Desktop dedupe half');
  assert.equal(second.status, 'duplicate');
  assert.equal(second.duplicateOf, 'req_p23_v3_a');
});

/* ── Phase 5 — the newly reachable operator intake, end to end ─────────────
 * The New UI "Scan request inbox" control calls exactly this authority. This
 * proves the operation it now reaches actually closes the prerequisite gap: a
 * genuine producer-shaped request FILE, against a disposable chat/snapshot of
 * the kind the sanctioned #/migrate/import path establishes, becomes a
 * validated queue row bound to that exact chat/snapshot — with no raw queue
 * insertion anywhere in the path. */
function loadInboxRuntime({ files, chatId, snapshotId }) {
  const queueRows = [];
  const chats = { get: async (id) => (id === chatId ? { chatId } : null) };
  const snapshots = {
    get: async (id) => (id === snapshotId ? { snapshot: { snapshotId, chatId } } : null),
    listByChat: async () => [{ snapshotId, chatId }],
  };
  const context = {
    console, JSON, TextEncoder, TextDecoder, Date, Math, Promise, Object, Array,
    String, Number, Boolean, Error, isFinite, parseInt, Buffer,
    H2O: { Studio: { store: { chats, snapshots } } },
    __TAURI_INTERNALS__: {
      invoke: async (cmd, args = {}) => {
        if (cmd === 'plugin:fs|read_dir') {
          return Object.keys(files).map((name) => ({ name, isFile: true, isDirectory: false }));
        }
        if (cmd === 'plugin:fs|read_file' || cmd === 'plugin:fs|read_text_file') {
          const leaf = String(args.path || '').split('/').pop();
          if (!(leaf in files)) throw new Error('ENOENT ' + leaf);
          const text = files[leaf];
          return cmd === 'plugin:fs|read_file' ? Array.from(Buffer.from(text, 'utf8')) : text;
        }
        if (cmd === 'plugin:fs|mkdir' || cmd === 'plugin:fs|write_text_file') return null;
        if (cmd === 'plugin:sql|select') {
          const query = String(args.query || '');
          const values = Array.isArray(args.values) ? args.values : [];
          if (/WHERE dedupe_key = \?/.test(query)) return queueRows.filter((r) => r.dedupe_key === values[0]).slice(0, 1);
          if (/WHERE request_id = \?/.test(query)) return queueRows.filter((r) => r.request_id === values[0]).slice(0, 1);
          if (/WHERE status = \?/.test(query)) return queueRows.filter((r) => r.status === values[0]);
          return queueRows.slice();
        }
        if (cmd === 'plugin:sql|execute') {
          const query = String(args.query || '');
          const values = Array.isArray(args.values) ? args.values : [];
          assert.ok(/^INSERT INTO saved_chat_archive_requests/.test(query), 'only governed queue INSERT allowed: ' + query);
          if (queueRows.some((r) => r.dedupe_key === values[1])) throw new Error('UNIQUE constraint failed: saved_chat_archive_requests.dedupe_key');
          queueRows.push({ request_id: values[0], dedupe_key: values[1], status: values[3], studio_chat_id: values[8], snapshot_id: values[9] });
          return [1, 0];
        }
        throw new Error('unexpected invoke command: ' + cmd);
      },
    },
  };
  context.globalThis = context; context.window = context;
  const sandbox = vm.createContext(context);
  vm.runInContext(readRepo(MODULE_REL), sandbox, { filename: MODULE_REL });
  vm.runInContext(readRepo(INBOX_REL), sandbox, { filename: INBOX_REL });
  return { api: sandbox.H2O.Studio.ingestion, queueRows };
}

/* Reuses this suite's own known-good envelope rather than hand-rolling a second
 * one, so the file on disk is exactly the shape the producer emits. */
function producerRequestFile({ requestId, chatId, snapshotId }) {
  return JSON.stringify(validEnvelope({
    requestId,
    dedupeKey: 'sha256-' + '9'.repeat(64),
    desktopResolution: { studioChatId: chatId, snapshotId },
  }));
}

await checkAsync('[P5.H] producer request file -> governed inbox -> validated row bound to the disposable chat/snapshot', async () => {
  const chatId = 'p5-disposable-chat';
  const snapshotId = 'snap_p5_disposable';
  const requestId = 'req_p5_disposable';
  const { api, queueRows } = loadInboxRuntime({
    chatId, snapshotId,
    files: { [requestId + '.request.json']: producerRequestFile({ requestId, chatId, snapshotId }) },
  });
  assert.equal(typeof api.scanSavedChatArchiveRequestInboxV1, 'function', 'inbox authority not exported');
  const res = await api.scanSavedChatArchiveRequestInboxV1({ limit: 50 });
  assert.equal(res.scanned, 1, 'producer request file not discovered');
  assert.equal(res.processed, 1, 'producer request file not processed');
  assert.equal(res.validated, 1, 'did not reach validated: ' + JSON.stringify({ status: res.status, rejected: res.rejected, needs: res.needsDesktopSnapshot, blockers: res.blockers }));
  assert.equal(queueRows.length, 1, 'exactly one queue row expected');
  assert.equal(queueRows[0].status, 'validated');
  assert.equal(queueRows[0].studio_chat_id, chatId, 'queue row not bound to the disposable chat');
  assert.equal(queueRows[0].snapshot_id, snapshotId, 'queue row not bound to the disposable snapshot');
});

await checkAsync('[P5.H] a malformed request file is rejected and enqueues nothing', async () => {
  const { api, queueRows } = loadInboxRuntime({
    chatId: 'p5-disposable-chat', snapshotId: 'snap_p5_disposable',
    files: { 'bad-1.request.json': '{ this is not valid json' },
  });
  const res = await api.scanSavedChatArchiveRequestInboxV1({ limit: 50 });
  assert.equal(res.processed, 1, 'the malformed file must actually be processed, not filtered away');
  assert.equal(res.validated, 0, 'a malformed file must never validate');
  assert.equal(res.rejected, 1, 'a malformed file must be counted rejected');
  assert.equal(queueRows.length, 0, 'a malformed file must not enqueue');
});


if (FAIL.length) {
  console.error(`[saved-chat-archive-request-intake] ${FAIL.length} failed, ${PASS.length} passed`);
  process.exit(1);
}

console.log(`[saved-chat-archive-request-intake] all ${PASS.length} checks passed`);
