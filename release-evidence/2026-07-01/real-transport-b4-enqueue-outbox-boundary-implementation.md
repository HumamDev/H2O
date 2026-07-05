# Real-Transport B4 - Enqueue / Outbox Boundary - Implementation

Verdict: **B4 REAL ENQUEUE / OUTBOX / PUBLICATION-LEDGER BOUNDARY SUBSTRATE IMPLEMENTED AS A NON-WRITING, HASH-ONLY
EVALUATE/DIAGNOSE MODULE THAT MODELS THE BOUNDARY WITHOUT CREATING ANY OUTBOX ROW OR TOUCHING THE RELAY OUTBOX /
PUBLICATION LEDGER - IT WRITES NO KV/SQLITE/localStorage/FILESYSTEM, DOES NOT ENABLE REAL TRANSPORT, DOES NOT MAKE REAL
WEBDAV AVAILABLE, DOES NOT ACCEPT A REAL-TRANSPORT APPROVAL, DOES NOT FLIP `productSyncReady` OR `transportReady`, AND
STORES / LOGS NO RAW ENDPOINT / CREDENTIAL / PATH / PAYLOAD-BODY VALUE. B5-B6 IMPLEMENTATION REMAINS OPEN. THIS SLICE
AUTHORIZES NO REAL WRITE, NO FLIP, AND NO CLEANUP**.

This implementation is non-writing and non-activating with respect to transport, and creates NO outbox row and touches
NO publication ledger. It does not write KV/SQLite/localStorage/filesystem, does not write to real
WebDAV/cloud/relay/CAS/files, does not enqueue relay, does not add real credentials, does not log raw
endpoint/credential/path/payload values, does not mint or start a fullBundle v3 payload, does not mutate export state,
does not mint an export id, does not burn sequence, does not flip `productSyncReady`, does not set `transportReady:true`,
and does not clean or mutate `row:a950a44b859f`.

## Anchors Respected

- B4 real enqueue / outbox / publication-ledger boundary design: `0b6ed75e`.
- B3 durable idempotency store implementation: `804b6d67`.
- B2 real controlled-write kill-switch lifecycle implementation: `de4aa12d`.
- B1 real target config + credentials + peer identity implementation: `93eb9065`.
- Real-transport B1-B8 implementation-readiness rollup: `36e46513`.

## Source Change (focused, single new standalone module)

- New module: `src-surfaces-base/studio/sync/real-transport-enqueue-boundary.js`.
- Exposed API: `H2O.Studio.sync.realTransportEnqueueBoundary.evaluateRealTransportEnqueueBoundary(request)` (plus
  `diagnose()` and store/lifecycle constants).
- The module is a self-bootstrapping IIFE following the B1/B2/B3 substrate pattern. It is a PURE evaluator that MODELS
  the enqueue / outbox / publication-ledger boundary: it reads a request (including a MODELED B3 idempotency record) and
  returns a boundary verdict; it performs no I/O, creates no outbox row, and touches no ledger.

### No outbox row / ledger is created or touched

The module references the existing durable stores `h2o:sync:relay-outbox:v1` and `h2o:sync:publication-ledger:v1` as
STRING constants only; it creates no outbox row and writes no KV/SQLite/localStorage/filesystem. The result always
reports `realOutboxRowCreated:false`, `relayOutboxTouched:false`, `publicationLedgerTouched:false`,
`writesKv/writesSqlite/writesLocalStorage:false`.

### Wired or standalone: intentionally standalone (non-activating)

The module is present as product source but is intentionally NOT registered in the app loader (`studio.html` /
`tools/product/studio/pack-studio.mjs`) - matching B1/B2/B3. `studio.html` is currently modified by a concurrent Studio
lane and is not touched or staged by this slice. Wiring/activation is a later gated step. The B4 contract is proven by
re-executing the real module directly in a Node `vm` sandbox. The B1/B2/B3 modules and `webdav-transport-gates.js` are
unchanged.

