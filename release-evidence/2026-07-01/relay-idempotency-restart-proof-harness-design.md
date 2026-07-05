# Relay Idempotency / Restart Proof Harness Design

Verdict: RELAY IDEMPOTENCY RESTART PROOF HARNESS DESIGNED - NON-WRITING.

This is a design/evidence-only slice. It does not write to WebDAV/cloud/relay, does not enqueue relay, does not implement real transport, does not mint or start `fullBundle.v3`, does not touch Chat Saving CAS, does not flip `productSyncReady`, does not set `transportReady:true`, does not clean or mutate `row:a950a44b859f`, and does not weaken strict tombstone cleanup rules.

## Anchors Respected

- WebDAV transport-readiness dry-run live closeout: `7dd54b42b5df25d76fd4a308fe1f4c7a1a694ba2`.
- WebDAV live contract fix: `d28cf0b8beb857c65ec1251030087c5229241477`.
- WebDAV dry-run API implementation: `f776e66d595de7ac80746fcd7e337d5452c2e26e`.
- WebDAV dry-run contract design: `2b12b53223297fe9588ffe29750948055305f8bc`.
- Transport source inventory / no-write audit: `35607afcaca0263c2105e98e13b5d20ea08e37e9`.
- Transport readiness evaluation gate design: `c6d5eafe1b164570230088380377650467c028e1`.

The dry-run closeout proved:

- `ok:true`.
- `status:"webdav-transport-dry-run-ready"`.
- `gateSatisfied:true`.
- `blockers:[]`.
- `warnings:[]`.
- candidate payload / bundle hash was hash-only.
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
- `localExportableSyncReady:true`.
- `transportEligibilityFromLocalExportableReady:true`.

## Source Surfaces Inspected

Relay broker / outbox staging:

- `src-surfaces-base/studio/sync/execute/execute-relay-broker.tauri.js`
- `dispatchExecuteRelay(...)`
- `confirmExecuteRelay(...)`
- `requiresRelay`
- `relayOutboxTouched`
- `enqueueRelayEnvelope`
- `duplicate-dedupe-key`
- `duplicate-execute-journal-row`
- `relay-outbox-unavailable`
- `relay-outbox-enqueue-failed`

Boot resume:

- `src-surfaces-base/studio/sync/execute/execute-resume-on-boot.tauri.js`
- `classifyExecuteResumeAction(...)`
- `invokeResumeAction(...)`
- `dispatch-relay`
- `relay-dispatching`
- `relay-dispatch-not-safe-to-resume`
- `resumeSafe`

Read-only relay summary / projection:

- `src-surfaces-base/studio/sync/execute/execute-lane-ui.tauri.js`
- `summarizeRelay(...)`
- no dispatch, Native invoke, F5 close/decision, relay enqueue, or settlement from UI.

Publication ledger:

- `src-surfaces-base/studio/sync/execute/execute-publication-lifecycle.tauri.js`
- publication ledger only; no relay enqueue/dispatch.

Remote observation:

- `src-surfaces-base/studio/sync/remote-envelope-projector.tauri.js`
- projection only; no WebDAV changes, storage mutation, polling, network, automatic merge, or mobile write-back.

## Current Guarded Write-Capable Findings

`dispatchExecuteRelay(...)` is write-capable because it may stage a local relay outbox row when the execute envelope requires relay and preflight passes. It is not WebDAV/cloud upload by itself, but it is still a write-capable relay staging path and must remain unreachable from WebDAV transport-readiness dry-run.

`confirmExecuteRelay(...)` requires uploaded/published outbox evidence before publication lifecycle confirmation. The proof harness must keep confirmation out of dry-run and must model missing uploaded evidence as blocked.

`execute-resume-on-boot.tauri.js` can classify an interrupted dispatching relay row as `dispatch-relay` when `resumeSafe` is not false. Future transport work must add proof that boot resume cannot turn a queued dry-run state into a live relay enqueue or WebDAV write. Any resume of a real relay row must require a separate explicit controlled transport gate and must remain blocked from `localExportableSyncReady` alone.

`execute-lane-ui.tauri.js`, publication lifecycle, and remote envelope projection are read-only/ledger/projection surfaces for this lane and must remain non-transport authorization.

## Required Idempotency Model

Future WebDAV/cloud/relay transport must derive a transport idempotency key from hash-only material:

- candidate payload hash,
- candidate bundle hash,
- dry-run request schema,
- peer/mock target hash or token,
- remote root hash or token,
- sequence/export constraints,
- operation kind,
- active transport kind,
- reserved controlled gate identifier.

