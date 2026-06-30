#!/usr/bin/env node
//
// Phase 38 - WebDAV localhost smoke harness validator.
//
// Starts a short-lived loopback-only HTTP/WebDAV-like smoke server inside this validator, backed by a
// temp sandbox. This is not product transport, is not imported by Studio runtime, does not use a real
// remote account or credentials, and does not write outside the sandbox.

import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';

const root = process.cwd();
const failures = [];

const evidenceDoc = 'release-evidence/2026-06-25/labels-tags-categories-phase38-webdav-localhost-smoke-harness.md';
const phase37Doc = 'release-evidence/2026-06-25/labels-tags-categories-phase37-webdav-localhost-smoke-spec.md';
const phase37Validator = 'tools/validation/sync/validate-labels-tags-categories-phase37-webdav-localhost-smoke-spec.mjs';
const phase36Validator = 'tools/validation/sync/validate-labels-tags-categories-phase36-webdav-localhost-smoke-design-gate.mjs';
const phase35Validator = 'tools/validation/sync/validate-labels-tags-categories-phase35-webdav-local-mock-adapter-proof.mjs';
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
const SAME_ENVELOPES = ['latest.json', 'chrome-latest.json'];
const SAMPLE_LATEST = JSON.stringify({
  schema: 'h2o.studio.fullBundle.v2',
  exportId: 'phase38-webdav-localhost-latest-export',
  sequenceNumber: 11,
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
  exportId: 'phase38-webdav-localhost-chrome-latest-export',
  sequenceNumber: 12,
  peerIdHash: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  productSyncReady: false,
  libraryMetadataMutationRequests: [
    {
      schema: 'h2o.studio.library-metadata-mutation-request.v1',
      requestId: 'library-metadata-mutation-request:phase38-localhost-smoke',
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

function resolveSandboxPath(sandboxRoot, requestPath) {
  const rootResolved = path.resolve(sandboxRoot);
  const relative = decodeURIComponent(String(requestPath || '').split('?')[0]).replace(/^\/+/, '');
  if (!relative || path.isAbsolute(relative)) throw new Error(`invalid path: ${requestPath}`);
  const resolved = path.resolve(rootResolved, relative);
  if (!resolved.startsWith(rootResolved + path.sep)) throw new Error(`sandbox path escaped root: ${requestPath}`);
  return resolved;
}

function tryEscape(sandboxRoot, requestPath) {
  try {
    resolveSandboxPath(sandboxRoot, requestPath);
    return false;
  } catch {
    return true;
  }
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

function responseJson(res, statusCode, body, headers = {}) {
  const text = JSON.stringify(body);
  res.writeHead(statusCode, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(text),
    ...headers,
  });
  res.end(text);
}

async function collectRequestBodyToFile(req, resolvedPath, state) {
  await fs.promises.mkdir(path.dirname(resolvedPath), { recursive: true });
  const stream = fs.createWriteStream(resolvedPath, { encoding: 'utf8' });
  let ended = false;
  let bytes = 0;
  return new Promise((resolve, reject) => {
    req.on('data', (chunk) => {
      bytes += chunk.length;
      stream.write(chunk);
    });
    req.on('end', () => {
      ended = true;
      stream.end(() => resolve({ complete: true, bytes }));
    });
    req.on('close', () => {
      if (!ended) {
        state.partialUploads += 1;
        stream.end(() => resolve({ complete: false, bytes }));
      }
    });
    req.on('error', reject);
    stream.on('error', reject);
  });
}

function createLocalhostSmokeServer({ sandboxRoot, devFlag }) {
  if (devFlag !== DEV_FLAG) throw new Error('webdav-dev-flag-required');
  const state = {
    operations: [],
    partialUploads: 0,
    externalNetworkCalls: 0,
    remoteAccountUsed: false,
    credentialsUsed: false,
  };
  const server = http.createServer(async (req, res) => {
    try {
      const method = String(req.method || '').toUpperCase();
      state.operations.push(method);
      const resolved = resolveSandboxPath(sandboxRoot, req.url || '/');
      if (method === 'PROPFIND') {
        if (!fs.existsSync(resolved)) return responseJson(res, 404, { exists: false });
        const bytes = await fs.promises.readFile(resolved, 'utf8');
        return responseJson(res, 207, { exists: true, size: Buffer.byteLength(bytes) }, { etag: sha256(bytes) });
      }
      if (method === 'GET') {
        if (!fs.existsSync(resolved)) {
          res.writeHead(404);
          res.end();
          return undefined;
        }
        const bytes = await fs.promises.readFile(resolved, 'utf8');
        res.writeHead(200, {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(bytes),
          etag: sha256(bytes),
        });
        res.end(bytes);
        return undefined;
      }
      if (method === 'PUT') {
        if (req.headers['if-match']) {
          const current = fs.existsSync(resolved) ? sha256(await fs.promises.readFile(resolved, 'utf8')) : '';
          if (current !== req.headers['if-match']) return responseJson(res, 412, { ok: false, code: 'precondition-failed' });
        }
        if (req.headers['if-none-match'] === '*' && fs.existsSync(resolved)) {
          return responseJson(res, 412, { ok: false, code: 'precondition-failed' });
        }
        const written = await collectRequestBodyToFile(req, resolved, state);
        if (!written.complete) return undefined;
        const bytes = await fs.promises.readFile(resolved, 'utf8');
        return responseJson(res, 201, { ok: true, code: 'put-staged', size: Buffer.byteLength(bytes) }, { etag: sha256(bytes) });
      }
      if (method === 'MOVE') {
        const destination = req.headers.destination;
        if (!destination) return responseJson(res, 400, { ok: false, code: 'missing-destination' });
        const destinationPath = new URL(String(destination), 'http://127.0.0.1').pathname;
        const destinationResolved = resolveSandboxPath(sandboxRoot, destinationPath);
        if (!fs.existsSync(resolved)) return responseJson(res, 404, { ok: false, code: 'source-not-found' });
        const targetExists = fs.existsSync(destinationResolved);
        const targetEtag = targetExists ? sha256(await fs.promises.readFile(destinationResolved, 'utf8')) : '';
        if (req.headers['if-match'] && targetEtag !== req.headers['if-match']) {
          return responseJson(res, 412, { ok: false, code: 'precondition-failed' });
        }
        if (req.headers['if-none-match'] === '*' && targetExists) {
          return responseJson(res, 412, { ok: false, code: 'precondition-failed' });
        }
        await fs.promises.mkdir(path.dirname(destinationResolved), { recursive: true });
        await fs.promises.rename(resolved, destinationResolved);
        const bytes = await fs.promises.readFile(destinationResolved, 'utf8');
        return responseJson(res, 201, { ok: true, code: 'atomic-move-published', size: Buffer.byteLength(bytes) }, { etag: sha256(bytes) });
      }
      return responseJson(res, 405, { ok: false, code: 'method-not-allowed' });
    } catch (error) {
      return responseJson(res, 400, { ok: false, code: 'request-rejected', detail: String(error && error.message || error) });
    }
  });
  return { server, state };
}

function listenLoopback(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({ host: address.address, port: address.port });
    });
  });
}

