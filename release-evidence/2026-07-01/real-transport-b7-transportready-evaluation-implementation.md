# Real-Transport B7 - transportReady Evaluation - Implementation

Verdict: **B7 REAL TRANSPORTREADY EVALUATION SUBSTRATE IMPLEMENTED AS A NON-WRITING, HASH-ONLY EVALUATE/DIAGNOSE
MODULE. VALID B1-B6 + B8 EVIDENCE MAY RETURN `transportReadyCandidate:true` ONLY AS A MODELED READINESS CANDIDATE.
AUTHORITATIVE `transportReady:false` REMAINS, `transportReadyFlipAuthorized:false` REMAINS, AND `productSyncReady:false`
REMAINS. THIS SLICE AUTHORIZES NO REAL WRITE, NO FLIP, AND NO CLEANUP**.

This implementation is non-writing and non-activating. It does not implement real WebDAV/cloud/relay transport, does
not write WebDAV/cloud/relay/CAS/files, does not enqueue relay, does not add real credentials, does not log raw
endpoint/credential/path/payload values, does not mint or start `fullBundle.v3`, does not mutate export state, does not
mint an export id, does not burn sequence, does not flip `productSyncReady`, does not mutate global/source
`transportReady`, and does not clean or mutate `row:a950a44b859f`.

## Anchors Respected

- B8 real approval acceptance implementation: `a4777528`.
- B1-B6 implementation rollup: `10e1ee6c`.
- B8 real approval contract + B7 `transportReady` policy design: `26e6241b`.
- B6 real sequence / export-id semantics implementation: `7cac0d82`.
- B5 real conflict / partial-write handling implementation: `334361cc`.
- B4 real enqueue / outbox boundary implementation: `1117f976`.
- B3 durable idempotency substrate implementation: `804b6d67`.
- B2 kill-switch lifecycle implementation: `de4aa12d`.
- B1 target config / credentials / peer identity implementation: `93eb9065`.

## Source Change

- New module: `src-surfaces-base/studio/sync/real-transport-readiness.js`.
- Exposed API: `H2O.Studio.sync.realTransportReadiness.evaluateRealTransportReadiness(request)`.
- Diagnostic API: `H2O.Studio.sync.realTransportReadiness.diagnose()`.
- Result schema: `h2o.studio.transport.real-transport-b7-readiness-result.v1`.
- Request schema: `h2o.studio.transport.real-transport-b7-readiness-request.v1`.

The module follows the B1-B8 standalone pure-evaluator pattern. It is intentionally standalone and non-activating. It
is not wired into `studio.html`, `pack-studio.mjs`, or `webdav-transport-gates.js`.

## B7 Implementation Semantics

`evaluateRealTransportReadiness(request)` evaluates whether real transport prerequisites can produce a modeled
transport readiness candidate:

- B1 target config readiness;
- B2 kill-switch lifecycle readiness;
- B3 durable idempotency readiness;
- B4 enqueue / outbox boundary readiness;
- B5 conflict / partial-write readiness;
- B6 sequence / export-id readiness;
- B8 approval acceptance.

When all prerequisites and safety boundaries are valid, the result returns:

- `realTransportReadinessEvaluated:true`;
- `allPrerequisitesSatisfied:true`;
- `transportReadyCandidate:true`;
- `transportReady:false`;
- `transportReadyFlipAuthorized:false`;
- `productSyncReady:false`;
- `realWebDAVTransportAvailable:false`;
- all write/enqueue/export/CAS/fullBundle.v3 side-effect flags false.

This is a modeled candidate only. It is not the global/source `transportReady` flip, not transport execution, not WebDAV
availability, not product readiness, and not cleanup authority.

## Required Inputs

The evaluator requires hash-only/model evidence for:

- B1: `b1TargetConfigReady:true`, `b1TargetConfigRefHash`, `endpointRefHash`, `remoteRootRefHash`,
  `credentialRefHash`, `peerIdentityBindingHash`, `localClientIdentityHash`;
- B2: `b2KillSwitchLifecycleReady:true`, `b2KillSwitchRefHash`;
- B3: `b3DurableIdempotencyReady:true`, `b3IdempotencyRefHash`;
- B4: `b4EnqueueOutboxBoundaryReady:true`, `b4OutboxBoundaryRefHash`;
- B5: `b5ConflictPartialWriteReady:true`, `b5ConflictPolicyRefHash`;
- B6: `b6SequenceExportReady:true`, `b6SequenceExportRefHash`;
- B8: `b8ApprovalAccepted:true`, `realTransportApprovalAccepted:true`, `b8ApprovalRefHash`;
- B7 review: `b7ReadinessPolicyRefHash`, `transportReadinessReviewRefHash`;
- local/exportable eligibility: `localExportableSyncReady:true`,
  `transportEligibilityFromLocalExportableReady:true`;
- global flags visible and false: `productSyncReady:false`, `transportReady:false`;
- payload boundary: matching `candidatePayloadHash`, `candidateBundleHash`, `fullBundleV2EnvelopeHash`,
  `payloadSchema:"h2o.studio.fullBundle.v2"`;
