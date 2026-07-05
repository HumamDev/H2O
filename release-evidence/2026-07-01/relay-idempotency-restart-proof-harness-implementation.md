# Relay Idempotency / Restart Proof Harness Implementation

Verdict: RELAY IDEMPOTENCY RESTART PROOF HARNESS IMPLEMENTED - NON-WRITING.

This implementation adds a focused proof harness API only. It does not write to WebDAV/cloud/relay, does not enqueue relay, does not implement real transport, does not mint or start `fullBundle.v3`, does not touch Chat Saving CAS, does not flip `productSyncReady`, does not set `transportReady:true`, does not clean or mutate `row:a950a44b859f`, and does not weaken strict tombstone cleanup rules.

## Anchors Respected

- Relay queue / idempotency / restart proof harness design: `5a728d1d2d8e19ce67f6f51ae50bf5102bb8c46d`.
- WebDAV transport-readiness dry-run live closeout: `7dd54b42b5df25d76fd4a308fe1f4c7a1a694ba2`.
- WebDAV live contract fix: `d28cf0b8beb857c65ec1251030087c5229241477`.
- WebDAV dry-run API implementation: `f776e66d595de7ac80746fcd7e337d5452c2e26e`.
- Transport source inventory / no-write audit: `35607afcaca0263c2105e98e13b5d20ea08e37e9`.

The WebDAV dry-run remains the latest live transport-readiness proof and already proved:

- `ok:true`.
- `status:"webdav-transport-dry-run-ready"`.
- `writesWebDAV:false`.
- `writesCloud:false`.
- `writesRelay:false`.
- `writesCAS:false`.
- `writesFiles:false`.
- `mutatesExportState:false`.
- `mintsExportId:false`.
- `burnsSequence:false`.
- `enqueuesRelay:false`.
- `fullBundleV3Started:false`.
- `productSyncReady:false`.
- `transportReady:false`.

## Source/API Added

Source module:

- `src-surfaces-base/studio/sync/relay-idempotency-restart-proof-harness.js`

Runtime namespace:

- `H2O.Studio.sync.relayIdempotencyRestartProofHarness.evaluateRelayIdempotencyRestartProof(request)`

Loader/package wiring:

- `src-surfaces-base/studio/studio.html`
- `tools/product/studio/pack-studio.mjs`

Result schema:

- `h2o.studio.transport.relay-idempotency-restart-proof.v1`

Request schema:

- `h2o.studio.transport.relay-idempotency-restart-proof-request.v1`

Proof gate:

- `relay-idempotency-restart-proof-harness-evaluate`

Reserved future controlled transport gate:

- `webdav-cloud-relay-transport-controlled-apply`

## Valid Proof Contract

A valid proof request is dry-run only:

- `dryRun:true`.
- `apply:false`.
- `gate:"relay-idempotency-restart-proof-harness-evaluate"`.
- `productSyncReady:false`.
- `transportReady:false`.
- `localExportableSyncReady:true`.
- `transportEligibilityFromLocalExportableReady:true`.
- `chatSavingCasBlocked:true`.
- `a950DocumentedDebtQuarantined:true`.
- `noCleanupAuthority:true`.
- hash-only candidate payload hash.
- hash-only candidate bundle hash.
- hash-only peer/mock target hash.
- hash-only remote root/ref hash.
- sequence/export constraints that do not mint exports or burn sequence.
- reserved controlled gate recorded as `webdav-cloud-relay-transport-controlled-apply`.

The valid result returns:

- `ok:true`.
- `status:"relay-idempotency-restart-proof-ready"`.
- `relayProofHarness:true`.
- `writesRelay:false`.
- `enqueuesRelay:false`.
- `writesWebDAV:false`.
- `writesCloud:false`.
- `writesCAS:false`.
- `writesFiles:false`.
- `mutatesExportState:false`.
- `mintsExportId:false`.
- `burnsSequence:false`.
- `bootResumeDispatch:false`.
- `relayOutboxTouched:false`.
- `publicationLedgerTouched:false`.
- `fullBundleV3Started:false`.
- `productSyncReady:false`.
- `transportReady:false`.
- `webdavCloudRelayBlocked:true`.
- `chatSavingCasBlocked:true`.
- `a950DocumentedDebtQuarantined:true`.
- `noCleanupAuthority:true`.

## Idempotency Key Semantics

