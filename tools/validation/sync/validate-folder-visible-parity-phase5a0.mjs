#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const chromeImportPath = path.join(root, 'src-surfaces-base/studio/sync/folder-import.mv3.js');
const smokeBridgePath = path.join(root, 'src-surfaces-base/studio/dev/folder-sync-rc-smoke-bridge.studio.js');
const chromeHelperPath = path.join(root, 'tools/smoke/chrome-cdp-studio.mjs');
const evidencePath = path.join(root, 'release-evidence/2026-06-24/folder-visible-parity-phase5a0-diagnostics.md');

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
  const start = source.indexOf(`function ${name}`);
  assert(start >= 0, `${name} missing`);
  const brace = source.indexOf('{', start);
  assert(brace >= 0, `${name} body missing`);
  let depth = 0;
  for (let i = brace; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(brace, i + 1);
    }
  }
  throw new Error(`${name} body parse failed`);
}

for (const file of [chromeImportPath, smokeBridgePath, chromeHelperPath, evidencePath]) {
  assert(fs.existsSync(file), `${path.relative(root, file)} missing`);
}

const chromeImport = read(chromeImportPath);
const smokeBridge = read(smokeBridgePath);
const chromeHelper = read(chromeHelperPath);
const evidence = read(evidencePath);

const diagnosticBody = functionBody(chromeImport, 'diagnoseVisibleFolderParity');
[
  'readLatestBundleForVisibleParityDiagnostics',
  'buildDesktopVisibleFolderSetSnapshot(bundle',
  'provider.getDisplayModel',
  'desktopVisibleFolderCount',
  'chromeVisibleFolderCount',
  'chromeOnlyVisibleFolders',
  'desktopOnlyVisibleFolders',
  'candidateStaleRows',
  'zz-4d4-delete-restore',
  'hiddenByDeleteReceiptCount',
  'reShownByRestoreReceiptCount',
  'hiddenByDesktopVisibleSetCount',
  'pendingChromeCreatedCount',
  'protectedFolderCount',
  'noTombstoneApplyOnChrome: true',
  'noTombstoneCreateOnChrome: true',
  'noHardDelete: true',
  'noPurge: true',
  'noChatDelete: true',
  'noSnapshotDelete: true',
].forEach((needle) => assertContains(diagnosticBody, needle, `Chrome visible parity diagnostic ${needle}`));

[
  'isProtectedFolderForVisibleParity',
  'isChromeCreatedFolderForVisibleParity',
  'summarizeVisibleParityFolder',
  'visibleParityRowMap',
  'diagnoseVisibleFolderParity: diagnoseVisibleFolderParity',
].forEach((needle) => assertContains(chromeImport, needle, `Chrome visible parity support ${needle}`));

const latestReadBody = functionBody(chromeImport, 'readLatestBundleForVisibleParityDiagnostics');
[
  'state.handle.getFileHandle(LATEST_FILE, { create: false })',
  'JSON.parse(text)',
  'latest-json-read',
].forEach((needle) => assertContains(latestReadBody, needle, `latest read diagnostic ${needle}`));
assertNotContains(latestReadBody, 'syncNow(', 'latest read diagnostic');
assertNotContains(latestReadBody, 'importDesktopBundlePayload', 'latest read diagnostic');

[
  "'diagnoseVisibleFolderParity'",
  'diagnoseVisibleFolderParity: true',
  "unsupportedResult('diagnoseVisibleFolderParity'",
  'noTombstoneCreateOnChrome: true',
].forEach((needle) => assertContains(smokeBridge, needle, `smoke bridge visible parity ${needle}`));

const bridgeBody = functionBody(smokeBridge, 'diagnoseVisibleFolderParity');
[
  'api.diagnoseVisibleFolderParity',
  'readOnly: true',
  'noTombstoneApplyOnChrome: true',
  'noTombstoneCreateOnChrome: true',
  'noHardDelete: true',
  'noPurge: true',
  'noChatDelete: true',
  'noSnapshotDelete: true',
].forEach((needle) => assertContains(bridgeBody, needle, `smoke bridge diagnostic body ${needle}`));

const helperAllowlist = chromeHelper.match(/READ_ONLY_OPS = Object\.freeze\(\[([^\]]+)\]\)/);
assert(helperAllowlist, 'Chrome helper READ_ONLY_OPS missing');
assert(helperAllowlist[1].includes("'diagnoseVisibleFolderParity'"), 'Chrome helper read-only allowlist missing diagnoseVisibleFolderParity');

for (const source of [chromeImport, smokeBridge, chromeHelper]) {
  assertNotContains(source, 'eval(', 'Phase 5A.0 source');
  assertNotContains(source, 'new Function', 'Phase 5A.0 source');
}

for (const forbidden of [
  'purgeFolder',
  'hardDeleteFolder',
  'applyTombstonePropagation',
  'deleteSnapshot',
]) {
  assertNotContains(diagnosticBody, forbidden, 'Chrome visible parity diagnostic');
  assertNotContains(bridgeBody, forbidden, 'smoke bridge visible parity diagnostic');
}

[
  'diagnoseVisibleFolderParity',
  'desktopVisibleFolderCount',
  'chromeVisibleFolderCount',
  'chromeOnlyVisibleFolders',
  'desktopOnlyVisibleFolders',
  'diagnostics only',
  'No hide/prune behavior',
  'noTombstoneApplyOnChrome:true',
  'noTombstoneCreateOnChrome:true',
].forEach((needle) => assertContains(evidence, needle, `evidence ${needle}`));

console.log(JSON.stringify({
  ok: true,
  validator: 'validate-folder-visible-parity-phase5a0',
  diagnostic: 'diagnoseVisibleFolderParity',
  readOnly: true,
  behaviorChange: false,
}, null, 2));
