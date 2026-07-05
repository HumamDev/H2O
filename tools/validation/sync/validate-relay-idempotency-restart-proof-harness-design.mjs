#!/usr/bin/env node
//
// Relay idempotency / restart proof harness design validator.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

const evidencePath = 'release-evidence/2026-07-01/relay-idempotency-restart-proof-harness-design.md';
const dryRunCloseoutPath = 'release-evidence/2026-07-01/webdav-transport-readiness-dry-run-live-closeout.md';
const sourceInventoryPath = 'release-evidence/2026-07-01/transport-source-inventory-no-write-audit.md';
const relayBrokerPath = 'src-surfaces-base/studio/sync/execute/execute-relay-broker.tauri.js';
const resumePath = 'src-surfaces-base/studio/sync/execute/execute-resume-on-boot.tauri.js';
const executeUiPath = 'src-surfaces-base/studio/sync/execute/execute-lane-ui.tauri.js';
const publicationLifecyclePath = 'src-surfaces-base/studio/sync/execute/execute-publication-lifecycle.tauri.js';
const remoteProjectorPath = 'src-surfaces-base/studio/sync/remote-envelope-projector.tauri.js';
const webdavGatesPath = 'src-surfaces-base/studio/sync/webdav-transport-gates.js';

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
const dryRunCloseout = read(dryRunCloseoutPath);
const sourceInventory = read(sourceInventoryPath);
const relayBroker = read(relayBrokerPath);
const resume = read(resumePath);
const executeUi = read(executeUiPath);
const publicationLifecycle = read(publicationLifecyclePath);
const remoteProjector = read(remoteProjectorPath);
const webdavGates = read(webdavGatesPath);

for (const token of [
  'RELAY IDEMPOTENCY RESTART PROOF HARNESS DESIGNED - NON-WRITING',
  '7dd54b42b5df25d76fd4a308fe1f4c7a1a694ba2',
  'd28cf0b8beb857c65ec1251030087c5229241477',
  'f776e66d595de7ac80746fcd7e337d5452c2e26e',
  '2b12b53223297fe9588ffe29750948055305f8bc',
  '35607afcaca0263c2105e98e13b5d20ea08e37e9',
  'c6d5eafe1b164570230088380377650467c028e1',
  'ok:true',
  'status:"webdav-transport-dry-run-ready"',
  'gateSatisfied:true',
  'blockers:[]',
  'warnings:[]',
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
  'dispatchExecuteRelay(...)',
  'confirmExecuteRelay(...)',
  'requiresRelay',
  'relayOutboxTouched',
  'enqueueRelayEnvelope',
  'duplicate-dedupe-key',
  'duplicate-execute-journal-row',
  'classifyExecuteResumeAction(...)',
  'invokeResumeAction(...)',
  'dispatch-relay',
  'relay-dispatching',
  'relay-dispatch-not-safe-to-resume',
  'resumeSafe',
  'summarizeRelay(...)',
  'projection only',
  'Current Guarded Write-Capable Findings',
  'Required Idempotency Model',
  'same candidate payload hash + same peer/mock target + same sequence/export constraints => same idempotency key',
  'same key duplicate replay is zero-write',
  'duplicate replay does not enqueue relay',
  'duplicate replay does not write WebDAV/cloud',
  'duplicate replay does not write CAS',
  'duplicate replay does not mint export id',
  'duplicate replay does not burn sequence',
  'duplicate replay does not start `fullBundle.v3`',
  'Required Duplicate Replay Behavior',
  'duplicateRelayEnqueue:false',
  'duplicateWebdavWrite:false',
  'Required Restart Behavior',
  'queued dry-run state cannot become a live write after reload',
  'boot resume must not dispatch relay from `localExportableSyncReady:true`',
  'boot resume must not dispatch relay from `transportEligibilityFromLocalExportableReady:true`',
  'boot resume must not dispatch relay from `transportReadinessEvaluationAllowed:true`',
  'boot resume must stay blocked unless a future explicit controlled transport gate exists',
  'restartModeledFailClosed:true',
  'Required Failure Behavior',
  'network failure',
  'partial write',
  'checksum mismatch',
  'sequence mismatch',
  'peer ambiguity',
  'stale payload',
  'CAS boundary violation',
  'missing controlled gate',
  'Required Proof Outputs',
  'schema:"h2o.studio.transport.relay-idempotency-restart-proof.v1"',
  'dryRunOnly:true',
  'relayOutboxTouched:false',
  'publicationLedgerTouched:false',
  'localExportableSyncReadyIsAuthorization:false',
  'idempotencyModeled:true',
  'duplicateReplayZeroWrite:true',
  'restartModeledFailClosed:true',
  'bootResumeBlockedWithoutControlledGate:true',
  'webdavCloudRelayBlocked:true',
  'chatSavingCasBlocked:true',
  'a950DocumentedDebtQuarantined:true',
  'noCleanupAuthority:true',
  'Implement relay/idempotency/restart proof harness, still no writes and no relay enqueue',
  'Run live read-only / dry-run proof of the harness',
  'Add `fullBundle.v3` preflight if a v3 envelope is required',
  'Add rollback / disable / fail-closed proof',
  'Only after explicit approval',
  'WebDAV/cloud/relay cannot start now',
  'No relay enqueue is authorized now',
  '`fullBundle.v3` remains not-started',
  'Chat Saving CAS remains blocked/deferred',
  '`productSyncReady:false` remains authoritative',
  '`transportReady:false` remains authoritative',
  '`localExportableSyncReady:true` is not relay or transport authorization',
]) {
  assertIncludes(flat, token, `evidence token ${token}`);
}