## B4 Implementation Semantics

`evaluateRealTransportEnqueueBoundary(request)` validates a hash-only enqueue request across an `operation` selector
(`enqueue` / `ledger` / `restart-resume`) and returns a redacted boundary verdict:

- **Hash-only references only**: `candidatePayloadHash`, `candidateBundleHash`, `endpointRefHash`, `remoteRootRefHash`,
  `peerIdentityBindingHash`, `credentialRefHash`, `idempotencyKeyHash`, `b8ApprovalRefHash`, `killSwitchEnableTokenHash`,
  `sequenceExportConstraintRefHash` (each `sha256:<64hex>`). Credential handling is reference-only.
- **Enqueue preconditions** (`operation:'enqueue'`): B1 target hashes present; B2 kill switch valid (enabled,
  non-stale); B3 idempotency record present, valid, and NOT completed; B8 real approval accepted; B7 policy allows
  evaluation; B5/B6 policies marked available before write. A well-formed enqueue returns `realEnqueueAuthorized:true`
  (boundary-model readiness ONLY - never an actual enqueue/write and never an outbox row) with `resolvedState:'queued'`.
- **Outbox lifecycle states**: `queued`, `dispatching`, `remote-write-observed`, `ledger-pending`, `completed`,
  `failed`, `explicit-recovery-required`.
- **Ledger boundary** (`operation:'ledger'`): a ledger write is allowed ONLY after a verified remote write
  (`ledgerNeverPrecedesRemoteWrite:true`); otherwise it blocks. The ledger references the idempotency key + payload hash
  (`ledgerReferencesIdempotencyKeyAndPayload:true`) and remains hash-only (`ledgerHashOnly:true`).
- **Retry / resume** (`operation:'restart-resume'`): `bootResumeDispatch:false` always; a resume without the controlled
  gate or with a disabled kill switch blocks; a completed idempotency record resolves to `duplicate-replay-noop`
  (`zeroWrite:true`); a `remote-write-pending` record on restart resolves to `explicit-recovery-required`;
  `noBlindRetryAfterPartialWrite:true` and `autoRetryOnMismatch:false`.

### Valid evaluation result (enqueue)

- `ok:true`
- `status:"real-transport-b4-enqueue-queued"`
- `realEnqueueAuthorized:true`
- `realOutboxRowCreated:false`
- `relayOutboxTouched:false`
- `publicationLedgerTouched:false`
- `realWebDAVTransportAvailable:false`
- `realTransportApprovalAccepted:false`
- `productSyncReady:false`
- `transportReady:false`
- `bootResumeDispatch:false`
- `chatSavingCasBlocked:true`
- `fullBundleV3Started:false`
- `noCleanupAuthority:true`
- `blockers:[]`

### Non-activation invariants (hardcoded, not request-controllable)

The result always reports `realWebDAVTransportAvailable:false`, `realTransportApprovalAccepted:false`,
`realOutboxRowCreated:false`, `relayOutboxTouched:false`, `publicationLedgerTouched:false`, `productSyncReady:false`,
`transportReady:false`, `writesWebDAV/writesCloud/writesRelay/enqueuesRelay/writesCAS/writesFiles/touchChatSavingCas:false`,
`writesKv/writesSqlite/writesLocalStorage:false`, `mutatesExportState/mintsExportId/burnsSequence/fullBundleV3Started:false`,
`bootResumeDispatch:false`, `chatSavingCasBlocked:true`, `noCleanupAuthority:true`, `noA950Mutation:true` - regardless of
any request field. `realEnqueueAuthorized` may be `true` ONLY as a boundary-model readiness signal for a well-formed
enqueue; it is never an actual enqueue/write. A request that tries to set any write/readiness/transport/outbox flag true
is IGNORED.

## Blocked Failure Modes

