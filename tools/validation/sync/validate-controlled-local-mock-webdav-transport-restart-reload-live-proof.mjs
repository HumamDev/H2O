#!/usr/bin/env node
//
// Controlled local mock WebDAV transport - restart / reload live proof validator.
//
// Proves that after a simulated restart/reload the controlled local mock apply state cannot resume into any real
// transport: it respects the duplicate replay closeout (6c55a81b) and first apply closeout (c3fd4b57); restart is
// fail-closed; bootResumeDispatch is false; the relay outbox and publication ledger are not touched (the evaluator is
// a pure function with no outbox/ledger write and no boot dispatcher); no real WebDAV/cloud/relay/CAS/file write; no
// relay enqueue; no export-state mutation/export-id mint/sequence burn; fullBundle.v3 stays not-started;
// productSyncReady/transportReady stay false; no cleanup/a950 authority is introduced. It re-executes the REAL source
// evaluator across the reload-as-replay result and the fail-closed matrix (dispatch-without-gate, missing gate,
// disabled kill switch, false readiness claim, no fail-closed proof). Evidence/validator-only; no live apply is rerun;
// no product source is changed; no unrelated validator hygiene is touched.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';

const root = process.cwd();

const sourcePath = 'src-surfaces-base/studio/sync/webdav-transport-gates.js';
const relayHarnessPath = 'src-surfaces-base/studio/sync/relay-idempotency-restart-proof-harness.js';
const evidencePath = 'release-evidence/2026-07-01/controlled-local-mock-webdav-transport-restart-reload-live-proof.md';
const duplicateReplayPath = 'release-evidence/2026-07-01/controlled-local-mock-webdav-transport-duplicate-replay-live-proof.md';
const firstApplyCloseoutPath = 'release-evidence/2026-07-01/controlled-local-mock-webdav-transport-first-apply-live-closeout.md';
const implementationPath = 'release-evidence/2026-07-01/controlled-local-mock-webdav-transport-implementation.md';
const approvalPredicateCloseoutPath = 'release-evidence/2026-07-01/controlled-local-mock-approval-predicate-live-closeout.md';
const chatSavingBoundaryPath = 'tools/validation/studio/validate-saved-chat-archive-cloud-sync-boundary-v1.mjs';

function read(rel) {
  const abs = path.join(root, rel);
  assert.ok(fs.existsSync(abs), `missing ${rel}`);
  return fs.readFileSync(abs, 'utf8');
}
function compact(value) { return String(value).replace(/\s+/g, ' '); }
function assertIncludes(source, token, label) { assert.ok(String(source).includes(token), `${label}: missing ${token}`); }
function assertNotIncludes(source, token, label) { assert.ok(!String(source).includes(token), `${label}: forbidden ${token}`); }
function installWebdavGates() {
  const sandbox = { console };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(read(sourcePath), sandbox, { filename: sourcePath });
  return sandbox.H2O?.Studio?.sync?.webdavTransportGates;
}

const source = read(sourcePath);
const relayHarness = read(relayHarnessPath);
const evidence = read(evidencePath);
const flatEvidence = compact(evidence);
const duplicateReplay = read(duplicateReplayPath);
const firstApplyCloseout = read(firstApplyCloseoutPath);
const implementation = read(implementationPath);
const approvalPredicateCloseout = read(approvalPredicateCloseoutPath);
const chatSavingBoundary = read(chatSavingBoundaryPath);

// ---------------------------------------------------------------------------
// (1) Evidence content anchors.
// ---------------------------------------------------------------------------
for (const token of [
  'AFTER A SIMULATED RESTART / RELOAD, THE CONTROLLED LOCAL MOCK APPLY STATE CANNOT RESUME INTO ANY REAL',
  '6c55a81b',
  'c3fd4b57',
  '1d7a2daa',
  '050286fe',
  'edb30677',
  '40f52a5f',
  'h2o.studio.controlled-local-mock-webdav-transport.restart-reload-live-proof.v1',
  'restartReload:true',
  'H2O.Studio.sync.webdavTransportGates.evaluateControlledLocalMockTransport(request)',
  'restartFailClosed:true',
  'bootResumeDispatch:false',
  'modeledMockWriteCount:0',
  'duplicateReplayZeroWrite:true',
  'realWebDAVWrite:false',
  'writesWebDAV:false',
  'writesCloud:false',
  'writesRelay:false',
  'enqueuesRelay:false',
  'writesCAS:false',
  'writesFiles:false',
  'mutatesExportState:false',
  'mintsExportId:false',
  'burnsSequence:false',
  'fullBundleV3Started:false',
  'productSyncReady:false',
  'transportReady:false',
  'localExportableSyncReadyIsAuthorization:false',
  'noCleanupAuthority:true',
  'controlled-local-mock-restart-fail-closed-proof-required',
  'controlled-local-mock-controlled-gate-required',
  'controlled-local-mock-kill-switch-disabled',
  'controlled-local-mock-product-sync-ready-mismatch',
  'controlled-local-mock-transport-ready-mismatch',
  'relay outbox not touched; publication ledger not touched',
  'dryRunRecordsAreNotRelayOutboxRows:true',
  'NOT authorized by this proof',
]) {
  assertIncludes(flatEvidence, token, `evidence token ${token}`);
}

