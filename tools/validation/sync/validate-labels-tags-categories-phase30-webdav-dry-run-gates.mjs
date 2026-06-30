#!/usr/bin/env node
//
// Phase 30 — WebDAV dry-run gates validator.
//
// Verifies the Phase 30 disabled-by-default guard module, evidence, and loader wiring. The validator
// executes the guard module in a VM and proves it only builds redacted control-plane manifests and
// guard decisions: no WebDAV writes, no remote files, no schema mutation, no allowlist broadening, and
// local sync-folder JSON remains the active transport.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';

const root = process.cwd();
const failures = [];

const evidenceDoc = 'release-evidence/2026-06-25/labels-tags-categories-phase30-webdav-dry-run-gates.md';
const phase29Doc = 'release-evidence/2026-06-25/labels-tags-categories-phase29-webdav-gate-c-proof-bridge.md';
const phase29Validator = 'tools/validation/sync/validate-labels-tags-categories-phase29-webdav-gate-c-proof-bridge.mjs';
const guardFile = 'src-surfaces-base/studio/sync/webdav-transport-gates.js';
const studioHtml = 'src-surfaces-base/studio/studio.html';
const packFile = 'tools/product/studio/pack-studio.mjs';
const folderSyncFile = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const folderImportFile = 'src-surfaces-base/studio/sync/folder-import.mv3.js';

const APPLIED_TYPES = ['chat-category-assign', 'chat-category-clear', 'chat-label-bind', 'chat-tag-bind'];
const DEV_FLAG = 'webdav-dev-only-do-not-ship';
const SCHEMA = 'h2o.studio.sync.webdav-transport-control-plane.v1';
const GUARDS = [
  'feature-gate-guard',
  'dev-only-write-flag-guard',
  'envelope-unchanged-guard',
  'allowlist-unchanged-guard',
  'authority-model-guard',
  'chrome-read-only-guard',
  'desktop-canonical-guard',
  'no-destructive-action-guard',
  'no-schema-mutation-guard',
  'no-secret-raw-data-evidence-guard',
  'checksum-integrity-guard',
  'sequence-monotonicity-guard',
  'peer-identity-guard',
  'stale-basis-guard',
  'corrupt-partial-file-recovery-guard',
  'product-sync-ready-false-guard',
];

const SAMPLE_HASH_A = 'sha256:1111111111111111111111111111111111111111111111111111111111111111';
const SAMPLE_HASH_B = 'sha256:2222222222222222222222222222222222222222222222222222222222222222';
const SAMPLE_HASH_C = 'sha256:3333333333333333333333333333333333333333333333333333333333333333';

function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function exists(file) { return fs.existsSync(path.join(root, file)); }
function assert(condition, message) { if (!condition) failures.push(message); }

function parseAppliedAllowlist(source) {
  const start = source.indexOf('APPLIED_LIBRARY_METADATA_MUTATION_REQUEST_ACTIONS = {');
  if (start < 0) return null;
  const end = source.indexOf('}', start);
  if (end < 0) return null;
  const block = source.slice(start, end);
  const applied = [];
  const re = /'([a-z0-9-]+)'\s*:\s*true/gi;
  let m;
  while ((m = re.exec(block)) !== null) applied.push(m[1]);
  return applied;
}

function sameSet(a, b) {
  const aa = a.slice().sort();
  const bb = b.slice().sort();
  return aa.length === bb.length && aa.every((v, i) => v === bb[i]);
}

function runGuardModule() {
  const source = read(guardFile);
  const context = { console: { log() {}, warn() {}, error() {} } };
  context.globalThis = context;
  context.window = context;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: guardFile });
  return context.H2O.Studio.sync.webdavTransportGates;
}

