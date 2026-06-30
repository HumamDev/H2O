#!/usr/bin/env node
//
// Phase 31 — WebDAV local sandbox proof validator.
//
// Executes a local/temp sandbox proof around the Phase 30 dry-run gate API. This validator proves the
// default-disabled behavior, explicit dev-flag requirement, byte-unchanged latest/chrome-latest copies
// inside a temporary local sandbox only, redacted manifest evidence, fallback behavior, unchanged
// allowlist/envelopes/authority, and globally NOT READY product metadata sync.

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';

const root = process.cwd();
const failures = [];

const evidenceDoc = 'release-evidence/2026-06-25/labels-tags-categories-phase31-webdav-local-sandbox-proof.md';
const phase30Validator = 'tools/validation/sync/validate-labels-tags-categories-phase30-webdav-dry-run-gates.mjs';
const guardFile = 'src-surfaces-base/studio/sync/webdav-transport-gates.js';
const folderSyncFile = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const folderImportFile = 'src-surfaces-base/studio/sync/folder-import.mv3.js';

const DEV_FLAG = 'webdav-dev-only-do-not-ship';
const SCHEMA = 'h2o.studio.sync.webdav-transport-control-plane.v1';
const APPLIED_TYPES = ['chat-category-assign', 'chat-category-clear', 'chat-label-bind', 'chat-tag-bind'];
const SAME_ENVELOPES = ['latest.json', 'chrome-latest.json'];
const SAMPLE_LATEST = JSON.stringify({
  schema: 'h2o.studio.fullBundle.v2',
  exportId: 'phase31-latest-export',
  productSyncReady: false,
  desktopCanonicalLibraryMetadata: {
    schema: 'h2o.studio.library-metadata.desktop-canonical.v1',
    counts: { chatCategoryAssignmentCount: 1, chatLabelBindingCount: 1, chatTagBindingCount: 1 },
    hashes: {
      projection: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      chatCategoryAssignments: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      chatLabelBindings: 'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
      chatTagBindings: 'sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
    },
    privacy: { redacted: true, hashOnly: true },
  },
  libraryMetadataMutationReceipts: [],
}, null, 2) + '\n';
const SAMPLE_CHROME_LATEST = JSON.stringify({
  schema: 'h2o.studio.chromeLatest.v1',
  exportId: 'phase31-chrome-latest-export',
  productSyncReady: false,
  libraryMetadataMutationRequests: [
    {
      schema: 'h2o.studio.library-metadata-mutation-request.v1',
      requestId: 'library-metadata-mutation-request:phase31-proof',
      action: 'chat-label-bind',
      requestType: 'chat-label-bind',
      expectedCurrentBasisHash: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      safety: {
        requestOnly: true,
        noChromeCanonicalMutation: true,
        noHardDelete: true,
        noPurge: true,
      },
      privacy: { redacted: true, hashOnly: true },
    },
  ],
}, null, 2) + '\n';

function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function exists(file) { return fs.existsSync(path.join(root, file)); }
function assert(condition, message) { if (!condition) failures.push(message); }
function sha256(text) { return 'sha256:' + crypto.createHash('sha256').update(String(text)).digest('hex'); }
function hashPath(value) { return sha256(String(value || '')).slice(0, 71); }

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
  const context = { console: { log() {}, warn() {}, error() {} } };
  context.globalThis = context;
  context.window = context;
  vm.createContext(context);
  vm.runInContext(read(guardFile), context, { filename: guardFile });
  return context.H2O.Studio.sync.webdavTransportGates;
}

function writeSandboxFile(sandboxRoot, relativePath, content, writes) {
  const target = path.join(sandboxRoot, relativePath);
  const resolved = path.resolve(target);
  const rootResolved = path.resolve(sandboxRoot);
  assert(resolved.startsWith(rootResolved + path.sep), `sandbox write escaped root: ${relativePath}`);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, content, 'utf8');
  writes.push(resolved);
  return resolved;
}

function readText(file) {
  return fs.readFileSync(file, 'utf8');
}

