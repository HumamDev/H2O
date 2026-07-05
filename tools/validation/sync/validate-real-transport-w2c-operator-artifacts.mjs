#!/usr/bin/env node
//
// W2c operator artifacts validator.
//
// Validates the prepared operator artifacts. Pending operator hash placeholders
// are allowed here, but keep W2c live proof blocked.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const base = 'release-evidence/2026-07-05';

const files = {
  b8: `${base}/real-transport-w2c-b8-approval-artifact.md`,
  rollback: `${base}/real-transport-w2c-rollback-rehearsal-receipt.md`,
  remoteRoot: `${base}/real-transport-w2c-remote-root-initial-state.md`,
  recovery: `${base}/real-transport-w2c-partial-write-recovery-plan.md`,
};

const requiredAnchors = [
  'ab82ba70',
  'e3217aac',
  'b08bb910',
];

const forbiddenAuthorityTokens = [
  'productSyncReady:true',
  'transportReady:true',
  'realWebDAVTransportAvailable:true',
  'standingAuthority:true',
  'oneShotTokenMinted:true',
  'writesWebDAV:true',
  'enqueuesRelay:true',
  'fullBundleV3Started:true',
  'mintsExportId:true',
  'burnsSequence:true',
];

const rawPatterns = [
  [/https?:\/\//i, 'raw URL literal'],
  [/webdav:\/\//i, 'raw WebDAV URL literal'],
  [/\/remote\/|\/webdav\/|\/dav\//i, 'raw remote path-looking literal'],
  [/-----BEGIN [A-Z ]+-----/, 'credential block literal'],
  [/\bpassword\s*[:=]/i, 'password literal'],
  [/\bsecret\s*[:=]/i, 'secret literal'],
  [/\bcasKey\s*[:=]\s*[^<\s]/i, 'CAS key value literal'],
  [/\bpayloadBody\s*[:=]\s*[^<\s]/i, 'payload body value literal'],
];

function read(rel) {
  const abs = path.join(root, rel);
  assert.ok(fs.existsSync(abs), `missing ${rel}`);
  return fs.readFileSync(abs, 'utf8');
}

function compact(value) {
  return String(value).replace(/\s+/g, '');
}

function assertIncludes(source, token, label) {
  assert.ok(source.includes(token), `${label}: missing ${token}`);
}

function assertNoRawOrAuthority(source, rel) {
  const packed = compact(source);
  for (const token of forbiddenAuthorityTokens) {
    assert.ok(!packed.includes(token), `${rel}: forbidden authority token ${token}`);
  }
  for (const [pattern, label] of rawPatterns) {
    assert.ok(!pattern.test(source), `${rel}: ${label} found`);
  }
}

function pendingFields(source) {
  return [...source.matchAll(/PENDING_OPERATOR_HASH:([A-Za-z0-9_-]+)/g)].map((m) => m[1]);
}

function hashishValues(source) {
  return [...source.matchAll(/-\s+([A-Za-z0-9]+Hash):\s+([^\n]+)/g)].map((m) => ({
    field: m[1],
    value: m[2].trim(),
  }));
}

function assertHashesAreRealOrPending(source, rel) {
  for (const { field, value } of hashishValues(source)) {
    assert.ok(
      /^sha256:[0-9a-f]{64}$/.test(value) || value === `PENDING_OPERATOR_HASH:${field}`,
      `${rel}: ${field} must be sha256:<64hex> or PENDING_OPERATOR_HASH:${field}`,
    );
  }
}

function assertCommon(source, rel) {
  for (const anchor of requiredAnchors) assertIncludes(source, anchor, `${rel} anchor ${anchor}`);
  assertIncludes(source, 'not W2c live proof', `${rel} not live proof`);
  assertIncludes(source, 'not W2c PASS', `${rel} not W2c PASS`);
  assertIncludes(source, 'hash-only', `${rel} hash-only`);
  assertIncludes(source, 'No W2 receipt was generated', `${rel} no receipt`);
  assertIncludes(source, 'W2c live proof remains blocked', `${rel} W2c blocked`);
  assertIncludes(source, 'productSyncReady: false', `${rel} productSyncReady false`);
  assertIncludes(source, 'transportReady: false', `${rel} transportReady false`);
  assertIncludes(source, 'fullBundle.v3 is not started or minted', `${rel} no fullBundle.v3`);
  assertIncludes(source, 'a950 mutation is not authorized', `${rel} no a950 mutation`);
  assertIncludes(source, 'Chat Saving CAS remains separate and blocked', `${rel} no Chat Saving CAS`);
  assertNoRawOrAuthority(source, rel);
  assertHashesAreRealOrPending(source, rel);
}

const loaded = Object.fromEntries(Object.entries(files).map(([name, rel]) => [name, read(rel)]));
for (const [name, source] of Object.entries(loaded)) assertCommon(source, files[name]);

for (const token of [
  'schema: h2o.studio.transport.real-webdav-cloud-relay-transport-apply-approval.v1',
  'approved: true',
  'reviewedRealTransportApplyApproved: true',
  'realWebDAVCloudRelayApproved: true',
  'scope: "real-webdav-cloud-relay-target"',
  'operatorIdHash',
  'reviewIdHash',
  'approvedAtIso',
  'b8ApprovalArtifactHash',
  'b8ApprovalRefHash',
  'endpointRefHash',
  'remoteRootRefHash',
  'credentialRefHash',
  'peerIdentityBindingHash',
  'localClientIdentityHash',
  'candidatePayloadHash',
  'candidateBundleHash',
  'fullBundleV2EnvelopeHash',
  'noA950Mutation: true',
  'noCleanupAuthority: true',
  'noFullBundleV3: true',
  'chatSavingCasSeparate: true',
  'noChatSavingCAS: true',
]) {
  assertIncludes(loaded.b8, token, `B8 ${token}`);
}

for (const token of [
  'killSwitchEnableTokenHash',
  'disableRehearsalReceiptHash',
  'disableBlocksPreflight: true',
  'noWriteEnqueueStoreLedgerExportMutationOccurred: true',
]) {
  assertIncludes(loaded.rollback, token, `rollback ${token}`);
}

for (const token of [
  'remoteRootRefHash',
  'endpointRefHash',
  'initialStateStatementHash',
  'expectedEmptyOrListingHash',
  'createOnlyBehavior: unknown',
  'etagBehavior: unknown',
  'ifNoneMatchBehavior: unknown',
  'rawUrlIncluded: false',
  'rawRemotePathIncluded: false',
]) {
  assertIncludes(loaded.remoteRoot, token, `remote-root ${token}`);
}

for (const token of [
  'recoveryPlanHash',
  'explicitRecoveryRequiredForUncertainWrite: true',
  'noBlindRetry: true',
  'verifyThenLedger: true',
  'killSwitchDisableFirstResponse: true',
  'manualCleanupStepsContainRawEndpointCredentialPath: false',
]) {
  assertIncludes(loaded.recovery, token, `recovery ${token}`);
}

const pending = Object.fromEntries(Object.entries(loaded).map(([name, source]) => [name, pendingFields(source)]));
const pendingFlat = Object.values(pending).flat();
const allHashValues = Object.values(loaded).flatMap((source) => hashishValues(source));
const allHashesReady = allHashValues.every(({ value }) => /^sha256:[0-9a-f]{64}$/.test(value)) && pendingFlat.length === 0;
const status = allHashesReady
  ? 'W2C_OPERATOR_ARTIFACTS_HASH_BOUND_READY_FOR_W2C_LIVE_PROOF'
  : 'W2C_OPERATOR_ARTIFACTS_PREPARED_PENDING_HASHES';

console.log(JSON.stringify({
  ok: true,
  validator: 'validate-real-transport-w2c-operator-artifacts',
  status,
  w2cLiveProofBlocked: !allHashesReady,
  pendingOperatorHashFields: pending,
  filesChecked: Object.keys(files).length,
  realTransportWrite: false,
  enqueuesRelay: false,
  receiptGenerated: false,
  tokenMinted: false,
  productSyncReady: false,
  transportReady: false,
}, null, 2));
