#!/usr/bin/env node
//
// W3.3A write-grade receipt and explicit approval gate design validator.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const evidencePath = 'release-evidence/2026-07-07/real-transport-w3-3-write-grade-receipt-approval-gate-design.md';
const w31CloseoutPath = 'release-evidence/2026-07-06/real-transport-w3-1-live-readonly-webdav-probe-closeout.md';
const w32EvidencePath = 'release-evidence/2026-07-06/real-transport-w3-2-mock-webdav-executor-proof.md';
const rustProbePath = 'apps/studio/desktop/src-tauri/src/real_transport_capability_probe.rs';
const libPath = 'apps/studio/desktop/src-tauri/src/lib.rs';

const W31_CLOSEOUT_COMMIT = '7862270237955b86d48d943263fd53947cc71f72';
const W31_ALIGNMENT_COMMIT = '70e7fcc9669b939b505de96a7bb0ec61509c3370';
const W32_MOCK_COMMIT = '649849e7e48c7e5bc5924bc811d857f2435866ae';

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
const flatEvidence = compact(evidence);
const w31Closeout = read(w31CloseoutPath);
const w32Evidence = read(w32EvidencePath);
const rustProbe = read(rustProbePath);
const lib = read(libPath);
const productionRust = rustProbe.split('#[cfg(test)]')[0] || rustProbe;
const rustSurface = `${productionRust}\n${lib}`;

for (const token of [
  W31_CLOSEOUT_COMMIT,
  W31_ALIGNMENT_COMMIT,
  W32_MOCK_COMMIT,
]) {
  assertIncludes(evidence, token, `anchor ${token}`);
}

for (const token of [
  'Verdict: W3.3A DESIGN / EVIDENCE ONLY. NO WRITE AUTHORIZATION.',
  'W3.3A is evidence/design-only',
  'W3.3A does not authorize writes',
  'F1 - Current live descriptor registry is not write-grade safe',
  'under `/private/tmp` is not acceptable for',
  'app-owned local data path',
  'permission-checked, preferably `0600`',
  'descriptor registry content hash must be bound',
  're-verified immediately before the future PUT',
  'W3.4a is blocked until registry relocation and permission/owner verification are resolved',
  'must not silently inherit `/private/tmp` into write-grade execution',
  'F2 - Exactly one sacrificial object must authorize the create-only PUT pair',
  '`createOnlyPutMax:2`',
  'first create-only PUT: expected `201`',
  'second create-only PUT to the same object/path: expected `412`',
  '`readbackGetMax:1`',
  '`otherMethods:0`',
  'F3 - Consumed-marker gap must be stated honestly',
  'durable consumed marker may not exist',
  'apply-intent / consumed marker before network',
  '`maxInvocations:1`',
  'burns on first presentation regardless of outcome',
  'schema: h2o.sync.real-transport.write-grade-receipt.v1',
  'receiptGrade: write-grade',
  'mintUtc: <UTC>',
  'expiryUtc: <UTC>',
  'operationKind: first-sacrificial-probe-write',
  'payloadKind: capability-probe-object',
  'payloadCount: 1',
  'maxInvocations: 1',
  'createOnlyPutMax: 2',
  'readbackGetMax: 1',
  'otherMethods: 0',
  'pathClassRefHash',
  'payloadHash',
  'payloadByteMax: 256',
  'endpointRefHash',
  'remoteRootRefHash',
  'credentialRefHash',
  'descriptorRegistryRefHash',
  `w31CloseoutCommit: ${W31_CLOSEOUT_COMMIT}`,
  `w31AlignmentCommit: ${W31_ALIGNMENT_COMMIT}`,
  `w32MockProofCommit: ${W32_MOCK_COMMIT}`,
  'operatorApprovalArtifactHash',
  'oneShotTokenHash',
  'killSwitchTokenHash',
  'fixture/mock-grade material can never become write-grade by inference',
  '`receiptGrade: write-grade` must be explicit',
  'maximum receipt expiry window: `<=7 days`',
  'first sacrificial write recommended window: `<=72h`',
  'executor-enforced maximum receipt age',
  'future-dated `mintUtc` is refused',
  'git timestamp cross-check is required where practical',
  'I approve exactly one sacrificial probe object write: at most two create-only PUT requests to a single deterministic probe path, the second expected to fail with 412, one read-back GET, nothing else. No user data. No archive or fullBundle content. Expires <UTC>.',
  'This wording must not be treated as a live approval artifact in W3.3A.',
  '`PROPFIND` pre-write absence check',
  '`PUT` create-only max 2 to the same object/path',
  '`GET` read-back max 1',
  '`DELETE`',
  '`MKCOL`',
  '`PROPPATCH`',
  '`MOVE`',
  '`COPY`',
  '`LOCK`',
  '`UNLOCK`',
  '`POST`',
  'any second path',
  'any payload except tiny sentinel',
  'no DELETE cleanup in W3.4',
  'sentinel remains as accepted residual',
  'cleanup requires separate approval/phase',
  'binding mismatch',
  'grade mismatch',
  'fixture/mock-grade receipt',
  'stale receipt',
  'future receipt',
  'clock disagreement',
  'missing approval',
  'expired approval',
  'missing token hash',
  'token hash mismatch',
  'kill switch absent',
  'kill switch disabled',
  'kill switch stale',
  'registry wrong location',
  'registry wrong permissions',
  'registry wrong owner',
  'in-session PROPFIND target exists',
  'PUT #1 unexpected status',
  'PUT #2 `2xx`, which means createOnlyBehavior is not enforced and W3.5 is blocked',
  'redirect',
  '`401`',
  '`403`',
  'timeout/drop after send as remote-write-uncertain',
  'read-back hash mismatch',
  'hash refs',
  'status codes',
  'booleans',
  'blocker codes',
  'must not record',
  'raw endpoint',
  'raw path',
  'raw listing',
  'credential',
  'auth header',
  'response body',
  'private registry contents',
  'secret-derived fingerprint',
  'descriptorRegistryRefHash` preimage used for evidence must not include secret material',
  'should not be one-click-triggerable from normal UI',
  'scary warning and typed confirmation phrase',
  'raw one-shot token is never stored or remembered by UI',
  'DevTools/manual invocation is acceptable for W3.4 if safer',
  'W3.4a may implement refused-by-default command/validator/loopback tests only after F1 is resolved.',
  'W3.4b may perform one live sacrificial invocation only after separate operator go.',
  'archive/fullBundle write',
  'auto-retry',
  'background/boot dispatch',
  '`productSyncReady:true`',
  '`transportReady:true`',
  'Chat Saving CAS',
  'a950',
  'no write-grade receipt was minted',
  'no one-shot token was generated',
  'no kill-switch token was generated',
  'no approval artifact was created beyond template-only wording',
  '`h2o_rt_first_write` remains absent / not implemented in this phase',
  'no write command was added',
  'no live WebDAV probe was performed',
  'no WebDAV/cloud/relay/CAS/file write occurred',
  'no forbidden method was used',
  'no token/export-id/sequence burn occurred',
  'no relay/outbox/ledger/store mutation occurred',
  'no fullBundle.v3 start or mint occurred',
  '`productSyncReady:false`',
  '`transportReady:false`',
]) {
  assertIncludes(flatEvidence, token, `evidence token ${token}`);
}

