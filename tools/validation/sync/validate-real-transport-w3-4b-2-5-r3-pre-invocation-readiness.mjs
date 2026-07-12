#!/usr/bin/env node
//
// W3.4b-2.5-R3 final pre-invocation readiness validator.

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const evidencePath = 'release-evidence/2026-07-12/real-transport-w3-4b-2-5-r3-pre-invocation-readiness.md';
const receiptEvidencePath = 'release-evidence/2026-07-12/real-transport-w3-4b-2-r3-write-grade-receipt.md';
const receiptCorePath = 'release-evidence/2026-07-12/real-transport-w3-4b-2-r3-write-grade-receipt-core.json';
const renewedApprovalPath = 'release-evidence/2026-07-12/real-transport-w3-4b-1-r2-renewed-operator-approval.md';
const w34aValidatorPath = 'tools/validation/sync/validate-real-transport-w3-4a-refused-first-write-command-proof.mjs';

const W34B1_R2_RENEWED_APPROVAL_COMMIT = '714f80a458808550dc8fd59ee937837349f416da';
const W34B2_R3_COMMIT = '8c3422965c1202099c7177d4e63c53cf2b72a422';
const RECEIPT_HASH = 'sha256:b34cd56a9d5a16fe3dc5319b174522f2c7634ad17717405310c18cec0188e1cd';
const RENEWED_APPROVAL_HASH = 'sha256:e6c7df7a015f06807cb2dba7ae89f6dd085f33843a40a01c53ff2885b214b48b';
const WRITE_GRADE_REGISTRY_HASH = 'sha256:3222f11719c7bb17047cc3c6b6b01145d0748921792fb84fb5064c19541ee0ff';
const ONE_SHOT_TOKEN_HASH = 'sha256:5c5b803c2612b94e0e6ceca999ebd1198eb4d2caff39909591aceaa74b1f3631';
const KILL_SWITCH_TOKEN_HASH = 'sha256:5cfb8c26eb9e5c14b05e140c708d1b9ac90df15714f8f51aea5f3307c491847a';
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

const evidence = read(evidencePath).toString('utf8');
const receiptEvidence = read(receiptEvidencePath).toString('utf8');
const receipt = JSON.parse(read(receiptCorePath).toString('utf8'));
const renewedApprovalBytes = read(renewedApprovalPath);
const w34aValidator = read(w34aValidatorPath).toString('utf8');
const flat = evidence.replace(/\s+/g, ' ');

assert.equal(sha256Ref(Buffer.from(JSON.stringify(sorted(receipt)))), RECEIPT_HASH, 'receipt core hash mismatch');
assert.equal(sha256Ref(renewedApprovalBytes), RENEWED_APPROVAL_HASH, 'renewed approval hash mismatch');
assert.equal(receipt.bindings.writeGradeRegistryRefHash, WRITE_GRADE_REGISTRY_HASH, 'registry hash binding mismatch');
assert.equal(receipt.bindings.oneShotTokenHash, ONE_SHOT_TOKEN_HASH, 'one-shot token hash mismatch');
assert.equal(receipt.bindings.killSwitchTokenHash, KILL_SWITCH_TOKEN_HASH, 'kill-switch token hash mismatch');
assert.equal(receipt.bindings.operatorApprovalArtifactHash, RENEWED_APPROVAL_HASH, 'receipt approval hash mismatch');
assert.equal(receipt.bindings.w34b1R2RenewedOperatorApprovalCommit, W34B1_R2_RENEWED_APPROVAL_COMMIT);
assert.equal(receipt.maxInvocations, 1);
assert.equal(receipt.requestBudget.createOnlyPutMax, 2);
assert.equal(receipt.requestBudget.readbackGetMax, 1);
assert.equal(receipt.requestBudget.otherMethods, 0);
assert.equal(receipt.sacrificialObject.payloadByteMax, 256);

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

for (const token of [
  W34B1_R2_RENEWED_APPROVAL_COMMIT,
  W34B2_R3_COMMIT,
  RECEIPT_HASH,
  RENEWED_APPROVAL_HASH,
  WRITE_GRADE_REGISTRY_HASH,
  ONE_SHOT_TOKEN_HASH,
  KILL_SWITCH_TOKEN_HASH,
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
  'w34b3bR3RequiresExplicitOperatorGo:true',
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
  'W3.4b-3B-R3 can proceed automatically',
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

mustContain(receiptEvidence, `receiptCoreHash: \`${RECEIPT_HASH}\``, 'W3.4b-2-R3 receipt evidence hash');
mustContain(receiptEvidence, 'receiptConsumed:false', 'W3.4b-2-R3 unconsumed receipt');
mustContain(receiptEvidence, 'receiptInvoked:false', 'W3.4b-2-R3 uninvoked receipt');

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
  validator: 'validate-real-transport-w3-4b-2-5-r3-pre-invocation-readiness',
  evidencePath,
  receiptCoreHash: RECEIPT_HASH,
  expiryUtc,
  receiptNotExpiredAtValidation: true,
  currentTimeExpired: currentExpired,
  tokenPrivateMaterialPresent: true,
  tokenPermissionsPrivate: true,
  tokenHashesMatchPrivateMaterial: true,
  registryPathSource: 'app-local',
  writeGradeRegistryEligible: true,
  credentialMaterialPresent: true,
  consumedMarkerExists: false,
  liveInvocationPerformed: false,
  writesWebDAV: false,
  productSyncReady: false,
  transportReady: false,
  w34b3bR3RequiresExplicitOperatorGo: true,
}, null, 2));