for (const forbidden of [
  'realWebDAVWrite:true',
  'writesWebDAV:true',
  'writesCloud:true',
  'enqueuesRelay:true',
  'writesCAS:true',
  'writesFiles:true',
  'mutatesExportState:true',
  'mintsExportId:true',
  'burnsSequence:true',
  'fullBundleV3Started:true',
  'bootResumeDispatch:true',
  'productSyncReady:true` remains',
  'transportReady:true` remains',
  'a950a44b859f` was cleaned',
  'authorizes real transport',
]) {
  assertNotIncludes(flatEvidence, forbidden, `evidence forbidden ${forbidden}`);
}

// ---------------------------------------------------------------------------
// (2) Chain evidence retained.
// ---------------------------------------------------------------------------
assertIncludes(duplicateReplay, 'DUPLICATE REPLAY OF THE CONTROLLED LOCAL MOCK WEBDAV APPLY IS ZERO-WRITE / IDEMPOTENT',
  'duplicate replay closeout respected');
assertIncludes(firstApplyCloseout, 'FIRST CONTROLLED LOCAL MOCK WEBDAV TRANSPORT APPLY LIVE-PROVEN',
  'first apply closeout respected');
assertIncludes(implementation, 'CONTROLLED LOCAL MOCK WEBDAV TRANSPORT IMPLEMENTED - MOCK ONLY / REAL TRANSPORT STILL BLOCKED',
  'implementation evidence respected');
assertIncludes(approvalPredicateCloseout, 'CONTROLLED LOCAL MOCK APPROVAL PREDICATE LIVE PROVEN',
  'approval predicate live closeout respected');

// ---------------------------------------------------------------------------
// (3) REAL SOURCE: restart fail-closed logic + hardcoded boot resume dispatch false + no outbox/ledger write.
// ---------------------------------------------------------------------------
for (const token of [
  'var restartFailClosed = restart.expectFailClosed === true &&',
  'restart.allowDispatchWithoutControlledGate !== true &&',
  'restart.simulateReload === true || restart.simulateBootResume === true',
  "addUnique(blockers, 'controlled-local-mock-restart-fail-closed-proof-required')",
  'restartFailClosed: restartFailClosed,',
  'bootResumeDispatch: false,',
  'localExportableSyncReadyIsAuthorization: false,',
]) {
  assertIncludes(source, token, `source token ${token}`);
}
// relay lane boundary already established these (referenced by this proof)
assertIncludes(relayHarness, 'relayOutboxTouched: false', 'relay harness: outbox not touched');
assertIncludes(relayHarness, 'publicationLedgerTouched: false', 'relay harness: publication ledger not touched');
assertIncludes(relayHarness, 'dryRunRecordsAreNotRelayOutboxRows: true', 'relay harness: dry-run records are not outbox rows');
assertIncludes(chatSavingBoundary, 'deferred encrypted', 'Chat Saving CAS deferred lane retained');

// the controlled local mock evaluator body writes nothing to a relay outbox / publication ledger / db.
const fnStart = source.indexOf('function evaluateControlledLocalMockTransport(request)');
const fnEnd = source.indexOf('function diagnose()');
assert.ok(fnStart >= 0 && fnEnd > fnStart, 'evaluator function slice found');
const fnBody = source.slice(fnStart, fnEnd);
for (const banned of ['relay-outbox', 'relayOutbox', 'publication-ledger', 'publicationLedger', 'OUTBOX_KEY', 'sqlExecute', 'localStorage']) {
  assertNotIncludes(fnBody, banned, `evaluator must not touch (${banned})`);
}

// ---------------------------------------------------------------------------
// (4) Re-execute REAL evaluator across the restart/reload scenarios.
// ---------------------------------------------------------------------------
const api = installWebdavGates();
assert.equal(typeof api?.evaluateControlledLocalMockTransport, 'function', 'controlled local mock API exposed');

