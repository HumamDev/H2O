#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const failures = [];

const decisionDoc = 'docs/systems/cross-platform/f16.4-folder-bindings-trigger-decision.md';
const rustIdentity = 'apps/studio/desktop/src-tauri/src/sqlite_writer_identity.rs';
const sentinelFacade = 'src-surfaces-base/studio/sync/sqlite-writer-identity-sentinel.tauri.js';
const folderStore = 'src-surfaces-base/studio/store/folders.tauri.js';
const syncProof = 'src-surfaces-base/studio/sync/library/library-sync-proof.tauri.js';
const f7Validator = 'tools/validation/sync/validate-f7-folder-metadata-hash-parity.mjs';

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

[
  decisionDoc,
  rustIdentity,
  sentinelFacade,
  folderStore,
  syncProof,
  f7Validator
].forEach(assertExists);

if (failures.length === 0) {
  [
    'F16.4 should not protect `folder_bindings` immediately with unconditional SQLite triggers',
    'f16.folder-legacy-fallback',
    'Scoped Fallback Identity Contract',
    'Trigger protection remains deferred',
    'F16.4.b',
    'F16.4.c',
    'store.folders.bindChat',
    'store.folders.unbindChat',
    'Folder removal cleanup'
  ].forEach((needle) => assertContains(decisionDoc, needle));

  assertContains(rustIdentity, 'const FOLDER_LEGACY_FALLBACK_IDENTITY: &str = "f16.folder-legacy-fallback"', 'Rust scoped identity constant');
  assertContains(rustIdentity, 'pub folder_legacy_fallback_enabled: bool', 'Rust explicit enablement payload');
  assertContains(rustIdentity, 'FOLDER_LEGACY_FALLBACK_IDENTITY =>', 'Rust identity validation branch');
  assertContains(rustIdentity, 'f16-folder-legacy-fallback-explicitly-enabled', 'Rust scoped identity audit warning');
  assertContains(rustIdentity, 'sqlite-writer-identity-folder-legacy-fallback-not-enabled', 'Rust scoped identity disabled blocker');
  assertContains(rustIdentity, 'folder_fallback.folder_legacy_fallback_enabled = true', 'Rust scoped identity test enablement');

  assertContains(sentinelFacade, "var FOLDER_LEGACY_FALLBACK_IDENTITY = 'f16.folder-legacy-fallback'", 'facade scoped identity constant');
  assertContains(sentinelFacade, 'folderLegacyFallbackEnabled: args.folderLegacyFallbackEnabled === true', 'facade explicit enablement pass-through');
  assertContains(sentinelFacade, '__f16FolderLegacyFallbackWriterIdentity', 'facade scoped identity marker');
  assertContains(sentinelFacade, '__f16FolderBindingsTriggerProtectionDeferred = true', 'facade trigger deferred marker');

  assertContains(folderStore, "var F16_FOLDER_LEGACY_FALLBACK_IDENTITY = 'f16.folder-legacy-fallback'", 'store scoped identity constant');
  assertContains(folderStore, "var F16_FOLDER_LEGACY_FALLBACK_VERSION = '0.1.0-f16.4.b'", 'store scoped identity version');
  assertContains(folderStore, 'executeFolderBindingsLegacyFallback', 'store scoped fallback executor');
  assertContains(folderStore, 'folderLegacyFallbackEnabled: true', 'store explicit enablement');
  assertContains(folderStore, "reason: 'f16.folder-legacy-fallback:' + operationReason", 'store audited reason');
  assertContains(folderStore, "'store.folders.bindChat'", 'store bind fallback reason');
  assertContains(folderStore, "'store.folders.unbindChat'", 'store unbind fallback reason');
  assertContains(folderStore, "'store.folders.remove'", 'store remove fallback reason');
  assertContains(folderStore, '__folderBindingsLegacyFallbackIdentity', 'store identity marker');
  assertContains(folderStore, '__folderBindingsLegacyFallbackIdentityVersion', 'store identity version marker');
  assertContains(folderStore, '__folderBindingsTriggerProtectionDeferred', 'store trigger deferred marker');

  const storeText = read(folderStore);
  const bindIndex = storeText.indexOf('INSERT OR REPLACE INTO folder_bindings');
  const unbindIndex = storeText.indexOf('DELETE FROM folder_bindings WHERE chat_id = ? AND folder_id = ?');
  const removeIndex = storeText.indexOf('DELETE FROM folder_bindings WHERE folder_id = ?');
  assert(bindIndex !== -1, 'folder store: missing bind SQL');
  assert(unbindIndex !== -1, 'folder store: missing unbind SQL');
  assert(removeIndex !== -1, 'folder store: missing remove cleanup SQL');
  if (bindIndex !== -1) {
    assert(storeText.lastIndexOf('executeFolderBindingsLegacyFallback(', bindIndex) !== -1, 'folder store: bind SQL must be wrapped');
  }
  if (unbindIndex !== -1) {
    assert(storeText.lastIndexOf('executeFolderBindingsLegacyFallback(', unbindIndex) !== -1, 'folder store: unbind SQL must be wrapped');
  }
  if (removeIndex !== -1) {
    assert(storeText.lastIndexOf('executeFolderBindingsLegacyFallback(', removeIndex) !== -1, 'folder store: remove cleanup SQL must be wrapped');
  }

  assertContains(syncProof, 'folder-absorption-scoped-fallback-identity-exists', 'proof scoped identity case');
  assertContains(syncProof, 'folder-absorption-legacy-fallback-uses-scoped-identity', 'proof legacy wrapper case');
  assertContains(syncProof, 'folder-absorption-folder-delete-cleanup-scoped', 'proof delete cleanup case');
  assertContains(syncProof, "scopedFallbackIdentity: 'f16.folder-legacy-fallback'", 'proof trigger deferred identity summary');
  assertContains(syncProof, 'folder-absorption-trigger-protection-deferred', 'proof trigger deferred case');
  assertContains(syncProof, 'triggerProtectionDeferred === true', 'closure trigger deferred requirement');

  assertNotContains(rustIdentity, 'folder_bindings', 'Rust must not add folder_bindings triggers in F16.4.b');
  assertNotContains(sentinelFacade, 'CREATE TRIGGER', 'facade must not add triggers');
  assertNotContains(folderStore, 'CREATE TRIGGER', 'store must not add triggers');
  assertNotContains(syncProof, 'directUnauthorizedWriteBlocked === true', 'proof must not assert direct folder_bindings trigger blocks yet');

  [
    'raw chat/folder IDs',
    'Folder names',
    'Folder colors',
    'Paths',
    'URLs',
    'Tokens'
  ].forEach((needle) => assertContains(decisionDoc, needle, `decision privacy guardrail ${needle}`));

  assertContains(syncProof, 'validate-f7-folder-metadata-hash-parity.mjs', 'proof F7 parity reference');
  assertContains(f7Validator, 'F7 folder metadata hash parity validation passed', 'F7 parity validator expected');
}

if (failures.length) {
  console.error('F16 folder_bindings trigger decision validation failed');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('F16 folder_bindings trigger decision validation passed');