for (const token of [
  'W3.1 LIVE READ-ONLY REMOTE-ROOT READINESS PASSED.',
  W31_ALIGNMENT_COMMIT,
  'This closeout does not authorize writes.',
]) {
  assertIncludes(w31Closeout, token, `W3.1 closeout token ${token}`);
}

for (const token of [
  'W3.2 MOCK EXECUTOR PROOF PASSED; REAL WRITE REMAINS BLOCKED.',
  'mockOnly:true',
  'networkAttempted:false',
  'writesWebDAV:false',
  'realWriteEligible:false',
]) {
  assertIncludes(w32Evidence, token, `W3.2 evidence token ${token}`);
}

for (const forbidden of [
  'W3.3A authorizes writes',
  'write-grade receipt minted:true',
  'one-shot token generated:true',
  'kill-switch token generated:true',
  'productSyncReady:false to true',
  'transportReady:false to true',
  'h2o_rt_first_write implemented',
]) {
  assertNotIncludes(flatEvidence, forbidden, `forbidden claim ${forbidden}`);
}

for (const [pattern, label] of [
  [/https?:\/\//i, 'raw URL literal'],
  [/\bpassword\s*[:=]/i, 'password value literal'],
  [/\bsecret\s*[:=]/i, 'secret value literal'],
  [/\bcredentialValue\s*[:=]/i, 'credential value literal'],
  [/\brawEndpoint\s*[:=]/i, 'raw endpoint literal'],
  [/\brawRemotePath\s*[:=]/i, 'raw remote path literal'],
  [/\brawListing\s*[:=]/i, 'raw listing literal'],
]) {
  assert.ok(!pattern.test(evidence), `evidence: ${label} found`);
}

console.log(JSON.stringify({
  ok: true,
  validator: 'validate-real-transport-w3-3-write-grade-receipt-approval-gate-design',
  evidenceOnly: true,
  writeAuthorized: false,
  f1RegistryRelocationBlocksW34a: true,
  receiptGrade: 'write-grade-design-only',
  createOnlyPutMax: 2,
  readbackGetMax: 1,
  otherMethods: 0,
  payloadByteMax: 256,
  maxInvocations: 1,
  w33aFirstWriteCommandExisted: false,
  productSyncReady: false,
  transportReady: false,
}, null, 2));
