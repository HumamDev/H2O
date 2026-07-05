#!/usr/bin/env node
//
// Transport privacy / evidence contract closeout validator.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

const evidencePath = 'release-evidence/2026-07-01/transport-privacy-evidence-contract-closeout.md';
const rollbackPath = 'release-evidence/2026-07-01/transport-rollback-disable-fail-closed-proof.md';
const fullBundleCloseoutPath = 'release-evidence/2026-07-01/fullbundle-v2-transport-envelope-preflight-live-closeout.md';
const relayCloseoutPath = 'release-evidence/2026-07-01/relay-idempotency-restart-proof-live-closeout.md';
const webdavCloseoutPath = 'release-evidence/2026-07-01/webdav-transport-readiness-dry-run-live-closeout.md';
const inventoryPath = 'release-evidence/2026-07-01/transport-source-inventory-no-write-audit.md';

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

function assertNoRawPrivateAssignments(source, label) {
  const forbiddenPatterns = [
    /rawChatId\s*:\s*["'][^"']+["']/i,
    /rawFolderId\s*:\s*["'][^"']+["']/i,
    /chatId\s*:\s*["'][^"']+["']/i,
    /folderId\s*:\s*["'][^"']+["']/i,
    /chatTitle\s*:\s*["'][^"']+["']/i,
    /folderName\s*:\s*["'][^"']+["']/i,
    /username\s*:\s*["'][^"']+["']/i,
    /password\s*:\s*["'][^"']+["']/i,
    /token\s*:\s*["'][^"']+["']/i,
    /remoteRootUrl\s*:\s*["'][^"']+["']/i,
    /endpoint\s*:\s*["'][^"']+["']/i,
    /remoteRootPath\s*:\s*["'][^"']+["']/i,
    /casKey\s*:\s*["'][^"']+["']/i,
    /credentials\s*:\s*["'][^"']+["']/i,
  ];
  for (const pattern of forbiddenPatterns) {
    assert.ok(!pattern.test(source), `${label}: raw private assignment matched ${pattern}`);
  }
}

const evidence = read(evidencePath);
const flatEvidence = compact(evidence);
const rollback = read(rollbackPath);
const fullBundleCloseout = read(fullBundleCloseoutPath);
const relayCloseout = read(relayCloseoutPath);
const webdavCloseout = read(webdavCloseoutPath);
const inventory = read(inventoryPath);
const checkedEvidence = [
  ['privacy closeout', evidence],
  ['rollback proof', rollback],
  ['fullBundle closeout', fullBundleCloseout],
  ['relay closeout', relayCloseout],
  ['WebDAV closeout', webdavCloseout],
];

for (const token of [
  'TRANSPORT PRIVACY / EVIDENCE CONTRACT CLOSED - HASH-ONLY / NON-WRITING',
  'b6dc031157ad7689620aed288869151bd23392c8',
  '735e9b002f8fac14e57ae0523f2dadd9a2bbe22a',
  'f8cfcff9eb18437134df4470c033f37d3cecc2fd',
  '7dd54b42b5df25d76fd4a308fe1f4c7a1a694ba2',
  '35607afcaca0263c2105e98e13b5d20ea08e37e9',
  'privacy.redacted:true',
  'privacy.hashOnly:true',
  'privacy.rawPrivateFieldsLogged:false',
  'privacy.rawInputRejected:false',
  'candidate payload, bundle, and projection identifiers are SHA-256 hashes only',
  'peer and remote-root references are SHA-256 hashes or redacted mock tokens only',
  '`row:a950a44b859f` is represented only as a redacted row token',
  'sha256:a721ebdad94e398a4f45bc46c437f465402ad9e8ac2e68cc120eef96df9bbb85',
  'peerTargetHash:"sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"',
  'remoteRootRefHash:"sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"',
  'idempotencyKeyHashOnly:true',
  'duplicateReplayZeroWrite:true',
  'restartFailClosed:true',
  'bootResumeBlockedWithoutControlledGate:true',
  'allFailureModesBlockBeforeEnqueue:true',
  'payloadUnmodified:true',
  'a950DocumentedDebtQuarantined:true',
  'a950LeaksIntoExportablePayload:false',
  'rollbackDisableFailClosedProof:true',
  'transportDisabledByDefault:true',
  'killSwitchAvailable:false',
  'killSwitchBlocker:"transport-kill-switch-not-implemented-for-controlled-writes"',
  'autoStartBlocked:true',
  'bootResumeBlocked:true',
  'dryRunCannotBecomeWrite:true',
  'controlledGateRequired:true',
  'WebDAV/cloud/relay remain blocked',
  'Chat Saving CAS remains separate and blocked/deferred',
  '`localExportableSyncReady:true` is not transport authorization',
  '`transportEligibilityFromLocalExportableReady:true` is only an evaluation candidate',
  '`productSyncReady:false` remains visible and authoritative',
  '`transportReady:false` remains visible and authoritative',
  '`fullBundle.v3` remains deferred/not-started',
  'No cleanup authority is introduced',
  'explicit controlled gate: `webdav-cloud-relay-transport-controlled-apply`',
  'dedicated controlled-write kill switch implementation',
  'privacy-safe hash-only evidence',
  'This closeout does not authorize transport',
  'This closeout does not authorize WebDAV/cloud/relay',
  'This closeout does not authorize `fullBundle.v3`',
  'This closeout does not authorize Chat Saving CAS',
  'This closeout does not authorize cleanup',
]) {
  assertIncludes(flatEvidence, token, `privacy closeout token ${token}`);
}

