#!/usr/bin/env node
//
// W3.4b-0 sacrificial write approval package/checklist validator.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const packagePath = 'release-evidence/2026-07-07/real-transport-w3-4b-0-sacrificial-write-approval-package.md';
const checklistPath = 'release-evidence/2026-07-07/real-transport-w3-4b-0-live-invocation-checklist.md';
const w34aEvidencePath = 'release-evidence/2026-07-07/real-transport-w3-4a-refused-first-write-command-proof.md';

const W31_CLOSEOUT_COMMIT = '7862270237955b86d48d943263fd53947cc71f72';
const W31_ALIGNMENT_COMMIT = '70e7fcc9669b939b505de96a7bb0ec61509c3370';
const W32_MOCK_PROOF_COMMIT = '649849e7e48c7e5bc5924bc811d857f2435866ae';
const W33A_DESIGN_COMMIT = '671fdc1c855b345185e5ea257b206c0a07cdab36';
const W33B_STORAGE_COMMIT = '388a952745ab7a21ba9556531eccf5c7e0ffe1ce';
const W33C_HASH_BOUNDARY_COMMIT = 'aba4c70068d95ee373d157fddea06bfb31b505b0';
const W34A_REFUSED_COMMAND_COMMIT = 'a830ccb6b633a9d6cee35e6db92464e870d5693d';

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

const approvalPackage = read(packagePath);
const checklist = read(checklistPath);
read(w34aEvidencePath);
const combined = `${approvalPackage}\n${checklist}`;
const flatCombined = compact(combined);

for (const token of [
  W31_CLOSEOUT_COMMIT,
  W31_ALIGNMENT_COMMIT,
  W32_MOCK_PROOF_COMMIT,
  W33A_DESIGN_COMMIT,
  W33B_STORAGE_COMMIT,
  W33C_HASH_BOUNDARY_COMMIT,
  W34A_REFUSED_COMMAND_COMMIT,
]) {
  mustContain(approvalPackage, token, `approval package anchor ${token}`);
  mustContain(checklist, token, `checklist anchor ${token}`);
}

for (const doc of [
  ['approval package', approvalPackage],
  ['checklist', checklist],
]) {
  const [label, source] = doc;
  mustContain(source, APPROVAL_WORDING, `${label} exact approval wording`);
  for (const token of [
    'createOnlyPutMax:2',
    'readbackGetMax:1',
    'otherMethods:0',
    'productSyncReady:false',
    'transportReady:false',
    'writesWebDAV:false',
    'DELETE',
    'MKCOL',
    'PROPPATCH',
    'MOVE',
    'COPY',
    'LOCK',
    'UNLOCK',
    'POST',
  ]) {
    mustContain(source, token, `${label} token ${token}`);
  }
}

for (const token of [
  'Verdict: W3.4b-0 PREPARES THE LIVE SACRIFICIAL WRITE APPROVAL PACKAGE ONLY. NO LIVE INVOCATION. NO WEBDAV WRITE.',
  'template/checklist artifact',
  'not a completed operator approval',
  'does not mint a write-grade receipt',
  'does not generate one-shot or kill-switch token material',
  'does not authorize `h2o_rt_first_write` invocation',
  'writeGradeReceiptMinted:false',
  'writeGradeReceiptState: `not-minted`',
  'approvalArtifactCompleted:false',
  'oneShotTokenGenerated:false',
  'killSwitchTokenGenerated:false',
  'No cleanup is authorized in W3.4b',
  'The sentinel remains as accepted residual',
  'no live invocation was performed in W3.4b-0',
  'no WebDAV/cloud/relay/CAS/file write occurred',
  'no forbidden method was used',
  'no write-grade receipt was minted',
  'no real one-shot token was generated',
  'no real kill-switch token was generated',
]) {
  mustContain(flatCombined, token, `combined evidence token ${token}`);
}

for (const token of [
  'Confirm app-local or eligible env registry path.',
  'Confirm writeGradeRegistryEligible:true.',
  'Confirm owner/permission checks pass.',
  'Confirm writeGradeRegistryRefHash available.',
  'Confirm saved credential present.',
  'Confirm W3.1 read-only closeout exists.',
  'Confirm W3.4a refused-by-default command exists.',
  'Confirm approval artifact is completed.',
  'Confirm receipt expiry <=72h.',
  'Confirm one-shot token prepared out-of-repo.',
  'Confirm kill-switch token prepared out-of-repo.',
  'Confirm deterministic sacrificial path class hash only, no raw path in evidence.',
  'Confirm tiny sentinel payload hash only, payload <=256 bytes.',
  'Confirm no archive/fullBundle/user data.',
  'Confirm operator has explicitly approved W3.4b live invocation.',
  'Confirm W3.4b must stop immediately on any unexpected status, redirect, 401/403, timeout, or read-back mismatch.',
]) {
  mustContain(checklist, token, `checklist item ${token}`);
}

for (const token of [
  'liveInvocationPerformed:true',
  'writeGradeReceiptMinted:true',
  'approvalArtifactCompleted:true',
  'oneShotTokenGenerated:true',
  'killSwitchTokenGenerated:true',
  'writesWebDAV:true',
  'live write occurred',
  'live PUT performed',
  'receipt minted',
  'token generated',
]) {
  mustNotContain(flatCombined, token, `forbidden live-write claim ${token}`);
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
  assert.ok(!pattern.test(combined), `evidence: ${label} found`);
}

console.log(JSON.stringify({
  ok: true,
  validator: 'validate-real-transport-w3-4b-0-sacrificial-write-approval-package',
  approvalPackage: packagePath,
  checklist: checklistPath,
  w34aCommit: W34A_REFUSED_COMMAND_COMMIT,
  liveInvocationPerformed: false,
  writeGradeReceiptMinted: false,
  oneShotTokenGenerated: false,
  killSwitchTokenGenerated: false,
  writesWebDAV: false,
  productSyncReady: false,
  transportReady: false,
}, null, 2));
