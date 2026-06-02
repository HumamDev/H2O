#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';
import { TextEncoder } from 'node:util';

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

function makeHash(label) {
  return sha256Hex(`f15.11.a:${label}`);
}

function buildContext() {
  const context = {
    console,
    TextEncoder,
    crypto: crypto.webcrypto,
    __TAURI_INTERNALS__: { invoke() {} },
    H2O: {
      Desktop: {
        Sync: {
          kernel: {
            canonicalJSON,
            sha256Hex,
            isSha256Hex(value) {
              return /^[0-9a-f]{64}$/.test(String(value || '').trim());
            },
            scanDomainForbiddenFields(domainTag, target) {
              const forbidden = [];
              const keys = [
                'chatId',
                'chat_id',
                'folderId',
                'folder_id',
                'name',
                'color',
                'path',
                'url',
                'content',
                'token'
              ];
              function scan(value) {
                if (!value || typeof value !== 'object') return;
                if (Array.isArray(value)) {
                  value.forEach(scan);
                  return;
                }
                for (const key of Object.keys(value)) {
                  if (keys.includes(key)) forbidden.push({ fieldName: key });
                  scan(value[key]);
                }
              }
              scan(target);
              return {
                ok: forbidden.length === 0,
                forbiddenFields: forbidden,
                blockers: forbidden.length ? [{ code: 'privacy-forbidden-field' }] : [],
                warnings: []
              };
            }
          }
        }
      },
      Studio: {
        store: {
          folders: {
            diagnose() {
              return { installed: true, ready: true, backend: 'sqlite' };
            },
            getAll() {},
            list() {},
            listChats() {},
            listForChat() {},
            count() {}
          }
        }
      }
    }
  };
  context.globalThis = context;
  return vm.createContext(context);
}