- `fullBundle.v3` deferred: `fullBundleV3Deferred:true` or `noFullBundleV3:true`;
- Chat Saving CAS boundary: `chatSavingCasSeparate:true`, `noChatSavingCAS:true`, `chatSavingCasBlocked:true`;
- a950 quarantine: `a950DocumentedDebtQuarantined:true`, `a950LeaksIntoExportablePayload:false`,
  `noA950Mutation:true`.

`localExportableSyncReady:true` and `transportEligibilityFromLocalExportableReady:true` are eligibility signals only.
They are not transport authorization and are not `transportReady:true`.

## Blocked Failure Modes

- missing B1 evidence -> `real-transport-b7-b1-evidence-missing`;
- missing B2 evidence -> `real-transport-b7-b2-evidence-missing`;
- missing B3 evidence -> `real-transport-b7-b3-evidence-missing`;
- missing B4 evidence -> `real-transport-b7-b4-evidence-missing`;
- missing B5 evidence -> `real-transport-b7-b5-evidence-missing`;
- missing B6 evidence -> `real-transport-b7-b6-evidence-missing`;
- missing B8 approval acceptance -> `real-transport-b7-b8-approval-acceptance-missing`;
- missing B7 policy/review reference -> `real-transport-b7-readiness-policy-review-ref-missing`;
- local mock approval or local mock target -> `real-transport-b7-local-mock-not-accepted`;
- non-real target -> `real-transport-b7-real-target-required`;
- `productSyncReady:true` or missing `productSyncReady:false` ->
  `real-transport-b7-product-sync-ready-must-remain-false`;
- caller-supplied `transportReady:true` or missing `transportReady:false` ->
  `real-transport-b7-caller-transport-ready-true-blocked`;
- missing `localExportableSyncReady:true` -> `real-transport-b7-local-exportable-not-ready`;
- missing `transportEligibilityFromLocalExportableReady:true` ->
  `real-transport-b7-transport-eligibility-missing`;
- invalid `fullBundle.v2` envelope -> `real-transport-b7-fullbundle-v2-envelope-invalid`;
- fullBundle.v3 request -> `real-transport-b7-fullbundle-v3-request-blocked`;
- Chat Saving CAS write/request -> `real-transport-b7-chat-saving-cas-boundary-violation`;
- a950 cleanup/leakage request -> `real-transport-b7-a950-cleanup-or-leakage-blocked`;
- raw endpoint / credential / path / payload body input -> `real-transport-b7-raw-input-rejected`;
- CAS key input -> `real-transport-b7-cas-key-input-rejected`;
- write, enqueue, export-state mutation, export-id mint, or sequence-burn request ->
  `real-transport-b7-write-or-mutation-request-blocked`;
- transportReady flip/global mutation request -> `real-transport-b7-transport-ready-flip-request-blocked`.

## Non-Activation Invariants

The result always hardcodes:

- `transportReady:false`;
- `transportReadyFlipAuthorized:false`;
- `productSyncReady:false`;
- `realWebDAVTransportAvailable:false`;
- `realTransportWriteAuthorized:false`;
- `realTransportExecuted:false`;
- `writesWebDAV:false`;
- `writesCloud:false`;
- `writesRelay:false`;
- `enqueuesRelay:false`;
- `writesCAS:false`;
- `writesFiles:false`;
- `mutatesExportState:false`;
- `mintsExportId:false`;
- `burnsSequence:false`;
- `fullBundleV3Started:false`;
- `chatSavingCasBlocked:true`;
- `noCleanupAuthority:true`;
- `noA950Mutation:true`.

`transportReadyCandidate:true` may appear only when all B1-B6+B8 prerequisites and boundaries are valid. It remains a
modeled readiness candidate and cannot make authoritative `transportReady` true.

## Privacy / Redaction

All references are hash-only. Raw endpoint, credential, remote path, payload body, CAS key, and package body input are
blocked and not echoed. The result reports:

- `privacy.redacted:true`;
- `privacy.hashOnly:true`;
- `rawEndpointLogged:false`;
- `rawCredentialLogged:false`;
- `rawRemotePathLogged:false`;
- `rawPayloadBodyLogged:false`.

## Boundaries Held

- B7 readiness evaluation returns `transportReadyCandidate`, not a source/global `transportReady` flip.
- B7 readiness evaluation does not execute real transport.
- No real cleanup/mutation/WebDAV/cloud/relay/CAS/file write occurred.
- No relay enqueue occurred.
- No export-state mutation occurred.
- No export id was minted.
- No sequence was burned.
- No fullBundle v3 start/mint occurred.
- `productSyncReady:false` remains.
- `transportReady:false` remains authoritative.
- Chat Saving CAS remains blocked/deferred.
- `row:a950a44b859f` remains documented/quarantined debt with no cleanup authority.

## Recommended Next Lane

With B7 implemented as a non-writing transportReady candidate evaluator, the next lane should be a consolidated B1-B8
implementation rollup / real-transport dry-run design. A real write still requires a separate dry-run and explicit
first-write approval; this B7 substrate authorizes no transport.
