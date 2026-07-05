# Controlled WebDAV / Cloud / Relay Transport Implementation Design

Verdict: **CONTROLLED WEBDAV / CLOUD / RELAY TRANSPORT IMPLEMENTATION DESIGN COMPLETE - DESIGN ONLY; REAL TRANSPORT STILL BLOCKED**.

This is an evidence/validator-only design slice. It does not implement real transport, does not write to WebDAV/cloud/relay/CAS/files, does not enqueue relay, does not make `webdav-cloud-relay-transport-controlled-apply` usable, does not mint or start `fullBundle.v3`, does not mutate the `fullBundle.v2` payload, does not mutate export state, does not mint an export id, does not burn sequence, does not flip `productSyncReady`, does not set `transportReady:true`, does not clean or mutate `row:a950a44b859f`, and does not weaken strict tombstone cleanup rules.

## Anchors Respected

- Controlled-write kill switch implementation: `edb306774a011f5af5fa4141ce9d85972b16283a`.
- Final transport-readiness rollup: `40f52a5f8554861a09d8cf69cc77b0c6c7740495`.
- Transport privacy/evidence contract closeout: `c3f1d8f70cb0b688268fcc814aece1e68ccb8994`.
- Rollback / disable / fail-closed proof: `b6dc031157ad7689620aed288869151bd23392c8`.
- fullBundle.v2 transport-envelope preflight live closeout: `735e9b002f8fac14e57ae0523f2dadd9a2bbe22a`.
- Relay queue / idempotency / restart proof live closeout: `f8cfcff9eb18437134df4470c033f37d3cecc2fd`.
- WebDAV transport-readiness dry-run live closeout: `7dd54b42b5df25d76fd4a308fe1f4c7a1a694ba2`.

## Current Safety Baseline

- `killSwitchExists:true`.
- `killSwitchDefaultEnabled:false`.
- `killSwitchEnabled:false`.
- `controlledWritesBlocked:true`.
- `transportControlledApplyGateUsable:false`.
- `reservedControlledGateUsable:false`.
- `controlledTransportImplementationPresent:false`.
- `productSyncReady:false`.
- `transportReady:false`.
- `webdavCloudRelayBlocked:true`.
- `chatSavingCasBlocked:true`.
- `a950DocumentedDebtQuarantined:true`.
- `noCleanupAuthority:true`.

The reserved controlled gate remains:

`webdav-cloud-relay-transport-controlled-apply`

That gate remains reserved and unusable in this design slice.

## Required Preconditions Before Any Future Controlled Apply

Any future controlled WebDAV/cloud/relay apply must require all of the following:

1. `killSwitchExists:true`.
2. Kill switch explicitly enabled through a reviewed/gated path.
3. Exact controlled gate: `webdav-cloud-relay-transport-controlled-apply`.
4. explicit operator approval object.
5. Fixed hash-only idempotency key.
6. Fixed candidate payload hash.
7. Fixed candidate bundle/projection hash.
8. Fixed peer target hash.
9. Fixed remote-root hash/ref.
10. WebDAV dry-run proof passed.
11. Relay/idempotency/restart proof passed.
12. fullBundle.v2 transport-envelope proof passed.
13. Rollback / disable / fail-closed proof passed.
14. Privacy/evidence contract passed.
15. `productSyncReady:false` remains visible.
16. `transportReady:false` remains visible until a separate post-apply readiness decision.

Controlled apply must be impossible if any of those preconditions are absent or mismatched.

## First Controlled-Transport Strategy

Selected strategy: **local mock WebDAV target first; no real remote WebDAV/cloud/relay endpoint in the first controlled implementation**.

Rationale:

- The first implementation should prove the controlled-write path against a local mock target so checksum, sequence, idempotency, rollback, duplicate replay, and restart behavior can be tested without exposing remote user data.
- A dev-only local WebDAV endpoint can be considered after the local mock target proof passes.
- Real WebDAV/cloud/relay must remain blocked until a later explicit approval and a separate live apply lane.

The first controlled implementation must still support:

- dry-run mode;
- apply mode only behind kill switch + exact gate + explicit operator approval;
- duplicate replay zero-write;
- restart fail-closed;
- rollback/disable before write;
- privacy/hash-only evidence;
- no Chat Saving CAS writes;
- no `fullBundle.v3` mint/start.

## Required Operator Approval Shape

A future controlled apply approval must be explicit and hash-only. At minimum it must include:

- `schema:"h2o.studio.transport.webdav-cloud-relay-controlled-apply-approval.v1"`;
- `approved:true`;
- `reviewedTransportApplyApproved:true`;
- `scope:"local-mock-webdav-target-only"` for the first implementation;
- `controlledGate:"webdav-cloud-relay-transport-controlled-apply"`;
- `killSwitchEnabled:true`;
- `idempotencyKeyHash:"sha256:<64-hex>"`;
- `candidatePayloadHash:"sha256:<64-hex>"`;
- `candidateBundleHash:"sha256:<64-hex>"`;
- `peerTargetHash:"sha256:<64-hex>"`;
- `remoteRootRefHash:"sha256:<64-hex>"`;
- `productSyncReady:false`;
- `transportReady:false`;
- `noChatSavingCas:true`;
- `noFullBundleV3:true`;
- `noA950Mutation:true`;
- `privacyHashOnly:true`.

The approval object must not contain raw peer URLs, remote paths, credentials, chat IDs, folder IDs, names, titles, CAS keys, or package bodies.

## Required Apply Model

The future controlled apply model must preserve these invariants:

- dry-run remains zero-write;
- apply without enabled kill switch blocks;
- apply without exact controlled gate blocks;
- apply without explicit operator approval blocks;
- duplicate apply with the same idempotency key is zero-write;
- restart/reload cannot auto-resume a write without the enabled kill switch, exact gate, and approval;
- boot resume remains blocked without a controlled gate;
- stale payload, checksum mismatch, sequence mismatch, peer ambiguity, CAS boundary violation, and kill-switch-disable mid-flight all fail closed before enqueue/write.

## Risk Register

The future implementation must explicitly guard these risks:

- partial remote write;
- relay enqueue without remote write;
- remote write without relay ledger;
- sequence burn without write;
- export id minted but not delivered;
- export-state mutation before durable write proof;
- CAS boundary violation;
- stale payload;
- payload hash mismatch;
- bundle/projection hash mismatch;
- peer target ambiguity;
- remote-root ambiguity;
- kill switch disabled mid-flight;
- duplicate replay producing a second write;
- restart/resume dispatching without approval;
- raw private evidence leakage.

## Future Implementation Sequence

1. Controlled transport implementation design closeout. This file completes that design closeout.
2. Controlled transport implementation behind disabled kill switch.
   - Keep `transportControlledApplyGateUsable:false` until source implements the controlled path and a separate validator proves the gate is safe.
   - Keep default kill switch disabled.
   - Keep real WebDAV/cloud/relay blocked.
3. Live dry-run with kill switch enabled but `apply:false`.
   - Must prove kill-switch enabled state does not write.
   - Must prove the approval object is hash-only.
4. First controlled local mock WebDAV apply only after explicit approval.
   - Scope must be `local-mock-webdav-target-only`.
   - Must not touch Chat Saving CAS.
   - Must not start `fullBundle.v3`.
5. Duplicate replay proof.
   - Same idempotency key and same payload/target/sequence constraints must be zero-write.
6. Restart/reload proof.
   - No boot resume dispatch without controlled gate and approval.
7. Final transportReady decision.
   - `transportReady:true` can only be considered after the controlled local mock proof, duplicate proof, restart proof, rollback proof, privacy proof, and an explicit readiness review.

## Explicit Non-Authorization

This design does not authorize real transport.

This design does not authorize WebDAV/cloud/relay writes.

This design does not authorize relay enqueue.

This design does not authorize Chat Saving CAS.

This design does not authorize `fullBundle.v3`.

This design does not authorize export-state mutation.

This design does not authorize export id mint.

This design does not authorize sequence burn.

This design does not authorize cleanup or `row:a950a44b859f` mutation.

`productSyncReady:false` remains authoritative.

`transportReady:false` remains authoritative.

Real WebDAV/cloud/relay cannot start now.
