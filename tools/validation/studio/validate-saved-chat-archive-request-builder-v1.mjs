#!/usr/bin/env node
// Validator for Phase D.3A Chrome saved-chat archive request builder.
//
// Static checks keep D.3A transport-free. VM checks prove the builder emits a
// metadata-only h2o.savedChatArchiveRequest.v1 envelope without touching
// Desktop queue/materializer/package/CAS/sync/runtime paths.

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { TextEncoder } from 'node:util';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..', '..', '..');

const BUILDER_REL = 'src-surfaces-base/studio/ingestion/saved-chat-archive-request-builder.mv3.js';
const INTAKE_REL = 'src-surfaces-base/studio/ingestion/saved-chat-archive-requests.tauri.js';
const STUDIO_HTML_REL = 'src-surfaces-base/studio/studio.html';
const PACK_STUDIO_REL = 'tools/product/studio/pack-studio.mjs';
const CONTRACT_VALIDATOR_REL = 'tools/validation/studio/validate-saved-chat-archive-request-contract.mjs';
const REQUEST_SCHEMA = 'h2o.savedChatArchiveRequest.v1';
const BUILDER_FILE = 'saved-chat-archive-request-builder.mv3.js';

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

function createSandbox({ includeTauri = false } = {}) {
  const context = {
    console,
    Date,
    JSON,
    Math,
    Number,
    Promise,
    RegExp,
    String,
    TextEncoder,
    Uint8Array,
    crypto: crypto.webcrypto,
    location: { href: 'https://chatgpt.com/c/d3a-native' },
    document: { title: 'D3A source title' },
    H2O: { Studio: {} },
  };
  if (includeTauri) {
    context.__TAURI_INTERNALS__ = {
      invoke: async () => {
        throw new Error('D.3A VM test must not invoke Desktop SQL');
      },
    };
  }
  context.globalThis = context;
  context.window = context;
  return vm.createContext(context);
}

async function loadBuilder(context) {
  vm.runInContext(readRepo(BUILDER_REL), context, { filename: BUILDER_REL });
  const api = context.H2O?.Studio?.ingestion?.buildSavedChatArchiveRequestV1;
  assert.equal(typeof api, 'function', 'builder API was not registered');
  return api;
}

function envelopeOptions(overrides = {}) {
  return {
    source: {
      nativeConversationId: 'native_d3a',
      href: 'https://chatgpt.com/c/native_d3a',
      title: 'D3A test chat',
      capturedAt: '2026-06-25T00:00:00.000Z',
      captureDigest: 'sha256-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      messageCount: 4,
      ...(overrides.source || {}),
    },
    desktopResolution: {
      studioChatId: 'chat_d3a',
      snapshotId: 'snap_d3a',
      ...(overrides.desktopResolution || {}),
    },
    intent: {
      kind: 'save-to-folder',
      target: {
        folderIdAtRequest: 'folder_d3a',
        categoryIdAtRequest: 'category_d3a',
        projectIdAtRequest: 'project_d3a',
        labelIdsAtRequest: ['label_a', 'label_b'],
        tagIdsAtRequest: ['tag_a'],
        ...(overrides.intent?.target || {}),
      },
      ...(overrides.intent || {}),
    },
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => !['source', 'desktopResolution', 'intent'].includes(key))),
  };
}

function assertNoAuthoritativePayload(envelope) {
  const text = JSON.stringify(envelope);
  for (const key of [
    '"manifest"',
    '"manifestJson"',
    '"snapshot"',
    '"snapshotJson"',
    '"transcript"',
    '"turns"',
    '"messages"',
    '"content"',
    '"contentText"',
    '"contentHtml"',
    '"html"',
    '"outerHTML"',
    '"outerHtml"',
    '"outer_html"',
    '"markdown"',
    '"chatMd"',
    '"chatHtml"',
    '"assets"',
    '"assetRefs"',
    '"images"',
    '"blobs"',
    '"casPath"',
    '"casPaths"',
    '"packagePath"',
    '"archivePackagePath"',
    '"contentHash"',
  ]) {
    assert.equal(text.includes(key), false, `envelope emitted forbidden authoritative field ${key}`);
  }
}

const builderSource = readRepo(BUILDER_REL);
const builderCode = stripComments(builderSource);
const intakeSource = readRepo(INTAKE_REL);
const studioHtml = readRepo(STUDIO_HTML_REL);
const packStudio = readRepo(PACK_STUDIO_REL);

