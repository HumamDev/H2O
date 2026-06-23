#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const registryPath = path.join(root, 'src-surfaces-base/studio/dev/folder-sync-rc-smoke-bridge.studio.js');
const studioHtmlPath = path.join(root, 'src-surfaces-base/studio/studio.html');
const packStudioPath = path.join(root, 'tools/product/studio/pack-studio.mjs');

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertContains(source, needle, label) {
  assert(source.includes(needle), `${label || 'source'} missing ${needle}`);
}

function assertNotContains(source, needle, label) {
  assert(!source.includes(needle), `${label || 'source'} must not contain ${needle}`);
}

const registry = read(registryPath);
const html = read(studioHtmlPath);
const packStudio = read(packStudioPath);

assertContains(registry, 'H2O.Studio.devSmoke.folderSync', 'registry namespace');
assertContains(registry, 'h2o:studio:smoke-bridge:enabled:v1', 'localStorage gate');
assertContains(registry, 'h2oSmokeBridge', 'URL gate');
assertContains(registry, 'folder-sync-rc', 'required gate value');
assertContains(registry, 'knownLocalDevSurface', 'local/dev surface gate');
assertContains(registry, 'public-release', 'public release gate');
assertContains(registry, 'chromeAttachLocalOptIn', 'Chrome attach localStorage opt-in gate');
assertContains(registry, 'urlFlagSatisfied', 'URL flag or attach opt-in gate');
assertContains(registry, 'urlFlagBypassedByChromeAttachLocalOptIn', 'Chrome attach URL bypass diagnostic');
assertContains(registry, "surface.kind === 'chrome-studio'", 'Chrome attach gate surface restriction');
assertContains(registry, 'ALLOWED_OPS', 'allowlist');
assertContains(registry, 'FORBIDDEN_OPS', 'forbidden op documentation');
assertContains(registry, 'privacy: { redacted: true }', 'redacted result contract');
assertContains(registry, 'noArbitraryEval: true', 'arbitrary eval safety flag');
assertContains(registry, 'noRawSql: true', 'raw SQL safety flag');
assertContains(registry, 'noHardDelete: true', 'hard delete safety flag');
assertContains(registry, 'noPurge: true', 'purge safety flag');
assertContains(registry, 'noTombstonePropagationApply: true', 'tombstone propagation safety flag');
assertContains(registry, 'noChatDelete: true', 'chat delete safety flag');
assertContains(registry, 'noSnapshotDelete: true', 'snapshot delete safety flag');
assertContains(registry, 'summarizeFolderSyncDiagnose', 'folder sync diagnose summary');
assertContains(registry, 'reconcileChromeHealthWithSyncDiagnose', 'Chrome health permission reconciliation');
assertContains(registry, 'permissionStateReconciledFromSyncDiagnose', 'permission reconciliation diagnostic');
assertContains(registry, 'syncFolderDiagnose', 'sync folder diagnose output');
assertContains(registry, "api && typeof api.diagnose === 'function'", 'live sync folder diagnose source');
assertContains(registry, "permission === 'granted'", 'granted permission reconciliation gate');
assertContains(registry, "'permission-required', 'no-folder-handle'", 'permission blocker reconciliation list');
assertContains(registry, 'chromeExportFlagKey', 'Chrome export flag diagnostic summary');
assertContains(registry, 'chromeExportFlagEnabled', 'Chrome export effective flag summary');
assertContains(registry, 'chromeExportSmokeEnabled', 'Chrome smoke export summary');
assertContains(registry, 'chromeExportSmokeOptInKey', 'Chrome smoke export opt-in key summary');
assertContains(registry, 'var sourceRow = safeObject(row)', 'null-safe folder metadata operation row');
assertContains(registry, 'sourceRow.folderId', 'null-safe folder metadata operation folderId source');
assertContains(registry, 'summarizeCreateFolderResult', 'createFolder result confirmation helper');
assertContains(registry, "findFolderRow({ name: requestedName })", 'createFolder post-create model lookup');
assertContains(registry, 'FOLDER_STATE_DATA_KEY', 'Chrome folder state mirror key');
assertContains(registry, 'createChromeFolderStateMirrorFolder', 'Chrome folder-state create path');
assertContains(registry, 'chrome.folder-state-mirror', 'Chrome local create API diagnostic');
assertContains(registry, 'chrome-user-folder-create', 'Chrome user-created folder source kind');
assertContains(registry, 'dispatchFolderStateRefresh', 'targeted folder-state refresh after smoke create');
assertContains(registry, 'folder-created-or-existing', 'duplicate-safe createFolder success status');
assertContains(registry, 'folder-created', 'stable createFolder success status');
assertContains(registry, 'availableCreateApis', 'createFolder available API diagnostics');
assertContains(registry, 'duplicateNameDetected', 'createFolder duplicate diagnostic');
assertContains(registry, 'createdFolderFoundByName', 'createFolder model lookup diagnostic');
assertContains(registry, 'folderModelCountBefore', 'createFolder before count diagnostic');
assertContains(registry, 'folderModelCountAfter', 'createFolder after count diagnostic');
assertContains(registry, "status: 'folder-create-failed'", 'structured createFolder failure status');
assertContains(registry, "blockers: ['folder-create-failed']", 'structured createFolder blocker');
assertContains(registry, 'summary.source = detectSurface().kind', 'createFolder source surface summary');
assertContains(registry, 'requestFolderMetadataPreview', 'folder metadata preview helper');
assertContains(registry, 'requestMode: \'preview\'', 'preview request mode');
assertContains(registry, 'setChromeFolderColor', 'Chrome color stale guard path');
assertContains(registry, 'folder-metadata-preview-apply', 'Chrome color path diagnostic');
assertContains(registry, 'operation.staleGuard = staleGuard', 'Chrome color stale guard apply');
assertContains(registry, "status: 'folder-color-set'", 'stable color success status');
assertContains(registry, "status: 'folder-color-set-failed'", 'structured color failure status');
assertContains(registry, 'staleGuardProvided', 'color stale guard diagnostic');
assertContains(registry, 'staleGuardSource', 'color stale guard source diagnostic');
assertContains(registry, 'folderFoundBefore', 'color before folder diagnostic');
assertContains(registry, 'folderFoundAfter', 'color after folder diagnostic');
assertContains(registry, 'colorBefore', 'color before diagnostic');
assertContains(registry, 'colorAfter', 'color after diagnostic');

