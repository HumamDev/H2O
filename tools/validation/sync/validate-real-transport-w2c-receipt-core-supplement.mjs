#!/usr/bin/env node
//
// W2c receipt core supplement validator.
//
// Recomputes sha256 over the committed receiptCore bytes and verifies that
// the W2c receipt hash is reproducible for W3 review without touching source
// modules, loaders, or transport logic.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const evidencePath = 'release-evidence/2026-07-06/real-transport-w2c-receipt-core-supplement.md';
const originalHash = 'sha256:a763ab0c20754b035b600df4c9e1be0bbbc938c61baa7852002e162f8e5d9b65';

const protectedPaths = [
  'src-surfaces-base/studio/sync/real-transport-first-write-preflight.js',
  'src-surfaces-base/studio/studio.html',
  'tools/product/studio/pack-studio.mjs',
  'src-surfaces-base/studio/sync/webdav-transport-gates.js',
];

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

function gitClean(rel) {
  const unstaged = execFileSync('git', ['diff', '--name-only', '--', rel], { cwd: root, encoding: 'utf8' }).trim();
  const staged = execFileSync('git', ['diff', '--cached', '--name-only', '--', rel], { cwd: root, encoding: 'utf8' }).trim();
  assert.equal(unstaged, '', `${rel}: unstaged changes present`);
  assert.equal(staged, '', `${rel}: staged changes present`);
}

const evidence = read(evidencePath);
const flat = compact(evidence);

for (const token of [
  '7e431b16c9f0665514eecd31dd0e0273972daed6',
  '3c7e203eaa5d30c0198fa4977983e980f3658ac9',
  'a613264e2c168ccb460ab4e7a8d81dca1f171d57',
  '079369002da07c80c5553cd064064960ba58ebab',
  'e3217aac1af7fe2e1d46fe86ea0025f197565d80',
  'b08bb910791bdfd89c8a823da8987154787fd0d2',
]) {
  assertIncludes(evidence, token, `anchor ${token}`);
}

const receiptMatch = evidence.match(/```receiptCore\n([\s\S]*?)\n```/);
assert.ok(receiptMatch, 'receiptCore fence present');
const receiptCore = receiptMatch[1];
assert.ok(receiptCore.startsWith('{') && receiptCore.endsWith('}'), 'receiptCore is single JSON object line');
assert.ok(!receiptCore.includes('\n'), 'receiptCore has no embedded newline');

const recomputedHash = `sha256:${createHash('sha256').update(receiptCore, 'utf8').digest('hex')}`;
assertIncludes(evidence, `Externally recomputed sha256(receiptCore): \`${recomputedHash}\``,
  'documented recomputed hash');

assert.match(recomputedHash, /^sha256:[0-9a-f]{64}$/, 'recomputed hash shape');
if (evidence.includes('Verdict: RECEIPT CONFIRMED')) {
  assert.equal(recomputedHash, originalHash, 'confirmed receipt hash matches original W2c hash');
  assertIncludes(evidence, `Original W2c recorded receipt hash: \`${originalHash}\``, 'original hash');
} else if (evidence.includes('Verdict: RECEIPT SUPERSEDED')) {
  assert.notEqual(recomputedHash, originalHash, 'superseded receipt hash must differ');
  assertIncludes(evidence, 'old hash void for W3', 'old hash void marker');
  assert.match(recomputedHash, /^sha256:[0-9a-f]{64}$/, 'new hash shape');
} else {
  assert.fail('receipt verdict must be RECEIPT CONFIRMED or RECEIPT SUPERSEDED');
}

