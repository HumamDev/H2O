#!/usr/bin/env node
//
// Phase 35 - WebDAV local/mock adapter proof validator.
//
// Executes a deterministic in-process local/mock adapter proof over a temp sandbox. This is not
// product transport, does not open sockets, does not call external network APIs, and does not write
// outside the sandbox. It proves the Phase 34 protocol surface, dev-flag gating, byte-unchanged
// envelope carriage, failure handling, unchanged allowlist/schema posture, and globally NOT READY
// product metadata sync.

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';

const root = process.cwd();
const failures = [];

const evidenceDoc = 'release-evidence/2026-06-25/labels-tags-categories-phase35-webdav-local-mock-adapter-proof.md';
const phase34Doc = 'release-evidence/2026-06-25/labels-tags-categories-phase34-webdav-gate-e-adapter-spec.md';
const phase34Validator = 'tools/validation/sync/validate-labels-tags-categories-phase34-webdav-gate-e-adapter-spec.mjs';
const phase33Validator = 'tools/validation/sync/validate-labels-tags-categories-phase33-webdav-next-step-design-gate.mjs';
const phase32Validator = 'tools/validation/sync/validate-labels-tags-categories-phase32-webdav-loopback-sandbox-proof.mjs';
const phase31Validator = 'tools/validation/sync/validate-labels-tags-categories-phase31-webdav-local-sandbox-proof.mjs';
const phase30Validator = 'tools/validation/sync/validate-labels-tags-categories-phase30-webdav-dry-run-gates.mjs';
const guardFile = 'src-surfaces-base/studio/sync/webdav-transport-gates.js';
const folderSyncFile = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const folderImportFile = 'src-surfaces-base/studio/sync/folder-import.mv3.js';

