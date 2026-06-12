#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const failures = [];

const decisionDoc = 'docs/systems/cross-platform/f16.4-folder-bindings-trigger-decision.md';
const tauriLib = 'apps/studio/desktop/src-tauri/src/lib.rs';
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
  tauriLib,
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
  assertContains(rustIdentity, 'FOLDER_BINDINGS_TRIGGER_TOKEN', 'Rust guarded trigger activation token');
  assertContains(rustIdentity, 'f16_configure_folder_bindings_trigger_protection', 'Rust trigger configure command');
  assertContains(rustIdentity, 'f16_prove_folder_bindings_trigger_protection', 'Rust trigger proof command');
  assertContains(rustIdentity, 'f16_folder_bindings_trigger_guard', 'Rust trigger guard table');
  assertContains(rustIdentity, 'f16_protect_folder_bindings_insert', 'Rust trigger insert proof/install');
  assertContains(rustIdentity, 'f16_protect_folder_bindings_update', 'Rust trigger update proof/install');
  assertContains(rustIdentity, 'f16_protect_folder_bindings_delete', 'Rust trigger delete proof/install');
  assertContains(rustIdentity, 'unauthorized_insert_blocked', 'Rust unauthorized insert proof');
  assertContains(rustIdentity, 'unauthorized_update_blocked', 'Rust unauthorized update proof');
  assertContains(rustIdentity, 'unauthorized_delete_blocked', 'Rust unauthorized delete proof');
  assertContains(rustIdentity, 'settlement_identity_write_passed', 'Rust settlement identity proof');
  assertContains(rustIdentity, 'legacy_fallback_identity_bind_passed', 'Rust fallback bind proof');
  assertContains(rustIdentity, 'legacy_fallback_identity_unbind_passed', 'Rust fallback unbind proof');

  assertContains(tauriLib, 'version: 13', 'migration v13 guarded trigger install');
  assertContains(tauriLib, 'install guarded folder bindings trigger protection', 'migration v13 description');
  assertContains(tauriLib, 'f16_folder_bindings_trigger_guard', 'migration guard table');
  assertContains(tauriLib, 'VALUES (1, 0, NULL', 'migration default-off guard row');
  assertContains(tauriLib, 'f16_protect_folder_bindings_insert', 'migration guarded insert trigger');
  assertContains(tauriLib, 'f16_protect_folder_bindings_update', 'migration guarded update trigger');
  assertContains(tauriLib, 'f16_protect_folder_bindings_delete', 'migration guarded delete trigger');
  assertContains(tauriLib, "'f15.execute-settlement-writer'", 'migration allows settlement identity');
  assertContains(tauriLib, "'f16.folder-legacy-fallback'", 'migration allows fallback identity');
  assertContains(tauriLib, 'f16_configure_folder_bindings_trigger_protection', 'Tauri configure command registered');
  assertContains(tauriLib, 'f16_prove_folder_bindings_trigger_protection', 'Tauri proof command registered');

  assertContains(sentinelFacade, "var FOLDER_LEGACY_FALLBACK_IDENTITY = 'f16.folder-legacy-fallback'", 'facade scoped identity constant');
  assertContains(sentinelFacade, 'folderLegacyFallbackEnabled: args.folderLegacyFallbackEnabled === true', 'facade explicit enablement pass-through');
  assertContains(sentinelFacade, '__f16FolderLegacyFallbackWriterIdentity', 'facade scoped identity marker');
  assertContains(sentinelFacade, 'configureFolderBindingsTriggerProtection', 'facade trigger configure API');
  assertContains(sentinelFacade, 'proveFolderBindingsTriggerProtection', 'facade trigger proof API');
  assertContains(sentinelFacade, '__f16FolderBindingsTriggerProtectionInstalled = true', 'facade trigger installed marker');
  assertContains(sentinelFacade, '__f16FolderBindingsTriggerProtectionGuarded = true', 'facade trigger guarded marker');
  assertContains(sentinelFacade, '__f16FolderBindingsTriggerProtectionDefaultEnabled = false', 'facade trigger default-off marker');
  assertContains(sentinelFacade, '__f16FolderBindingsTriggerProtectionActive = false', 'facade trigger active default false');

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
  assertContains(folderStore, '__folderBindingsTriggerProtectionGuarded', 'store trigger guarded marker');
  assertContains(folderStore, '__folderBindingsTriggerProtectionDefaultEnabled', 'store trigger default-off marker');
  assertContains(folderStore, 'folderBindingsTriggerProtectionActive', 'store active trigger guard check');
  assertContains(folderStore, 'triggerProtectionInactiveRawFallbackUsed', 'store inactive compatibility fallback marker');

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
  assertContains(syncProof, "var VERSION = '1.2.0-f16.4.d'", 'proof F16.4.d closure version');
  assertContains(syncProof, 'folder-absorption-legacy-fallback-uses-scoped-identity', 'proof legacy wrapper case');
  assertContains(syncProof, 'folder-absorption-folder-delete-cleanup-scoped', 'proof delete cleanup case');
  assertContains(syncProof, "scopedFallbackIdentity: 'f16.folder-legacy-fallback'", 'proof trigger guarded identity summary');
  assertContains(syncProof, 'folder-absorption-trigger-protection-guarded-optional', 'proof trigger guarded case');
  assertContains(syncProof, 'folder-absorption-unauthorized-folder-bindings-insert-blocked', 'proof unauthorized insert blocked case');
  assertContains(syncProof, 'folder-absorption-unauthorized-folder-bindings-update-blocked', 'proof unauthorized update blocked case');
  assertContains(syncProof, 'folder-absorption-unauthorized-folder-bindings-delete-blocked', 'proof unauthorized delete blocked case');
  assertContains(syncProof, 'folder-absorption-authorized-folder-bindings-settlement-passes', 'proof settlement identity case');
  assertContains(syncProof, 'folder-absorption-authorized-folder-bindings-fallback-passes', 'proof fallback identity case');
  assertContains(syncProof, 'folder-absorption-trigger-protection-default-off-compatible', 'proof default off compatibility case');
  assertContains(syncProof, 'closure-folder-bindings-trigger-proof-complete', 'closure guarded trigger proof case');
  assertContains(syncProof, 'library-sync-closure-folder-bindings-trigger-incomplete', 'closure guarded trigger blocker');
  assertContains(syncProof, "allowedIdentities: ['f15.execute-settlement-writer', 'f16.folder-legacy-fallback']", 'closure allowed identity proof');
  assertContains(syncProof, 'triggerProtectionGuarded === true', 'closure trigger guarded requirement');
  assertContains(syncProof, 'triggerDefaultEnabled === false', 'closure trigger default-off requirement');
  assertContains(syncProof, 'triggerInsertBlocked.directUnauthorizedWriteBlocked === true', 'closure unauthorized insert blocked requirement');
  assertContains(syncProof, 'triggerUpdateBlocked.directUnauthorizedWriteBlocked === true', 'closure unauthorized update blocked requirement');
  assertContains(syncProof, 'triggerDeleteBlocked.directUnauthorizedWriteBlocked === true', 'closure unauthorized delete blocked requirement');
  assertContains(syncProof, "triggerSettlementPasses.identity === 'f15.execute-settlement-writer'", 'closure settlement identity requirement');
  assertContains(syncProof, "triggerFallbackPasses.identity === 'f16.folder-legacy-fallback'", 'closure fallback identity requirement');
  assertContains(syncProof, 'triggerDefaultOff.triggerModeOffLegacyWritePassed === true', 'closure default-off compatibility requirement');

  assertNotContains(sentinelFacade, 'CREATE TRIGGER', 'facade must not add triggers');
  assertNotContains(folderStore, 'CREATE TRIGGER', 'store must not add triggers');
  assertNotContains(tauriLib, 'VALUES (1, 1', 'migration must not enable trigger guard by default');

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
