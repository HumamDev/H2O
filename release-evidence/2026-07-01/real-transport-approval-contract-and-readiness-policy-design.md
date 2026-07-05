# Real-Transport Approval Contract (B8) + transportReady Policy (B7) - Design

Verdict: **B8 REAL-TRANSPORT APPROVAL CONTRACT AND B7 `transportReady` POLICY ARE DESIGNED (DESIGN / SPECIFICATION
ONLY) - NOTHING IS IMPLEMENTED OR MINTED IN SOURCE, NO REAL-TRANSPORT APPROVAL IS ACCEPTED, `transportReady` STAYS
`false`, AND `productSyncReady` STAYS `false`. B1-B6 REMAIN OPEN BLOCKERS. THIS DESIGN AUTHORIZES NO REAL WRITE, NO
FLIP, AND NO CLEANUP**.

This is a design/specification evidence + validator slice only. It does not implement real WebDAV/cloud/relay
transport, does not write to real WebDAV/cloud/relay/CAS/files, does not enqueue relay, does not mint or start
`fullBundle.v3`, does not mutate export state, does not mint an export id, does not burn sequence, does not flip
`productSyncReady`, does not set `transportReady:true`, and does not clean or mutate `row:a950a44b859f`. No schema is
minted in source; no approval is accepted.

## Anchors Respected

- Real WebDAV/cloud/relay transport readiness gap review (B1-B8): `d2bea4c0`.
- Controlled local mock WebDAV transport final rollup: `15a33852`.
- Final transport-readiness rollup (transport not started): `40f52a5f`.
- Controlled-write kill switch: `edb30677`.

## Scope

This slice designs the first two gap-review blockers, B8 and B7. It does NOT design or close B1-B6, which remain open.
It is a prerequisite specification: a real-transport implementation may only be attempted once B8 + B7 are approved AND
B1-B6 are separately designed, reviewed, and closed.

## B8 - Real-Transport Approval Contract (design)

The real-transport approval is a NEW, explicit, reviewed operator approval that is distinct from the local mock
approval. Proposed design-only schema name (not minted in source here):

- approval schema: `h2o.studio.transport.real-webdav-cloud-relay-transport-apply-approval.v1`.

### Required operator approval fields

- `schema` = the real-transport approval schema (above);
- `approved: true`;
- `operatorIdHash` and `reviewIdHash` (redacted, hash-only);
- `approvedAtIso`.

### Required reviewed / explicit real-transport approval flags

- `reviewedRealTransportApplyApproved: true`;
- `realWebDAVCloudRelayApproved: true`;
- `scope: 'real-webdav-cloud-relay-target'` (NOT `local-mock-webdav-target-only`).

### Required target identity fields

- `targetMode` in `real-webdav` / `cloud` / `relay` (NOT `local-mock-webdav`);
- `peerIdentityBindingHash` (a verified peer identity binding, redacted);
- `remoteRootRefHash` (redacted);
- `endpointRefHash` (redacted reference; NEVER a raw endpoint).

### Required credential / remote-root redaction fields

- `credentialRefHash` (redacted reference; NEVER a raw credential);
- `rawEndpointLogged: false`;
- `rawCredentialLogged: false`;
- `privacyHashOnly: true`.

### Required payload hash fields

- `candidatePayloadHash` and `candidateBundleHash` (must be equal);
- `payloadSchema: 'h2o.studio.fullBundle.v2'` (fullBundle.v2 envelope only).

### Required durable idempotency reference

- `durableIdempotencyKeyHash`;
- `durableIdempotencyStoreRef` - a reference to the B3 durable idempotency store, which must be closed first.

### Required sequence / export-id policy reference

- `sequenceExportIdPolicyRef` - a reference to the B6 sequence/export-id semantics, which must be closed first.

### Required kill-switch state

- `killSwitchEnabled: true` (the real controlled-write kill switch, enabled through the B2 lifecycle);
- `killSwitchLifecycleRef` - a reference to the B2 real kill-switch lifecycle, which must be closed first.

### Required conflict / partial-write policy reference

- `conflictPartialWritePolicyRef` - a reference to the B5 conflict/partial-write handling, which must be closed first.

### Required CAS boundary acknowledgment

- `chatSavingCasSeparateAcknowledged: true` and `touchChatSavingCas: false` - the approval explicitly acknowledges that
  real WebDAV/cloud sync must NOT touch the Chat Saving archive CAS.

### Required no-a950 / no-cleanup / no-fullBundle.v3 flags

- `noA950Mutation: true`;
- `noCleanupAuthority: true`;
- `noFullBundleV3: true`.

### Failure modes for missing / invalid approval