// ---- file presence ----
for (const file of [evidenceDoc, phase29Doc, phase29Validator, guardFile, studioHtml, packFile]) {
  assert(exists(file), `${file}: missing`);
}
if (!exists(evidenceDoc) || !exists(guardFile)) {
  console.error('FAIL validate-labels-tags-categories-phase30-webdav-dry-run-gates');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

const evidence = read(evidenceDoc);
const flat = evidence.replace(/\s+/g, ' ');
const guardSource = read(guardFile);

// ---- evidence contract ----
for (const marker of [
  'dev-flagged, proof-only',
  'No WebDAV upload/download was implemented',
  'No remote files are written',
  'Local sync-folder JSON remains the active transport',
  'Product metadata sync remains globally NOT READY',
  'webdav-dev-only-do-not-ship',
  '9a89c57',
  SCHEMA,
]) {
  assert(flat.includes(marker), `${evidenceDoc}: missing marker ${marker}`);
}
for (const type of APPLIED_TYPES) assert(flat.includes(type), `${evidenceDoc}: missing applied type ${type}`);
for (const guard of GUARDS) assert(flat.includes(guard), `${evidenceDoc}: missing guard ${guard}`);

// ---- no secret/raw-data evidence markers ----
for (const forbidden of [
  /https?:\/\/[^\s)]+/i,
  /password\s*[:=]/i,
  /token\s*[:=]/i,
  /Authorization:/i,
  /raw chat title/i,
  /raw chat content/i,
]) {
  assert(!forbidden.test(evidence), `${evidenceDoc}: forbidden raw/secret-looking evidence matched ${forbidden}`);
}

// ---- source guard module: no remote IO / no persistence ----
for (const forbidden of [
  '.fetch(',
  'fetch(',
  'writeTextFile',
  'fsWrite',
  'chrome.storage',
  'localStorage',
  'sessionStorage',
  'XMLHttpRequest',
  'PUT',
  'PROPFIND',
  'MKCOL',
  'uploadRelayOutbox',
  'downloadRelayInbox',
]) {
  assert(!guardSource.includes(forbidden), `${guardFile}: dry-run module must not include remote/storage IO token ${forbidden}`);
}

// ---- loader/build wiring ----
assert(read(studioHtml).includes('./sync/webdav-transport-gates.js'),
  'studio.html must load webdav-transport-gates.js');
assert(read(packFile).includes('"sync/webdav-transport-gates.js"'),
  'pack-studio.mjs must package webdav-transport-gates.js');

// ---- REAL SOURCE: allowlist exactly four; WebDAV still deferred ----
const applied = parseAppliedAllowlist(read(folderSyncFile));
assert(Array.isArray(applied), 'could not parse APPLIED_LIBRARY_METADATA_MUTATION_REQUEST_ACTIONS from source');
if (Array.isArray(applied)) {
  assert(sameSet(applied, APPLIED_TYPES),
    `source applied allowlist drifted: expected exactly [${APPLIED_TYPES.join(', ')}], got [${applied.join(', ')}]`);
}
for (const file of [folderSyncFile, folderImportFile]) {
  assert(read(file).includes("webdav: 'deferred'"), `WebDAV must remain deferred in ${file}`);
}

// ---- execute the dry-run module ----
let gates;
try {
  gates = runGuardModule();
} catch (error) {
  failures.push(`${guardFile}: VM execution failed: ${error && error.stack || error}`);
}

