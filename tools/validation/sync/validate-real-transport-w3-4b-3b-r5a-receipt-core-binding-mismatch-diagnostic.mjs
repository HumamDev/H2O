#!/usr/bin/env node
// W3.4b-3B-R5A receipt/core binding mismatch diagnostic validator.

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const evidencePath = 'release-evidence/2026-07-12/real-transport-w3-4b-3b-r5a-receipt-core-binding-mismatch-diagnostic.md';
const receiptCorePath = 'release-evidence/2026-07-12/real-transport-w3-4b-2-r5-write-grade-receipt-core.json';
const rustPath = 'apps/studio/desktop/src-tauri/src/real_transport_capability_probe.rs';

const R5_FAIL_CLOSED_COMMIT = '6f069450c302d251a225cdba16bc305ab61a0936';
const R5_RECEIPT_COMMIT = 'ad569f70f33c5610649e7da381045b08b6e32cd7';
const R5_READINESS_COMMIT = 'c3d4d1160cc63c8514dcd6877e9c81e20f1dca2b';
const RENEWED_APPROVAL_COMMIT = '714f80a458808550dc8fd59ee937837349f416da';
const R4_CLOSEOUT_COMMIT = 'f08f9b0f750e6d863a32c5de8f1edbe97955d0c1';
const W35B_FIX_COMMIT = '305ff023ad12f14b6a9b505dab4123cf44c7cfba';
const R5_RECEIPT_HASH = 'sha256:b27b6eb6ed238c15d9b687a85d2d8b98e9db4434a7c6b1d30df26e96aaddca57';

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

const evidence = read(evidencePath);
const receipt = JSON.parse(read(receiptCorePath));
const rust = read(rustPath);
const flatEvidence = compact(evidence);
const receiptHash = sha256Ref(JSON.stringify(sorted(receipt)));

assert.equal(receiptHash, R5_RECEIPT_HASH, 'R5 committed receipt hash must recompute');

for (const token of [
  R5_FAIL_CLOSED_COMMIT,
  R5_RECEIPT_COMMIT,
  R5_READINESS_COMMIT,
  RENEWED_APPROVAL_COMMIT,
  R4_CLOSEOUT_COMMIT,
  W35B_FIX_COMMIT,
  R5_RECEIPT_HASH,
  'real-transport-w3-first-write-commit-binding-mismatch',
  'real-transport-w3-write-grade-receipt-core-hash-mismatch',
  'committedReceiptCoreHashMatches:true',
  'w34b3R4NoWriteCloseoutCommit',
  'w35bParentPropfindFixCommit',
  'w34b1R2RenewedOperatorApprovalCommit',
  'r5ReceiptCoreValidAfterCodeFix:true',
  'r5CommitBindingValidAfterCodeFix:true',
  'r5ReceiptUnconsumed:true',
  'r5ReceiptUsableForRetryAfterFreshApproval:true',
  'remintR6Required:false',
  'recommendation: `R5 retry after fix and fresh approval`',
  'liveInvocationPerformed:false',
  'networkAttempted:false',
  'consumedMarkerCreated:false',
  'receiptConsumed:false',
  'tokenBurnOccurred:false',
  'writesWebDAV:false',
  'productSyncReady:false',
  'transportReady:false',
]) {
  assert.ok(flatEvidence.includes(token), `evidence missing ${token}`);
}

for (const token of [
  'liveInvocationPerformed:true',
  'networkAttempted:true',
  'consumedMarkerCreated:true',
  'receiptConsumed:true',
  'tokenBurnOccurred:true',
  'writesWebDAV:true',
  'productSyncReady:true',
  'transportReady:true',
  'remintR6Required:true',
]) {
  assert.ok(!flatEvidence.includes(token), `forbidden evidence claim ${token}`);
}

for (const token of [
  'w34b3_r4_no_write_closeout_commit',
  'w35b_parent_propfind_fix_commit',
  'W34B3_R4_NO_WRITE_CLOSEOUT_COMMIT',
  'W35B_PARENT_PROPFIND_FIX_COMMIT',
  'optional_r4_closeout_binding_ok',
  'optional_w35b_parent_propfind_binding_ok',
  'first_write_r5_receipt_core_and_commit_bindings_match_committed_core',
]) {
  assert.ok(rust.includes(token), `Rust source missing ${token}`);
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
  assert.ok(!pattern.test(evidence), `evidence contains ${label}`);
}

console.log(JSON.stringify({
  ok: true,
  validator: 'validate-real-transport-w3-4b-3b-r5a-receipt-core-binding-mismatch-diagnostic',
  evidencePath,
  receiptCorePath,
  receiptCoreHash: receiptHash,
  receiptCoreMismatchRootCause: 'typed-binding-dropped-r5-anchor-fields-before-hashing',
  commitBindingMismatchRootCause: 'renewed-approval-validation-required-omitted-historical-anchor',
  codeFixed: true,
  r5ReceiptUnconsumed: true,
  r5ReceiptUsableAfterFreshApproval: true,
  remintR6Required: false,
  liveInvocationPerformed: false,
  writesWebDAV: false,
  productSyncReady: false,
  transportReady: false,
}, null, 2));
