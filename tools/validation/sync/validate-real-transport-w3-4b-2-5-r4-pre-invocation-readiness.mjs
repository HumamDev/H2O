#!/usr/bin/env node
//
// W3.4b-2.5-R4 final pre-invocation readiness validator.

import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const evidencePath = 'release-evidence/2026-07-12/real-transport-w3-4b-2-5-r4-pre-invocation-readiness.md';
const receiptEvidencePath = 'release-evidence/2026-07-12/real-transport-w3-4b-2-r4-write-grade-receipt.md';
const receiptCorePath = 'release-evidence/2026-07-12/real-transport-w3-4b-2-r4-write-grade-receipt-core.json';
const renewedApprovalPath = 'release-evidence/2026-07-12/real-transport-w3-4b-1-r2-renewed-operator-approval.md';
const r3aEvidencePath = 'release-evidence/2026-07-12/real-transport-w3-4b-3b-r3a-binding-mismatch-diagnostic.md';
const w34aValidatorPath = 'tools/validation/sync/validate-real-transport-w3-4a-refused-first-write-command-proof.mjs';
const rustPath = 'apps/studio/desktop/src-tauri/src/real_transport_capability_probe.rs';

const W34B1_R2_RENEWED_APPROVAL_COMMIT = '714f80a458808550dc8fd59ee937837349f416da';
const W34B3_R3A_DIAGNOSTIC_COMMIT = 'd57fefebe66537ecbeac9ecf9ba56cf02f1b21dd';
const W34B2_R4_COMMIT = '6e0f89f9e25baf15c7a254f8bc350d14df2eae98';
const RECEIPT_HASH = 'sha256:b18da77e97eb2ab339ea974db93b5fb51bd1a5b4a478d69fa2bc5d18084fd183';
const RENEWED_APPROVAL_HASH = 'sha256:e6c7df7a015f06807cb2dba7ae89f6dd085f33843a40a01c53ff2885b214b48b';
const WRITE_GRADE_REGISTRY_HASH = 'sha256:3222f11719c7bb17047cc3c6b6b01145d0748921792fb84fb5064c19541ee0ff';
const ONE_SHOT_TOKEN_HASH = 'sha256:a1deea9c2850e013f9c88f3b5554458f75c3c839742eba737b3a0e6055d440a1';
const KILL_SWITCH_TOKEN_HASH = 'sha256:5b1c98e62f0cff5de31e9ff81f47083033b3e5592669def7c7dadde3691cda09';
const PAYLOAD_HASH = 'sha256:67b110e21148b315e5fef1acfb1c2ff39d9acc204ce47578b138a7df33af6829';
const RENEWED_APPROVAL_EXPIRY_UTC = '2026-07-15T20:00:00Z';

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
    if (!entry.isFile() || !/h2o.*w3.*r4.*token.*\.json$/i.test(entry.name)) continue;
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
  assert.equal(matches.length, 1, 'expected exactly one matching R4 private token artifact');
  assert.ok(matches[0].owner, 'R4 private token artifact owner mismatch');
  assert.ok(matches[0].privatePermissions, 'R4 private token artifact permissions are not private');
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
  assert.equal(refHash, WRITE_GRADE_REGISTRY_HASH, 'app-local registry binding mismatch');
  const consumedMarker = path.join(
    path.dirname(registryPath),
    'first-write-consumed',
    `${RECEIPT_HASH.replace(/^sha256:/, '')}.json`,
  );
  assert.equal(fs.existsSync(consumedMarker), false, 'R4 receipt already has a consumed marker');
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

const evidence = read(evidencePath).toString('utf8');
const receiptEvidence = read(receiptEvidencePath).toString('utf8');
const receipt = JSON.parse(read(receiptCorePath).toString('utf8'));
const renewedApprovalBytes = read(renewedApprovalPath);
const r3aEvidence = read(r3aEvidencePath).toString('utf8');
const w34aValidator = read(w34aValidatorPath).toString('utf8');
const rust = read(rustPath).toString('utf8');
const flat = evidence.replace(/\s+/g, ' ');
const executorPayload = executorPayloadHashFromRust(rust);

