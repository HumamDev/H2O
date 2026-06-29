#!/usr/bin/env node
//
// Phase 14E — Chrome library metadata request export sanitizer.
//
// Proves the Chrome chrome-latest export collector accepts a valid
// chat-category-clear pending mirror row and keeps every other destructive
// clear/delete-shaped action blocked.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';
import { TextEncoder, TextDecoder } from 'node:util';
import { webcrypto } from 'node:crypto';

const root = process.cwd();
const failures = [];

const autoImportFile = 'src-surfaces-base/studio/sync/auto-import.mv3.js';
const folderImportFile = 'src-surfaces-base/studio/sync/folder-import.mv3.js';
const phase13ValidatorFile = 'tools/validation/sync/validate-labels-tags-categories-phase13-chat-category-clear.mjs';
const evidenceFile = 'release-evidence/2026-06-25/labels-tags-categories-phase14e-request-export-sanitizer.md';

const REQUEST_SCHEMA = 'h2o.studio.library-metadata-mutation-request.v1';
const BASIS_HASH = '3a1ad142adfded843d22cb3533cbaa82cb891939f6602365268c74e24cbaef07';
const LIVE_CHAT_ID = 'writer_identity_debug_1782300179966';

const BAD_ACTIONS = [
  'chat-label-clear',
  'chat-tag-clear',
  'category-clear',
  'metadata-clear',
  'chat-category-delete',
  'delete',
  'remove',
  'unbind',
  'purge',
  'hard-delete',
];

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

