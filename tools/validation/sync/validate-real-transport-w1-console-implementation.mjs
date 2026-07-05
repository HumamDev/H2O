#!/usr/bin/env node
//
// W1a real-transport console implementation validator.
//
// Re-executes the disabled control plane plus all standalone real-transport
// substrates in a VM sandbox with side-effect canaries. Proves the console
// diagnose fan-out, chained dry-run, fail-closed behavior, privacy boundaries,
// non-wiring, and coercion resistance.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';

const root = process.cwd();

const modulePaths = [
  'src-surfaces-base/studio/sync/webdav-transport-gates.js',
  'src-surfaces-base/studio/sync/real-transport-target-config.js',
  'src-surfaces-base/studio/sync/real-transport-kill-switch.js',
  'src-surfaces-base/studio/sync/real-transport-idempotency.js',
  'src-surfaces-base/studio/sync/real-transport-enqueue-boundary.js',
  'src-surfaces-base/studio/sync/real-transport-conflict-recovery.js',
  'src-surfaces-base/studio/sync/real-transport-sequence-export.js',
  'src-surfaces-base/studio/sync/real-transport-approval.js',
  'src-surfaces-base/studio/sync/real-transport-readiness.js',
  'src-surfaces-base/studio/sync/real-transport-dry-run.js',
  'src-surfaces-base/studio/sync/real-transport-console.js',
];

const existingRealTransportModules = modulePaths.filter((p) =>
  /real-transport-.*\.js$/.test(p) && !p.endsWith('real-transport-console.js'));

const protectedPaths = [
  'src-surfaces-base/studio/studio.html',
  'tools/product/studio/pack-studio.mjs',
  'src-surfaces-base/studio/sync/webdav-transport-gates.js',
  ...existingRealTransportModules,
];

const evidencePath = 'release-evidence/2026-07-05/real-transport-w1a-console-implementation.md';
const dryRunCloseoutPath = 'release-evidence/2026-07-01/real-webdav-cloud-relay-transport-dry-run-proof-closeout.md';
const dryRunImplPath = 'release-evidence/2026-07-01/real-webdav-cloud-relay-transport-dry-run-implementation.md';
const b7ImplPath = 'release-evidence/2026-07-01/real-transport-b7-transportready-evaluation-implementation.md';
const b8ImplPath = 'release-evidence/2026-07-01/real-transport-b8-approval-acceptance-implementation.md';
const b1b6RollupPath = 'release-evidence/2026-07-01/real-transport-b1-b6-implementation-rollup.md';

function read(rel) {
  const abs = path.join(root, rel);
  assert.ok(fs.existsSync(abs), `missing ${rel}`);
  return fs.readFileSync(abs, 'utf8');
}

function compact(v) {
  return String(v).replace(/\s+/g, ' ');
}

function assertIncludes(src, token, label) {
  assert.ok(String(src).includes(token), `${label}: missing ${token}`);
}

function assertNotIncludes(src, token, label) {
  assert.ok(!String(src).includes(token), `${label}: forbidden ${token}`);
}