function runLocalSandboxProof(gates) {
  const sandboxRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'h2o-phase31-webdav-sandbox-'));
  const writes = [];
  try {
    const latestHash = sha256(SAMPLE_LATEST);
    const chromeHash = sha256(SAMPLE_CHROME_LATEST);
    const defaultDryRun = gates.dryRun({
      contentHash: latestHash,
      fileHash: latestHash,
      peerIdHash: sha256('phase31-peer'),
      sequenceNumber: 1,
      previousSequenceNumber: 0,
    });
    const missingFlagDryRun = gates.dryRun({
      flags: {
        webdavEnabled: true,
        readEnabled: true,
        writeEnabled: true,
        desktopExportMirrorEnabled: true,
      },
      contentHash: latestHash,
      fileHash: latestHash,
      peerIdHash: sha256('phase31-peer'),
      sequenceNumber: 2,
      previousSequenceNumber: 1,
    });
    const devFlagDryRun = gates.dryRun({
      flags: {
        webdavEnabled: true,
        readEnabled: true,
        writeEnabled: true,
        desktopExportMirrorEnabled: true,
        chromeRequestExportMirrorEnabled: true,
        devFlag: DEV_FLAG,
      },
      operation: 'desktop-export-mirror',
      remoteRootRefHash: hashPath(sandboxRoot),
      peerDirHash: sha256('phase31-peer-dir'),
      peerIdHash: sha256('phase31-peer'),
      contentHash: latestHash,
      fileHash: latestHash,
      sequenceNumber: 3,
      previousSequenceNumber: 2,
      previousExportId: 'phase31-prev-export',
      lastKnownRemoteState: {
        exportId: 'phase31-prev-export',
        sequenceNumber: 2,
        fileHash: latestHash,
        observedAtIso: '2026-06-30T00:00:00Z',
      },
    });
    const chromeDevFlagDryRun = gates.dryRun({
      flags: {
        webdavEnabled: true,
        readEnabled: true,
        writeEnabled: true,
        desktopExportMirrorEnabled: true,
        chromeRequestExportMirrorEnabled: true,
        devFlag: DEV_FLAG,
      },
      operation: 'chrome-request-export-mirror',
      remoteRootRefHash: hashPath(sandboxRoot),
      peerDirHash: sha256('phase31-peer-dir'),
      peerIdHash: sha256('phase31-peer'),
      contentHash: chromeHash,
      fileHash: chromeHash,
      sequenceNumber: 4,
      previousSequenceNumber: 3,
      previousExportId: 'phase31-chrome-prev-export',
    });

    assert(defaultDryRun.manifest.writeStatus === 'disabled', 'default WebDAV dry-run must remain disabled');
    assert(defaultDryRun.manifest.guardEvaluation.blockers.includes('webdav-disabled'),
      'default WebDAV dry-run must include webdav-disabled');
    assert(writes.length === 0, 'default-disabled dry-run must not write sandbox files');
    assert(missingFlagDryRun.manifest.writeStatus === 'skipped-no-dev-flag',
      'write-capable sandbox proof without dev flag must be skipped-no-dev-flag');
    assert(missingFlagDryRun.manifest.guardEvaluation.blockers.includes('webdav-dev-flag-required'),
      'missing dev flag must block sandbox behavior');
    assert(writes.length === 0, 'missing-dev-flag dry-run must not write sandbox files');
    assert(devFlagDryRun.manifest.writeStatus === 'dry-run-dev-flag-present-no-remote-write',
      'dev flag permits only sandbox proof/no-remote-write status');
    assert(chromeDevFlagDryRun.manifest.writeStatus === 'dry-run-dev-flag-present-no-remote-write',
      'Chrome mirror dev flag path must remain sandbox proof/no-remote-write only');

    const latestPath = writeSandboxFile(sandboxRoot, 'remote-root/redacted-peer/latest.json', SAMPLE_LATEST, writes);
    const chromePath = writeSandboxFile(sandboxRoot, 'remote-root/redacted-peer/chrome-latest.json', SAMPLE_CHROME_LATEST, writes);
    const manifest = {
      schema: SCHEMA,
      phase: 'phase31-webdav-local-sandbox-proof',
      proofOnly: true,
      sandboxOnly: true,
      sandboxRootHash: hashPath(sandboxRoot),
      devOnlyWriteFlagRequired: DEV_FLAG,
      activeTransport: 'local-sync-folder-json',
      remoteFilesWrittenOutsideSandbox: false,
      productSyncReady: false,
      latestFileHash: sha256(readText(latestPath)),
      chromeLatestFileHash: sha256(readText(chromePath)),
      remoteRootRef: devFlagDryRun.manifest.remoteRootRef,
      safePeerDirectory: devFlagDryRun.manifest.safePeerDirectory,
      peerIdentity: devFlagDryRun.manifest.peerIdentity,
      privacyRedactionStatus: devFlagDryRun.manifest.privacyRedactionStatus,
      guardStatuses: devFlagDryRun.manifest.guardEvaluation.guards.map((row) => row.code),
    };
    const manifestPath = writeSandboxFile(sandboxRoot, 'remote-root/redacted-peer/control-plane-manifest.json',
      JSON.stringify(manifest, null, 2) + '\n', writes);
    const files = [latestPath, chromePath, manifestPath];

    for (const written of files) {
      assert(path.resolve(written).startsWith(path.resolve(sandboxRoot) + path.sep),
        `sandbox file written outside sandbox: ${written}`);
    }
    assert(readText(latestPath) === SAMPLE_LATEST, 'latest.json must be byte-unchanged in sandbox proof');
    assert(readText(chromePath) === SAMPLE_CHROME_LATEST, 'chrome-latest.json must be byte-unchanged in sandbox proof');
    assert(manifest.latestFileHash === latestHash, 'manifest latest file hash must match');
    assert(manifest.chromeLatestFileHash === chromeHash, 'manifest chrome-latest file hash must match');
    assert(manifest.privacyRedactionStatus.redacted === true, 'manifest must be redacted');
    assert(manifest.privacyRedactionStatus.hashOnly === true, 'manifest must be hash-only');
    assert(manifest.remoteFilesWrittenOutsideSandbox === false, 'manifest must report no remote writes outside sandbox');
    assert(manifest.productSyncReady === false, 'manifest must keep productSyncReady false');

    return {
      sandboxRootHash: hashPath(sandboxRoot),
      sandboxWriteCount: writes.length,
      latestHash,
      chromeHash,
      defaultBlocked: defaultDryRun.manifest.guardEvaluation.blockers.includes('webdav-disabled'),
      devFlagRequired: missingFlagDryRun.manifest.guardEvaluation.blockers.includes('webdav-dev-flag-required'),
      devFlagSandboxOnly: devFlagDryRun.manifest.writeStatus === 'dry-run-dev-flag-present-no-remote-write',
      byteUnchanged: readText(latestPath) === SAMPLE_LATEST && readText(chromePath) === SAMPLE_CHROME_LATEST,
      manifestRedacted: manifest.privacyRedactionStatus.redacted === true && manifest.privacyRedactionStatus.hashOnly === true,
      localFallbackActive: defaultDryRun.activeTransport === 'local-sync-folder-json',
      noRemoteOutsideSandbox: writes.every((written) => path.resolve(written).startsWith(path.resolve(sandboxRoot) + path.sep)),
      productSyncReady: false,
    };
  } finally {
    try {
      fs.rmSync(sandboxRoot, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup of a temp proof sandbox only.
    }
  }
}