- localExportableSyncReady alone -> `real-transport-b4-enqueue-local-exportable-not-authorization`;
- local mock approval -> `real-transport-b4-enqueue-local-mock-approval-not-accepted`;
- local mock target as real target -> `real-transport-b4-enqueue-local-mock-target-not-real`;
- missing idempotency record -> `real-transport-b4-enqueue-idempotency-record-missing`;
- completed idempotency record for enqueue -> `real-transport-b4-enqueue-completed-record-not-enqueueable`
  (models `duplicate-replay-noop` / zero-write);
- stale kill-switch token -> `real-transport-b4-enqueue-kill-switch-token-stale`;
- disabled kill switch -> `real-transport-b4-enqueue-kill-switch-disabled`;
- missing approval -> `real-transport-b4-enqueue-approval-missing`;
- missing target hashes -> `real-transport-b4-enqueue-target-hashes-missing`;
- sequence/export mismatch -> `real-transport-b4-enqueue-sequence-constraint-mismatch`;
- peer ambiguity -> `real-transport-b4-enqueue-peer-ambiguous`;
- B7 policy not evaluable -> `real-transport-b4-enqueue-b7-policy-not-evaluable`;
- B5/B6 policy not available -> `real-transport-b4-enqueue-b5-b6-policy-not-available`;
- CAS boundary violation -> `real-transport-b4-enqueue-cas-boundary-violation`;
- CAS key input -> `real-transport-b4-cas-input-rejected`;
- raw endpoint/credential/path/payload body input -> `real-transport-b4-raw-input-rejected` (raw never stored/echoed);
- resume without controlled gate -> `real-transport-b4-resume-missing-controlled-gate`;
- resume with disabled kill switch -> `real-transport-b4-resume-kill-switch-disabled`;
- ledger before verified remote write -> `real-transport-b4-ledger-precedes-remote-write`.

## Boundaries Held

- B4 substrate is non-writing and creates NO outbox row, touches NO relay outbox / publication ledger, and writes no
  KV/SQLite/localStorage/filesystem.
- No raw endpoint URL, raw credential, raw remote path, or raw payload body is stored, logged, or echoed (hash-only
  references; raw/CAS input rejected).
- B4 substrate does not make real transport available (`realWebDAVTransportAvailable:false`) and does not accept a
  real-transport approval (`realTransportApprovalAccepted:false`).
- No fullBundle v3 payload start/mint; no export-state mutation; no export id minted; no sequence burned.
- `productSyncReady` not flipped - remains `false`; `transportReady` not set true.
- `row:a950a44b859f` not cleaned or mutated; no cleanup authority introduced.
- Chat Saving CAS untouched (`chatSavingCasBlocked:true`, CAS boundary/key input rejected); the B1/B2/B3 modules and
  `webdav-transport-gates.js` are unchanged.
- Only the one new module file is added; `studio.html` and `pack-studio.mjs` are not touched; no unrelated Studio-lane
  files staged.

## Remaining Implementation Blockers (B5-B6)

B5 (conflict/partial-write), B6 (sequence/export-id) implementation, plus B8 real approval acceptance and the B7
`transportReady` flip, all remain open and unimplemented.

## Recommended Next Lane After B4

**B5 implementation - real conflict / partial-write handling** (per the B5 design `e60e00f0`), non-writing /
non-activating, behind the B8 approval + B7 readiness gate, only after an explicit operator go-ahead.

## Final State

The B4 real enqueue / outbox / publication-ledger boundary substrate is implemented as a non-writing, hash-only
evaluate/diagnose module that models the boundary without creating any outbox row or touching the ledger. Real transport
remains blocked: `realWebDAVTransportAvailable:false`, `realTransportApprovalAccepted:false`, `transportReady:false`,
`productSyncReady:false`, fullBundle v3 deferred, Chat Saving CAS blocked/deferred, `row:a950a44b859f` quarantined. B5-B6
implementation remains open.