const receipt = JSON.parse(receiptCore);
assert.equal(receipt.canonicalization, 'json-sorted-keys-v1', 'canonicalization');
assert.equal(receipt.expiryUtc, '2099-07-06T00:00:00.000Z', 'expiryUtc');
assert.match(receipt.expiryUtc, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/, 'expiry UTC shape');
assert.deepEqual(receipt.targetScope, {
  payloadCount: 1,
  payloadKind: 'single-fullbundle-v2-envelope',
  targetRefHash: 'sha256:a79b8dd5fc4fed2c95248eaeb24796baf28c616aeb819e26cd4ee4f8aa459e45',
}, 'targetScope');
assert.deepEqual(receipt.w3InvocationScope, {
  expiryUtc: '2099-07-06T00:00:00.000Z',
  maxInvocations: 1,
  operationKind: 'first-controlled-real-write',
}, 'w3InvocationScope');
assert.equal(receipt.w3InvocationScope.maxInvocations, 1, 'maxInvocations');
assert.equal(receipt.w3InvocationScope.operationKind, 'first-controlled-real-write', 'operationKind');
assert.equal(receipt.candidateOnly, true, 'candidate-only receipt');
assert.equal(receipt.standingAuthority, false, 'standingAuthority false');
assert.equal(receipt.oneShotTokenMinted, false, 'oneShotTokenMinted false');
assert.equal(receipt.boundaries.realWriteExecuted, false, 'realWriteExecuted false');
assert.equal(receipt.boundaries.productSyncReady, false, 'productSyncReady false');
assert.equal(receipt.boundaries.transportReady, false, 'transportReady false');
assert.equal(receipt.boundaries.fullBundleV3Started, false, 'fullBundleV3Started false');
assert.equal(receipt.boundaries.mintsExportId, false, 'mintsExportId false');
assert.equal(receipt.boundaries.burnsSequence, false, 'burnsSequence false');
assert.equal(receipt.boundaries.writesWebDAV, false, 'writesWebDAV false');
assert.equal(receipt.boundaries.writesCloud, false, 'writesCloud false');
assert.equal(receipt.boundaries.writesRelay, false, 'writesRelay false');
assert.equal(receipt.boundaries.enqueuesRelay, false, 'enqueuesRelay false');
assert.equal(receipt.boundaries.writesCAS, false, 'writesCAS false');
assert.equal(receipt.boundaries.writesFiles, false, 'writesFiles false');

for (const token of [
  'receiptCoreCanonicalization: `json-sorted-keys-v1`',
  'Evaluated targetScope',
  'Evaluated w3InvocationScope',
  'receipt is candidate-only',
  'standingAuthority:false',
  'oneShotTokenMinted:false',
  'realWriteExecuted:false',
  'productSyncReady:false',
  'transportReady:false',
  'createOnlyBehavior: unknown',
  'etagBehavior: unknown',
  'ifNoneMatchBehavior: unknown',
  'no real WebDAV/cloud/relay/CAS/file write',
  'no relay enqueue',
  'no outbox/ledger/store mutation',
  'no fullBundle.v3 start/mint',
  'no export id mint',
  'no sequence burn',
  'W3 remains blocked pending ADR/red-team/design',
]) {
  assertIncludes(flat, token, `evidence token ${token}`);
}

for (const [pattern, label] of [
  [/https?:\/\//i, 'raw URL literal'],
  [/webdav:\/\//i, 'raw WebDAV URL literal'],
  [/\/remote\/|\/webdav\/|\/dav\//i, 'raw remote path-looking literal'],
  [/-----BEGIN [A-Z ]+-----/, 'credential block literal'],
  [/\bpassword\s*[:=]/i, 'password value literal'],
  [/\bsecret\s*[:=]/i, 'secret value literal'],
  [/\btokenValue\s*[:=]/i, 'token value literal'],
  [/\bcredentialValue\s*[:=]/i, 'credential value literal'],
  [/\bpayloadBody\s*[:=]/i, 'payload body value literal'],
  [/\bcasKey\s*[:=]/i, 'CAS key value literal'],
  [/\brawListing\s*[:=]/i, 'raw listing value literal'],
]) {
  assert.ok(!pattern.test(receiptCore), `${label} found in receiptCore`);
}

for (const forbidden of [
  'fullBundleV3Started":true',
  'mintsExportId":true',
  'burnsSequence":true',
  'writesWebDAV":true',
  'writesCloud":true',
  'writesRelay":true',
  'writesCAS":true',
  'writesFiles":true',
  'enqueuesRelay":true',
  'realWriteExecuted":true',
  'productSyncReady":true',
  'transportReady":true',
]) {
  assertNotIncludes(receiptCore, forbidden, `receipt forbidden ${forbidden}`);
}

for (const rel of protectedPaths) gitClean(rel);

console.log(JSON.stringify({
  ok: true,
  validator: 'validate-real-transport-w2c-receipt-core-supplement',
  verdict: evidence.includes('Verdict: RECEIPT CONFIRMED') ? 'RECEIPT_CONFIRMED' : 'RECEIPT_SUPERSEDED',
  receiptHash: recomputedHash,
  expiryUtc: receipt.expiryUtc,
  targetScope: receipt.targetScope,
  w3InvocationScope: receipt.w3InvocationScope,
  productSyncReady: false,
  transportReady: false,
  realTransportWrite: false,
  w3Blocked: true,
}, null, 2));