Raw endpoint URLs, credentials, raw chat IDs, raw folder IDs, titles, names, content, paths, or account metadata must not be part of the idempotency evidence.

The harness must prove:

- same candidate payload hash + same peer/mock target + same sequence/export constraints => same idempotency key.
- same key duplicate replay is zero-write.
- duplicate replay does not enqueue relay.
- duplicate replay does not write WebDAV/cloud.
- duplicate replay does not write CAS.
- duplicate replay does not mint export id.
- duplicate replay does not burn sequence.
- duplicate replay does not start `fullBundle.v3`.

## Required Duplicate Replay Behavior

For the same hash-only candidate:

- first modeled dry-run: `relayEnqueueModeled:false`, `writesWebDAV:false`, `writesRelay:false`.
- duplicate modeled dry-run: same idempotency key, `duplicateModeled:true`, `duplicateWrites:0`, `duplicateRelayEnqueue:false`, `duplicateWebdavWrite:false`.
- no publication/outbox/relay state changes in either dry-run.
- no live outbox row is created by the harness.

For a changed candidate payload hash, peer/mock target, or sequence/export constraint:

- produce a different modeled idempotency key.
- require a fresh dry-run.
- do not reuse stale readiness.

## Required Restart Behavior

The proof harness must model restart and boot resume as fail-closed:

- queued dry-run state cannot become a live write after reload.
- dry-run records are not relay outbox rows.
- boot resume must not dispatch relay from `localExportableSyncReady:true`.
- boot resume must not dispatch relay from `transportEligibilityFromLocalExportableReady:true`.
- boot resume must not dispatch relay from `transportReadinessEvaluationAllowed:true`.
- boot resume must stay blocked unless a future explicit controlled transport gate exists.
- `execute-resume-on-boot.tauri.js` relay classification must require real relay journal evidence and safe resume evidence, not dry-run eligibility.
- restart proof must report `restartModeledFailClosed:true`.

## Required Failure Behavior

The future harness must model these failure modes and prove zero writes:

- network failure -> no retry write, no sequence burn, no export id mint, no CAS write.
- partial write -> blocked/failed-closed, no publication confirmation without uploaded evidence.
- checksum mismatch -> blocked before relay enqueue.
- sequence mismatch -> blocked before relay enqueue.
- peer ambiguity -> blocked before relay enqueue.
- stale payload -> blocked before relay enqueue.
- CAS boundary violation -> blocked before relay enqueue.
- missing controlled gate -> blocked before relay enqueue.
- `productSyncReady:true` mismatch -> blocked.
- `transportReady:true` mismatch -> blocked.
- `localExportableSyncReady:false` -> blocked.

## Required Proof Outputs

Future relay/idempotency/restart proof harness result must include:

- `schema:"h2o.studio.transport.relay-idempotency-restart-proof.v1"`.
- `designOnly:false` only when the harness is implemented; this slice remains design-only.
- `dryRunOnly:true`.
- `writesWebDAV:false`.
- `writesCloud:false`.
- `writesRelay:false`.
- `writesCAS:false`.
- `writesFiles:false`.
- `enqueuesRelay:false`.
- `relayOutboxTouched:false`.
- `publicationLedgerTouched:false`.
- `mutatesExportState:false`.
- `mintsExportId:false`.
- `burnsSequence:false`.
- `fullBundleV3Started:false`.
- `productSyncReady:false`.
- `transportReady:false`.
- `localExportableSyncReadyIsAuthorization:false`.
- `idempotencyModeled:true`.
- `duplicateReplayZeroWrite:true`.
- `restartModeledFailClosed:true`.
- `bootResumeBlockedWithoutControlledGate:true`.
- `webdavCloudRelayBlocked:true`.
- `chatSavingCasBlocked:true`.
- `a950DocumentedDebtQuarantined:true`.
- `noCleanupAuthority:true`.
- hash-only candidate and idempotency key material.

## Future Implementation Order

1. Implement relay/idempotency/restart proof harness, still no writes and no relay enqueue.
2. Run live read-only / dry-run proof of the harness.
3. Add `fullBundle.v3` preflight if a v3 envelope is required.
4. Add rollback / disable / fail-closed proof.
5. Only after explicit approval, design a controlled transport implementation behind a separate write gate.

## Final Decision

WebDAV/cloud/relay cannot start now.

No relay enqueue is authorized now.

`fullBundle.v3` remains not-started.

Chat Saving CAS remains blocked/deferred.

`productSyncReady:false` remains authoritative.

`transportReady:false` remains authoritative.

`localExportableSyncReady:true` is not relay or transport authorization.

a950 remains documented/quarantined debt and no cleanup authority is introduced.
