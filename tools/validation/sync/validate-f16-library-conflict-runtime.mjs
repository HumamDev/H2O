#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';

const root = process.cwd();
const failures = [];

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

function exists(file) {
  return fs.existsSync(path.join(root, file));
}

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function assertExists(file) {
  assert(exists(file), `${file}: missing`);
}

function assertContains(file, needle, label = needle) {
  const text = read(file);
  assert(text.includes(needle), `${file}: missing ${label}`);
}

function assertNotContains(file, needle, label = needle) {
  const text = read(file);
  assert(!text.includes(needle), `${file}: unexpected ${label}`);
}

function assertOrder(file, before, after) {
  const text = read(file);
  const a = text.indexOf(before);
  const b = text.indexOf(after);
  assert(a !== -1, `${file}: missing order source ${before}`);
  assert(b !== -1, `${file}: missing order target ${after}`);
  if (a !== -1 && b !== -1) assert(a < b, `${file}: ${before} must appear before ${after}`);
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const key of Object.keys(value).sort()) {
    if (typeof value[key] !== 'undefined') out[key] = canonicalize(value[key]);
  }
  return out;
}

function canonicalJSON(value) {
  return JSON.stringify(canonicalize(value));
}

function sha256Hex(value) {
  const text = typeof value === 'string' ? value : canonicalJSON(value);
  return crypto.createHash('sha256').update(text).digest('hex');
}

function h(label) {
  return sha256Hex(`f16.1.a:${label}`);
}

function codeList(value) {
  return Array.isArray(value) ? value.map((entry) => {
    if (entry && typeof entry === 'object') return String(entry.code || '').trim();
    return String(entry || '').trim();
  }).filter(Boolean) : [];
}

function hasCode(result, code) {
  return codeList(result?.blockers).includes(code) ||
    codeList(result?.warnings).includes(code) ||
    JSON.stringify(result?.decisions || []).includes(code);
}

function allSideEffectsFalse(result) {
  const summary = result?.sideEffectSummary || {};
  const keys = [
    'storageWritten',
    'publicationTouched',
    'relayTouched',
    'outboxTouched',
    'nativeCalled',
    'f5Touched',
    'applyExecuted',
    'watermarkWritten',
    'consumedOperationWritten'
  ];
  return keys.every((key) => summary[key] === false);
}

function buildContext() {
  const forbiddenKeys = [
    'name',
    'rawName',
    'displayName',
    'label',
    'title',
    'color',
    'rawColor',
    'folderName',
    'folderColor',
    'rawId',
    'labelId',
    'tagId',
    'categoryId',
    'folderId',
    'chatId',
    'accountId',
    'rawAccountId',
    'userId',
    'rawUserId',
    'chat_id',
    'category_id',
    'chats.category_id',
    'folder_id',
    'path',
    'filePath',
    'filename',
    'fileName',
    'bundleFilename',
    'content',
    'body',
    'text',
    'messages',
    'turns',
    'attachments',
    'files',
    'url',
    'share_url',
    'token',
    'apiKey',
    'password',
    'cookies',
    'session_token',
    'sessionToken'
  ];
  const context = {
    console,
    __TAURI_INTERNALS__: { invoke() {} },
    H2O: {
      Desktop: {
        Sync: {
          kernel: {
            isSha256Hex(value) {
              return /^[0-9a-f]{64}$/.test(String(value || '').trim());
            },
            scanDomainForbiddenFields(domainTag, target) {
              const fields = [];
              function scan(value) {
                if (!value || typeof value !== 'object') return;
                if (Array.isArray(value)) {
                  value.forEach(scan);
                  return;
                }
                for (const key of Object.keys(value)) {
                  if (forbiddenKeys.includes(key)) fields.push({ fieldName: key });
                  scan(value[key]);
                }
              }
              scan(target);
              return {
                ok: fields.length === 0,
                forbiddenFields: fields,
                blockers: fields.length ? [{ code: 'privacy-forbidden-field' }] : [],
                warnings: []
              };
            }
          }
        }
      }
    }
  };
  context.globalThis = context;
  return vm.createContext(context);
}

