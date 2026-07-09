#!/usr/bin/env node
//
// W3.4b-3B fail-closed token-material-missing invocation validator.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const evidencePath = 'release-evidence/2026-07-07/real-transport-w3-4b-3b-live-sacrificial-invocation-token-material-missing.md';

const W34B1_COMMIT = 'db4cdc5ccbd436913f05aa7b526fc14fec03e5ea';
const W34B2_COMMIT = '19b81af406b5d731035f7ec004d1eebbcb8beef3';
const W34B25_COMMIT = 'f5aacede5ec1cff873dd51769cdf7e6cfefd9e08';
const W34B3_BLOCKED_COMMIT = 'f305982d3000aef81664ed7b4ce4a681584de3df';
const W34B3A_COMMIT = '3048ab2dba3f4cbff4ec199dbb36093975659b52';
const RECEIPT_HASH = 'sha256:267688e94be9359d83cebfbd6ce4d2ecd5259808d15ab5d818973f90973d1fb7';
const WRITE_GRADE_REGISTRY_HASH = 'sha256:3222f11719c7bb17047cc3c6b6b01145d0748921792fb84fb5064c19541ee0ff';
const ONE_SHOT_TOKEN_HASH = 'sha256:e857e0672692770f92f7b50a36918d863ec344713f80c8579b4a0938bcdbc3a9';
const KILL_SWITCH_TOKEN_HASH = 'sha256:9a44ae6a81e8224b8cb60f89b2d4a83219deeb9a1dac8a68567c348ff33bddac';

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
const flatEvidence = compact(evidence);

for (const token of [
  W34B1_COMMIT,
  W34B2_COMMIT,
  W34B25_COMMIT,
  W34B3_BLOCKED_COMMIT,
  W34B3A_COMMIT,
  RECEIPT_HASH,
  WRITE_GRADE_REGISTRY_HASH,
  ONE_SHOT_TOKEN_HASH,
  KILL_SWITCH_TOKEN_HASH,
  'I approve W3.4b-3B live sacrificial invocation.',
  'Verdict: W3.4b-3B FAIL-CLOSED BEFORE COMMAND INVOCATION. NO LIVE INVOCATION. NO WEBDAV WRITE.',
  'blocker: `real-transport-w3-live-token-material-missing`',
  'failureMode: `fail-closed-before-command-invocation`',
  'h2oRtFirstWriteInvoked:false',
  'liveInvocationPerformed:false',
  'networkAttempted:false',
  'consumedMarkerCreated:false',
  'receiptConsumed:false',
  'receiptInvoked:false',
  'tokenBurnOccurred:false',
  'receiptGrade: `write-grade`',
  'maxInvocations:1',
  'createOnlyPutMax:2',
  'readbackGetMax:1',
  'otherMethods:0',
  'tokenPrivateMaterialPresent:false',
  'tokenPrivateMaterialPathClass: `out-of-repo-private-token-file`',
  'registryPathSource: `app-local`',
  'writeGradeRegistryEligible:true',
  'credentialMaterialPresent:true',
  'allowedMethodSequence: `PROPFIND, PUT, PUT, GET`',
  'methodsAttempted: `none`',
  'methodStatusCodes: `none`',
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

const blockerCheckUtc = /blockerCheckUtc: `([^`]+)`/.exec(evidence)?.[1];
const expiryUtc = /receiptExpiryUtc: `([^`]+)`/.exec(evidence)?.[1];
assert.ok(blockerCheckUtc, 'missing blockerCheckUtc');
assert.ok(expiryUtc, 'missing receiptExpiryUtc');
assert.ok(parseUtc(blockerCheckUtc) < parseUtc(expiryUtc), 'receipt must not be expired at blocker check');

for (const token of [
  'liveInvocationPerformed:true',
  'h2oRtFirstWriteInvoked:true',
  'networkAttempted:true',
  'writesWebDAV:true',
  'receiptConsumed:true',
  'receiptInvoked:true',
  'tokenBurnOccurred:true',
  'productSyncReady:true',
  'transportReady:true',
  'DELETE cleanup',
]) {
  mustNotContain(flatEvidence, token, `forbidden evidence claim ${token}`);
}

for (const [pattern, label] of [
  [/https?:\/\//i, 'raw URL literal'],
  [/\/private\/tmp\/h2o-w3-4b-2-private-token-material/i, 'raw private token path'],
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
  validator: 'validate-real-transport-w3-4b-3b-live-sacrificial-invocation-token-material-missing',
  evidencePath,
  invocationResult: 'fail-closed',
  blocker: 'real-transport-w3-live-token-material-missing',
  receiptCoreHash: RECEIPT_HASH,
  methodsAttempted: [],
  tokenPrivateMaterialPresent: false,
  networkAttempted: false,
  writesWebDAV: false,
  productSyncReady: false,
  transportReady: false,
  w35SeparateAndBlocked: true,
}, null, 2));