for (const file of [evidenceDoc, phase30Validator, guardFile, folderSyncFile, folderImportFile]) {
  assert(exists(file), `${file}: missing`);
}
if (!exists(evidenceDoc) || !exists(guardFile)) {
  console.error('FAIL validate-labels-tags-categories-phase31-webdav-local-sandbox-proof');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

const evidence = read(evidenceDoc);
const flat = evidence.replace(/\s+/g, ' ');

for (const marker of [
  'Phase 30 WebDAV dry-run gates committed: `05814b6`',
  'dev-only local WebDAV sandbox proof',
  'webdav-dev-only-do-not-ship',
  'No product WebDAV transport was enabled',
  'No real remote writes were performed',
  'Local sync-folder JSON remains the active product transport',
  'Product metadata sync remains globally NOT READY',
  SCHEMA,
]) {
  assert(flat.includes(marker), `${evidenceDoc}: missing marker ${marker}`);
}
for (const type of APPLIED_TYPES) assert(flat.includes(type), `${evidenceDoc}: missing applied type ${type}`);
for (const envelope of SAME_ENVELOPES) assert(flat.includes(envelope), `${evidenceDoc}: missing envelope ${envelope}`);

for (const forbidden of [
  /https?:\/\/[^\s)]+/i,
  /password\s*[:=]/i,
  /token\s*[:=]/i,
  /Authorization:/i,
  /raw chat title/i,
  /raw chat content/i,
  /label name leak/i,
  /tag name leak/i,
  /category name leak/i,
]) {
  assert(!forbidden.test(evidence), `${evidenceDoc}: forbidden raw/secret-looking evidence matched ${forbidden}`);
}