async function runRuntimeProof(moduleFile) {
  const context = buildContext();
  vm.runInContext(read(moduleFile), context, { filename: moduleFile });
  const sync = context.H2O.Desktop.Sync;
  assert(sync.__libraryConflictRuntimeInstalled === true, 'installed marker missing at runtime');
  assert(sync.__libraryConflictRuntimeVersion === '0.1.0-f16.1.a', 'version marker mismatch at runtime');
  assert(typeof sync.evaluateLibraryRuntimeConflict === 'function', 'dispatcher API missing at runtime');
  assert(typeof sync.evaluateLibraryCatalogRuntimeConflict === 'function', 'catalog API missing at runtime');
  assert(typeof sync.evaluateLibraryBindingRuntimeConflict === 'function', 'binding API missing at runtime');
  assert(typeof sync.classifyLibraryBulkRuntimeConflictRows === 'function', 'bulk classifier API missing at runtime');

  const account = h('account');
  const labelName = h('label-name');
  const catalogA = h('catalog-a');
  const catalogB = h('catalog-b');
  const baseA = h('base-a');
  const baseB = h('base-b');
  const chatA = h('chat-a');
  const labelA = h('label-a');
  const categoryA = h('category-a');
  const categoryB = h('category-b');
  const folderA = h('folder-a');
  const folderB = h('folder-b');
  const bindingA = h('binding-a');
  const bindingB = h('binding-b');

  const cases = [];
  function record(caseId, result, check) {
    cases.push({ caseId, ok: check(result), result });
  }

  record('same catalog create collision', sync.evaluateLibraryCatalogRuntimeConflict({
    mode: 'settlement',
    operation: 'create',
    candidate: {
      expectedTargetState: {
        subjectId: catalogB,
        catalogKind: 'label',
        nameHash: labelName,
        originAccountIdHash: account,
        lifecycleState: 'active'
      }
    },
    existingCatalogs: [{
      subjectId: catalogA,
      catalogKind: 'label',
      nameHash: labelName,
      originAccountIdHash: account,
      lifecycleState: 'active'
    }]
  }), (result) => result.ok === false && hasCode(result, 'library-catalog-cross-install-name-collision'));

  record('stale rename conflict', sync.evaluateLibraryCatalogRuntimeConflict({
    mode: 'settlement',
    operation: 'rename',
    candidate: { baseHash: baseA },
    currentState: { subjectId: catalogA, revisionHash: baseB, lifecycleState: 'active' },
    expectedState: { lifecycleState: 'active' }
  }), (result) => result.ok === false && hasCode(result, 'library-catalog-cross-install-stale-base'));

  record('stale recolor conflict', sync.evaluateLibraryCatalogRuntimeConflict({
    mode: 'settlement',
    operation: 'recolor',
    candidate: { baseHash: baseA },
    currentState: { subjectId: catalogA, revisionHash: baseB, lifecycleState: 'active' },
    expectedState: { lifecycleState: 'active' }
  }), (result) => result.ok === false && hasCode(result, 'library-catalog-cross-install-stale-base'));

  record('archive vs rename conflict', sync.evaluateLibraryCatalogRuntimeConflict({
    mode: 'settlement',
    operation: 'rename',
    candidate: { baseHash: baseA },
    currentState: { subjectId: catalogA, revisionHash: baseB, lifecycleState: 'archived' },
    expectedState: { lifecycleState: 'active' },
    expectedTargetState: { lifecycleState: 'active' }
  }), (result) => result.ok === false &&
    hasCode(result, 'library-catalog-cross-install-stale-base') &&
    hasCode(result, 'library-catalog-cross-install-lifecycle-conflict'));

  const chatLabelBinding = {
    subjectId: bindingA,
    bindingKind: 'chat-label',
    leftSubjectId: chatA,
    rightSubjectId: labelA,
    leftSubjectType: 'chat.metadata',
    rightSubjectType: 'library.catalog',
    bindingState: 'bound',
    dedupeKey: h('candidate-dedupe')
  };
  record('duplicate binding edge', sync.evaluateLibraryBindingRuntimeConflict({
    mode: 'settlement',
    operation: 'bind',
    candidate: chatLabelBinding,
    existingBindings: [Object.assign({}, chatLabelBinding, { subjectId: bindingB, dedupeKey: h('other-dedupe') })]
  }), (result) => result.ok === false && hasCode(result, 'library-binding-cross-install-duplicate-edge'));

  record('bind/unbind race', sync.evaluateLibraryBindingRuntimeConflict({
    mode: 'settlement',
    operation: 'unbind',
    candidate: chatLabelBinding,
    expectedState: { bindingState: 'bound' },
    currentState: { bindingState: 'unbound' }
  }), (result) => hasCode(result, 'library-binding-cross-install-state-conflict') &&
    (result.ok === false || result.retrySafe === true));

  record('chat-category replacement race', sync.evaluateLibraryBindingRuntimeConflict({
    mode: 'settlement',
    operation: 'bind',
    candidate: {
      subjectId: h('chat-category-b'),
      bindingKind: 'chat-category',
      leftSubjectId: chatA,
      rightSubjectId: categoryB,
      leftSubjectType: 'chat.metadata',
      rightSubjectType: 'library.catalog',
      bindingState: 'bound'
    },
    existingBindings: [{
      subjectId: h('chat-category-a'),
      bindingKind: 'chat-category',
      leftSubjectId: chatA,
      rightSubjectId: categoryA,
      leftSubjectType: 'chat.metadata',
      rightSubjectType: 'library.catalog',
      bindingState: 'bound'
    }]
  }), (result) => result.ok === false && hasCode(result, 'library-binding-cross-install-state-conflict'));

  record('chat-folder replacement race', sync.evaluateLibraryBindingRuntimeConflict({
    mode: 'settlement',
    operation: 'bind',
    candidate: {
      subjectId: h('chat-folder-b'),
      bindingKind: 'chat-folder',
      leftSubjectId: chatA,
      rightSubjectId: folderB,
      leftSubjectType: 'chat.metadata',
      rightSubjectType: 'folder.metadata',
      bindingState: 'bound'
    },
    existingBindings: [{
      subjectId: h('chat-folder-a'),
      bindingKind: 'chat-folder',
      leftSubjectId: chatA,
      rightSubjectId: folderA,
      leftSubjectType: 'chat.metadata',
      rightSubjectType: 'folder.metadata',
      bindingState: 'bound'
    }]
  }), (result) => result.ok === false && hasCode(result, 'library-binding-cross-install-state-conflict'));

  record('F7/F15 identity mismatch', sync.evaluateLibraryBindingRuntimeConflict({
    mode: 'diagnostic',
    operation: 'bind',
    candidate: {
      subjectId: h('bridge-binding'),
      bindingKind: 'chat-folder',
      leftSubjectId: chatA,
      rightSubjectId: folderA,
      leftSubjectType: 'chat.metadata',
      rightSubjectType: 'folder.metadata'
    },
    bridgeContext: { activeStateConflict: true }
  }), (result) => result.ok === false && hasCode(result, 'library-binding-f7-f15-identity-conflict'));

  record('cache drift warning-only', sync.evaluateLibraryRuntimeConflict({
    domain: 'library.cache',
    mode: 'diagnostic',
    cacheObservation: { driftDetected: true }
  }), (result) => result.ok === true &&
    result.conflictFree === true &&
    hasCode(result, 'library-cache-cross-install-drift'));

  record('F5 terminal conflict', sync.evaluateLibraryRuntimeConflict({
    domain: 'library.f5',
    mode: 'settlement',
    operation: 'tombstone',
    f5Review: { currentTerminal: 'approved-seal', expectedTerminal: 'approved-restore' }
  }), (result) => result.ok === false && hasCode(result, 'library-catalog-f5-review-conflict'));

  record('bulk partial conflict', sync.classifyLibraryBulkRuntimeConflictRows({
    mode: 'bulk',
    operation: 'bundle-import',
    bulkRows: [
      { domain: 'library.catalog', conflict: true },
      { domain: 'library.binding', duplicate: true },
      { domain: 'library.binding' }
    ]
  }), (result) => result.ok === true &&
    result.conflictFree === false &&
    result.retrySafe === true &&
    hasCode(result, 'library-bulk-cross-install-partial-conflict'));

  const privacy = sync.evaluateLibraryCatalogRuntimeConflict({
    mode: 'diagnostic',
    operation: 'create',
    candidate: { name: 'Raw Runtime Label', nameHash: h('safe-name') }
  });
  record('privacy leak mutation blocks', privacy, (result) => result.ok === false &&
    hasCode(result, 'library-conflict-runtime-privacy-failed') &&
    JSON.stringify(result).includes('Raw Runtime Label') === false);

  cases.forEach((entry) => assert(entry.ok, `${entry.caseId}: runtime proof failed`));
  [...cases.map((entry) => entry.result), privacy].forEach((result, index) => {
    assert(result.schema === 'h2o.desktop.sync.library-conflict-runtime.v1', `case ${index}: schema mismatch`);
    assert(result.version === '0.1.0-f16.1.a', `case ${index}: version mismatch`);
    assert(allSideEffectsFalse(result), `case ${index}: sideEffectSummary must be all false`);
  });

  return {
    caseCount: cases.length,
    passCount: cases.filter((entry) => entry.ok).length,
    sideEffectsSafe: cases.every((entry) => allSideEffectsFalse(entry.result))
  };
}

