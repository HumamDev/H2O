# Real-Transport B5 - Conflict / Partial-Write Handling - Implementation

Verdict: **B5 REAL CONFLICT / PARTIAL-WRITE HANDLING SUBSTRATE IMPLEMENTED AS A NON-WRITING, HASH-ONLY
EVALUATE/DIAGNOSE MODULE THAT MODELS CONFLICT, PARTIAL-WRITE, SAFE-RETRY, AND RECOVERY HANDOFF SEMANTICS WITHOUT
EXECUTING RECOVERY, RETRY, REMOTE WRITE, OUTBOX WRITE, OR PUBLICATION-LEDGER WRITE. REAL TRANSPORT REMAINS UNAVAILABLE,
REAL APPROVAL REMAINS FALSE, `productSyncReady:false` AND `transportReady:false` REMAIN AUTHORITATIVE, AND B6 SEQUENCE /
EXPORT-ID FINALIZATION REMAINS REQUIRED. THIS SLICE AUTHORIZES NO REAL WRITE, NO FLIP, AND NO CLEANUP**.

This implementation is non-writing and non-activating with respect to transport. It does not implement real conflict
recovery, does not dispatch retry, does not write to real WebDAV/cloud/relay/CAS/files, does not enqueue relay, does not
write an outbox row or publication ledger row, does not add real credentials, does not log raw endpoint/credential/path
or payload-body values, does not mint or start a fullBundle v3 payload, does not mutate export state, does not mint an
export id, does not burn sequence, does not flip `productSyncReady`, does not set `transportReady:true`, and does not
clean or mutate `row:a950a44b859f`.

## Anchors Respected

- B5 real conflict / partial-write handling design: `e60e00f0`.
- B4 real enqueue / outbox boundary implementation: `1117f976`.
- B4 real enqueue / outbox boundary design: `0b6ed75e`.
- B3 durable idempotency store implementation: `804b6d67`.
- B2 controlled-write kill-switch lifecycle implementation: `de4aa12d`.
- B1 target config + credentials + peer identity implementation: `93eb9065`.
- Real-transport B1-B8 implementation-readiness rollup: `36e46513`.

## Source Change

- New module: `src-surfaces-base/studio/sync/real-transport-conflict-recovery.js`.
- Exposed API: `H2O.Studio.sync.realTransportConflictRecovery.evaluateRealTransportConflictRecovery(request)`.
- Diagnostic API: `H2O.Studio.sync.realTransportConflictRecovery.diagnose()`.
- Result schema: `h2o.studio.transport.real-transport-b5-conflict-recovery-result.v1`.
- Request schema: `h2o.studio.transport.real-transport-b5-conflict-recovery-request.v1`.

The module follows the B1-B4 standalone pure-evaluator pattern. It is intentionally standalone and non-activating. It is
not wired into `studio.html`, `pack-studio.mjs`, or `webdav-transport-gates.js`. That means the implementation is
available for direct validator/VM evaluation but cannot activate real transport.

## Modeled Conflict Classes

The substrate models these conflict classes:

- `local-payload-stale`
- `remote-same-payload-hash`
- `remote-newer`
- `remote-untrusted`
- `checksum-mismatch-before-write`
- `checksum-mismatch-after-observed-write`
- `peer-target-mismatch`
- `credential-permission-failure`
- `network-timeout-uncertain-write`
- `partial-upload-interrupted-write`

## Modeled Partial-Write States

The substrate models these partial-write states:

- `no-remote-write-attempted`
- `remote-write-attempted-unconfirmed`
- `remote-write-observed-checksum-unverified`
- `remote-write-observed-checksum-verified`
- `ledger-pending`
- `completed`
- `explicit-recovery-required`

## B5 Implementation Semantics

`evaluateRealTransportConflictRecovery(request)` accepts hash-only references and returns a modeled B5 decision:

- `remote-same-payload-hash` resolves to `duplicate-replay-noop` with no remote write.
- `remote-newer` blocks local overwrite and requires reviewed conflict resolution.
- checksum mismatches enter `explicit-recovery-required` and block ledger progression.
- uncertain / partial write outcomes enter `explicit-recovery-required`.
- blind retry after uncertain or partial write is blocked.
- retry may be modeled as safe only before a remote side effect is possible (`no-remote-write-attempted`).
- a verified observed remote hash can model `ledger-pending`, but the module still does not write the ledger.
- B5 never decides sequence/export-id burn timing; it returns `b6SequenceExportFinalizationRequired:true` and
  `sequenceExportRollbackHandoffToB6:true`.

## Required Cross-Blocker Preconditions

The evaluator blocks unless the request includes hash-only/model evidence for:

- B3 idempotency state and idempotency key.
- B4 outbox state and outbox record hash.
- B1 target hashes (`endpointRefHash`, `remoteRootRefHash`, `peerIdentityBindingHash`, `credentialRefHash`).
- B2 kill switch still enabled and not stale.
- B8 approval still valid.
- B6 sequence/export constraints.
- fullBundle.v2 envelope hash matching the candidate payload and bundle hashes.

## Blocked Failure Modes

- missing B3 idempotency state -> `real-transport-b5-b3-idempotency-state-missing`;
- missing B4 outbox state -> `real-transport-b5-b4-outbox-state-missing`;
- missing B1 target hashes -> `real-transport-b5-b1-target-hashes-missing`;
- disabled/missing/stale B2 kill switch -> `real-transport-b5-b2-kill-switch-disabled-or-stale`;
- missing B8 approval -> `real-transport-b5-b8-approval-missing`;
- missing B6 sequence/export constraints -> `real-transport-b5-b6-sequence-constraints-missing`;
- checksum/envelope mismatch -> `real-transport-b5-checksum-mismatch-explicit-recovery-required`;
- remote-newer overwrite -> `real-transport-b5-remote-newer-overwrite-blocked`;
- remote-untrusted -> `real-transport-b5-remote-untrusted-review-required`;
- peer/target mismatch -> `real-transport-b5-peer-target-mismatch`;
- credential/permission failure -> `real-transport-b5-credential-permission-failure`;
- blind retry after uncertain write -> `real-transport-b5-blind-retry-after-uncertain-write-blocked`;
- ledger-pending without verified remote write -> `real-transport-b5-ledger-pending-without-verified-remote-write`;
- CAS boundary violation -> `real-transport-b5-cas-boundary-violation`;
- raw endpoint / credential / path / payload body input -> `real-transport-b5-raw-input-rejected`.

## Non-Activation Invariants

The result always hardcodes:

- `realWebDAVTransportAvailable:false`
- `realTransportApprovalAccepted:false`
- `realRecoveryExecuted:false`
- `retryDispatched:false`
- `remoteWriteAttempted:false`
- `remoteOverwriteAllowed:false`
- `outboxWriteAllowed:false`
- `publicationLedgerTouched:false`
- `relayOutboxTouched:false`
- `writesWebDAV:false`
- `writesCloud:false`
- `writesRelay:false`
- `enqueuesRelay:false`
- `writesCAS:false`
- `writesFiles:false`
- `mutatesExportState:false`
- `mintsExportId:false`
- `burnsSequence:false`
- `productSyncReady:false`
- `transportReady:false`
- `fullBundleV3Started:false`
- `chatSavingCasBlocked:true`
- `noCleanupAuthority:true`
- `noA950Mutation:true`

`ledgerWriteAllowed:true` may appear only as a modeled boundary decision when an observed remote hash is verified against
the expected candidate hash. It does not write a ledger row; the result still reports `publicationLedgerTouched:false`,
`writesFiles:false`, and `mutatesExportState:false`.

## Privacy / Redaction

All B5 inputs and outputs are hash-only. Raw endpoint URL, raw credential, raw remote path, CAS key, and raw payload body
input are rejected and not echoed. The result reports:

- `privacy.redacted:true`
- `privacy.hashOnly:true`
- `rawEndpointLogged:false`
- `rawCredentialLogged:false`
- `rawRemotePathLogged:false`
- `rawPayloadBodyStored:false`
- `casKeysExposed:false`

## Relationship to B4

B5 owns the meaning of `explicit-recovery-required`. B4 outbox completion must wait for B5 verified remote-write
semantics, and a ledger must never precede a verified remote write. This implementation models those relationships but
does not update the B4 outbox or publication ledger.

## Relationship to B6

B5 does not decide sequence/export-id burn timing. B6 remains required before sequence/export finalization, rollback, or
any final transport readiness. The evaluator returns `b6SequenceExportFinalizationRequired:true` and
`sequenceExportRollbackHandoffToB6:true`.

## Boundaries Held

- No recovery, retry, or remote write was executed.
- No outbox row or publication ledger row was created.
- No real cleanup/mutation/WebDAV/cloud/relay/CAS/file write occurred.
- No relay enqueue occurred.
- No fullBundle v3 start/mint occurred.
- No export-state mutation, export id mint, or sequence burn occurred.
- `productSyncReady:false` and `transportReady:false` remain.
- Chat Saving CAS remains blocked/deferred.
- `row:a950a44b859f` remains documented/quarantined debt with no cleanup authority.

## Recommended Next Lane

B6 real sequence / export-id semantics implementation remains required before any controlled real transport readiness
can advance. B5 is now implemented only as a non-writing conflict/recovery decision substrate.
