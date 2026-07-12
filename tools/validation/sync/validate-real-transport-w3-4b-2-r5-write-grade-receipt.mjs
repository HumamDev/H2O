#!/usr/bin/env node
//
// W3.4b-2-R5 parent-PROPFIND-fix write-grade receipt validator.

import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const evidencePath = 'release-evidence/2026-07-12/real-transport-w3-4b-2-r5-write-grade-receipt.md';
const receiptPath = 'release-evidence/2026-07-12/real-transport-w3-4b-2-r5-write-grade-receipt-core.json';
const renewedApprovalPath = 'release-evidence/2026-07-12/real-transport-w3-4b-1-r2-renewed-operator-approval.md';
const w35aEvidencePath = 'release-evidence/2026-07-12/real-transport-w3-5a-fail-closed-no-write-closeout.md';
const w35bEvidencePath = 'release-evidence/2026-07-12/real-transport-w3-5b-propfind-401-diagnostic.md';
const rustPath = 'apps/studio/desktop/src-tauri/src/real_transport_capability_probe.rs';

const EXPECTED_RECEIPT_HASH = 'sha256:b27b6eb6ed238c15d9b687a85d2d8b98e9db4434a7c6b1d30df26e96aaddca57';
const EXPECTED_RENEWED_APPROVAL_HASH = 'sha256:e6c7df7a015f06807cb2dba7ae89f6dd085f33843a40a01c53ff2885b214b48b';
const EXPECTED_WRITE_GRADE_REGISTRY_HASH = 'sha256:3222f11719c7bb17047cc3c6b6b01145d0748921792fb84fb5064c19541ee0ff';
const RENEWED_APPROVAL_EXPIRY_UTC = '2026-07-15T20:00:00Z';
const OLD_EXPIRED_WINDOW_UTC = '2026-07-10T16:00:00Z';
const ONE_SHOT_TOKEN_HASH = 'sha256:4e6056552d5d6afc7ac1bc89624957ef324eb64b353bae6b64942174d74785d4';
const KILL_SWITCH_TOKEN_HASH = 'sha256:0ee62ecc6a594c752942702197d79fe49fa35ec5b3363551d7648f0c15aae02e';
const W34B1_R2_RENEWED_APPROVAL_COMMIT = '714f80a458808550dc8fd59ee937837349f416da';
const W34B3_R4_NO_WRITE_CLOSEOUT_COMMIT = 'f08f9b0f750e6d863a32c5de8f1edbe97955d0c1';
const W35B_PARENT_PROPFIND_FIX_COMMIT = '305ff023ad12f14b6a9b505dab4123cf44c7cfba';

const COMMITS = [
  '7862270237955b86d48d943263fd53947cc71f72',
  '70e7fcc9669b939b505de96a7bb0ec61509c3370',
  '649849e7e48c7e5bc5924bc811d857f2435866ae',
  '671fdc1c855b345185e5ea257b206c0a07cdab36',
  '388a952745ab7a21ba9556531eccf5c7e0ffe1ce',
  'aba4c70068d95ee373d157fddea06bfb31b505b0',
  'a830ccb6b633a9d6cee35e6db92464e870d5693d',
  'd196f4b26d904394c435c15dd14d12cd18f03190',
  W34B1_R2_RENEWED_APPROVAL_COMMIT,
  W34B3_R4_NO_WRITE_CLOSEOUT_COMMIT,
  W35B_PARENT_PROPFIND_FIX_COMMIT,
];

function read(rel) {
  const abs = path.join(root, rel);
  assert.ok(fs.existsSync(abs), `missing ${rel}`);
  return fs.readFileSync(abs);
}