const moduleFile = 'src-surfaces-base/studio/sync/library/library-conflict-runtime.tauri.js';
const validatorFile = 'tools/validation/sync/validate-f16-library-conflict-runtime.mjs';
const html = 'src-surfaces-base/studio/studio.html';
const pack = 'tools/product/studio/pack-studio.mjs';
const catalogPreflight = 'src-surfaces-base/studio/sync/library/library-catalog-preflight.tauri.js';
const bindingPreflight = 'src-surfaces-base/studio/sync/library/library-binding-preflight.tauri.js';
const settlement = 'src-surfaces-base/studio/sync/execute/execute-settlement-writer-library-extension.tauri.js';

[moduleFile, validatorFile, html, pack, catalogPreflight, bindingPreflight, settlement].forEach(assertExists);

if (failures.length === 0) {
  [
    "var VERSION = '0.1.0-f16.1.a'",
    "var RESULT_SCHEMA = 'h2o.desktop.sync.library-conflict-runtime.v1'",
    'evaluateLibraryRuntimeConflict',
    'evaluateLibraryCatalogRuntimeConflict',
    'evaluateLibraryBindingRuntimeConflict',
    'classifyLibraryBulkRuntimeConflictRows',
    'H2O.Desktop.Sync.evaluateLibraryRuntimeConflict = evaluateLibraryRuntimeConflict',
    'H2O.Desktop.Sync.evaluateLibraryCatalogRuntimeConflict = evaluateLibraryCatalogRuntimeConflict',
    'H2O.Desktop.Sync.evaluateLibraryBindingRuntimeConflict = evaluateLibraryBindingRuntimeConflict',
    'H2O.Desktop.Sync.classifyLibraryBulkRuntimeConflictRows = classifyLibraryBulkRuntimeConflictRows',
    'H2O.Desktop.Sync.__libraryConflictRuntimeInstalled = true',
    'H2O.Desktop.Sync.__libraryConflictRuntimeVersion = VERSION'
  ].forEach((needle) => assertContains(moduleFile, needle));

  [
    'library-catalog-cross-install-stale-base',
    'library-catalog-cross-install-name-collision',
    'library-catalog-cross-install-lifecycle-conflict',
    'library-catalog-f5-review-conflict',
    'library-binding-cross-install-stale-base',
    'library-binding-cross-install-duplicate-edge',
    'library-binding-cross-install-state-conflict',
    'library-binding-f7-f15-identity-conflict',
    'library-bulk-cross-install-partial-conflict',
    'library-conflict-refresh-required',
    'library-cache-cross-install-drift',
    'library-conflict-runtime-context-missing',
    'library-conflict-runtime-shape-invalid',
    'library-conflict-runtime-privacy-failed'
  ].forEach((code) => assertContains(moduleFile, code, `conflict code ${code}`));

  [
    'runtime-conflict-catalog-create-collision',
    'runtime-conflict-catalog-stale-rename',
    'runtime-conflict-catalog-stale-recolor',
    'runtime-conflict-catalog-archive-vs-rename',
    'runtime-conflict-binding-duplicate-edge',
    'runtime-conflict-binding-bind-unbind-race',
    'runtime-conflict-binding-chat-category-replacement-race',
    'runtime-conflict-binding-chat-folder-replacement-race',
    'runtime-conflict-binding-f7-f15-identity-mismatch',
    'runtime-conflict-cache-drift-warning-only',
    'runtime-conflict-f5-terminal-conflict',
    'runtime-conflict-bulk-partial-conflict',
    'runtime-conflict-privacy-leak-mutation-blocks',
    'runtime-conflict-side-effects-all-false',
    'runtime-conflict-apis-markers-present',
    'runtime-conflict-loader-pack-wiring-present'
  ].forEach((name) => assertContains(moduleFile, name, `proof case name ${name}`));

  [
    'storageWritten: false',
    'publicationTouched: false',
    'relayTouched: false',
    'outboxTouched: false',
    'nativeCalled: false',
    'f5Touched: false',
    'applyExecuted: false',
    'watermarkWritten: false',
    'consumedOperationWritten: false'
  ].forEach((needle) => assertContains(moduleFile, needle, `side effect ${needle}`));

  [
    'rawName',
    'folderName',
    'folderColor',
    'chatId',
    'chat_id',
    'folderId',
    'folder_id',
    'category_id',
    'chats.category_id',
    'bundleFilename',
    'content',
    'messages',
    'attachments',
    'url',
    'token'
  ].forEach((needle) => assertContains(moduleFile, needle, `privacy guardrail ${needle}`));

  assertContains(html, 'sync/library/library-conflict-runtime.tauri.js', 'loader wiring');
  assertContains(pack, 'sync/library/library-conflict-runtime.tauri.js', 'pack wiring');
  assertOrder(html, 'sync/library/library-sync-proof.tauri.js', 'sync/library/library-conflict-runtime.tauri.js');
  assertOrder(html, 'sync/library/library-conflict-runtime.tauri.js', 'sync/library/library-sync-operator-ui.tauri.js');
  assertOrder(pack, 'sync/library/library-sync-proof.tauri.js', 'sync/library/library-conflict-runtime.tauri.js');
  assertOrder(pack, 'sync/library/library-conflict-runtime.tauri.js', 'sync/library/library-folder-binding-bridge-diagnostic.tauri.js');

  assertNotContains(catalogPreflight, 'evaluateLibraryRuntimeConflict', 'F16.1.a must not integrate catalog preflight');
  assertNotContains(bindingPreflight, 'evaluateLibraryRuntimeConflict', 'F16.1.a must not integrate binding preflight');
  assertNotContains(settlement, 'evaluateLibraryRuntimeConflict', 'F16.1.a must not integrate settlement');

  const proof = await runRuntimeProof(moduleFile);
  assert(proof.caseCount >= 13, 'runtime proof should cover required cases');
  assert(proof.passCount === proof.caseCount, 'runtime proof should pass all cases');
  assert(proof.sideEffectsSafe === true, 'runtime proof side effects should be safe');
}

if (failures.length) {
  console.error('F16 library conflict runtime validation failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('F16 library conflict runtime validation passed');