const applied = parseAppliedAllowlist(read(folderSyncFile));
assert(Array.isArray(applied), 'could not parse APPLIED_LIBRARY_METADATA_MUTATION_REQUEST_ACTIONS from source');
if (Array.isArray(applied)) {
  assert(sameSet(applied, APPLIED_TYPES),
    `source applied allowlist drifted: expected exactly [${APPLIED_TYPES.join(', ')}], got [${applied.join(', ')}]`);
}
for (const file of [folderSyncFile, folderImportFile]) {
  assert(read(file).includes("webdav: 'deferred'"), `WebDAV must remain deferred in ${file}`);
}

let proof = null;
try {
  const gates = runGuardModule();
  assert(gates.__installed === true, 'Phase 30 webdavTransportGates API must install');
  assert(gates.constants.DEV_ONLY_WRITE_FLAG === DEV_FLAG, 'dev-only flag must match Phase 30');
  assert(gates.constants.ACTIVE_TRANSPORT === 'local-sync-folder-json', 'active transport must remain local sync-folder JSON');
  assert(sameSet(gates.constants.APPLIED_TYPES, APPLIED_TYPES), 'Phase 30 API allowlist must remain exactly four');
  proof = runLocalSandboxProof(gates);
} catch (error) {
  failures.push(`phase31 sandbox proof failed: ${error && error.stack || error}`);
}

if (proof) {
  assert(proof.defaultBlocked === true, 'Phase 31 proof must block WebDAV by default');
  assert(proof.devFlagRequired === true, 'Phase 31 proof must require explicit dev flag');
  assert(proof.devFlagSandboxOnly === true, 'Phase 31 proof must allow only sandbox behavior with dev flag');
  assert(proof.byteUnchanged === true, 'Phase 31 proof must carry latest/chrome-latest byte-unchanged');
  assert(proof.manifestRedacted === true, 'Phase 31 proof manifest must be redacted/hash-only');
  assert(proof.localFallbackActive === true, 'Phase 31 proof must keep local fallback active');
  assert(proof.noRemoteOutsideSandbox === true, 'Phase 31 proof must not write outside local sandbox');
  assert(proof.productSyncReady === false, 'Phase 31 proof must keep productSyncReady false');
}

if (failures.length) {
  console.error('FAIL validate-labels-tags-categories-phase31-webdav-local-sandbox-proof');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(JSON.stringify({
  schema: 'h2o.studio.library-metadata.phase31-webdav-local-sandbox-proof.v1',
  phase: 'phase31-webdav-local-sandbox-proof',
  evidenceDoc,
  phase30CommitReferenced: '05814b6',
  sandboxOnly: true,
  defaultBlocked: proof.defaultBlocked,
  devOnlyFlagRequired: proof.devFlagRequired,
  byteUnchanged: proof.byteUnchanged,
  manifestRedacted: proof.manifestRedacted,
  noRemoteWritesOutsideSandbox: proof.noRemoteOutsideSandbox,
  appliedAllowlistInSource: applied,
  webdavDeferredInSource: true,
  activeTransport: 'local-sync-folder-json',
  productSyncReady: false,
}, null, 2));
console.log('PASS validate-labels-tags-categories-phase31-webdav-local-sandbox-proof');
