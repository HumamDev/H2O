#!/usr/bin/env node
//
// W3.4b-3 fail-closed live sacrificial invocation blocker validator.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const evidencePath = 'release-evidence/2026-07-07/real-transport-w3-4b-3-live-sacrificial-invocation-blocked.md';
const rustPath = 'apps/studio/desktop/src-tauri/src/real_transport_capability_probe.rs';
const w34aValidatorPath = 'tools/validation/sync/validate-real-transport-w3-4a-refused-first-write-command-proof.mjs';
const w34b2ValidatorPath = 'tools/validation/sync/validate-real-transport-w3-4b-2-write-grade-receipt.mjs';
const w34b25ValidatorPath = 'tools/validation/sync/validate-real-transport-w3-4b-2-5-pre-invocation-readiness.mjs';

const W34A_COMMIT = 'a830ccb6b633a9d6cee35e6db92464e870d5693d';
const W34B1_COMMIT = 'db4cdc5ccbd436913f05aa7b526fc14fec03e5ea';
const W34B2_COMMIT = '19b81af406b5d731035f7ec004d1eebbcb8beef3';
const W34B25_COMMIT = 'f5aacede5ec1cff873dd51769cdf7e6cfefd9e08';
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

const evidence = read(evidencePath);
const flatEvidence = compact(evidence);
const rust = read(rustPath);
const productionRust = rust.split('#[cfg(test)]')[0] || rust;
const w34aValidator = read(w34aValidatorPath);
const w34b2Validator = read(w34b2ValidatorPath);
const w34b25Validator = read(w34b25ValidatorPath);

for (const token of [
  W34A_COMMIT,
  W34B1_COMMIT,
  W34B2_COMMIT,
  W34B25_COMMIT,
  RECEIPT_HASH,
  WRITE_GRADE_REGISTRY_HASH,
  ONE_SHOT_TOKEN_HASH,
  KILL_SWITCH_TOKEN_HASH,
  'I approve W3.4b-3 live sacrificial invocation.',
  'Verdict: W3.4b-3 FAIL-CLOSED BEFORE NETWORK. NO LIVE INVOCATION. NO WEBDAV WRITE.',
  'blocker: `real-transport-w3-4b-live-executor-not-implemented`',
  'liveExecutorAvailable:false',
  'h2oRtFirstWriteExists:true',
  'h2oRtFirstWriteInvoked:false',
  'noAdHocWebDavRequestUsed:true',
  'receiptGrade: `write-grade`',
  'receiptNotExpiredAtBlockerCheck:true',
  'maxInvocations:1',
  'createOnlyPutMax:2',
  'readbackGetMax:1',
  'otherMethods:0',
  'registryPathSource: `app-local`',
  'writeGradeRegistryEligible:true',
  'credentialMaterialPresent:true',
  'allowedMethodSequence: `PROPFIND, PUT, PUT, GET`',
  'methodsAttempted: `none`',
  'methodStatusCodes: `none`',
  'networkAttempted:false',
  'targetPathCount:0',
  'createOnlyBehavior: `not-attempted`',
  'readBackHashMatch: `not-attempted`',
  'consumedMarkerCreated:false',
  'receiptConsumed:false',
  'receiptInvoked:false',
  'tokenBurnOccurred:false',
  'liveInvocationPerformed:false',
  'writesWebDAV:false',
  'forbiddenMethodUsed:false',
  'deleteCleanupPerformed:false',
  'productSyncReady:false',
  'transportReady:false',
  'W3.5 remains separate and blocked.',
]) {
  mustContain(flatEvidence, token, `evidence token ${token}`);
}

for (const token of [
  'pub fn h2o_rt_first_write',
  'FIRST_WRITE_LIVE_GATE',
  'real-transport-w3-first-write-loopback-mock-required',
  'DefaultFirstWriteLoopbackClient',
  'ReqwestFirstWriteLiveClient',
  'evaluate_first_write_with_client(request, &DefaultFirstWriteLoopbackClient)',
  'evaluate_first_write_live_with_client(request, &ReqwestFirstWriteLiveClient)',
  'network_attempted: false',
  'writes_webdav: false',
  'product_sync_ready: false',
  'transport_ready: false',
]) {
  mustContain(productionRust, token, `production Rust ${token}`);
}

for (const token of [
  'loopbackOnly',
  'networkAttempted: false',
  'writesWebDAV: false',
  'W3.4b live sacrificial invocation remains separate',
]) {
  mustContain(w34aValidator, token, `W3.4a validator ${token}`);
}

for (const token of [
  RECEIPT_HASH,
  'receiptConsumed:false',
  'receiptInvoked:false',
]) {
  mustContain(w34b2Validator, token, `W3.4b-2 validator ${token}`);
}

for (const token of [
  W34B2_COMMIT,
  RECEIPT_HASH,
  'tokenPrivateMaterialPresent:true',
  'registryPathSource: `app-local`',
  'writeGradeRegistryEligible:true',
  'credentialMaterialPresent:true',
  'liveInvocationPerformed:false',
]) {
  mustContain(w34b25Validator, token, `W3.4b-2.5 validator ${token}`);
}

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
  'createOnlyBehavior: `201-then-412`',
]) {
  mustNotContain(flatEvidence, token, `forbidden evidence claim ${token}`);
}

for (const token of [
  'reqwest::Method::PUT',
  'reqwest::Method::DELETE',
  'reqwest::Method::POST',
  'reqwest::Method::from_bytes(b"PUT")',
  'reqwest::Method::from_bytes(b"DELETE")',
  'reqwest::Method::from_bytes(b"POST")',
  '.put(',
  '.delete(',
  '.post(',
  'product_sync_ready: true',
  'transport_ready: true',
]) {
  mustNotContain(productionRust, token, `production Rust forbidden ${token}`);
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
  validator: 'validate-real-transport-w3-4b-3-live-sacrificial-invocation-blocked',
  evidencePath,
  invocationResult: 'fail-closed',
  blocker: 'real-transport-w3-4b-live-executor-not-implemented',
  receiptCoreHash: RECEIPT_HASH,
  methodsAttempted: [],
  networkAttempted: false,
  writesWebDAV: false,
  productSyncReady: false,
  transportReady: false,
  w35SeparateAndBlocked: true,
}, null, 2));