async function runRuntimeProof(moduleFile) {
  const text = read(moduleFile);
  const context = buildContext();
  vm.runInContext(text, context, { filename: moduleFile });
  const sync = context.H2O.Desktop.Sync;
  assert(sync.__libraryFolderBindingBridgeDiagnosticInstalled === true, 'installed marker missing at runtime');
  assert(sync.__libraryFolderBindingBridgeDiagnosticVersion === '0.1.0-f15.11.a', 'version marker mismatch at runtime');
  assert(typeof sync.runLibraryFolderBindingBridgeDiagnostic === 'function', 'runtime API missing');

  const chatA = makeHash('chat-a');
  const chatB = makeHash('chat-b');
  const folderA = makeHash('folder-a');
  const folderB = makeHash('folder-b');
  const salt = makeHash('salt');
  const validInput = {
    perEnvelopeSalt: salt,
    chatSubjects: [chatA],
    folderSubjects: [folderA],
    folderBindings: [{ chatSubjectId: chatA, folderSubjectId: folderA, status: 'bound' }]
  };

  const valid = await sync.runLibraryFolderBindingBridgeDiagnostic(validInput);
  assert(valid.ok === true, 'valid binding should map cleanly');
  assert(valid.mappedCount === 1, 'valid binding mapped count should be 1');
  assert(valid.privacy && valid.privacy.ok === true, 'valid privacy scan should pass');
  assert(valid.sideEffectSummary && Object.values(valid.sideEffectSummary).every((value) => value === false), 'sideEffectSummary must be all false');

  const mapping = valid.mappings[0];
  const expectedF13 = sha256Hex(`folderBinding:${chatA}:${folderA}`);
  const expectedF15 = sha256Hex(canonicalJSON({
    subjectType: 'library.binding',
    bindingKind: 'chat-folder',
    leftSubjectId: chatA,
    rightSubjectId: folderA,
    perEnvelopeSalt: salt
  }));
  assert(mapping.legacyF13SubjectId === expectedF13, 'F13 identity mismatch');
  assert(mapping.libraryBindingSubjectId === expectedF15, 'F15 identity mismatch');

  const repeat = await sync.runLibraryFolderBindingBridgeDiagnostic(validInput);
  assert(repeat.mappings[0].migrationDigest === mapping.migrationDigest, 'migrationDigest should be deterministic');

  const duplicate = await sync.runLibraryFolderBindingBridgeDiagnostic({
    perEnvelopeSalt: salt,
    chatSubjects: [chatB],
    folderSubjects: [folderA, folderB],
    folderBindings: [
      { chatSubjectId: chatB, folderSubjectId: folderA, status: 'bound' },
      { chatSubjectId: chatB, folderSubjectId: folderB, status: 'bound' }
    ]
  });
  assert(duplicate.ok === false, 'duplicate active chat-folder should block');
  assert(duplicate.duplicateCount === 1, 'duplicate count should be 1');
  assert(duplicate.cardinalityViolationCount === 1, 'cardinality violation count should be 1');

  const missingChat = await sync.runLibraryFolderBindingBridgeDiagnostic({
    perEnvelopeSalt: salt,
    folderSubjects: [folderA],
    folderBindings: [{ folderSubjectId: folderA }]
  });
  assert(missingChat.ok === false, 'missing chat subject should block');
  assert(missingChat.missingSubjectCount > 0, 'missing chat subject count should increment');

  const missingFolder = await sync.runLibraryFolderBindingBridgeDiagnostic({
    perEnvelopeSalt: salt,
    chatSubjects: [chatA],
    folderSubjects: [],
    folderBindings: [{ chatSubjectId: chatA, folderSubjectId: folderA }]
  });
  assert(missingFolder.ok === false, 'missing folder subject should block');
  assert(missingFolder.missingSubjectCount > 0, 'missing folder subject count should increment');

  const malformed = await sync.runLibraryFolderBindingBridgeDiagnostic({
    perEnvelopeSalt: salt,
    chatSubjects: [],
    folderSubjects: [folderA],
    folderBindings: [{ chatSubjectId: 'not-a-hash', folderSubjectId: folderA }]
  });
  assert(malformed.ok === false, 'malformed hash should block');
  assert(malformed.malformedHashCount > 0, 'malformed hash count should increment');

  const privacy = await sync.runLibraryFolderBindingBridgeDiagnostic({
    perEnvelopeSalt: salt,
    chatSubjects: [chatA],
    folderSubjects: [folderA],
    folderBindings: [{ chatSubjectId: chatA, folderSubjectId: folderA, chat_id: 'raw-chat' }]
  });
  assert(privacy.ok === false, 'raw privacy field should block');
  assert(privacy.privacy && privacy.privacy.ok === false, 'privacy leak scan should fail on raw field');

  return {
    validOk: valid.ok,
    duplicateBlocked: duplicate.ok === false,
    missingChatBlocked: missingChat.ok === false,
    missingFolderBlocked: missingFolder.ok === false,
    malformedBlocked: malformed.ok === false,
    privacyBlocked: privacy.ok === false,
    deterministicDigest: repeat.mappings[0].migrationDigest === mapping.migrationDigest,
    sideEffectsSafe: Object.values(valid.sideEffectSummary).every((value) => value === false)
  };
}