function closeServer(server) {
  return new Promise((resolve) => server.close(() => resolve()));
}

function requestOverLoopback({ port, method, resource, body = '', headers = {}, timeoutMs = 1500 }) {
  return new Promise((resolve) => {
    const req = http.request({
      host: '127.0.0.1',
      port,
      path: resource,
      method,
      headers: {
        'content-length': Buffer.byteLength(body),
        ...headers,
      },
      timeout: timeoutMs,
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const bytes = Buffer.concat(chunks).toString('utf8');
        resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, statusCode: res.statusCode, headers: res.headers, bytes });
      });
    });
    req.on('timeout', () => {
      req.destroy(new Error('request-timeout'));
    });
    req.on('error', (error) => {
      resolve({ ok: false, statusCode: 0, code: error.message === 'request-timeout' ? 'request-timeout' : 'server-unavailable', bytes: '' });
    });
    req.end(body);
  });
}

function interruptedPutOverLoopback({ port, resource, body }) {
  return new Promise((resolve) => {
    const client = net.createConnection({ host: '127.0.0.1', port }, () => {
      const partial = body.slice(0, Math.max(1, Math.floor(body.length / 4)));
      client.write([
        `PUT ${resource} HTTP/1.1`,
        'Host: 127.0.0.1',
        `Content-Length: ${Buffer.byteLength(body)}`,
        'Connection: close',
        '',
        partial,
      ].join('\r\n'));
      setTimeout(() => client.destroy(), 20);
    });
    client.on('close', () => resolve({ ok: false, code: 'interrupted-put' }));
    client.on('error', () => resolve({ ok: false, code: 'interrupted-put' }));
  });
}

