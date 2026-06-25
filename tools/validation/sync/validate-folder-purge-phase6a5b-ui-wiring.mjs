#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const sidebarPath = path.join(root, 'src-surfaces-base/studio/S0Z1g. 🎬 Library Sidebar Sections - Studio.js');
const evidencePath = path.join(root, 'release-evidence/2026-06-25/folder-delete-restore-phase6a5b-purge-button-wiring.md');

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

for (const file of [sidebarPath, evidencePath]) {
  assert(fs.existsSync(file), `${path.relative(root, file)} missing`);
}

const sidebar = read(sidebarPath);
const evidence = read(evidencePath);
const purgeBody = functionBody(sidebar, 'permanentlyDeleteRecentlyDeletedFolders');
const sidebarEntryBody = functionBody(sidebar, 'renderRecentlyDeletedFoldersSidebarEntry');

[
  "previewFn.call(store, { reason: 'desktop-recently-deleted-ui-preview' })",
  'preview?.ok !== true',
  'preview?.confirmationToken || preview?.previewToken',
  'preview-token-missing',
  'const confirmFn = typeof W.confirm === \'function\' ? W.confirm.bind(W) : null',
  'native-confirm-unavailable',
  'const confirmResult = confirmFn(confirmText)',
  'confirmResult === false',
  'Delete permanently cancelled.',
  'commitFn.call(store',
  'dryRun: false',
  'confirmationToken,',
  'previewToken: confirmationToken',
  'expectedCount',
  "reason: 'desktop-recently-deleted-ui-delete-permanently'",
  "confirmationPhrase: 'DELETE PERMANENTLY'",
  "confirmPhrase: 'DELETE PERMANENTLY'",
  "typedConfirmation: 'DELETE PERMANENTLY'",
  'deleteChats: false',
  'deleteSnapshots: false',
  'deleteAssets: false',
  'Deleted permanently:',
  'Delete permanently failed:',
].forEach((needle) => assertContains(purgeBody, needle, `6A.5b purge wiring ${needle}`));

[
  'W.prompt',
  'Type DELETE PERMANENTLY',
  'confirmText) === true',
  'confirmationToken: preview.previewToken',
  'remove(',
  'softDeleteEmptyFolder(',
  'deleteChat(',
  'deleteSnapshot(',
  'DELETE FROM',
  'folder_bindings',
  'sync_tombstone_reviews',
].forEach((needle) => assertNotContains(purgeBody, needle, `6A.5b forbidden purge wiring ${needle}`));

assertNotContains(sidebarEntryBody, 'Delete permanently', 'sidebar purge button');
assertNotContains(sidebarEntryBody, 'permanentlyDeleteRecentlyDeletedFolders', 'sidebar purge action');

[
  'Phase 6A.5b',
  'preview.confirmationToken || preview.previewToken',
  'confirmResult === false',
  'native-confirm-unavailable',
  'confirmationPhrase:"DELETE PERMANENTLY"',
  'confirmPhrase:"DELETE PERMANENTLY"',
  'typedConfirmation:"DELETE PERMANENTLY"',
  'Deleted permanently: N',
  'Delete permanently failed',
  'Manual runtime proof pending',
  'Chrome has no purge button',
].forEach((needle) => assertContains(evidence, needle, `6A.5b evidence ${needle}`));

console.log(JSON.stringify({
  ok: true,
  validator: 'validate-folder-purge-phase6a5b-ui-wiring',
  ui: path.relative(root, sidebarPath),
  evidence: path.relative(root, evidencePath),
  tokenFallback: true,
  explicitFalseCancelOnly: true,
  chromeAuthority: false,
}, null, 2));
