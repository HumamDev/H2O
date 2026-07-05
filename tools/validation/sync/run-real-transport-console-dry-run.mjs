#!/usr/bin/env node
//
// Operator harness for W1a real-transport console dry-run.
//
// Loads the disabled control-plane source plus all standalone real-transport
// substrate sources into one VM sandbox, then runs diagnose() and a hash-only
// chained dry-run. This harness performs no product writes.

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

function H(d) {
  return `sha256:${String(d).repeat(64).slice(0, 64)}`;
}

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function loadSandbox() {
  const sandbox = { console };
  sandbox.globalThis = sandbox;
  for (const rel of modulePaths) {
    vm.runInNewContext(read(rel), sandbox, { filename: rel });
  }
  return sandbox;
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
    dryRun: {
      dryRun: true,
      apply: false,
      gate: 'real-webdav-cloud-relay-transport-dry-run-evaluate',
    },
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
      idempotencyRecord: {
        present: true,
        state: 'apply-intent-recorded',
        idempotencyKeyHash: KEY,
        candidatePayloadHash: PH,
      },
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

const sandbox = loadSandbox();
const api = sandbox.H2O?.Studio?.sync?.realTransportConsole;
if (!api) throw new Error('realTransportConsole API missing');

const diagnosis = api.diagnose();
const result = api.runChainedDryRun(buildRequest());

console.log(JSON.stringify({
  schema: 'h2o.studio.transport.real-transport-console.operator-harness.v1',
  moduleCount: modulePaths.length,
  diagnosis,
  result,
}, null, 2));
