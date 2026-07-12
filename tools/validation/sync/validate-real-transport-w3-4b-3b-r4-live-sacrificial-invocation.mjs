#!/usr/bin/env node
//
// W3.4b-3B-R4 live sacrificial invocation validator.

import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const evidencePath = 'release-evidence/2026-07-12/real-transport-w3-4b-3b-r4-live-sacrificial-invocation.md';
const receiptEvidencePath = 'release-evidence/2026-07-12/real-transport-w3-4b-2-r4-write-grade-receipt.md';
const readinessEvidencePath = 'release-evidence/2026-07-12/real-transport-w3-4b-2-5-r4-pre-invocation-readiness.md';

const RENEWED_APPROVAL_COMMIT = '714f80a458808550dc8fd59ee937837349f416da';
const R3A_DIAGNOSTIC_COMMIT = 'd57fefebe66537ecbeac9ecf9ba56cf02f1b21dd';
const W34B2_R4_COMMIT = '6e0f89f9e25baf15c7a254f8bc350d14df2eae98';
const W34B25_R4_COMMIT = '159c21420723cadd28e42a64182ef57c3ffa1c1e';
const W34B3A_COMMIT = '3048ab2dba3f4cbff4ec199dbb36093975659b52';
const RECEIPT_HASH = 'sha256:b18da77e97eb2ab339ea974db93b5fb51bd1a5b4a478d69fa2bc5d18084fd183';
const WRITE_GRADE_REGISTRY_HASH = 'sha256:3222f11719c7bb17047cc3c6b6b01145d0748921792fb84fb5064c19541ee0ff';
const ONE_SHOT_TOKEN_HASH = 'sha256:a1deea9c2850e013f9c88f3b5554458f75c3c839742eba737b3a0e6055d440a1';
const KILL_SWITCH_TOKEN_HASH = 'sha256:5b1c98e62f0cff5de31e9ff81f47083033b3e5592669def7c7dadde3691cda09';
const PAYLOAD_HASH = 'sha256:67b110e21148b315e5fef1acfb1c2ff39d9acc204ce47578b138a7df33af6829';

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

const evidence = read(evidencePath);
const receiptEvidence = read(receiptEvidencePath);
const readinessEvidence = read(readinessEvidencePath);
const flatEvidence = compact(evidence);

for (const commit of [
  RENEWED_APPROVAL_COMMIT,
  R3A_DIAGNOSTIC_COMMIT,
  W34B2_R4_COMMIT,
  W34B25_R4_COMMIT,
  W34B3A_COMMIT,
]) {
  assert.ok(commitExists(commit), `required commit missing: ${commit}`);
}

