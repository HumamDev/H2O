#!/usr/bin/env node
//
// W3.4b-3B-R3 fail-closed live sacrificial invocation validator.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const evidencePath = 'release-evidence/2026-07-12/real-transport-w3-4b-3b-r3-live-sacrificial-invocation.md';
const receiptEvidencePath = 'release-evidence/2026-07-12/real-transport-w3-4b-2-r3-write-grade-receipt.md';
const readinessEvidencePath = 'release-evidence/2026-07-12/real-transport-w3-4b-2-5-r3-pre-invocation-readiness.md';

const RENEWED_APPROVAL_COMMIT = '714f80a458808550dc8fd59ee937837349f416da';
const W34B2_R3_COMMIT = '8c3422965c1202099c7177d4e63c53cf2b72a422';
const W34B25_R3_COMMIT = 'bab94bc677f6e38417f4ced98c0bd2b7404fa756';
const W34B3A_COMMIT = '3048ab2dba3f4cbff4ec199dbb36093975659b52';
const RECEIPT_HASH = 'sha256:b34cd56a9d5a16fe3dc5319b174522f2c7634ad17717405310c18cec0188e1cd';
const WRITE_GRADE_REGISTRY_HASH = 'sha256:3222f11719c7bb17047cc3c6b6b01145d0748921792fb84fb5064c19541ee0ff';
const ONE_SHOT_TOKEN_HASH = 'sha256:5c5b803c2612b94e0e6ceca999ebd1198eb4d2caff39909591aceaa74b1f3631';
const KILL_SWITCH_TOKEN_HASH = 'sha256:5cfb8c26eb9e5c14b05e140c708d1b9ac90df15714f8f51aea5f3307c491847a';
const PAYLOAD_HASH = 'sha256:7d9491ac8a547de8e9e7138d8408b8d609359e4f74b690960201d093e1aaf440';

function read(rel) {
  const abs = path.join(root, rel);
  assert.ok(fs.existsSync(abs), `missing ${rel}`);
  return fs.readFileSync(abs, 'utf8');
}

