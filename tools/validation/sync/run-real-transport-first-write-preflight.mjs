#!/usr/bin/env node
//
// Operator harness for W2a real-transport first-write preflight.
//
// Loads the standalone W2a module into a VM sandbox, evaluates a hash-only
// fixture, and computes the receipt-core sha256 outside the product module.

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';

const root = process.cwd();
const modulePath = 'src-surfaces-base/studio/sync/real-transport-first-write-preflight.js';

function H(d) {
  return `sha256:${String(d).repeat(64).slice(0, 64)}`;
}

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function receiptHash(receiptCore) {
  return `sha256:${createHash('sha256').update(String(receiptCore), 'utf8').digest('hex')}`;
}

function buildRequest() {
  const payload = H('a');
  return {
    gate: 'real-webdav-cloud-relay-transport-first-write-preflight-evaluate',
    operation: 'preflight',
    apply: false,
    b1TargetConfigReady: true,
    b1TargetConfigRefHash: H('1'),
    endpointRefHash: H('2'),
    remoteRootRefHash: H('3'),
    credentialRefHash: H('4'),
    peerIdentityBindingHash: H('5'),
    localClientIdentityHash: H('6'),
    b2KillSwitchLifecycleReady: true,
    b2KillSwitchRefHash: H('7'),
    b3DurableIdempotencyReady: true,
    b3IdempotencyRefHash: H('8'),
    b4EnqueueOutboxBoundaryReady: true,
    b4OutboxBoundaryRefHash: H('9'),
    b5ConflictPartialWriteReady: true,
    b5ConflictPolicyRefHash: H('b'),
    b6SequenceExportReady: true,
    b6SequenceExportRefHash: H('c'),
    sequenceExportConstraintRefHash: H('c'),
    b8ApprovalAccepted: true,
    realTransportApprovalAccepted: true,
    b8ApprovalRefHash: H('d'),
    b7ReadinessCandidate: true,
    transportReadyCandidate: true,
    b7ReadinessPolicyRefHash: H('e'),
    transportReadinessReviewRefHash: H('f'),
    candidatePayloadHash: payload,
    candidateBundleHash: payload,
    fullBundleV2EnvelopeHash: payload,
    payloadSchema: 'h2o.studio.fullBundle.v2',
    localExportableSyncReady: true,
    localExportableSyncReadyIsAuthorization: false,
    transportEligibilityFromLocalExportableReady: true,
    transportEligibilityIsAuthorization: false,
    productSyncReady: false,
    transportReady: false,
    transportReadyFlipAuthorized: false,
    noFullBundleV3: true,
    chatSavingCasBlocked: true,
    noCleanupAuthority: true,
    noA950Mutation: true,
    w1cProofReceiptHash: H('0'),
    b8ApprovalArtifactHash: H('1'),
    rollbackRehearsalReceiptHash: H('2'),
    remoteRootInitialStateHash: H('3'),
    recoveryPlanHash: H('4'),
    targetScope: {
      payloadKind: 'single-fullbundle-v2-envelope',
      payloadCount: 1,
      targetRefHash: H('5'),
    },
    w3InvocationScope: {
      operationKind: 'first-controlled-real-write',
      maxInvocations: 1,
      expiryUtc: '2026-07-06T00:00:00.000Z',
    },
  };
}

const sandbox = { console };
sandbox.globalThis = sandbox;
vm.runInNewContext(read(modulePath), sandbox, { filename: modulePath });

const api = sandbox.H2O?.Studio?.sync?.realTransportFirstWritePreflight;
if (!api) throw new Error('realTransportFirstWritePreflight API missing');

const result = api.evaluateRealTransportFirstWritePreflight(buildRequest());
const recomputedCore = api.buildReceiptCore(result);
const hash = receiptHash(result.receiptCore);

console.log(JSON.stringify({
  schema: 'h2o.studio.transport.real-transport-w2-first-write-preflight.operator-harness.v1',
  result,
  receiptCoreMatchesBuilder: result.receiptCore === recomputedCore,
  receiptHash: hash,
}, null, 2));