function sha256Ref(bytes) {
  return `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
}

function sorted(value) {
  if (Array.isArray(value)) return value.map(sorted);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sorted(value[key])]));
  }
  return value;
}

function mustContain(source, token, label) {
  assert.ok(String(source).includes(token), `${label}: missing ${token}`);
}

function mustNotContain(source, token, label) {
  assert.ok(!String(source).includes(token), `${label}: forbidden ${token}`);
}

function parseUtc(value) {
  assert.match(value, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/, `invalid UTC timestamp ${value}`);
  return Date.parse(value);
}

function commitExists(commit) {
  try {
    childProcess.execFileSync('git', ['cat-file', '-e', `${commit}^{commit}`], {
      cwd: root,
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

function executorPayloadHashFromRust(rustSource) {
  const match = /const FIRST_WRITE_DETERMINISTIC_SENTINEL_PAYLOAD: &str =\s*"([^"]+)";/m.exec(rustSource);
  assert.ok(match, 'missing deterministic sentinel payload constant');
  const bytes = Buffer.from(match[1], 'utf8');
  return {
    byteLength: bytes.length,
    hash: sha256Ref(bytes),
  };
}

function collectStringHashes(value, output = new Set()) {
  if (typeof value === 'string') output.add(sha256Ref(Buffer.from(value)));
  else if (Array.isArray(value)) value.forEach((item) => collectStringHashes(item, output));
  else if (value && typeof value === 'object') {
    Object.values(value).forEach((item) => collectStringHashes(item, output));
  }
  return output;
}

function inspectPrivateTokens() {
  const tempRoot = fs.realpathSync(path.resolve('/tmp'));
  const expected = new Set([ONE_SHOT_TOKEN_HASH, KILL_SWITCH_TOKEN_HASH]);
  const matches = [];
  for (const entry of fs.readdirSync(tempRoot, { withFileTypes: true })) {
    if (!entry.isFile() || !/h2o.*w3.*r5.*token.*\.json$/i.test(entry.name)) continue;
    const candidatePath = path.join(tempRoot, entry.name);
    let candidate;
    try {
      candidate = JSON.parse(fs.readFileSync(candidatePath, 'utf8'));
    } catch {
      continue;
    }
    const hashes = collectStringHashes(candidate);
    if ([...expected].every((hash) => hashes.has(hash))) {
      const stat = fs.statSync(candidatePath);
      matches.push({
        owner: typeof process.getuid === 'function' && stat.uid === process.getuid(),
        privatePermissions: (stat.mode & 0o077) === 0,
      });
    }
  }
  assert.equal(matches.length, 1, 'expected exactly one matching R5 private token artifact');
  assert.ok(matches[0].owner, 'R5 private token artifact owner mismatch');
  assert.ok(matches[0].privatePermissions, 'R5 private token artifact permissions are not private');
}

function inspectAppLocalRegistry() {
  const registryPath = path.join(
    os.homedir(),
    'Library',
    'Application Support',
    'H2O Studio',
    'real-transport',
    'h2o-real-transport-w3-live-descriptor-registry.json',
  );
  assert.ok(fs.existsSync(registryPath), 'app-local descriptor registry missing');
  const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  const stat = fs.statSync(registryPath);
  const parentStat = fs.statSync(path.dirname(registryPath));
  assert.ok(typeof process.getuid === 'function' && stat.uid === process.getuid(), 'registry owner mismatch');
  assert.ok((stat.mode & 0o077) === 0, 'registry permissions are not private');
  assert.ok(parentStat.uid === process.getuid(), 'registry parent owner mismatch');
  assert.ok((parentStat.mode & 0o022) === 0, 'registry parent permissions are not private');
  for (const field of ['endpointUrlPrivate', 'remoteRootPathPrivate', 'authHeaderPrivate']) {
    assert.ok(typeof registry[field] === 'string' && registry[field].trim(), `registry private field missing: ${field}`);
  }
  const publicRef = {
    credentialRefHash: registry.credentialRefHash,
    descriptorMode: 'hash-only-redacted',
    endpointRefHash: registry.endpointRefHash,
    hashBoundary: 'descriptor-refs-only-excludes-private-material',
    remoteRootRefHash: registry.remoteRootRefHash,
    schema: 'h2o.studio.transport.write-grade-registry-public-ref.v1',
  };
  const refHash = sha256Ref(Buffer.from(JSON.stringify(sorted(publicRef))));
  assert.equal(registry.descriptorMode, 'hash-only-redacted', 'registry is not write-grade eligible');
  assert.equal(refHash, EXPECTED_WRITE_GRADE_REGISTRY_HASH, 'app-local registry binding mismatch');
}

const evidence = read(evidencePath).toString('utf8');
const renewedApprovalBytes = read(renewedApprovalPath);
const w35aEvidence = read(w35aEvidencePath).toString('utf8');
const w35bEvidence = read(w35bEvidencePath).toString('utf8');
const rust = read(rustPath).toString('utf8');
const receipt = JSON.parse(read(receiptPath).toString('utf8'));
const flatEvidence = evidence.replace(/\s+/g, ' ');
const receiptJson = JSON.stringify(receipt);
const executorPayload = executorPayloadHashFromRust(rust);

assert.equal(sha256Ref(renewedApprovalBytes), EXPECTED_RENEWED_APPROVAL_HASH, 'renewed approval artifact hash mismatch');
const receiptHash = sha256Ref(Buffer.from(JSON.stringify(sorted(receipt))));
assert.equal(receiptHash, EXPECTED_RECEIPT_HASH, 'receipt canonical hash mismatch');

for (const commit of COMMITS) {
  assert.ok(commitExists(commit), `required commit missing: ${commit}`);
  mustContain(evidence, commit, `evidence anchor ${commit}`);
  mustContain(receiptJson, commit, `receipt anchor ${commit}`);
}

mustContain(w35aEvidence, 'r4ReceiptReusable:false', 'W3.5A R4 reusable decision');
mustContain(w35aEvidence, 'writesWebDAV:false', 'W3.5A no-write closeout');
mustContain(w35bEvidence, 'liveExecutorFix: `PROPFIND pre-write parent readiness check`', 'W3.5B parent-PROPFIND fix');
mustContain(rust, 'fn build_parent_collection_url', 'Rust parent collection helper');
mustContain(rust, 'PROPFIND pre-write parent readiness check', 'Rust parent readiness operation');
mustContain(rust, 'const FIRST_WRITE_DETERMINISTIC_SENTINEL_PAYLOAD', 'Rust deterministic payload constant');

assert.equal(receipt.schema, 'h2o.sync.real-transport.write-grade-receipt.v1');
assert.equal(receipt.receiptGrade, 'write-grade');
assert.equal(receipt.operationKind, 'first-sacrificial-probe-write');
assert.equal(receipt.payloadKind, 'capability-probe-object');
assert.equal(receipt.payloadCount, 1);
assert.equal(receipt.maxInvocations, 1);
assert.equal(receipt.canonicalization, 'json-sorted-keys-v1');
assert.equal(receipt.requestBudget.createOnlyPutMax, 2);
assert.equal(receipt.requestBudget.readbackGetMax, 1);
assert.equal(receipt.requestBudget.otherMethods, 0);
assert.equal(receipt.sacrificialObject.payloadByteMax, 256);
assert.equal(receipt.sacrificialObject.payloadHash, executorPayload.hash, 'receipt payload hash must match executor sentinel hash');
assert.equal(executorPayload.byteLength, 36, 'executor sentinel byte length changed unexpectedly');
assert.equal(receipt.bindings.operatorApprovalArtifactHash, EXPECTED_RENEWED_APPROVAL_HASH);
assert.equal(receipt.bindings.w34b1R2RenewedOperatorApprovalCommit, W34B1_R2_RENEWED_APPROVAL_COMMIT);
assert.equal(receipt.bindings.w34b3R4NoWriteCloseoutCommit, W34B3_R4_NO_WRITE_CLOSEOUT_COMMIT);
assert.equal(receipt.bindings.w35bParentPropfindFixCommit, W35B_PARENT_PROPFIND_FIX_COMMIT);
assert.equal(receipt.bindings.oneShotTokenHash, ONE_SHOT_TOKEN_HASH);
assert.equal(receipt.bindings.killSwitchTokenHash, KILL_SWITCH_TOKEN_HASH);
assert.notEqual(receipt.bindings.oneShotTokenHash, receipt.bindings.killSwitchTokenHash);
assert.equal(receipt.bindings.writeGradeRegistryRefHash, EXPECTED_WRITE_GRADE_REGISTRY_HASH);
assert.equal(receipt.bindings.writeGradeRegistryHashBoundary, 'descriptor-refs-only-excludes-private-material');

const mint = parseUtc(receipt.mintUtc);
const expiry = parseUtc(receipt.expiryUtc);
const renewedApprovalExpiry = parseUtc(RENEWED_APPROVAL_EXPIRY_UTC);
assert.ok(expiry > mint, 'receipt expiry must be after mint');
assert.ok(expiry - mint <= 72 * 60 * 60 * 1000, 'receipt expiry must be <=72h from mint');
assert.ok(expiry <= renewedApprovalExpiry, 'receipt expiry must be <= renewed approval expiry');
assert.notEqual(receipt.expiryUtc, OLD_EXPIRED_WINDOW_UTC, 'old expired window must not be reused');

inspectPrivateTokens();
inspectAppLocalRegistry();

for (const token of [
  `receiptCoreHash: \`${EXPECTED_RECEIPT_HASH}\``,
  `renewedApprovalArtifactHash: \`${EXPECTED_RENEWED_APPROVAL_HASH}\``,
  `writeGradeRegistryRefHash: \`${EXPECTED_WRITE_GRADE_REGISTRY_HASH}\``,
  `oneShotTokenHash: \`${ONE_SHOT_TOKEN_HASH}\``,
  `killSwitchTokenHash: \`${KILL_SWITCH_TOKEN_HASH}\``,
  `executorDeterministicSentinelPayloadHash: \`${executorPayload.hash}\``,
  'payloadHashMatchesExecutorDeterministicSentinel:true',
  'payloadByteLength:36',
  'r4ReceiptReusable:false',
  'r4ReceiptCannotBeRetried:true',
  'schema: `h2o.sync.real-transport.write-grade-receipt.v1`',
  'receiptGrade: `write-grade`',
  'registryPathSource: `app-local`',
  'writeGradeRegistryEligible:true',
  'credentialMaterialPresent:true',
  'privateTokenMaterialPresent:true',
  'tokenPermissionsPrivate:true',
  'tokenHashesMatchPrivateMaterial:true',
  'receiptConsumed:false',
  'receiptInvoked:false',
  'liveInvocationPerformed:false',
  'h2oRtFirstWriteInvoked:false',
  'networkAttempted:false',
  'writesWebDAV:false',
  'productSyncReady:false',
  'transportReady:false',
  'privateTokenPathClass: `out-of-repo-private-token-file`',
  'rawOneShotTokenCommitted:false',
  'rawKillSwitchTokenCommitted:false',
  'defaultPrivateLegacyWriteGradeEligible:false',
]) {
  mustContain(flatEvidence, token, `evidence token ${token}`);
}

