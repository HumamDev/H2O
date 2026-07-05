# Real-Transport B3 - Durable Idempotency Store - Implementation

Verdict: **B3 DURABLE REAL-TRANSPORT IDEMPOTENCY STORE SUBSTRATE IMPLEMENTED AS A NON-WRITING, HASH-ONLY
EVALUATE/DIAGNOSE MODULE THAT MODELS THE RECORD LIFECYCLE WITHOUT CREATING ANY DURABLE STORE - IT WRITES NO
KV/SQLITE/localStorage/FILESYSTEM, DOES NOT ENABLE REAL TRANSPORT, DOES NOT MAKE REAL WEBDAV AVAILABLE, DOES NOT ACCEPT
A REAL-TRANSPORT APPROVAL, DOES NOT FLIP `productSyncReady` OR `transportReady`, AND STORES / LOGS NO RAW ENDPOINT /
CREDENTIAL / PATH / PAYLOAD-BODY VALUE. B4-B6 IMPLEMENTATION REMAINS OPEN. THIS SLICE AUTHORIZES NO REAL WRITE, NO FLIP,
AND NO CLEANUP**.

This implementation is non-writing and non-activating with respect to transport, and creates NO durable record. It does
not write KV/SQLite/localStorage/filesystem, does not write to real WebDAV/cloud/relay/CAS/files, does not enqueue
relay, does not add real credentials, does not log raw endpoint/credential/path/payload values, does not mint or start a
fullBundle v3 payload, does not mutate export state, does not mint an export id, does not burn sequence, does not flip
`productSyncReady`, does not set `transportReady:true`, and does not clean or mutate `row:a950a44b859f`.

## Anchors Respected

- B3 durable real-transport idempotency store design: `e1618571`.
- B2 real controlled-write kill-switch lifecycle implementation: `de4aa12d`.
- B1 real target config + credentials + peer identity implementation: `93eb9065`.
- Real-transport B1-B8 implementation-readiness rollup: `36e46513`.

## Source Change (focused, single new standalone module)

- New module: `src-surfaces-base/studio/sync/real-transport-idempotency.js`.
- Exposed API: `H2O.Studio.sync.realTransportIdempotency.evaluateRealTransportIdempotency(request)` (plus `diagnose()`
  and schema/namespace/lifecycle constants).
- The module is a self-bootstrapping IIFE following the B1/B2 substrate pattern (local helpers, a result object +
  `blockers[]`, an `__installed` guard). It is a PURE evaluator that MODELS the idempotency record lifecycle: it reads a
  request (including a MODELED `existingRecord` state) and returns a validation/lifecycle verdict; it performs no I/O and
  creates no durable store.

### No durable store is created

The module references the proposed Desktop-authority store namespace `h2o:sync:real-transport-idempotency:v1` as a
STRING constant only; it does NOT create the KV store, and it writes no KV/SQLite/localStorage/filesystem. The result
always reports `durableStoreCreated:false`, `writesKv:false`, `writesSqlite:false`, `writesLocalStorage:false`.

### Wired or standalone: intentionally standalone (non-activating)

The module is present as product source but is intentionally NOT registered in the app loader (`studio.html` /
`tools/product/studio/pack-studio.mjs`) - matching B1/B2. `studio.html` is currently modified by a concurrent Studio
lane and is not touched or staged by this slice. Wiring/activation is a later gated step. The B3 contract is proven by
re-executing the real module directly in a Node `vm` sandbox. The B1/B2 modules and `webdav-transport-gates.js` are
unchanged.

## B3 Implementation Semantics

`evaluateRealTransportIdempotency(request)` validates hash-only idempotency key material against a modeled record and
returns a redacted lifecycle verdict:

- **Hash-only key material only**: `idempotencyKeyHash`, `candidatePayloadHash`, `candidateBundleHash`, `endpointRefHash`,
  `remoteRootRefHash`, `peerIdentityBindingHash`, `credentialRefHash`, `killSwitchEnableTokenHash`, `b8ApprovalRefHash`,
  `b7ReadinessPolicyRefHash`, `sequenceExportConstraintRefHash` (each `sha256:<64hex>`), plus `operationKind` and
  `activeTransport`. Credential handling is reference-only.
- **Modeled lifecycle states**: `preflight-observed`, `apply-intent-recorded`, `remote-write-pending`,
  `remote-write-observed`, `ledger-pending`, `completed`, `failed`, `explicit-recovery-required`,
  `duplicate-replay-noop`.
- **Completed record**: a request whose `idempotencyKeyHash` matches a modeled `completed` record resolves to
  `duplicate-replay-noop` with `zeroWrite:true` - a duplicate replay is zero-write.
- **Changed constraints are not a duplicate**: a request whose key differs from the modeled record
  (`changedConstraintsAreNotDuplicate:true`) is treated as a NEW `preflight-observed` operation, not a dedup no-op.