const payloadHash = 'sha256:a721ebdad94e398a4f45bc46c437f465402ad9e8ac2e68cc120eef96df9bbb85';
const idempotencyKeyHash = 'sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
const peerTargetHash = 'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc';
const remoteRootHash = 'sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd';

const base = {
  gate: 'webdav-cloud-relay-transport-controlled-apply',
  readiness: { localExportableSyncReady: true, transportEligibilityFromLocalExportableReady: true, productSyncReady: false, transportReady: false },
  killSwitch: { enabled: true },
  candidate: { kind: 'fullBundle.v2-readonly-projection', payloadHash, bundleHash: payloadHash, projectionHash: payloadHash, idempotencyKeyHash },
  target: { mode: 'local-mock-webdav', peerTargetHash, remoteRootHash, ambiguous: false },
  sequence: { mintNewExport: false, burnSequence: false, requireExistingOnly: true },
  transport: { writeWebDAV: false, writeCloud: false, enqueueRelay: false, touchChatSavingCAS: false, writeFiles: false, startFullBundleV3: false },
  safety: { mutateA950: false, cleanupAuthority: false },
  privacy: { mode: 'hash-only' },
};
const approval = {
  schema: 'h2o.studio.transport.webdav-cloud-relay-controlled-apply-approval.v1',
  approved: true, reviewedTransportApplyApproved: true, controlledLocalMockApplyApproved: true,
  scope: 'local-mock-webdav-target-only', controlledGate: 'webdav-cloud-relay-transport-controlled-apply',
  killSwitchEnabled: true, idempotencyKeyHash, candidatePayloadHash: payloadHash, candidateBundleHash: payloadHash,
  peerTargetHash, remoteRootRefHash: remoteRootHash, productSyncReady: false, transportReady: false,
  noChatSavingCas: true, noFullBundleV3: true, noA950Mutation: true, privacyHashOnly: true,
};
const replayMarker = { sameIdempotencyKey: true, samePayloadTargetSequence: true, expectZeroWrite: true, replayed: true };

function noRealWrite(r, label) {
  for (const flag of ['realWebDAVWrite', 'writesWebDAV', 'writesCloud', 'writesRelay', 'enqueuesRelay', 'writesCAS',
    'writesFiles', 'mutatesExportState', 'mintsExportId', 'burnsSequence', 'fullBundleV3Started']) {
    assert.equal(r[flag], false, `${label}: ${flag} must stay false`);
  }
  assert.equal(r.bootResumeDispatch, false, `${label}: bootResumeDispatch must stay false`);
  assert.equal(r.productSyncReady, false, `${label}: productSyncReady must stay false`);
  assert.equal(r.transportReady, false, `${label}: transportReady must stay false`);
  assert.equal(r.localExportableSyncReadyIsAuthorization, false, `${label}: local exportable readiness is not authorization`);
  assert.equal(r.noCleanupAuthority, true, `${label}: no cleanup authority`);
}

// A: reload resumes only as a zero-write idempotent replay
const reloadReplay = api.evaluateControlledLocalMockTransport({
  ...base, dryRun: false, apply: true, operatorApproval: approval,
  restart: { simulateReload: true, expectFailClosed: true }, duplicateReplay: replayMarker,
});
assert.equal(reloadReplay.ok, true, 'A: reload-as-replay ok');
assert.equal(reloadReplay.status, 'controlled-local-mock-webdav-transport-applied', 'A: status applied');
assert.equal(reloadReplay.restartFailClosed, true, 'A: restart fail-closed');
assert.equal(reloadReplay.modeledMockWriteCount, 0, 'A: reload-as-replay is zero-write');
assert.equal(reloadReplay.duplicateReplayZeroWrite, true, 'A: duplicate replay zero-write');
assert.equal(reloadReplay.blockers.length, 0, 'A: no blockers');
noRealWrite(reloadReplay, 'A reload-as-replay');

// B: boot resume tries to dispatch without the controlled gate -> fail-closed proof required
const dispatchWithoutGate = api.evaluateControlledLocalMockTransport({
  ...base, dryRun: false, apply: true, operatorApproval: approval,
  restart: { simulateBootResume: true, expectFailClosed: true, allowDispatchWithoutControlledGate: true }, duplicateReplay: replayMarker,
});
assert.equal(dispatchWithoutGate.ok, false, 'B: dispatch-without-gate blocked');
assert.equal(dispatchWithoutGate.restartFailClosed, false, 'B: restart not fail-closed when dispatch allowed');
assert.ok(dispatchWithoutGate.blockers.includes('controlled-local-mock-restart-fail-closed-proof-required'),
  `B: expected fail-closed blocker, got ${dispatchWithoutGate.blockers.join(',')}`);