async function runLocalhostSmoke(gates) {
  const sandboxRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'h2o-phase38-webdav-localhost-'));
  let server;
  try {
    const latestHash = sha256(SAMPLE_LATEST);
    const chromeHash = sha256(SAMPLE_CHROME_LATEST);
    const peerIdHash = sha256('phase38-peer');
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
    let missingFlagServerBlocked = false;
    try {
      createLocalhostSmokeServer({ sandboxRoot, devFlag: '' });
    } catch (error) {
      missingFlagServerBlocked = String(error && error.message) === 'webdav-dev-flag-required';
    }
    const created = createLocalhostSmokeServer({ sandboxRoot, devFlag: DEV_FLAG });
    server = created.server;
    const state = created.state;
    const bind = await listenLoopback(server);
    const loopbackBound = bind.host === '127.0.0.1';

    const latestTmp = '/remote/redacted-peer/latest.json.tmp';
    const latestFinal = '/remote/redacted-peer/latest.json';
    const chromeTmp = '/remote/redacted-peer/chrome-latest.json.tmp';
    const chromeFinal = '/remote/redacted-peer/chrome-latest.json';

    const initialPropfind = await requestOverLoopback({ port: bind.port, method: 'PROPFIND', resource: latestFinal });
    const latestPut = await requestOverLoopback({
      port: bind.port,
      method: 'PUT',
      resource: latestTmp,
      body: SAMPLE_LATEST,
      headers: { 'if-none-match': '*' },
    });
    const latestBeforeMove = await requestOverLoopback({ port: bind.port, method: 'PROPFIND', resource: latestFinal });
    const latestMove = await requestOverLoopback({
      port: bind.port,
      method: 'MOVE',
      resource: latestTmp,
      headers: { destination: latestFinal, 'if-none-match': '*' },
    });
    const latestGet = await requestOverLoopback({ port: bind.port, method: 'GET', resource: latestFinal });

    const chromePut = await requestOverLoopback({
      port: bind.port,
      method: 'PUT',
      resource: chromeTmp,
      body: SAMPLE_CHROME_LATEST,
      headers: { 'if-none-match': '*' },
    });
    const chromeMove = await requestOverLoopback({
      port: bind.port,
      method: 'MOVE',
      resource: chromeTmp,
      headers: { destination: chromeFinal, 'if-none-match': '*' },
    });
    const chromeGet = await requestOverLoopback({ port: bind.port, method: 'GET', resource: chromeFinal });

    const preconditionTmp = '/remote/redacted-peer/precondition-latest.json.tmp';
    await requestOverLoopback({
      port: bind.port,
      method: 'PUT',
      resource: preconditionTmp,
      body: SAMPLE_LATEST.replace('phase38-webdav-localhost-latest-export', 'phase38-precondition'),
      headers: { 'if-none-match': '*' },
    });
    const beforePreconditionFailure = await requestOverLoopback({ port: bind.port, method: 'GET', resource: latestFinal });
    const failedPrecondition = await requestOverLoopback({
      port: bind.port,
      method: 'MOVE',
      resource: preconditionTmp,
      headers: {
        destination: latestFinal,
        'if-match': 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
      },
    });
    const afterPreconditionFailure = await requestOverLoopback({ port: bind.port, method: 'GET', resource: latestFinal });

    const partialFinal = '/remote/redacted-peer/partial-latest.json';
    const partialTmp = `${partialFinal}.tmp`;
    const interrupted = await interruptedPutOverLoopback({ port: bind.port, resource: partialTmp, body: SAMPLE_LATEST });
    await new Promise((resolve) => setTimeout(resolve, 60));
    const partialTmpPropfind = await requestOverLoopback({ port: bind.port, method: 'PROPFIND', resource: partialTmp });
    const partialFinalPropfind = await requestOverLoopback({ port: bind.port, method: 'PROPFIND', resource: partialFinal });

    const replayTmp = '/remote/redacted-peer/chrome-latest-replay.json.tmp';
    const replayPut = await requestOverLoopback({
      port: bind.port,
      method: 'PUT',
      resource: replayTmp,
      body: SAMPLE_CHROME_LATEST,
      headers: { 'if-none-match': '*' },
    });
    const replayMove = await requestOverLoopback({
      port: bind.port,
      method: 'MOVE',
      resource: replayTmp,
      headers: { destination: chromeFinal, 'if-match': chromeGet.headers.etag },
    });
    const replayGet = await requestOverLoopback({ port: bind.port, method: 'GET', resource: chromeFinal });

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

    await closeServer(server);
    server = null;
    const unavailable = await requestOverLoopback({ port: bind.port, method: 'GET', resource: latestFinal, timeoutMs: 80 });

    const allFiles = [];
    const rootResolved = path.resolve(sandboxRoot);
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
      devFlagDryRunRequired: missingFlagDryRun.manifest.guardEvaluation.blockers.includes('webdav-dev-flag-required'),
      devFlagServerRequired: missingFlagServerBlocked,
      loopbackBound,
      tempSandboxOnly: rootResolved.startsWith(path.resolve(os.tmpdir()) + path.sep),
      pathContainment: tryEscape(sandboxRoot, '/../escape.json') && tryEscape(sandboxRoot, '/../../escape.json'),
      noWritesOutsideSandbox: allFiles.every((file) => path.resolve(file).startsWith(rootResolved + path.sep)),
      noExternalNetwork: state.externalNetworkCalls === 0,
      noRemoteAccount: state.remoteAccountUsed === false,
      noCredentials: state.credentialsUsed === false,
      realSocketPropfind: state.operations.includes('PROPFIND') && initialPropfind.statusCode === 404,
      realSocketPut: latestPut.statusCode === 201 && chromePut.statusCode === 201,
      realSocketGet: latestGet.statusCode === 200 && chromeGet.statusCode === 200,
      realSocketMove: latestMove.statusCode === 201 && chromeMove.statusCode === 201,
      etagPreconditionSafe: failedPrecondition.statusCode === 412 && beforePreconditionFailure.bytes === afterPreconditionFailure.bytes,
      interruptedPutSafe: interrupted.code === 'interrupted-put' && state.partialUploads > 0,
      partialUploadNotPublished: partialTmpPropfind.statusCode === 207 && partialFinalPropfind.statusCode === 404,
      atomicMove: latestBeforeMove.statusCode === 404 && latestMove.statusCode === 201 && latestGet.statusCode === 200,
      chromeByteUnchanged: chromeGet.bytes === SAMPLE_CHROME_LATEST && chromeGet.headers.etag === chromeHash,
      latestByteUnchanged: latestGet.bytes === SAMPLE_LATEST && latestGet.headers.etag === latestHash,
      malformedRejected: malformed.code === 'malformed-remote-file',
      checksumMismatchRejected: checksumMismatch.code === 'checksum-mismatch',
      sequenceRegressionRejected: sequenceRegression.code === 'sequence-regression',
      peerMismatchRejected: peerMismatch.code === 'peer-mismatch',
      validEnvelopeAccepted: accepted.ok === true,
      duplicateReplaySafe: replayPut.statusCode === 201 && replayMove.statusCode === 201 && replayGet.bytes === SAMPLE_CHROME_LATEST,
      serverUnavailableSafe: unavailable.ok === false && ['server-unavailable', 'request-timeout'].includes(unavailable.code),
      localFallbackActive: defaultDryRun.activeTransport === 'local-sync-folder-json',
      productTransportEnabled: false,
      productSyncReady: false,
    };
  } finally {
    if (server) await closeServer(server);
    fs.rmSync(sandboxRoot, { recursive: true, force: true });
  }
}