const DEV_FLAG = 'webdav-dev-only-do-not-ship';
const APPLIED_TYPES = ['chat-category-assign', 'chat-category-clear', 'chat-label-bind', 'chat-tag-bind'];
const PROTOCOL_SURFACE = ['PROPFIND', 'PUT', 'GET', 'MOVE', 'ETag', 'interrupted PUT', 'atomic MOVE'];
const SAME_ENVELOPES = ['latest.json', 'chrome-latest.json'];
const SAMPLE_LATEST = JSON.stringify({
  schema: 'h2o.studio.fullBundle.v2',
  exportId: 'phase35-webdav-local-mock-latest-export',
  sequenceNumber: 7,
  peerIdHash: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  productSyncReady: false,
  desktopCanonicalLibraryMetadata: {
    schema: 'h2o.studio.library-metadata.desktop-canonical.v1',
    counts: {
      chatCategoryAssignmentCount: 1,
      chatLabelBindingCount: 1,
      chatTagBindingCount: 1,
    },
    hashes: {
      projection: 'sha256:1111111111111111111111111111111111111111111111111111111111111111',
      chatCategoryAssignments: 'sha256:2222222222222222222222222222222222222222222222222222222222222222',
      chatLabelBindings: 'sha256:3333333333333333333333333333333333333333333333333333333333333333',
      chatTagBindings: 'sha256:4444444444444444444444444444444444444444444444444444444444444444',
    },
    privacy: { redacted: true, hashOnly: true },
  },
  libraryMetadataMutationReceipts: [],
}, null, 2) + '\n';
const SAMPLE_CHROME_LATEST = JSON.stringify({
  schema: 'h2o.studio.chromeLatest.v1',
  exportId: 'phase35-webdav-local-mock-chrome-latest-export',
  sequenceNumber: 8,
  peerIdHash: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  productSyncReady: false,
  libraryMetadataMutationRequests: [
    {
      schema: 'h2o.studio.library-metadata-mutation-request.v1',
      requestId: 'library-metadata-mutation-request:phase35-local-mock-proof',
      action: 'chat-tag-bind',
      requestType: 'chat-tag-bind',
      expectedCurrentBasisHash: 'sha256:1111111111111111111111111111111111111111111111111111111111111111',
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

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

function exists(file) {
  return fs.existsSync(path.join(root, file));
}

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function sha256(value) {
  return 'sha256:' + crypto.createHash('sha256').update(String(value)).digest('hex');
}

function sameSet(a, b) {
  const aa = a.slice().sort();
  const bb = b.slice().sort();
  return aa.length === bb.length && aa.every((v, i) => v === bb[i]);
}

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

function runGuardModule() {
  const context = { console: { log() {}, warn() {}, error() {} } };
  context.globalThis = context;
  context.window = context;
  vm.createContext(context);
  vm.runInContext(read(guardFile), context, { filename: guardFile });
  return context.H2O.Studio.sync.webdavTransportGates;
}

function resolveSandboxPath(sandboxRoot, relativePath) {
  const rootResolved = path.resolve(sandboxRoot);
  if (path.isAbsolute(relativePath)) throw new Error(`absolute path rejected: ${relativePath}`);
  const resolved = path.resolve(rootResolved, relativePath);
  if (!resolved.startsWith(rootResolved + path.sep)) throw new Error(`sandbox path escaped root: ${relativePath}`);
  return resolved;
}

function tryEscape(sandboxRoot, relativePath) {
  try {
    resolveSandboxPath(sandboxRoot, relativePath);
    return false;
  } catch {
    return true;
  }
}

function hashPath(value) {
  return sha256(String(value || '')).slice(0, 71);
}

function validateRemoteEnvelope(bytes, expected) {
  let parsed;
  try {
    parsed = JSON.parse(bytes);
  } catch {
    return { ok: false, code: 'malformed-remote-file' };
  }
  if (sha256(bytes) !== expected.expectedHash) return { ok: false, code: 'checksum-mismatch' };
  if (Number(parsed.sequenceNumber) < Number(expected.previousSequenceNumber)) {
    return { ok: false, code: 'sequence-regression' };
  }
  if (String(parsed.peerIdHash || '') !== String(expected.peerIdHash || '')) {
    return { ok: false, code: 'peer-mismatch' };
  }
  return { ok: true, code: 'accepted' };
}

class LocalMockWebDavAdapter {
  constructor({ sandboxRoot, devFlag }) {
    if (devFlag !== DEV_FLAG) throw new Error('webdav-dev-flag-required');
    this.sandboxRoot = sandboxRoot;
    this.operations = [];
    this.networkCalls = 0;
    this.remoteAccountUsed = false;
    this.credentialsUsed = false;
  }

  resolve(resource) {
    return resolveSandboxPath(this.sandboxRoot, resource);
  }

  propfind(resource) {
    const resolved = this.resolve(resource);
    this.operations.push('PROPFIND');
    if (!fs.existsSync(resolved)) return { exists: false, etag: '', size: 0 };
    const bytes = fs.readFileSync(resolved, 'utf8');
    return { exists: true, etag: sha256(bytes), size: Buffer.byteLength(bytes) };
  }

  put(resource, bytes, options = {}) {
    const resolved = this.resolve(resource);
    const parent = path.dirname(resolved);
    fs.mkdirSync(parent, { recursive: true });
    this.operations.push('PUT');
    if (options.ifMatch && this.propfind(resource).etag !== options.ifMatch) {
      return { ok: false, code: 'precondition-failed' };
    }
    if (options.ifNoneMatch === '*' && this.propfind(resource).exists) {
      return { ok: false, code: 'precondition-failed' };
    }
    if (options.interrupted === true) {
      fs.writeFileSync(resolved, String(bytes).slice(0, Math.max(1, Math.floor(String(bytes).length / 3))), 'utf8');
      return { ok: false, code: 'interrupted-put', etag: sha256(fs.readFileSync(resolved, 'utf8')) };
    }
    fs.writeFileSync(resolved, bytes, 'utf8');
    return { ok: true, code: 'put-staged', etag: sha256(bytes), size: Buffer.byteLength(bytes) };
  }

  get(resource) {
    const resolved = this.resolve(resource);
    this.operations.push('GET');
    if (!fs.existsSync(resolved)) return { ok: false, code: 'not-found', bytes: '' };
    const bytes = fs.readFileSync(resolved, 'utf8');
    return { ok: true, code: 'read', bytes, etag: sha256(bytes), size: Buffer.byteLength(bytes) };
  }

  move(fromResource, toResource, options = {}) {
    const fromResolved = this.resolve(fromResource);
    const toResolved = this.resolve(toResource);
    this.operations.push('MOVE');
    if (!fs.existsSync(fromResolved)) return { ok: false, code: 'source-not-found' };
    const target = this.propfind(toResource);
    if (options.ifMatch && target.etag !== options.ifMatch) return { ok: false, code: 'precondition-failed' };
    if (options.ifNoneMatch === '*' && target.exists) return { ok: false, code: 'precondition-failed' };
    fs.mkdirSync(path.dirname(toResolved), { recursive: true });
    fs.renameSync(fromResolved, toResolved);
    const finalBytes = fs.readFileSync(toResolved, 'utf8');
    return { ok: true, code: 'atomic-move-published', etag: sha256(finalBytes), size: Buffer.byteLength(finalBytes) };
  }
}

function runAdapterProof(gates) {
  const sandboxRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'h2o-phase35-webdav-local-mock-'));
  try {
    const latestHash = sha256(SAMPLE_LATEST);
    const chromeHash = sha256(SAMPLE_CHROME_LATEST);
    const peerIdHash = sha256('phase35-peer');
    const defaultDryRun = gates.dryRun({
      contentHash: latestHash,
      fileHash: latestHash,
      peerIdHash,
      sequenceNumber: 1,
      previousSequenceNumber: 0,
    });
    const missingFlagDryRun = gates.dryRun({
      flags: {
        webdavEnabled: true,
        readEnabled: true,
        writeEnabled: true,
        desktopExportMirrorEnabled: true,
        chromeRequestExportMirrorEnabled: true,
      },
      contentHash: latestHash,
      fileHash: latestHash,
      peerIdHash,
      sequenceNumber: 2,
      previousSequenceNumber: 1,
    });
    const devDryRun = gates.dryRun({
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
      peerDirHash: sha256('phase35-peer-dir'),
      peerIdHash,
      contentHash: latestHash,
      fileHash: latestHash,
      sequenceNumber: 3,
      previousSequenceNumber: 2,
      previousExportId: 'phase35-prev-export',
    });

    let missingFlagBlocked = false;
    try {
      new LocalMockWebDavAdapter({ sandboxRoot, devFlag: '' });
    } catch (error) {
      missingFlagBlocked = String(error && error.message) === 'webdav-dev-flag-required';
    }

    const adapter = new LocalMockWebDavAdapter({ sandboxRoot, devFlag: DEV_FLAG });
    const initialMissing = adapter.propfind('remote/redacted-peer/latest.json');
    const latestTmp = 'remote/redacted-peer/latest.json.tmp';
    const latestFinal = 'remote/redacted-peer/latest.json';
    const chromeTmp = 'remote/redacted-peer/chrome-latest.json.tmp';
    const chromeFinal = 'remote/redacted-peer/chrome-latest.json';

    const latestPut = adapter.put(latestTmp, SAMPLE_LATEST, { ifNoneMatch: '*' });
    const latestBeforeMove = adapter.propfind(latestFinal);
    const latestMove = adapter.move(latestTmp, latestFinal, { ifNoneMatch: '*' });
    const latestGet = adapter.get(latestFinal);

    const chromePut = adapter.put(chromeTmp, SAMPLE_CHROME_LATEST, { ifNoneMatch: '*' });
    const chromeMove = adapter.move(chromeTmp, chromeFinal, { ifNoneMatch: '*' });
    const chromeGet = adapter.get(chromeFinal);

    const preconditionTmp = 'remote/redacted-peer/latest-precondition.json.tmp';
    adapter.put(preconditionTmp, SAMPLE_LATEST.replace('phase35-webdav-local-mock-latest-export', 'phase35-precondition'), { ifNoneMatch: '*' });
    const beforePreconditionFailure = adapter.get(latestFinal);
    const failedPrecondition = adapter.move(preconditionTmp, latestFinal, {
      ifMatch: 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
    });
    const afterPreconditionFailure = adapter.get(latestFinal);

    const partialFinal = 'remote/redacted-peer/partial-latest.json';
    const interruptedPut = adapter.put(`${partialFinal}.tmp`, SAMPLE_LATEST, { interrupted: true });
    const partialFinalState = adapter.propfind(partialFinal);
    const partialTmpState = adapter.propfind(`${partialFinal}.tmp`);

    const replayTmp = 'remote/redacted-peer/chrome-latest-replay.json.tmp';
    const replayPut = adapter.put(replayTmp, SAMPLE_CHROME_LATEST, { ifNoneMatch: '*' });
    const replayMove = adapter.move(replayTmp, chromeFinal, { ifMatch: chromeGet.etag });
    const replayGet = adapter.get(chromeFinal);

    const malformed = validateRemoteEnvelope('{not-json', {
      expectedHash: sha256('{not-json'),
      previousSequenceNumber: 0,
      peerIdHash: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    });
    const checksumMismatch = validateRemoteEnvelope(SAMPLE_LATEST, {
      expectedHash: 'sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
      previousSequenceNumber: 0,
      peerIdHash: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    });
    const sequenceRegression = validateRemoteEnvelope(SAMPLE_LATEST, {
      expectedHash: latestHash,
      previousSequenceNumber: 99,
      peerIdHash: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    });
    const peerMismatch = validateRemoteEnvelope(SAMPLE_LATEST, {
      expectedHash: latestHash,
      previousSequenceNumber: 0,
      peerIdHash: 'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
    });
    const accepted = validateRemoteEnvelope(SAMPLE_LATEST, {
      expectedHash: latestHash,
      previousSequenceNumber: 0,
      peerIdHash: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    });

    const rootResolved = path.resolve(sandboxRoot);
    const allFiles = [];
    function walk(dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else allFiles.push(full);
      }
    }
    walk(sandboxRoot);

    return {
      defaultBlocked: defaultDryRun.manifest.guardEvaluation.blockers.includes('webdav-disabled'),
      missingFlagDryRunBlocked: missingFlagDryRun.manifest.guardEvaluation.blockers.includes('webdav-dev-flag-required'),
      missingFlagAdapterBlocked: missingFlagBlocked,
      devFlagLocalMockOnly: devDryRun.manifest.writeStatus === 'dry-run-dev-flag-present-no-remote-write',
      initialPropfindMissing: initialMissing.exists === false,
      protocolSurface: Array.from(new Set(adapter.operations)),
      latestPutOk: latestPut.ok === true,
      latestFinalAbsentBeforeMove: latestBeforeMove.exists === false,
      latestMoveOk: latestMove.ok === true,
      latestByteUnchanged: latestGet.ok === true && latestGet.bytes === SAMPLE_LATEST && latestGet.etag === latestHash,
      chromePutOk: chromePut.ok === true,
      chromeMoveOk: chromeMove.ok === true,
      chromeByteUnchanged: chromeGet.ok === true && chromeGet.bytes === SAMPLE_CHROME_LATEST && chromeGet.etag === chromeHash,
      preconditionFailureSafe: failedPrecondition.ok === false &&
        failedPrecondition.code === 'precondition-failed' &&
        beforePreconditionFailure.bytes === afterPreconditionFailure.bytes,
      interruptedPutSafe: interruptedPut.ok === false &&
        interruptedPut.code === 'interrupted-put' &&
        partialTmpState.exists === true &&
        partialFinalState.exists === false,
      atomicPublishModeled: latestBeforeMove.exists === false && latestMove.ok === true && latestGet.ok === true,
      duplicateReplaySafe: replayPut.ok === true && replayMove.ok === true && replayGet.etag === chromeHash,
      malformedRejected: malformed.code === 'malformed-remote-file',
      checksumMismatchRejected: checksumMismatch.code === 'checksum-mismatch',
      sequenceRegressionRejected: sequenceRegression.code === 'sequence-regression',
      peerMismatchRejected: peerMismatch.code === 'peer-mismatch',
      validEnvelopeAccepted: accepted.ok === true,
      pathContainment: tryEscape(sandboxRoot, '../escape.json') && tryEscape(sandboxRoot, path.join('..', path.basename(sandboxRoot) + '-sibling', 'escape.json')),
      noWritesOutsideSandbox: allFiles.every((file) => path.resolve(file).startsWith(rootResolved + path.sep)),
      noNetworkCalls: adapter.networkCalls === 0,
      noRemoteAccount: adapter.remoteAccountUsed === false,
      noCredentials: adapter.credentialsUsed === false,
      localFallbackActive: devDryRun.activeTransport === 'local-sync-folder-json',
      productSyncReady: false,
      latestHash,
      chromeHash,
    };
  } finally {
    fs.rmSync(sandboxRoot, { recursive: true, force: true });
  }
}

for (const file of [
  evidenceDoc,
  phase34Doc,
  phase34Validator,
  phase33Validator,
  phase32Validator,
  phase31Validator,
  phase30Validator,
  guardFile,
  folderSyncFile,
  folderImportFile,
]) {
  assert(exists(file), `${file}: missing`);
}

if (!exists(evidenceDoc) || !exists(guardFile)) {
  console.error('FAIL validate-labels-tags-categories-phase35-webdav-local-mock-adapter-proof');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

const evidence = read(evidenceDoc);
const flat = evidence.replace(/\s+/g, ' ');

for (const marker of [
  'Phase 34 Gate E adapter spec committed: `72a1b41`',
  'PROOF / VALIDATOR ONLY',
  'dev-only local/mock WebDAV adapter proof',
  DEV_FLAG,
  'No product WebDAV transport was enabled',
  'No external network call was made',
  'No real WebDAV account',
  'Local sync-folder JSON remains the active product transport',
  'Product metadata sync remains globally NOT READY',
  'Phase 35 Verdict',
]) {
  assert(flat.includes(marker), `${evidenceDoc}: missing marker ${marker}`);
}
for (const type of APPLIED_TYPES) assert(flat.includes(type), `${evidenceDoc}: missing applied type ${type}`);
for (const op of PROTOCOL_SURFACE) assert(flat.includes(op), `${evidenceDoc}: missing protocol proof item ${op}`);
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
const gatesSource = read(guardFile);
assert(gatesSource.includes('webdav-dev-only-do-not-ship'), 'Phase 30 gates must retain the dev-only flag');
assert(gatesSource.includes('disabled-by-default-proof-only'), 'Phase 30 gates must remain disabled-by-default proof-only');
for (const serverToken of ['createServer', '.listen(', 'fetch(', 'XMLHttpRequest', 'https.request', 'http.request']) {
  assert(!gatesSource.includes(serverToken), `product gates must not contain server/network token ${serverToken}`);
}

let proof = null;
try {
  const gates = runGuardModule();
  assert(gates.__installed === true, 'Phase 30 webdavTransportGates API must install');
  assert(gates.constants.DEV_ONLY_WRITE_FLAG === DEV_FLAG, 'dev-only flag must match Phase 30');
  assert(gates.constants.ACTIVE_TRANSPORT === 'local-sync-folder-json', 'active transport must remain local sync-folder JSON');
  assert(sameSet(gates.constants.APPLIED_TYPES, APPLIED_TYPES), 'Phase 30 API allowlist must remain exactly four');
  proof = runAdapterProof(gates);
} catch (error) {
  failures.push(`phase35 local/mock adapter proof failed: ${error && error.stack || error}`);
}

if (proof) {
  assert(proof.defaultBlocked === true, 'default WebDAV behavior must be blocked');
  assert(proof.missingFlagDryRunBlocked === true, 'dry-run must require the dev-only flag');
  assert(proof.missingFlagAdapterBlocked === true, 'local/mock adapter must require the dev-only flag');
  assert(proof.devFlagLocalMockOnly === true, 'dev flag must allow only local/mock proof behavior');
  assert(proof.initialPropfindMissing === true, 'PROPFIND must report missing final resource before publish');
  for (const op of ['PROPFIND', 'PUT', 'GET', 'MOVE']) {
    assert(proof.protocolSurface.includes(op), `local/mock proof did not exercise ${op}`);
  }
  assert(proof.latestPutOk === true, 'latest.json PUT must succeed');
  assert(proof.latestFinalAbsentBeforeMove === true, 'latest.json final must be absent before atomic MOVE');
  assert(proof.latestMoveOk === true, 'latest.json MOVE must succeed');
  assert(proof.latestByteUnchanged === true, 'latest.json must be byte-unchanged');
  assert(proof.chromePutOk === true, 'chrome-latest.json PUT must succeed');
  assert(proof.chromeMoveOk === true, 'chrome-latest.json MOVE must succeed');
  assert(proof.chromeByteUnchanged === true, 'chrome-latest.json must be byte-unchanged');
  assert(proof.preconditionFailureSafe === true, 'ETag/precondition failure must preserve final bytes');
  assert(proof.interruptedPutSafe === true, 'interrupted PUT must not publish final corrupted bytes');
  assert(proof.atomicPublishModeled === true, 'atomic publish via MOVE must be modeled');
  assert(proof.duplicateReplaySafe === true, 'duplicate/replay must be safe');
  assert(proof.malformedRejected === true, 'malformed remote file must be rejected');
  assert(proof.checksumMismatchRejected === true, 'checksum mismatch must be rejected');
  assert(proof.sequenceRegressionRejected === true, 'sequence regression must be rejected');
  assert(proof.peerMismatchRejected === true, 'peer mismatch must be rejected');
  assert(proof.validEnvelopeAccepted === true, 'valid proof envelope must be accepted');
  assert(proof.pathContainment === true, 'path containment must block sandbox escape');
  assert(proof.noWritesOutsideSandbox === true, 'proof must not write outside sandbox');
  assert(proof.noNetworkCalls === true, 'proof must not make network calls');
  assert(proof.noRemoteAccount === true, 'proof must not use a real remote account');
  assert(proof.noCredentials === true, 'proof must not use credentials');
  assert(proof.localFallbackActive === true, 'local sync-folder JSON fallback must remain active');
  assert(proof.productSyncReady === false, 'productSyncReady must remain false');
}

if (failures.length) {
  console.error('FAIL validate-labels-tags-categories-phase35-webdav-local-mock-adapter-proof');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(JSON.stringify({
  schema: 'h2o.studio.library-metadata.phase35-webdav-local-mock-adapter-proof.v1',
  phase: 'phase35-webdav-local-mock-adapter-proof',
  evidenceDoc,
  phase34CommitReferenced: '72a1b41',
  localMockAdapterOnly: true,
  defaultBlocked: proof.defaultBlocked,
  devOnlyFlagRequired: proof.missingFlagAdapterBlocked,
  protocolSurfaceExercised: proof.protocolSurface,
  latestByteUnchanged: proof.latestByteUnchanged,
  chromeLatestByteUnchanged: proof.chromeByteUnchanged,
  etagPreconditionSafe: proof.preconditionFailureSafe,
  interruptedPutSafe: proof.interruptedPutSafe,
  atomicMoveModeled: proof.atomicPublishModeled,
  failureCasesRejected: [
    'malformed-remote-file',
    'checksum-mismatch',
    'sequence-regression',
    'peer-mismatch',
  ],
  pathContainment: proof.pathContainment,
  noExternalNetwork: proof.noNetworkCalls,
  noRemoteAccount: proof.noRemoteAccount,
  noWritesOutsideSandbox: proof.noWritesOutsideSandbox,
  appliedAllowlistInSource: applied,
  webdavDeferredInSource: true,
  activeTransport: 'local-sync-folder-json',
  productSyncReady: false,
}, null, 2));
console.log('PASS validate-labels-tags-categories-phase35-webdav-local-mock-adapter-proof');
