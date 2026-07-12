#!/usr/bin/env node
//
// W3.4b-3B-R5 fail-closed live sacrificial invocation validator.

import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const evidencePath = 'release-evidence/2026-07-12/real-transport-w3-4b-3b-r5-live-sacrificial-invocation.md';
const receiptEvidencePath = 'release-evidence/2026-07-12/real-transport-w3-4b-2-r5-write-grade-receipt.md';
const readinessEvidencePath = 'release-evidence/2026-07-12/real-transport-w3-4b-2-5-r5-pre-invocation-readiness.md';

const RENEWED_APPROVAL_COMMIT = '714f80a458808550dc8fd59ee937837349f416da';
const W35B_PARENT_PROPFIND_FIX_COMMIT = '305ff023ad12f14b6a9b505dab4123cf44c7cfba';
const W34B2_R5_COMMIT = 'ad569f70f33c5610649e7da381045b08b6e32cd7';
const W34B25_R5_COMMIT = 'c3d4d1160cc63c8514dcd6877e9c81e20f1dca2b';
const W34B3A_COMMIT = '3048ab2dba3f4cbff4ec199dbb36093975659b52';
const RECEIPT_HASH = 'sha256:b27b6eb6ed238c15d9b687a85d2d8b98e9db4434a7c6b1d30df26e96aaddca57';
const WRITE_GRADE_REGISTRY_HASH = 'sha256:3222f11719c7bb17047cc3c6b6b01145d0748921792fb84fb5064c19541ee0ff';
const ONE_SHOT_TOKEN_HASH = 'sha256:4e6056552d5d6afc7ac1bc89624957ef324eb64b353bae6b64942174d74785d4';
const KILL_SWITCH_TOKEN_HASH = 'sha256:0ee62ecc6a594c752942702197d79fe49fa35ec5b3363551d7648f0c15aae02e';
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
  W35B_PARENT_PROPFIND_FIX_COMMIT,
  W34B2_R5_COMMIT,
  W34B25_R5_COMMIT,
  W34B3A_COMMIT,
]) {
  assert.ok(commitExists(commit), `required commit missing: ${commit}`);
}

for (const token of [
  RENEWED_APPROVAL_COMMIT,
  W35B_PARENT_PROPFIND_FIX_COMMIT,
  W34B2_R5_COMMIT,
  W34B25_R5_COMMIT,
  W34B3A_COMMIT,
  RECEIPT_HASH,
  WRITE_GRADE_REGISTRY_HASH,
  ONE_SHOT_TOKEN_HASH,
  KILL_SWITCH_TOKEN_HASH,
  PAYLOAD_HASH,
  'I approve W3.4b-3B-R5 live sacrificial invocation.',
  'Verdict: W3.4b-3B-R5 FAIL-CLOSED BEFORE NETWORK. NO WEBDAV WRITE. NO CLEANUP.',
  'invocationResult: `fail-closed`',
  'failureStage: `pre-network-validation`',
  'h2oRtFirstWriteInvoked:true',
  'h2oRtFirstWriteInvokeCount:1',
  'liveInvocationCommandSubmitted:true',
  'liveInvocationPerformed:false',
  'networkAttempted:false',
  'consumedMarkerCreated:false',
  'consumedMarkerExists:false',
  'consumedMarkerPathClass: `app-local-first-write-consumed-marker`',
  'receiptConsumed:false',
  'receiptInvoked:false',
  'tokenBurnOccurred:false',
  'primaryBlocker: `real-transport-w3-first-write-commit-binding-mismatch`',
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
  'payloadHashMatchesExecutorDeterministicSentinel:true',
  'payloadByteMax:256',
  'registryPathSource: `app-local`',
  'writeGradeRegistryEligible:true',
  'credentialMaterialPresent:true',
  'allowedMethodSequence: `PROPFIND, PUT, PUT, GET`',
  'methodsAttempted: `none`',
  'methodStatusCodes: `none`',
  'methodStatusFamilies: `none`',
  'targetPathCount:0',
  'putCreateOnlyFirstAttempted:false',
  'putCreateOnlySecondAttempted:false',
  'getReadBackAttempted:false',
  'createOnlyBehavior: `not-attempted`',
  'readBackHashMatch: `not-attempted`',
  'noAutomaticRetry:true',
  'writesWebDAV:false',
  'deleteCleanupPerformed:false',
  'cleanupPerformed:false',
  'archiveUserDataWritten:false',
  'fullBundleV3Started:false',
  'relayOutboxLedgerStoreMutation:false',
  'tokenExportIdSequenceBurn:false',
  'productSyncReady:false',
  'transportReady:false',
  'W3.5 final closeout remains separate and blocked.',
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

mustContain(receiptEvidence, `receiptCoreHash: \`${RECEIPT_HASH}\``, 'R5 receipt hash');
mustContain(receiptEvidence, 'receiptConsumed:false', 'R5 receipt unconsumed at mint');
mustContain(receiptEvidence, 'receiptInvoked:false', 'R5 receipt uninvoked at mint');
mustContain(receiptEvidence, 'payloadHashMatchesExecutorDeterministicSentinel:true', 'R5 payload binding');
mustContain(readinessEvidence, `receiptCoreHash: \`${RECEIPT_HASH}\``, 'R5 readiness hash');
mustContain(readinessEvidence, 'consumedMarkerExists:false', 'R5 readiness consumed marker absent');
mustContain(readinessEvidence, 'w34b3bR5RequiresExplicitOperatorGo:true', 'R5 explicit go gate');

for (const token of [
  'networkAttempted:true',
  'writesWebDAV:true',
  'receiptConsumed:true',
  'receiptInvoked:true',
  'tokenBurnOccurred:true',
  'putCreateOnlyFirstAttempted:true',
  'putCreateOnlySecondAttempted:true',
  'getReadBackAttempted:true',
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
  validator: 'validate-real-transport-w3-4b-3b-r5-live-sacrificial-invocation',
  evidencePath,
  invocationResult: 'fail-closed',
  primaryBlocker: 'real-transport-w3-first-write-commit-binding-mismatch',
  receiptCoreHash: RECEIPT_HASH,
  payloadHash: PAYLOAD_HASH,
  methodsAttempted: [],
  createOnlyBehavior: 'not-attempted',
  readBackHashMatch: 'not-attempted',
  consumed: false,
  invoked: false,
  networkAttempted: false,
  writesWebDAV: false,
  productSyncReady: false,
  transportReady: false,
  w35FinalCloseoutSeparateAndBlocked: true,
}, null, 2));
