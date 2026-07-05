#!/usr/bin/env node
//
// WebDAV transport-readiness dry-run live closeout validator.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

const evidencePath = 'release-evidence/2026-07-01/webdav-transport-readiness-dry-run-live-closeout.md';
const implementationEvidencePath = 'release-evidence/2026-07-01/webdav-transport-readiness-dry-run-implementation.md';
const liveContractFixPath = 'release-evidence/2026-07-01/webdav-transport-readiness-dry-run-live-contract-fix.md';
const sourcePath = 'src-surfaces-base/studio/sync/webdav-transport-gates.js';

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
const implementationEvidence = read(implementationEvidencePath);
const liveContractFixEvidence = read(liveContractFixPath);
const source = read(sourcePath);

for (const token of [
  'WEBDAV TRANSPORT READINESS DRY-RUN LIVE PROOF PASSED - ZERO WRITE',
  'f776e66d595de7ac80746fcd7e337d5452c2e26e',
  'd28cf0b8beb857c65ec1251030087c5229241477',
  'H2O.Studio.sync.webdavTransportGates.evaluateTransportReadinessDryRun(request)',
  'schema:"h2o.studio.webdav.transport-readiness-dry-run.live-proof.v2"',
  'diagnosticOnly:true',
  'readOnly:true',
  'writeIntent:false',
  'apiAvailable:true',
  'dryRunApiAvailable:true',
  'gate:"webdav-transport-readiness-dry-run-evaluate"',
  'schema:"h2o.studio.transport.webdav-readiness-dry-run-result.v1"',
  'requestSchema:"h2o.studio.transport.webdav-readiness-dry-run-request.v1"',
  'version:"0.1.0-phase30-dry-run"',
  'ok:true',
  'status:"webdav-transport-dry-run-ready"',
  'reason:"webdav-transport-dry-run-ready"',
  'gateSatisfied:true',
  'transportReadinessDryRun:true',
  'dryRun:true',
  'applyRequested:false',
  'writesData:false',
  'writesWebDAV:false',
  'writesCloud:false',
  'writesRelay:false',
  'writesCAS:false',
  'writesFiles:false',
  'mutatesExportState:false',
  'mintsExportId:false',
  'burnsSequence:false',
  'enqueuesRelay:false',
  'fullBundleV3Started:false',
  'productSyncReady:false',
  'transportReady:false',
  'localExportableSyncReady:true',
  'transportEligibilityFromLocalExportableReady:true',
  'transportControlledApplyGateReserved:"webdav-cloud-relay-transport-controlled-apply"',
  'webdavCloudRelayBlocked:true',
  'chatSavingCasBlocked:true',
  'a950DocumentedDebtQuarantined:true',
  'noCleanupAuthority:true',
  'candidatePayloadHash:"sha256:a721ebdad94e398a4f45bc46c437f465402ad9e8ac2e68cc120eef96df9bbb85"',
  'candidateBundleHash:"sha256:a721ebdad94e398a4f45bc46c437f465402ad9e8ac2e68cc120eef96df9bbb85"',
  'sequenceMode:"not-minted-in-dry-run"',
  'peerTarget.localMockTarget:true',
  'peerTarget.ambiguous:false',
  'privacy.redacted:true',
  'privacy.hashOnly:true',
  'privacy.rawPrivateFieldsLogged:false',
  'privacy.rawInputRejected:false',
  'blockers:[]',
  'warnings:[]',
  'activeTransport:"local-sync-folder-json"',
  'No real transport started',
  'No WebDAV/cloud/relay write occurred',
  'No relay enqueue occurred',
  'No CAS write occurred',
  'No file write occurred',
  'No export state mutation occurred',
  'No export id was minted',
  'No sequence was burned',
  '`fullBundle.v3` was not started',
  '`productSyncReady:false` remains',
  '`transportReady:false` remains',
  'WebDAV/cloud/relay remains blocked',
  'Chat Saving CAS remains blocked/deferred',
  'a950 remains documented/quarantined debt',
  'No cleanup authority is introduced',
  'The candidate payload and bundle hashes are hash-only',
  'Privacy remained redacted/hash-only',
  'The reserved controlled gate `webdav-cloud-relay-transport-controlled-apply` remains reserved only and unusable in this slice',
  'WebDAV/cloud/relay cannot start from this dry-run closeout',
]) {
  assertIncludes(flat, token, `evidence token ${token}`);
}

for (const forbidden of [
  'transportReady:true',
  'productSyncReady:true',
  'WebDAV/cloud/relay can start now',
  'fullBundle.v3 started',
  'Chat Saving CAS can start now',
  'cleanup authority is introduced and approved',
  'relay enqueue occurred:true',
  'WebDAV write occurred:true',
]) {
  assertNotIncludes(flat, forbidden, `evidence forbidden ${forbidden}`);
}

assertIncludes(implementationEvidence, 'WEBDAV TRANSPORT READINESS DRY-RUN IMPLEMENTED - ZERO WRITE', 'implementation evidence respected');
assertIncludes(liveContractFixEvidence, 'WEBDAV TRANSPORT READINESS DRY-RUN LIVE CONTRACT FIXED - ZERO WRITE', 'live contract fix respected');
assertIncludes(source, 'function evaluateTransportReadinessDryRun(request)', 'API source exists');
assertIncludes(source, 'TRANSPORT_CONTROLLED_APPLY_GATE', 'reserved controlled gate source exists');
assertIncludes(source, 'webdav-cloud-relay-transport-controlled-apply', 'reserved controlled gate literal exists');
assertIncludes(source, 'writesWebDAV: false', 'source still reports no WebDAV write');
assertIncludes(source, 'writesRelay: false', 'source still reports no relay write');
assertIncludes(source, 'writesCAS: false', 'source still reports no CAS write');
assertIncludes(source, 'fullBundleV3Started: false', 'source keeps fullBundle.v3 stopped');
assertIncludes(source, 'productSyncReady: false', 'source keeps productSyncReady false');
assertIncludes(source, 'transportReady: false', 'source keeps transportReady false');
assertIncludes(source, 'noCleanupAuthority: true', 'source keeps no cleanup authority');

for (const forbidden of [
  'fetch(',
  'XMLHttpRequest',
  'navigator.sendBeacon',
  'localStorage.setItem',
  'sessionStorage.setItem',
  'indexedDB.open',
  'productSyncReady: true',
  'transportReady: true',
]) {
  assertNotIncludes(source, forbidden, `source forbidden ${forbidden}`);
}

console.log('validate-webdav-transport-readiness-dry-run-live-closeout: PASS');