function compact(value) {
  return String(value).replace(/\s+/g, ' ');
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

const evidence = read(evidencePath);
const receiptEvidence = read(receiptEvidencePath);
const readinessEvidence = read(readinessEvidencePath);
const flatEvidence = compact(evidence);

for (const token of [
  RENEWED_APPROVAL_COMMIT,
  W34B2_R3_COMMIT,
  W34B25_R3_COMMIT,
  W34B3A_COMMIT,
  RECEIPT_HASH,
  WRITE_GRADE_REGISTRY_HASH,
  ONE_SHOT_TOKEN_HASH,
  KILL_SWITCH_TOKEN_HASH,
  PAYLOAD_HASH,
  'I approve W3.4b-3B-R3 live sacrificial invocation.',
  'Verdict: W3.4b-3B-R3 FAIL-CLOSED BEFORE NETWORK. NO WEBDAV WRITE. NO CLEANUP.',
  'invocationResult: `fail-closed`',
  'failureStage: `pre-network-validation`',
  'h2oRtFirstWriteInvoked:true',
  'h2oRtFirstWriteInvokeCount:1',
  'liveInvocationCommandSubmitted:true',
  'networkAttempted:false',
  'consumedMarkerCreated:false',
  'consumedMarkerPathClass: `app-local-first-write-consumed-marker`',
  'receiptConsumed:false',
  'receiptInvoked:false',
  'tokenBurnOccurred:false',
  'primaryBlocker: `real-transport-w3-first-write-payload-hash-mismatch`',
  'blocker: `real-transport-w3-first-write-commit-binding-mismatch`',
  'blocker: `real-transport-w3-write-grade-receipt-core-hash-mismatch`',
  'receiptGrade: `write-grade`',
  'maxInvocations:1',
  'createOnlyPutMax:2',
  'readbackGetMax:1',
  'otherMethods:0',
  'tokenPrivateMaterialPresent:true',
  'tokenPrivateMaterialPathClass: `out-of-repo-private-token-file`',
  'tokenPrivatePermissions:true',
  'tokenHashesMatchPrivateMaterial:true',
  'registryPathSource: `app-local`',
  'writeGradeRegistryEligible:true',
  'credentialMaterialPresent:true',
  'allowedMethodSequence: `PROPFIND, PUT, PUT, GET`',
  'methodsAttempted: `none`',
  'methodStatusCodes: `none`',
  'methodStatusFamilies: `none`',
  'targetPathCount:0',
  'createOnlyBehavior: `not-attempted`',
  'readBackHashMatch: `not-attempted`',
  'writesWebDAV:false',
  'deleteCleanupPerformed:false',
  'cleanupPerformed:false',
  'productSyncReady:false',
  'transportReady:false',
  'W3.5 remains separate and blocked.',
]) {
  mustContain(flatEvidence, token, `evidence token ${token}`);
}

const invocationUtc = /invocationUtc: `([^`]+)`/.exec(evidence)?.[1];
const expiryUtc = /receiptExpiryUtc: `([^`]+)`/.exec(evidence)?.[1];
const approvalExpiryUtc = /renewedApprovalExpiryUtc: `([^`]+)`/.exec(evidence)?.[1];
assert.ok(invocationUtc, 'missing invocationUtc');
assert.ok(expiryUtc, 'missing receiptExpiryUtc');
assert.ok(approvalExpiryUtc, 'missing renewedApprovalExpiryUtc');
assert.ok(parseUtc(invocationUtc) < parseUtc(expiryUtc), 'receipt must not be expired at invocation');
assert.ok(parseUtc(expiryUtc) <= parseUtc(approvalExpiryUtc), 'receipt expiry must be <= approval expiry');

mustContain(receiptEvidence, `receiptCoreHash: \`${RECEIPT_HASH}\``, 'R3 receipt hash');
mustContain(receiptEvidence, 'receiptConsumed:false', 'R3 receipt unconsumed at mint');
mustContain(readinessEvidence, `receiptCoreHash: \`${RECEIPT_HASH}\``, 'R3 readiness hash');
mustContain(readinessEvidence, 'consumedMarkerExists:false', 'R3 readiness consumed marker absent');

for (const token of [
  'networkAttempted:true',
  'writesWebDAV:true',
  'receiptConsumed:true',
  'receiptInvoked:true',
  'tokenBurnOccurred:true',
  'deleteCleanupPerformed:true',
  'cleanupPerformed:true',
  'archiveUserDataWritten:true',
  'fullBundleV3Started:true',
  'productSyncReady:true',
  'transportReady:true',
]) {
  mustNotContain(flatEvidence, token, `forbidden evidence claim ${token}`);
}

for (const forbiddenMethod of [
  'DELETE',
  'MKCOL',
  'PROPPATCH',
  'MOVE',
  'COPY',
  'LOCK',
  'UNLOCK',
  'POST',
]) {
  mustContain(evidence, 'forbiddenMethodUsed:false', 'forbidden method summary');
  mustNotContain(evidence, `method: ${forbiddenMethod}`, `forbidden method ${forbiddenMethod}`);
}

for (const [pattern, label] of [
  [/https?:\/\//i, 'raw URL literal'],
  [/\/private\/tmp\/h2o-w3/i, 'temporary invocation path'],
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
  validator: 'validate-real-transport-w3-4b-3b-r3-live-sacrificial-invocation',
  evidencePath,
  invocationResult: 'fail-closed',
  primaryBlocker: 'real-transport-w3-first-write-payload-hash-mismatch',
  receiptCoreHash: RECEIPT_HASH,
  methodsAttempted: [],
  createOnlyBehavior: 'not-attempted',
  readBackHashMatch: 'not-attempted',
  consumed: false,
  invoked: false,
  networkAttempted: false,
  writesWebDAV: false,
  productSyncReady: false,
  transportReady: false,
  w35SeparateAndBlocked: true,
}, null, 2));
