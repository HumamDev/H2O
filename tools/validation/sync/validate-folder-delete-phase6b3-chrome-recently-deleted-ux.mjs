#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const sidebarPath = path.join(root, 'src-surfaces-base/studio/S0Z1g. 🎬 Library Sidebar Sections - Studio.js');
const workspacePath = path.join(root, 'src-surfaces-base/studio/S0F1b. 🎬 Library Workspace - Studio.js');
const studioPath = path.join(root, 'src-surfaces-base/studio/studio.js');
const bridgePath = path.join(root, 'src-surfaces-base/studio/dev/folder-sync-rc-smoke-bridge.studio.js');
const cdpPath = path.join(root, 'tools/smoke/chrome-cdp-studio.mjs');
const actionsPath = path.join(root, 'src-surfaces-base/studio/S0F3b. 🎬 Folders Actions - Studio.js');
const evidencePath = path.join(root, 'release-evidence/2026-06-25/folder-delete-phase6b3-chrome-recently-deleted-ux.md');

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertContains(source, needle, label) {
  assert(source.includes(needle), `${label} missing ${needle}`);
}

function assertNotContains(source, needle, label) {
  assert(!source.includes(needle), `${label} must not contain ${needle}`);
}

function functionBody(source, name) {
  const marker = `function ${name}`;
  const start = source.indexOf(marker);
  assert(start >= 0, `${name} missing`);
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
  throw new Error(`${name} body parse failed`);
}

for (const file of [sidebarPath, workspacePath, studioPath, bridgePath, cdpPath, actionsPath, evidencePath]) {
  assert(fs.existsSync(file), `${path.relative(root, file)} missing`);
}

const sidebar = read(sidebarPath);
const workspace = read(workspacePath);
const studio = read(studioPath);
const bridge = read(bridgePath);
const cdp = read(cdpPath);
const actions = read(actionsPath);
const evidence = read(evidencePath);

const chromePanelBody = functionBody(sidebar, 'makeChromeFolderDeleteRequestPanel');
const requestBody = functionBody(sidebar, 'requestChromeFolderDelete');
const badgeBody = functionBody(sidebar, 'folderDeleteRequestBadgeNode');
const companionBody = functionBody(sidebar, 'renderChromeRecentlyDeletedCompanionPanel');
const companionDiagnosticBody = functionBody(sidebar, 'diagnoseChromeRecentlyDeletedCompanion');
const displayHiddenBody = functionBody(workspace, 'isHiddenFolderDisplayRow');
const normalizeRowBody = functionBody(workspace, 'normalizeFolderRow');
const normalizeStateBody = functionBody(workspace, 'normalizeFolderStateForParity');
const chromeRequestDeleteBody = functionBody(actions, 'chromeRequestDelete');

[
  "const label = 'Delete'",
  'requestChromeFolderDelete(item, { setStatus: () => {} })',
  'Cannot delete this folder.',
].forEach((needle) => assertContains(chromePanelBody, needle, `6B.3 direct Chrome delete action ${needle}`));

[
  'W.confirm',
  'window.confirm',
  'prompt(',
  'Already pending',
  'panel.style.display',
  'Desktop Studio applies the soft delete. Chrome creates a request only; no chats or snapshots are deleted.',
  'Move this folder to Recently Deleted? Desktop Studio will apply the soft delete. No chats or snapshots are deleted.',
  'purgeRecentlyDeletedFolders',
  'previewRecentlyDeletedFolderPurge',
  'clearRecentlyDeletedRestoredHistory',
  'restoreTombstonedFolder',
  'remove(',
  'softDeleteEmptyFolder(',
  'deleteChat(',
  'deleteSnapshot(',
  'DELETE FROM',
].forEach((needle) => assertNotContains(chromePanelBody, needle, `6B.3 forbidden Chrome delete panel ${needle}`));

[
  'actions.requestDelete.bind(actions)',
  'store.requestFolderDelete.bind(store)',
  "reason: 'user-requested-folder-delete'",
  'FOLDER_DELETE_REQUEST_UI_STATE.pendingFolderIds.add(folderId)',
  'markChromeFolderPendingDeleteHidden(item, result)',
  'hiddenByChromePendingDelete',
  'visibleStateOnly: true',
  'noTombstoneApplyOnChrome: true',
  'noHardDelete: true',
  'noPurge: true',
  'noChatDelete: true',
  'noSnapshotDelete: true',
  'noAssetDelete: true',
].forEach((needle) => assertContains(requestBody, needle, `6B.3 request-only immediate hide ${needle}`));