if (gates) {
  assert(gates.__installed === true, 'dry-run gates API must install');
  assert(gates.constants.SCHEMA === SCHEMA, 'dry-run gates schema mismatch');
  assert(gates.constants.DEV_ONLY_WRITE_FLAG === DEV_FLAG, 'dev-only flag mismatch');
  assert(gates.constants.ACTIVE_TRANSPORT === 'local-sync-folder-json', 'active transport must remain local sync-folder JSON');
  assert(sameSet(gates.constants.APPLIED_TYPES, APPLIED_TYPES), 'dry-run module applied allowlist must be exactly four');
  for (const guard of GUARDS) assert(gates.constants.GUARDS.includes(guard), `dry-run module missing guard ${guard}`);

  const diag = gates.diagnose();
  assert(diag.webdavDisabledByDefault === true, 'diagnose must report WebDAV disabled by default');
  assert(diag.remoteFilesWritten === false, 'diagnose must report no remote files written');
  assert(diag.webdavWritesEnabled === false, 'diagnose must report writes disabled');
  assert(diag.localSyncFolderJsonActive === true, 'diagnose must keep local sync-folder JSON active');
  assert(diag.productSyncReady === false, 'diagnose must keep productSyncReady false');

  const defaultRun = gates.dryRun({
    contentHash: SAMPLE_HASH_A,
    fileHash: SAMPLE_HASH_B,
    peerIdHash: SAMPLE_HASH_C,
    sequenceNumber: 1,
    previousSequenceNumber: 0,
  });
  assert(defaultRun.remoteFilesWritten === false, 'default dry-run must not write remote files');
  assert(defaultRun.webdavWritesEnabled === false, 'default dry-run must keep WebDAV writes disabled');
  assert(defaultRun.activeTransport === 'local-sync-folder-json', 'default dry-run must keep local transport active');
  assert(defaultRun.manifest.writeStatus === 'disabled', 'default dry-run writeStatus must be disabled');
  assert(defaultRun.manifest.guardEvaluation.blockers.includes('webdav-disabled'),
    'default dry-run must block on disabled WebDAV');
  assert(defaultRun.manifest.privacyRedactionStatus.redacted === true, 'default dry-run manifest must be redacted');
  assert(defaultRun.manifest.privacyRedactionStatus.hashOnly === true, 'default dry-run manifest must be hash-only');

  const missingDevFlagRun = gates.dryRun({
    flags: {
      webdavEnabled: true,
      readEnabled: true,
      writeEnabled: true,
      desktopExportMirrorEnabled: true,
    },
    contentHash: SAMPLE_HASH_A,
    fileHash: SAMPLE_HASH_B,
    peerIdHash: SAMPLE_HASH_C,
    sequenceNumber: 2,
    previousSequenceNumber: 1,
  });
  assert(missingDevFlagRun.manifest.writeStatus === 'skipped-no-dev-flag',
    'write-capable dry-run without dev flag must be skipped-no-dev-flag');
  assert(missingDevFlagRun.manifest.guardEvaluation.blockers.includes('webdav-dev-flag-required'),
    'missing dev flag must be a blocker');
  assert(missingDevFlagRun.remoteFilesWritten === false, 'missing-dev-flag dry-run must not write remote files');

  const devFlagRun = gates.dryRun({
    flags: {
      webdavEnabled: true,
      readEnabled: true,
      writeEnabled: true,
      desktopExportMirrorEnabled: true,
      devFlag: DEV_FLAG,
    },
    remoteRootRefHash: SAMPLE_HASH_A,
    peerDirHash: SAMPLE_HASH_B,
    peerIdHash: SAMPLE_HASH_C,
    contentHash: SAMPLE_HASH_A,
    fileHash: SAMPLE_HASH_B,
    sequenceNumber: 3,
    previousSequenceNumber: 2,
    previousExportId: 'phase30-prev-export',
  });
  assert(devFlagRun.manifest.writeStatus === 'dry-run-dev-flag-present-no-remote-write',
    'dev flag path must remain dry-run-only with no remote write');
  assert(devFlagRun.remoteFilesWritten === false, 'dev-flag dry-run must not write remote files');
  assert(devFlagRun.webdavWritesEnabled === false, 'dev-flag dry-run must not enable writes');
  assert(devFlagRun.manifest.remoteRootRef.rawEndpointPresent === false, 'manifest must not expose raw endpoint');
  assert(devFlagRun.manifest.peerIdentity.rawPeerIdPresent === false, 'manifest must not expose raw peer id');
  assert(devFlagRun.manifest.productSyncReady === false, 'manifest must keep productSyncReady false');

  const rawInputRun = gates.dryRun({
    flags: {
      webdavEnabled: true,
      writeEnabled: true,
      desktopExportMirrorEnabled: true,
      devFlag: DEV_FLAG,
    },
    remoteRootUrl: 'redacted-by-test',
    rawChatTitle: 'redacted-by-test',
    contentHash: SAMPLE_HASH_A,
    fileHash: SAMPLE_HASH_B,
    peerIdHash: SAMPLE_HASH_C,
    sequenceNumber: 4,
    previousSequenceNumber: 3,
  });
  assert(rawInputRun.manifest.privacyRedactionStatus.rawInputRejected === true,
    'raw/private inputs must be rejected by privacy status');
  assert(rawInputRun.manifest.guardEvaluation.blockers.includes('webdav-private-input-rejected'),
    'raw/private inputs must surface webdav-private-input-rejected');
}

if (failures.length) {
  console.error('FAIL validate-labels-tags-categories-phase30-webdav-dry-run-gates');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(JSON.stringify({
  schema: 'h2o.studio.library-metadata.phase30-webdav-dry-run-gates.v1',
  phase: 'phase30-webdav-dry-run-gates',
  evidenceDoc,
  guardFile,
  dryRunOnly: true,
  phase29CommitReferenced: '9a89c57',
  appliedAllowlistInSource: applied,
  guardsChecked: GUARDS.length,
  webdavDeferredInSource: true,
  webdavWritesEnabled: false,
  remoteFilesWritten: false,
  activeTransport: 'local-sync-folder-json',
  productSyncReady: false,
}, null, 2));
console.log('PASS validate-labels-tags-categories-phase30-webdav-dry-run-gates');