const expectedOps = [
  'getFolderModel',
  'createFolder',
  'renameFolder',
  'setFolderColor',
  'syncNow',
  'diagnoseHealth',
  'requestFolderDelete',
  'listFolderDeleteRequests',
  'applyFolderDeleteRequest',
  'listFolderDeleteReceipts',
  'listActiveFolderTombstones',
  'countChatsSnapshots',
  'verifyFolderVisible',
  'verifyFolderHidden',
];
for (const op of expectedOps) {
  assertContains(registry, `'${op}'`, `allowlisted op ${op}`);
}

const forbiddenOps = [
  "'eval'",
  "'rawSql'",
  "'hardDelete'",
  "'purge'",
  "'applyTombstonePropagation'",
  "'deleteChat'",
  "'deleteSnapshot'",
];
const allowlistMatch = registry.match(/var ALLOWED_OPS = Object\.freeze\(\[([\s\S]*?)\]\);/);
assert(allowlistMatch, 'ALLOWED_OPS block missing or malformed');
const allowlistBlock = allowlistMatch[1];
for (const forbidden of forbiddenOps) {
  assert(!allowlistBlock.includes(forbidden), `${forbidden} must not be in ALLOWED_OPS`);
}

assertContains(registry, "DESKTOP_ONLY_OPS[envelope.op] && surface.kind !== 'desktop-studio'", 'Desktop-only apply guard');
assertContains(registry, "CHROME_ONLY_OPS[envelope.op] && surface.kind !== 'chrome-studio'", 'Chrome-only request guard');
assertContains(registry, 'restoredAt || r.restored_at', 'active tombstone restored filter');
assertContains(registry, '!cleanString(r.restoredAt || r.restored_at)', 'active tombstone filter');

assertNotContains(registry, 'eval(', 'registry');
assertNotContains(registry, 'new Function', 'registry');
assertNotContains(registry, 'DELETE FROM', 'registry');
assertNotContains(registry, 'DROP TABLE', 'registry');
assertNotContains(registry, 'TRUNCATE TABLE', 'registry');

assertContains(html, './dev/folder-sync-rc-smoke-bridge.studio.js', 'Studio loader');
assertContains(packStudio, '"dev/folder-sync-rc-smoke-bridge.studio.js"', 'Studio packer copy list');

const packEntryCount = (packStudio.match(/"dev\/folder-sync-rc-smoke-bridge\.studio\.js"/g) || []).length;
assert(packEntryCount === 2, `Studio packer should contain source and output entries exactly once each; found ${packEntryCount}`);

console.log(JSON.stringify({
  ok: true,
  validator: 'validate-folder-sync-rc-smoke-bridge',
  registryPath,
  studioHtmlPath,
  packStudioPath,
  allowedOpCount: expectedOps.length,
}, null, 2));