function H(d) {
  return `sha256:${String(d).repeat(64).slice(0, 64)}`;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function buildRequest() {
  const PH = H('a');
  const KEY = H('b');
  const refs = {
    b1TargetConfigRefHash: H('1'),
    b2KillSwitchRefHash: H('2'),
    b3IdempotencyRefHash: KEY,
    b4OutboxBoundaryRefHash: H('3'),
    b5ConflictPolicyRefHash: H('4'),
    b6SequenceExportRefHash: H('5'),
    b7ReadinessPolicyRefHash: H('6'),
    transportReadinessReviewRefHash: H('7'),
    endpointRefHash: H('8'),
    remoteRootRefHash: H('9'),
    credentialRefHash: H('c'),
    peerIdentityBindingHash: H('d'),
    localClientIdentityHash: H('e'),
    killSwitchEnableTokenHash: H('f'),
    idempotencyKeyHash: KEY,
    b8ApprovalRefHash: H('0'),
    approvalRecordHash: H('0'),
    sequenceExportConstraintRefHash: H('5'),
    outboxRecordHash: H('3'),
    b5VerifiedWriteRefHash: H('4'),
    candidatePayloadHash: PH,
    candidateBundleHash: PH,
    fullBundleV2EnvelopeHash: PH,
    payloadSchema: 'h2o.studio.fullBundle.v2',
    fullBundleV3Deferred: true,
    chatSavingCasSeparate: true,
    noChatSavingCAS: true,
    chatSavingCasBlocked: true,
    a950DocumentedDebtQuarantined: true,
    a950LeaksIntoExportablePayload: false,
    noA950Mutation: true,
    privacyHashOnly: true,
  };

  return {
    refs,
    dryRun: { dryRun: true, apply: false, gate: 'real-webdav-cloud-relay-transport-dry-run-evaluate' },
    b1: {
      targetMode: 'real-webdav',
      endpointRefHash: refs.endpointRefHash,
      remoteRootRefHash: refs.remoteRootRefHash,
      credentialRefHash: refs.credentialRefHash,
      peerIdentityBindingHash: refs.peerIdentityBindingHash,
      localClientIdentityHash: refs.localClientIdentityHash,
    },
    b2: {
      operation: 'enable',
      reviewedKillSwitchEnableApproved: true,
      killSwitchScope: 'real-webdav-cloud-relay-controlled-write',
      killSwitchExists: true,
      endpointRefHash: refs.endpointRefHash,
      remoteRootRefHash: refs.remoteRootRefHash,
      credentialRefHash: refs.credentialRefHash,
      peerIdentityBindingHash: refs.peerIdentityBindingHash,
      localClientIdentityHash: refs.localClientIdentityHash,
      killSwitchEnableTokenHash: refs.killSwitchEnableTokenHash,
      b8ApprovalRefHash: refs.b8ApprovalRefHash,
      b7ReadinessPolicyRefHash: refs.b7ReadinessPolicyRefHash,
      productSyncReady: false,
      transportReady: false,
    },
    b3: {
      attempt: { phase: 'preflight' },
      idempotencyKeyHash: KEY,
      candidatePayloadHash: PH,
      candidateBundleHash: PH,
      endpointRefHash: refs.endpointRefHash,
      remoteRootRefHash: refs.remoteRootRefHash,
      peerIdentityBindingHash: refs.peerIdentityBindingHash,
      credentialRefHash: refs.credentialRefHash,
      killSwitchEnableTokenHash: refs.killSwitchEnableTokenHash,
      b8ApprovalRefHash: refs.b8ApprovalRefHash,
      b7ReadinessPolicyRefHash: refs.b7ReadinessPolicyRefHash,
      sequenceExportConstraintRefHash: refs.sequenceExportConstraintRefHash,
      operationKind: 'real-webdav-cloud-relay-upload',
      activeTransport: 'real-webdav',
      productSyncReady: false,
      transportReady: false,
      existingRecord: { present: false },
    },
    b4: {
      operation: 'enqueue',
      candidatePayloadHash: PH,
      candidateBundleHash: PH,
      endpointRefHash: refs.endpointRefHash,
      remoteRootRefHash: refs.remoteRootRefHash,
      peerIdentityBindingHash: refs.peerIdentityBindingHash,
      credentialRefHash: refs.credentialRefHash,
      idempotencyKeyHash: KEY,
      b8ApprovalRefHash: refs.b8ApprovalRefHash,
      killSwitchEnableTokenHash: refs.killSwitchEnableTokenHash,
      sequenceExportConstraintRefHash: refs.sequenceExportConstraintRefHash,
      b8ApprovalAccepted: true,
      killSwitch: { enabled: true },
      b7PolicyAllowsEvaluation: true,
      b5PolicyAvailable: true,
      b6PolicyAvailable: true,
      targetMode: 'real-webdav',
      idempotencyRecord: { present: true, state: 'apply-intent-recorded', idempotencyKeyHash: KEY, candidatePayloadHash: PH },
      productSyncReady: false,
      transportReady: false,
    },
    b5: {
      conflictClass: 'local-payload-stale',
      partialWriteState: 'no-remote-write-attempted',
      candidatePayloadHash: PH,
      candidateBundleHash: PH,
      fullBundleV2EnvelopeHash: PH,
      endpointRefHash: refs.endpointRefHash,
      remoteRootRefHash: refs.remoteRootRefHash,
      peerIdentityBindingHash: refs.peerIdentityBindingHash,
      credentialRefHash: refs.credentialRefHash,
      idempotencyKeyHash: KEY,
      outboxRecordHash: refs.outboxRecordHash,
      b8ApprovalRefHash: refs.b8ApprovalRefHash,
      killSwitchEnableTokenHash: refs.killSwitchEnableTokenHash,
      sequenceExportConstraintRefHash: refs.sequenceExportConstraintRefHash,
      b3IdempotencyStatePresent: true,
      b3IdempotencyState: 'apply-intent-recorded',
      b4OutboxStatePresent: true,
      b4OutboxState: 'queued',
      b2KillSwitchEnabled: true,
      b8ApprovalValid: true,
      b6SequenceExportConstraintsPresent: true,
      productSyncReady: false,
      transportReady: false,
    },
    b6: {
      finalizationState: 'remote-write-observed-checksum-verified',
      candidatePayloadHash: PH,
      candidateBundleHash: PH,
      idempotencyKeyHash: KEY,
      b8ApprovalRefHash: refs.b8ApprovalRefHash,
      killSwitchEnableTokenHash: refs.killSwitchEnableTokenHash,
      endpointRefHash: refs.endpointRefHash,
      remoteRootRefHash: refs.remoteRootRefHash,
      peerIdentityBindingHash: refs.peerIdentityBindingHash,
      credentialRefHash: refs.credentialRefHash,
      sequenceExportConstraintRefHash: refs.sequenceExportConstraintRefHash,
      exportIdRefHash: H('6'),
      burnedSequenceRefHash: H('7'),
      outboxRecordHash: refs.outboxRecordHash,
      b5VerifiedWriteRefHash: refs.b5VerifiedWriteRefHash,
      b3IdempotencyEvidencePresent: true,
      b3IdempotencyState: 'remote-write-observed',
      b4OutboxEvidencePresent: true,
      b4OutboxState: 'remote-write-observed',
      b5VerifiedRemoteWrite: true,
      b5PartialWriteState: 'remote-write-observed-checksum-verified',
      b8ApprovalValid: true,
      b2KillSwitchValid: true,
      productSyncReady: false,
      transportReady: false,
    },
    b8: {
      approval: {
        schema: 'h2o.studio.transport.real-webdav-cloud-relay-transport-apply-approval.v1',
        approved: true,
        reviewedRealTransportApplyApproved: true,
        realWebDAVCloudRelayApproved: true,
        scope: 'real-webdav-cloud-relay-target',
        targetMode: 'real-webdav',
        productSyncReady: false,
        transportReady: false,
        privacyHashOnly: true,
        operatorIdHash: H('1'),
        reviewIdHash: H('2'),
        approvedAtIso: '2026-07-05T00:00:00.000Z',
        endpointRefHash: refs.endpointRefHash,
        remoteRootRefHash: refs.remoteRootRefHash,
        credentialRefHash: refs.credentialRefHash,
        peerIdentityBindingHash: refs.peerIdentityBindingHash,
        localClientIdentityHash: refs.localClientIdentityHash,
        killSwitchEnableTokenHash: refs.killSwitchEnableTokenHash,
        idempotencyKeyHash: KEY,
        conflictPolicyRefHash: refs.b5ConflictPolicyRefHash,
        sequenceExportConstraintRefHash: refs.sequenceExportConstraintRefHash,
        b7ReadinessPolicyRefHash: refs.b7ReadinessPolicyRefHash,
        b8ApprovalRefHash: refs.b8ApprovalRefHash,
        approvalRecordHash: refs.approvalRecordHash,
        candidatePayloadHash: PH,
        candidateBundleHash: PH,
        fullBundleV2EnvelopeHash: PH,
        payloadSchema: 'h2o.studio.fullBundle.v2',
        noA950Mutation: true,
        noCleanupAuthority: true,
        noFullBundleV3: true,
        chatSavingCasSeparate: true,
        noChatSavingCAS: true,
        rawEndpointLogged: false,
        rawCredentialLogged: false,
        rawRemotePathLogged: false,
        rawPayloadBodyLogged: false,
      },
    },
    b7: {
      evidence: {
        targetMode: 'real-webdav',
        b1TargetConfigReady: true,
        b1TargetConfigRefHash: refs.b1TargetConfigRefHash,
        endpointRefHash: refs.endpointRefHash,
        remoteRootRefHash: refs.remoteRootRefHash,
        credentialRefHash: refs.credentialRefHash,
        peerIdentityBindingHash: refs.peerIdentityBindingHash,
        localClientIdentityHash: refs.localClientIdentityHash,
        b2KillSwitchLifecycleReady: true,
        b2KillSwitchRefHash: refs.b2KillSwitchRefHash,
        b3DurableIdempotencyReady: true,
        b3IdempotencyRefHash: refs.b3IdempotencyRefHash,
        b4EnqueueOutboxBoundaryReady: true,
        b4OutboxBoundaryRefHash: refs.b4OutboxBoundaryRefHash,
        b5ConflictPartialWriteReady: true,
        b5ConflictPolicyRefHash: refs.b5ConflictPolicyRefHash,
        b6SequenceExportReady: true,
        b6SequenceExportRefHash: refs.b6SequenceExportRefHash,
        b8ApprovalAccepted: true,
        realTransportApprovalAccepted: true,
        b8ApprovalRefHash: refs.b8ApprovalRefHash,
        b7ReadinessPolicyRefHash: refs.b7ReadinessPolicyRefHash,
        transportReadinessReviewRefHash: refs.transportReadinessReviewRefHash,
        localExportableSyncReady: true,
        transportEligibilityFromLocalExportableReady: true,
        productSyncReady: false,
        transportReady: false,
        candidatePayloadHash: PH,
        candidateBundleHash: PH,
        fullBundleV2EnvelopeHash: PH,
        payloadSchema: 'h2o.studio.fullBundle.v2',
        fullBundleV3Deferred: true,
        chatSavingCasSeparate: true,
        noChatSavingCAS: true,
        chatSavingCasBlocked: true,
        a950DocumentedDebtQuarantined: true,
        a950LeaksIntoExportablePayload: false,
        noA950Mutation: true,
      },
    },
  };
}

function loadSandbox(paths = modulePaths) {
  const calls = [];
  const sandbox = {
    console,
    localStorage: {
      getItem() { calls.push('localStorage.getItem'); throw new Error('canary localStorage.getItem'); },
      setItem() { calls.push('localStorage.setItem'); throw new Error('canary localStorage.setItem'); },
      removeItem() { calls.push('localStorage.removeItem'); throw new Error('canary localStorage.removeItem'); },
    },
    fetch() { calls.push('fetch'); throw new Error('canary fetch'); },
    XMLHttpRequest() { calls.push('XMLHttpRequest'); throw new Error('canary XMLHttpRequest'); },
    invoke() { calls.push('invoke'); throw new Error('canary invoke'); },
  };
  sandbox.globalThis = sandbox;
  for (const rel of paths) {
    vm.runInNewContext(read(rel), sandbox, { filename: rel });
  }
  return { sandbox, calls };
}

function apiFrom(sandbox) {
  return sandbox.H2O?.Studio?.sync?.realTransportConsole;
}

function assertCompositeNoWrites(result, label) {
  for (const key of [
    'realWebDAVTransportAvailable',
    'realTransportWrite',
    'transportReady',
    'transportReadyFlipAuthorized',
    'productSyncReady',
    'writesWebDAV',
    'writesCloud',
    'writesRelay',
    'writesCAS',
    'writesFiles',
    'enqueuesRelay',
    'realOutboxRowCreated',
    'relayOutboxTouched',
    'publicationLedgerTouched',
    'durableStoreCreated',
    'exportIdMinted',
    'sequenceBurned',
    'outboxWriteAllowed',
    'ledgerWriteAllowed',
    'realRecoveryExecuted',
    'retryDispatched',
    'remoteWriteAttempted',
    'mintsExportId',
    'burnsSequence',
    'mutatesExportState',
    'fullBundleV3Started',
  ]) {
    assert.equal(result[key], false, `${label}: ${key}`);
  }
  assert.equal(result.noCleanupAuthority, true, `${label}: noCleanupAuthority`);
  assert.equal(result.noA950Mutation, true, `${label}: noA950Mutation`);
}

function stagedPaths() {
  const output = execFileSync('git', ['diff', '--cached', '--name-only'], { cwd: root, encoding: 'utf8' });
  return output.split(/\r?\n/).filter(Boolean);
}

// ---------------------------------------------------------------------------
// Evidence and anchor checks.
// ---------------------------------------------------------------------------
const evidence = read(evidencePath);
const flatEvidence = compact(evidence);
for (const token of [
  'W1A REAL-TRANSPORT CONSOLE AGGREGATOR SUBSTRATE IMPLEMENTED AS STANDALONE, NON-WRITING',
  'ba5844f7',
  'f93350d4',
  '34356fa6',
  'a4777528',
  '10e1ee6c',
  '93eb9065',
  'de4aa12d',
  '804b6d67',
  '1117f976',
  '334361cc',
  '7cac0d82',
  'H2O.Studio.sync.realTransportConsole.diagnose()',
  'H2O.Studio.sync.realTransportConsole.runChainedDryRun(request)',
  'Loader registration is deferred to W1b',
]) {
  assertIncludes(flatEvidence, token, `evidence token ${token}`);
}
for (const forbidden of [
  'real transport is now available',
  'real write is authorized',
  'transportReady:true` is set',
  'productSyncReady:true` is set',
  'outbox row was created',
  'ledger row was written',
  'durable store was created',
  'a950 was cleaned',
]) {
  assertNotIncludes(flatEvidence, forbidden, `forbidden evidence claim ${forbidden}`);
}
assertIncludes(read(dryRunCloseoutPath), 'REAL WEBDAV/CLOUD/RELAY TRANSPORT DRY-RUN PROOF PASSED BY VM SOURCE HARNESS',
  'dry-run proof closeout respected');
assertIncludes(read(dryRunImplPath), 'REAL WEBDAV/CLOUD/RELAY TRANSPORT DRY-RUN SUBSTRATE IMPLEMENTED AS A NON-WRITING',
  'dry-run implementation respected');
assertIncludes(read(b7ImplPath), 'B7 REAL TRANSPORTREADY EVALUATION SUBSTRATE IMPLEMENTED AS A NON-WRITING',
  'B7 implementation respected');
assertIncludes(read(b8ImplPath), 'B8 REAL APPROVAL ACCEPTANCE SUBSTRATE IMPLEMENTED AS A NON-WRITING',
  'B8 implementation respected');
assertIncludes(read(b1b6RollupPath), 'B1-B6 REAL-TRANSPORT SUBSTRATES ARE IMPLEMENTED AS STANDALONE',
  'B1-B6 rollup respected');

// ---------------------------------------------------------------------------
// Source checks: console is inert and protected files are not staged.
// ---------------------------------------------------------------------------
const consoleSource = read('src-surfaces-base/studio/sync/real-transport-console.js');
assertIncludes(consoleSource, 'H2O.Studio.sync.realTransportConsole.diagnose = diagnose', 'diagnose API exposed');
assertIncludes(consoleSource, 'H2O.Studio.sync.realTransportConsole.runChainedDryRun = runChainedDryRun',
  'runChainedDryRun API exposed');
for (const forbidden of [
  'sqlExecute',
  'fetch(',
  'XMLHttpRequest',
  'writeFile(',
  'writeFileSync',
  'invoke(',
  'localStorage.setItem',
  'addEventListener',
  'setTimeout',
  'setInterval',
]) {
  assertNotIncludes(consoleSource, forbidden, `console source forbidden primitive ${forbidden}`);
}
for (const staged of stagedPaths()) {
  assert.ok(!protectedPaths.includes(staged), `protected path staged unexpectedly: ${staged}`);
}

// ---------------------------------------------------------------------------
// VM/canary load proof + diagnose fan-out.
// ---------------------------------------------------------------------------
const { sandbox, calls } = loadSandbox();
assert.deepEqual(calls, [], 'load-time canaries did not fire');
const api = apiFrom(sandbox);
assert.equal(typeof api?.diagnose, 'function', 'diagnose API available');
assert.equal(typeof api?.runChainedDryRun, 'function', 'runChainedDryRun API available');

const diagnosis = api.diagnose();
assert.equal(diagnosis.ok, true, 'diagnose ok');
assert.equal(diagnosis.missingSubstrates.length, 0, 'diagnose no missing substrates');
for (const key of ['b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b8', 'b7', 'dryRun']) {
  assert.ok(diagnosis.substrateDiagnostics[key], `diagnose fan-out includes ${key}`);
}
assertCompositeNoWrites(diagnosis, 'diagnose');

// ---------------------------------------------------------------------------
// Valid chained dry-run.
// ---------------------------------------------------------------------------
const valid = api.runChainedDryRun(buildRequest());
assert.equal(valid.ok, true, 'valid chained dry-run ok');
assert.equal(valid.status, 'real-transport-console-chained-dry-run-ready', 'valid chained dry-run status');
assert.equal(valid.substrateResults.dryRun.status, 'real-webdav-cloud-relay-transport-dry-run-ready',
  'dry-run substrate ready');
assert.equal(valid.transportReadyCandidate, true, 'B7 candidate passes through');
assert.equal(valid.realTransportApprovalAccepted, true, 'B8 approval validity passes through');
assert.equal(valid.localExportableSyncReadyIsAuthorization, false, 'localExportableSyncReady is not authorization');
assert.equal(valid.localMockSubstitutionAccepted, false, 'local mock substitution not accepted');
assertCompositeNoWrites(valid, 'valid chained dry-run');

// Missing substrate fail-closed.
for (const [key, namespace] of [
  ['b1', 'realTransportTargetConfig'],
  ['b2', 'realTransportKillSwitch'],
  ['b3', 'realTransportIdempotency'],
  ['b4', 'realTransportEnqueueBoundary'],
  ['b5', 'realTransportConflictRecovery'],
  ['b6', 'realTransportSequenceExport'],
  ['b8', 'realTransportApproval'],
  ['b7', 'realTransportReadiness'],
  ['dryRun', 'realTransportDryRun'],
]) {
  const fresh = loadSandbox().sandbox;
  delete fresh.H2O.Studio.sync[namespace];
  const missingApi = apiFrom(fresh);
  const diag = missingApi.diagnose();
  assert.equal(diag.ok, false, `${key}: diagnose fails closed`);
  assert.ok(diag.missingSubstrates.includes(key), `${key}: diagnose reports missing`);
  const res = missingApi.runChainedDryRun(buildRequest());
  assert.equal(res.ok, false, `${key}: run fails closed`);
  assert.ok(res.missingSubstrates.includes(key), `${key}: run reports missing`);
  assertCompositeNoWrites(res, `${key}: missing substrate`);
}

// Local mock approval and target cannot substitute.
const localMockApproval = buildRequest();
localMockApproval.b8.approval.schema = 'h2o.studio.transport.controlled-local-mock-webdav-transport-approval.v1';
localMockApproval.b8.approval.scope = 'local-mock-webdav-target-only';
const localMockApprovalResult = api.runChainedDryRun(localMockApproval);
assert.equal(localMockApprovalResult.ok, false, 'local mock approval blocks');
assert.ok(localMockApprovalResult.blockers.some((b) => b.includes('local-mock')), 'local mock approval blocker present');
assertCompositeNoWrites(localMockApprovalResult, 'local mock approval');

const localMockTarget = buildRequest();
localMockTarget.b1.targetMode = 'local-mock-webdav';
localMockTarget.b7.evidence.targetMode = 'local-mock-webdav';
const localMockTargetResult = api.runChainedDryRun(localMockTarget);
assert.equal(localMockTargetResult.ok, false, 'local mock target blocks');
assert.ok(localMockTargetResult.blockers.some((b) => b.includes('local-mock') || b.includes('real-target')),
  'local mock target blocker present');
assertCompositeNoWrites(localMockTargetResult, 'local mock target');

// localExportableSyncReady alone is not authorization.
const localOnly = api.runChainedDryRun({
  refs: {
    localExportableSyncReady: true,
    transportEligibilityFromLocalExportableReady: true,
    productSyncReady: false,
    transportReady: false,
  },
  dryRun: { dryRun: true, apply: false, gate: 'real-webdav-cloud-relay-transport-dry-run-evaluate' },
});
assert.equal(localOnly.ok, false, 'localExportable alone blocks');
assert.equal(localOnly.localExportableSyncReadyIsAuthorization, false, 'localExportable remains non-authorizing');
assertCompositeNoWrites(localOnly, 'localExportable alone');

// Raw and CAS inputs block and are not echoed.
const rawMarker = 'raw-secret-endpoint-marker';
const raw = buildRequest();
raw.b1.rawEndpoint = rawMarker;
raw.b8.approval.rawPayloadBody = rawMarker;
const rawResult = api.runChainedDryRun(raw);
assert.equal(rawResult.ok, false, 'raw input blocks');
assert.ok(!JSON.stringify(rawResult).includes(rawMarker), 'raw marker not echoed');
assertCompositeNoWrites(rawResult, 'raw input');

const casMarker = 'raw-cas-key-marker';
const cas = buildRequest();
cas.b3.casKey = casMarker;
cas.b5.casKey = casMarker;
const casResult = api.runChainedDryRun(cas);
assert.equal(casResult.ok, false, 'CAS input blocks');
assert.ok(!JSON.stringify(casResult).includes(casMarker), 'CAS marker not echoed');
assertCompositeNoWrites(casResult, 'CAS input');

// Coercion resistance for composite flags.
const coerce = buildRequest();
for (const key of [
  'realWebDAVTransportAvailable',
  'transportReady',
  'transportReadyFlipAuthorized',
  'productSyncReady',
  'writesWebDAV',
  'writesCloud',
  'writesRelay',
  'writesCAS',
  'writesFiles',
  'enqueuesRelay',
  'realOutboxRowCreated',
  'relayOutboxTouched',
  'publicationLedgerTouched',
  'durableStoreCreated',
  'mintsExportId',
  'burnsSequence',
  'mutatesExportState',
  'fullBundleV3Started',
]) {
  coerce[key] = true;
}
const coerced = api.runChainedDryRun(coerce);
assertCompositeNoWrites(coerced, 'coerced flags');

console.log(JSON.stringify({
  ok: true,
  validator: 'validate-real-transport-w1-console-implementation',
  moduleCount: modulePaths.length,
  validChainedDryRun: valid.ok,
  missingSubstratesFailClosed: true,
  canaryCalls: calls.length,
  realWebDAVTransportAvailable: valid.realWebDAVTransportAvailable,
  productSyncReady: valid.productSyncReady,
  transportReady: valid.transportReady,
  fullBundleV3Started: valid.fullBundleV3Started,
}, null, 2));
