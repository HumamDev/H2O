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

function installPreflightDiagnostics(context) {
  const sync = context.H2O.Desktop.Sync;
  sync.diagnoseLibraryCatalog = async function diagnoseLibraryCatalog(input) {
    const canonicalCatalog = input.canonicalCatalog || input.canonical || input.row || input;
    return {
      ok: true,
      canonicalCatalog,
      diagnostics: {
        canonicalizationOk: true,
        privacyOk: true
      },
      blockers: [],
      warnings: [],
      relatedSubjects: []
    };
  };
  sync.diagnoseLibraryBinding = async function diagnoseLibraryBinding(input) {
    const canonicalBinding = input.canonicalBinding || input.canonical || input.row || input;
    return {
      ok: true,
      canonicalBinding,
      diagnostics: {
        canonicalizationOk: true,
        privacyOk: true,
        endpointTypeConsistent: true
      },
      blockers: [],
      warnings: [],
      relatedSubjects: []
    };
  };
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

async function runPreflightIntegrationProof(moduleFile, catalogPreflight, bindingPreflight) {
  const context = buildContext();
  vm.runInContext(read(moduleFile), context, { filename: moduleFile });
  installPreflightDiagnostics(context);
  vm.runInContext(read(catalogPreflight), context, { filename: catalogPreflight });
  vm.runInContext(read(bindingPreflight), context, { filename: bindingPreflight });
  const sync = context.H2O.Desktop.Sync;
  assert(sync.__libraryCatalogPreflightVersion === '0.2.0-f16.1.b', 'catalog preflight version mismatch at runtime');
  assert(sync.__libraryBindingPreflightVersion === '0.3.0-f16.1.b', 'binding preflight version mismatch at runtime');

  const account = h('preflight-account');
  const nameHash = h('preflight-name');
  const catalogA = h('preflight-catalog-a');
  const catalogB = h('preflight-catalog-b');
  const baseA = h('preflight-base-a');
  const baseB = h('preflight-base-b');
  const chatA = h('preflight-chat-a');
  const labelA = h('preflight-label-a');
  const labelB = h('preflight-label-b');
  const categoryA = h('preflight-category-a');
  const categoryB = h('preflight-category-b');
  const folderA = h('preflight-folder-a');
  const folderB = h('preflight-folder-b');
  const bindingA = h('preflight-binding-a');
  const bindingB = h('preflight-binding-b');

  const catalogBase = {
    subjectType: 'library.catalog',
    subjectId: catalogA,
    catalogKind: 'label',
    nameHash,
    colorHash: h('preflight-color'),
    originAccountIdHash: account,
    lifecycleState: 'active',
    revisionHash: baseA
  };
  const bindingBase = {
    subjectType: 'library.binding',
    subjectId: bindingA,
    bindingKind: 'chat-label',
    leftSubjectId: chatA,
    rightSubjectId: labelA,
    leftSubjectType: 'chat.metadata',
    rightSubjectType: 'library.catalog',
    originAccountIdHash: account,
    bindingState: 'bound',
    revisionHash: baseA
  };
  const common = {
    localAccountIdHash: account,
    sourceMirror: { fresh: true },
    replayContext: { safe: true },
    watermarkState: { safe: true },
    consumedOperationState: { safe: true }
  };
  const cases = [];
  function record(caseId, result, check) {
    cases.push({ caseId, ok: check(result), result });
  }

  record('catalog preflight clean runtime pass', await sync.preflightLibraryCatalog(Object.assign({}, common, {
    operation: 'archive',
    canonicalCatalog: catalogBase,
    currentLifecycleState: 'active',
    expectedTargetState: { lifecycleState: 'archived' },
    currentRevisionHash: baseA,
    expectedRevisionHash: baseA
  })), (result) => result.ok === true &&
    result.conflictRuntimeSummary?.ok === true &&
    allSideEffectsFalse(result));

  record('catalog duplicate nameHash blocks', await sync.preflightLibraryCatalog(Object.assign({}, common, {
    operation: 'create',
    canonicalCatalog: Object.assign({}, catalogBase, { subjectId: catalogB }),
    existingCatalogSiblings: [catalogBase]
  })), (result) => result.ok === false &&
    hasCode(result, 'library-catalog-cross-install-name-collision'));

  record('catalog stale base blocks', await sync.preflightLibraryCatalog(Object.assign({}, common, {
    operation: 'rename',
    canonicalCatalog: catalogBase,
    currentLifecycleState: 'active',
    currentRevisionHash: baseB,
    expectedRevisionHash: baseA,
    baseHash: baseA,
    existingCatalogSiblings: []
  })), (result) => result.ok === false &&
    hasCode(result, 'library-catalog-cross-install-stale-base'));

  record('catalog lifecycle conflict blocks', await sync.preflightLibraryCatalog(Object.assign({}, common, {
    operation: 'rename',
    canonicalCatalog: Object.assign({}, catalogBase, { lifecycleState: 'archived' }),
    currentLifecycleState: 'archived',
    expectedState: { lifecycleState: 'active' },
    expectedTargetState: { lifecycleState: 'active' },
    existingCatalogSiblings: []
  })), (result) => result.ok === false &&
    hasCode(result, 'library-catalog-cross-install-lifecycle-conflict'));

  record('catalog missing conflict context warns only', await sync.preflightLibraryCatalog(Object.assign({}, common, {
    operation: 'create',
    canonicalCatalog: catalogBase
  })), (result) => result.ok === true &&
    hasCode(result, 'library-conflict-runtime-context-missing'));

  record('catalog missing conflict context can block', await sync.preflightLibraryCatalog(Object.assign({}, common, {
    operation: 'create',
    canonicalCatalog: catalogBase,
    requireConflictGate: true
  })), (result) => result.ok === false &&
    hasCode(result, 'library-conflict-runtime-context-missing'));

  record('binding preflight clean runtime pass', await sync.preflightLibraryBinding(Object.assign({}, common, {
    operation: 'unbind',
    canonicalBinding: bindingBase,
    relatedCatalogs: [{ subjectType: 'library.catalog', subjectId: labelA, lifecycleState: 'active' }],
    relatedChats: [{ subjectType: 'chat.metadata', subjectId: chatA }],
    expectedState: { bindingState: 'bound' },
    currentState: Object.assign({}, bindingBase, { bindingState: 'bound' })
  })), (result) => result.ok === true &&
    result.conflictRuntimeSummary?.ok === true &&
    allSideEffectsFalse(result));

  record('binding duplicate edge blocks', await sync.preflightLibraryBinding(Object.assign({}, common, {
    operation: 'bind',
    canonicalBinding: bindingBase,
    relatedCatalogs: [{ subjectType: 'library.catalog', subjectId: labelA, lifecycleState: 'active' }],
    relatedChats: [{ subjectType: 'chat.metadata', subjectId: chatA }],
    siblingBindings: [Object.assign({}, bindingBase, { subjectId: bindingB, dedupeKey: h('other-dedupe') })]
  })), (result) => result.ok === false &&
    hasCode(result, 'library-binding-cross-install-duplicate-edge'));

  record('binding bind/unbind state conflict blocks', await sync.preflightLibraryBinding(Object.assign({}, common, {
    operation: 'bind',
    canonicalBinding: bindingBase,
    relatedCatalogs: [{ subjectType: 'library.catalog', subjectId: labelA, lifecycleState: 'active' }],
    relatedChats: [{ subjectType: 'chat.metadata', subjectId: chatA }],
    expectedState: { bindingState: 'unbound' },
    currentState: { bindingState: 'bound' }
  })), (result) => result.ok === false &&
    hasCode(result, 'library-binding-cross-install-state-conflict'));

  record('binding chat-category duplicate active edge blocks', await sync.preflightLibraryBinding(Object.assign({}, common, {
    operation: 'bind',
    canonicalBinding: {
      subjectType: 'library.binding',
      subjectId: h('chat-category-b'),
      bindingKind: 'chat-category',
      leftSubjectId: chatA,
      rightSubjectId: categoryB,
      leftSubjectType: 'chat.metadata',
      rightSubjectType: 'library.catalog',
      originAccountIdHash: account,
      bindingState: 'bound'
    },
    relatedCatalogs: [{ subjectType: 'library.catalog', subjectId: categoryB, lifecycleState: 'active' }],
    relatedChats: [{ subjectType: 'chat.metadata', subjectId: chatA }],
    siblingBindings: [{
      subjectType: 'library.binding',
      subjectId: h('chat-category-a'),
      bindingKind: 'chat-category',
      leftSubjectId: chatA,
      rightSubjectId: categoryA,
      leftSubjectType: 'chat.metadata',
      rightSubjectType: 'library.catalog',
      bindingState: 'bound'
    }]
  })), (result) => result.ok === false &&
    hasCode(result, 'library-binding-cross-install-state-conflict'));

  record('binding chat-folder duplicate active edge blocks', await sync.preflightLibraryBinding(Object.assign({}, common, {
    operation: 'bind',
    canonicalBinding: {
      subjectType: 'library.binding',
      subjectId: h('chat-folder-b'),
      bindingKind: 'chat-folder',
      leftSubjectId: chatA,
      rightSubjectId: folderB,
      leftSubjectType: 'chat.metadata',
      rightSubjectType: 'folder.metadata',
      originAccountIdHash: account,
      bindingState: 'bound'
    },
    relatedChats: [{ subjectType: 'chat.metadata', subjectId: chatA }],
    siblingBindings: [{
      subjectType: 'library.binding',
      subjectId: h('chat-folder-a'),
      bindingKind: 'chat-folder',
      leftSubjectId: chatA,
      rightSubjectId: folderA,
      leftSubjectType: 'chat.metadata',
      rightSubjectType: 'folder.metadata',
      bindingState: 'bound'
    }]
  })), (result) => result.ok === false &&
    hasCode(result, 'library-binding-cross-install-state-conflict') &&
    JSON.stringify(result).includes('folder.metadata'));

  record('cache drift remains warning only', await sync.preflightLibraryBinding(Object.assign({}, common, {
    operation: 'unbind',
    canonicalBinding: bindingBase,
    relatedCatalogs: [{ subjectType: 'library.catalog', subjectId: labelA, lifecycleState: 'active' }],
    relatedChats: [{ subjectType: 'chat.metadata', subjectId: chatA }],
    expectedState: { bindingState: 'bound' },
    currentState: Object.assign({}, bindingBase, { bindingState: 'bound' }),
    materializedCacheObservation: { driftDetected: true }
  })), (result) => result.ok === true &&
    hasCode(result, 'library-cache-cross-install-drift'));

  cases.forEach((entry) => assert(entry.ok, `${entry.caseId}: preflight integration proof failed`));
  cases.forEach((entry, index) => {
    assert(allSideEffectsFalse(entry.result), `preflight case ${index}: sideEffectSummary must be all false`);
    assert(entry.result.conflictRuntimeSummary, `preflight case ${index}: conflictRuntimeSummary missing`);
  });

  const unavailableContext = buildContext();
  installPreflightDiagnostics(unavailableContext);
  vm.runInContext(read(catalogPreflight), unavailableContext, { filename: catalogPreflight });
  const unavailable = await unavailableContext.H2O.Desktop.Sync.preflightLibraryCatalog(Object.assign({}, common, {
    operation: 'archive',
    canonicalCatalog: catalogBase,
    currentLifecycleState: 'active'
  }));
  assert(unavailable.ok === true && hasCode(unavailable, 'library-conflict-runtime-unavailable'), 'unavailable conflict runtime should warn only');
  const requiredUnavailable = await unavailableContext.H2O.Desktop.Sync.preflightLibraryCatalog(Object.assign({}, common, {
    operation: 'archive',
    canonicalCatalog: catalogBase,
    currentLifecycleState: 'active',
    requireConflictGate: true
  }));
  assert(requiredUnavailable.ok === false && hasCode(requiredUnavailable, 'library-conflict-runtime-required-unavailable'), 'required unavailable conflict runtime should block');

  return {
    caseCount: cases.length + 2,
    passCount: cases.length + 2,
    sideEffectsSafe: cases.every((entry) => allSideEffectsFalse(entry.result)) && allSideEffectsFalse(unavailable) && allSideEffectsFalse(requiredUnavailable)
  };
}

function buildSettlementEnvelope(domainId, operation, overrides = {}) {
  const isBinding = domainId === 'library.binding';
  const subjectId = overrides.subjectId || h(`${domainId}:${operation}:subject`);
  const receiptDigest = overrides.receiptDigest || h(`${domainId}:${operation}:receipt`);
  const eventDigest = overrides.eventDigest || h(`${domainId}:${operation}:event`);
  const expectedCurrentState = overrides.expectedCurrentState || (isBinding
    ? {
        subjectType: 'library.binding',
        subjectId,
        bindingKind: overrides.bindingKind || 'chat-label',
        leftSubjectId: overrides.leftSubjectId || h('settlement-chat'),
        rightSubjectId: overrides.rightSubjectId || h('settlement-label'),
        leftSubjectType: 'chat.metadata',
        rightSubjectType: overrides.rightSubjectType || 'library.catalog',
        bindingState: operation === 'bind' ? 'unbound' : 'bound',
        revisionHash: overrides.baseHash || h(`${domainId}:${operation}:base`)
      }
    : {
        subjectType: 'library.catalog',
        subjectId,
        catalogKind: overrides.catalogKind || 'label',
        nameHash: overrides.nameHash || h(`${domainId}:${operation}:name`),
        originAccountIdHash: overrides.account || h('settlement-account'),
        lifecycleState: operation === 'create' ? 'absent' : 'active',
        revisionHash: overrides.baseHash || h(`${domainId}:${operation}:base`)
      });
  const expectedTargetState = overrides.expectedTargetState || (isBinding
    ? Object.assign({}, expectedCurrentState, { bindingState: operation === 'unbind' ? 'unbound' : 'bound', revisionHash: h(`${domainId}:${operation}:target`) })
    : Object.assign({}, expectedCurrentState, { lifecycleState: operation === 'archive' ? 'archived' : operation === 'tombstone' ? 'retained' : 'active', revisionHash: h(`${domainId}:${operation}:target`) }));
  const settlementShapes = Object.assign({
    revisionHash: expectedTargetState.revisionHash || h(`${domainId}:${operation}:target`),
    postStateHash: expectedTargetState.revisionHash || h(`${domainId}:${operation}:target`),
    settlementDigest: h(`${domainId}:${operation}:settlement`),
    receiptDigest,
    bookkeepingRowId: h(`${domainId}:${operation}:bookkeeping`),
    expectedCurrentState,
    expectedTargetState
  }, isBinding ? {
    bindingKind: expectedTargetState.bindingKind || overrides.bindingKind || 'chat-label',
    leftSubjectId: expectedTargetState.leftSubjectId || overrides.leftSubjectId || h('settlement-chat'),
    rightSubjectId: expectedTargetState.rightSubjectId || overrides.rightSubjectId || h('settlement-label'),
    leftSubjectType: expectedTargetState.leftSubjectType || 'chat.metadata',
    rightSubjectType: expectedTargetState.rightSubjectType || overrides.rightSubjectType || 'library.catalog',
    requiresCategoryCacheRefresh: false,
    categoryCacheAction: null
  } : {});
  const payloadReceipt = isBinding
    ? {
        schema: 'h2o.desktop.sync.library-binding-execute-proposal-receipt.v1',
        domainId,
        operationKind: `library-binding-${operation}-applied`,
        flavor: `library-binding-${operation}-${settlementShapes.bindingKind}`,
        receiptDigest,
        applyEventDigest: eventDigest,
        canonicalSubjectId: subjectId,
        canonicalRevisionHash: settlementShapes.revisionHash,
        canonicalBindingKind: settlementShapes.bindingKind,
        leftSubjectId: settlementShapes.leftSubjectId,
        rightSubjectId: settlementShapes.rightSubjectId,
        leftSubjectType: settlementShapes.leftSubjectType,
        rightSubjectType: settlementShapes.rightSubjectType
      }
    : {
        schema: 'h2o.desktop.sync.library-catalog-execute-proposal-receipt.v1',
        domainId,
        operationKind: `library-catalog-${operation}-applied`,
        flavor: `library-catalog-${operation}`,
        receiptDigest,
        applyEventDigest: eventDigest,
        canonicalSubjectId: subjectId,
        canonicalRevisionHash: settlementShapes.revisionHash,
        canonicalKindTag: expectedTargetState.catalogKind || 'label',
        canonicalNameHash: expectedTargetState.nameHash || h(`${domainId}:${operation}:name`)
      };
  return {
    schema: 'h2o.desktop.sync.execute-envelope.v1',
    version: isBinding ? '0.2.0-f15.11.c' : '0.1.0-f15.8.catalog',
    envelopeKind: 'proposal-receipt',
    flavor: payloadReceipt.flavor,
    domainId,
    operationKind: payloadReceipt.operationKind,
    subjectId,
    lineageId: h(`${domainId}:${operation}:lineage`),
    dedupeKey: h(`${domainId}:${operation}:dedupe`),
    eventDigest,
    dispatchProfile: { requiresNative: isBinding, requiresF5: false, requiresRelay: false, nativeIdempotent: true },
    payloadShapes: { proposalReceipt: payloadReceipt },
    settlementShapes,
    receiptDigest,
    receiptKind: `${operation}-applied`,
    bookkeepingRowId: h(`${domainId}:${operation}:bookkeeping`),
    originAccountIdHash: overrides.account || h('settlement-account'),
    actorPeer: {
      physicalDeviceIdHash: h('peer-physical'),
      installIdHash: h('peer-install'),
      syncPeerIdHash: h('peer-sync'),
      surfaceKind: 'desktop-tauri'
    },
    createdAtIso: '2026-06-12T00:00:00Z',
    observedAtIso: '2026-06-12T00:00:00Z'
  };
}

function buildReceipt(domainId, envelope) {
  return {
    schema: domainId === 'library.binding'
      ? 'h2o.desktop.sync.library-binding-apply-event-receipt.v1'
      : 'h2o.desktop.sync.library-catalog-apply-event-receipt.v1',
    ok: true,
    receiptDigest: envelope.receiptDigest,
    applyEventDigest: envelope.eventDigest,
    subjectId: envelope.subjectId,
    lineageId: envelope.lineageId,
    dedupeKey: envelope.dedupeKey,
    operation: envelope.operationKind,
    originAccountIdHash: envelope.originAccountIdHash,
    actorPeer: envelope.actorPeer,
    receipt: { receiptKind: envelope.receiptKind },
    applyEvent: { payload: {} },
    auditMetadata: {}
  };
}

async function runSettlementIntegrationProof(moduleFile, settlementFile, bulkFile) {
  const context = buildContext();
  vm.runInContext(read(moduleFile), context, { filename: moduleFile });
  vm.runInContext(read(settlementFile), context, { filename: settlementFile });
  vm.runInContext(read(bulkFile), context, { filename: bulkFile });
  const sync = context.H2O.Desktop.Sync;
  const cases = [];
  async function settle(domainId, operation, options = {}) {
    const envelope = buildSettlementEnvelope(domainId, operation, options);
    const consumedRows = [];
    const watermarkRows = [];
    let bookkeepingCalls = 0;
    const result = await sync.settleLibraryExecuteEnvelope({
      envelope,
      dispatchResult: { ok: true, applied: true },
      receipt: buildReceipt(domainId, envelope),
      __consumedRows: consumedRows,
      __watermarkRows: watermarkRows,
      recordLibraryCatalogBookkeeping: async () => {
        bookkeepingCalls += 1;
        return { ok: true, row: { rowId: h('catalog-bookkeeping-row') }, blockers: [], warnings: [] };
      },
      recordLibraryBindingBookkeeping: async () => {
        bookkeepingCalls += 1;
        return { ok: true, row: { rowId: h('binding-bookkeeping-row') }, blockers: [], warnings: [] };
      },
      existingCatalogs: options.existingCatalogs || [],
      existingBindings: options.existingBindings || [],
      currentState: options.currentState,
      expectedState: options.expectedState,
      expectedTargetState: options.expectedTargetState,
      f5Review: options.f5Review,
      cacheObservation: options.cacheObservation,
      bridgeContext: options.bridgeContext
    });
    return { result, consumedRows, watermarkRows, bookkeepingCalls };
  }
  function record(caseId, settled, check) {
    cases.push({ caseId, ok: check(settled), settled });
  }
  const cleanCatalog = await settle('library.catalog', 'create');
  record('clean catalog settlement passes conflict gate', cleanCatalog, ({ result, consumedRows, watermarkRows, bookkeepingCalls }) =>
    result.ok === true && result.settled === true && result.conflictRuntimeSummary?.ok === true &&
    consumedRows.length === 1 && watermarkRows.length === 1 && bookkeepingCalls === 1);
  const collisionName = h('collision-name');
  const duplicateCatalog = await settle('library.catalog', 'create', {
    nameHash: collisionName,
    expectedTargetState: {
      subjectType: 'library.catalog',
      subjectId: h('new-catalog'),
      catalogKind: 'label',
      nameHash: collisionName,
      originAccountIdHash: h('settlement-account'),
      lifecycleState: 'active',
      revisionHash: h('new-catalog-target')
    },
    existingCatalogs: [{
      subjectType: 'library.catalog',
      subjectId: h('existing-catalog'),
      catalogKind: 'label',
      nameHash: collisionName,
      originAccountIdHash: h('settlement-account'),
      lifecycleState: 'active'
    }]
  });
  record('duplicate nameHash blocks before consumed-op/watermark', duplicateCatalog, ({ result, consumedRows, watermarkRows, bookkeepingCalls }) =>
    result.ok === false && hasCode(result, 'library-catalog-cross-install-name-collision') &&
    consumedRows.length === 0 && watermarkRows.length === 0 && bookkeepingCalls === 0 && allSideEffectsFalse(result));
  const staleCatalog = await settle('library.catalog', 'rename', {
    expectedState: { lifecycleState: 'active', revisionHash: h('old-base') },
    currentState: { lifecycleState: 'active', revisionHash: h('new-base') }
  });
  record('stale base blocks before consumed-op/watermark', staleCatalog, ({ result, consumedRows, watermarkRows }) =>
    result.ok === false && hasCode(result, 'library-catalog-cross-install-stale-base') &&
    consumedRows.length === 0 && watermarkRows.length === 0);
  const f5Conflict = await settle('library.catalog', 'tombstone', {
    currentState: { lifecycleState: 'active', revisionHash: h('f5-base') },
    expectedState: { lifecycleState: 'active', revisionHash: h('f5-base') },
    expectedTargetState: { lifecycleState: 'retained', revisionHash: h('f5-target') },
    f5Review: { currentTerminal: 'sealed', expectedTerminal: 'restored' }
  });
  record('F5 terminal conflict blocks before consumed-op/watermark', f5Conflict, ({ result, consumedRows, watermarkRows }) =>
    result.ok === false && hasCode(result, 'library-catalog-f5-review-conflict') &&
    consumedRows.length === 0 && watermarkRows.length === 0);
  const cleanBinding = await settle('library.binding', 'bind', { existingBindings: [] });
  record('clean binding settlement passes conflict gate', cleanBinding, ({ result, consumedRows, watermarkRows }) =>
    result.ok === true && result.settled === true && consumedRows.length === 1 && watermarkRows.length === 1);
  const left = h('one-active-chat');
  const right = h('new-folder');
  const folderConflict = await settle('library.binding', 'bind', {
    bindingKind: 'chat-folder',
    leftSubjectId: left,
    rightSubjectId: right,
    rightSubjectType: 'folder.metadata',
    existingBindings: [{
      subjectType: 'library.binding',
      subjectId: h('old-folder-binding'),
      bindingKind: 'chat-folder',
      leftSubjectId: left,
      rightSubjectId: h('old-folder'),
      leftSubjectType: 'chat.metadata',
      rightSubjectType: 'folder.metadata',
      bindingState: 'bound'
    }]
  });
  record('chat-folder one-active conflict blocks before consumed-op/watermark', folderConflict, ({ result, consumedRows, watermarkRows }) =>
    result.ok === false && hasCode(result, 'library-binding-cross-install-state-conflict') &&
    JSON.stringify(result).includes('folder.metadata') && consumedRows.length === 0 && watermarkRows.length === 0);
  const bridgeConflict = await settle('library.binding', 'bind', {
    bindingKind: 'chat-folder',
    rightSubjectType: 'folder.metadata',
    existingBindings: [],
    bridgeContext: { activeStateConflict: true }
  });
  record('F7/F15 identity conflict blocks before consumed-op/watermark', bridgeConflict, ({ result, consumedRows, watermarkRows }) =>
    result.ok === false && hasCode(result, 'library-binding-f7-f15-identity-conflict') &&
    consumedRows.length === 0 && watermarkRows.length === 0);
  const warningsOnly = await settle('library.binding', 'unbind', {
    expectedState: { bindingState: 'bound' },
    currentState: { bindingState: 'bound' },
    cacheObservation: { driftDetected: true }
  });
  record('warnings-only conflict runtime does not block', warningsOnly, ({ result, consumedRows, watermarkRows }) =>
    result.ok === true && hasCode(result, 'library-cache-cross-install-drift') &&
    consumedRows.length === 1 && watermarkRows.length === 1);

  const unavailableContext = buildContext();
  vm.runInContext(read(settlementFile), unavailableContext, { filename: settlementFile });
  const unavailableEnvelope = buildSettlementEnvelope('library.catalog', 'create');
  const unavailable = await unavailableContext.H2O.Desktop.Sync.settleLibraryExecuteEnvelope({
    envelope: unavailableEnvelope,
    dispatchResult: { ok: true, applied: true },
    receipt: buildReceipt('library.catalog', unavailableEnvelope),
    __consumedRows: [],
    __watermarkRows: [],
    existingCatalogs: []
  });
  assert(unavailable.ok === false && hasCode(unavailable, 'library-conflict-runtime-required-unavailable'),
    'settlement unavailable conflict runtime should block');
  const throwsContext = buildContext();
  vm.runInContext(read(settlementFile), throwsContext, { filename: settlementFile });
  throwsContext.H2O.Desktop.Sync.evaluateLibraryCatalogRuntimeConflict = () => { throw new Error('forced'); };
  const throwsEnvelope = buildSettlementEnvelope('library.catalog', 'create');
  const thrown = await throwsContext.H2O.Desktop.Sync.settleLibraryExecuteEnvelope({
    envelope: throwsEnvelope,
    dispatchResult: { ok: true, applied: true },
    receipt: buildReceipt('library.catalog', throwsEnvelope),
    __consumedRows: [],
    __watermarkRows: [],
    existingCatalogs: []
  });
  assert(thrown.ok === false && hasCode(thrown, 'library-conflict-runtime-required-unavailable'),
    'settlement throwing conflict runtime should block');

  let executorCalled = false;
  const bulk = await sync.executeLibraryBulkMigration({
    phase: 'bindings',
    importBatchId: 'conflict-proof-batch',
    labelBindings: [{ chatId: 'proof-chat-a', labelId: 'proof-label-a' }],
    conflictRowIndexes: [0],
    authorizedExecutor: async () => {
      executorCalled = true;
      return { ok: true, identity: 'f15.bulk-migration', rowsAffected: 1, sqliteSentinelUsed: true };
    }
  });
  assert(bulk.status === 'partial' && hasCode(bulk, 'library-bulk-cross-install-partial-conflict'),
    'bulk partial conflict should be reported');
  assert(executorCalled === false, 'bulk partial conflict must not execute SQL');

  cases.forEach((entry) => assert(entry.ok, `${entry.caseId}: settlement integration proof failed`));
  return {
    caseCount: cases.length + 3,
    passCount: cases.length + 3,
    sideEffectsSafe: cases.every((entry) => {
      if (entry.settled.result.ok === false) return allSideEffectsFalse(entry.settled.result);
      return true;
    }) && allSideEffectsFalse(unavailable) && allSideEffectsFalse(thrown)
  };
}

const moduleFile = 'src-surfaces-base/studio/sync/library/library-conflict-runtime.tauri.js';
const validatorFile = 'tools/validation/sync/validate-f16-library-conflict-runtime.mjs';
const html = 'src-surfaces-base/studio/studio.html';
const pack = 'tools/product/studio/pack-studio.mjs';
const catalogPreflight = 'src-surfaces-base/studio/sync/library/library-catalog-preflight.tauri.js';
const bindingPreflight = 'src-surfaces-base/studio/sync/library/library-binding-preflight.tauri.js';
const settlement = 'src-surfaces-base/studio/sync/execute/execute-settlement-writer-library-extension.tauri.js';
const bulkMigration = 'src-surfaces-base/studio/sync/library/library-bulk-migration.tauri.js';
const syncProof = 'src-surfaces-base/studio/sync/library/library-sync-proof.tauri.js';
const closureValidator = 'tools/validation/sync/validate-f15-library-closure.mjs';
const syncProofValidator = 'tools/validation/sync/validate-f15-library-sync-proof.mjs';

[moduleFile, validatorFile, html, pack, catalogPreflight, bindingPreflight, settlement, bulkMigration, syncProof, closureValidator, syncProofValidator].forEach(assertExists);

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

  [
    "var VERSION = '0.2.0-f16.1.b'",
    'evaluateLibraryCatalogRuntimeConflict',
    'library-conflict-runtime-unavailable',
    'library-conflict-runtime-threw',
    'library-conflict-runtime-required-unavailable',
    'conflictRuntime',
    'conflictRuntimeSummary'
  ].forEach((needle) => assertContains(catalogPreflight, needle, `catalog preflight ${needle}`));
  [
    "var VERSION = '0.3.0-f16.1.b'",
    'evaluateLibraryBindingRuntimeConflict',
    'library-conflict-runtime-unavailable',
    'library-conflict-runtime-threw',
    'library-conflict-runtime-required-unavailable',
    'conflictRuntime',
    'conflictRuntimeSummary'
  ].forEach((needle) => assertContains(bindingPreflight, needle, `binding preflight ${needle}`));
  [
    "var VERSION = '0.3.0-f16.1.c'",
    'evaluateSettlementConflict',
    'settlementConflictInput',
    'evaluateLibraryCatalogRuntimeConflict',
    'evaluateLibraryBindingRuntimeConflict',
    'evaluateLibraryRuntimeConflict',
    'library-conflict-runtime-required-unavailable',
    'library-conflict-runtime-context-missing',
    'library-conflict-runtime-threw',
    'conflictRuntime',
    'conflictRuntimeSummary'
  ].forEach((needle) => assertContains(settlement, needle, `settlement ${needle}`));
  assertOrder(settlement, 'var conflictRuntime = await evaluateSettlementConflict(stepInput);', "return await withWriterIdentity('f15.execute-settlement-writer'");
  assertOrder(settlement, 'var conflictRuntime = await evaluateSettlementConflict(stepInput);', 'writeLibraryCatalogConsumedOperation(stepInput)');
  [
    "var VERSION = '0.2.0-f16.1.c'",
    'classifyLibraryBulkRuntimeConflictRows',
    'classifyBulkRuntimeConflicts',
    'library-bulk-cross-install-partial-conflict',
    'conflictRuntime',
    'conflictRuntimeSummary'
  ].forEach((needle) => assertContains(bulkMigration, needle, `bulk migration ${needle}`));
  [
    "var VERSION = '1.1.0-f16.3.d'",
    "var RUNTIME_CONFLICT_GATE_SCHEMA = 'h2o.desktop.sync.library-runtime-conflict-gate-proof.v1'",
    'RUNTIME_CONFLICT_GATE_CASE_NAMES',
    'runLibraryRuntimeConflictGateProof',
    'H2O.Desktop.Sync.runLibraryRuntimeConflictGateProof = runLibraryRuntimeConflictGateProof',
    'closure-runtime-conflict-gate-proof-complete',
    'runtime-gate-settlement-mode-used',
    'runtime-gate-unavailable-blocks-before-mutation',
    'runtime-gate-thrown-blocks-before-mutation',
    'runtime-gate-blocker-prevents-consumed-op',
    'runtime-gate-blocker-prevents-watermark',
    'runtime-gate-blocker-prevents-all-side-effects',
    'runtime-gate-bulk-classification-before-sql',
    'runtime-gate-conflict-reports-redacted',
    'runtime-gate-blocked-side-effects-false'
  ].forEach((needle) => assertContains(syncProof, needle, `sync proof ${needle}`));
  assertContains(closureValidator, 'closure-runtime-conflict-gate-proof-complete', 'closure validator requires runtime conflict gate closure case');
  assertContains(syncProofValidator, 'RUNTIME_CONFLICT_GATE_CASE_NAMES', 'sync proof validator requires runtime conflict gate cases');

  const proof = await runRuntimeProof(moduleFile);
  assert(proof.caseCount >= 13, 'runtime proof should cover required cases');
  assert(proof.passCount === proof.caseCount, 'runtime proof should pass all cases');
  assert(proof.sideEffectsSafe === true, 'runtime proof side effects should be safe');
  const preflightProof = await runPreflightIntegrationProof(moduleFile, catalogPreflight, bindingPreflight);
  assert(preflightProof.caseCount >= 14, 'preflight integration proof should cover required cases');
  assert(preflightProof.passCount === preflightProof.caseCount, 'preflight integration proof should pass all cases');
  assert(preflightProof.sideEffectsSafe === true, 'preflight integration side effects should be safe');
  const settlementProof = await runSettlementIntegrationProof(moduleFile, settlement, bulkMigration);
  assert(settlementProof.caseCount >= 11, 'settlement integration proof should cover required cases');
  assert(settlementProof.passCount === settlementProof.caseCount, 'settlement integration proof should pass all cases');
  assert(settlementProof.sideEffectsSafe === true, 'settlement integration blocked side effects should be safe');
}

if (failures.length) {
  console.error('F16 library conflict runtime validation failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('F16 library conflict runtime validation passed');