function exists(file) {
  return fs.existsSync(path.join(root, file));
}

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function functionBody(source, name) {
  const match = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`).exec(source);
  const start = match ? match.index : -1;
  assert(start >= 0, `${name} missing`);
  if (start < 0) return '';
  const signatureEnd = source.indexOf(')', start);
  const open = source.indexOf('{', signatureEnd === -1 ? start : signatureEnd);
  assert(open >= 0, `${name} body missing`);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  assert(false, `${name} body parse failed`);
  return '';
}

function buildContext() {
  const source = read(autoImportFile);
  const needle = 'H2O.Studio.sync.autoImport = api;';
  assert(source.includes(needle), 'auto-import API assignment missing');
  const instrumented = source.replace(needle, [
    'H2O.Studio.sync.__phase14e = {',
    '  parseLibraryMetadataMutationRequestPayload: parseLibraryMetadataMutationRequestPayload,',
    '  sanitizeLibraryMetadataMutationRequestForExport: sanitizeLibraryMetadataMutationRequestForExport,',
    '  libraryMetadataMutationDeferredDestructiveAction: libraryMetadataMutationDeferredDestructiveAction,',
    '  libraryMetadataMutationActionSpec: libraryMetadataMutationActionSpec',
    '};',
    needle,
  ].join('\n  '));
  const storageValues = new Map();
  const ctx = {
    console,
    Date,
    Math,
    JSON,
    TextEncoder,
    TextDecoder,
    Uint8Array,
    Promise,
    Object,
    Array,
    String,
    Number,
    Boolean,
    RegExp,
    Error,
    Set,
    Map,
    crypto: {
      subtle: webcrypto.subtle,
      randomUUID: () => '00000000-0000-4000-8000-000000000000',
    },
    setTimeout: () => 1,
    clearTimeout() {},
    setInterval: () => 1,
    clearInterval() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {},
    queueMicrotask: (cb) => Promise.resolve().then(cb),
    document: { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} },
    chrome: {
      runtime: {
        id: 'chrome-phase14e',
        lastError: null,
        sendMessage(_message, callback) {
          if (typeof callback === 'function') callback({ ok: true, result: {} });
          return Promise.resolve({ ok: true, result: {} });
        },
      },
      storage: {
        local: {
          get(keys, cb) {
            const out = {};
            const list = Array.isArray(keys) ? keys : [keys];
            for (const key of list) if (storageValues.has(key)) out[key] = storageValues.get(key);
            cb(out);
          },
          set(items, cb) {
            for (const [key, value] of Object.entries(items || {})) storageValues.set(key, value);
            if (cb) cb();
          },
          remove(keys, cb) {
            const list = Array.isArray(keys) ? keys : [keys];
            for (const key of list) storageValues.delete(key);
            if (cb) cb();
          },
        },
        onChanged: { addListener() {}, removeListener() {} },
      },
    },
    H2O: { Studio: { platform: { env: { adapter: 'mv3' } }, sync: {} } },
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  ctx.self = ctx;
  const context = vm.createContext(ctx);
  vm.runInContext(instrumented, context, { filename: autoImportFile });
  return context;
}

function liveClearRequest(overrides = {}) {
  return {
    schema: REQUEST_SCHEMA,
    version: '0.1.0-phase6',
    phase: 'phase6-chrome-request-export',
    requestId: 'library-metadata-mutation-request:92f08770-51f2-424d-81e3-4e9eca668a8d',
    reviewId: 'library-metadata-mutation-request:92f08770-51f2-424d-81e3-4e9eca668a8d',
    idempotencyKey: `library-metadata-mutation-request:chat-category-clear:category:${LIVE_CHAT_ID}:-:-:${BASIS_HASH}`,
    intent: 'library-metadata-mutation-request',
    classification: 'metadata-request',
    action: 'chat-category-clear',
    requestType: 'chat-category-clear',
    status: 'pending',
    metadataKind: 'category',
    subjectKind: 'chat-category-assignment',
    operation: 'clear',
    sourceSurface: 'chrome-studio',
    sourcePeerId: 'chrome-studio',
    expectedCurrentBasisHash: BASIS_HASH,
    desktopApplyRequired: true,
    desktopApply: false,
    noLocalApply: true,
    noChromeCanonicalMutation: true,
    noDesktopCanonicalMutation: true,
    chromeAuthority: false,
    desktopAuthority: true,
    requestOnly: true,
    separateFromDesktopCanonicalLibraryMetadata: true,
    noHardDelete: true,
    noPurge: true,
    noChatDelete: true,
    noSnapshotDelete: true,
    noAssetDelete: true,
    noLabelDelete: true,
    noTagDelete: true,
    noCategoryDelete: true,
    noMetadataDelete: true,
    privacy: {
      rawChatContent: false,
      rawChatTitles: false,
      accountLinkedMetadata: false,
      displayNameIncluded: false,
    },
    payload: {
      chatId: LIVE_CHAT_ID,
      conversationId: LIVE_CHAT_ID,
      entityId: null,
      labelId: null,
      tagId: null,
      categoryId: null,
      classificationId: null,
      displayName: null,
    },
    ...overrides,
  };
}

for (const file of [autoImportFile, folderImportFile, phase13ValidatorFile]) {
  assert(exists(file), `${file}: missing`);
}

const autoImport = read(autoImportFile);
const folderImport = read(folderImportFile);
const evidence = exists(evidenceFile) ? read(evidenceFile) : '';

const parseBody = functionBody(autoImport, 'parseLibraryMetadataMutationRequestPayload');
assert(
  parseBody.indexOf('cleanString(row.schema) === LIBRARY_METADATA_MUTATION_REQUEST_SCHEMA') <
    parseBody.indexOf('isPlainObject(row && row.payload)'),
  'auto-import parser must prefer full request row before nested domain payload',
);

const sanitizeBody = functionBody(autoImport, 'sanitizeLibraryMetadataMutationRequestForExport');
assert(sanitizeBody.includes('function invalid(code)'), 'sanitizer must expose invalid reason diagnostics');
assert(sanitizeBody.includes("action === 'chat-category-clear'"), 'sanitizer must preserve exact chat-category-clear special case');
assert(sanitizeBody.includes("categoryId: spec.metadataKind === 'category' && action !== 'chat-category-clear' ? entityId || null : null"),
  'sanitizer must keep chat-category-clear categoryId null');

const collectBody = functionBody(autoImport, 'collectLibraryMetadataMutationRequestsForExport');
assert(collectBody.includes('invalidReasons: []'), 'export collector must include invalidReasons');
assert(collectBody.includes('invalidReasonCounts: {}'), 'export collector must include invalidReasonCounts');
assert(collectBody.includes('sanitizeLibraryMetadataMutationRequestForExport(row, diagnostics)'),
  'export collector must pass diagnostics into sanitizer');

assert(folderImport.includes("NON_DESTRUCTIVE_CLEAR_ALLOWLIST = new Set(['chat-category-clear'])"),
  'folder-import exact-match clear allowlist missing');
assert(autoImport.includes("NON_DESTRUCTIVE_CLEAR_ALLOWLIST = new Set(['chat-category-clear'])"),
  'auto-import exact-match clear allowlist missing');
for (const action of BAD_ACTIONS) {
  assert(!autoImport.includes(`NON_DESTRUCTIVE_CLEAR_ALLOWLIST = new Set(['chat-category-clear', '${action}'])`),
    `auto-import allowlist must not include ${action}`);
  assert(!folderImport.includes(`NON_DESTRUCTIVE_CLEAR_ALLOWLIST = new Set(['chat-category-clear', '${action}'])`),
    `folder-import allowlist must not include ${action}`);
}

if (failures.length === 0) {
  const context = buildContext();
  const api = context.H2O.Studio.sync.__phase14e;
  assert(api && typeof api.sanitizeLibraryMetadataMutationRequestForExport === 'function', 'instrumented sanitizer missing');
  assert(typeof api.parseLibraryMetadataMutationRequestPayload === 'function', 'instrumented parser missing');
  assert(typeof api.libraryMetadataMutationDeferredDestructiveAction === 'function', 'instrumented destructive guard missing');
  if (api) {
    const diagnostics = { invalidReasons: [] };
    const request = liveClearRequest();
    const parsed = api.parseLibraryMetadataMutationRequestPayload(request);
    assert(parsed && parsed.schema === REQUEST_SCHEMA, 'parser must return full request row, not nested payload');
    assert(parsed && parsed.payload && parsed.payload.categoryId === null, 'parsed full request must preserve null categoryId');

    const sanitized = api.sanitizeLibraryMetadataMutationRequestForExport(request, diagnostics);
    assert(sanitized, `valid live chat-category-clear row rejected: ${diagnostics.invalidReasons.join(',')}`);
    if (sanitized) {
      assert(sanitized.action === 'chat-category-clear', 'sanitized action mismatch');
      assert(sanitized.payload.categoryId === null, 'sanitized clear request must keep categoryId null');
      assert(sanitized.payload.entityId === null, 'sanitized clear request must keep entityId null');
      assert(sanitized.requestOnly === true && sanitized.noChromeCanonicalMutation === true,
        'sanitized request must remain request-only/no Chrome canonical mutation');
      assert(sanitized.noHardDelete === true && sanitized.noPurge === true &&
        sanitized.noChatDelete === true && sanitized.noCategoryDelete === true &&
        sanitized.noMetadataDelete === true, 'sanitized request must preserve no-delete safety flags');
      assert(!JSON.stringify(sanitized).includes('PRIVATE-CHAT-TITLE-NOLEAK'), 'sanitized request leaked raw title');
      assert(!JSON.stringify(sanitized).includes('PRIVATE-CHAT-CONTENT-NOLEAK'), 'sanitized request leaked raw content');
    }
    assert(diagnostics.invalidReasons.length === 0, `valid request produced invalid reasons: ${diagnostics.invalidReasons.join(',')}`);

    const nestedDiagnostics = { invalidReasons: [] };
    const nestedOnly = api.sanitizeLibraryMetadataMutationRequestForExport(request.payload, nestedDiagnostics);
    assert(nestedOnly === null, 'nested domain payload alone must not export as a request');
    assert(nestedDiagnostics.invalidReasons.includes('library-metadata-mutation-request-export-schema-invalid'),
      `nested payload rejection reason missing: ${nestedDiagnostics.invalidReasons.join(',')}`);

    const missingIntentDiagnostics = { invalidReasons: [] };
    const missingIntent = liveClearRequest({ intent: '' });
    assert(api.sanitizeLibraryMetadataMutationRequestForExport(missingIntent, missingIntentDiagnostics) === null,
      'missing-intent row must be rejected');
    assert(missingIntentDiagnostics.invalidReasons.includes('library-metadata-mutation-request-export-intent-invalid'),
      `missing-intent reason missing: ${missingIntentDiagnostics.invalidReasons.join(',')}`);

    for (const action of BAD_ACTIONS) {
      const blockedDiagnostics = { invalidReasons: [] };
      const row = liveClearRequest({
        action,
        requestType: action,
        operation: action.includes('clear') ? 'clear' : action,
      });
      const blocked = api.sanitizeLibraryMetadataMutationRequestForExport(row, blockedDiagnostics);
      assert(blocked === null, `destructive-shaped action should stay blocked: ${action}`);
      assert(blockedDiagnostics.invalidReasons.includes('library-metadata-mutation-request-export-destructive-action-deferred') ||
        blockedDiagnostics.invalidReasons.includes('library-metadata-mutation-request-export-action-unsupported'),
        `unexpected block reason for ${action}: ${blockedDiagnostics.invalidReasons.join(',')}`);
      assert(api.libraryMetadataMutationDeferredDestructiveAction(action) === true ||
        api.libraryMetadataMutationActionSpec(action) === null,
        `destructive guard/action spec should not allow ${action}`);
    }
  }
}

for (const needle of [
  'Phase 14E',
  'chat-category-clear',
  'nested request payload',
  'invalidReasons',
  'Product metadata sync: NOT READY',
]) {
  assert(evidence.includes(needle), `evidence missing ${needle}`);
}

if (failures.length) {
  console.error('FAIL validate-labels-tags-categories-phase14e-request-export-sanitizer');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(JSON.stringify({
  schema: 'h2o.studio.library-metadata.phase14e-request-export-sanitizer-proof.v1',
  validChatCategoryClearExports: true,
  liveChatId: LIVE_CHAT_ID,
  exactMatchClearAllowlist: ['chat-category-clear'],
  destructiveNegativeActionsChecked: BAD_ACTIONS.length,
  invalidReasonDiagnostics: true,
  chromeCanonicalMutation: false,
  destructiveBehaviorAdded: false,
  productSyncReady: false,
}, null, 2));
console.log('PASS validate-labels-tags-categories-phase14e-request-export-sanitizer');
