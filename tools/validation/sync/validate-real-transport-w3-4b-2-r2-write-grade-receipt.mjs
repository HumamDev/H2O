#!/usr/bin/env node
//
// W3.4b-2-R2 reminted write-grade receipt/token-hash evidence validator.

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const evidencePath = 'release-evidence/2026-07-07/real-transport-w3-4b-2-r2-write-grade-receipt.md';
const receiptPath = 'release-evidence/2026-07-07/real-transport-w3-4b-2-r2-write-grade-receipt-core.json';
const approvalPath = 'release-evidence/2026-07-07/real-transport-w3-4b-1-operator-sacrificial-write-approval.md';

const EXPECTED_RECEIPT_HASH = 'sha256:38570bc5ef7e5f8eaabc4092d3878bc1194ae93cf41bf41377912d1fda88203d';
const EXPECTED_APPROVAL_HASH = 'sha256:19261aedee989dc33f2c35ffa98c57b06531be21858049e49c399f753a81d800';
const EXPECTED_WRITE_GRADE_REGISTRY_HASH = 'sha256:3222f11719c7bb17047cc3c6b6b01145d0748921792fb84fb5064c19541ee0ff';
const W34B3B_MISSING_TOKEN_COMMIT = 'd4171915b30cef69ef53234ef12a533e8ed6e846';
const APPROVAL_EXPIRY_UTC = '2026-07-10T16:00:00Z';

const COMMITS = [
  '7862270237955b86d48d943263fd53947cc71f72',
  '70e7fcc9669b939b505de96a7bb0ec61509c3370',
  '649849e7e48c7e5bc5924bc811d857f2435866ae',
  '671fdc1c855b345185e5ea257b206c0a07cdab36',
  '388a952745ab7a21ba9556531eccf5c7e0ffe1ce',
  'aba4c70068d95ee373d157fddea06bfb31b505b0',
  'a830ccb6b633a9d6cee35e6db92464e870d5693d',
  'd196f4b26d904394c435c15dd14d12cd18f03190',
  'db4cdc5ccbd436913f05aa7b526fc14fec03e5ea',
  '19b81af406b5d731035f7ec004d1eebbcb8beef3',
  W34B3B_MISSING_TOKEN_COMMIT,
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

const evidence = read(evidencePath).toString('utf8');
const approvalBytes = read(approvalPath);
const receipt = JSON.parse(read(receiptPath).toString('utf8'));
const flatEvidence = evidence.replace(/\s+/g, ' ');
const receiptJson = JSON.stringify(receipt);

assert.equal(sha256Ref(approvalBytes), EXPECTED_APPROVAL_HASH, 'approval artifact hash mismatch');
const receiptHash = sha256Ref(Buffer.from(JSON.stringify(sorted(receipt))));
assert.equal(receiptHash, EXPECTED_RECEIPT_HASH, 'receipt canonical hash mismatch');

for (const commit of COMMITS) {
  mustContain(evidence, commit, `evidence anchor ${commit}`);
  mustContain(receiptJson, commit, `receipt anchor ${commit}`);
}

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
assert.equal(receipt.bindings.operatorApprovalArtifactHash, EXPECTED_APPROVAL_HASH);
assert.equal(receipt.bindings.w34b3BlockedMissingTokenCommit, W34B3B_MISSING_TOKEN_COMMIT);
assert.match(receipt.bindings.oneShotTokenHash, /^sha256:[a-f0-9]{64}$/);
assert.match(receipt.bindings.killSwitchTokenHash, /^sha256:[a-f0-9]{64}$/);
assert.notEqual(receipt.bindings.oneShotTokenHash, receipt.bindings.killSwitchTokenHash);
assert.equal(receipt.bindings.writeGradeRegistryRefHash, EXPECTED_WRITE_GRADE_REGISTRY_HASH);
assert.equal(receipt.bindings.writeGradeRegistryHashBoundary, 'descriptor-refs-only-excludes-private-material');

const mint = parseUtc(receipt.mintUtc);
const expiry = parseUtc(receipt.expiryUtc);
const approvalExpiry = parseUtc(APPROVAL_EXPIRY_UTC);
assert.ok(expiry > mint, 'receipt expiry must be after mint');
assert.ok(expiry - mint <= 72 * 60 * 60 * 1000, 'receipt expiry must be <=72h from mint');
assert.ok(expiry <= approvalExpiry, 'receipt expiry must be <= approval expiry');

for (const token of [
  `receiptCoreHash: \`${EXPECTED_RECEIPT_HASH}\``,
  `operatorApprovalArtifactHash: \`${EXPECTED_APPROVAL_HASH}\``,
  `writeGradeRegistryRefHash: \`${EXPECTED_WRITE_GRADE_REGISTRY_HASH}\``,
  'schema: `h2o.sync.real-transport.write-grade-receipt.v1`',
  'receiptGrade: `write-grade`',
  'registryPathSource: `app-local`',
  'writeGradeRegistryEligible:true',
  'credentialMaterialPresent:true',
  'privateTokenMaterialPresent:true',
  'tokenPermissionsPrivate:true',
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
  'priorReceiptLocallyUnusable:true',
  'priorReceiptUnusableReason: `raw-private-token-material-missing`',
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
  validator: 'validate-real-transport-w3-4b-2-r2-write-grade-receipt',
  evidencePath,
  receiptPath,
  receiptHash,
  mintUtc: receipt.mintUtc,
  expiryUtc: receipt.expiryUtc,
  registryPathSource: 'app-local',
  writeGradeRegistryEligible: true,
  privateTokenMaterialPresent: true,
  tokenPermissionsPrivate: true,
  receiptConsumed: false,
  receiptInvoked: false,
  liveInvocationPerformed: false,
  writesWebDAV: false,
  productSyncReady: false,
  transportReady: false,
}, null, 2));