noRealWrite(dispatchWithoutGate, 'B dispatch-without-gate');

// F: boot resume with no fail-closed proof -> blocked
const bootResumeNoProof = api.evaluateControlledLocalMockTransport({
  ...base, dryRun: false, apply: true, operatorApproval: approval,
  restart: { simulateBootResume: true }, duplicateReplay: replayMarker,
});
assert.equal(bootResumeNoProof.ok, false, 'F: boot resume without fail-closed proof blocked');
assert.ok(bootResumeNoProof.blockers.includes('controlled-local-mock-restart-fail-closed-proof-required'), 'F: fail-closed blocker');
noRealWrite(bootResumeNoProof, 'F boot-resume-no-proof');

// C: missing controlled gate on resume
const missingGate = api.evaluateControlledLocalMockTransport({
  ...base, gate: '', dryRun: false, apply: true, operatorApproval: approval,
  restart: { simulateReload: true, expectFailClosed: true }, duplicateReplay: replayMarker,
});
assert.equal(missingGate.ok, false, 'C: missing gate blocked');
assert.ok(missingGate.blockers.includes('controlled-local-mock-controlled-gate-required'), 'C: gate-required blocker');
noRealWrite(missingGate, 'C missing-gate');

// D: disabled kill switch on resume
const killSwitchOff = api.evaluateControlledLocalMockTransport({
  ...base, killSwitch: { enabled: false }, dryRun: false, apply: true, operatorApproval: approval,
  restart: { simulateReload: true, expectFailClosed: true }, duplicateReplay: replayMarker,
});
assert.equal(killSwitchOff.ok, false, 'D: kill switch off blocked');
assert.ok(killSwitchOff.blockers.includes('controlled-local-mock-kill-switch-disabled'), 'D: kill-switch-disabled blocker');
noRealWrite(killSwitchOff, 'D kill-switch-off');

// E: false readiness claim on resume -> productSyncReady/transportReady are still blockers
const falseReadinessClaim = api.evaluateControlledLocalMockTransport({
  ...base, readiness: { localExportableSyncReady: true, transportEligibilityFromLocalExportableReady: true, productSyncReady: true, transportReady: true },
  dryRun: false, apply: true, operatorApproval: approval,
  restart: { simulateReload: true, expectFailClosed: true }, duplicateReplay: replayMarker,
});
assert.equal(falseReadinessClaim.ok, false, 'E: false readiness claim blocked');
assert.ok(falseReadinessClaim.blockers.includes('controlled-local-mock-product-sync-ready-mismatch'), 'E: product-sync-ready-mismatch blocker');
assert.ok(falseReadinessClaim.blockers.includes('controlled-local-mock-transport-ready-mismatch'), 'E: transport-ready-mismatch blocker');
// the result's own productSyncReady/transportReady stay hardcoded false regardless of the false claim
noRealWrite(falseReadinessClaim, 'E false-readiness-claim');

console.log(JSON.stringify({
  schema: 'h2o.studio.transport.controlled-local-mock-webdav-transport-restart-reload-live-proof.validator.v1',
  lane: 'controlled-local-mock-webdav-transport',
  phase: 'restart-reload-live-proof',
  evidence: evidencePath,
  verdict: 'CONTROLLED_LOCAL_MOCK_RESTART_RELOAD_FAIL_CLOSED_NO_RESUME',
  duplicateReplayCloseoutRespected: '6c55a81b',
  firstApplyCloseoutRespected: 'c3fd4b57',
  restartFailClosed: true,
  bootResumeDispatch: false,
  reloadResumesAsZeroWriteReplay: true,
  dispatchWithoutGateBlocked: true,
  missingGateBlocked: true,
  killSwitchDisabledBlocked: true,
  falseReadinessClaimBlocked: true,
  relayOutboxTouched: false,
  publicationLedgerTouched: false,
  realWebDAVWrite: false,
  enqueuesRelay: false,
  writesCAS: false,
  writesFiles: false,
  mutatesExportState: false,
  mintsExportId: false,
  burnsSequence: false,
  fullBundleV3Started: false,
  productSyncReady: false,
  transportReady: false,
  noCleanupAuthority: true,
  authorizesRealTransport: false,
}, null, 2));
console.log('PASS validate-controlled-local-mock-webdav-transport-restart-reload-live-proof');
