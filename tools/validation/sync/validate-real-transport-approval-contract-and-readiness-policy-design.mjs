#!/usr/bin/env node
//
// Real-transport approval contract (B8) + transportReady policy (B7) design validator.
//
// Proves the B8+B7 design: it respects the gap review (d2bea4c0); B8 and B7 are design-only (the proposed real-transport
// approval schema and transportReady policy schema are NOT minted in product source); real-transport approval remains
// false; transportReady and productSyncReady remain false; local mock approval is not real transport approval; B1-B6
// remain open blockers; fullBundle.v3 remains deferred/not-started; Chat Saving CAS remains blocked/deferred; and no
// real transport write authorization and no cleanup/a950 mutation authority is introduced. It confirms the source is
// unmutated. Evidence/validator-only; no product source changed.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

const designPath = 'release-evidence/2026-07-01/real-transport-approval-contract-and-readiness-policy-design.md';
const gapReviewPath = 'release-evidence/2026-07-01/real-webdav-cloud-relay-transport-readiness-gap-review.md';
const finalRollupPath = 'release-evidence/2026-07-01/controlled-local-mock-webdav-transport-final-rollup.md';
const transportGatesPath = 'src-surfaces-base/studio/sync/webdav-transport-gates.js';
const folderSyncPath = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const chatSavingBoundaryPath = 'tools/validation/studio/validate-saved-chat-archive-cloud-sync-boundary-v1.mjs';

function read(rel) { const abs = path.join(root, rel); assert.ok(fs.existsSync(abs), `missing ${rel}`); return fs.readFileSync(abs, 'utf8'); }
function compact(v) { return String(v).replace(/\s+/g, ' '); }
function assertIncludes(src, tok, label) { assert.ok(String(src).includes(tok), `${label}: missing ${tok}`); }
function assertNotIncludes(src, tok, label) { assert.ok(!String(src).includes(tok), `${label}: forbidden ${tok}`); }

const design = read(designPath);
const flat = compact(design);
const transportGates = read(transportGatesPath);
const folderSync = read(folderSyncPath);
const chatSavingBoundary = read(chatSavingBoundaryPath);

const APPROVAL_SCHEMA = 'h2o.studio.transport.real-webdav-cloud-relay-transport-apply-approval.v1';
const POLICY_SCHEMA = 'h2o.studio.transport.real-transportready-policy.v1';

// ---------------------------------------------------------------------------
// (1) Design content anchors: verdict, B8 fields, B7 rules, failure modes, blockers, next lane.
// ---------------------------------------------------------------------------
for (const token of [
  'B8 REAL-TRANSPORT APPROVAL CONTRACT AND B7 `transportReady` POLICY ARE DESIGNED (DESIGN / SPECIFICATION',
  'design/specification evidence + validator slice only',
  'd2bea4c0', '15a33852', '40f52a5f', 'edb30677',
  // B8 schema + flags + fields
  APPROVAL_SCHEMA,
  'reviewedRealTransportApplyApproved: true',
  'realWebDAVCloudRelayApproved: true',
  "scope: 'real-webdav-cloud-relay-target'",
  'peerIdentityBindingHash',
  'endpointRefHash',
  'credentialRefHash',
  'rawEndpointLogged: false',
  'rawCredentialLogged: false',
  "payloadSchema: 'h2o.studio.fullBundle.v2'",
  'durableIdempotencyStoreRef',
  'sequenceExportIdPolicyRef',
  'killSwitchLifecycleRef',
  'conflictPartialWritePolicyRef',
  'chatSavingCasSeparateAcknowledged: true',
  'noA950Mutation: true',
  'noCleanupAuthority: true',
  'noFullBundleV3: true',
  // failure modes
  'real-transport-approval-required',
  'real-transport-approval-schema-mismatch',
  'real-transport-approval-local-mock-not-accepted',
  'real-transport-prerequisite-blocker-open',
  'real-transport-credential-redaction-missing',
  'real-transport-kill-switch-disabled',
  // local mock not real
  'Local mock approval is never real transport approval',
  // B7 policy
  POLICY_SCHEMA,
  '`localExportableSyncReady:true` is NOT `transportReady`',
  '`transportEligibilityFromLocalExportableReady:true` is NOT `transportReady`',
  'requires a SEPARATE explicit reviewed readiness',
  'must NEVER imply Chat Saving CAS readiness',
  'must NOT clean or mutate `row:a950a44b859f`',
  // remaining blockers + next lane + start-now
  '## Remaining Blockers (B1-B6 still open)',
  'B1 - real target config + credentials + peer identity',
  '## Can Real Transport Start Now?',
]) {
  assertIncludes(flat, token, `design token ${token}`);
}

