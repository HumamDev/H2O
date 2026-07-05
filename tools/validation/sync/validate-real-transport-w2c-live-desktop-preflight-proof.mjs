#!/usr/bin/env node
//
// W2c live Desktop Studio first-write preflight proof validator.
//
// Validates the manual DevTools proof recorded for the loaded Desktop Studio
// runtime after W2b loader registration and the W2a execute/expiry safety
// patches. This validator only reads evidence and asserts the recorded W2c
// preflight proof plus non-activation boundaries.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const evidencePath = 'release-evidence/2026-07-05/real-transport-w2c-live-desktop-preflight-proof.md';
const expectedReceiptHash = 'sha256:a763ab0c20754b035b600df4c9e1be0bbbc938c61baa7852002e162f8e5d9b65';

function read(rel) {
  const abs = path.join(root, rel);
  assert.ok(fs.existsSync(abs), `missing ${rel}`);
  return fs.readFileSync(abs, 'utf8');
}

function compact(value) {
  return String(value).replace(/\s+/g, ' ');
}

function assertIncludes(source, token, label) {
  assert.ok(String(source).includes(token), `${label}: missing ${token}`);
}

function assertNotIncludes(source, token, label) {
  assert.ok(!String(source).includes(token), `${label}: forbidden ${token}`);
}

const evidence = read(evidencePath);
const flat = compact(evidence);

for (const token of [
  'W2c verdict PASS',
  '3c7e203eaa5d30c0198fa4977983e980f3658ac9',
  'a613264e2c168ccb460ab4e7a8d81dca1f171d57',
  '079369002da07c80c5553cd064064960ba58ebab',
  'e3217aac1af7fe2e1d46fe86ea0025f197565d80',
  'b08bb910791bdfd89c8a823da8987154787fd0d2',
  'eebbb8745d5bf1dba3ec145009c1ba6ae5bac1a5',
]) {
  assertIncludes(evidence, token, `anchor ${token}`);
}

for (const token of [
  'Desktop Studio runtime',
  'manual DevTools proof',
  'W2C_OPERATOR_ARTIFACTS_HASH_BOUND_READY_FOR_W2C_LIVE_PROOF',
  'H2O.Studio.sync.realTransportFirstWritePreflight.diagnose()',
  'H2O.Studio.sync.realTransportFirstWritePreflight.evaluateRealTransportFirstWritePreflight(request)',
  'H2O.Studio.sync.realTransportFirstWritePreflight.buildReceiptCore(result)',
]) {
  assertIncludes(flat, token, `runtime proof token ${token}`);
}

for (const token of [
  '"proofName": "W2c live Desktop Studio first-write preflight proof"',
  '"timestamp": "2026-07-05T22:18:24.629Z"',
  '"apiAvailable": true',
  '"diagnoseOk": true',
  '"validPreflightOk": true',
  '"receiptCoreGenerated": true',
  '"receiptCoreCanonicalization": "json-sorted-keys-v1"',
  `"receiptHash": "${expectedReceiptHash}"`,
  '"firstWriteAuthorizationCandidate": true',
  '"failClosedOk": true',
  '"zeroWriteOk": true',
  '"readinessOk": true',
  '"rawMarkersNotEchoed": true',
  '"w3Blocked": true',
  '"validStatus": "real-transport-w2-first-write-preflight-ready"',
  '"finalVerdict": "PASS"',
  '"failures": []',
]) {
  assertIncludes(evidence, token, `manual proof field ${token}`);
}

assert.match(evidence, /sha256:[0-9a-f]{64}/, 'receipt hash shape present');
assertIncludes(evidence, expectedReceiptHash, 'exact receipt hash');

for (const token of [
  'firstWriteAuthorizationCandidate:true',
  'standingAuthority:false',
  'oneShotTokenMinted:false',
  'realWriteExecuted:false',
  'productSyncReady:false',
  'transportReady:false',
  'writesWebDAV:false',
  'writesCloud:false',
  'writesRelay:false',
  'writesCAS:false',
  'writesFiles:false',
  'enqueuesRelay:false',
  'realOutboxRowCreated:false',
  'relayOutboxTouched:false',
  'publicationLedgerTouched:false',
  'durableStoreCreated:false',
  'fullBundleV3Started:false',
  'mintsExportId:false',
  'burnsSequence:false',
]) {
  assertIncludes(flat, token, `boundary field ${token}`);
}

const failClosedCases = [
  ['wrongGate', 'real-transport-w2-wrong-gate'],
  ['applyTrue', 'real-transport-w2-apply-requested'],
  ['executeTrue', 'real-transport-w2-execute-requested'],
  ['expiredExpiryUtc', 'real-transport-w2-expiry-expired'],
  ['missingW1cProof', 'real-transport-w2-w1c-proof-missing'],
  ['missingB8Artifact', 'real-transport-w2-b8-artifact-missing'],
  ['productSyncReadyTrue', 'real-transport-w2-product-sync-ready-claim-rejected'],
  ['transportReadyTrue', 'real-transport-w2-transport-ready-claim-rejected'],
  ['localMockApproval', 'real-transport-w2-local-mock-approval-rejected'],
  ['rawEndpoint', 'real-transport-w2-raw-input-rejected'],
  ['casInput', 'real-transport-w2-cas-input-rejected'],
  ['fullBundleV3', 'real-transport-w2-fullbundle-v3-rejected'],
  ['payloadCountGreaterThanOne', 'real-transport-w2-scope-not-single-payload'],
];

for (const [name, blocker] of failClosedCases) {
  assertIncludes(evidence, `"name": "${name}"`, `fail-closed case ${name}`);
  assertIncludes(evidence, `"blocker": "${blocker}"`, `fail-closed blocker ${blocker}`);
}

for (const token of [
  '"name": "standingAuthorityTrue"',
  '"name": "oneShotTokenMintedTrue"',
  'standingAuthorityTrue` -> passed, flag stayed false, zeroWriteOk:true',
  'oneShotTokenMintedTrue` -> passed, flag stayed false, zeroWriteOk:true',
]) {
  assertIncludes(evidence, token, `coercion case ${token}`);
}

for (const token of [
  'Raw/CAS markers were not echoed',
  '"rawMarkersNotEchoed": true',
  'createOnlyBehavior: unknown',
  'etagBehavior: unknown',
  'ifNoneMatchBehavior: unknown',
  '"createOnlyBehavior": "unknown"',
  '"etagBehavior": "unknown"',
  '"ifNoneMatchBehavior": "unknown"',
  'W3 remains blocked pending Fable red-team and byte-egress/remote-root risk review',
  'no real WebDAV/cloud/relay/CAS/file write',
  'no relay enqueue',
  'no outbox/ledger/store mutation',
  'no fullBundle.v3 start/mint',
  'no token/export id mint',
  'no sequence burn',
]) {
  assertIncludes(flat, token, `claim ${token}`);
}

for (const forbidden of [
  'real WebDAV/cloud/relay/CAS/file write occurred',
  'relay enqueue occurred',
  'outbox row was created',
  'ledger row was created',
  'durable store was created',
  'fullBundle.v3 was started',
  'export id was minted',
  'sequence was burned',
  'productSyncReady:true',
  'transportReady:true',
  'standingAuthority:true',
  'oneShotTokenMinted:true',
]) {
  assertNotIncludes(flat, forbidden, `forbidden claim ${forbidden}`);
}

console.log('[real-transport-w2c] live Desktop preflight proof validator passed');
