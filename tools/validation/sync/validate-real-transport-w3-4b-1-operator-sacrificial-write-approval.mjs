#!/usr/bin/env node
//
// W3.4b-1 operator sacrificial write approval validator.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const approvalPath = 'release-evidence/2026-07-07/real-transport-w3-4b-1-operator-sacrificial-write-approval.md';
const packageValidatorPath = 'tools/validation/sync/validate-real-transport-w3-4b-0-sacrificial-write-approval-package.mjs';

const W31_CLOSEOUT_COMMIT = '7862270237955b86d48d943263fd53947cc71f72';
const W31_ALIGNMENT_COMMIT = '70e7fcc9669b939b505de96a7bb0ec61509c3370';
const W32_MOCK_PROOF_COMMIT = '649849e7e48c7e5bc5924bc811d857f2435866ae';
const W33A_DESIGN_COMMIT = '671fdc1c855b345185e5ea257b206c0a07cdab36';
const W33B_STORAGE_COMMIT = '388a952745ab7a21ba9556531eccf5c7e0ffe1ce';
const W33C_HASH_BOUNDARY_COMMIT = 'aba4c70068d95ee373d157fddea06bfb31b505b0';
const W34A_REFUSED_COMMAND_COMMIT = 'a830ccb6b633a9d6cee35e6db92464e870d5693d';
const W34B0_APPROVAL_PACKAGE_COMMIT = 'd196f4b26d904394c435c15dd14d12cd18f03190';

const APPROVAL_WORDING = 'I approve exactly one sacrificial probe object write: at most two create-only PUT requests to a single deterministic probe path, the second expected to fail with 412, one read-back GET, nothing else. No user data. No archive or fullBundle content. Expires <UTC>.';

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

function parseUtcSeconds(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})Z$/.exec(value);
  assert.ok(match, `invalid UTC timestamp ${value}`);
  const [, year, month, day, hour, minute, second] = match.map(Number);
  return Date.UTC(year, month - 1, day, hour, minute, second) / 1000;
}

const evidence = read(approvalPath);
read(packageValidatorPath);
const flatEvidence = compact(evidence);

for (const token of [
  W31_CLOSEOUT_COMMIT,
  W31_ALIGNMENT_COMMIT,
  W32_MOCK_PROOF_COMMIT,
  W33A_DESIGN_COMMIT,
  W33B_STORAGE_COMMIT,
  W33C_HASH_BOUNDARY_COMMIT,
  W34A_REFUSED_COMMAND_COMMIT,
  W34B0_APPROVAL_PACKAGE_COMMIT,
]) {
  mustContain(evidence, token, `anchor ${token}`);
}

mustContain(evidence, APPROVAL_WORDING, 'exact approval wording');
mustContain(
  evidence,
  'I approve exactly one sacrificial probe object write: at most two create-only PUT requests to a single deterministic probe path, the second expected to fail with 412, one read-back GET, nothing else. No user data. No archive or fullBundle content. Expires 2026-07-10T16:00:00Z.',
  'concrete approval instance',
);

const approvalUtc = /approvalUtc: `([^`]+)`/.exec(evidence)?.[1];
const expiryUtc = /expiryUtc: `([^`]+)`/.exec(evidence)?.[1];
assert.ok(approvalUtc, 'missing approvalUtc');
assert.ok(expiryUtc, 'missing expiryUtc');
const approvalSeconds = parseUtcSeconds(approvalUtc);
const expirySeconds = parseUtcSeconds(expiryUtc);
assert.ok(expirySeconds > approvalSeconds, 'expiryUtc must be after approvalUtc');
assert.ok(expirySeconds - approvalSeconds <= 72 * 60 * 60, 'expiryUtc must be within 72 hours');

for (const token of [
  'Verdict: W3.4b-1 RECORDS OPERATOR APPROVAL ONLY. NO LIVE INVOCATION. NO WEBDAV WRITE.',
  'createOnlyPutMax:2',
  'readbackGetMax:1',
  'otherMethods:0',
  'PROPFIND pre-write absence check',
  'PUT create-only, maximum two requests to one deterministic path',
  'GET read-back, maximum one request',
  'DELETE',
  'MKCOL',
  'PROPPATCH',
  'MOVE',
  'COPY',
  'LOCK',
  'UNLOCK',
  'POST',
  'No cleanup is authorized',
  'No DELETE cleanup is allowed',
  'The sentinel remains as accepted residual',
  'Chat Saving CAS',
  'background dispatch',
  'liveInvocationPerformed:false',
  'writeGradeReceiptMinted:false',
  'oneShotTokenGenerated:false',
  'killSwitchTokenGenerated:false',
  'writesWebDAV:false',
  'productSyncReady:false',
  'transportReady:false',
  'Approval artifact hash is not recorded',
  'no live invocation was performed in W3.4b-1',
  'no WebDAV/cloud/relay/CAS/file write occurred',
  'no forbidden method was used',
  'no write-grade receipt was minted',
  'no real one-shot token was generated',
  'no real kill-switch token was generated',
]) {
  mustContain(flatEvidence, token, `evidence token ${token}`);
}

for (const token of [
  'liveInvocationPerformed:true',
  'writeGradeReceiptMinted:true',
  'oneShotTokenGenerated:true',
  'killSwitchTokenGenerated:true',
  'writesWebDAV:true',
  'live write occurred',
  'live PUT performed',
  'receipt minted',
  'token generated',
]) {
  mustNotContain(flatEvidence, token, `forbidden live claim ${token}`);
}

for (const [pattern, label] of [
  [/https?:\/\//i, 'raw URL literal'],
  [/\bpassword\s*[:=]/i, 'password value literal'],
  [/\btokenMaterial\s*[:=]/i, 'token material literal'],
  [/\boneShotToken\s*[:=]/i, 'one-shot token value literal'],
  [/\bkillSwitchToken\s*[:=]/i, 'kill-switch token value literal'],
  [/\bauthHeader\s*[:=]/i, 'auth header value literal'],
  [/\brawEndpoint\s*[:=]/i, 'raw endpoint literal'],
  [/\brawPath\s*[:=]/i, 'raw path literal'],
  [/\brawListing\s*[:=]/i, 'raw listing literal'],
  [/\bresponseBody\s*[:=]/i, 'response body literal'],
  [/\bprivateRegistryContents\s*[:=]/i, 'private registry literal'],
  [/sha256:[0-9a-f]{64}/i, 'secret-like hash value'],
]) {
  assert.ok(!pattern.test(evidence), `evidence: ${label} found`);
}

console.log(JSON.stringify({
  ok: true,
  validator: 'validate-real-transport-w3-4b-1-operator-sacrificial-write-approval',
  approvalArtifact: approvalPath,
  approvalUtc,
  expiryUtc,
  expiryWithin72h: true,
  liveInvocationPerformed: false,
  writeGradeReceiptMinted: false,
  oneShotTokenGenerated: false,
  killSwitchTokenGenerated: false,
  writesWebDAV: false,
  productSyncReady: false,
  transportReady: false,
}, null, 2));