console.log('[saved-chat-archive-request-builder-v1] static checks');

check('builder module exists', () => {
  assert.ok(fs.existsSync(path.join(REPO_ROOT, BUILDER_REL)));
});

check('builder registers buildSavedChatArchiveRequestV1 under H2O.Studio.ingestion', () => {
  assert.match(builderSource, /H2O\.Studio\.ingestion\.buildSavedChatArchiveRequestV1\s*=/);
});

check('builder is Chrome/MV3 scoped and safe outside Chrome', () => {
  assert.match(BUILDER_REL, /\.mv3\.js$/);
  assert.match(builderSource, /Chrome \/ MV3/);
  assert.doesNotMatch(builderCode, /__TAURI__|__TAURI_INTERNALS__|plugin:sql|BaseDirectory|AppLocalData/);
});

check('builder emits h2o.savedChatArchiveRequest.v1 schema', () => {
  assert.ok(builderSource.includes(REQUEST_SCHEMA));
  assert.match(builderSource, /schema:\s*REQUEST_SCHEMA/);
});

check('requestId and dedupeKey generation are implemented', () => {
  assert.match(builderSource, /function generateRequestId/);
  assert.match(builderSource, /cryptoObj\.randomUUID/);
  assert.match(builderSource, /sha256-/);
  assert.match(builderSource, /sha256Hex/);
  assert.match(builderSource, /dedupeMaterial/);
});

check('payloadPolicy is forced metadata-only', () => {
  assert.match(builderSource, /containsSnapshotContent:\s*false/);
  assert.match(builderSource, /containsAssets:\s*false/);
  assert.match(builderSource, /payload-policy-forced-metadata-only/);
});

check('source and Desktop resolution defaults exist', () => {
  assert.ok(builderSource.includes('chrome-studio'));
  assert.match(builderSource, /requireExistingDesktopSnapshot:\s*resolution\.requireExistingDesktopSnapshot === false \? false : true/);
  assert.match(builderSource, /getCurrentHref/);
  assert.match(builderSource, /getCurrentTitle/);
});

check('target hints are normalized in the correct structure', () => {
  for (const field of [
    'folderIdAtRequest',
    'categoryIdAtRequest',
    'projectIdAtRequest',
    'labelIdsAtRequest',
    'tagIdsAtRequest',
  ]) {
    assert.ok(builderSource.includes(field), `missing target hint ${field}`);
  }
});