async function runShadowRuntimeProof(moduleFile) {
  const text = read(moduleFile);
  const context = buildContext();
  vm.runInContext(text, context, { filename: moduleFile });
  const sync = context.H2O.Desktop.Sync;
  assert(sync.__libraryFolderBindingMigrationShadowInstalled === true, 'shadow installed marker missing at runtime');
  assert(sync.__libraryFolderBindingMigrationShadowVersion === '0.1.0-f15.11.d', 'shadow version marker mismatch at runtime');
  assert(sync.__enableF15FolderBindingDelegation === false, 'delegation flag must default off');
  assert(typeof sync.createLibraryFolderBindingMigrationShadow === 'function', 'shadow create API missing');
  assert(typeof sync.listLibraryFolderBindingMigrationShadows === 'function', 'shadow list API missing');
  assert(typeof sync.setF15FolderBindingDelegationEnabled === 'function', 'delegation setter API missing');
  assert(typeof sync.isF15FolderBindingDelegationEnabled === 'function', 'delegation getter API missing');

  const chatA = makeHash('shadow-chat-a');
  const folderA = makeHash('shadow-folder-a');
  const salt = makeHash('shadow-salt');
  const created = await sync.createLibraryFolderBindingMigrationShadow({
    chatSubjectId: chatA,
    folderSubjectId: folderA,
    perEnvelopeSalt: salt,
    observedAtIso: '2026-06-02T00:00:00Z'
  });
  assert(created.ok === true, 'shadow create should pass');
  assert(created.created === true, 'shadow create should report created');
  assert(created.sideEffectSummary && Object.values(created.sideEffectSummary).every((value) => value === false), 'shadow sideEffectSummary must be all false');

  const expectedF13 = sha256Hex(`folderBinding:${chatA}:${folderA}`);
  const expectedF15 = sha256Hex(canonicalJSON({
    subjectType: 'library.binding',
    bindingKind: 'chat-folder',
    leftSubjectId: chatA,
    rightSubjectId: folderA,
    perEnvelopeSalt: salt
  }));
  assert(created.shadowEvent.legacyF13SubjectId === expectedF13, 'shadow F13 identity mismatch');
  assert(created.shadowEvent.libraryBindingSubjectId === expectedF15, 'shadow F15 identity mismatch');

  const duplicate = await sync.createLibraryFolderBindingMigrationShadow({
    chatSubjectId: chatA,
    folderSubjectId: folderA,
    perEnvelopeSalt: salt,
    observedAtIso: '2026-06-02T00:00:00Z'
  });
  assert(duplicate.ok === true, 'duplicate shadow should remain ok');
  assert(duplicate.alreadyPresent === true, 'duplicate shadow should be idempotent');
  assert(duplicate.row.migrationDigest === created.shadowEvent.migrationDigest, 'duplicate shadow digest should match');

  const listed = sync.listLibraryFolderBindingMigrationShadows({});
  assert(listed.ok === true, 'shadow list should pass');
  assert(listed.rowCount === 1, 'shadow ledger should contain one unique row');

  const privacy = await sync.createLibraryFolderBindingMigrationShadow({
    chatSubjectId: chatA,
    folderSubjectId: folderA,
    perEnvelopeSalt: salt,
    folderId: 'raw-folder'
  });
  assert(privacy.ok === false, 'shadow raw privacy field should block');
  assert(privacy.privacy && privacy.privacy.ok === false, 'shadow privacy result should fail on raw field');

  sync.setF15FolderBindingDelegationEnabled(true);
  assert(sync.isF15FolderBindingDelegationEnabled() === true, 'delegation setter should enable flag');
  sync.setF15FolderBindingDelegationEnabled(false);
  assert(sync.isF15FolderBindingDelegationEnabled() === false, 'delegation setter should disable flag');

  return {
    createOk: created.ok,
    duplicateIdempotent: duplicate.alreadyPresent === true,
    listCount: listed.rowCount,
    privacyBlocked: privacy.ok === false,
    deterministicF13: created.shadowEvent.legacyF13SubjectId === expectedF13,
    deterministicF15: created.shadowEvent.libraryBindingSubjectId === expectedF15,
    sideEffectsSafe: Object.values(created.sideEffectSummary).every((value) => value === false),
    delegationDefaultsOff: sync.isF15FolderBindingDelegationEnabled() === false
  };
}

const doc = 'docs/systems/cross-platform/f15.11-folder-binding-absorption-plan.md';
const moduleFile = 'src-surfaces-base/studio/sync/library/library-folder-binding-bridge-diagnostic.tauri.js';
const shadowModule = 'src-surfaces-base/studio/sync/library/library-folder-binding-migration-shadow.tauri.js';
const folderStore = 'src-surfaces-base/studio/store/folders.tauri.js';
const bindingCanonicalizer = 'src-surfaces-base/studio/sync/library/library-binding-canonicalizer.tauri.js';
const bindingDiagnostics = 'src-surfaces-base/studio/sync/library/library-binding-diagnostics.tauri.js';
const bindingPreflight = 'src-surfaces-base/studio/sync/library/library-binding-preflight.tauri.js';
const bindingProposal = 'src-surfaces-base/studio/sync/library/library-binding-proposal-candidate-generator.tauri.js';
const bindingHandoff = 'src-surfaces-base/studio/sync/library/library-binding-handoff-preview.tauri.js';
const bindingReceipt = 'src-surfaces-base/studio/sync/library/library-binding-apply-event-receipt.tauri.js';
const bindingBookkeeping = 'src-surfaces-base/studio/sync/library/library-binding-bookkeeping.tauri.js';
const bindingExecuteAdapter = 'src-surfaces-base/studio/sync/execute/adapters/library-binding-execute-adapter.tauri.js';
const settlementExtension = 'src-surfaces-base/studio/sync/execute/execute-settlement-writer-library-extension.tauri.js';
const librarySyncProof = 'src-surfaces-base/studio/sync/library/library-sync-proof.tauri.js';
const validator = 'tools/validation/sync/validate-f15-folder-binding-absorption.mjs';
const html = 'src-surfaces-base/studio/studio.html';
const pack = 'tools/product/studio/pack-studio.mjs';
const f7Validator = 'tools/validation/sync/validate-f7-folder-metadata-hash-parity.mjs';

