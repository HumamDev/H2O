#!/usr/bin/env node
// Validator for Phase D.3B.1 saved-chat archive request inbox intake.
//
// Static checks prove the Desktop inbox scanner is enqueue-only and transport
// isolated. VM checks prove request-file processing without touching real
// Desktop fs, queue DB, package materializer, package writer, CAS, Sync, Chrome,
// import/recovery, or UI.

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { TextDecoder, TextEncoder } from 'node:util';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..', '..', '..');

const MODULE_REL = 'src-surfaces-base/studio/ingestion/saved-chat-archive-request-inbox.tauri.js';
const CONTRACT_REL = 'docs/systems/archive/saved-chat-archive-request-inbox-v1.md';
const CONTRACT_VALIDATOR_REL = 'tools/validation/studio/validate-saved-chat-archive-request-inbox-contract.mjs';
const STUDIO_HTML_REL = 'src-surfaces-base/studio/studio.html';
const PACK_STUDIO_REL = 'tools/product/studio/pack-studio.mjs';
const CAPABILITY_REL = 'apps/studio/desktop/src-tauri/capabilities/default.json';
const MODULE_FILE = 'saved-chat-archive-request-inbox.tauri.js';
const REQUEST_SCHEMA = 'h2o.savedChatArchiveRequest.v1';
const RECEIPT_SCHEMA = 'h2o.savedChatArchiveRequestReceipt.v1';
const ROOT_DIR = 'H2O Studio Archive Requests';
const INBOX_DIR = `${ROOT_DIR}/inbox`;
const RECEIPTS_DIR = `${ROOT_DIR}/receipts`;

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