// B1-B6 all listed as still-open blockers
for (const blocker of [
  '**B1** real-target-config-missing',
  '**B2** kill-switch-real-lifecycle-missing',
  '**B3** durable-idempotency-store-missing',
  '**B4** real-enqueue-boundary-undesigned',
  '**B5** real-conflict-partial-write-handling-missing',
  '**B6** real-sequence-export-id-semantics-undesigned',
]) {
  assertIncludes(flat, blocker, `B1-B6 open blocker ${blocker}`);
}

for (const forbidden of [
  'realTransportApprovalAccepted: true',
  'realTransportApprovalAccepted:true',
  'transportReady:true` remains',
  'productSyncReady:true` remains',
  'real transport is authorized',
  'authorizes real transport',
  'real transport may start now',
  'row:a950a44b859f` was cleaned',
]) {
  assertNotIncludes(flat, forbidden, `design must not claim: ${forbidden}`);
}

// ---------------------------------------------------------------------------
// (2) Chain evidence retained.
// ---------------------------------------------------------------------------
assertIncludes(read(gapReviewPath), 'REAL WEBDAV/CLOUD/RELAY TRANSPORT CANNOT START NOW', 'gap review respected');
assertIncludes(read(finalRollupPath), 'THE CONTROLLED LOCAL MOCK WEBDAV TRANSPORT LANE IS COMPLETE AND AT A STABLE HANDOFF POINT',
  'final local mock rollup respected');

// ---------------------------------------------------------------------------
// (3) DESIGN-ONLY: the proposed schemas are NOT minted in product source; source invariants unmutated.
// ---------------------------------------------------------------------------
assertNotIncludes(transportGates, APPROVAL_SCHEMA, 'real-transport approval schema must not be minted in source (design-only)');
assertNotIncludes(transportGates, POLICY_SCHEMA, 'real-transportready policy schema must not be minted in source (design-only)');
for (const token of [
  'realTransportApprovalAccepted: false',
  'realWebDAVTransportAvailable: false',
  'transportReady: false',
  'realWebDAVWrite: false',
  'localExportableSyncReadyIsAuthorization: false',
]) {
  assertIncludes(transportGates, token, `source invariant ${token}`);
}
assert.ok(!transportGates.includes('realTransportApprovalAccepted: true'), 'source must not accept real transport approval');
assert.ok(!transportGates.includes('productSyncReady: true') && !transportGates.includes('productSyncReady = true'),
  'source must not flip productSyncReady true');
assert.doesNotMatch(`${transportGates}\n${folderSync}`, /h2o\.studio\.fullBundle\.v3|fullBundle\.v3/i, 'no fullBundle.v3 in source');
assertIncludes(folderSync, "webdav: 'deferred'", 'folder sync WebDAV deferred');
assertIncludes(chatSavingBoundary, 'deferred encrypted', 'Chat Saving CAS deferred lane retained');

console.log(JSON.stringify({
  schema: 'h2o.studio.transport.real-transport-approval-contract-and-readiness-policy-design.validator.v1',
  lane: 'real-webdav-cloud-relay-transport',
  phase: 'b8-b7-approval-contract-and-transportready-policy-design',
  evidence: designPath,
  verdict: 'B8_B7_DESIGNED_DESIGN_ONLY_REAL_TRANSPORT_STILL_BLOCKED',
  gapReviewRespected: 'd2bea4c0',
  designOnly: true,
  approvalSchemaMintedInSource: false,
  policySchemaMintedInSource: false,
  realTransportApprovalAccepted: false,
  localMockApprovalIsRealTransportApproval: false,
  transportReady: false,
  productSyncReady: false,
  remainingBlockers: ['B1', 'B2', 'B3', 'B4', 'B5', 'B6'],
  fullBundleV3Started: false,
  chatSavingCasBlocked: true,
  cleanupAuthorityIntroduced: false,
  realTransportWriteAuthorizationIntroduced: false,
  recommendedNextLane: 'B1-real-target-config-credentials-peer-identity-design-only',
}, null, 2));
console.log('PASS validate-real-transport-approval-contract-and-readiness-policy-design');
