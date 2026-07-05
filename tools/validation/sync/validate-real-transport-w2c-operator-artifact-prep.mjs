#!/usr/bin/env node
//
// W2c operator artifact prep validator.
//
// Validates that the W2c operator artifact templates exist, remain hash-only
// and non-authorizing, and explicitly keep W2c pending/blocked.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const base = 'release-evidence/2026-07-05';

const files = {
  b8: `${base}/real-transport-w2c-b8-approval-artifact-template.md`,
  rollback: `${base}/real-transport-w2c-rollback-rehearsal-receipt-template.md`,
  remoteRoot: `${base}/real-transport-w2c-remote-root-initial-state-template.md`,
  recovery: `${base}/real-transport-w2c-partial-write-recovery-plan-template.md`,
  prep: `${base}/real-transport-w2c-operator-artifact-prep.md`,
};

const requiredEverywhere = [
  'not live approval',
  'not W2c PASS',
  'e3217aac',
  'b08bb910',
];

const pendingTokens = [
  'W2c remains pending',
  'W2c remains blocked',
  'W3 remains blocked',
  'No receipt was generated',
  'No W2c live webview proof was run',
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

function assertIncludes(source, token, label) {
  assert.ok(source.includes(token), `${label}: missing ${token}`);
}

function assertForbiddenOnlyInForbiddenContext(source, rel) {
  for (const token of forbiddenAuthorityTokens) {
    const lines = source.split(/\r?\n/).filter((line) => line.includes(token));
    assert.ok(lines.length > 0, `${rel}: expected forbidden-context token ${token}`);
    for (const line of lines) {
      assert.match(line.toLowerCase(), /forbidden/, `${rel}: ${token} outside forbidden context`);
    }
  }
}

function assertNoRawValues(source, rel) {
  for (const [pattern, label] of rawPatterns) {
    assert.ok(!pattern.test(source), `${rel}: ${label} found`);
  }
}

function assertHashOnlyTemplate(source, rel) {
  assertIncludes(source, 'hash-only', `${rel} hash-only`);
  assertIncludes(source, 'raw endpoint URL values are forbidden', `${rel} raw endpoint forbidden`);
  assertIncludes(source, 'raw credentials are forbidden', `${rel} raw credential forbidden`);
  assertIncludes(source, 'raw remote paths are forbidden', `${rel} raw path forbidden`);
  assertIncludes(source, 'payload bodies are forbidden', `${rel} payload body forbidden`);
  assertIncludes(source, 'CAS keys are forbidden', `${rel} CAS key forbidden`);
  assertIncludes(source, 'fullBundle.v3', `${rel} fullBundle.v3 boundary`);
  assertIncludes(source, 'a950 mutation', `${rel} a950 boundary`);
  assertIncludes(source, 'Chat Saving CAS', `${rel} Chat Saving CAS boundary`);
  assertForbiddenOnlyInForbiddenContext(source, rel);
  assertNoRawValues(source, rel);
}

for (const [name, rel] of Object.entries(files)) {
  const source = read(rel);
  for (const token of requiredEverywhere) assertIncludes(source, token, `${name} common ${token}`);
  assertHashOnlyTemplate(source, rel);
}

const b8 = read(files.b8);
for (const token of [
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
  'scope: "real-webdav-cloud-relay-target"',
  'productSyncReady: false',
  'transportReady: false',
  'noA950Mutation: true',
  'noCleanupAuthority: true',
  'noFullBundleV3: true',
  'chatSavingCasSeparate: true',
  'noChatSavingCAS: true',
]) {
  assertIncludes(b8, token, `B8 field ${token}`);
}

const rollback = read(files.rollback);
for (const token of [
  'killSwitchEnableTokenHash',
  'disableRehearsalReceiptHash',
  'disableBlocksPreflight: true',
  'noWriteEnqueueStoreLedgerExportMutationOccurred: true',
  'productSyncReady: false',
  'transportReady: false',
]) {
  assertIncludes(rollback, token, `rollback field ${token}`);
}

const remoteRoot = read(files.remoteRoot);
for (const token of [
  'remoteRootRefHash',
  'endpointRefHash',
  'initialStateStatementHash',
  'expectedEmptyOrListingHash',
  'initialStateKind: "expected-empty" or "listing-hash"',
  'createOnlyBehavior: "unknown" or "verified"',
  'etagBehavior: "unknown" or "verified"',
  'ifNoneMatchBehavior: "unknown" or "verified"',
  'rawUrlIncluded: false',
  'rawRemotePathIncluded: false',
]) {
  assertIncludes(remoteRoot, token, `remote-root field ${token}`);
}

const recovery = read(files.recovery);
for (const token of [
  'recoveryPlanHash',
  'explicitRecoveryRequiredForUncertainWrite: true',
  'noBlindRetry: true',
  'verifyThenLedger: true',
  'killSwitchDisableFirstResponse: true',
  'manualCleanupStepsHash',
  'manualCleanupStepsContainRawEndpointCredentialPath: false',
]) {
  assertIncludes(recovery, token, `recovery field ${token}`);
}

const prep = read(files.prep);
for (const token of pendingTokens) assertIncludes(prep, token, `prep ${token}`);
for (const token of [
  'These are templates only',
  'No filled operator artifact exists yet',
  'No real WebDAV/cloud/relay/CAS/file write occurred',
  'No relay enqueue occurred',
  'No outbox, ledger, or durable store row was created',
  'No fullBundle.v3 start or mint occurred',
  'No token was minted',
  'No export id was minted',
  'No sequence was burned',
  'productSyncReady:false remains',
  'transportReady:false remains',
]) {
  assertIncludes(prep, token, `prep invariant ${token}`);
}

console.log(JSON.stringify({
  ok: true,
  validator: 'validate-real-transport-w2c-operator-artifact-prep',
  filesChecked: Object.keys(files).length,
  w2bAnchor: 'e3217aac',
  w2aAnchor: 'b08bb910',
  w2cStatus: 'pending-blocked',
  templatesOnly: true,
  receiptGenerated: false,
  realTransportWrite: false,
  enqueuesRelay: false,
  productSyncReady: false,
  transportReady: false,
}, null, 2));
