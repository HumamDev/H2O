#!/usr/bin/env node
//
// Folder Sync Phase F6 - live Desktop DevTools drift evidence validator.
//
// Evidence/validator only. Validates the hard-gate summary from the pasted Desktop DevTools output
// without requiring product runtime source changes or reproducing raw private diagnostic payloads.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const failures = [];

const f6Doc = 'release-evidence/2026-06-25/folder-sync-f6-desktop-runtime-drift-live-evidence.md';
const f5Doc = 'release-evidence/2026-06-25/folder-sync-f5-desktop-runtime-drift-probe.md';
const folderSyncFile = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const folderImportFile = 'src-surfaces-base/studio/sync/folder-import.mv3.js';

const F5_COMMIT = '1482a68f2f7f4f8c4e6f8d5b6a3f4f3c2d1a9b8c7';
const EXPECTED_SCHEMA = 'h2o.studio.folder-sync.f5-desktop-runtime-drift-report.v1';
const EXPECTED_DRIFT_CLASSES = [
  'binding-mismatch',
  'field-mismatch:color',
  'field-mismatch:sortOrder',
  'missing-mirror-folder',
];
const METADATA_CORE_TYPES = [
  'chat-category-assign',
  'chat-category-clear',
  'chat-label-bind',
  'chat-tag-bind',
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

function parseMetadataAllowlist(source) {
  const start = source.indexOf('APPLIED_LIBRARY_METADATA_MUTATION_REQUEST_ACTIONS = {');
  if (start < 0) return null;
  const end = source.indexOf('}', start);
  if (end < 0) return null;
  const block = source.slice(start, end);
  const applied = [];
  const re = /'([a-z0-9-]+)'\s*:\s*true/gi;
  let match;
  while ((match = re.exec(block)) !== null) applied.push(match[1]);
  return applied;
}

function extractCapturedJson(doc) {
  const marker = '## Captured Runtime Gates';
  const start = doc.indexOf(marker);
  if (start < 0) return null;
  const fenceStart = doc.indexOf('```json', start);
  if (fenceStart < 0) return null;
  const jsonStart = doc.indexOf('\n', fenceStart);
  const fenceEnd = doc.indexOf('```', jsonStart + 1);
  if (jsonStart < 0 || fenceEnd < 0) return null;
  return JSON.parse(doc.slice(jsonStart + 1, fenceEnd));
}

function sameSet(actual, expected) {
  const a = (actual || []).slice().sort();
  const e = expected.slice().sort();
  return a.length === e.length && a.every((value, index) => value === e[index]);
}

assert(exists(f6Doc), `${f6Doc}: missing`);
if (!exists(f6Doc)) {
  console.error('FAIL validate-folder-sync-f6-desktop-runtime-drift-live-evidence');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

const doc = read(f6Doc);
const flat = doc.replace(/\s+/g, ' ');
assert(doc.length > 5000, `${f6Doc}: evidence too short`);
assert(exists(f5Doc), `${f5Doc}: missing`);

for (const marker of [
  F5_COMMIT,
  'LIVE DESKTOP DEVTOOLS EVIDENCE CAPTURED',
  'No product runtime source was changed',
  'No reconciliation writes were implemented',
  'The render mirror was not repaired',
  'copy(JSON.stringify(await $1, null, 2))',
  '$1.then(...)',
  EXPECTED_SCHEMA,
  'desktop-studio',
  'manual-devtools-read-only',
  'writeCallCount: 0',
  'diagnosticCount: 9',
  'redacted/hash-only',
  'Folder sync readiness: NOT READY',
  'Public/premium sync: BLOCKED',
  'Real remote WebDAV: DEFERRED',
  'Desktop Studio, Chrome/native extension Studio across multiple devices, and the mobile app',
  'no product runtime source changes are required',
]) {
  assert(flat.includes(marker), `F6 evidence missing marker: ${marker}`);
}
for (const code of EXPECTED_DRIFT_CLASSES) {
  assert(flat.includes(code), `F6 evidence missing drift class ${code}`);
}

let captured = null;
try {
  captured = extractCapturedJson(doc);
} catch (error) {
  failures.push(`captured JSON block could not be parsed: ${error.message}`);
}

assert(captured && captured.schema === EXPECTED_SCHEMA, 'captured schema must match F5 runtime report schema');
assert(captured && captured.surface === 'desktop-studio', 'captured surface must be desktop-studio');
assert(captured && captured.mode === 'manual-devtools-read-only', 'captured mode must be manual-devtools-read-only');
assert(captured && captured.readOnly === true, 'captured readOnly must be true');
assert(captured && captured.writeCallCount === 0, 'captured writeCallCount must be exactly 0');
assert(captured && captured.diagnosticCount === 9, 'captured diagnosticCount must be exactly 9');
assert(captured && sameSet(captured.driftClasses, EXPECTED_DRIFT_CLASSES),
  `captured drift class set must be exactly [${EXPECTED_DRIFT_CLASSES.join(', ')}]`);

for (const key of [
  'noSqliteMutation',
  'noChromeStorageMutation',
  'noTombstoneMutation',
  'noBindingMutation',
  'noTransportWrite',
  'noWebdavWrite',
]) {
  assert(captured && captured.safety && captured.safety[key] === true, `captured safety flag must be true: ${key}`);
}
assert(captured && captured.safety && captured.safety.folderSyncReady === false, 'folderSyncReady must be false');
assert(captured && captured.safety && captured.safety.publicPremiumBlocked === true, 'publicPremiumBlocked must be true');
assert(captured && captured.safety && captured.safety.realRemoteWebdavDeferred === true, 'realRemoteWebdavDeferred must be true');

for (const key of [
  'redactedHashOnly',
  'rawFolderNamesReturned',
  'rawChatTitlesReturned',
  'rawChatContentReturned',
  'rawAccountUserDataReturned',
  'rawMobilePeerIdentifiersReturned',
]) {
  assert(captured && captured.diagnosticPayload && Object.prototype.hasOwnProperty.call(captured.diagnosticPayload, key),
    `diagnosticPayload missing key: ${key}`);
}
assert(captured && captured.diagnosticPayload.redactedHashOnly === true, 'diagnostics must be redacted/hash-only');
for (const key of [
  'rawFolderNamesReturned',
  'rawChatTitlesReturned',
  'rawChatContentReturned',
  'rawAccountUserDataReturned',
  'rawMobilePeerIdentifiersReturned',
]) {
  assert(captured && captured.diagnosticPayload[key] === false, `diagnosticPayload ${key} must be false`);
}

// Avoid recording obvious raw private payload labels in this evidence. The allowed text below is
// generic policy language rather than user data.
for (const forbidden of [
  'F5 Private Alpha',
  'F5 Diverged Alpha',
  'folder-f5-alpha',
  'chat-f5-alpha',
  'peer-f5-private',
  'mobile-device-f5-private',
]) {
  assert(!doc.includes(forbidden), `F6 evidence must not contain raw fixture/private value: ${forbidden}`);
}

assert(exists(folderSyncFile), `${folderSyncFile}: missing`);
assert(exists(folderImportFile), `${folderImportFile}: missing`);
const applied = parseMetadataAllowlist(read(folderSyncFile));
let metadataAllowlistCaveat = false;
assert(Array.isArray(applied), 'could not parse metadata applied allowlist');
if (Array.isArray(applied)) {
  const sorted = applied.slice().sort();
  const expectedCore = METADATA_CORE_TYPES.slice().sort();
  const knownOutOfScopeExtras = ['chat-label-unbind', 'chat-tag-unbind'];
  const expectedWithKnownCaveat = METADATA_CORE_TYPES.concat(knownOutOfScopeExtras).sort();
  const exactExpected = sameSet(sorted, expectedCore);
  const knownCaveatOnly = sameSet(sorted, expectedWithKnownCaveat);
  metadataAllowlistCaveat = !exactExpected && knownCaveatOnly;
  assert(exactExpected || knownCaveatOnly, `metadata applied allowlist drifted beyond known caveat: got [${sorted.join(', ')}]`);
}
assert(read(folderSyncFile).includes("webdav: 'deferred'"), `${folderSyncFile}: WebDAV must remain deferred`);
assert(read(folderImportFile).includes("webdav: 'deferred'"), `${folderImportFile}: WebDAV must remain deferred`);

if (failures.length) {
  console.error('FAIL validate-folder-sync-f6-desktop-runtime-drift-live-evidence');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(JSON.stringify({
  schema: 'h2o.studio.folder-sync.f6-desktop-runtime-drift-live-evidence.validation.v1',
  lane: 'folder-sync',
  phase: 'F6',
  f6Doc,
  f5CommitReferenced: F5_COMMIT,
  liveDesktopDevtoolsEvidenceCaptured: true,
  devtoolsCopyCaveatRecorded: true,
  runtimeReportSchema: captured.schema,
  surface: captured.surface,
  mode: captured.mode,
  readOnly: captured.readOnly,
  writeCallCount: captured.writeCallCount,
  diagnosticCount: captured.diagnosticCount,
  driftClassesFound: captured.driftClasses,
  redactedHashOnly: captured.diagnosticPayload.redactedHashOnly,
  noWrites: {
    sqlite: captured.safety.noSqliteMutation,
    chromeStorage: captured.safety.noChromeStorageMutation,
    tombstone: captured.safety.noTombstoneMutation,
    binding: captured.safety.noBindingMutation,
    transport: captured.safety.noTransportWrite,
    webdav: captured.safety.noWebdavWrite,
  },
  folderSyncReady: captured.safety.folderSyncReady,
  publicPremiumBlocked: captured.safety.publicPremiumBlocked,
  realRemoteWebdavDeferred: captured.safety.realRemoteWebdavDeferred,
  crossSurfaceFutureRequirement: 'desktop-chrome-native-extension-multi-device-mobile',
  metadataAllowlistExpectedCore: METADATA_CORE_TYPES,
  currentSourceMetadataAllowlist: applied,
  metadataAllowlistOutOfScopeCaveat: metadataAllowlistCaveat,
  recommendedNext: 'F7-live-drift-class-analysis-and-reconciliation-decision-matrix',
}, null, 2));
console.log('PASS validate-folder-sync-f6-desktop-runtime-drift-live-evidence');