for (const token of [
  RENEWED_APPROVAL_COMMIT,
  R3A_DIAGNOSTIC_COMMIT,
  W34B2_R4_COMMIT,
  W34B25_R4_COMMIT,
  W34B3A_COMMIT,
  RECEIPT_HASH,
  WRITE_GRADE_REGISTRY_HASH,
  ONE_SHOT_TOKEN_HASH,
  KILL_SWITCH_TOKEN_HASH,
  PAYLOAD_HASH,
  'I approve W3.4b-3B-R4 live sacrificial invocation.',
  'Verdict: W3.4b-3B-R4 FAIL-CLOSED DURING PRE-WRITE PROPFIND. NO WEBDAV WRITE. NO CLEANUP.',
  'invocationResult: `fail-closed`',
  'primaryBlocker: `real-transport-w3-first-write-auth-refused`',
  'failureStage: `PROPFIND pre-write absence check`',
  'h2oRtFirstWriteInvoked:true',
  'h2oRtFirstWriteInvokeCount:1',
  'liveInvocationCommandSubmitted:true',
  'liveInvocationPerformed:true',
  'networkAttempted:true',
  'mockOnly:false',
  'loopbackAttempted:false',
  'gateSatisfied:false',
  'writesWebDAV:false',
  'writesCloud:false',
  'writesRelay:false',
  'writesCAS:false',
  'writesFiles:false',
  'receiptGrade: `write-grade`',
  'maxInvocations:1',
  'createOnlyPutMax:2',
  'readbackGetMax:1',
  'otherMethods:0',
  'tokenPrivateMaterialPresent:true',
  'tokenPrivateMaterialPathClass: `out-of-repo-private-token-file`',
  'tokenPrivatePermissions:true',
  'tokenHashesMatchPrivateMaterial:true',
  'payloadHashMatchesExecutorDeterministicSentinel:true',
  'payloadByteMax:256',
  'registryPathSource: `app-local`',
  'writeGradeRegistryEligible:true',
  'credentialMaterialPresent:true',
  'consumedMarkerCreated:true',
  'consumedMarkerExists:true',
  'consumedMarkerPathClass: `app-local-first-write-consumed-marker`',
  'consumedMarkerPrivate:true',
  'consumedMarkerReceiptHashMatches:true',
  'consumedMarkerNetworkAttemptedFalse:true',
  'receiptConsumed:true',
  'receiptInvoked:true',
  'tokenBurnOccurred:true',
  'tokenExportIdSequenceBurn:false',
  'allowedMethodSequence: `PROPFIND, PUT, PUT, GET`',
  'methodsAttempted: `PROPFIND`',
  'targetPathCount:1',
  'method: `PROPFIND pre-write absence check`',
  'statusCode:401',
  'statusFamily: `4xx`',
  'putCreateOnlyFirstAttempted:false',
  'putCreateOnlySecondAttempted:false',
  'getReadBackAttempted:false',
  'createOnlyBehavior: `not-attempted`',
  'readBackHashMatch: `not-attempted`',
  'noAutomaticRetry:true',
  'forbiddenMethodUsed:false',
  'deleteCleanupPerformed:false',
  'cleanupPerformed:false',
  'archiveUserDataWritten:false',
  'fullBundleV3Started:false',
  'relayOutboxLedgerStoreMutation:false',
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

mustContain(receiptEvidence, `receiptCoreHash: \`${RECEIPT_HASH}\``, 'R4 receipt hash');
mustContain(receiptEvidence, 'receiptConsumed:false', 'R4 receipt unconsumed at mint');
mustContain(receiptEvidence, 'receiptInvoked:false', 'R4 receipt uninvoked at mint');
mustContain(receiptEvidence, 'payloadHashMatchesExecutorDeterministicSentinel:true', 'R4 payload binding');
mustContain(readinessEvidence, `receiptCoreHash: \`${RECEIPT_HASH}\``, 'R4 readiness hash');
mustContain(readinessEvidence, 'consumedMarkerExists:false', 'R4 readiness consumed marker absent');
mustContain(readinessEvidence, 'w34b3bR4RequiresExplicitOperatorGo:true', 'R4 explicit go gate');

for (const token of [
  'putCreateOnlyFirstAttempted:true',
  'putCreateOnlySecondAttempted:true',
  'getReadBackAttempted:true',
  'createOnlyBehavior: `enforced`',
  'createOnlyBehavior: `not-enforced`',
  'readBackHashMatch: true',
  'readBackHashMatch: false',
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
  validator: 'validate-real-transport-w3-4b-3b-r4-live-sacrificial-invocation',
  evidencePath,
  invocationResult: 'fail-closed',
  primaryBlocker: 'real-transport-w3-first-write-auth-refused',
  receiptCoreHash: RECEIPT_HASH,
  payloadHash: PAYLOAD_HASH,
  methodStatuses: [
    {
      operation: 'PROPFIND pre-write absence check',
      statusCode: 401,
      statusFamily: '4xx',
    },
  ],
  createOnlyBehavior: 'not-attempted',
  readBackHashMatch: 'not-attempted',
  consumed: true,
  invoked: true,
  networkAttempted: true,
  writesWebDAV: false,
  productSyncReady: false,
  transportReady: false,
  w35SeparateAndBlocked: true,
}, null, 2));
