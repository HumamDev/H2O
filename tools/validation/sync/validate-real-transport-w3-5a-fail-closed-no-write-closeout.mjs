#!/usr/bin/env node
//
// W3.5A fail-closed no-write closeout validator.

import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const evidencePath = 'release-evidence/2026-07-12/real-transport-w3-5a-fail-closed-no-write-closeout.md';
const r4InvocationEvidencePath = 'release-evidence/2026-07-12/real-transport-w3-4b-3b-r4-live-sacrificial-invocation.md';

const W34B3B_R4_COMMIT = 'bf6122f8670eb273a2c93cf81d41fe95ea818d38';
const RECEIPT_HASH = 'sha256:b18da77e97eb2ab339ea974db93b5fb51bd1a5b4a478d69fa2bc5d18084fd183';

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
const r4Evidence = read(r4InvocationEvidencePath);
const flatEvidence = compact(evidence);

assert.ok(commitExists(W34B3B_R4_COMMIT), `required commit missing: ${W34B3B_R4_COMMIT}`);

for (const token of [
  W34B3B_R4_COMMIT,
  RECEIPT_HASH,
  'Verdict: W3.5A CLOSES W3.4b-3B-R4 AS FAIL-CLOSED, CONSUMED, INVOKED, NO-WRITE.',
  'finalClassification: `fail-closed`',
  'receiptState: `consumed`',
  'invocationState: `invoked`',
  'writeState: `no-write`',
  'blockerClass: `pre-write-propfind-401`',
  'primaryBlocker: `real-transport-w3-first-write-auth-refused`',
  'r4ReceiptReusable:false',
  'retryAuthorized:false',
  '`PROPFIND` | `401 / 4xx`',
  '`PUT` | `not attempted`',
  '`GET` | `not attempted`',
  'networkAttempted:true',
  'writesWebDAV:false',
  'putCreateOnlyFirstAttempted:false',
  'putCreateOnlySecondAttempted:false',
  'getReadBackAttempted:false',
  'createOnlyBehavior: `not-attempted`',
  'readBackHashMatch: `not-attempted`',
  'noAutomaticRetry:true',
  'receiptConsumed:true',
  'receiptInvoked:true',
  'consumedMarkerCreated:true',
  'consumedMarkerPathClass: `app-local-first-write-consumed-marker`',
  'consumedMarkerCreatedBeforeNetwork:true',
  'tokenBurnOccurred:true',
  'tokenExportIdSequenceBurn:false',
  'h2oRtFirstWriteInvokedInW35A:false',
  'liveInvocationRetried:false',
  'receiptMintedInW35A:false',
  'newTokensGeneratedInW35A:false',
  'newOneShotOrKillSwitchTokenBurn:false',
  'forbiddenMethodUsed:false',
  'deleteCleanupPerformed:false',
  'cleanupPerformed:false',
  'archiveUserDataWritten:false',
  'fullBundleV3Started:false',
  'relayOutboxLedgerStoreMutation:false',
  'productSyncReady:false',
  'transportReady:false',
  'W3.4b-2.5-R4 readiness validator is pre-invocation only.',
  'expected to fail after the approved invocation',
  'Any future live attempt requires a new diagnostic/fix, renewed receipt/token ceremony, fresh readiness, and fresh explicit operator approval.',
  'No retry is authorized by this closeout.',
  'compare the live executor `PROPFIND` auth/request shape with the W3.1 successful read-only `PROPFIND` shape',
]) {
  mustContain(flatEvidence, token, `evidence token ${token}`);
}

for (const token of [
  RECEIPT_HASH,
  'invocationResult: `fail-closed`',
  'primaryBlocker: `real-transport-w3-first-write-auth-refused`',
  'networkAttempted:true',
  'writesWebDAV:false',
  'putCreateOnlyFirstAttempted:false',
  'putCreateOnlySecondAttempted:false',
  'getReadBackAttempted:false',
  'receiptConsumed:true',
  'receiptInvoked:true',
  'productSyncReady:false',
  'transportReady:false',
]) {
  mustContain(r4Evidence, token, `R4 evidence token ${token}`);
}

for (const token of [
  'retryAuthorized:true',
  'r4ReceiptReusable:true',
  'writesWebDAV:true',
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
  mustNotContain(flatEvidence, token, `forbidden closeout claim ${token}`);
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
  validator: 'validate-real-transport-w3-5a-fail-closed-no-write-closeout',
  evidencePath,
  r4InvocationCommit: W34B3B_R4_COMMIT,
  receiptCoreHash: RECEIPT_HASH,
  finalClassification: ['fail-closed', 'consumed', 'invoked', 'no-write', 'pre-write-propfind-401'],
  methodStatuses: [
    { method: 'PROPFIND', statusCode: 401, statusFamily: '4xx' },
    { method: 'PUT #1', status: 'not attempted' },
    { method: 'PUT #2', status: 'not attempted' },
    { method: 'GET', status: 'not attempted' },
  ],
  r4ReceiptReusable: false,
  retryAuthorized: false,
  writesWebDAV: false,
  productSyncReady: false,
  transportReady: false,
}, null, 2));