for (const token of [
  'liveInvocationPerformed:true',
  'h2oRtFirstWriteInvoked:true',
  'receiptConsumed:true',
  'receiptInvoked:true',
  'networkAttempted:true',
  'writesWebDAV:true',
  'productSyncReady:true',
  'transportReady:true',
  'rawOneShotTokenCommitted:true',
  'rawKillSwitchTokenCommitted:true',
  `expiryUtc: \`${OLD_EXPIRED_WINDOW_UTC}\``,
]) {
  mustNotContain(flatEvidence, token, `forbidden claim ${token}`);
}

for (const [pattern, label] of [
  [/https?:\/\//i, 'raw URL literal'],
  [/\/private\/tmp/i, 'raw private token path'],
  [/\boneShotToken\s*[:=]/i, 'raw one-shot token key'],
  [/\bkillSwitchToken\s*[:=]/i, 'raw kill-switch token key'],
  [/\bpassword\s*[:=]/i, 'raw password key'],
  [/\bcredentialSecret\s*[:=]/i, 'raw credential secret key'],
  [/\bauthHeader\s*[:=]/i, 'raw auth header key'],
  [/\brawEndpoint\s*[:=]/i, 'raw endpoint key'],
  [/\brawPath\s*[:=]/i, 'raw path key'],
  [/\bresponseBody\s*[:=]/i, 'response body key'],
  [/\bprivateRegistryContents\s*[:=]/i, 'private registry key'],
]) {
  assert.ok(!pattern.test(evidence), `evidence: ${label} found`);
  assert.ok(!pattern.test(receiptJson), `receipt: ${label} found`);
}

console.log(JSON.stringify({
  ok: true,
  validator: 'validate-real-transport-w3-4b-2-r5-write-grade-receipt',
  evidencePath,
  receiptPath,
  receiptHash,
  mintUtc: receipt.mintUtc,
  expiryUtc: receipt.expiryUtc,
  renewedApprovalExpiryUtc: RENEWED_APPROVAL_EXPIRY_UTC,
  registryPathSource: 'app-local',
  writeGradeRegistryEligible: true,
  payloadHash: receipt.sacrificialObject.payloadHash,
  payloadHashMatchesExecutorDeterministicSentinel: true,
  payloadByteLength: executorPayload.byteLength,
  privateTokenMaterialPresent: true,
  tokenPermissionsPrivate: true,
  tokenHashesMatchPrivateMaterial: true,
  receiptConsumed: false,
  receiptInvoked: false,
  liveInvocationPerformed: false,
  writesWebDAV: false,
  productSyncReady: false,
  transportReady: false,
}, null, 2));