- **Restart / reload**: `autoWriteOnResume:false` always; a modeled `remote-write-pending` record on restart resolves to
  `explicit-recovery-required` (never auto-write); a resume without the controlled gate or with a disabled kill switch
  is blocked.

### Valid evaluation result (fresh preflight)

- `ok:true`
- `status:"real-transport-b3-idempotency-preflight-observed"`
- `idempotencyRecordReady:true`
- `durableStoreCreated:false`
- `realWebDAVTransportAvailable:false`
- `realTransportApprovalAccepted:false`
- `productSyncReady:false`
- `transportReady:false`
- `writesKv:false`
- `chatSavingCasBlocked:true`
- `fullBundleV3Started:false`
- `noCleanupAuthority:true`
- `blockers:[]`

### Non-activation invariants (hardcoded, not request-controllable)

The result always reports `realWebDAVTransportAvailable:false`, `realTransportApprovalAccepted:false`,
`productSyncReady:false`, `transportReady:false`, `writesWebDAV/writesCloud/writesRelay/enqueuesRelay/writesCAS/
writesFiles/touchChatSavingCas:false`, `writesKv/writesSqlite/writesLocalStorage:false`, `mutatesExportState/
mintsExportId/burnsSequence/fullBundleV3Started:false`, `chatSavingCasBlocked:true`, `noCleanupAuthority:true`,
`noA950Mutation:true`, `durableStoreCreated:false`, `autoWriteOnResume:false` - regardless of any request field. A
request that tries to set any write/readiness/transport flag true is IGNORED.

## Blocked Failure Modes

- missing idempotency key material -> `real-transport-b3-key-material-missing`;
- corrupted idempotency record (or unknown state) -> `real-transport-b3-idempotency-record-corrupted`;
- target hash mismatch -> `real-transport-b3-target-hash-mismatch`;
- payload hash mismatch (or bundle != payload hash) -> `real-transport-b3-payload-hash-mismatch`;
- approval hash mismatch -> `real-transport-b3-approval-hash-mismatch`;
- kill-switch token mismatch -> `real-transport-b3-kill-switch-token-mismatch`;
- kill-switch token stale -> `real-transport-b3-kill-switch-token-stale`;
- sequence/export constraint mismatch -> `real-transport-b3-sequence-constraint-mismatch`;
- duplicate with changed payload/target -> `real-transport-b3-duplicate-changed-payload-target`;
- resume without controlled gate -> `real-transport-b3-resume-missing-controlled-gate`;
- resume with disabled kill switch -> `real-transport-b3-resume-kill-switch-disabled`;
- raw endpoint/credential/path/payload body input -> `real-transport-b3-raw-input-rejected` (raw never stored/echoed);
- CAS key input -> `real-transport-b3-cas-input-rejected`.

## Boundaries Held

- B3 substrate is non-writing and creates NO durable store, KV, SQLite, localStorage, or filesystem record.
- No raw endpoint URL, raw credential, raw remote path, or raw payload body is stored, logged, or echoed (hash-only
  references; raw/CAS input rejected).
- B3 substrate does not make real transport available (`realWebDAVTransportAvailable:false`) and does not accept a
  real-transport approval (`realTransportApprovalAccepted:false`).
- No fullBundle v3 payload start/mint; no export-state mutation; no export id minted; no sequence burned.
- `productSyncReady` not flipped - remains `false`; `transportReady` not set true.
- `row:a950a44b859f` not cleaned or mutated; no cleanup authority introduced.
- Chat Saving CAS untouched (`chatSavingCasBlocked:true`, CAS key input rejected); the B1/B2 modules and
  `webdav-transport-gates.js` are unchanged.
- Only the one new module file is added; `studio.html` and `pack-studio.mjs` are not touched; no unrelated Studio-lane
  files staged.

## Remaining Implementation Blockers (B4-B6)

B4 (enqueue/outbox), B5 (conflict/partial-write), B6 (sequence/export-id) implementation, plus B8 real approval
acceptance and the B7 `transportReady` flip, all remain open and unimplemented.

## Recommended Next Lane After B3

**B4 implementation - real enqueue / outbox boundary** (per the B4 design `0b6ed75e`), non-writing / non-activating,
behind the B8 approval + B7 readiness gate, only after an explicit operator go-ahead.

## Final State

The B3 durable real-transport idempotency store substrate is implemented as a non-writing, hash-only evaluate/diagnose
module that models the record lifecycle without creating any durable store. Real transport remains blocked:
`realWebDAVTransportAvailable:false`, `realTransportApprovalAccepted:false`, `transportReady:false`,
`productSyncReady:false`, fullBundle v3 deferred, Chat Saving CAS blocked/deferred, `row:a950a44b859f` quarantined. B4-B6
implementation remains open.