function makeEnvelope(requestId, extra = {}) {
  return {
    schema: REQUEST_SCHEMA,
    requestId,
    dedupeKey: `sha256-${requestId.padEnd(64, '0').slice(0, 64)}`,
    createdAt: '2026-06-25T00:00:00.000Z',
    source: {
      surface: 'chrome-studio',
      href: `https://chatgpt.com/c/${requestId}`,
      title: requestId,
    },
    desktopResolution: {
      studioChatId: `chat_${requestId}`,
      snapshotId: `snap_${requestId}`,
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
    ...extra,
  };
}

function createVm() {
  const writes = [];
  const mkdirs = [];
  const enqueues = [];
  const files = new Map([
    [`${INBOX_DIR}/req_valid.request.json`, JSON.stringify(makeEnvelope('req_valid'))],
    [`${INBOX_DIR}/req_duplicate.request.json`, JSON.stringify(makeEnvelope('req_duplicate'))],
    [`${INBOX_DIR}/req_missing.request.json`, JSON.stringify(makeEnvelope('req_missing'))],
    [`${INBOX_DIR}/req_mismatch.request.json`, JSON.stringify(makeEnvelope('other_request'))],
    [`${INBOX_DIR}/req_malformed.request.json`, '{"schema":'],
    [`${INBOX_DIR}/req_oversize.request.json`, JSON.stringify(makeEnvelope('req_oversize'))],
  ]);
  const entries = [
    { name: 'req_valid.request.json' },
    { name: 'req_duplicate.request.json' },
    { name: 'req_missing.request.json' },
    { name: 'req_mismatch.request.json' },
    { name: 'req_malformed.request.json' },
    { name: 'req_tmp.request.json.tmp' },
    { name: '.hidden.request.json' },
    { name: 'dir.request.json', isDirectory: true },
    { name: 'not-a-request.json' },
  ];
  const context = {
    console,
    Date,
    JSON,
    Math,
    Number,
    Object,
    Promise,
    RegExp,
    String,
    TextDecoder,
    TextEncoder,
    Uint8Array,
    ArrayBuffer,
    crypto: crypto.webcrypto,
    H2O: {
      Studio: {
        ingestion: {
          enqueueSavedChatArchiveRequestV1: async (envelope) => {
            enqueues.push(envelope);
            if (envelope.requestId === 'req_duplicate') {
              return { status: 'duplicate', persisted: false, duplicateOf: 'req_valid' };
            }
            if (envelope.requestId === 'req_missing') {
              return { status: 'needs-desktop-snapshot', persisted: true };
            }
            return { status: 'validated', persisted: true };
          },
        },
      },
    },
    __TAURI_INTERNALS__: {
      invoke: async (cmd, args = {}) => {
        if (cmd === 'plugin:fs|read_dir') {
          assert.equal(args.path, INBOX_DIR);
          assert.equal(args.options?.baseDir, 21);
          return entries;
        }
        if (cmd === 'plugin:fs|read_text_file') {
          assert.equal(args.options?.baseDir, 21);
          if (!files.has(args.path)) throw new Error(`not found: ${args.path}`);
          return files.get(args.path);
        }
        if (cmd === 'plugin:fs|mkdir') {
          assert.equal(args.path, RECEIPTS_DIR);
          assert.equal(args.options?.baseDir, 21);
          mkdirs.push(args.path);
          return null;
        }
        if (cmd === 'plugin:fs|write_text_file') {
          if (args && typeof args === 'object' && !ArrayBuffer.isView(args)) {
            assert.equal(args.options?.baseDir, 21);
            assert.ok(String(args.path).startsWith(`${RECEIPTS_DIR}/`));
            writes.push({ path: args.path, text: args.contents });
            return null;
          }
          throw new Error('object write_text_file form expected in VM test');
        }
        throw new Error(`unexpected invoke: ${cmd}`);
      },
    },
  };
  context.globalThis = context;
  context.window = context;
  const sandbox = vm.createContext(context);
  vm.runInContext(readRepo(MODULE_REL), sandbox, { filename: MODULE_REL });
  return {
    ingestion: sandbox.H2O.Studio.ingestion,
    writes,
    mkdirs,
    enqueues,
  };
}

const moduleSource = readRepo(MODULE_REL);
const moduleCode = stripComments(moduleSource);
const contract = readRepo(CONTRACT_REL);
const studioHtml = readRepo(STUDIO_HTML_REL);
const packStudio = readRepo(PACK_STUDIO_REL);
const capability = JSON.parse(readRepo(CAPABILITY_REL));

console.log('[saved-chat-archive-request-inbox-v1] static checks');

check('inbox runtime module exists', () => {
  assert.ok(fs.existsSync(path.join(REPO_ROOT, MODULE_REL)));
});

check('D.3B.0 contract and validator remain present', () => {
  assert.ok(fs.existsSync(path.join(REPO_ROOT, CONTRACT_REL)));
  assert.ok(fs.existsSync(path.join(REPO_ROOT, CONTRACT_VALIDATOR_REL)));
  assert.ok(contract.includes('Saved Chat Archive Request Inbox v1'));
});

check('module registers required H2O.Studio.ingestion APIs', () => {
  for (const api of [
    'diagnoseSavedChatArchiveRequestInboxV1',
    'scanSavedChatArchiveRequestInboxV1',
    'processSavedChatArchiveRequestInboxFileV1',
  ]) {
    assert.match(moduleSource, new RegExp(`H2O\\.Studio\\.ingestion\\.${api}\\s*=`));
  }
});

check('module is Desktop/Tauri gated', () => {
  assert.match(moduleSource, /function detectTauri/);
  assert.match(moduleSource, /__TAURI_INTERNALS__/);
  assert.match(moduleSource, /if \(!detectTauri\(\)\) return/);
});

check('module references locked inbox path and file conventions', () => {
  for (const token of [
    'H2O Studio Archive Requests',
    'inbox',
    'receipts',
    '.request.json',
    '.receipt.json',
    'malformed-sha256-',
  ]) {
    assert.ok(moduleSource.includes(token), `missing locked token ${token}`);
  }
});

check('default size cap is 128 KB', () => {
  assert.match(moduleSource, /DEFAULT_SIZE_CAP_BYTES\s*=\s*128\s*\*\s*1024/);
});

check('tmp, hidden, directories, and non-matching files are ignored', () => {
  assert.match(moduleSource, /endsWith\('\.tmp'\)/);
  assert.match(moduleSource, /name\.charAt\(0\) === '\.'/);
  assert.match(moduleSource, /entryIsDirectory/);
  assert.match(moduleSource, /REQUEST_FILE_RE/);
});

check('one request per file and filename requestId mismatch rejection exist', () => {
  assert.match(moduleSource, /requestIdFromFileName/);
  assert.match(moduleSource, /filename-request-id-mismatch/);
  assert.match(moduleSource, /Request filename must match envelope\.requestId/);
});

check('envelope is passed only to enqueueSavedChatArchiveRequestV1', () => {
  assert.match(moduleSource, /enqueueSavedChatArchiveRequestV1/);
  assert.match(moduleSource, /await enqueue\(envelope\)/);
});

check('forbidden package/materializer/CAS/transport calls are absent', () => {
  for (const token of [
    'materializeSavedChatArchiveRequestV1',
    'writeSavedChatPackageV1',
    'writeSavedChatPackageV2',
    'buildSavedChatPackageV1',
    'assetCas',
    'putAssetBytes',
    'chrome.runtime',
    'nativeMessaging',
    'showOpenFilePicker',
    'showSaveFilePicker',
    'FileSystemAccess',
    'H2O.Studio.sync',
  ]) {
    assert.equal(moduleCode.includes(token), false, `forbidden token present: ${token}`);
  }
  assert.doesNotMatch(moduleCode, /fetch\s*\(/);
  assert.doesNotMatch(moduleCode, /localhost|127\.0\.0\.1|WebDAV|archive\/packages/);
});

check('receipt hard-codes materializeTriggered false and packageWriteDeferred true', () => {
  assert.match(moduleSource, /packageWriteDeferred:\s*true/);
  assert.match(moduleSource, /materializeTriggered:\s*false/);
  assert.ok(moduleSource.includes(RECEIPT_SCHEMA));
});

check('request files are not deleted, removed, renamed, moved, or repaired', () => {
  assert.doesNotMatch(moduleCode, /plugin:fs\|(remove|rename)/);
  assert.doesNotMatch(moduleCode, /\bremove\s*\(/);
  assert.doesNotMatch(moduleCode, /\brename\s*\(/);
  assert.doesNotMatch(moduleCode, /\bunlink\s*\(/);
  assert.doesNotMatch(moduleCode, /\brepair\b/i);
});

check('studio.html loads inbox after request intake and before materializer', () => {
  const inboxIndex = studioHtml.indexOf(`./ingestion/${MODULE_FILE}`);
  const intakeIndex = studioHtml.indexOf('./ingestion/saved-chat-archive-requests.tauri.js');
  const materializerIndex = studioHtml.indexOf('./ingestion/saved-chat-archive-materializer.tauri.js');
  assert.ok(inboxIndex > 0, 'inbox loader missing');
  assert.ok(intakeIndex > 0 && intakeIndex < inboxIndex, 'inbox must load after D.2B request intake');
  assert.ok(materializerIndex > inboxIndex, 'inbox should load before materializer');
});

check('pack-studio includes inbox in source and output lists', () => {
  const occurrences = [...packStudio.matchAll(new RegExp(MODULE_FILE.replace('.', '\\.'), 'g'))].length;
  assert.ok(occurrences >= 2, 'inbox should appear in pack input and output lists');
});

check('capability includes only narrow D.3B inbox/receipt paths', () => {
  const text = JSON.stringify(capability, null, 2);
  for (const token of [
    '$HOME/H2O Studio Archive Requests/inbox',
    '$HOME/H2O Studio Archive Requests/inbox/*.request.json',
    '$HOME/H2O Studio Archive Requests',
    '$HOME/H2O Studio Archive Requests/receipts',
    '$HOME/H2O Studio Archive Requests/receipts/*.receipt.json',
  ]) {
    assert.ok(text.includes(token), `missing capability path ${token}`);
  }
});

check('capability adds no D.3B remove/rename/delete, Sync dependency, or archive package write', () => {
  for (const permission of capability.permissions || []) {
    if (!permission || typeof permission !== 'object') continue;
    const id = String(permission.identifier || '');
    const allowText = JSON.stringify(permission.allow || []);
    if (allowText.includes('H2O Studio Archive Requests')) {
      assert.doesNotMatch(id, /remove|rename|delete/i, `D.3B path present under forbidden permission ${id}`);
      const d3bPaths = (permission.allow || [])
        .map((entry) => String(entry && entry.path || ''))
        .filter((entryPath) => entryPath.includes('H2O Studio Archive Requests'));
      assert.ok(d3bPaths.length > 0, 'expected D.3B paths under this permission');
      for (const d3bPath of d3bPaths) {
        assert.equal(d3bPath.includes('H2O Studio Sync'), false, 'D.3B path must not depend on Sync folder');
        assert.equal(d3bPath.includes('$APPLOCALDATA/archive/packages'), false, 'D.3B path must not add package writes');
      }
    }
  }
});

console.log('[saved-chat-archive-request-inbox-v1] VM behavior checks');

await checkAsync('diagnose runs without enqueue or mutation beyond read_dir', async () => {
  const vmState = createVm();
  const result = await vmState.ingestion.diagnoseSavedChatArchiveRequestInboxV1();
  assert.equal(result.ok, true);
  assert.equal(result.manualScanOnly, true);
  assert.equal(result.boundaries.packageWriteDeferred, true);
  assert.equal(result.boundaries.materializeTriggered, false);
  assert.equal(vmState.enqueues.length, 0);
  assert.equal(vmState.writes.length, 0);
});

await checkAsync('scan processes matching files, ignores tmp/hidden/dir/non-matching, and writes receipts', async () => {
  const vmState = createVm();
  const result = await vmState.ingestion.scanSavedChatArchiveRequestInboxV1();
  assert.equal(result.status, 'completed-with-blockers');
  assert.equal(result.scanned, 9);
  assert.equal(result.processed, 5);
  assert.equal(result.validated, 1);
  assert.equal(result.duplicates, 1);
  assert.equal(result.needsDesktopSnapshot, 1);
  assert.equal(result.rejected, 2);
  assert.equal(vmState.enqueues.length, 3, 'mismatch and malformed files should not enqueue');
  assert.equal(vmState.writes.length, 5);
  for (const write of vmState.writes) {
    assert.ok(write.path.startsWith(`${RECEIPTS_DIR}/`));
    const receipt = JSON.parse(write.text);
    assert.equal(receipt.schema, RECEIPT_SCHEMA);
    assert.equal(receipt.packageWriteDeferred, true);
    assert.equal(receipt.materializeTriggered, false);
  }
});

await checkAsync('filename requestId mismatch is rejected without enqueue', async () => {
  const vmState = createVm();
  const result = await vmState.ingestion.processSavedChatArchiveRequestInboxFileV1({
    fileName: 'req_mismatch.request.json',
  });
  assert.equal(result.status, 'rejected');
  assert.equal(result.enqueued, false);
  assert.equal(vmState.enqueues.length, 0);
  assert.ok(result.receipt.blockers.some((issue) => issue.code === 'filename-request-id-mismatch'));
});

await checkAsync('oversized file is rejected without enqueue', async () => {
  const vmState = createVm();
  const result = await vmState.ingestion.processSavedChatArchiveRequestInboxFileV1({
    fileName: 'req_oversize.request.json',
    maxBytes: 8,
  });
  assert.equal(result.status, 'rejected');
  assert.equal(result.enqueued, false);
  assert.equal(vmState.enqueues.length, 0);
  assert.ok(result.receipt.blockers.some((issue) => issue.code === 'request-file-too-large'));
});

if (FAIL.length) {
  console.error(`[saved-chat-archive-request-inbox-v1] FAIL ${FAIL.length} checks failed`);
  process.exit(1);
}

console.log(`[saved-chat-archive-request-inbox-v1] all ${PASS.length} checks passed`);