The harness derives a modeled idempotency key from hash-only/non-private material:

- candidate payload hash,
- candidate bundle hash,
- peer/mock target hash,
- remote root/ref hash,
- sequence mode,
- expected sequence number,
- previous sequence number,
- export constraint,
- operation kind,
- active transport,
- reserved controlled gate.

The harness records:

- `idempotencyModeled:true`.
- `idempotencyKeyHashOnly:true`.
- `localExportableSyncReadyIsAuthorization:false`.

Raw endpoint URLs, credentials, raw chat IDs, raw folder IDs, titles, names, content, paths, or account metadata are rejected with `relay-private-input-rejected`.

## Duplicate Replay Proof

For the same candidate payload hash, bundle hash, peer/mock target hash, remote root/ref hash, and sequence/export constraints:

- the modeled idempotency key is stable,
- `duplicateReplayZeroWrite:true`,
- `duplicateWrites:0`,
- `duplicateRelayEnqueue:false`,
- `duplicateWebdavWrite:false`,
- `duplicateCasWrite:false`,
- `duplicateExportStateMutation:false`,
- `duplicateFullBundleV3Start:false`.

For changed payload/target/sequence constraints, the modeled key changes and a fresh dry-run proof is required.

## Restart / Boot Resume Proof

The harness models restart and boot resume as fail-closed:

- `restartFailClosed:true`.
- `queuedDryRunStateCannotBecomeWriteState:true`.
- `dryRunRecordsAreNotRelayOutboxRows:true`.
- `localExportableSyncReadyAuthorizesRelayDispatch:false`.
- `transportEligibilityAuthorizesRelayDispatch:false`.
- `transportReadinessEvaluationAuthorizesRelayDispatch:false`.
- `bootResumeDispatch:false`.
- `bootResumeBlockedWithoutControlledGate:true`.
- `missingControlledGateBlocksWriteTransition:true`.

`localExportableSyncReady:true` remains a local exportable parity signal only. It is not relay authorization and cannot auto-dispatch relay.

## Failure Modes Modeled

The harness models these failure modes and reports that each blocks before enqueue/write:

- `network-failure` -> `relay-network-failure-blocked-before-enqueue`.
- `partial-write` -> `relay-partial-write-blocked-before-enqueue`.
- `checksum-mismatch` -> `relay-checksum-mismatch-blocked-before-enqueue`.
- `sequence-mismatch` -> `relay-sequence-mismatch-blocked-before-enqueue`.
- `peer-ambiguity` -> `relay-peer-ambiguity-blocked-before-enqueue`.
- `stale-payload` -> `relay-stale-payload-blocked-before-enqueue`.
- `cas-boundary-violation` -> `relay-cas-boundary-blocked-before-enqueue`.
- `missing-controlled-gate` -> `relay-controlled-gate-missing`.

All modeled failure rows carry:

- `writesRelay:false`.
- `enqueuesRelay:false`.
- `writesWebDAV:false`.
- `writesCloud:false`.
- `writesCAS:false`.
- `mutatesExportState:false`.

## Blocked Transitions

The harness blocks:

- wrong/missing proof gate,
- `dryRun:false`,
- `apply:true`,
- `productSyncReady` mismatch,
- `transportReady` mismatch,
- `localExportableSyncReady:false`,
- missing transport eligibility,
- missing hash-only candidate or target material,
- sequence mismatch/regression,
- missing reserved controlled gate,
- active transport mismatch,
- raw private input,
- relay enqueue request,
- WebDAV/cloud write request,
- CAS write request,
- `fullBundle.v3` start request,
- export-state mutation/export id mint/sequence burn request,
- cleanup/a950 mutation request,
- boot resume dispatch request,
- dry-run state write-transition request.

## Final State

WebDAV/cloud/relay cannot start now.

No relay enqueue is authorized now.

No real transport is implemented by this harness.

`fullBundle.v3` remains not-started.

Chat Saving CAS remains blocked/deferred.

`productSyncReady:false` remains authoritative.

`transportReady:false` remains authoritative.

`localExportableSyncReady:true` is not relay or transport authorization.

a950 remains documented/quarantined debt and no cleanup authority is introduced.

## Next Step

Run a live read-only / dry-run proof of `H2O.Studio.sync.relayIdempotencyRestartProofHarness.evaluateRelayIdempotencyRestartProof(request)`.