for (const forbidden of [
  'WebDAV/cloud/relay can start now',
  'relay enqueue is authorized now:true',
  'transportReady:true is authorized',
  'productSyncReady:true is authorized',
  'fullBundle.v3 started',
  'cleanup authority is introduced and approved',
]) {
  assertNotIncludes(flat, forbidden, `evidence forbidden ${forbidden}`);
}

assertIncludes(dryRunCloseout, 'WEBDAV TRANSPORT READINESS DRY-RUN LIVE PROOF PASSED - ZERO WRITE', 'dry-run closeout respected');
assertIncludes(dryRunCloseout, 'status:"webdav-transport-dry-run-ready"', 'dry-run ready closeout respected');
assertIncludes(dryRunCloseout, 'enqueuesRelay:false', 'dry-run no relay enqueue respected');
assertIncludes(dryRunCloseout, 'transportReady:false', 'dry-run transport false respected');
assertIncludes(sourceInventory, 'TRANSPORT SOURCE INVENTORY COMPLETE', 'source inventory respected');
assertIncludes(sourceInventory, 'No current Operational.5 path starts WebDAV/cloud/relay', 'source inventory no-start respected');
assertIncludes(sourceInventory, 'dispatchExecuteRelay(...)', 'source inventory relay broker respected');
assertIncludes(sourceInventory, 'execute-resume-on-boot.tauri.js', 'source inventory boot resume respected');

assertIncludes(relayBroker, 'Relay outbox staging only', 'relay broker staging-only safety comment');
assertIncludes(relayBroker, 'No relay upload', 'relay broker no upload safety comment');
assertIncludes(relayBroker, 'function dispatchExecuteRelay', 'relay broker dispatch function exists');
assertIncludes(relayBroker, 'requiresRelay', 'relay broker requiresRelay gate exists');
assertIncludes(relayBroker, 'relayOutboxTouched', 'relay broker side effect marker exists');
assertIncludes(relayBroker, 'duplicate-dedupe-key', 'relay broker duplicate dedupe guard exists');
assertIncludes(relayBroker, 'duplicate-execute-journal-row', 'relay broker duplicate journal guard exists');
assertIncludes(relayBroker, 'relay-outbox-unavailable', 'relay broker outbox unavailable blocker exists');
assertIncludes(relayBroker, 'relay-outbox-enqueue-failed', 'relay broker enqueue failure blocker exists');
assertIncludes(relayBroker, 'confirmExecuteRelay', 'relay broker confirmation exists');
assertIncludes(relayBroker, 'relay-outbox-upload-evidence-required', 'relay confirmation requires uploaded evidence');

assertIncludes(resume, 'function classifyExecuteResumeAction', 'resume classifier exists');
assertIncludes(resume, 'dispatch-relay', 'resume can classify relay dispatch');
assertIncludes(resume, 'relay-dispatch-not-safe-to-resume', 'resume safe-block exists');
assertIncludes(resume, 'resumeSafe', 'resumeSafe evidence exists');
assertIncludes(resume, 'function invokeResumeAction', 'resume invoke exists');
assertIncludes(resume, 'dispatchExecuteRelay', 'resume can call relay dispatch and must be guarded later');

assertIncludes(executeUi, 'No dispatch, Native invoke, F5 close/decision, relay enqueue, settlement', 'execute UI read-only relay summary');
assertIncludes(executeUi, 'function summarizeRelay', 'execute UI relay summary exists');
assertIncludes(publicationLifecycle, 'Publication ledger only. No relay enqueue/dispatch', 'publication lifecycle ledger-only');
assertIncludes(publicationLifecycle, 'relayDispatched: false', 'publication lifecycle reports relay not dispatched');
assertIncludes(remoteProjector, 'Projection only. No convergence, apply, proposal generation', 'remote projector projection only');
assertIncludes(remoteProjector, 'WebDAV changes, storage mutation', 'remote projector no WebDAV/storage mutation invariant');
assertIncludes(webdavGates, 'evaluateTransportReadinessDryRun', 'webdav dry-run API still exists');
assertIncludes(webdavGates, 'enqueuesRelay: false', 'webdav dry-run still no relay enqueue');
assertIncludes(webdavGates, 'transportReady: false', 'webdav dry-run still transport false');
assertIncludes(webdavGates, 'productSyncReady: false', 'webdav dry-run still product false');

for (const forbidden of [
  'productSyncReady: true',
  'transportReady: true',
]) {
  assertNotIncludes(webdavGates, forbidden, `webdav source forbidden ${forbidden}`);
}

console.log('validate-relay-idempotency-restart-proof-harness-design: PASS');