check('no transport or Desktop materialization calls exist', () => {
  for (const token of [
    'enqueueSavedChatArchiveRequestV1',
    'materializeSavedChatArchiveRequestV1',
    'writeSavedChatPackageV1',
    'buildSavedChatPackageV1',
    'chrome.runtime.sendMessage',
    'nativeMessaging',
    'showOpenFilePicker',
    'showSaveFilePicker',
    'write_file',
    'putAssetBytes',
  ]) {
    assert.equal(builderCode.includes(token), false, `forbidden D.3A transport/materialization token: ${token}`);
  }
  assert.doesNotMatch(builderCode, /fetch\s*\(/);
  assert.doesNotMatch(builderCode, /localhost|127\.0\.0\.1|WebDAV|syncTransport|H2O\.Studio\.store|assetCas|ArchiveHealth|recovery/i);
});

check('builder is loaded before Desktop request intake in studio.html', () => {
  const builderIndex = studioHtml.indexOf(`./ingestion/${BUILDER_FILE}`);
  const intakeIndex = studioHtml.indexOf('./ingestion/saved-chat-archive-requests.tauri.js');
  assert.ok(builderIndex > 0, 'builder loader missing from studio.html');
  assert.ok(intakeIndex > builderIndex, 'builder should load before Desktop intake');
});

check('builder is included in the pack-studio source and output lists', () => {
  const occurrences = [...packStudio.matchAll(new RegExp(BUILDER_FILE.replace('.', '\\.'), 'g'))].length;
  assert.ok(occurrences >= 2, 'builder should appear in pack input and output lists');
});

check('D.1 contract validator remains present', () => {
  assert.ok(fs.existsSync(path.join(REPO_ROOT, CONTRACT_VALIDATOR_REL)));
});

console.log('[saved-chat-archive-request-builder-v1] VM behavior checks');

await checkAsync('minimal call returns a valid metadata-only envelope', async () => {
  const sandbox = createSandbox();
  const build = await loadBuilder(sandbox);
  const result = await build({});
  assert.equal(result.ok, true);
  assert.equal(result.envelope.schema, REQUEST_SCHEMA);
  assert.ok(result.envelope.requestId);
  assert.match(result.envelope.dedupeKey, /^sha256-[0-9a-f]{64}$/);
  assert.equal(result.envelope.source.surface, 'chrome-studio');
  assert.equal(result.envelope.source.href, 'https://chatgpt.com/c/d3a-native');
  assert.equal(result.envelope.source.title, 'D3A source title');
  assert.equal(result.envelope.desktopResolution.requireExistingDesktopSnapshot, true);
  assert.equal(result.envelope.payloadPolicy.containsSnapshotContent, false);
  assert.equal(result.envelope.payloadPolicy.containsAssets, false);
  assertNoAuthoritativePayload(result.envelope);
});

await checkAsync('provided requestId and dedupeKey are preserved', async () => {
  const sandbox = createSandbox();
  const build = await loadBuilder(sandbox);
  const result = await build(envelopeOptions({
    requestId: 'req_d3a_user_action',
    dedupeKey: 'sha256-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    createdAt: '2026-06-25T01:02:03.000Z',
  }));
  assert.equal(result.ok, true);
  assert.equal(result.envelope.requestId, 'req_d3a_user_action');
  assert.equal(result.envelope.dedupeKey, 'sha256-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
  assert.equal(result.envelope.createdAt, '2026-06-25T01:02:03.000Z');
});

await checkAsync('payloadPolicy true values are forced false', async () => {
  const sandbox = createSandbox();
  const build = await loadBuilder(sandbox);
  const result = await build(envelopeOptions({
    payloadPolicy: { containsSnapshotContent: true, containsAssets: true },
  }));
  assert.equal(result.ok, true);
  assert.equal(result.envelope.payloadPolicy.containsSnapshotContent, false);
  assert.equal(result.envelope.payloadPolicy.containsAssets, false);
  assert.ok(result.warnings.some((issue) => issue.code === 'payload-policy-forced-metadata-only'));
});

await checkAsync('target hints are emitted under intent.target', async () => {
  const sandbox = createSandbox();
  const build = await loadBuilder(sandbox);
  const result = await build(envelopeOptions());
  assert.equal(JSON.stringify(result.envelope.intent.target), JSON.stringify({
    folderIdAtRequest: 'folder_d3a',
    categoryIdAtRequest: 'category_d3a',
    projectIdAtRequest: 'project_d3a',
    labelIdsAtRequest: ['label_a', 'label_b'],
    tagIdsAtRequest: ['tag_a'],
  }));
});

await checkAsync('forbidden authoritative payload fields are dropped from output', async () => {
  const sandbox = createSandbox();
  const build = await loadBuilder(sandbox);
  const result = await build(envelopeOptions({
    messages: [{ role: 'assistant', content: 'not authoritative' }],
    html: '<p>not authoritative</p>',
    assets: [{ sha256: 'sha256-c' }],
    manifest: { schemaVersion: 2 },
    contentHash: 'sha256-d',
    source: { outerHTML: '<main>not authoritative</main>' },
  }));
  assert.equal(result.ok, true);
  assert.ok(result.warnings.some((issue) => issue.code === 'authoritative-payload-fields-dropped'));
  assertNoAuthoritativePayload(result.envelope);
});

await checkAsync('builder output validates through existing D.2A validator in VM', async () => {
  const sandbox = createSandbox({ includeTauri: true });
  const build = await loadBuilder(sandbox);
  const result = await build(envelopeOptions({
    requestId: 'req_d3a_d2a_validation',
    dedupeKey: 'sha256-cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
  }));
  vm.runInContext(intakeSource, sandbox, { filename: INTAKE_REL });
  const validate = sandbox.H2O.Studio.ingestion.validateSavedChatArchiveRequestV1;
  assert.equal(typeof validate, 'function');
  const validation = await validate(result.envelope);
  assert.equal(validation.ok, true);
  assert.equal(validation.status, 'validated');
  assert.equal(validation.requestId, 'req_d3a_d2a_validation');
  assert.equal(validation.dedupeKey, 'sha256-cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc');
});

if (FAIL.length) {
  console.error(`[saved-chat-archive-request-builder-v1] FAIL ${FAIL.length} checks failed`);
  process.exit(1);
}

console.log(`[saved-chat-archive-request-builder-v1] PASS ${PASS.length} checks`);