- missing approval -> blocked `real-transport-approval-required`;
- wrong / absent schema -> `real-transport-approval-schema-mismatch`;
- a local mock approval or `local-mock-webdav-target-only` scope -> `real-transport-approval-local-mock-not-accepted`;
- any B1-B6 prerequisite reference not closed -> `real-transport-prerequisite-blocker-open`;
- missing target identity / peer binding -> `real-transport-target-identity-missing`;
- missing credential/endpoint redaction (or any raw endpoint/credential) -> `real-transport-credential-redaction-missing`;
- kill switch not enabled -> `real-transport-kill-switch-disabled`;
- a950 mutation / cleanup / `fullBundle.v3` requested -> `real-transport-forbidden-authority-requested`.

### Explicit rule: local mock approval does not count

The local mock apply approval (`controlledLocalMockApplyApproved`, scope `local-mock-webdav-target-only`,
`realTransportApprovalAccepted:false`) does NOT satisfy the real-transport approval contract. `realTransportApprovalAccepted`
remains `false` unless a real-transport approval passes ALL of the above checks. Local mock approval is never real
transport approval.

## B7 - Real `transportReady` Policy (design)

Proposed design-only policy schema name (not minted in source here):

- policy schema: `h2o.studio.transport.real-transportready-policy.v1`.

### Policy rules

- `transportReady:false` REMAINS until B1-B6 are closed (and the B8 approval contract exists and passes).
- `localExportableSyncReady:true` is NOT `transportReady` - it is an eligibility signal, not authorization.
- `transportEligibilityFromLocalExportableReady:true` is NOT `transportReady`.
- `productSyncReady:false` REMAINS visible and authoritative; it is governed by its own flip gate and is not changed by
  the transport lane.
- Real `transportReady` may only be EVALUATED (never auto-flipped) after ALL of the following are closed:
  - B1 target config / credentials / peer identity;
  - B2 real kill-switch lifecycle;
  - B3 durable idempotency store;
  - B4 real enqueue / outbox boundary;
  - B5 conflict / partial-write handling;
  - B6 sequence / export-id semantics;
  - B8 real approval contract;
  - and the privacy / CAS-separate / `fullBundle.v2`-only (`fullBundle.v3`-deferred) boundaries are preserved.
- Even when every prerequisite is closed, `transportReady:true` requires a SEPARATE explicit reviewed readiness
  decision + a dedicated flip slice. It is never automatic and never inherited from local mock proofs.
- `transportReady:true` must NEVER imply Chat Saving CAS readiness - Chat Saving CAS stays separate and blocked/deferred.
- `transportReady:true` must NOT clean or mutate `row:a950a44b859f` - a950 stays documented/quarantined debt.

## Remaining Blockers (B1-B6 still open)

- **B1** real-target-config-missing.
- **B2** kill-switch-real-lifecycle-missing.
- **B3** durable-idempotency-store-missing.
- **B4** real-enqueue-boundary-undesigned.
- **B5** real-conflict-partial-write-handling-missing.
- **B6** real-sequence-export-id-semantics-undesigned.

B8 (this design) and B7 (this design) are now specified as design-only; they are not implemented, minted, or approved.

## Recommended Next Lane After This

**B1 - real target config + credentials + peer identity (design-only, no raw endpoint/credential logging).** Then B2
(real kill-switch lifecycle), then B3 + B4 (durable idempotency + real enqueue/outbox + retry/resume), then B5 + B6
(conflict/partial-write + sequence/export-id + rollback). Only after B1-B6 are closed AND a real-transport approval per
this B8 contract is accepted AND the B7 readiness decision is made in a dedicated flip slice may a controlled real write
be attempted - dry-run first, `fullBundle.v2` only, CAS-separate, kill-switch + gate + approval gated, fail-closed on
restart.

## Can Real Transport Start Now?

**No.** B8 + B7 are design-only specifications; B1-B6 remain open; no real-transport approval is accepted;
`transportReady` and `productSyncReady` stay `false`. This design authorizes nothing.

## Boundaries Held

- No real transport implemented; no schema minted in source; no approval accepted.
- No real WebDAV/cloud/relay/CAS/file write; no relay enqueue.
- No `fullBundle.v3` start/mint; no export-state mutation; no export id minted; no sequence burned.
- `productSyncReady` not flipped - remains `false`; `transportReady` not set true; `realTransportApprovalAccepted`
  remains `false`.
- `row:a950a44b859f` not cleaned or mutated; no cleanup authority introduced; no real transport write authorization
  introduced.
- Chat Saving CAS untouched (blocked/deferred); local mock approval is not real transport approval.
- No product source edited; no unrelated Studio-lane files touched.

## Final State

The B8 real-transport approval contract and the B7 `transportReady` policy are designed (design-only). Real
WebDAV/cloud/relay transport remains blocked and cannot start now: B1-B6 remain open, no real-transport approval is
accepted, `transportReady:false` and `productSyncReady:false` remain authoritative, `fullBundle.v3` stays deferred, and
Chat Saving CAS stays blocked/deferred.