[
  doc,
  moduleFile,
  shadowModule,
  folderStore,
  bindingCanonicalizer,
  bindingDiagnostics,
  bindingPreflight,
  bindingProposal,
  bindingHandoff,
  bindingReceipt,
  bindingBookkeeping,
  bindingExecuteAdapter,
  settlementExtension,
  librarySyncProof,
  validator,
  html,
  pack,
  f7Validator
].forEach(assertExists);

if (failures.length === 0) {
  [
    'F15.11 absorbs existing F7 folder bindings',
    'bindingKind = "chat-folder"',
    'F7 modules',
    'two release cycles',
    'folder.metadata',
    'must not be modeled as `library.catalog`',
    'legacyF10SubjectId',
    'legacyF13SubjectId',
    'sha256("folderBinding:" + chatSubjectId + ":" + folderSubjectId)',
    'sha256(canonicalJSON({',
    'subjectType: "library.binding"',
    'bindingKind: "chat-folder"',
    'leftSubjectId: chatSubjectId',
    'rightSubjectId: folderSubjectId',
    'perEnvelopeSalt',
    'migrationDigest',
    'desktopSetFolderBinding',
    'folder-binding-changed',
    'cache busting',
    'library index refresh',
    'F15.11.a - Bridge Diagnostic',
    'F15.11.b - Enable `chat-folder`',
    'F15.11.c - Execute and Settlement Support',
    'F15.11.d - Migration Shadow Events',
    'F15.11.e - Optional Trigger/Sentinel Protection',
    'F15.11.f - Proof, Validators, and UI Status',
    'validate-f7-folder-metadata-hash-parity.mjs'
  ].forEach((needle) => assertContains(doc, needle));

  [
    "var VERSION = '0.1.0-f15.11.a'",
    "var RESULT_SCHEMA = 'h2o.desktop.sync.library-folder-binding-bridge-diagnostic.v1'",
    "var BINDING_KIND = 'chat-folder'",
    "var CHAT_SUBJECT_TYPE = 'chat.metadata'",
    "var FOLDER_SUBJECT_TYPE = 'folder.metadata'",
    'runLibraryFolderBindingBridgeDiagnostic',
    'H2O.Desktop.Sync.runLibraryFolderBindingBridgeDiagnostic = runLibraryFolderBindingBridgeDiagnostic',
    'H2O.Desktop.Sync.__libraryFolderBindingBridgeDiagnosticInstalled = true',
    'H2O.Desktop.Sync.__libraryFolderBindingBridgeDiagnosticVersion = VERSION',
    'FORBIDDEN_RAW_FIELD_KEYS',
    'folderBinding:',
    'libraryBindingSubjectId',
    'legacyF13SubjectId',
    'legacyF10SubjectId',
    'migrationDigest',
    'chat-folder-conflict',
    'missing-chat-subject-hash',
    'missing-folder-subject-hash',
    'malformed-chat-subject-hash',
    'malformed-folder-subject-hash',
    'library-folder-binding-bridge-identity-mismatch',
    'library-folder-binding-bridge-privacy-failed',
    'publicationTouched: false',
    'relayTouched: false',
    'outboxTouched: false',
    'nativeCalled: false',
    'f5Touched: false',
    'applyExecuted: false',
    'watermarkWritten: false',
    'consumedOperationWritten: false',
    'storageWritten: false'
  ].forEach((needle) => assertContains(moduleFile, needle));

  [
    'rawChatId',
    'rawFolderId',
    'chatId',
    'chat_id',
    'folderId',
    'folder_id',
    'name',
    'folderName',
    'color',
    'path',
    'url',
    'content',
    'token'
  ].forEach((needle) => assertContains(moduleFile, needle, `guarded forbidden field ${needle}`));

  assertContains(html, 'sync/library/library-folder-binding-bridge-diagnostic.tauri.js');
  assertContains(html, 'sync/library/library-folder-binding-migration-shadow.tauri.js');
  assertContains(pack, 'sync/library/library-folder-binding-bridge-diagnostic.tauri.js');
  assertContains(pack, 'sync/library/library-folder-binding-migration-shadow.tauri.js');
  assertOrder(html, 'sync/library/library-sync-operator-ui.tauri.js', 'sync/library/library-folder-binding-bridge-diagnostic.tauri.js');
  assertOrder(html, 'sync/library/library-folder-binding-bridge-diagnostic.tauri.js', 'sync/library/library-folder-binding-migration-shadow.tauri.js');
  assertOrder(pack, 'sync/library/library-sync-operator-ui.tauri.js', 'sync/library/library-folder-binding-bridge-diagnostic.tauri.js');
  assertOrder(pack, 'sync/library/library-folder-binding-bridge-diagnostic.tauri.js', 'sync/library/library-folder-binding-migration-shadow.tauri.js');

  [
    "var VERSION = '0.1.0-f15.11.d'",
    "var SHADOW_SCHEMA = 'h2o.desktop.sync.library-folder-binding-migration-shadow.v1'",
    "var BINDING_KIND = 'chat-folder'",
    'createLibraryFolderBindingMigrationShadow',
    'listLibraryFolderBindingMigrationShadows',
    'setF15FolderBindingDelegationEnabled',
    'isF15FolderBindingDelegationEnabled',
    '__enableF15FolderBindingDelegation = false',
    'legacyF10SubjectId',
    'legacyF13SubjectId',
    'libraryBindingSubjectId',
    'migrationDigest',
    'folderBinding:',
    'F10/F7-preview',
    'publicationTouched: false',
    'relayTouched: false',
    'outboxTouched: false',
    'nativeCalled: false',
    'f5Touched: false',
    'applyExecuted: false',
    'watermarkWritten: false',
    'consumedOperationWritten: false',
    'storageWritten: false'
  ].forEach((needle) => assertContains(shadowModule, needle));

  [
    'rawChatId',
    'rawFolderId',
    'chatId',
    'chat_id',
    'folderId',
    'folder_id',
    'folderName',
    'rawColor',
    'path',
    'url',
    'content',
    'token',
    'category_id',
    'chats.category_id'
  ].forEach((needle) => assertContains(shadowModule, needle, `shadow guarded forbidden field ${needle}`));

  [
    'f15FolderBindingDelegationEnabled',
    'explicitF7FallbackAllowed',
    'delegateF15FolderBindingWrite',
    'runF15FolderBindingDelegationPipeline',
    'buildF15FolderBindingDelegationInput',
    'createLibraryFolderBindingMigrationShadow',
    'generateLibraryBindingProposalCandidate',
    'previewLibraryBindingHandoff',
    'buildLibraryBindingApplyEventReceipt',
    'recordLibraryBindingBookkeeping',
    'shapeLibraryBindingExecuteEnvelope',
    'settleLibraryExecuteEnvelope',
    "bindingKind: 'chat-folder'",
    "leftSubjectType: 'chat.metadata'",
    "rightSubjectType: 'folder.metadata'",
    "sourceTag: 'f7-folder-binding-compat'",
    "operation === 'bind'",
    "delegateF15FolderBindingWrite('unbind'",
    "if (!f15FolderBindingDelegationEnabled(opts))",
    'bindChatLegacy',
    'unbindChatLegacy',
    'f15AllowF7Fallback',
    'allowF7Fallback',
    'f15Delegated: true',
    "notifySubscribers({ source: 'local', op: 'bindChat'",
    "notifySubscribers({ source: 'local', op: 'unbindChat'",
    '__lastF15FolderBindingDelegationResult'
  ].forEach((needle) => assertContains(folderStore, needle));

  assert(!read(folderStore).includes('setF15FolderBindingDelegationEnabled(true)'),
    `${folderStore}: delegation must not be enabled by default`);

  const moduleText = read(moduleFile);
  const forbiddenWriteCalls = [
    /(?:folders|folderStore|store)\.bindChat\s*\(/,
    /(?:folders|folderStore|store)\.unbindChat\s*\(/,
    /(?:folders|folderStore|store)\.create\s*\(/,
    /(?:folders|folderStore|store)\.upsert\s*\(/,
    /(?:folders|folderStore|store)\.patch\s*\(/,
    /(?:folders|folderStore|store)\.remove\s*\(/,
    /(?:folders|folderStore|store)\[['"]delete['"]\]\s*\(/
  ];
  forbiddenWriteCalls.forEach((pattern) => {
    assert(!pattern.test(moduleText), `${moduleFile}: forbidden write API call matched ${pattern}`);
  });

  assertContains(validator, 'runRuntimeProof');
  assertContains(validator, 'valid binding should map cleanly');
  assertContains(validator, 'duplicate active chat-folder should block');
  assertContains(validator, 'missing chat subject should block');
  assertContains(validator, 'missing folder subject should block');
  assertContains(validator, 'malformed hash should block');
  assertContains(validator, 'privacy leak scan should fail on raw field');

  assertContains(bindingCanonicalizer, "var VERSION = '0.2.0-f15.11.b'", 'canonicalizer F15.11.b version');
  assertContains(bindingCanonicalizer, "var FOLDER_SUBJECT_TYPE = 'folder.metadata'", 'canonicalizer folder endpoint type');
  assertContains(bindingCanonicalizer, "bindingKind === 'chat-folder'", 'canonicalizer chat-folder branch');
  assertContains(bindingCanonicalizer, "['rightSubjectId'], ['folderSubjectId']", 'canonicalizer folder subject alias');
  assert(!read(bindingCanonicalizer).includes("var DEFERRED_BINDING_KINDS = ['chat-folder']"),
    `${bindingCanonicalizer}: chat-folder must not remain deferred`);

  assertContains(bindingDiagnostics, "var VERSION = '0.2.0-f15.11.b'", 'diagnostics F15.11.b version');
  assertContains(bindingDiagnostics, "var FOLDER_SUBJECT_TYPE = 'folder.metadata'", 'diagnostics folder endpoint type');
  assertContains(bindingDiagnostics, "return { left: CHAT_SUBJECT_TYPE, right: FOLDER_SUBJECT_TYPE }", 'diagnostics chat-folder endpoint type');
  assertContains(bindingDiagnostics, "return 'chat-folder-conflict'", 'diagnostics chat-folder conflict');

  assertContains(bindingPreflight, "var VERSION = '0.2.0-f15.11.b'", 'preflight F15.11.b version');
  assertContains(bindingPreflight, "var FOLDER_SUBJECT_TYPE = 'folder.metadata'", 'preflight folder endpoint type');
  assertContains(bindingPreflight, "'chat-folder-conflict'", 'preflight chat-folder conflict');
  assertContains(bindingPreflight, 'canonicalBinding.rightSubjectType === FOLDER_SUBJECT_TYPE', 'preflight folder endpoint type gate');
  assertContains(bindingPreflight, "source.siblingBindings && source.operation === 'bind'", 'preflight sibling conflict gate stays bind-only');
  assert(!read(bindingPreflight).includes("return (binding && binding.bindingKind === 'chat-folder')"),
    `${bindingPreflight}: chat-folder must not force deferred preflight`);

  for (const [file, label] of [
    [bindingProposal, 'proposal'],
    [bindingHandoff, 'handoff'],
    [bindingReceipt, 'receipt'],
    [bindingBookkeeping, 'bookkeeping']
  ]) {
    assertContains(file, "var VERSION = '0.2.0-f15.11.b'", `${label} F15.11.b version`);
  }
  assertContains(bindingBookkeeping, "'chat-folder'", 'bookkeeping allowed chat-folder kind');
  assertContains(bindingBookkeeping, 'EXPECTED_RECEIPT_VERSION_PREFIXES', 'bookkeeping multi-version receipt support');
  assertContains(bindingBookkeeping, "bindingKind === CHAT_CATEGORY_KIND", 'bookkeeping cache refresh stays chat-category only');

  assertContains(bindingExecuteAdapter, "var VERSION = '0.2.0-f15.11.c'", 'execute adapter F15.11.c version');
  assertContains(bindingExecuteAdapter, "var CHAT_FOLDER_KIND = 'chat-folder'", 'execute adapter chat-folder constant');
  assertContains(bindingExecuteAdapter, "var FOLDER_SUBJECT_TYPE = 'folder.metadata'", 'execute adapter folder endpoint type');
  assertContains(bindingExecuteAdapter, "h2o_library_binding_' + operation + '_' + kindToken + '_apply", 'execute adapter native command derivation');
  assertContains(bindingExecuteAdapter, "'chat-folder'", 'execute adapter allows chat-folder kind');
  assertContains(bindingExecuteAdapter, 'requiresCategoryCacheRefresh: false', 'execute adapter non-category cache disabled');
  assertContains(bindingExecuteAdapter, 'categoryCacheAction: null', 'execute adapter non-category cache action null');
  assertContains(bindingExecuteAdapter, 'EXPECTED_RECEIPT_VERSION_PREFIXES', 'execute adapter multi-version receipt support');

  assertContains(settlementExtension, "var VERSION = '0.2.0-f15.11.c'", 'settlement F15.11.c version');
  assertContains(settlementExtension, 'BINDING_ADAPTER_VERSION_PREFIXES', 'settlement accepts binding adapter versions');
  assertContains(settlementExtension, "'0.2.0-f15.11.c'", 'settlement accepts F15.11.c binding adapter');
  assertContains(settlementExtension, "var CHAT_FOLDER_KIND = 'chat-folder'", 'settlement chat-folder constant');
  assertContains(settlementExtension, "var FOLDER_SUBJECT_TYPE = 'folder.metadata'", 'settlement folder endpoint type');
  assertContains(settlementExtension, 'settlement.requiresCategoryCacheRefresh === true', 'settlement blocks chat-folder cache refresh');
  assertContains(settlementExtension, 'safeObject(e.dispatchProfile).requiresF5 === true', 'settlement blocks chat-folder F5 requirement');
  assertContains(settlementExtension, 'chatsCategoryIdCacheRefreshed', 'settlement exposes cache refresh side-effect flag');

  assertContains(librarySyncProof, "var VERSION = '0.7.0-f15.11.c'", 'library sync proof F15.11.c version');
  assertContains(librarySyncProof, 'settleLibraryExecuteEnvelope', 'library sync proof exercises settlement');
  assertContains(librarySyncProof, 'binding-bind-chat-folder-full-pipeline', 'chat-folder bind proof case');
  assertContains(librarySyncProof, 'binding-unbind-chat-folder-full-pipeline', 'chat-folder unbind proof case');
  assertContains(librarySyncProof, 'binding-chat-folder-no-cache-refresh', 'chat-folder no cache proof case');
  assertContains(librarySyncProof, 'binding-chat-folder-no-f5-footprint', 'chat-folder no F5 proof case');
  assertContains(librarySyncProof, 'binding-chat-folder-endpoint-folder-metadata', 'chat-folder folder endpoint proof case');
  assertContains(librarySyncProof, 'FOLDER_SUBJECT_TYPE', 'library sync proof folder endpoint type');
}

let proof = null;
if (failures.length === 0) {
  proof = {
    bridgeDiagnostic: await runRuntimeProof(moduleFile),
    migrationShadow: await runShadowRuntimeProof(shadowModule)
  };
}

if (failures.length) {
  console.error('F15 folder binding absorption validation failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('F15 folder binding absorption validation passed');
console.log(JSON.stringify({ proof }, null, 2));