for (const token of [
  'TRANSPORT ROLLBACK / DISABLE / FAIL-CLOSED PROOF COMPLETE - NON-WRITING',
  'killSwitchBlocker:"transport-kill-switch-not-implemented-for-controlled-writes"',
]) {
  assertIncludes(rollback, token, `rollback proof token ${token}`);
}

for (const token of [
  'FULLBUNDLE V2 TRANSPORT ENVELOPE PREFLIGHT LIVE PROVEN - ZERO WRITE',
  'privacy.redacted:true',
  'privacy.hashOnly:true',
  'privacy.rawPrivateFieldsLogged:false',
  'privacy.rawInputRejected:false',
  'candidatePayloadHash:"sha256:a721ebdad94e398a4f45bc46c437f465402ad9e8ac2e68cc120eef96df9bbb85"',
  'expectedProjectionHash:"sha256:a721ebdad94e398a4f45bc46c437f465402ad9e8ac2e68cc120eef96df9bbb85"',
  'peerTargetHash:"sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"',
  'remoteRootRefHash:"sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"',
  'a950LeaksIntoExportablePayload:false',
]) {
  assertIncludes(fullBundleCloseout, token, `fullBundle closeout token ${token}`);
}

for (const token of [
  'RELAY IDEMPOTENCY RESTART PROOF LIVE PROVEN - ZERO WRITE',
  'privacy.redacted:true',
  'privacy.hashOnly:true',
  'privacy.rawPrivateFieldsLogged:false',
  'privacy.rawInputRejected:false',
  'idempotencyKeyHashOnly:true',
  'localExportableSyncReadyIsAuthorization:false',
]) {
  assertIncludes(relayCloseout, token, `relay closeout token ${token}`);
}

for (const token of [
  'WEBDAV TRANSPORT READINESS DRY-RUN LIVE PROOF PASSED - ZERO WRITE',
  'privacy.redacted:true',
  'privacy.hashOnly:true',
  'privacy.rawPrivateFieldsLogged:false',
  'privacy.rawInputRejected:false',
  'candidatePayloadHash:"sha256:a721ebdad94e398a4f45bc46c437f465402ad9e8ac2e68cc120eef96df9bbb85"',
]) {
  assertIncludes(webdavCloseout, token, `WebDAV closeout token ${token}`);
}

assertIncludes(inventory, 'Chat Saving archive CAS boundary', 'inventory keeps CAS boundary separate');
assertIncludes(inventory, 'No current Operational.5 path starts WebDAV/cloud/relay',
  'inventory no Operational.5 transport start');

for (const [label, source] of checkedEvidence) {
  assertNoRawPrivateAssignments(source, label);
  for (const forbidden of [
    'writesWebDAV:true',
    'writesCloud:true',
    'writesRelay:true',
    'enqueuesRelay:true',
    'writesCAS:true',
    'writesFiles:true',
    'mutatesExportState:true',
    'mintsExportId:true',
    'burnsSequence:true',
    'fullBundleV3Started:true',
    'cleanupAuthority:true',
    'noCleanupAuthority:false',
    'localExportableSyncReadyIsAuthorization:true',
    'WebDAV/cloud/relay can start now',
    'Chat Saving CAS can start now',
  ]) {
    assertNotIncludes(source, forbidden, `${label} forbidden ${forbidden}`);
  }
}

console.log(JSON.stringify({
  schema: 'h2o.studio.transport.privacy-evidence-contract-closeout.validator.v1',
  verdict: 'TRANSPORT_PRIVACY_EVIDENCE_CONTRACT_HASH_ONLY_NON_WRITING',
  rollbackProofRespected: true,
  fullBundleEnvelopeCloseoutRespected: true,
  relayCloseoutRespected: true,
  webdavCloseoutRespected: true,
  privacyRedacted: true,
  hashOnly: true,
  rawPrivateEvidenceFound: false,
  productSyncReady: false,
  transportReady: false,
  webdavCloudRelayBlocked: true,
  chatSavingCasBlocked: true,
  fullBundleV3Started: false,
  killSwitchFutureBlocker: 'transport-kill-switch-not-implemented-for-controlled-writes',
  cleanupAuthorityIntroduced: false,
}, null, 2));