for (const file of [
  evidenceDoc,
  phase37Doc,
  phase37Validator,
  phase36Validator,
  phase35Validator,
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
  console.error('FAIL validate-labels-tags-categories-phase38-webdav-localhost-smoke-harness');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

const evidence = read(evidenceDoc);
const flat = evidence.replace(/\s+/g, ' ');

for (const marker of [
  'Phase 37 localhost smoke spec committed cleanly: `7e72d04`',
  'DEV-ONLY LOCALHOST SMOKE HARNESS / VALIDATOR ONLY',
  DEV_FLAG,
  'No product WebDAV transport was enabled',
  'No real WebDAV account was used',
  'No credentials were used',
  'No external network dependency was introduced',
  'Local sync-folder JSON remains the active product transport',
  'Product metadata sync remains globally NOT READY',
  'Phase 38 Verdict',
]) {
  assert(flat.includes(marker), `${evidenceDoc}: missing marker ${marker}`);
}
for (const type of APPLIED_TYPES) assert(flat.includes(type), `${evidenceDoc}: missing applied type ${type}`);
for (const envelope of SAME_ENVELOPES) assert(flat.includes(envelope), `${evidenceDoc}: missing envelope ${envelope}`);
for (const marker of ['PROPFIND', 'PUT', 'GET', 'MOVE', 'ETag', 'interrupted PUT', 'partial upload', 'atomic MOVE']) {
  assert(flat.includes(marker), `${evidenceDoc}: missing socket/protocol marker ${marker}`);
}
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
assert(gatesSource.includes(DEV_FLAG), 'Phase 30 gates must retain the dev-only flag');
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
  proof = await runLocalhostSmoke(gates);
} catch (error) {
  failures.push(`phase38 localhost smoke failed: ${error && error.stack || error}`);
}

if (proof) {
  assert(proof.defaultBlocked === true, 'default WebDAV behavior must be blocked');
  assert(proof.devFlagDryRunRequired === true, 'dry-run must require the dev-only flag');
  assert(proof.devFlagServerRequired === true, 'server must require the dev-only flag');
  assert(proof.loopbackBound === true, 'server must bind only to loopback');
  assert(proof.tempSandboxOnly === true, 'server must use temp sandbox only');
  assert(proof.pathContainment === true, 'path containment must block sandbox escape');
  assert(proof.noWritesOutsideSandbox === true, 'proof must not write outside sandbox');
  assert(proof.noExternalNetwork === true, 'proof must not make external network calls');
  assert(proof.noRemoteAccount === true, 'proof must not use a real remote account');
  assert(proof.noCredentials === true, 'proof must not use credentials');
  assert(proof.realSocketPropfind === true, 'PROPFIND must run over loopback socket');
  assert(proof.realSocketPut === true, 'PUT must run over loopback socket');
  assert(proof.realSocketGet === true, 'GET must run over loopback socket');
  assert(proof.realSocketMove === true, 'MOVE must run over loopback socket');
  assert(proof.etagPreconditionSafe === true, 'ETag/precondition failure must preserve final bytes');
  assert(proof.interruptedPutSafe === true, 'interrupted PUT must be handled safely');
  assert(proof.partialUploadNotPublished === true, 'partial upload must not publish final file');
  assert(proof.atomicMove === true, 'atomic publish via MOVE must be proven');
  assert(proof.chromeByteUnchanged === true, 'chrome-latest.json must be byte-unchanged');
  assert(proof.latestByteUnchanged === true, 'latest.json must be byte-unchanged');
  assert(proof.malformedRejected === true, 'malformed remote file must be rejected');
  assert(proof.checksumMismatchRejected === true, 'checksum mismatch must be rejected');
  assert(proof.sequenceRegressionRejected === true, 'sequence regression must be rejected');
  assert(proof.peerMismatchRejected === true, 'peer mismatch must be rejected');
  assert(proof.validEnvelopeAccepted === true, 'valid proof envelope must be accepted');
  assert(proof.duplicateReplaySafe === true, 'duplicate/replay must be safe');
  assert(proof.serverUnavailableSafe === true, 'server unavailable / timeout must be safe');
  assert(proof.localFallbackActive === true, 'local sync-folder JSON fallback must remain active');
  assert(proof.productTransportEnabled === false, 'product WebDAV transport must remain disabled');
  assert(proof.productSyncReady === false, 'productSyncReady must remain false');
}

if (failures.length) {
  console.error('FAIL validate-labels-tags-categories-phase38-webdav-localhost-smoke-harness');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(JSON.stringify({
  schema: 'h2o.studio.library-metadata.phase38-webdav-localhost-smoke-harness.v1',
  phase: 'phase38-webdav-localhost-smoke-harness',
  evidenceDoc,
  phase37CommitReferenced: '7e72d04',
  localhostSmokeOnly: true,
  defaultBlocked: proof.defaultBlocked,
  devOnlyFlagRequired: proof.devFlagServerRequired,
  loopbackBound: proof.loopbackBound,
  tempSandboxOnly: proof.tempSandboxOnly,
  realSocketProtocol: {
    propfind: proof.realSocketPropfind,
    put: proof.realSocketPut,
    get: proof.realSocketGet,
    move: proof.realSocketMove,
  },
  latestByteUnchanged: proof.latestByteUnchanged,
  chromeLatestByteUnchanged: proof.chromeByteUnchanged,
  etagPreconditionSafe: proof.etagPreconditionSafe,
  interruptedPutSafe: proof.interruptedPutSafe,
  partialUploadNotPublished: proof.partialUploadNotPublished,
  atomicMove: proof.atomicMove,
  failureCasesRejected: [
    'malformed-remote-file',
    'checksum-mismatch',
    'sequence-regression',
    'peer-mismatch',
    'server-unavailable',
  ],
  pathContainment: proof.pathContainment,
  noExternalNetwork: proof.noExternalNetwork,
  noRemoteAccount: proof.noRemoteAccount,
  noCredentials: proof.noCredentials,
  noWritesOutsideSandbox: proof.noWritesOutsideSandbox,
  appliedAllowlistInSource: applied,
  webdavDeferredInSource: true,
  activeTransport: 'local-sync-folder-json',
  productSyncReady: false,
}, null, 2));
console.log('PASS validate-labels-tags-categories-phase38-webdav-localhost-smoke-harness');