assert.equal(sha256Ref(Buffer.from(JSON.stringify(sorted(receipt)))), RECEIPT_HASH, 'receipt core hash mismatch');
assert.equal(sha256Ref(renewedApprovalBytes), RENEWED_APPROVAL_HASH, 'renewed approval hash mismatch');
assert.equal(receipt.bindings.writeGradeRegistryRefHash, WRITE_GRADE_REGISTRY_HASH, 'registry hash binding mismatch');
assert.equal(receipt.bindings.oneShotTokenHash, ONE_SHOT_TOKEN_HASH, 'one-shot token hash mismatch');
assert.equal(receipt.bindings.killSwitchTokenHash, KILL_SWITCH_TOKEN_HASH, 'kill-switch token hash mismatch');
assert.equal(receipt.bindings.operatorApprovalArtifactHash, RENEWED_APPROVAL_HASH, 'receipt approval hash mismatch');
assert.equal(receipt.bindings.w34b1R2RenewedOperatorApprovalCommit, W34B1_R2_RENEWED_APPROVAL_COMMIT);
assert.equal(receipt.bindings.w34b3R3BindingMismatchDiagnosticCommit, W34B3_R3A_DIAGNOSTIC_COMMIT);
assert.equal(receipt.maxInvocations, 1);
assert.equal(receipt.requestBudget.createOnlyPutMax, 2);
assert.equal(receipt.requestBudget.readbackGetMax, 1);
assert.equal(receipt.requestBudget.otherMethods, 0);
assert.equal(receipt.sacrificialObject.payloadByteMax, 256);
assert.equal(receipt.sacrificialObject.payloadHash, PAYLOAD_HASH);
assert.equal(executorPayload.hash, PAYLOAD_HASH, 'payload hash must match executor deterministic sentinel hash');
assert.equal(executorPayload.byteLength, 36, 'executor sentinel byte length changed unexpectedly');

