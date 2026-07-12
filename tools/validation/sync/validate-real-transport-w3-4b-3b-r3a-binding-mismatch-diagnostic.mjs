#!/usr/bin/env node
//
// W3.4b-3B-R3A receipt/payload/commit binding mismatch diagnostic validator.

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const evidencePath = 'release-evidence/2026-07-12/real-transport-w3-4b-3b-r3a-binding-mismatch-diagnostic.md';
const receiptCorePath = 'release-evidence/2026-07-12/real-transport-w3-4b-2-r3-write-grade-receipt-core.json';
const rustPath = 'apps/studio/desktop/src-tauri/src/real_transport_capability_probe.rs';

const R3_FAIL_CLOSED_COMMIT = 'ccda0878e21fd95afe1614c15b0b64cc17d510ea';
const R3_RECEIPT_COMMIT = '8c3422965c1202099c7177d4e63c53cf2b72a422';
const R3_READINESS_COMMIT = 'bab94bc677f6e38417f4ced98c0bd2b7404fa756';
const W34B3A_COMMIT = '3048ab2dba3f4cbff4ec199dbb36093975659b52';
const RENEWED_APPROVAL_COMMIT = '714f80a458808550dc8fd59ee937837349f416da';
const MISSING_TOKEN_COMMIT = 'd4171915b30cef69ef53234ef12a533e8ed6e846';
const LEGACY_APPROVAL_COMMIT = 'db4cdc5ccbd436913f05aa7b526fc14fec03e5ea';
const R3_RECEIPT_HASH = 'sha256:b34cd56a9d5a16fe3dc5319b174522f2c7634ad17717405310c18cec0188e1cd';
const RECEIPT_PAYLOAD_HASH = 'sha256:7d9491ac8a547de8e9e7138d8408b8d609359e4f74b690960201d093e1aaf440';
const INVOCATION_PAYLOAD_HASH = 'sha256:67b110e21148b315e5fef1acfb1c2ff39d9acc204ce47578b138a7df33af6829';

function read(rel) {
  const abs = path.join(root, rel);
  assert.ok(fs.existsSync(abs), `missing ${rel}`);
  return fs.readFileSync(abs, 'utf8');
}

function sorted(value) {
  if (Array.isArray(value)) return value.map(sorted);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sorted(value[key])]));
  }
  return value;
}

function sha256Ref(text) {
  return `sha256:${crypto.createHash('sha256').update(text).digest('hex')}`;
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
const receipt = JSON.parse(read(receiptCorePath));
const rust = read(rustPath);
const flatEvidence = compact(evidence);
const receiptHash = sha256Ref(JSON.stringify(sorted(receipt)));

assert.equal(receiptHash, R3_RECEIPT_HASH, 'R3 committed receipt hash must recompute');

for (const token of [
  R3_FAIL_CLOSED_COMMIT,
  R3_RECEIPT_COMMIT,
  R3_READINESS_COMMIT,
  W34B3A_COMMIT,
  RENEWED_APPROVAL_COMMIT,
  MISSING_TOKEN_COMMIT,
  LEGACY_APPROVAL_COMMIT,
  R3_RECEIPT_HASH,
  RECEIPT_PAYLOAD_HASH,
  INVOCATION_PAYLOAD_HASH,
  'Verdict: W3.4b-3B-R3A diagnosed the R3 pre-network blockers. NO LIVE INVOCATION. NO WEBDAV WRITE. NO TOKEN BURN.',
  'blocker: `real-transport-w3-first-write-payload-hash-mismatch`',
  'blocker: `real-transport-w3-first-write-commit-binding-mismatch`',
  'blocker: `real-transport-w3-write-grade-receipt-core-hash-mismatch`',
  'committedReceiptCoreHashMatches:true',
  'w34b1ExpiredOperatorApprovalCommit',
  'w34b1R2RenewedOperatorApprovalCommit',
  'w34b3BlockedMissingTokenCommit',
  'payloadPreimageCommitted:false',
  'payloadPreimageRecovered:false',
  'payloadHashMismatchRootCause: `invocation-payload-did-not-match-receipt-bound-payload-hash`',
  'r3ReceiptCoreValidAfterCodeFix:true',
  'r3CommitBindingValidAfterCodeFix:true',
  'r3PayloadBindingValid:false',
  'r3ReceiptUnconsumed:true',
  'r3ReceiptRetryReady:false',
  'r3ReceiptUsableForLiveRetry:false',
  'remintR4Required:true',
  'liveInvocationPerformed:false',
  'h2oRtFirstWriteLiveInvoked:false',
  'networkAttempted:false',
  'consumedMarkerCreated:false',
  'receiptConsumed:false',
  'receiptInvoked:false',
  'tokenBurnOccurred:false',
  'writesWebDAV:false',
  'productSyncReady:false',
  'transportReady:false',
]) {
  mustContain(flatEvidence, token, `evidence token ${token}`);
}

for (const token of [
  'liveInvocationPerformed:true',
  'h2oRtFirstWriteLiveInvoked:true',
  'networkAttempted:true',
  'consumedMarkerCreated:true',
  'receiptConsumed:true',
  'receiptInvoked:true',
  'tokenBurnOccurred:true',
  'writesWebDAV:true',
  'productSyncReady:true',
  'transportReady:true',
  'r3ReceiptRetryReady:true',
  'r3ReceiptUsableForLiveRetry:true',
  'remintR4Required:false',
]) {
  mustNotContain(flatEvidence, token, `forbidden evidence claim ${token}`);
}

for (const token of [
  'const W34B1_R2_RENEWED_OPERATOR_APPROVAL_COMMIT',
  'const W34B3B_MISSING_TOKEN_COMMIT',
  'w34b1_expired_operator_approval_commit',
  'w34b1_r2_renewed_operator_approval_commit',
  'w34b3_blocked_missing_token_commit',
  'rename = "w33DesignCommit"',
  'rename = "w33RegistryHardeningCommit"',
  'rename = "w33HashBoundaryCommit"',
  'fn without_null_json_values',
  'without_null_json_values(value)',
  'legacy_approval_binding_ok',
  'renewed_approval_binding_ok',
  'optional_missing_token_binding_ok',
  'first_write_accepts_renewed_approval_commit_binding',
  'first_write_r3_receipt_core_hash_matches_committed_core',
]) {
  mustContain(rust, token, `rust source token ${token}`);
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
  [/-----BEGIN/i, 'token-like PEM block'],
]) {
  assert.ok(!pattern.test(evidence), `evidence: ${label} found`);
}

console.log(JSON.stringify({
  ok: true,
  validator: 'validate-real-transport-w3-4b-3b-r3a-binding-mismatch-diagnostic',
  evidencePath,
  receiptCorePath,
  receiptCoreHash: receiptHash,
  receiptCoreMismatchRootCause: 'typed-null-expanded-rust-hash-shape',
  commitBindingMismatchRootCause: 'renewed-approval-binding-not-recognized',
  payloadHashMismatchRootCause: 'invocation-payload-did-not-match-receipt-bound-payload-hash',
  codeFixed: true,
  r3ReceiptRetryReady: false,
  remintR4Required: true,
  liveInvocationPerformed: false,
  writesWebDAV: false,
  productSyncReady: false,
  transportReady: false,
}, null, 2));