assertContains(badgeBody, "studioPlatformAdapter() === 'mv3') return null", '6B.3 Chrome normal row pending badge suppressed');

[
  'hiddenByChromePendingDelete',
  'pendingDeleteHidden',
].forEach((needle) => {
  assertContains(displayHiddenBody, needle, `6B.3 display hidden row ${needle}`);
  assertContains(normalizeRowBody, needle, `6B.3 row normalizer ${needle}`);
});
assertContains(normalizeStateBody, 'hiddenByChromePendingDelete', '6B.3 state normalizer hiddenByChromePendingDelete');

[
  'hiddenByChromePendingDeleteIds',
  'chromePendingDeleteHiddenCount',
  'chromePendingDeleteHiddenRows',
].forEach((needle) => assertContains(workspace, needle, `6B.3 FolderParity hidden overlay ${needle}`));

[
  'data-h2o-chrome-recently-deleted-companion',
  'Chrome companion status. Desktop Studio remains the delete, restore, and permanent delete authority.',
  'data-h2o-chrome-recently-deleted-row',
  'data-h2o-chrome-restore-blocked',
  'data-h2o-chrome-permanent-delete-blocked',
  'CHROME_RESTORE_DEFERRED_MESSAGE',
  'CHROME_PERMANENT_DELETE_BLOCKED_MESSAGE',
  'noChromePurgeAuthority: true',
  'noChromeTombstoneApply: true',
  'noAssetDelete: true',
].forEach((needle) => assertContains(companionBody, needle, `6B.3 Chrome companion ${needle}`));

[
  'chromeNormalVisibleFolderCount',
  'chromeRecentlyDeletedCount',
  'pendingDeleteHiddenCount',
  'desktopReceiptHiddenCount',
  'chromePermanentDeleteBlocked: true',
  'noChromePurgeAuthority: true',
  'noChromeTombstoneApply: true',
  'noHardDelete: true',
  'noChatDelete: true',
  'noSnapshotDelete: true',
  'noAssetDelete: true',
].forEach((needle) => assertContains(companionDiagnosticBody, needle, `6B.3 companion diagnostics ${needle}`));

[
  'purgeRecentlyDeletedFolders',
  'previewRecentlyDeletedFolderPurge',
  'clearRecentlyDeletedRestoredHistory',
  'restoreTombstonedFolder',
  'deleteChat(',
  'deleteSnapshot(',
  'DELETE FROM',
].forEach((needle) => assertNotContains(companionBody, needle, `6B.3 forbidden Chrome companion action ${needle}`));

[
  'renderChromeRecentlyDeletedCompanionPanel',
  'wbFolderRecentlyDeleted--chromeCompanion',
].forEach((needle) => assertContains(studio, `renderChromeRecentlyDeletedCompanionPanel`.includes(needle) ? needle : needle, `6B.3 Studio main-page mount ${needle}`));

[
  'diagnoseChromeRecentlyDeletedCompanion',
  'chrome-recently-deleted-companion-diagnosed',
  'noChromePurgeAuthority: true',
].forEach((needle) => assertContains(bridge, needle, `6B.3 smoke bridge ${needle}`));

assertContains(cdp, 'diagnoseChromeRecentlyDeletedCompanion', '6B.3 Chrome CDP read-only op');

[
  'requestFolderDelete',
  'desktopApplyRequired: true',
  'noHardDelete: true',
  'noChatDelete: true',
  'does not expose remove/delete/apply and does not mutate folders',
].forEach((needle) => assertContains(chromeRequestDeleteBody + actions, needle, `6B.3 request path unchanged ${needle}`));

[
  'Phase 6B.3',
  'Chrome Recently Deleted companion',
  'hiddenByChromePendingDelete',
  'Permanent delete is only available from Desktop Studio.',
  'Restore from Desktop Studio.',
  'no Chrome purge authority',
  'no hard delete',
  'no chat deletion',
  'no snapshot deletion',
  'no asset deletion',
].forEach((needle) => assertContains(evidence, needle, `6B.3 evidence ${needle}`));

console.log(JSON.stringify({
  ok: true,
  validator: 'validate-folder-delete-phase6b3-chrome-recently-deleted-ux',
  ui: path.relative(root, sidebarPath),
  workspace: path.relative(root, workspacePath),
  bridge: path.relative(root, bridgePath),
  cdp: path.relative(root, cdpPath),
  evidence: path.relative(root, evidencePath),
  immediateHideOverlay: true,
  chromePermanentDeleteAuthority: false,
  chromeRestoreAuthority: false,
  requestOnly: true,
}, null, 2));
