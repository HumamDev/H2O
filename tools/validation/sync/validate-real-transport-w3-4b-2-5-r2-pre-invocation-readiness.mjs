#!/usr/bin/env node
//
// W3.4b-2.5-R2 final pre-invocation readiness validator.

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const evidencePath = 'release-evidence/2026-07-07/real-transport-w3-4b-2-5-r2-pre-invocation-readiness.md';
const receiptEvidencePath = 'release-evidence/2026-07-07/real-transport-w3-4b-2-r2-write-grade-receipt.md';
const receiptCorePath = 'release-evidence/2026-07-07/real-transport-w3-4b-2-r2-write-grade-receipt-core.json';
const w34aValidatorPath = 'tools/validation/sync/validate-real-transport-w3-4a-refused-first-write-command-proof.mjs';

const W34B2_R2_COMMIT = '4b3f90fc45d8c07696c03afc031784e254f9a135';
const ORIGINAL_W34B2_COMMIT = '19b81af406b5d731035f7ec004d1eebbcb8beef3';
const W34B3B_MISSING_TOKEN_COMMIT = 'd4171915b30cef69ef53234ef12a533e8ed6e846';
const RECEIPT_HASH = 'sha256:38570bc5ef7e5f8eaabc4092d3878bc1194ae93cf41bf41377912d1fda88203d';
const WRITE_GRADE_REGISTRY_HASH = 'sha256:3222f11719c7bb17047cc3c6b6b01145d0748921792fb84fb5064c19541ee0ff';
const ONE_SHOT_TOKEN_HASH = 'sha256:1b49841cc56e1c6bb663fbf0547134ef6ae2007c1cf93330fd4130104b735e97';
const KILL_SWITCH_TOKEN_HASH = 'sha256:8e7fda833d2d0bf85fd64db12e45655436b799ec6a77b846e3faa9f4776ba9dc';

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
const w34aValidator = read(w34aValidatorPath).toString('utf8');
const flat = evidence.replace(/\s+/g, ' ');

assert.equal(sha256Ref(Buffer.from(JSON.stringify(sorted(receipt)))), RECEIPT_HASH, 'receipt core hash mismatch');
assert.equal(receipt.bindings.writeGradeRegistryRefHash, WRITE_GRADE_REGISTRY_HASH, 'registry hash binding mismatch');
assert.equal(receipt.bindings.oneShotTokenHash, ONE_SHOT_TOKEN_HASH, 'one-shot token hash mismatch');
assert.equal(receipt.bindings.killSwitchTokenHash, KILL_SWITCH_TOKEN_HASH, 'kill-switch token hash mismatch');

const validationUtc = /validationUtc: `([^`]+)`/.exec(evidence)?.[1];
const expiryUtc = /expiryUtc: `([^`]+)`/.exec(evidence)?.[1];
const approvalExpiryUtc = /approvalExpiryUtc: `([^`]+)`/.exec(evidence)?.[1];
assert.ok(validationUtc, 'missing validationUtc');
assert.ok(expiryUtc, 'missing expiryUtc');
assert.ok(approvalExpiryUtc, 'missing approvalExpiryUtc');
const validationTime = parseUtc(validationUtc);
const expiryTime = parseUtc(expiryUtc);
const approvalExpiryTime = parseUtc(approvalExpiryUtc);
assert.ok(expiryTime > validationTime, 'receipt was expired at recorded validation time');
assert.ok(expiryTime <= approvalExpiryTime, 'receipt expiry must be <= approval expiry');
const currentExpired = Date.now() >= expiryTime;
if (currentExpired) {
  mustContain(evidence, 'currentTimeCaveat:', 'current-time caveat for post-expiry validation');
} else {
  mustContain(evidence, 'receiptNotExpiredAtValidation:true', 'receipt not expired at validation time');
}

for (const token of [
  W34B2_R2_COMMIT,
  ORIGINAL_W34B2_COMMIT,
  W34B3B_MISSING_TOKEN_COMMIT,
  RECEIPT_HASH,
  WRITE_GRADE_REGISTRY_HASH,
  ONE_SHOT_TOKEN_HASH,
  KILL_SWITCH_TOKEN_HASH,
  'registryPathSource: `app-local`',
  'writeGradeRegistryEligible:true',
  'credentialMaterialPresent:true',
  'tokenPrivateMaterialPresent:true',
  'tokenPrivateMaterialPathClass: `out-of-repo-private-token-file`',
  'tokenPrivatePermissions:true',
  'tokenHashesMatchPrivateMaterial:true',
  'h2oRtFirstWriteExists:true',
  'defaultRefusalStillWorks:true',
  'defaultRefusalBlocker: `real-transport-w3-write-grade-approval-missing`',
  'consumedMarkerExists:false',
  'consumedMarkerPathClass: `app-local-first-write-consumed-marker`',
  'w34b3bR2RequiresExplicitOperatorGo:true',
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
  'W3.4b-3B-R2 can proceed automatically',
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

mustContain(receiptEvidence, `receiptCoreHash: \`${RECEIPT_HASH}\``, 'W3.4b-2-R2 receipt evidence hash');
mustContain(receiptEvidence, 'receiptConsumed:false', 'W3.4b-2-R2 unconsumed receipt');
mustContain(receiptEvidence, 'receiptInvoked:false', 'W3.4b-2-R2 uninvoked receipt');

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
  validator: 'validate-real-transport-w3-4b-2-5-r2-pre-invocation-readiness',
  evidencePath,
  receiptCoreHash: RECEIPT_HASH,
  expiryUtc,
  receiptNotExpiredAtValidation: true,
  currentTimeExpired: currentExpired,
  tokenPrivateMaterialPresent: true,
  registryPathSource: 'app-local',
  writeGradeRegistryEligible: true,
  credentialMaterialPresent: true,
  consumedMarkerExists: false,
  liveInvocationPerformed: false,
  writesWebDAV: false,
  productSyncReady: false,
  transportReady: false,
  w34b3bR2RequiresExplicitOperatorGo: true,
}, null, 2));