const validationUtc = /validationUtc: `([^`]+)`/.exec(evidence)?.[1];
const expiryUtc = /expiryUtc: `([^`]+)`/.exec(evidence)?.[1];
const renewedApprovalExpiryUtc = /renewedApprovalExpiryUtc: `([^`]+)`/.exec(evidence)?.[1];
assert.ok(validationUtc, 'missing validationUtc');
assert.ok(expiryUtc, 'missing expiryUtc');
assert.ok(renewedApprovalExpiryUtc, 'missing renewedApprovalExpiryUtc');
const validationTime = parseUtc(validationUtc);
const expiryTime = parseUtc(expiryUtc);
const renewedApprovalExpiryTime = parseUtc(renewedApprovalExpiryUtc);
assert.equal(expiryUtc, receipt.expiryUtc, 'evidence expiry must match receipt');
assert.equal(renewedApprovalExpiryUtc, RENEWED_APPROVAL_EXPIRY_UTC, 'renewed approval expiry mismatch');
assert.ok(expiryTime > validationTime, 'receipt was expired at recorded validation time');
assert.ok(expiryTime <= renewedApprovalExpiryTime, 'receipt expiry must be <= renewed approval expiry');
const currentExpired = Date.now() >= expiryTime;
if (currentExpired) {
  mustContain(evidence, 'currentTimeCaveat:', 'current-time caveat for post-expiry validation');
} else {
  mustContain(evidence, 'receiptNotExpiredAtValidation:true', 'receipt not expired at validation time');
}

for (const commit of [
  W34B1_R2_RENEWED_APPROVAL_COMMIT,
  W34B3_R3A_DIAGNOSTIC_COMMIT,
  W34B2_R4_COMMIT,
]) {
  assert.ok(commitExists(commit), `required commit missing: ${commit}`);
}

inspectPrivateTokens();
inspectAppLocalRegistry();

for (const token of [
  W34B1_R2_RENEWED_APPROVAL_COMMIT,
  W34B3_R3A_DIAGNOSTIC_COMMIT,
  W34B2_R4_COMMIT,
  RECEIPT_HASH,
  RENEWED_APPROVAL_HASH,
  WRITE_GRADE_REGISTRY_HASH,
  ONE_SHOT_TOKEN_HASH,
  KILL_SWITCH_TOKEN_HASH,
  PAYLOAD_HASH,
  'payloadHashMatchesExecutorDeterministicSentinel:true',
  'payloadByteLength:36',
  'registryPathSource: `app-local`',
  'writeGradeRegistryEligible:true',
  'credentialMaterialPresent:true',
  'tokenHashesPresent:true',
  'tokenPrivateMaterialPresent:true',
  'tokenPrivateMaterialPathClass: `out-of-repo-private-token-file`',
  'tokenPrivatePermissions:true',
  'tokenHashesMatchPrivateMaterial:true',
  'h2oRtFirstWriteExists:true',
  'defaultRefusalStillWorks:true',
  'defaultRefusalBlocker: `real-transport-w3-write-grade-approval-missing`',
  'consumedMarkerExists:false',
  'consumedMarkerPathClass: `app-local-first-write-consumed-marker`',
  'w34b3bR4RequiresExplicitOperatorGo:true',
  'liveInvocationPerformed:false',
  'h2oRtFirstWriteInvoked:false',
  'networkAttempted:false',
  'writesWebDAV:false',
  'productSyncReady:false',
  'transportReady:false',
]) {
  mustContain(flat, token, `evidence token ${token}`);
}

for (const token of [
  'liveInvocationPerformed:true',
  'h2oRtFirstWriteInvoked:true',
  'networkAttempted:true',
  'writesWebDAV:true',
  'tokenBurnOccurred:true',
  'productSyncReady:true',
  'transportReady:true',
  'W3.4b-3B-R4 can proceed automatically',
]) {
  mustNotContain(flat, token, `forbidden readiness claim ${token}`);
}

for (const token of [
  'h2o_rt_first_write',
  'real-transport-w3-write-grade-approval-missing',
  'loopbackOnly',
  'networkAttempted: false',
  'writesWebDAV: false',
]) {
  mustContain(w34aValidator, token, `W3.4a refusal validator ${token}`);
}

mustContain(r3aEvidence, 'remintR4Required:true', 'R3A remint decision');
mustContain(receiptEvidence, `receiptCoreHash: \`${RECEIPT_HASH}\``, 'W3.4b-2-R4 receipt evidence hash');
mustContain(receiptEvidence, 'receiptConsumed:false', 'W3.4b-2-R4 unconsumed receipt');
mustContain(receiptEvidence, 'receiptInvoked:false', 'W3.4b-2-R4 uninvoked receipt');
mustContain(receiptEvidence, 'payloadHashMatchesExecutorDeterministicSentinel:true', 'W3.4b-2-R4 payload binding');

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
}

console.log(JSON.stringify({
  ok: true,
  validator: 'validate-real-transport-w3-4b-2-5-r4-pre-invocation-readiness',
  evidencePath,
  receiptCoreHash: RECEIPT_HASH,
  expiryUtc,
  receiptNotExpiredAtValidation: true,
  currentTimeExpired: currentExpired,
  tokenPrivateMaterialPresent: true,
  tokenPermissionsPrivate: true,
  tokenHashesMatchPrivateMaterial: true,
  payloadHash: PAYLOAD_HASH,
  payloadHashMatchesExecutorDeterministicSentinel: true,
  registryPathSource: 'app-local',
  writeGradeRegistryEligible: true,
  credentialMaterialPresent: true,
  consumedMarkerExists: false,
  liveInvocationPerformed: false,
  writesWebDAV: false,
  productSyncReady: false,
  transportReady: false,
  w34b3bR4RequiresExplicitOperatorGo: true,
}, null, 2));
